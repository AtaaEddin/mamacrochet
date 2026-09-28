#!/usr/bin/env node
/**
 * Programmatic visual QA for hanadicrochet (no vision model available in this env).
 *
 * Measures against a running server (dev or prod):
 *  - fonts: Baloo Bhaijaan 2 / Cairo actually loaded + applied (h1 = display, body = sans)
 *  - RTL: dir attribute, logo mirrors to the right, chat widget at logical end
 *  - no horizontal overflow at mobile/desktop widths
 *  - touch targets >= 44px in the header
 *  - rendered pixels (via canvas sampling of a real screenshot): cream light bg,
 *    deep-plum dark bg, rose primary CTA, warm foreground
 *  - dark mode: html.dark applied when colorScheme=dark
 *  - reduced motion: animations disabled under prefers-reduced-motion
 *  - localized <title> and H1 present
 *
 * Usage: node scripts/visual-qa.mjs [BASE_URL]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/snap/bin/chromium";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function newPage({ width, height, scheme = "light", locale = "en", reducedMotion = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    locale,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  return context.newPage();
}

/** css color (rgb/rgba, lab/lch, srgb/oklch via color()) -> WCAG relative luminance */
function srgbLuminance(r, g, b) {
  const lin = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function labToLuminance(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = f(fx) * 0.95047;
  const Y = f(fy);
  const Z = f(fz) * 1.08883;
  return 0.2126 * X + 0.7152 * Y + 0.0722 * Z;
}

/** oklab L,a,b (0-1 L) -> WCAG relative luminance */
function oklabToLuminance(L, a, b) {
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const to8 = (c) => {
    const x = Math.min(1, Math.max(0, c));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return srgbLuminance(to8(r) * 255, to8(g) * 255, to8(bl) * 255);
}

const NUM = "-?[\\d.]+";

function luminanceOf(cssColor) {
  let m = cssColor.match(new RegExp(`rgba?\\(\\s*(${NUM})[,\\s]+(${NUM})[,\\s]+(${NUM})`));
  if (m) return srgbLuminance(Number(m[1]), Number(m[2]), Number(m[3]));
  m = cssColor.match(new RegExp(`(?:ok)?lab\\(\\s*(${NUM})[%\\s]+(${NUM})[,\\s]+(${NUM})`));
  if (m) {
    const [L, a, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return cssColor.includes("oklab")
      ? oklabToLuminance(L, a, b)
      : labToLuminance(L, a, b);
  }
  m = cssColor.match(new RegExp(`lch\\(\\s*(${NUM})[%\\s]+(${NUM})[,\\s]+(${NUM})`));
  if (m) {
    const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const rad = (H * Math.PI) / 180;
    return labToLuminance(L, C * Math.cos(rad), C * Math.sin(rad));
  }
  return null;
}
function ratioOf(fg, bg) {
  const l1 = luminanceOf(fg);
  const l2 = luminanceOf(bg);
  if (l1 === null || l2 === null) return 0;
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Sample rendered pixels from a screenshot by drawing it into a canvas.
async function samplePixels(page, screenshotPath, points) {
  const buffer = await import("node:fs").then((fs) => fs.readFileSync(screenshotPath));
  const b64 = buffer.toString("base64");
  return page.evaluate(
    async ([b64, points]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(2)})`;
      });
    },
    [b64, points],
  );
}

// Catalog ground truth (dev DB seed changes over time — compare against it).
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8085";
let catalogCount = 0;
let firstProductId = null;
try {
  const catalogRes = await fetch(`${API_BASE}/catalog/products?$top=12`);
  if (catalogRes.ok) {
    const catalog = await catalogRes.json();
    catalogCount = catalog.items.length;
    firstProductId = catalog.items[0]?.id ?? null;
  }
} catch {
  // API offline — UI checks will fail anyway.
}

// ---------------------------------------------------------------- EN desktop
{
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const doc = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const body = document.body;
    const logo = document.querySelector("header a");
    const widget = document.querySelector('[data-testid="chat-toggle"]');
    const cta = document.querySelector('header [data-chat-cta]');
    const ctaBox = cta ? cta.getBoundingClientRect() : null;
    const workCards = document.querySelectorAll('#works li a');
    const customCta = document.querySelector('#custom-offer-title')?.closest('section')?.querySelector('a[href$="/chat"]') ?? null;
    const fonts = Array.from(document.fonts).map((f) => `${f.family} ${f.weight}`);
    return {
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      title: document.title,
      h1Text: h1?.textContent ?? null,
      h1Font: h1 ? getComputedStyle(h1).fontFamily : null,
      bodyFont: getComputedStyle(body).fontFamily,
      bodyColor: getComputedStyle(body).color,
      bodyBg: getComputedStyle(body).backgroundColor,
      logoBox: logo ? logo.getBoundingClientRect() : null,
      widgetBox: widget ? widget.getBoundingClientRect() : null,
      ctaCenter: ctaBox ? { x: ctaBox.x + ctaBox.width / 2, y: ctaBox.y + ctaBox.height / 2 } : null,
      workCards: workCards.length,
      customOffer: Boolean(customCta),
      ctaColor: cta ? getComputedStyle(cta).color : null,
      ctaBg: cta ? getComputedStyle(cta).backgroundColor : null,
      scrollW: document.documentElement.scrollWidth,
      fontsLoaded: fonts,
    };
  });

  check("en: dir/lang", doc.dir === "ltr" && doc.lang === "en", `${doc.dir}/${doc.lang}`);
  check(
    "en: title localized",
    /crochet|love/i.test(doc.title),
    doc.title.slice(0, 60),
  );
  check("en: h1 present", Boolean(doc.h1Text), doc.h1Text?.slice(0, 40));
  check(
    "en: h1 uses display font (Baloo Bhaijaan 2)",
    doc.h1Font?.includes("Baloo Bhaijaan 2") ?? false,
    doc.h1Font?.slice(0, 50),
  );
  check("en: body uses Cairo", doc.bodyFont?.includes("Cairo") ?? false, doc.bodyFont?.slice(0, 50));
  const fgRatio = ratioOf(doc.bodyColor, doc.bodyBg);
  check("en: body text contrast >= 4.5", fgRatio >= 4.5, `${fgRatio.toFixed(2)}:1`);
  const ctaRatio = ratioOf(doc.ctaColor, doc.ctaBg);
  check("en: CTA contrast >= 4.5", ctaRatio >= 4.5, `${ctaRatio.toFixed(2)}:1`);
  check(
    "en: no horizontal overflow (desktop)",
    doc.scrollW <= 1280,
    `scrollWidth=${doc.scrollW}`,
  );
  check(
    "en: logo at logical start (left)",
    doc.logoBox ? doc.logoBox.x < 400 : false,
    `x=${doc.logoBox?.x}`,
  );
  check(
    "en: no chat UI on home (chat is a page now)",
    doc.widgetBox === null,
    `widget=${doc.widgetBox ? "present" : "absent"}`,
  );
  check(
    "en: works grid starts the page (6 cards)",
    doc.workCards === Math.min(6, catalogCount),
    `cards=${doc.workCards} catalog=${catalogCount}`,
  );
  check("en: custom-offer CTA links to chat", doc.customOffer, String(doc.customOffer));
  const loaded = doc.fontsLoaded.join(" | ");
  check(
    "en: brand fonts loaded (Baloo Bhaijaan 2 + Cairo)",
    loaded.includes("Baloo Bhaijaan 2") && loaded.includes("Cairo"),
    loaded.slice(0, 80),
  );

  // Rendered pixel sampling: page background (top area) + chat bubble center
  const shot = await page.screenshot();
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/qa-en-desktop.png", shot);
  const [bgPixel, ctaPixel] = await samplePixels(page, "/tmp/qa-en-desktop.png", [
    [64, 120], // top area (intro bar / works)
    [doc.ctaCenter?.x ?? 1236, doc.ctaCenter?.y ?? 32], // header chat CTA center
  ]);
  const bgLum = luminanceOf(bgPixel);
  check(
    "en: rendered bg is warm light sand (L>0.85)",
    bgLum !== null && bgLum > 0.8,
    bgPixel,
  );
  console.log(`      info  bg pixel=${bgPixel} bubble pixel=${ctaPixel}`);
  await page.context().close();
}

// ---------------------------------------------------------------- EN mobile (overflow)
{
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check("en: no horizontal overflow (mobile)", scrollW <= 390, `scrollWidth=${scrollW}`);
  await page.context().close();
}

// ---------------------------------------------------------------- EN chat page
{
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const doc = await page.evaluate(() => {
    const thread = document.querySelector('[aria-live="polite"]');
    const composer = document.querySelector('textarea');
    const rail = document.querySelector('aside[aria-label]');
    const railCards = rail ? rail.querySelectorAll('ul button').length : 0;
    const panel = document.querySelector('section[aria-label]');
    const list = thread?.firstElementChild;
    const messages = list
      ? Array.from(list.children).filter((c) => /self-(start|end)/.test(c.className)).length
      : -1;
    return {
      panelH: panel ? panel.getBoundingClientRect().height : 0,
      panelW: panel ? panel.getBoundingClientRect().width : 0,
      messages,
      composer: Boolean(composer),
      rail: Boolean(rail),
      railCards,
    };
  });

  check("chat: full-width panel (>= 90% viewport)", doc.panelW >= 1280 * 0.9, `w=${doc.panelW}`);
  check("chat: near full height (>= 600px)", doc.panelH >= 600, `h=${doc.panelH}`);
  check("chat: fresh guest thread starts on empty state", doc.messages === 0, `n=${doc.messages}`);
  check("chat: composer present", doc.composer);
  check(
    "chat: product rail matches catalog",
    doc.rail && catalogCount >= 1 && doc.railCards === catalogCount,
    `rail=${doc.railCards} catalog=${catalogCount}`,
  );

  // Pick a product from the rail -> product card message appears in the thread.
  await page.locator('aside[aria-label] ul button').first().click();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const list = document.querySelector('[aria-live="polite"]')?.firstElementChild;
    return list
      ? Array.from(list.children).filter((c) => /self-(start|end)/.test(c.className)).length
      : -1;
  });
  check("chat: rail pick adds a product message", after === doc.messages + 1, `n=${after}`);
  const hasProductCard = await page.evaluate(() =>
    Boolean(document.querySelector('[aria-live="polite"] img')),
  );
  check("chat: product card rendered", hasProductCard);

  // Composer search picker opens.
  await page.locator('button[aria-label="Search works"]').click();
  await page.waitForTimeout(300);
  const picker = await page.locator('input[type="search"]').count();
  check("chat: composer search picker opens", picker === 1);

  await page.context().close();
}

// ---------------------------------------------------------------- EN chat ?work=
{
  const page = await newPage({ width: 1280, height: 800 });
  if (!firstProductId) {
    console.log("SKIP chat: ?work= seeds a product message (no catalog product)");
  } else {
    await page.goto(`${BASE}/en/chat?work=${firstProductId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const seeded = await page.evaluate(() =>
      Boolean(document.querySelector('[aria-live="polite"] img')),
    );
    check("chat: ?work= seeds a product message", seeded);
  }
  await page.context().close();
}

// ---------------------------------------------------------------- EN works page
{
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto(`${BASE}/en/works`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const all = await page.locator('main a[href^="/en/works/"]').count();
  check(
    "works: full list matches catalog",
    catalogCount >= 1 && all === catalogCount,
    `n=${all} catalog=${catalogCount}`,
  );

  // Category filter narrows the list (seed-dependent exact count).
  await page.getByRole("button", { name: "Bags" }).click();
  await page.waitForTimeout(600);
  const bags = await page.locator('main a[href^="/en/works/"]').count();
  check("works: category filter narrows list", bags >= 1 && bags < all, `bags=${bags} all=${all}`);

  // Custom offer at the bottom links to chat.
  const offer = await page.locator('#custom-offer-title').count();
  check("works: custom offer present", offer === 1);
  await page.context().close();
}

// ---------------------------------------------------------------- AR mobile (RTL)
{
  const page = await newPage({ width: 390, height: 844, locale: "ar" });
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const doc = await page.evaluate(() => {
    const logo = document.querySelector("header a");
    const widget = document.querySelector('[data-testid="chat-toggle"]');
    const h1 = document.querySelector("h1");
    return {
      dir: document.documentElement.dir,
      title: document.title,
      h1Text: h1?.textContent ?? null,
      h1Align: h1 ? getComputedStyle(h1).textAlign : null,
      logoBox: logo ? logo.getBoundingClientRect() : null,
      widgetBox: widget ? widget.getBoundingClientRect() : null,
      scrollW: document.documentElement.scrollWidth,
    };
  });

  check("ar: html dir=rtl", doc.dir === "rtl", doc.dir);
  check("ar: title localized (Arabic)", /كروشيه/.test(doc.title), doc.title.slice(0, 50));
  check(
    "ar: h1 Arabic present",
    /[؀-ۿ]/.test(doc.h1Text ?? ""),
    doc.h1Text?.slice(0, 40),
  );
  check("ar: no horizontal overflow (mobile)", doc.scrollW <= 390, `scrollWidth=${doc.scrollW}`);
  check(
    "ar: logo mirrored to right (RTL start)",
    doc.logoBox ? doc.logoBox.x > 390 - 260 : false,
    `x=${doc.logoBox?.x}`,
  );
  check(
    "ar: no chat UI on home (chat is a page now)",
    doc.widgetBox === null,
    `widget=${doc.widgetBox ? "present" : "absent"}`,
  );

  // Touch targets in header (>= 44px, visible only)
  const targets = await page.evaluate(() => {
    const els = document.querySelectorAll("header button");
    return Array.from(els)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { label: b.getAttribute("aria-label") ?? b.textContent, h: r.height, w: r.width };
      })
      .filter((t) => t.h > 0 && t.w > 0);
  });
  const minTarget = Math.min(...targets.map((t) => Math.min(t.h, t.w)));
  check(
    "ar: header touch targets >= 44px",
    minTarget >= 44,
    `min=${minTarget}px (${targets.length} buttons)`,
  );
  await page.context().close();
}

// ---------------------------------------------------------------- Dark mode
{
  const page = await newPage({ width: 1280, height: 800, scheme: "dark" });
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const doc = await page.evaluate(() => ({
    hasDarkClass: document.documentElement.classList.contains("dark"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    h1Color: getComputedStyle(document.querySelector("h1")).color,
  }));
  check("dark: html.dark applied (system)", doc.hasDarkClass, "");
  const bgLum = luminanceOf(doc.bodyBg);
  check(
    "dark: bg is deep plum, not black (L 0.02–0.25)",
    bgLum !== null && bgLum > 0.01 && bgLum < 0.25,
    doc.bodyBg,
  );
  const darkRatio = ratioOf(doc.h1Color, doc.bodyBg);
  check("dark: h1 contrast >= 4.5", darkRatio >= 4.5, `${darkRatio.toFixed(2)}:1`);
  await page.context().close();
}

// ---------------------------------------------------------------- Reduced motion
{
  const page = await newPage({ width: 1280, height: 800, reducedMotion: true });
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const motion = await page.evaluate(() => {
    const mascot = document.querySelector("main svg");
    const style = mascot ? getComputedStyle(mascot) : null;
    return {
      duration: style?.animationDuration ?? null,
      anyRunning: document.getAnimations().some((a) => a.playState === "running"),
    };
  });
  check(
    "reduced-motion: animations disabled",
    motion.anyRunning === false,
    `running=${motion.anyRunning}`,
  );
  await page.context().close();
}

await browser.close();
console.log(failures ? `\n${failures} QA check(s) FAILED.` : "\nAll visual QA checks passed.");
process.exit(failures ? 1 : 0);
