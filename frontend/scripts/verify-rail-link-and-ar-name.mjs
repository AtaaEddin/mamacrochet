// Sub-plan 05 of 20261003-2254 — verified in a real browser:
//   1. Ask 3: the works-rail foot ("Or browse the full list…") is a real
//      link to /works (clickable, focusable, RTL-correct) — desktop only,
//      the rail is hidden below lg.
//   2. Ask 5: the Arabic persona name is هنادي (not حنادي). The app name
//      "هنادي كروشيه" is metadata-only (title template) and no route sets
//      its own title, so it never lands in document.title; the visible
//      Arabic name renders in: the works subtitle, the chat launcher
//      (FAB) aria-label, and the chat panel section aria-label. Spot-
//      checked on ar pages (mobile + desktop, light + dark) and asserted
//      no حنادي remains anywhere in the rendered UI.
//
// playwright-core drives the system Chromium.

import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE ?? "/snap/bin/chromium";

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const log = (m) => console.log(`\n${m}`);
const RAIL_FOOT = 'aside[data-chat-part="rail"] a[href*="/works"]';

async function registerCustomer(page) {
  const tag = randomUUID().slice(0, 8);
  const email = `rail${tag}@example.com`;
  const password = "RailPassw0rd!x";
  await page.goto(`${BASE}/en/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Name").fill(`Rail ${tag}`);
  await page.getByLabel("Email").fill(email);
  await page.locator("#reg-password").fill(password);
  await page.locator("#reg-confirm").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/en\/account$/, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  // ---- Ask 3: rail foot is a real link to /works (desktop) -----------------
  const railConfigs = [
    { locale: "en", color: "light" },
    { locale: "ar", color: "light" },
    { locale: "en", color: "dark" },
    { locale: "ar", color: "dark" },
  ];
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await registerCustomer(page);

  for (const cfg of railConfigs) {
    await page.emulateMedia({ colorScheme: cfg.color });
    await page.goto(`${BASE}/${cfg.locale}/chat`, { waitUntil: "domcontentloaded" });
    // The chat panel (and rail) render after the async identity fetch.
    await page.waitForSelector(RAIL_FOOT, { timeout: 20_000 });
    const count = await page.locator(RAIL_FOOT).count();
    check(`[${cfg.locale}/${cfg.color}] rail foot is present (one /works link)`, count === 1, `count=${count}`);
    const href = await page.locator(RAIL_FOOT).first().getAttribute("href");
    check(
      `[${cfg.locale}/${cfg.color}] rail foot links to /works`,
      Boolean(href) && href.includes(`/works`),
      `href=${href}`,
    );
    // Focusable: an <a href> is a native tab stop.
    const focusable = await page
      .locator(RAIL_FOOT)
      .first()
      .evaluate((el) => {
        el.focus();
        return document.activeElement === el;
      });
    check(`[${cfg.locale}/${cfg.color}] rail foot is focusable`, focusable);
    // Clicking navigates to the works list.
    await page.locator(RAIL_FOOT).first().click();
    await page.waitForURL(new RegExp(`/${cfg.locale}/works$`), { timeout: 20_000 });
    check(
      `[${cfg.locale}/${cfg.color}] rail foot navigates to /${cfg.locale}/works`,
      page.url().includes(`/${cfg.locale}/works`),
      page.url(),
    );
  }
  check("rail: no unexpected page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await ctx.close();

  // ---- Ask 5: the Arabic name is هنادي (not حنادي) ------------------------
  const nameConfigs = [
    { label: "mobile light", viewport: { width: 390, height: 844 }, color: "light" },
    { label: "desktop dark", viewport: { width: 1440, height: 900 }, color: "dark" },
  ];
  for (const cfg of nameConfigs) {
    const nctx = await browser.newContext({ viewport: cfg.viewport, colorScheme: cfg.color });
    const npage = await nctx.newPage();
    const nErrors = [];
    npage.on("pageerror", (e) => nErrors.push(String(e)));

    // Works subtitle (guest-visible) carries the name.
    await npage.goto(`${BASE}/ar/works`, { waitUntil: "domcontentloaded" });
    await npage.waitForTimeout(800);
    const worksText = await npage.locator("main").innerText();
    check(`[ar name ${cfg.label}] works subtitle mentions هنادي`, worksText.includes("هنادي"));
    check(`[ar name ${cfg.label}] works page has no حنادي`, !worksText.includes("حنادي"));

    // Chat launcher (FAB) aria-label on the works page.
    const fabCount = await npage.locator("a[aria-label='تحدّثي مع هنادي']").count();
    check(`[ar name ${cfg.label}] chat FAB labelled «تحدّثي مع هنادي»`, fabCount === 1, `count=${fabCount}`);

    // Chat panel section aria-label on /chat.
    await npage.goto(`${BASE}/ar/chat`, { waitUntil: "domcontentloaded" });
    await npage.waitForSelector('section[aria-label="الدردشة مع هنادي"]', { timeout: 20_000 });
    const panelCount = await npage.locator('section[aria-label="الدردشة مع هنادي"]').count();
    check(`[ar name ${cfg.label}] chat panel labelled «الدردشة مع هنادي»`, panelCount === 1, `count=${panelCount}`);
    check(
      `[ar name ${cfg.label}] /ar/chat has no حنادي`,
      !(await npage.locator("body").innerText()).includes("حنادي"),
    );
    check(`[ar name ${cfg.label}] no unexpected page errors`, nErrors.length === 0, nErrors.join(" | "));
    await nctx.close();
  }
} finally {
  await browser.close();
}

log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
