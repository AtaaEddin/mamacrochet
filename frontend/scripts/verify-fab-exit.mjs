#!/usr/bin/env node
/**
 * Verification — plan 20261001-1922_chat-fab-and-exit-nav (DoD item 2).
 * Repo convention: playwright-core against the system Chromium.
 *
 * Usage: node scripts/verify-fab-exit.mjs [BASE_URL] [API_BASE]
 *   BASE_URL  default http://localhost:3000 (the dev web endpoint)
 *   API_BASE  default http://localhost:8085 (the dev API endpoint)
 *
 * Covers: FAB on every public page (mobile+desktop, light+dark), hidden on
 * /chat + /staff + /admin; the /chat exit bar (Back → previous page / Home,
 * Home + Works links); signed-in thread-mode Back → conversations list;
 * Arabic RTL placement. Screenshots → /tmp/hanadicrochet-shots.
 */
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

function fab(page) {
  return page.locator("a[aria-label='Chat with Hanadi']");
}
function fabAr(page) {
  return page.locator("a[aria-label='تحدّثي مع حنادي']");
}
function exitBar(page) {
  return page.locator("nav[aria-label='Leave chat']");
}
function exitBarAr(page) {
  return page.locator("nav[aria-label='الخروج من المحادثة']");
}
function backBtn(page) {
  return page.locator('header button[aria-label="Back"]');
}

async function newContext(browser, { width, height, colorScheme = "light", locale = "en" } = {}) {
  return browser.newContext({
    viewport: { width: width ?? 390, height: height ?? 844 },
    colorScheme,
    locale,
  });
}

// ============================ MOBILE, EN, LIGHT ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { width: 390, height: 844 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // M1 — FAB on home (mobile)
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  check("M1 FAB visible on /en (mobile)", await fab(page).count() === 1);
  await page.screenshot({ path: `${OUT}/fab-m1-home-mobile.png` });

  // M2 — FAB on works (mobile)
  await page.goto(`${BASE}/en/works`, { waitUntil: "networkidle" });
  check("M2 FAB visible on /en/works (mobile)", await fab(page).count() === 1);

  // M3 — /chat: FAB hidden, exit bar present
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check("M3a FAB hidden on /en/chat", await fab(page).count() === 0);
  const barCount = await exitBar(page).count();
  check("M3b exit nav on /en/chat (guest)", barCount === 1);
  check(
    "M3c back button on /en/chat (guest)",
    await backBtn(page).count() === 1,
  );
  const labels = await page
    .locator('nav[aria-label="Leave chat"] a')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(
    "M3d top bar links = Home + All works (aria)",
    labels[0] === "Home" && labels[1] === "All works",
    JSON.stringify(labels),
  );
  await page.screenshot({ path: `${OUT}/fab-m3-chat-mobile-topbar.png` });

  // M4 — FAB hidden on staff/admin (admin re-verified signed-in below: the
  // page 403-cards anonymous users and redirects them to /login, where the
  // FAB correctly shows).
  await page.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  check("M4a FAB hidden on /en/staff/chat", await fab(page).count() === 0);

  // F1 — flow: /works → FAB → /chat → Back → /works
  await page.goto(`${BASE}/en/works`, { waitUntil: "networkidle" });
  await fab(page).click();
  await page.waitForURL("**/en/chat");
  check("F1a FAB click → /en/chat", page.url().includes("/en/chat"));
  await backBtn(page).click();
  await page.waitForURL("**/en/works");
  check("F1b Back → /en/works (previous page)", page.url().includes("/en/works"));

  // F2 — fresh entry: /chat → Back → home
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await backBtn(page).click();
  await page.waitForURL("**/en");
  check("F2 Back → home (no stored return)", page.url().replace(/\/$/, "") === `${BASE}/en`);

  // F3 — top bar links
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.locator('nav[aria-label="Leave chat"] a').nth(0).click();
  await page.waitForURL("**/en");
  check("F3a Home link → /en", page.url().replace(/\/$/, "") === `${BASE}/en`);
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.locator('nav[aria-label="Leave chat"] a').nth(1).click();
  await page.waitForURL("**/en/works");
  check("F3b All works link → /en/works", page.url().includes("/en/works"));

  // T1-T5 — signed-in: guest msg → register → guest-link → thread mode Back
  // (guest msg creates the device visitor thread; register signs in; guest-link
  //  is the same API call the order confirmation makes (D14), done via fetch.)
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const composer = page.locator("textarea");
  await composer.fill("hello hanadi, e2e thread test");
  await composer.press("Enter");
  await page.waitForTimeout(1500);

  const email = `e2e+${Date.now()}@example.com`;
  await page.goto(`${BASE}/en/register`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "E2E Test");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "123456789");
  await page.fill('input[name="country"]', "Testville");
  await page.fill('input[name="new-password"]', "Passw0rd!x");
  await page.fill('input[name="confirm-password"]', "Passw0rd!x");
  await page.screenshot({ path: `${OUT}/fab-t-register-filled.png` });
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);

  // Same call the order confirmation makes (D14): link the guest thread to
  // the account so the signed-in /chat list shows it (thread-mode test).
  const linked = await page.evaluate(async (apiBase) => {
    const guestId = window.localStorage.getItem("hc.guestId");
    if (!guestId) return "no-guest-id";
    // Same CSRF wiring as the app client: /identity is a form-bound area.
    const base = apiBase;
    const af = await fetch(`${base}/antiforgery`, { credentials: "include" });
    const token = af.ok ? (await af.json()).token : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-CSRF-TOKEN"] = token;
    const res = await fetch(`${base}/identity/guest-link`, {
      method: "POST",
      headers,
      body: JSON.stringify({ guestId }),
      credentials: "include",
    });
    return res.status;
  }, API_BASE);
  check("T1 guest-link via API origin (200)", linked === 200, String(linked));

  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  // Poll — the signed-in list fetch (GET /chat/threads) lands after the
  // page's own /identity/me round-trip; a fixed short wait flakes.
  const threadRow = page.locator("button", { hasText: /hello hanadi|Chat/i });
  let rowCount = 0;
  for (let i = 0; i < 20; i++) {
    rowCount = await threadRow.count();
    if (rowCount === 1) break;
    await page.waitForTimeout(500);
  }
  check("T3 thread list shows the linked thread", rowCount === 1);
  if (await threadRow.count() === 1) {
    await threadRow.click();
    await page.waitForTimeout(800);
    check(
      "T4 thread mode keeps the single 'Back' button",
      await backBtn(page).count() === 1,
    );
    await page.screenshot({ path: `${OUT}/fab-t4-thread-topbar.png` });
    await backBtn(page).click();
    await page.waitForTimeout(500);
    check("T5 thread Back → conversations list (no ?thread=)", !page.url().includes("thread="));

  // M4b — FAB hidden on /en/admin/users (signed-in, non-admin: 403 card)
  await page.goto(`${BASE}/en/admin/users`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check("M4b FAB hidden on /en/admin/users (signed-in)", await fab(page).count() === 0);
  }

  check("no page errors (mobile flow)", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
}

// ============================ MOBILE, EN, DARK ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  check("D1 FAB visible on /en (mobile, dark)", await fab(page).count() === 1);
  await page.screenshot({ path: `${OUT}/fab-d1-home-mobile-dark.png` });
  await browser.close();
}

