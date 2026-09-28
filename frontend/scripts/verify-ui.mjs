#!/usr/bin/env node
/**
 * Visual verification for hanadicrochet (plan 08 DoD: browser check).
 *
 * Screenshots key screens across viewports, themes and locales using
 * playwright-core against the system Chromium (no bundled browser —
 * low-power rule).
 *
 * Usage: node scripts/verify-ui.mjs [BASE_URL] [CHROMIUM_PATH]
 *   BASE_URL     default http://localhost:3000
 *   CHROMIUM_PATH default /snap/bin/chromium
 *
 * Output: /tmp/hanadicrochet-shots/*.png
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROMIUM = process.argv[3] ?? "/snap/bin/chromium";
const OUT = "/tmp/hanadicrochet-shots";
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // [name, path, width, height, colorScheme, deviceScaleFactor, action]
  ["home-en-mobile-light", "/en", 390, 844, "light", 2],
  ["home-en-mobile-dark", "/en", 390, 844, "dark", 2],
  ["home-en-desktop-light", "/en", 1280, 800, "light", 1],
  ["home-en-desktop-dark", "/en", 1280, 800, "dark", 1],
  ["home-ar-mobile-light", "/ar", 390, 844, "light", 2],
  ["home-ar-mobile-dark", "/ar", 390, 844, "dark", 2],
  ["home-ar-desktop-light", "/ar", 1280, 800, "light", 1],
  ["home-tr-mobile-light", "/tr", 390, 844, "light", 2],
  ["notfound-en-mobile-light", "/en/this-page-does-not-exist", 390, 844, "light", 2],
  ["home-en-desktop-full-light", "/en", 1280, 800, "light", 1, "full"],
  ["showmore-en-mobile-light", "/en/works", 390, 844, "light", 2, "showmore"],
  ["chat-en-desktop-light", "/en/chat", 1280, 800, "light", 1, "pick"],
  ["chat-ar-mobile-dark", "/ar/chat", 390, 844, "dark", 2],
  ["works-en-mobile-light", "/en/works", 390, 844, "light", 2, "full"],
  ["works-ar-desktop-light", "/ar/works", 1280, 800, "light", 1],
];

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});

let failures = 0;

for (const [name, path, width, height, colorScheme, dpr, action] of SHOTS) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme,
    // Arabic locale so date/number formatting + font fallback behave like a real ar user
    locale: path.startsWith("/ar") ? "ar" : path.startsWith("/tr") ? "tr" : "en",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900); // let fonts + settle animations finish
    if (action === "pick") {
      // Chat page: pick the first work from the product rail.
      const first = page.locator('aside[aria-label] ul button').first();
      if (await first.count()) {
        await first.click();
        await page.waitForTimeout(600);
      }
    } else if (action === "showmore") {
      // The last button in the #works section is the "show more" control.
      // It only renders when the catalog spans more than one page.
      const more = page
        .locator("#works, section[aria-labelledby='works-all-title']")
        .first()
        .locator("div.justify-center")
        .locator("button")
        .last();
      if (await more.count()) {
        await more.click();
        await page.waitForTimeout(500);
      } else {
        console.log(`SKIP ${name}: no show-more control (catalog fits one page)`);
      }
    }
    const file = `${OUT}/${name}.png`;
    await page.screenshot({ path: file, fullPage: action === "full" });
    const status = res ? res.status() : "?";
    const errNote = errors.length ? ` ⚠ ${errors.length} page error(s)` : "";
    console.log(`${status === 404 && name.startsWith("notfound") ? "OK " : status === 200 || status === 404 ? "OK " : "?? "}${name} (${status})${errNote} -> ${file}`);
    if (errors.length) failures += 1;
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}: ${String(err).split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

await browser.close();
console.log(failures ? `\n${failures} shot(s) with page errors.` : "\nAll screenshots captured, no page errors.");
process.exit(failures ? 1 : 0);
