#!/usr/bin/env node
/**
 * E2E smoke — plan 20261004-0554 sub-plan 05 (OPT-IN).
 *
 * NOT part of `pnpm test` (unit tests only). Requires the live Aspire dev
 * stack: `dotnet run --project src/Hanadicrochet.AppHost` (Next :3000 +
 * API :8085 + Postgres). The repo uses playwright-core against the system
 * Chromium (same convention as the other scripts/verify-*.mjs).
 *
 * Usage:
 *   pnpm e2e                    (BASE_URL defaults to http://localhost:3000)
 *   E2E_BASE=http://... pnpm e2e
 *   E2E_CHROMIUM=/path/to/chromium pnpm e2e
 *
 * Matrix — one fresh BrowserContext per cell (fresh guest device + cookies):
 *   A mobile 390×844 light:  1 home, 2 work→detail, 3 guest chat, 4 register→account
 *   B mobile 390×844 dark:   1 home, 3 guest chat
 *   C desktop 1280×800 light: 1 home, 2 work→detail
 *   D desktop 1280×800 dark:  1 home
 *   E mobile 390×844 light:   5 guest custom order → /orders sign-in gate
 *
 * Theme is set before page load via the next-themes localStorage key
 * (`hanadicrochet-theme` — see src/components/theme-provider.tsx).
 *
 * Exit code: 1 on any FAIL, 0 otherwise (SKIP lines never fail the run).
 * Screenshots on failure → /tmp/hanadicrochet-e2e-shots.
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE ?? process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:8085";
const OUT = "/tmp/hanadicrochet-e2e-shots";
mkdirSync(OUT, { recursive: true });

/** 1×1 PNG — small enough for chat/order sample-image uploads. */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * Put a real file into a (possibly sr-only) <input type=file> and fire the
 * real change event — the full user path from "file picked" on (chip
 * appears, React state updates, upload happens on send). Playwright's
 * CDP-based setInputFiles/filechooser silently sets no files on these
 * sr-only inputs in this Chromium build, so the file is built in-page from
 * bytes (a genuine File object — the API still sniffs its magic bytes).
 */
