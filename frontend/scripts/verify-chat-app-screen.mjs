#!/usr/bin/env node
/**
 * Verification — plan 20261002-1847_chat-app-screen (DoD item 2).
 * Repo convention: playwright-core against the system Chromium.
 *
 * Usage: node scripts/verify-chat-app-screen.mjs [BASE_URL] [API_BASE]
 *   BASE_URL  default http://localhost:3000 (the dev web endpoint)
 *   API_BASE  default http://localhost:8085 (the dev API endpoint)
 *
 * /chat is a full-viewport chat app screen (owner ask 2026-10-02):
 * no site header/footer, the page itself never scrolls, the composer is
 * always visible, four bordered parts (top bar / left conversations /
 * middle thread / right works / bottom composer), no wordmark, no status
 * line. Screenshots → /tmp/hanadicrochet-shots.
 */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.argv[3] ?? "http://localhost:8085";
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

function part(page, name) {
  return page.locator(`[data-chat-part="${name}"]`);
}
function backBtn(page) {
  return page.locator('header button[aria-label="Back"]');
}

/**
 * Wait until the guest's visitor thread appears in the list. The bootstrap
 * (POST /chat/visitor) sits under D16's strict guest budget (5/min/IP — see
 * Program.cs); this harness creates several guests from one IP (and dev
 * StrictMode doubles every POST /chat/visitor), so wait out the fixed
 * 1-minute window and retry once when the row never appears.
 */
const ROW_SELECTOR = '[data-chat-part="list"] [aria-current="true"]';
async function guestRow(page, initialMs = 15000) {
  // Poll locator.count() — on mobile the list container is display:none and
  // page.waitForSelector never resolves for a row inside it (observed with
  // playwright-core 1.63 + system Chromium) while count() is reliable.
  const found = async (budgetMs) => {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      if ((await page.locator(ROW_SELECTOR).count()) > 0) return true;
      await page.waitForTimeout(250);
    }
    return false;
  };
  if (await found(initialMs)) return true;
  // Budget window reset (D16 fixed 1-min window), then one more try.
  await page.waitForTimeout(61000);
  await page.reload({ waitUntil: "networkidle" });
  return found(20000);
}

async function newContext(browser, { width, height, colorScheme = "light", locale = "en" } = {}) {
  return browser.newContext({
    viewport: { width: width ?? 390, height: height ?? 844 },
    colorScheme,
    locale,
  });
}

/** Page must not scroll (the app screen is fixed; parts scroll inside). */
async function pageDoesNotScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollHeight <= doc.clientHeight + 1;
  });
}