// ============================ DESKTOP, EN, LIGHT ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { width: 1280, height: 800 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  check("K1 FAB visible on /en (desktop)", await fab(page).count() === 1);
  await page.screenshot({ path: `${OUT}/fab-k1-home-desktop.png` });
  await page.goto(`${BASE}/en/works`, { waitUntil: "networkidle" });
  check("K2 FAB visible on /en/works (desktop)", await fab(page).count() === 1);
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check("K3 FAB hidden on /en/chat (desktop)", await fab(page).count() === 0);
  check("K4 exit nav on /en/chat (desktop)", await exitBar(page).count() === 1);
  await page.screenshot({ path: `${OUT}/fab-k4-chat-desktop-topbar.png` });
  await browser.close();
}

// ============================ RTL, AR, MOBILE ============================
{
  const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await newContext(browser, { locale: "ar", width: 390, height: 844 });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  check("R1a FAB visible on /ar (mobile)", await fabAr(page).count() === 1);
  const box = await fabAr(page).boundingBox();
  // RTL: bottom-END corner = bottom-LEFT → small x, big y.
  check(
    "R1b FAB at bottom-start (left) in RTL",
    box !== null && box.x < 120 && box.y > 600,
    box ? `x=${Math.round(box.x)} y=${Math.round(box.y)}` : "not visible",
  );
  await page.screenshot({ path: `${OUT}/fab-r1-home-ar-mobile.png` });

  // R2 — RTL flow: /ar/works → FAB → /ar/chat → Back → /ar/works.
  // Note: in DEV only, the Next devtools indicator portal (nextjs-portal,
  // the dev-overlay script host) hijacks hit-testing in the bottom-left
  // corner — exactly where the RTL FAB sits — so the click can't be e2e'd
  // in dev. No such element exists in a production build; the FAB is the
  // same plain anchor as in LTR (proven in F1), so we replicate its
  // behavior: record the return URL + navigate to the href.
  await page.goto(`${BASE}/ar/works`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.sessionStorage.setItem("hc.chatReturnTo", "/ar/works"));
  await page.goto(`${BASE}/ar/chat`);
  await page.waitForTimeout(600);
  const barCount = await exitBarAr(page).count();
  check("R2a exit nav on /ar/chat", barCount === 1);
  const labels = await page
    .locator('nav[aria-label="الخروج من المحادثة"] a')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(
    "R2b top bar links ar = الرئيسية + كل الأعمال (aria)",
    labels[0] === "الرئيسية" && labels[1] === "كل الأعمال",
    JSON.stringify(labels),
  );
  await page.screenshot({ path: `${OUT}/fab-r2-chat-ar-topbar.png` });
  await page.locator('header button[aria-label="رجوع"]').click();
  await page.waitForURL("**/ar/works");
  check("R2c Back → /ar/works (previous page)", page.url().includes("/ar/works"));
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
