#!/usr/bin/env node
/**
 * Verification — plan 20261003-1602_see-all-button-and-mto-cta (DoD item 2).
 * Repo convention: playwright-core against the system Chromium.
 *
 * Usage: node scripts/verify-see-all-mto-cta.mjs [BASE_URL] [API_BASE]
 *   BASE_URL  default http://localhost:3000 (the dev web endpoint)
 *   API_BASE  default http://localhost:8085 (the dev API endpoint)
 *
 * Covers:
 *   - home: "See all works" real button below the featured grid (mobile+
 *     desktop, light+dark), 44px+ tap target, no horizontal overflow
 *   - product page CTA: "Order in chat" for in-stock AND made-to-order
 *     (no "Request custom" anywhere), stock badge intact
 *   - in-chat product actions: "Order this" + "Similar, customized" for
 *     both stock states (no "Request this as custom")
 *   - Arabic RTL: same checks on the localized strings
 * Screenshots → /tmp/hanadicrochet-shots
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.argv[3] ?? "http://localhost:8085";
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/snap/bin/chromium";
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

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function newPage(width, height, scheme = "light", locale = "en") {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    locale,
  });
  const page = await context.newPage();
  return { page, context };
}

const noHOverflow = async (page) => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  return scrollWidth <= clientWidth;
};

/** Let fonts/layout settle (transient overflow while images load). */
const settle = async (page) => {
  await page.waitForTimeout(1500);
  return page;
};

const sleepUntil = (t) =>
  new Promise((r) => setTimeout(r, Math.max(0, t - Date.now())));

// POST /chat/visitor is rate-limited per client IP (5/60 s fixed window,
// D16 step 1). Every test context shares 127.0.0.1, and dev StrictMode
// runs the bootstrap effect twice per chat mount — so the AR chat must
// bootstrap in a window after the EN chat checks finished.
let enChatDoneAt = 0;

