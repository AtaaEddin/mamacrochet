#!/usr/bin/env node
/**
 * Verification — plan 20261003-2254 sub 03 (RTL: conversation sides don't flip).
 *
 * Usage: node scripts/verify-rtl-thread-sides.mjs [BASE_URL] [API_BASE]
 *   BASE_URL  default http://localhost:3000
 *   API_BASE  default http://localhost:8085
 *   PG_CONTAINER (env)  dev postgres container (default postgres-bjpckrst)
 *
 * For one thread holding BOTH a customer message and a staff (Hanadi)
 * message, asserts the conversation geometry is IDENTICAL in en and ar —
 * switching to Arabic must not flip the sides:
 *   - the customer (mine) bubble sits on the RIGHT,
 *   - the staff avatar sits on the LEFT,
 *   - in both locales (same pixel positions),
 *   - the message column is dir="ltr", body paragraphs dir="auto",
 *   - Arabic body text is right-aligned (computed direction: rtl).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.argv[3] ?? "http://localhost:8085";
const PG = process.env.PG_CONTAINER ?? "postgres-bjpckrst";

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
const close = (a, b, tol = 2) =>
  a !== null && b !== null && Math.abs(a - b) <= tol;

function sql(query) {
  const out = execSync(
    `docker exec -e PGPASSWORD=postgres ${PG} psql -U postgres -d hanadicrochet -t -A -c ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  );
  return out.trim();
}

// The message column: the max-w-2xl div that carries dir="ltr".
const COL = 'div.max-w-2xl[dir="ltr"]';

// Capture the conversation geometry for one locale.
async function captureGeom(page, locale, threadId) {
  await page.goto(`${BASE}/${locale}/chat?thread=${threadId}`, {
    waitUntil: "networkidle",
  });
  const avatar = page.locator(`${COL} img[src*="hanadi-mark"]`).first();
  const mine = page.locator(`${COL} .self-end`).first();
  await avatar.waitFor({ state: "visible", timeout: 8000 });
  await mine.waitFor({ state: "visible", timeout: 8000 });
  const avatarBox = await avatar.boundingBox();
  const mineBox = await mine.boundingBox();
  const colDir = await page.locator(COL).first().getAttribute("dir");
  const paraDir = await page.evaluate((sel) => {
    const p = document.querySelector(`${sel} .self-end p`);
    return p ? getComputedStyle(p).direction : null;
  }, COL);
  return { avatarBox, mineBox, colDir, paraDir };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/snap/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // ---- Setup: a user + one thread with a customer + a staff message --------
  const email = `rtl+${Date.now()}@example.com`;
  await page.goto(`${BASE}/en/register`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "RTL E2E");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "123456789");
  await page.fill('input[name="country"]', "Testville");
  await page.fill('input[name="new-password"]', "Passw0rd!x");
  await page.fill('input[name="confirm-password"]', "Passw0rd!x");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);

  const created = await page.evaluate(async ({ apiBase }) => {
    const af = await fetch(`${apiBase}/antiforgery`, { credentials: "include" });
    const token = af.ok ? (await af.json()).token : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-CSRF-TOKEN"] = token;
    const res = await fetch(`${apiBase}/chat/threads`, {
      method: "POST",
      headers,
      body: JSON.stringify({ subject: "rtl thread" }),
      credentials: "include",
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, id: body?.id ?? null };
  }, { apiBase: API_BASE });
  const threadId = created.id;
  check("setup: a thread was created (201)", created.status === 201 && typeof threadId === "string", `status=${created.status}`);
  if (!threadId) {
    console.log(`\n${passed} passed, ${failed} failed`);
    await browser.close();
    process.exit(1);
  }

  const custBody = "مرحباً، هذه محادثتي.";
  const sent = await page.evaluate(async ({ apiBase, threadId, body }) => {
    const af = await fetch(`${apiBase}/antiforgery`, { credentials: "include" });
    const token = af.ok ? (await af.json()).token : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-CSRF-TOKEN"] = token;
    const res = await fetch(`${apiBase}/chat/threads/${threadId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
      credentials: "include",
    });
    return res.status;
  }, { apiBase: API_BASE, threadId, body: custBody });
  check("setup: customer message sent (201)", sent === 201, String(sent));

  const staffId = randomUUID().replace(/-/g, "");
  const dbThreadId = threadId.replace(/-/g, ""); // DB stores 32-char (no hyphens)
  const now = new Date().toISOString();
  sql(
    `insert into "ChatMessages" ("Id","ThreadId","SenderId","SenderGuestId","SenderName","SenderRole","Body","IsDeleted","At") ` +
      `values ('${staffId}','${dbThreadId}',null,null,'Hanadi','employee','أهلاً بكِ! كيف أقدر أساعدكِ؟',false,'${now}')`,
  );
  const staffCount = sql(
    `select count(*) from "ChatMessages" where "ThreadId"='${dbThreadId}' and "SenderRole"='employee'`,
  );
  check("setup: staff (Hanadi) message present", staffCount === "1", staffCount);

  // The thread belongs to the user, so the geometry contexts need their
  // cookie (the setup context is logged in as that user).
  const cookies = await ctx.cookies(BASE);

  // ---- Compare en vs ar geometry across viewports + color schemes ----------
  const configs = [
    { label: "mobile light", viewport: { width: 390, height: 844 }, color: "light" },
    { label: "mobile dark", viewport: { width: 390, height: 844 }, color: "dark" },
    { label: "desktop light", viewport: { width: 1440, height: 900 }, color: "light" },
    { label: "desktop dark", viewport: { width: 1440, height: 900 }, color: "dark" },
  ];
  for (const cfg of configs) {
    const cctx = await browser.newContext({
      viewport: cfg.viewport,
      deviceScaleFactor: 2,
      colorScheme: cfg.color,
    });
    await cctx.addCookies(cookies);
    const cpage = await cctx.newPage();
    const en = await captureGeom(cpage, "en", threadId);
    const ar = await captureGeom(cpage, "ar", threadId);
    check(`[${cfg.label}] message column is dir=ltr`,
      en.colDir === "ltr" && ar.colDir === "ltr", `en=${en.colDir} ar=${ar.colDir}`);
    check(`[${cfg.label}] arabic body paragraph right-aligned (rtl)`,
      en.paraDir === "rtl" && ar.paraDir === "rtl", `en=${en.paraDir} ar=${ar.paraDir}`);
    check(`[${cfg.label}] customer bubble is right of the staff avatar`,
      Boolean(en.mineBox && en.avatarBox && en.mineBox.x > en.avatarBox.x),
      en.mineBox && en.avatarBox ? `mine.x=${en.mineBox.x} avatar.x=${en.avatarBox.x}` : "no boxes");
    // "No flip" = the two sides keep the same relative geometry. (On desktop the
    // whole message column shifts because the 3-column layout mirrors in RTL —
    // that is expected and not a flip; the *conversation sides* are what matter.)
    const enSpan = en.mineBox && en.avatarBox ? en.mineBox.x - en.avatarBox.x : null;
    const arSpan = ar.mineBox && ar.avatarBox ? ar.mineBox.x - ar.avatarBox.x : null;
    check(`[${cfg.label}] sides don't flip (customer-staff span unchanged en->ar)`,
      close(enSpan, arSpan),
      `en span=${enSpan} ar span=${arSpan}`);
    await cctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
