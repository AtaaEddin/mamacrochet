// Sub-plan 04 of 20261003-2254 (product CTA -> a NEW conversation about that
// work): verified in a real browser against the dev stack (API :8085, web
// :3000). The ChatMessages row count is the authoritative "sent exactly once"
// signal (the product bubble renders 1:1 from that row).
//
//   1. logged-in CUSTOMER at /chat?work=<id> (no ?thread=) -> a NEW thread is
//      created + opened, the work is sent once as a product message, ?work= is
//      dropped (a refresh never re-sends it), and the thread is the latest.
//   2. an explicit ?thread=<t>&work=<id> still sends into THAT thread.
//   3. a GUEST at /chat?work=<id> -> the device thread gets the product once;
//      a refresh never re-sends it.
//
// playwright-core drives the system Chromium.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const API_BASE = process.env.API_BASE ?? "http://localhost:8085";
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE ?? "/snap/bin/chromium";
const PG = process.env.PG_CONTAINER ?? "postgres-bjpckrst";
const PRODUCT_ID = process.env.PRODUCT_ID ?? "06b1bd9729ec4a0a9a5f6e5f2b88ba5c";

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const log = (m) => console.log(`\n${m}`);

function sql(query) {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      ["exec", "-e", "PGPASSWORD=postgres", PG, "psql", "-U", "postgres", "-d", "hanadicrochet", "-t", "-A", "-c", query],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || String(err))) : resolve(stdout)),
    );
  });
}

async function productCount(threadId, pid) {
  const out = await sql(
    `select count(*) from "ChatMessages" where "ThreadId"='${threadId}' and "ProductId"='${pid}' and "IsDeleted"=false`,
  );
  return parseInt(out.trim(), 10) || 0;
}

// Poll the DB until the thread holds exactly `expected` product messages for
// the work (the REST/socket send lands a row; poll absorbs the latency).
async function waitForProductCount(threadId, pid, expected, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await productCount(threadId, pid)) === expected) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return (await productCount(threadId, pid)) === expected;
}

// Guest variant: the device thread is created by the bootstrap (after the
// page loads), so re-derive it from the guest id on every tick.
async function waitForGuestProduct(page, pid, expected, timeoutMs = 25_000) {
  // Re-read the guest id each tick: the bootstrap writes it to localStorage
  // after the page loads, and creates the device thread right after.
  const find = async () => {
    const guestId = await page.evaluate(() => window.localStorage.getItem("hc.guestId"));
    if (!guestId) return { threadId: "", count: -1 };
    const threadId = (await sql(`select "Id" from "ChatThreads" where "GuestId"='${guestId}' limit 1`)).trim();
    return { threadId, count: threadId ? (await productCount(threadId, pid)) : -1 };
  };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await find();
    if (r.count === expected) return r;
    await new Promise((res) => setTimeout(res, 400));
  }
  return find();
}

async function waitForNoWorkParam(page, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!new URL(page.url()).searchParams.has("work")) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return !new URL(page.url()).searchParams.has("work");
}

async function apiInPage(page, path, { method = "GET", body } = {}) {
  return page.evaluate(
    async ({ apiBase, path, method, body }) => {
      const headers = {};
      if (method !== "GET" && method !== "HEAD") {
        const af = await fetch(`${apiBase}/antiforgery`, { credentials: "include" });
        if (af.ok) {
          const d = await af.json();
          if (d.token) headers["X-CSRF-TOKEN"] = d.token;
        }
      }
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "include",
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { status: res.status, data };
    },
    { apiBase: API_BASE, path, method, body },
  );
}

