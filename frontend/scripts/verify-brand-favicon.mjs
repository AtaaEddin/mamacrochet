/**
 * Plan 20261003-1755 (brand favicon + theme-fixed logo) browser verification.
 *
 * Usage: node scripts/verify-brand-favicon.mjs [BASE_URL] [API_BASE]
 *   BASE_URL defaults to http://localhost:3100, API_BASE to http://localhost:8085
 *
 * Checks:
 *  L1  mobile home: header logo renders (~36px, /brand art)
 *  L2  mobile home: footer logo renders
 *  L3  favicon links present: SVG icon, 512x512 PNG, apple-touch-icon
 *  L4  dark mode: header logo pixels identical to light (theme-fixed art)
 *  L5  login page: auth-shell mark renders (~56px)
 *  L6  chat page: panel mark renders
 *  L7  AR home: logo renders (RTL unaffected)
 *  L8  desktop home: logo renders
 *  L9  no /favicon.ico request in the tab
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const API = process.argv[3] ?? "http://localhost:8085";

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
}

const catalog = await (await fetch(`${API}/catalog/products`)).json();
const items = catalog.items ?? catalog;
const listed = items.filter((p) => p.isListed);
if (listed.length === 0) throw new Error("no listed products in catalog");
const work = listed[0];

const LOGO = 'img[src*="brand/hanadi-mark"]';

const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  args: ["--no-sandbox"],
});

// element/page screenshots composite the theme background behind the
// transparent face, so theme comparison uses a tight crop of the face
// interior (the 8px core is solid skin/eye pixels; the outline AA edge
// blends the page background in and would differ by design).
async function centerCrop(page, logo) {
  const box = await logo.boundingBox();
  const inset = 14; // 36px render → 8×8 face core
  return page.screenshot({
    clip: {
      x: box.x + inset,
      y: box.y + inset,
      width: box.width - inset * 2,
      height: box.height - inset * 2,
    },
  });
}

// ---------- mobile, light ----------------------------------------------
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "en",
});
const page = await ctx.newPage();
const faviconIcoRequests = [];
page.on("request", (r) => {
  if (r.url().includes("favicon.ico")) faviconIcoRequests.push(r.url());
});

await page.goto(`${BASE}/en`, { waitUntil: "load" });
const headerLogo = page.locator(LOGO).first();
await headerLogo.waitFor({ state: "visible", timeout: 60000 });
const hBox = await headerLogo.boundingBox();
check(
  "L1 mobile home: header logo renders (~36px)",
  hBox && hBox.width >= 34 && hBox.width <= 38 && hBox.height >= 34,
  `box=${hBox ? `${Math.round(hBox.width)}x${Math.round(hBox.height)}` : "n/a"}`,
);
const headerShotLight = await centerCrop(page, headerLogo);

await page
  .locator(LOGO)
  .nth(1)
  .waitFor({ state: "visible", timeout: 30000 });
check(
  "L2 mobile home: footer logo renders",
  (await page.locator(LOGO).count()) >= 2,
  `count=${await page.locator(LOGO).count()}`,
);

const html = await page.content();
const hasSvgIcon = /<link[^>]*rel="icon"[^>]*href="[^"]*brand\/hanadi-mark\.svg/.test(
  html,
) || /<link[^>]*href="[^"]*brand\/hanadi-mark\.svg[^"]*"[^>]*rel="icon"/.test(html);
const hasPngIcon = /brand\/icon-512\.png[^"]*"[^>]*sizes="512x512"|sizes="512x512"[^>]*brand\/icon-512\.png/.test(
  html,
);
const hasApple = /brand\/apple-icon\.png/.test(html);
check(
  "L3 favicon links present (SVG + 512 PNG + apple)",
  hasSvgIcon && hasPngIcon && hasApple,
  `svg=${hasSvgIcon} png=${hasPngIcon} apple=${hasApple}`,
);

// ---------- dark: logo must be pixel-identical ------------------------
await page.emulateMedia({ colorScheme: "dark" });
await page.goto(`${BASE}/en`, { waitUntil: "load" });
const headerLogoDark = page.locator(LOGO).first();
await headerLogoDark.waitFor({ state: "visible", timeout: 60000 });
const headerShotDark = await centerCrop(page, headerLogoDark);
check(
  "L4 dark mode: header logo pixels identical to light",
  Buffer.compare(headerShotLight, headerShotDark) === 0,
  `light=${headerShotLight.length}b dark=${headerShotDark.length}b`,
);

// ---------- login (auth shell mark) -----------------------------------
await page.goto(`${BASE}/en/login`, { waitUntil: "load" });
// nth(1): the site-header logo is first in the DOM on this page too.
const authMark = page.locator(LOGO).nth(1);
await authMark.waitFor({ state: "visible", timeout: 60000 });
const aBox = await authMark.boundingBox();
check(
  "L5 login page: auth-shell mark renders (~56px)",
  aBox && aBox.width >= 54 && aBox.width <= 58,
  `box=${aBox ? `${Math.round(aBox.width)}x${Math.round(aBox.height)}` : "n/a"}`,
);

// ---------- chat (panel mark) -----------------------------------------
await page.goto(`${BASE}/en/chat?work=${work.id}`, { waitUntil: "load" });
// The chat page has no site header — the panel top bar mark is THE logo
// (panel bootstrap can take a while on a cold dev server).
const panelMark = page.locator(
  'header[data-chat-part="top"] img[src*="brand/hanadi-mark"]',
);
await panelMark.waitFor({ state: "visible", timeout: 240000 });
check("L6 chat page: panel top-bar mark renders", true);

check(
  "L9 no /favicon.ico request",
  faviconIcoRequests.length === 0,
  faviconIcoRequests.length ? faviconIcoRequests[0] : "ok",
);

// ---------- L11: home bust (face + body, static image) -----------------
{
  await page.goto(`${BASE}/en`, { waitUntil: "load" });
  const bust = page.locator('img[src*="brand/hanadi-bust"]').first();
  let box = null;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline && !box) {
    box = await bust.boundingBox().catch(() => null);
    if (!box) await page.waitForTimeout(1500);
  }
  check(
    "L11 home: custom-offer bust (face + body) renders as static image",
    !!box,
  );
  check(
    "L11b home bust renders ~128-160px wide",
    box && box.width >= 120 && box.width <= 170,
    `w=${box ? Math.round(box.width) : "n/a"}`,
  );
}

// ---------- L10: mirror symmetry ----------------------------------------
// The logo art must be mirror-symmetric about its vertical center: render
// the served SVG at 512px and compare each pixel with its mirror.
{
  await page.setViewportSize({ width: 512, height: 512 });
  await page.goto(`${BASE}/en`, { waitUntil: "load" });
  const svgText = await page.evaluate(
    async () => (await fetch("/brand/hanadi-mark.svg")).text(),
  );
  // Node-side base64: the SVG comment contains non-Latin1 chars (em dash),
  // in-page btoa() would throw.
  const b64 = Buffer.from(svgText, "utf8").toString("base64");
  const sym = await page.evaluate(
    async (b64) => {
      const img = new Image();
      img.src = "data:image/svg+xml;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 512;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 512, 512).data;
      let diff = 0;
      let worst = 0;
      for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 256; x++) {
          const i = (y * 512 + x) * 4;
          const j = (y * 512 + (511 - x)) * 4;
          for (let k = 0; k < 4; k++) {
            worst = Math.max(worst, Math.abs(d[i + k] - d[j + k]));
          }
          if (
            Math.abs(d[i] - d[j]) > 16 ||
            Math.abs(d[i + 1] - d[j + 1]) > 16 ||
            Math.abs(d[i + 2] - d[j + 2]) > 16 ||
            Math.abs(d[i + 3] - d[j + 3]) > 16
          )
            diff++;
        }
      }
      return { diff, worst };
    },
    b64,
  );
  check(
    "L10 logo art is mirror-symmetric (512px render)",
    sym.diff <= 512, // <0.2% of pixels may differ by >16 (sub-pixel AA at axis)
    `diffPixels=${sym.diff} worstChannelDelta=${sym.worst}`,
  );
}

await ctx.close();

// ---------- AR (RTL) ---------------------------------------------------
const arCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "ar",
});
const arPage = await arCtx.newPage();
await arPage.goto(`${BASE}/ar`, { waitUntil: "load" });
const arLogo = arPage.locator(LOGO).first();
await arLogo.waitFor({ state: "visible", timeout: 60000 });
check("L7 AR home: logo renders (RTL)", true);
await arCtx.close();

// ---------- desktop ----------------------------------------------------
const dCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "en",
});
const dPage = await dCtx.newPage();
await dPage.goto(`${BASE}/en`, { waitUntil: "load" });
const dLogo = dPage.locator(LOGO).first();
await dLogo.waitFor({ state: "visible", timeout: 60000 });
check("L8 desktop home: logo renders", true);
await dCtx.close();

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