/** The composer (textarea) must be fully inside the viewport. */
async function composerInViewport(page) {
  const ta = page.locator("textarea").first();
  if (!(await ta.isVisible())) return { ok: false, why: "not visible" };
  const box = await ta.boundingBox();
  const height = page.viewportSize().height;
  const ok = box !== null && box.y >= -1 && box.y + box.height <= height + 1;
  return { ok, why: box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} vs ${height}` : "no box" };
}

/** The four borders that define the parts. */
async function partBorders(page) {
  return page.evaluate(() => {
    const cs = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        top: s.borderTopWidth,
        right: s.borderRightWidth,
        bottom: s.borderBottomWidth,
        left: s.borderLeftWidth,
      };
    };
    return {
      top: cs('[data-chat-part="top"]'),
      list: cs('[data-chat-part="list"]'),
      thread: cs('[data-chat-part="thread"]'),
      rail: cs('[data-chat-part="rail"]'),
      bottom: cs('[data-chat-part="bottom"]'),
    };
  });
}

const atLeast1px = (v) => v !== null && parseFloat(v) >= 1;

// ============================ GUEST, MOBILE, LIGHT ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, {});
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  check("GM1 one header (top bar) — no site header", (await page.locator("header").count()) === 1);
  check("GM2 no site footer", (await page.locator("footer").count()) === 0);
  check("GM3 page does not scroll", await pageDoesNotScroll(page));
  const comp = await composerInViewport(page);
  check("GM4 composer in viewport", comp.ok, comp.why);

  const top = await page.evaluate(() => document.querySelector("header")?.textContent ?? "");
  check("GM5 top bar has no wordmark text", top.trim() === "", JSON.stringify(top));
  const body = await page.locator("body").innerText();
  check("GM6 no status line (no 'usually replies')", !body.includes("usually replies"));

  check("GM7 back button", (await backBtn(page).count()) === 1);
  const links = await page
    .locator('nav[aria-label="Leave chat"] a')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check("GM8 nav links = Home + All works (aria)", links[0] === "Home" && links[1] === "All works", JSON.stringify(links));

  check("GM9 thread part visible", await part(page, "thread").isVisible());
  check("GM10 bottom part visible", await part(page, "bottom").isVisible());
  check("GM11 list hidden (guest mobile = thread only)", !(await part(page, "list").isVisible()));
  check("GM12 rail hidden (mobile)", !(await part(page, "rail").isVisible()));

  check("GM13 no page errors (guest mobile)", pageErrors.length === 0, pageErrors.join(" | "));
  check("GM14 guest list shows the visitor thread", await guestRow(page));
  await page.screenshot({ path: `${OUT}/appscreen-guest-mobile-light.png` });
  await browser.close();
}

// ============================ GUEST, DESKTOP, LIGHT ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { width: 1280, height: 800 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  for (const p of ["top", "list", "thread", "rail", "bottom"]) {
    check(`GD1 ${p} part visible`, await part(page, p).isVisible());
  }
  const borders = await partBorders(page);
  check("GD2 top bar border-bottom", atLeast1px(borders.top?.bottom), JSON.stringify(borders.top));
  check("GD3 list border-right (LTR)", atLeast1px(borders.list?.right), JSON.stringify(borders.list));
  check("GD4 rail border-left (LTR)", atLeast1px(borders.rail?.left), JSON.stringify(borders.rail));
  check("GD5 bottom border-top", atLeast1px(borders.bottom?.top), JSON.stringify(borders.bottom));

  check("GD6 page does not scroll (desktop)", await pageDoesNotScroll(page));
  const comp = await composerInViewport(page);
  check("GD7 composer in viewport (desktop)", comp.ok, comp.why);
  // Guest: the visitor thread row appears (D14). The wait retries through the
  // D16 guest budget window (per-IP 5/min) — this whole script is one IP.
  check("GD8 guest list shows the visitor thread", await guestRow(page));

  check("GD9 no page errors (guest desktop)", pageErrors.length === 0, pageErrors.join(" | "));
  await page.screenshot({ path: `${OUT}/appscreen-guest-desktop-light.png` });
  await browser.close();
}

// ============================ USER, DESKTOP + MOBILE ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { width: 1280, height: 800 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Register a signed-in user (the same flow the app uses: antiforgery
  // token + POST /identity/register, which auto-signs-in).
  const email = `appscreen+${Date.now()}@example.com`;
  const af = await ctx.request.get(`${API_BASE}/antiforgery`);
  const token = af.ok() ? (await af.json()).token : null;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-CSRF-TOKEN"] = token;
  const reg = await ctx.request.post(`${API_BASE}/identity/register`, {
    headers,
    data: {
      name: "App Screen QA",
      email,
      password: "Passw0rd!x",
      phone: "999888777",
      country: "Testville",
    },
  });
  check("U1 register (signed-in cookie)", reg.status() === 200, `status=${reg.status()}`);

  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  check("U2 list pane shows list title", (await part(page, "list").getByText("Your conversations").count()) === 1);
  check("U3 list empty state", (await part(page, "list").getByText(/No conversations yet/i).count()) === 1);
  check("U4 middle empty state (no thread open)", (await part(page, "thread").getByText("Pick a conversation").count()) === 1);
  check("U5 no site header/footer", (await page.locator("header").count()) === 1 && (await page.locator("footer").count()) === 0);
  check("U6 page does not scroll (user desktop)", await pageDoesNotScroll(page));

  await page.screenshot({ path: `${OUT}/appscreen-user-desktop-light.png` });

  // Mobile: the list is a STEP — full width, composer hidden.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("U7 mobile list step visible", await part(page, "list").isVisible());
  check("U8 mobile composer hidden in list step", !(await page.locator("textarea").first().isVisible()));
  check("U9 mobile thread hidden in list step", !(await part(page, "thread").isVisible()));
  check("U10 mobile page does not scroll", await pageDoesNotScroll(page));
  await page.screenshot({ path: `${OUT}/appscreen-user-mobile-list.png` });

  check("U11 no page errors (user)", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
}

// ============================ AR (RTL), GUEST, MOBILE ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { locale: "ar" });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/ar/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  check("AR1 back button (ar)", (await page.locator('header button[aria-label="رجوع"]').count()) === 1);
  const links = await page
    .locator('nav[aria-label="الخروج من المحادثة"] a')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check("AR2 nav links ar (aria)", links[0] === "الرئيسية" && links[1] === "كل الأعمال", JSON.stringify(links));
  check("AR3 no site footer (ar)", (await page.locator("footer").count()) === 0);
  check("AR4 page does not scroll (ar)", await pageDoesNotScroll(page));
  const comp = await composerInViewport(page);
  check("AR5 composer in viewport (ar)", comp.ok, comp.why);
  await page.screenshot({ path: `${OUT}/appscreen-guest-mobile-ar.png` });
  await browser.close();
}

// ============================ GUEST, MOBILE, DARK ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const comp = await composerInViewport(page);
  check("DK1 composer in viewport (dark)", comp.ok, comp.why);
  await page.screenshot({ path: `${OUT}/appscreen-guest-mobile-dark.png` });
  await browser.close();
}

// ============================ RC — RETURNING CUSTOMER (SUB 03) ==============
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });

  // RC0 — guest on a shop page: CTA stays "Say hi", no badge.
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
    const cta = page.locator("[data-chat-cta]").first();
    check("RC0 guest CTA = Say hi", (await cta.getByText("Say hi").count()) === 1);
    check("RC0b guest CTA has no badge span", (await cta.locator("span").count()) === 1, `spans=${await cta.locator("span").count()}`);
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const email = `returnscreen+${Date.now()}@example.com`;
  const af = await ctx.request.get(`${API_BASE}/antiforgery`);
  const token = af.ok() ? (await af.json()).token : null;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-CSRF-TOKEN"] = token;
  const reg = await ctx.request.post(`${API_BASE}/identity/register`, {
    headers,
    data: {
      name: "Return Screen QA",
      email,
      password: "Passw0rd!x",
      phone: "999888777",
      country: "Testville",
    },
  });
  check("RC1 register (signed-in cookie)", reg.status() === 200, `status=${reg.status()}`);

  // RC2 — signed-in user with 0 threads: CTA stays "Say hi" (200 + empty).
  const cta = page.locator("[data-chat-cta]").first();
  {
    const respP = page.waitForResponse((r) => r.url().includes("/chat/threads"));
    await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
    const resp = await respP;
    check("RC2a threads list reachable (200)", resp.status() === 200, `status=${resp.status()}`);
    check("RC2b user w/ 0 threads: CTA = Say hi", (await cta.getByText("Say hi").count()) === 1);
  }

  // RC3 — create a conversation (sub-plan 02 endpoint).
  const af2 = await ctx.request.get(`${API_BASE}/antiforgery`);
  const token2 = af2.ok() ? (await af2.json()).token : null;
  const h2 = { "Content-Type": "application/json" };
  if (token2) h2["X-CSRF-TOKEN"] = token2;
  const created = await ctx.request.post(`${API_BASE}/chat/threads`, { headers: h2, data: {} });
  const thread = created.ok() ? (await created.json()) : null;
  const threadId = thread?.id;
  check("RC3 POST /chat/threads (cookie) → thread", typeof threadId === "string", `status=${created.status()}`);

  // RC4 — shop page now: "Your chat" + badge 1 (fresh document load →
  // the CTA refetches its threads).
  {
    const respP = page.waitForResponse((r) => r.url().includes("/chat/threads"));
    await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
    await respP;
    const deadline = Date.now() + 8000;
    let ok = false;
    let label = "";
    while (Date.now() < deadline) {
      label = (await cta.getAttribute("aria-label")) ?? "";
      ok = (await cta.getByText("Your chat").count()) === 1 && (await cta.getByText("1", { exact: true }).count()) === 1;
      if (ok) break;
      await page.waitForTimeout(250);
    }
    check("RC4 CTA = Your chat + badge 1", ok, `aria=${label}`);
    check("RC4b CTA aria-label", label === "Your chat — 1 open", label);
    await page.screenshot({ path: `${OUT}/return-customer-cta-desktop.png` });
  }

  // RC5 — /chat without ?thread= auto-opens the latest open thread.
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  {
    const deadline = Date.now() + 10000;
    let urlOk = false;
    while (Date.now() < deadline) {
      urlOk = page.url().includes(`?thread=${threadId}`);
      if (urlOk) break;
      await page.waitForTimeout(250);
    }
    check("RC5a /chat auto-opens latest (URL ?thread=)", urlOk && threadId !== null, page.url());
    const threadPart = page.locator('[data-chat-part="thread"]');
    check("RC5b thread part visible", await threadPart.isVisible());
    check("RC5c no 'Pick a conversation' anymore", (await threadPart.getByText("Pick a conversation").count()) === 0);
  }

  // RC6 — mobile: /chat lands on the thread view; Back → list; STAYS on list.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && !page.url().includes(`?thread=${threadId}`)) {
      await page.waitForTimeout(250);
    }
    check("RC6a mobile lands on thread view", await part(page, "thread").isVisible() && !(await part(page, "list").isVisible()));
    check("RC6b mobile composer visible in thread view", await page.locator("textarea").first().isVisible());
    await page.screenshot({ path: `${OUT}/return-customer-mobile-thread.png` });
    await backBtn(page).click();
    await page.waitForTimeout(800);
    check("RC6c back → conversation list", await part(page, "list").isVisible() && !(await part(page, "thread").isVisible()));
    await page.waitForTimeout(2500);
    check("RC6d list stays (no auto re-select)", await part(page, "list").isVisible() && !page.url().includes(`?thread=${threadId}`));
  }

  // RC7 — dark: badge still renders (fresh dark context, signed-in cookie
  // shared — page.emulateMedia does not take effect with this
  // playwright-core + Chromium combo, but a context colorScheme does).
  {
    const dark = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await dark.addCookies(await ctx.cookies());
    const dpage = await dark.newPage();
    const dcta = dpage.locator("[data-chat-cta]").first();
    await dpage.goto(`${BASE}/en`, { waitUntil: "networkidle" });
    const deadline = Date.now() + 10000;
    let ok = false;
    while (Date.now() < deadline) {
      ok = (await dcta.getByText("1", { exact: true }).count()) === 1;
      if (ok) break;
      await dpage.waitForTimeout(250);
    }
    check("RC7 CTA badge in dark", ok);
    await dpage.screenshot({ path: `${OUT}/return-customer-cta-dark.png` });
    await dark.close();
  }

  check("RC8 no page errors (returning customer)", pageErrors.length === 0, pageErrors.join(" | "));
  await ctx.close();
  await browser.close();
}

// ============================ NC — NEW CONVERSATIONS (SUB 02) ============
// Customer: /chat list "+" → POST /chat/threads → thread opens.
// Employee: /staff/chat "New conversation" → search dialog → pick customer
// → thread opens; the customer sees the same thread.
{
  const browser = await chromium.launch({
    executablePath: "/snap/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ts = Date.now();
  const custEmail = `nc-cust-${ts}@example.com`;
  const staffEmail = `nc-staff-${ts}@example.com`;

  const registerIn = async (ctx, email, name) => {
    const af = await ctx.request.get(`${API_BASE}/antiforgery`);
    const headers = { "Content-Type": "application/json" };
    if (af.ok()) {
      const token = (await af.json()).token;
      if (token) headers["X-CSRF-TOKEN"] = token;
    }
    return (
      await ctx.request.post(`${API_BASE}/identity/register`, {
        headers,
        data: { name, email, password: "Passw0rd!x", phone: "999000111", country: "Testville" },
      })
    ).status();
  };

  // --- Customer: "+" in the /chat list header.
  const ctx = await newContext(browser, { width: 1280, height: 800 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  check("NC1 register customer", (await registerIn(ctx, custEmail, "NC Customer")) === 200);
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  const newBtn = page.locator('[data-chat-part="list"] button[aria-label="New conversation"]');
  {
    const deadline = Date.now() + 10000;
    let ok = false;
    while (Date.now() < deadline) {
      ok = (await newBtn.count()) === 1;
      if (ok) break;
      await page.waitForTimeout(250);
    }
    check("NC2 New conversation button in list (desktop)", ok);
  }

  // Mobile: same button in the list (Back out of any auto-opened thread
  // first — sub 03 auto-opens, but the list view is what we check).
  {
    const mpage = await ctx.newPage();
    await mpage.setViewportSize({ width: 390, height: 844 });
    await mpage.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
    await mpage.waitForTimeout(2000);
    if (mpage.url().includes("thread=")) {
      await mpage.locator('header button[aria-label="Back"]').click();
      await mpage.waitForTimeout(800);
    }
    const mbtn = mpage.locator('[data-chat-part="list"] button[aria-label="New conversation"]');
    check("NC2b New conversation button in list (mobile)", (await mbtn.count()) === 1);
    await mpage.close();
  }

  let createdId = null;
  {
    const respP = page.waitForResponse(
      (r) => r.url().includes("/chat/threads") && r.request().method() === "POST",
    );
    await newBtn.click();
    try {
      const resp = await respP;
      check("NC3 POST /chat/threads → 201", resp.status() === 201, `status=${resp.status()}`);
      const body = await resp.json();
      createdId = body.id ?? null;
    } catch {
      check("NC3 POST /chat/threads → 201", false, "no response captured");
    }
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && !page.url().includes(`?thread=${createdId}`)) {
      await page.waitForTimeout(250);
    }
  }
  check(
    "NC4 thread opened (?thread=)",
    createdId !== null && page.url().includes(`?thread=${createdId}`),
    page.url(),
  );
  check("NC5 thread part visible", await part(page, "thread").isVisible());
  check("NC5b composer visible in fresh thread", await page.locator("textarea").first().isVisible());
  await page.screenshot({ path: `${OUT}/new-conversation-customer.png` });

  // --- Employee: /staff/chat "New conversation" dialog.
  const sctx = await newContext(browser, { width: 1280, height: 800 });
  const spage = await sctx.newPage();
  const spageErrors = [];
  spage.on("pageerror", (e) => spageErrors.push(String(e)));

  check("NC6 register staff", (await registerIn(sctx, staffEmail, "NC Staff")) === 200);
  // Dev-only promotion (production grants roles via admin / hiring).
  {
    const container = execSync("docker ps --format '{{.Names}}' | grep '^postgres'")
      .toString()
      .trim()
      .split("\n")[0];
    // execFileSync: no shell involved, so the SQL needs no escaping.
    execFileSync(
      "docker",
      [
        "exec",
        "-e",
        "PGPASSWORD=postgres",
        container,
        "psql",
        "-U",
        "postgres",
        "-h",
        "localhost",
        "-d",
        "hanadicrochet",
        "-c",
        `UPDATE "AspNetUsers" SET "IsEmployee"=true, "IsAdmin"=true WHERE "Email"='${staffEmail}'`,
      ],
    );
  }

  await spage.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  const staffNewBtn = spage.getByRole("button", { name: "New conversation" });
  {
    const deadline = Date.now() + 15000;
    let ok = false;
    while (Date.now() < deadline) {
      ok = (await staffNewBtn.count()) === 1;
      if (ok) break;
      await spage.waitForTimeout(250);
    }
    check("NC7 staff New conversation button", ok);
  }

  let staffThreadId = null;
  if ((await staffNewBtn.count()) === 1) {
    await staffNewBtn.click();
    const dialog = spage.getByRole("dialog");
    let dialogOk = false;
    {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        dialogOk = (await dialog.count()) === 1;
        if (dialogOk) break;
        await spage.waitForTimeout(200);
      }
    }
    check("NC8 dialog opens", dialogOk);

    const search = dialog.locator("input");
    await search.fill("NC Customer");
    const rowBtn = dialog.locator("li button", { hasText: "NC Customer" }).first();
    let rowOk = false;
    {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        rowOk = (await rowBtn.count()) === 1;
        if (rowOk) break;
        await spage.waitForTimeout(250);
      }
    }
    check("NC9 search finds the customer", rowOk);
    await spage.screenshot({ path: `${OUT}/new-conversation-staff-dialog.png` });

    if (rowOk) {
      const respP2 = spage.waitForResponse(
        (r) => r.url().includes("/chat/threads") && r.request().method() === "POST",
      );
      await rowBtn.click();
      let resp2 = null;
      try {
        resp2 = await respP2;
      } catch {
        resp2 = null;
      }
      check("NC10a POST /chat/threads (staff) → 201", resp2?.status() === 201, `status=${resp2?.status()}`);
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        staffThreadId = new URL(spage.url()).searchParams.get("thread");
        if (staffThreadId) break;
        await spage.waitForTimeout(250);
      }
      check("NC10b staff thread opened (?thread=)", staffThreadId !== null, spage.url());
    }
  }

  // The customer sees the staff-created thread: /chat auto-opens it (it is
  // now the customer's latest open conversation).
  {
    const deadline = Date.now() + 10000;
    let seesIt = false;
    while (Date.now() < deadline) {
      await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
      const inner = Date.now() + 8000;
      while (Date.now() < inner) {
        if (staffThreadId && page.url().includes(`?thread=${staffThreadId}`)) {
          seesIt = true;
          break;
        }
        await page.waitForTimeout(250);
      }
      if (seesIt) break;
    }
    check("NC11 customer auto-opens the staff thread", seesIt, page.url());
  }

  // Staff can't open staff threads (own id → 404 from the API). CSRF area
  // → carry an antiforgery token (the app client retries transparently;
  // raw requests don't).
  {
    const meRes = await sctx.request.get(`${API_BASE}/identity/me`);
    const meBody = meRes.ok() ? await meRes.json() : null;
    let status = 0;
    if (meBody) {
      const af = await sctx.request.get(`${API_BASE}/antiforgery`);
      const afBody = af.ok() ? await af.json() : null;
      status = (
        await sctx.request.post(`${API_BASE}/chat/threads`, {
          headers: {
            "Content-Type": "application/json",
            ...(afBody?.token ? { "X-CSRF-TOKEN": afBody.token } : {}),
          },
          data: { customerId: meBody.id },
        })
      ).status();
    }
    check("NC12 staff can't open a staff thread (404)", status === 404, `status=${status}`);
  }

  // Dark: the staff button still renders (fresh dark context, shared cookies).
  {
    const dark = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await dark.addCookies(await sctx.cookies());
    const dpage = await dark.newPage();
    await dpage.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
    const dbtn = dpage.getByRole("button", { name: "New conversation" });
    let darkOk = false;
    {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        darkOk = (await dbtn.count()) === 1;
        if (darkOk) break;
        await dpage.waitForTimeout(250);
      }
    }
    check("NC13 New conversation button (dark)", darkOk);
    await dark.close();
  }

  check("NC14 no page errors (new conversations)", pageErrors.length === 0 && spageErrors.length === 0, [
    ...pageErrors,
    ...spageErrors,
  ].join(" | "));
  await ctx.close();
  await sctx.close();
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
