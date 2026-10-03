#!/usr/bin/env node
/**
 * Verification — plan 20261003-2254 sub 02 (conversation management UI).
 * Repo convention: playwright-core against the system Chromium.
 *
 * Usage: node scripts/verify-conversation-mgmt.mjs [BASE_URL] [API_BASE]
 *   BASE_URL  default http://localhost:3000 (the dev web endpoint)
 *   API_BASE  default http://localhost:8085 (the dev API endpoint)
 *   PG_CONTAINER (env)  dev postgres container (default postgres-bjpckrst)
 *
 * Covers:
 *  - user: thread-list delete (Trash2 + AlertDialog confirm) → gone from the
 *    list (optimistic) → hidden server-side (CustomerDeletedAt) → re-appears
 *    when the customer sends again; open-thread edge (delete the open one).
 *  - guest: the capped "new conversation" (top-bar Plus) → fresh thread, the
 *    old one closed (guest_reset, staff still see it); 5th/6th reset → the
 *    app-level 429 cap message (the 6th needs a new 1-min global window).
 * Screenshots → /tmp/hanadicrochet-shots.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.argv[3] ?? "http://localhost:8085";
const PG = process.env.PG_CONTAINER ?? "postgres-bjpckrst";
const OUT = "/tmp/hanadicrochet-shots";
mkdirSync(OUT, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, ok, extra = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name} ${extra}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- DB (dev postgres) -----------------------------------------------------
function sql(query) {
  const out = execSync(
    `docker exec -e PGPASSWORD=postgres ${PG} psql -U postgres -d hanadicrochet -t -A -c ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  );
  return out.trim();
}
function threadClosedState(id) {
  const row = sql(
    `select coalesce("IsClosed"::text,'?') || '|' || coalesce("ClosedReason",'') from "ChatThreads" where "Id"='${id}'`,
  );
  return row; // e.g. "t|guest_reset"
}

// ---- In-page API (rides the page's auth cookie; CSRF for mutations) --------
async function apiInPage(page, path, { method = "GET", body } = {}) {
  return page.evaluate(async ({ apiBase, path, method, body }) => {
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
  }, { apiBase: API_BASE, path, method, body });
}

// ---- Node (no-auth) guest bootstrap ----------------------------------------
async function guestBootstrap(guestId, reset) {
  const res = await fetch(`${API_BASE}/chat/visitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, name: null, website: null, reset }),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// The guest bootstrap is globally rate-limited (5 / min / IP — dev shares one
// IP, and other traffic may hit it). Retry that *global* 429 by waiting for a
// fresh 1-min window; the *app* cap 429 (5 resets / 24 h) is terminal and is
// detected by its message. A 429 never consumes the app cap.
const APP_CAP = /too many new conversations/i;
async function bootstrapRetry(guestId, reset, { retries = 4 } = {}) {
  let r = await guestBootstrap(guestId, reset);
  for (let i = 0; i < retries && r.status === 429 && !APP_CAP.test(r.data?.message ?? ""); i++) {
    console.log("  (global 429 on guest bootstrap — waiting 61s for a fresh window)");
    await sleep(61000);
    r = await guestBootstrap(guestId, reset);
  }
  return r;
}

// A user landing on /chat is auto-opened into their latest thread (sub-plan
// 03 of an earlier plan), so on mobile the list step is hidden. Reach the
// list (where the delete lives) via the thread-mode Back button.
async function backToList(page, backLabel = "Back") {
  // A user landing on /chat is auto-opened into their latest open thread
  // (one-shot per mount), which hides the mobile list step. Wait for that
  // auto-open (?thread=) — or time out if we're already on the list — then go
  // Back to the list (mobile Back → onCloseThread).
  const autoOpened = await page
    .waitForURL(/thread=/, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!autoOpened) return; // settled on the list, nothing to go back to
  const backBtn = page.locator(`header button[aria-label="${backLabel}"]`);
  await backBtn.click({ timeout: 10000 });
  for (let i = 0; i < 24 && page.url().includes("thread="); i++) {
    await page.waitForTimeout(250);
  }
}

// ---- Shared user flow: guest msg → register → guest-link -------------------
// ---- Shared user setup: register (UI) + one free conversation (API) --------
// Registers through the UI (sets the auth cookie), then opens a free
// conversation as the SIGNED-IN user via POST /chat/threads — which is NOT
// behind the guest limiter, so A/B/C never touch the 5/min/IP guest bucket
// (that bucket is what D/E exercise). Returns the created thread id.
async function registerAndCreateThread(page, tag) {
  const email = `e2e+${tag}.${Date.now()}@example.com`;
  await page.goto(`${BASE}/en/register`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', `E2E ${tag}`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "123456789");
  await page.fill('input[name="country"]', "Testville");
  await page.fill('input[name="new-password"]', "Passw0rd!x");
  await page.fill('input[name="confirm-password"]', "Passw0rd!x");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);
  const subject = `e2e ${tag}`;
  const created = await page.evaluate(async ({ apiBase, subject }) => {
    const af = await fetch(`${apiBase}/antiforgery`, { credentials: "include" });
    const token = af.ok ? (await af.json()).token : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-CSRF-TOKEN"] = token;
    const res = await fetch(`${apiBase}/chat/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({ subject }),
      credentials: "include",
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, id: body?.id ?? null };
  }, { apiBase: API_BASE, subject });
  return { email, created };
}

// ===================== A: MOBILE EN LIGHT — user delete =====================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const { created } = await registerAndCreateThread(page, "del");
  check("A0 a thread was created for the user (201)", created.status === 201, String(created.status));

  // Fetch the thread id (server state) — the linked guest thread.
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await backToList(page);
  const list0 = await apiInPage(page, "/chat/threads");
  check("A1 list shows exactly 1 thread", list0.status === 200 && list0.data?.threads?.length === 1, JSON.stringify(list0.data));
  const threadId = list0.data?.threads?.[0]?.id;
  check("A2 captured a thread id", typeof threadId === "string" && threadId.length > 0);

  // UI: the row has a delete (Trash2) button.
  const delBtn = page.locator('button[aria-label="Delete conversation"]');
  check("A3 delete button on the thread row", await delBtn.count() === 1, String(await delBtn.count()));
  await page.screenshot({ path: `${OUT}/cm-a3-list-with-delete-mobile.png` });

  // UI: open the confirm dialog, then confirm → optimistic removal.
  await delBtn.click();
  const dialogVisible = await page
    .locator("text=Delete this conversation?")
    .isVisible()
    .catch(() => false);
  check("A4 confirm dialog shown", dialogVisible, "");
  await page.screenshot({ path: `${OUT}/cm-a4-delete-dialog-mobile.png` });
  const deleteAction = page.locator("button", { hasText: "Delete" }).last();
  await deleteAction.click();
  await page.waitForTimeout(800);
  const rowsAfter = await delBtn.count();
  check("A5 row removed from the list (optimistic)", rowsAfter === 0, String(rowsAfter));
  // The UI delete hit the API; confirm server-side it is hidden now.
  const listAfterDelete = await apiInPage(page, "/chat/threads");
  check(
    "A6 server hides the deleted thread (list empty)",
    listAfterDelete.status === 200 && listAfterDelete.data?.threads?.length === 0,
    JSON.stringify(listAfterDelete.data),
  );

  // Re-appear: the customer sends again into the deleted thread.
  const send = await apiInPage(page, `/chat/threads/${threadId}/messages`, {
    method: "POST",
    body: { body: "reappear check" },
  });
  check("A7 customer send into the deleted thread (201)", send.status === 201, JSON.stringify(send));
  const listAfterReopen = await apiInPage(page, "/chat/threads");
  check(
    "A8 thread re-appears after the customer sends",
    listAfterReopen.status === 200 && listAfterReopen.data?.threads?.length === 1,
    JSON.stringify(listAfterReopen.data),
  );
  check("no page errors (mobile delete flow)", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
}

// ============ B: DESKTOP EN LIGHT — delete the OPEN thread (edge) ===========
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await registerAndCreateThread(page, "desk");
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  const list0 = await apiInPage(page, "/chat/threads");
  const threadId = list0.data?.threads?.[0]?.id;
  check("B0 one thread (desktop)", typeof threadId === "string");

  // Open the thread (?thread=), then delete it from the list.
  if (threadId) {
    await page.goto(`${BASE}/en/chat?thread=${threadId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const delBtn = page.locator('button[aria-label="Delete conversation"]');
    check("B1 delete button visible with the thread open (desktop)", await delBtn.count() === 1, String(await delBtn.count()));
    await delBtn.click();
    const deleteAction = page.locator("button", { hasText: "Delete" }).last();
    await deleteAction.click();
    await page.waitForTimeout(800);
    check("B2 row removed (desktop)", await delBtn.count() === 0, String(await delBtn.count()));
    // onCloseThread: the open thread was deleted → back to the list (no ?thread=).
    check("B3 URL no longer has ?thread= (open-thread edge)", !page.url().includes("thread="), page.url());
    await page.screenshot({ path: `${OUT}/cm-b3-desktop-after-open-delete.png` });
  }
  check("no page errors (desktop delete)", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
}

// ===================== C: MOBILE AR LIGHT — delete dialog (RTL) =============
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ locale: "ar", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const { created } = await registerAndCreateThread(page, "ar");
  check("C0 a thread was created for the user (ar, 201)", created.status === 201, String(created.status));
  await page.goto(`${BASE}/ar/chat`, { waitUntil: "networkidle" });
  await backToList(page, "رجوع");
  const delBtn = page.locator('button[aria-label="حذف المحادثة"]');
  check("C1 delete button (ar)", await delBtn.count() === 1, String(await delBtn.count()));
  if (await delBtn.count() === 1) {
    await delBtn.click();
    const titleVisible = await page.locator("text=تريدين حذف هذه المحادثة؟").isVisible().catch(() => false);
    check("C2 ar confirm dialog title", titleVisible, "");
    await page.screenshot({ path: `${OUT}/cm-c2-delete-dialog-ar.png` });
    const cancel = page.locator("button", { hasText: "إلغاء" });
    await cancel.click();
    await page.waitForTimeout(300);
  }
  check("no page errors (ar delete)", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
}

// ===================== D: MOBILE EN DARK — guest new conversation ===========
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const plusBtn = page.locator('header button[aria-label="Start a new conversation"]');
  check("D0 guest new-conversation button (top bar)", await plusBtn.count() === 1, String(await plusBtn.count()));

  const guestId = await page.evaluate(() => window.localStorage.getItem("hc.guestId"));
  check("D1 a guest id is present", typeof guestId === "string" && guestId.length > 0);

  const before = await bootstrapRetry(guestId, false);
  const beforeId = before.data?.thread?.id ?? null;
  check("D2 captured the current guest thread", typeof beforeId === "string", String(beforeId));

  await plusBtn.click();
  const dialogVisible = await page.locator("text=Start a new conversation?").isVisible().catch(() => false);
  check("D3 guest new-conversation dialog", dialogVisible, "");
  await page.screenshot({ path: `${OUT}/cm-d3-guest-new-dialog-mobile-dark.png` });
  const confirm = page.locator("button", { hasText: "New conversation" }).last();
  await confirm.click();
  await page.waitForTimeout(1500);

  const after = await bootstrapRetry(guestId, false);
  const afterId = after.data?.thread?.id ?? null;
  check("D4 a fresh guest thread was created (id changed)", typeof afterId === "string" && afterId !== beforeId, `before=${beforeId} after=${afterId}`);
  const closedState = beforeId ? threadClosedState(beforeId) : "?";
  check(
    "D5 the old guest thread is closed (guest_reset)",
    closedState === "true|guest_reset",
    closedState,
  );
  check("no page errors (guest new conversation)", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
}

// ===================== E: API — guest reset + 5/24 h cap ===================
{
  // G1: a reset closes the old thread (fresh device).
  const g1 = randomUUID();
  const a1 = await bootstrapRetry(g1, false);
  const a2 = await bootstrapRetry(g1, true);
  const idA = a1.data?.thread?.id ?? null;
  const idB = a2.data?.thread?.id ?? null;
  check("E1 reset creates a new thread (E)", a1.status === 200 && a2.status === 200 && idA && idB && idA !== idB, `a=${idA} b=${idB}`);
  const closedState = idA ? threadClosedState(idA) : "?";
  check("E2 the reset closes the old thread (guest_reset)", closedState === "true|guest_reset", closedState);

  // Cap: consume the 5/24 h budget on a fresh device, then the 6th reset is
  // the app-level 429. Global (per-IP) 429s are retried inside
  // bootstrapRetry; the app cap is reached by message, not status alone.
  const gCap = randomUUID();
  let okResets = 0;
  for (let i = 0; i < 5; i++) {
    const r = await bootstrapRetry(gCap, true);
    if (r.status === 200) okResets++;
  }
  check("E3 five resets succeed (cap budget consumed)", okResets === 5, String(okResets));
  const r6 = await bootstrapRetry(gCap, true);
  check(
    "E4 the 6th reset is app-capped (429 rate_limited)",
    r6.status === 429 && r6.data?.code === "rate_limited" && APP_CAP.test(r6.data?.message ?? ""),
    `status=${r6.status} body=${JSON.stringify(r6.data)}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