/** Wait until the in-chat product actions are live (SignalR + deep link). */
async function waitProductActions(page, names) {
  const deadline = Date.now() + 240000;
  let missing = [];
  while (Date.now() < deadline) {
    missing = [];
    for (const n of names) {
      const loc = page.getByRole("button", { name: n });
      const count = await loc.count();
      if (count === 0) {
        missing.push(n);
        break;
      }
    }
    if (missing.length === 0) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

// ---- Catalog: one listed in-stock + one listed stock-0 piece -------------
const res = await fetch(`${API_BASE}/catalog/products`);
if (!res.ok) {
  console.error(`Cannot reach the API catalog (${res.status})`);
  process.exit(1);
}
const catalog = await res.json();
const items = catalog.items ?? catalog;
const listed = items.filter((p) => p.isListed);
const inStock = listed.find((p) => p.inStock);
const madeToOrder = listed.find((p) => !p.inStock);
if (!inStock || !madeToOrder) {
  console.error(
    `Need one listed in-stock and one listed stock-0 product (have ${listed.length} listed)`,
  );
  process.exit(1);
}
console.log(
  `catalog: in-stock=${inStock.id}  made-to-order=${madeToOrder.id}`,
);

// ======================================================================
// EN · mobile · light
// ======================================================================
{
  const { page, context } = await newPage(390, 844, "light", "en");

  // ---- Home: see-all button below the grid -----------------------------
  await page.goto(`${BASE}/en`, { waitUntil: "load" });
  // Note: the "All" category chip is ALSO a /works link (rounded-full) —
  // scope by text to the see-all pair.
  const seeAll = page.locator('a[href="/en/works"]', { hasText: "See all works" });
  check(
    "H1 two 'See all works' links (header link + bottom button)",
    (await seeAll.count()) === 2,
    `found=${await seeAll.count()}`,
  );

  const pill = page.locator('a[href="/en/works"].rounded-full', {
    hasText: "See all works",
  });
  const pillCount = await pill.count();
  check("H2 bottom see-all is a pill button", pillCount === 1, `found=${pillCount}`);
  if (pillCount === 1) {
    const box = await pill.first().boundingBox();
    check(
      "H3 see-all button >= 44px tall",
      box ? box.height >= 44 : false,
      `h=${box?.height}`,
    );
    const gBox = await page.locator("#works ul").last().boundingBox();
    check(
      "H4 see-all button below the featured grid",
      !!box && !!gBox && box.y > gBox.y,
      `btn.y=${box?.y} grid.y=${gBox?.y}`,
    );
    await page.screenshot({ path: `${OUT}/mto-cta-home-mobile-light.png` });
  }
  check("H5 no horizontal overflow (mobile)", await noHOverflow(await settle(page)));

  // ---- Product page: made-to-order --------------------------------------
  await page.goto(`${BASE}/en/works/${madeToOrder.id}`, {
    waitUntil: "load",
  });
  check(
    "P1 mto CTA = 'Order in chat'",
    (await page.getByRole("link", { name: "Order in chat" }).count()) === 1,
  );
  check(
    "P2 mto stock badge 'Made to order'",
    (await page.getByText("Made to order").count()) === 1,
  );
  const bodyText = await page.locator("body").innerText();
  check("P3 mto page has no 'Request custom'", !bodyText.includes("Request custom"));
  await page.screenshot({ path: `${OUT}/mto-cta-work-mto-mobile-light.png` });

  // ---- Product page: in-stock -------------------------------------------
  await page.goto(`${BASE}/en/works/${inStock.id}`, { waitUntil: "load" });
  check(
    "P4 in-stock CTA = 'Order in chat'",
    (await page.getByRole("link", { name: "Order in chat" }).count()) === 1,
  );
  check(
    "P5 in-stock badge 'In stock'",
    (await page.getByText("In stock").count()) === 1,
  );
  check(
    "P6 in-stock page has no 'Request custom'",
    !(await page.locator("body").innerText()).includes("Request custom"),
  );

  // ---- Chat: in-chat product actions (made-to-order) --------------------
  await page.goto(`${BASE}/en/chat?work=${madeToOrder.id}`, {
    waitUntil: "load",
  });
  let c1ok = await waitProductActions(page, ["Order this", "Similar, customized"]);
  if (!c1ok) {
    // A cold first mount can lose the deep-link send to the dev
    // StrictMode teardown race; one same-context retry is enough.
    await page.goto(`${BASE}/en`, { waitUntil: "load" });
    await page.goto(`${BASE}/en/chat?work=${madeToOrder.id}`, {
      waitUntil: "load",
    });
    c1ok = await waitProductActions(page, ["Order this", "Similar, customized"]);
  }
  check("C1 mto chat: 'Order this' (kind=catalog) shown", c1ok);
  check("C2 mto chat: 'Similar, customized' shown", c1ok);
  check(
    "C3 mto chat: no 'Request this as custom'",
    (await page.getByRole("button", { name: "Request this as custom" }).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/mto-cta-chat-mto-mobile-light.png` });

  // ---- Chat: in-stock (same guest thread — a SECOND product bubble) -----
  // Both product bubbles render their own actions, so require two of
  // each: the in-stock deep link must have sent its own product message.
  await page.goto(`${BASE}/en/chat?work=${inStock.id}`, { waitUntil: "load" });
  let c4ok = false;
  const c4Deadline = Date.now() + 240000;
  while (Date.now() < c4Deadline && !c4ok) {
    const orderCount = await page
      .getByRole("button", { name: "Order this" })
      .count();
    const simCount = await page
      .getByRole("button", { name: "Similar, customized" })
      .count();
    c4ok = orderCount >= 2 && simCount >= 2;
    if (!c4ok) await page.waitForTimeout(1500);
  }
  check("C4 in-stock chat: second product bubble with 'Order this'", c4ok);
  check("C5 in-stock chat: 'Similar, customized' on both bubbles", c4ok);
  enChatDoneAt = Date.now();

  await context.close();
}

// ======================================================================
// EN · desktop · light + EN · mobile · dark (parity)
// ======================================================================
{
  const { page, context } = await newPage(1280, 800, "light", "en");
  await page.goto(`${BASE}/en`, { waitUntil: "load" });
  check(
    "D1 desktop: see-all pill present",
    (
      await page
        .locator('a[href="/en/works"].rounded-full', {
          hasText: "See all works",
        })
        .count()
    ) === 1,
  );
  check("D2 desktop: no horizontal overflow", await noHOverflow(await settle(page)));
  await page.screenshot({ path: `${OUT}/mto-cta-home-desktop-light.png` });
  await context.close();
}
{
  const { page, context } = await newPage(390, 844, "dark", "en");
  await page.goto(`${BASE}/en`, { waitUntil: "load" });
  check(
    "K1 dark: see-all pill present",
    (
      await page
        .locator('a[href="/en/works"].rounded-full', {
          hasText: "See all works",
        })
        .count()
    ) === 1,
  );
  await page.screenshot({ path: `${OUT}/mto-cta-home-mobile-dark.png` });
  await context.close();
}

// ======================================================================
// AR · mobile · light (RTL)
// ======================================================================
{
  const { page, context } = await newPage(390, 844, "light", "ar");
  if (process.env.DEBUG_AR) {
    page.on("console", (m) => console.log(`  [console:${m.type()}] ${m.text().slice(0, 300)}`));
    page.on("response", (r) => {
      if (r.status() >= 400 || r.url().includes("/chat") || r.url().includes("/catalog")) {
        console.log(`  [net ${r.status()}] ${r.url().slice(-60)}`);
      }
    });
  }

  await page.goto(`${BASE}/ar`, { waitUntil: "load" });
  const arAll = page.locator('a[href="/ar/works"]', { hasText: "كل الأعمال" });
  check(
    "A1 ar home: 'كل الأعمال' link + button",
    (await arAll.count()) === 2,
    `found=${await arAll.count()}`,
  );
  check("A2 ar home: no horizontal overflow", await noHOverflow(await settle(page)));
  await page.screenshot({ path: `${OUT}/mto-cta-home-mobile-ar.png` });

  await page.goto(`${BASE}/ar/works/${madeToOrder.id}`, { waitUntil: "load" });
  check(
    "A3 ar mto CTA = 'اطلبي في المحادثة'",
    (await page.getByRole("link", { name: "اطلبي في المحادثة" }).count()) === 1,
  );
  check(
    "A4 ar mto page: no old 'اطلبي قطعة مخصّصة' CTA",
    (await page.getByText("اطلبي قطعة مخصّصة").count()) === 0,
  );

  await settle(page);
  await sleepUntil(enChatDoneAt + 75_000);
  await page.goto(`${BASE}/ar/chat?work=${madeToOrder.id}`, { waitUntil: "load" });
  const aok = await waitProductActions(page, ["اطلبي هذه", "مماثل مخصّص"]);
  if (!aok) {
    const body = (await page.locator("body").innerText().catch(() => ""))
      .replace(/\n+/g, " | ")
      .slice(0, 400);
    console.log(`  AR chat body: ${body}`);
  }
  check("A5 ar chat: 'اطلبي هذه' shown", aok);
  check("A6 ar chat: 'مماثل مخصّص' shown", aok);
  check(
    "A7 ar chat: no old 'اطلبي مخصّصاً كهذا'",
    (await page.getByText("اطلبي مخصّصاً كهذا").count()) === 0,
  );

  await context.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