async function attachFile(page, selector, { name, b64, type }) {
  await page.evaluate(
    ({ sel, name, b64, type }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no file input at ${sel}`);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      el.files = dt.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: selector, name, b64, type },
  );
}

function findChromium() {
  for (const env of [process.env.E2E_CHROMIUM, process.env.CHROMIUM_EXECUTABLE]) {
    if (env) return env;
  }
  try {
    execSync("test -x /snap/bin/chromium");
    return "/snap/bin/chromium";
  } catch {
    /* fall through to PATH */
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome", "chrome"]) {
    try {
      return execSync(`command -v ${name}`).toString().trim();
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "no Chromium found — set E2E_CHROMIUM=/path/to/chromium (repo convention: /snap/bin/chromium)",
  );
}

let passed = 0;
let failed = 0;
let skipped = 0;
function check(name, ok, extra = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name} ${extra}`);
  }
}
function skip(name, why) {
  skipped++;
  console.log(`SKIP  ${name} (${why})`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Console-error filter: React hydration noise + Next dev tooling are not
 *  smoke failures; anything else is. */
const CONSOLE_NOISE =
  /hydrat|react|next|dev overlay|download the|component stack|console\.error/i;

function consoleCollector() {
  const errors = [];
  return {
    errors,
    attach(page) {
      page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
      page.on("console", (m) => {
        if (m.type() === "error") {
          // Anonymous 401s on identity.me / chat threads are EXPECTED app
          // behavior ("not logged in"); "Failed to load resource" lines are
          // network noise — real status tracking is via the response hook.
          if (/Failed to load resource/.test(m.text())) return;
          errors.push(`console: ${m.text().slice(0, 300)}`);
        }
      });
      page.on("response", (r) => {
        if (r.status() >= 500) errors.push(`http ${r.status()} ${r.url()}`);
      });
    },
    real() {
      return errors.filter((e) => !CONSOLE_NOISE.test(e));
    },
  };
}

/**
 * Warm the browser→API connection. The dev API is HTTP/1.1-only, but
 * Chromium applies h2 "prior knowledge" to IP+non-standard-port cleartext
 * targets — the first request on a fresh connection is dropped with
 * net::ERR_ALPN_NEGOTIATION_FAILED (it teaches Chromium the protocol, then
 * everything works). A couple of no-op GETs absorb that first failure.
 */
async function primeApi(page) {
  await page
    .evaluate(async (api) => {
      for (let i = 0; i < 4; i++) {
        try {
          await fetch(`${api}/health`);
          return true;
        } catch {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      return false;
    }, API_BASE)
    .catch(() => true);
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    console.log(`      (screenshot: ${path.join(OUT, name)})`);
  } catch {
    /* screenshot is best-effort */
  }
}

/** One matrix cell = one fresh context (fresh guest device + storage). */
async function withCell(
  browser,
  cell,
  { viewport, theme, run },
) {
  const context = await browser.newContext({
    viewport,
    colorScheme: theme,
  });
  // next-themes reads its localStorage key before first paint — set it in an
  // init script so the first render is already themed.
  await context.addInitScript((key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — next-themes falls back to system */
    }
  }, ["hanadicrochet-theme", theme]);
  const page = await context.newPage();
  const cons = consoleCollector();
  cons.attach(page);
  console.log(`\n== cell ${cell} (${viewport.width}×${viewport.height}, ${theme})`);
  await primeApi(page);
  try {
    await run(page, { shot: (n) => shot(page, `${cell}-${n}`) });
  } catch (e) {
    failed++;
    console.log(`FAIL  cell ${cell} crashed: ${String(e).slice(0, 200)}`);
    await shot(page, `${cell}-crash`);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — home loads (both viewports × both themes)
async function s1Home(page, { shot }) {
  const errors = consoleCollector();
  errors.attach(page);
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  const brand = page.locator("header").getByText("hanadicrochet", { exact: true });
  await brand.waitFor({ state: "visible", timeout: 20_000 });
  check("1.1 brand header visible", await brand.isVisible());

  const card = page.locator('#works a[href^="/en/works/"]').first();
  try {
    await card.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    await shot("home-empty");
    check("1.2 works grid has ≥ 1 work card", false, "(no work cards)");
    return;
  }
  const count = await page.locator('#works a[href^="/en/works/"]').count();
  check("1.2 works grid has ≥ 1 work card", count >= 1, `(found ${count})`);

  await sleep(500); // let any async console noise land
  const real = errors.real();
  check(
    "1.3 no console errors on home load",
    real.length === 0,
    real.length ? `— ${real[0]}` : "",
  );
}

// ---------------------------------------------------------------------------
// Scenario 2 — work card → detail (price + CTA), back works (mobile)
async function s2WorkDetail(page) {
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  const card = page.locator('#works a[href^="/en/works/"]').first();
  try {
    await card.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    skip("2.x work→detail", "no work card on home");
    return;
  }
  const href = await card.getAttribute("href");
  const SAMPLE_IDS = new Set(["w1", "w2", "w3", "w4", "w5", "w6"]);
  if (href && SAMPLE_IDS.has(href.split("/").pop() ?? "")) {
    skip("2.x work→detail", "home shows sample works (empty catalog) — no real detail page");
    return;
  }
  await card.click();
  await page.waitForURL(/\/en\/works\//, { timeout: 20_000 });
  const cta = page.getByRole("link", { name: /Order in chat|Ask in chat/i }).first();
  await cta.waitFor({ state: "visible", timeout: 20_000 });
  check("2.1 detail shows price + CTA", await cta.isVisible());
  const price = page.getByText(/[$₹€£]|USD/i).first();
  check("2.2 detail shows a price", await price.isVisible());

  await page.goBack();
  await page.waitForURL(/\/en$/, { timeout: 20_000 });
  check("2.3 back returns to home", page.url().replace(/\/$/, "") === `${BASE}/en` || page.url().endsWith("/en"));
}

// ---------------------------------------------------------------------------
// Scenario 3 — guest chat: bootstrap → text send → attachment send (mobile)
async function s3GuestChat(page, { shot }) {
  // Self-diagnosis on failure: console/response trail for this scenario.
  const diag = consoleCollector();
  diag.attach(page);
  page.on("requestfailed", (r) =>
    diag.errors.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`),
  );
  await page.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  const composer = page.getByLabel("Write a message…");
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await page
    .waitForFunction(
      () => !document.querySelector('textarea[aria-label="Write a message…"]')?.disabled,
      null,
      { timeout: 30_000 },
    )
      .catch(() => {});
  let composerEnabled = await composer.isEnabled();
  if (!composerEnabled) {
    // The guest submit budget is 5/min per IP (plan 05/12): back-to-back e2e
    // runs share it. If the bootstrap 429'd, wait out the window and retry.
    const rateLimited = await page
      .getByText(/Too many requests/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (rateLimited) {
      console.log("      (bootstrap 429 — waiting for the rate-limit window)");
      await sleep(61_000);
      await page.reload({ waitUntil: "networkidle" });
      await composer.waitFor({ state: "visible", timeout: 30_000 });
      await page
        .waitForFunction(
          () => !document.querySelector('textarea[aria-label="Write a message…"]')?.disabled,
          null,
          { timeout: 30_000 },
        )
        .catch(() => {});
      composerEnabled = await composer.isEnabled();
    }
  }
  check("3.1 guest composer ready (bootstrap landed)", composerEnabled);

  // Text send — Enter submits (the composer's keydown handler).
  const text = `e2e smoke ${Date.now()}`;
  await composer.fill(text);
  await composer.press("Enter");
  const body = page.getByText(text, { exact: true });
  try {
    await body.waitFor({ state: "visible", timeout: 20_000 });
    check("3.2 sent message visible in thread", true);
  } catch {
    await shot("chat-text-missing");
    check("3.2 sent message visible in thread", false, `text "${text}" never appeared`);
  }

  // Attachment send — real PNG bytes into the composer's file input, then
  // the real change event (chip appears, then Enter sends the file).
  await attachFile(page, 'input[type="file"]', {
    name: "smoke.png",
    b64: TINY_PNG_B64,
    type: "image/png",
  });
  const chip = page.getByLabel("Remove file");
  try {
    await chip.waitFor({ state: "visible", timeout: 10_000 });
    check("3.3 attachment chip appears", true);
  } catch {
    await shot("chat-chip-missing");
    check("3.3 attachment chip appears", false, "(no chip after file pick)");
  }
  await composer.fill("");
  await composer.press("Enter"); // sends the pending file(s)
  const img = page.locator('img[src*="/files/chat/"]').first();
  try {
    await img.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    await shot("chat-image-missing");
    const alerts = await page
      .locator('[role=alert]')
      .evaluateAll((a) => a.map((x) => x.textContent).filter(Boolean))
      .catch(() => []);
    console.log(
      `      diag 3.4: alerts=${JSON.stringify(alerts)} diag=${JSON.stringify(diag.errors.slice(-8))}`,
    );
    check("3.4 attachment image rendered in thread", false, "(no chat image)");
    return;
  }
  check("3.4 attachment image rendered in thread", true);
  const src = (await img.getAttribute("src")) ?? "";
  check(
    "3.5 image src is an absolute API URL (2337 sub-01 regression)",
    /^https?:\/\/.+\/files\/chat\//.test(src),
    `src=${src}`,
  );
  const loaded = await img
    .evaluate((el) => el.complete && el.naturalWidth > 0)
    .catch(() => false);
  check("3.6 image actually loads (no 404)", loaded, `src=${src}`);
}

// ---------------------------------------------------------------------------
// Scenario 4 — register → account → sign out (mobile)
async function s4Register(page, { shot }) {
  const name = "E2E Tester";
  const email = `e2e+${Date.now()}@example.com`;
  const password = "E2e!Smoke";
  await page.goto(`${BASE}/en/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name", { timeout: 20_000 });
  await page.fill("#reg-name", name);
  await page.fill("#reg-email", email);
  await page.fill("#reg-password", password);
  await page.fill("#reg-confirm", password);
  await page.getByRole("button", { name: "Create account" }).click();

  try {
    await page.waitForURL(/\/en\/account$/, { timeout: 30_000 });
  } catch {
    await shot("register-no-account");
    check("4.1 register lands on /account", false, `url=${page.url()}`);
    return;
  }
  check("4.1 register lands on /account", true);
  const greeting = page.getByText(`Hi, ${name}`, { exact: true });
  try {
    await greeting.waitFor({ state: "visible", timeout: 20_000 });
    check("4.2 account greets the new user", true);
  } catch {
    await shot("account-greeting-missing");
    check("4.2 account greets the new user", false, `no "Hi, ${name}"`);
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/account"), { timeout: 30_000 });
  check("4.3 sign out leaves the account", !page.url().includes("/account"));
  // The account page is gated now.
  await page.goto(`${BASE}/en/account`, { waitUntil: "networkidle" });
  const gated = !page.url().includes("/account");
  check("4.4 /account redirects when logged out", gated, `url=${page.url()}`);
}

// ---------------------------------------------------------------------------
// Scenario 5 — guest custom order → success → /orders sign-in gate (mobile)
async function s5GuestOrder(page, { shot }) {
  // Self-diagnosis on failure: keep a console/response trail for this cell.
  const diag = consoleCollector();
  diag.attach(page);
  page.on("requestfailed", (r) =>
    diag.errors.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`),
  );
  await page.goto(`${BASE}/en/request-custom`, { waitUntil: "networkidle" });
  await page.waitForSelector("#order-name", { timeout: 20_000 });
  await page.fill("#order-name", "E2E Order Guest");
  await page.fill("#order-phone", `999${Date.now().toString().slice(-10)}`);
  await page.fill(
    "#order-spec",
    "A small owl messenger bag in teal with a rainbow stripe — e2e smoke order.",
  );
  // Sample photo: real PNG bytes into the form's file input → preview chip.
  await attachFile(page, "#order-files", {
    name: "smoke-sample.png",
    b64: TINY_PNG_B64,
    type: "image/png",
  });
  const photoChip = page.getByLabel("Remove photo");
  try {
    await photoChip.waitFor({ state: "visible", timeout: 10_000 });
    check("5.0 sample photo attached (preview chip)", true);
  } catch {
    await shot("order-photo-missing");
    check("5.0 sample photo attached (preview chip)", false);
  }

  // Submit with one 429-aware retry: the guest submit budget is 5/min per
  // IP, and back-to-back e2e runs share it (A+B chat bootstrap + this POST).
  const dialog = page.getByText("Your request is in!", { exact: true });
  let dialogOk = false;
  for (let attempt = 1; attempt <= 2 && !dialogOk; attempt++) {
    await page.getByRole("button", { name: "Send request" }).click();
    try {
      await dialog.waitFor({ state: "visible", timeout: 30_000 });
      dialogOk = true;
    } catch {
      const rateLimited =
        attempt === 1 &&
        (await page
          .getByText(/Too many requests/i)
          .first()
          .isVisible()
          .catch(() => false));
      if (rateLimited) {
        console.log("      (order 429 — waiting for the rate-limit window)");
        await sleep(61_000);
      } else {
        break;
      }
    }
  }
  if (!dialogOk) {
    await shot("order-failed");
    const alerts = await page
      .locator('[role=alert]')
      .evaluateAll((a) => a.map((x) => x.textContent).filter(Boolean))
      .catch(() => []);
    console.log(
      `      diag 5.1: alerts=${JSON.stringify(alerts)} diag=${JSON.stringify(diag.errors.slice(-8))}`,
    );
    check("5.1 guest custom order created (success dialog)", false, "(no success dialog)");
    return;
  }
  check("5.1 guest custom order created (success dialog)", true);
  await page.getByRole("button", { name: "Sounds good" }).click();

  // The account gate: a guest's orders live behind sign-in.
  await page.goto(`${BASE}/en/orders`, { waitUntil: "networkidle" });
  const gate = page.getByText("Sign in to see your orders", { exact: true });
  try {
    await gate.waitFor({ state: "visible", timeout: 20_000 });
    check("5.2 guest sees the sign-in gate on /orders", true);
  } catch {
    await shot("orders-gate-missing");
    check("5.2 guest sees the sign-in gate on /orders", false, `url=${page.url()}`);
  }
}

// ---------------------------------------------------------------------------

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function main() {
  const executablePath = findChromium();
  console.log(`e2e smoke → ${BASE} (chromium: ${executablePath})`);
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });
  try {
    await withCell(browser, "A", {
      viewport: MOBILE,
      theme: "light",
      run: async (page, h) => {
        await s1Home(page, h);
        await s2WorkDetail(page, h);
        await s3GuestChat(page, h);
        await s4Register(page, h);
      },
    });
    await withCell(browser, "B", {
      viewport: MOBILE,
      theme: "dark",
      run: async (page, h) => {
        await s1Home(page, h);
        await s3GuestChat(page, h);
      },
    });
    await withCell(browser, "C", {
      viewport: DESKTOP,
      theme: "light",
      run: async (page, h) => {
        await s1Home(page, h);
        await s2WorkDetail(page, h);
      },
    });
    await withCell(browser, "D", {
      viewport: DESKTOP,
      theme: "dark",
      run: async (page, h) => {
        await s1Home(page, h);
      },
    });
    await withCell(browser, "E", {
      viewport: MOBILE,
      theme: "light",
      run: async (page, h) => {
        await s5GuestOrder(page, h);
      },
    });
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("e2e smoke crashed:", e);
  process.exit(1);
});