async function registerCustomer(page) {
  const tag = randomUUID().slice(0, 8);
  const email = `cta${tag}@example.com`;
  const name = `CTA ${tag}`;
  const password = "CtaPassw0rd!x";
  await page.goto(`${BASE}/en/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.locator("#reg-password").fill(password);
  await page.locator("#reg-confirm").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/en\/account$/, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

// Count the customer-side message rows rendered in the thread (the product
// message sits on the customer's side, a .self-end row).
async function renderedMineRows(page) {
  return page.locator(`div.max-w-2xl[dir="ltr"] .self-end`).count();
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  // ---- Scenarios 1 + 2: logged-in customer ----------------------------------
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await registerCustomer(page);

  // 1a. Product CTA: /chat?work=<id> (no ?thread=) -> a NEW thread + one product.
  await page.goto(`${BASE}/en/chat?work=${PRODUCT_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/en\/chat\?thread=/, { timeout: 30_000 });
  const newThreadId = new URL(page.url()).searchParams.get("thread");
  check("customer: a new thread is created + opened (?thread=)", Boolean(newThreadId), new URL(page.url()).pathname + new URL(page.url()).search);
  const once = await waitForProductCount(newThreadId, PRODUCT_ID, 1);
  check("customer: the work is sent ONCE into the new thread", once, `count=${await productCount(newThreadId, PRODUCT_ID)}`);
  const dropped = await waitForNoWorkParam(page);
  check("customer: ?work= is dropped after the product is accepted", dropped, page.url());
  const mineRows = await renderedMineRows(page);
  check("customer: the thread renders the product message (customer side)", mineRows === 1, `rows=${mineRows}`);

  // 1b. Refresh -> no duplicate send.
  const urlAfter = page.url();
  await page.goto(urlAfter, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  const afterRefresh = await productCount(newThreadId, PRODUCT_ID);
  check("customer: refresh does not re-send the product", afterRefresh === 1, `count=${afterRefresh}`);

  // 1c. The new thread is the latest (auto-opened at /chat).
  await page.goto(`${BASE}/en/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/en\/chat\?thread=/, { timeout: 30_000 });
  const autoOpened = new URL(page.url()).searchParams.get("thread");
  check("customer: the new thread is the latest (auto-opened at /chat)", autoOpened === newThreadId, `opened=${autoOpened}`);

  // 2. Explicit ?thread=<t>&work=<id> sends into THAT thread (no new thread).
  const created = await apiInPage(page, "/chat/threads", {
    method: "POST",
    body: { subject: "explicit thread test" },
  });
  const explicitThreadId = created.status === 201 ? created.data.id : null;
  check("customer: an explicit second thread was created (setup)", Boolean(explicitThreadId), `status=${created.status}`);

  await page.goto(`${BASE}/en/chat?thread=${explicitThreadId}&work=${PRODUCT_ID}`, { waitUntil: "domcontentloaded" });
  const intoExplicit = await waitForProductCount(explicitThreadId, PRODUCT_ID, 1);
  check("customer: ?thread=&work= sends into THAT thread", intoExplicit, `count=${await productCount(explicitThreadId, PRODUCT_ID)}`);
  await waitForNoWorkParam(page);
  const afterExplicitUrl = new URL(page.url());
  check(
    "customer: ?thread=&work= keeps that thread (drops only ?work=)",
    afterExplicitUrl.searchParams.get("thread") === explicitThreadId && !afterExplicitUrl.searchParams.has("work"),
    page.url(),
  );
  const newThreadCount = await productCount(newThreadId, PRODUCT_ID);
  check("customer: ?thread=&work= did not touch the first thread", newThreadCount === 1, `count=${newThreadCount}`);

  check("customer: no unexpected page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await ctx.close();

  // ---- Scenario 3: guest ----------------------------------------------------
  const gctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const gpage = await gctx.newPage();
  const gErrors = [];
  gpage.on("pageerror", (e) => gErrors.push(String(e)));

  await gpage.goto(`${BASE}/en/chat?work=${PRODUCT_ID}`, { waitUntil: "domcontentloaded" });
  // Pin the device thread by its guest id (localStorage) — but re-derive it
  // on every tick, since the bootstrap creates the thread after the page loads.
  const gOnce = await waitForGuestProduct(gpage, PRODUCT_ID, 1);
  check("guest: the product lands in the device thread ONCE", gOnce.count === 1, `count=${gOnce.count}`);
  const guestThreadId = gOnce.threadId;
  const gDropped = await waitForNoWorkParam(gpage);
  check("guest: ?work= is dropped after the product is accepted", gDropped, gpage.url());

  // Refresh (no ?work=) -> no duplicate.
  const gBefore = await productCount(guestThreadId, PRODUCT_ID);
  await gpage.goto(`${BASE}/en/chat`, { waitUntil: "domcontentloaded" });
  await gpage.waitForTimeout(2_500);
  const gAfter = await productCount(guestThreadId, PRODUCT_ID);
  check("guest: refresh does not re-send the product", gAfter === gBefore, `before=${gBefore} after=${gAfter}`);

  check("guest: no unexpected page errors", gErrors.length === 0, gErrors.join(" | "));
  await gctx.close();
} finally {
  await browser.close();
}

log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
