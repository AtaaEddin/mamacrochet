#!/usr/bin/env node
/**
 * Verification — plan 20261003-2337, EXTRA pass (the remaining checklist
 * items of sub-plans 01/02/03/04 + the full ar/RTL dimension).
 *
 * Companion to verify-chat-hiring-bugs.mjs (the core pass).
 * Usage: node scripts/verify-chat-hiring-bugs-extras.mjs [BASE_URL] [API_BASE]
 *
 * Sub 01: guest sends image + PDF → both render (guest side); lightbox
 *   opens; PDF pill is an absolute signed link; staff side renders the
 *   image too; zero 4xx/5xx on /files/**; ar (RTL) renders without
 *   horizontal overflow.
 * Sub 02: employee claims by clicking the /chat LIST row (not the inbox);
 *   closed-unclaimed inbox variant; customer auto-open of own thread
 *   unchanged; ar (RTL) list-click claim; no 403 responses anywhere.
 * Sub 03: dialog at the SHORT 900×620 viewport + mobile + ar (RTL);
 *   app seeded via the real public form with 2 files (image + pdf) and
 *   long text → files load, history reachable; Accept flow (temp
 *   password report) and Decline flow both reachable.
 * Sub 04: pre-bootstrap send is NOT duplicated (DB + UI); in-flight file
 *   (chip A consumed by send 1, chip B survives and goes with send 2, one
 *   attachment per message in the DB); bootstrap FAILURE → wait-error,
 *   text kept, retry + resend works; closed thread (user mode) disables
 *   the composer.
 *
 * Screenshots → /tmp/hanadicrochet-shots.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";

/** Minimal solid-color PNG (no deps) — sized so the lightbox has real pixels. */
function makePng(width, height, rgb) {
  const crcTable = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BASE = process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.argv[3] ?? "http://localhost:8085";
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE ?? "/snap/bin/chromium";
const OUT = "/tmp/hanadicrochet-shots";
mkdirSync(OUT, { recursive: true });
const UPLOAD_ROOT = process.env.UPLOAD_ROOT ??
  "/home/ataa/source/repos/hanadicrochet/src/Hanadicrochet.Api/uploads";

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

/** True when no alert with VISIBLE text is shown (an empty/absent alert
 *  region is fine — transient empty ones appear during client-side
 *  transitions; a non-empty one is a real error). */
async function noVisibleError(page, settleMs = 1200) {
  await sleep(settleMs);
  const texts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  return texts.every((t) => t.trim() === "");
}

// ---- DB (dev postgres) ------------------------------------------------------
const PG =
  process.env.PG_CONTAINER ??
  execSync("docker ps --format '{{.Names}}' | grep '^postgres'")
    .toString()
    .trim()
    .split("\n")[0];
function sql(query) {
  const out = execSync(
    `docker exec -e PGPASSWORD=postgres ${PG} psql -U postgres -d hanadicrochet -t -A -c ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  );
  return out.trim();
}

// ---- In-page API (auth cookie + CSRF; retries hard network failures) --------
async function apiInPage(page, path, { method = "GET", body } = {}, retries = 3) {
  let lastErr = "";
  for (let i = 0; i < retries; i++) {
    try {
      return await page.evaluate(async ({ apiBase, path, method, body }) => {
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
    } catch (e) {
      lastErr = String(e).slice(0, 100);
      console.log(`  (apiInPage ${method} ${path}: ${lastErr} — retry ${i + 1})`);
      await sleep(800);
      if (!page.isClosed()) await page.evaluate(() => null).catch(() => {});
    }
  }
  throw new Error(`apiInPage ${method} ${path}: ${lastErr}`);
}

// ---- No-auth guest bootstrap (Node) -----------------------------------------
const APP_CAP = /too many new conversations/i;
async function guestBootstrap(guestId) {
  let res = await fetch(`${API_BASE}/chat/visitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId, name: null, website: null, reset: false }),
  });
  let data = await res.json().catch(() => null);
  for (
    let i = 0;
    i < 4 && res.status === 429 && !APP_CAP.test(data?.message ?? "");
    i++
  ) {
    console.log("  (global 429 — waiting 61 s for a fresh window)");
    await sleep(61_000);
    res = await fetch(`${API_BASE}/chat/visitor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId, name: null, website: null, reset: false }),
    });
    data = await res.json().catch(() => null);
  }
  return { status: res.status, data };
}

// ---- Identity ----------------------------------------------------------------
async function registerIn(ctx, email, name) {
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
}
function promote(email, { employee = false, admin = false }) {
  sql(`UPDATE "AspNetUsers" SET "IsEmployee"=${employee}, "IsAdmin"=${admin} WHERE "Email"='${email}'`);
}

// ---- Fixtures -----------------------------------------------------------------
const PNG = makePng(240, 160, [244, 196, 170]); // soft blush, real dimensions
const PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
    "trailer<</Size 4/Root 1 0 R>>",
    "%%EOF",
  ].join("\n"),
);
function trackFileErrors(page) {
  const errs = [];
  page.on("response", (r) => {
    if (r.url().includes("/files/") && r.status() >= 400) errs.push(`${r.status()} ${r.url()}`);
  });
  return errs;
}
const dir = (page) =>
  page.evaluate(() => document.documentElement.getAttribute("dir"));

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ts = Date.now();
try {
  // ======================================================================
  // SUB 01 — image + PDF: guest side, lightbox, staff side, ar, no 404s.
  // ======================================================================
  console.log("\n== sub 01: image + PDF rendering (en + ar) ==");
  const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const g = await ctxG.newPage();
  const gErrs = trackFileErrors(g);
  const gSend = `attach test ${ts}`;

  await g.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  const gTa = g.locator('[data-chat-part="bottom"] textarea');
  await gTa.waitFor({ timeout: 30_000 });
  const fi = g.locator('[data-chat-part="bottom"] input[type="file"]');
  await fi.setInputFiles([
    { name: "ex-a.png", mimeType: "image/png", buffer: PNG },
    { name: "ex-b.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await g.locator('[data-chat-part="bottom"]').getByText("ex-a.png", { exact: true }).waitFor({ timeout: 10_000 });
  await g.locator('[data-chat-part="bottom"]').getByText("ex-b.pdf", { exact: true }).waitFor({ timeout: 10_000 });
  // NOTE (pre-existing UX): with pending chips, Enter sends the FILES only
  // (sendFiles drops the draft) — so the file send goes first, then the text.
  await gTa.press("Enter");

  const gImg = g.locator('[data-chat-part="thread"] img[alt="ex-a.png"]');
  await gImg.waitFor({ timeout: 30_000 });
  const gImgW = await gImg.evaluate((el) => el.naturalWidth);
  check("E1a guest: image renders (loaded, no 404)", gImgW > 0, `naturalWidth=${gImgW}`);
  const gImgSrc = await gImg.getAttribute("src");
  check("E1b guest: image src absolute + /files/chat/", /^https?:/.test(gImgSrc ?? "") && (gImgSrc ?? "").includes("/files/chat/"), String(gImgSrc));
  const pdfPill = g.locator('[data-chat-part="thread"] a[href*="/files/chat/"]', { hasText: "ex-b.pdf" });
  await pdfPill.waitFor({ timeout: 10_000 });

  // Then the text message (becomes the list preview for the staff inbox).
  await gTa.fill(gSend);
  await gTa.press("Enter");
  await g.locator('[data-chat-part="thread"]').getByText(gSend, { exact: true }).waitFor({ timeout: 15_000 });
  const pdfHref = await pdfPill.getAttribute("href");
  check("E1c guest: PDF pill is an ABSOLUTE signed link", /^https?:/.test(pdfHref ?? "") && (pdfHref ?? "").includes("/files/chat/"), String(pdfHref));
  check("E1d guest: PDF pill opens in a new tab", (await pdfPill.getAttribute("target")) === "_blank");

  // Lightbox: tap the thumbnail → full image overlay.
  await gImg.click();
  const lbImg = g.locator('[data-chat-part="thread"] img[alt="ex-a.png"]').last();
  const lbBox = await g.locator("img[alt=\"ex-a.png\"]").last().boundingBox();
  check("E1e lightbox opened (enlarged overlay)", lbBox !== null && lbBox.width > 200, JSON.stringify(lbBox));
  await g.screenshot({ path: `${OUT}/01-lightbox-mobile-light.png` });
  await lbImg.click().catch(() => {}); // close (overlay onClick)
  await g.emulateMedia({ colorScheme: "dark" });
  await sleep(500);
  await g.screenshot({ path: `${OUT}/01-both-att-mobile-dark.png` });
  await g.emulateMedia({ colorScheme: "light" });

  // Guest thread id (for the staff-side view).
  const gGuest = await g.evaluate(() => localStorage.getItem("hc.guestId"));
  const gThread = sql(`select "Id" from "ChatThreads" where "Kind"='visitor' and "GuestId"='${gGuest}' limit 1`);
  check("E1f guest thread in DB", gThread.length === 32);

  // Staff side: employee opens the SAME thread from the inbox.
  const empEmail = `exsemp-${ts}@example.com`;
  const ctxEmp = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  const emp = await ctxEmp.newPage();
  const empErrs = trackFileErrors(emp);
  check("E1g register employee", (await registerIn(ctxEmp, empEmail, "Extra Staff")) === 200);
  promote(empEmail, { employee: true });
  const empId = sql(`select "Id" from "AspNetUsers" where "Email"='${empEmail}'`);
  await emp.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  const empCard = emp.locator("article", { hasText: gSend });
  check("E1h thread row in the staff inbox", (await empCard.count()) === 1);
  await empCard.getByRole("button", { name: "Open chat" }).click();
  await emp.waitForURL(/thread=/, { timeout: 15_000 });
  const empImg = emp.locator('[data-chat-part="thread"] img[alt="ex-a.png"]');
  await empImg.waitFor({ timeout: 20_000 });
  const empImgW = await empImg.evaluate((el) => el.naturalWidth);
  check("E1i STAFF side: image renders too (no 404)", empImgW > 0, `naturalWidth=${empImgW}`);
  await emp.screenshot({ path: `${OUT}/01-staff-side-desktop.png` });

  // ar (RTL): a FRESH guest thread with an attachment.
  const ctxAr = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const ar = await ctxAr.newPage();
  const arErrs = trackFileErrors(ar);
  await ar.goto(`${BASE}/ar/chat`, { waitUntil: "networkidle" });
  await ar.locator('[data-chat-part="bottom"] textarea').waitFor({ timeout: 30_000 });
  await ar.locator('[data-chat-part="bottom"] input[type="file"]').setInputFiles({ name: "ar-a.png", mimeType: "image/png", buffer: PNG });
  await ar.locator('[data-chat-part="bottom"]').getByText("ar-a.png", { exact: true }).waitFor({ timeout: 10_000 });
  await ar.locator('[data-chat-part="bottom"] textarea').press("Enter");
  const arImg = ar.locator('[data-chat-part="thread"] img[alt="ar-a.png"]');
  await arImg.waitFor({ timeout: 30_000 });
  const arImgW = await arImg.evaluate((el) => el.naturalWidth);
  check("E1j ar/RTL: attachment renders", arImgW > 0, `naturalWidth=${arImgW}`);
  check("E1k ar/RTL: page is RTL", (await dir(ar)) === "rtl");
  const arOverflow = await ar.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("E1l ar/RTL: no horizontal overflow", arOverflow <= 0, `overflow=${arOverflow}px`);
  await ar.screenshot({ path: `${OUT}/01-rtl-attachment-mobile.png` });

  check("E1m zero 4xx/5xx on /files/** (guest+staff+ar)", [...gErrs, ...empErrs, ...arErrs].length === 0, [...gErrs, ...empErrs, ...arErrs].join(" | ").slice(0, 200));

  // ======================================================================
  // SUB 02 — list-click claim, closed-unclaimed, customer auto-open, RTL.
  // ======================================================================
  console.log("\n== sub 02: remaining access paths (en + ar) ==");
  const no403 = [];
  for (const p of [emp, ar]) {
    p.on("response", (r) => {
      if (r.status() === 403 && r.url().includes("/chat/")) no403.push(r.url());
    });
  }

  // E2a — claim by clicking the /chat LIST row (not the staff inbox).
  const g2Guest = randomUUID();
  const g2 = await guestBootstrap(g2Guest);
  check("E2a1 G2 bootstrap (list-click fixture)", g2.status === 200, `status=${g2.status}`);
  const g2Thread = g2.data?.thread?.id ?? "";
  // The list row shows "No messages yet" — the row is still clickable.
  await emp.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  // Newest first: the just-created G2 is the top row.
  const g2Row = emp.locator('[data-chat-part="list"] li button').first();
  const g2RowText = (await g2Row.innerText().catch(() => "")) ?? "";
  check("E2a2 G2 row present in the employee's /chat list", g2RowText.length > 0, g2RowText.slice(0, 80));
  await g2Row.click();
  // The auto-open effect may navigate to the employee's latest thread first;
  // the claim's replace to G2 lands right after — wait for G2 specifically.
  await emp.waitForURL((u) => u.searchParams.get("thread") === g2Thread, { timeout: 20_000 });
  check("E2a3 list click opened the thread", true, emp.url());
  const g2Assignee = sql(`select "AssignedEmployeeId" from "ChatThreads" where "Id"='${g2Thread}'`);
  check("E2a4 list click CLAIMED it (assignee = employee)", g2Assignee === empId, g2Assignee);
  check("E2a5 no error shown on the staff thread", await noVisibleError(emp));

  // E2b — closed-unclaimed inbox variant: admin closes a fresh thread, the
  // employee opens it from the inbox (claim + open still work when closed).
  const g3Guest = randomUUID();
  const g3 = await guestBootstrap(g3Guest);
  check("E2b1 G3 bootstrap (closed-variant fixture)", g3.status === 200, `status=${g3.status}`);
  const g3Thread = g3.data?.thread?.id ?? "";
  const admEmail = `exsadm-${ts}@example.com`;
  const ctxAdm = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  const adm = await ctxAdm.newPage();
  check("E2b2 register admin", (await registerIn(ctxAdm, admEmail, "Extra Admin")) === 200);
  promote(admEmail, { admin: true });
  await adm.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  const closeRes = await apiInPage(adm, `/chat/threads/${g3Thread}/close`, { method: "POST", body: { reason: "extras test close" } });
  check("E2b3 admin closed G3", closeRes.status === 200, `status=${closeRes.status} ${JSON.stringify(closeRes.data).slice(0, 100)}`);
  await emp.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  // The closed row: "No messages yet" preview + Closed badge.
  const closedCard = emp.locator("article", { hasText: "Closed" }).first();
  const closedCardText = (await closedCard.innerText().catch(() => "")) ?? "";
  check("E2b4 closed G3 row visible in the inbox", closedCardText.includes("Closed"), closedCardText.replace(/\n/g, " | ").slice(0, 100));
  await closedCard.getByRole("button", { name: "Open chat" }).click();
  await emp.waitForURL(/thread=/, { timeout: 15_000 });
  check("E2b5 closed-unclaimed thread opened (no 403)", new URL(emp.url()).searchParams.get("thread") === g3Thread, emp.url());
  const g3Assignee = sql(`select "AssignedEmployeeId" from "ChatThreads" where "Id"='${g3Thread}'`);
  check("E2b6 closed-unclaimed was claimed on open", g3Assignee === empId, g3Assignee);

  // E2c — customer auto-open of their OWN thread is unchanged.
  const custEmail = `exscust-${ts}@example.com`;
  const ctxCust = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  const cust = await ctxCust.newPage();
  check("E2c1 register customer", (await registerIn(ctxCust, custEmail, "Extra Cust")) === 200);
  await cust.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await cust.locator('[data-chat-part="list"] button[aria-label="New conversation"]').click();
  await cust.waitForURL(/thread=/, { timeout: 15_000 });
  const custThread = new URL(cust.url()).searchParams.get("thread") ?? "";
  check("E2c2 customer created + opened a thread", custThread.length === 32, custThread);
  // Leave that page; a fresh visit auto-opens the SAME thread.
  await cust.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await cust.waitForURL((u) => u.searchParams.get("thread") === custThread, { timeout: 20_000 });
  check("E2c3 auto-open returns to the customer's own thread", true, cust.url());
  check("E2c4 no 403/error for the customer", await noVisibleError(cust));

  // E2d — ar (RTL): list-click claim works under RTL too.
  const g4Guest = randomUUID();
  const g4 = await guestBootstrap(g4Guest);
  check("E2d1 G4 bootstrap (RTL fixture)", g4.status === 200, `status=${g4.status}`);
  const g4Thread = g4.data?.thread?.id ?? "";
  await emp.goto(`${BASE}/ar/chat`, { waitUntil: "networkidle" });
  check("E2d2 employee /chat is RTL in ar", (await dir(emp)) === "rtl");
  const g4Row = emp.locator('[data-chat-part="list"] li button').first();
  await g4Row.click();
  await emp.waitForURL((u) => u.searchParams.get("thread") === g4Thread, { timeout: 20_000 });
  check("E2d3 RTL list click opened + claimed", true, emp.url());
  const g4Assignee = sql(`select "AssignedEmployeeId" from "ChatThreads" where "Id"='${g4Thread}'`);
  check("E2d4 RTL claim recorded", g4Assignee === empId, g4Assignee);
  await emp.screenshot({ path: `${OUT}/02-rtl-claimed-thread.png` });

  check("E2e zero 403 responses on /chat/** (all of sub 02)", no403.length === 0, no403.join(" | ").slice(0, 200));

  // ======================================================================
  // SUB 03 — short viewport, real-file seed, accept/decline, RTL.
  // ======================================================================
  console.log("\n== sub 03: hiring dialog extras (short viewport, files, flows, RTL) ==");
  const longWork = ("Crocheted totes, market bags and slouchy clutches for boutiques since 2014. ".repeat(24)).trim();
  const longMsg = ("I would love to join the team. I keep my work in a small home studio, " + "deliver on time, and answer messages quickly. ".repeat(8)).trim();
  const app1Email = `hiring1-${ts}@example.com`;
  const app2Email = `hiring2-${ts}@example.com`;
  // Playwright's APIRequestContext does not serialize Node FormData/Blob to
  // multipart — submit from in-page fetch (a real browser FormData) instead,
  // same auth/CSRF path as apiInPage. The adm page is already on an app page
  // (real origin, so CORS preflight passes).
  await adm.goto(`${BASE}/en/admin/hiring`, { waitUntil: "networkidle" });
  const pngB64 = PNG.toString("base64");
  const pdfB64 = PDF.toString("base64");
  const postHiringInPage = async (fields, files) =>
    adm.evaluate(async ({ apiBase, fields, files }) => {
      const b64toBlob = (b64, type) => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type });
      };
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      for (const f of files) form.append("files", b64toBlob(f.b64, f.type), f.name);
      const headers = {};
      const af = await fetch(`${apiBase}/antiforgery`, { credentials: "include" });
      if (af.ok) {
        const d = await af.json();
        if (d.token) headers["X-CSRF-TOKEN"] = d.token;
      }
      const res = await fetch(`${apiBase}/hiring`, {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data };
    }, { apiBase: API_BASE, fields, files });

  // /hiring shares the strict 5/min/IP guest bucket with /chat/visitor —
  // wait it out if a guest bootstrap ate the window.
  const postHiring = async (fields, files) => {
    let r = await postHiringInPage(fields, files);
    for (let i = 0; i < 4 && r.status === 429; i++) {
      console.log("  (hiring 429 — waiting 61 s for a fresh window)");
      await sleep(61_000);
      r = await postHiringInPage(fields, files);
    }
    return r;
  };
  const r1 = await postHiring(
    {
      name: "Overflow One",
      email: app1Email,
      phone: "111222333",
      country: "Testland",
      nationality: "Tester",
      languages: "English",
      previousWork: longWork,
      message: longMsg,
    },
    [
      { name: "hiring-a.png", b64: pngB64, type: "image/png" },
      { name: "hiring-b.pdf", b64: pdfB64, type: "application/pdf" },
    ],
  );
  check("E3a1 public form: app 1 submitted with 2 files", r1.status === 200 || r1.status === 201, `status=${r1.status} ${JSON.stringify(r1.data).slice(0, 120)}`);
  const r2 = await postHiring(
    {
      name: "Overflow Two",
      email: app2Email,
      phone: "444555666",
      country: "Testland",
      languages: "English",
      previousWork: "Short history.",
      message: "Please consider me.",
    },
    [],
  );
  check("E3a2 public form: app 2 submitted", r2.status === 200 || r2.status === 201, `status=${r2.status} ${JSON.stringify(r2.data).slice(0, 120)}`);
  const app1 = r1.status < 300 ? r1.data : null;
  const app2 = r2.status < 300 ? r2.data : null;
  const app1Id = app1?.id ?? sql(`select "Id" from "HiringApplications" where "Email"='${app1Email}'`);
  const app2Id = app2?.id ?? sql(`select "Id" from "HiringApplications" where "Email"='${app2Email}'`);
  check("E3a3 both apps in DB", app1Id.length === 32 && app2Id.length === 32, `${app1Id} ${app2Id}`);

  const openDetail = async (page, appId, width, height, scheme, locale) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${BASE}/${locale}/admin/hiring`, { waitUntil: "networkidle" });
    const email = appId === app1Id ? app1Email : app2Email;
    // Table row containing the application's email → its Review button.
    const row = page.locator("tr", { hasText: email }).first();
    await row.waitFor({ timeout: 20_000 });
    await row.getByRole("button", { name: locale === "ar" ? "مراجعة" : "Review" }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.getByRole("button", { name: locale === "ar" ? "قبول" : "Accept" }).waitFor({ timeout: 10_000 });
    return dialog;
  };

  // --- SHORT viewport 900×620 (en): cap, scroll, pinned footer, files, history.
  const dlg = await openDetail(adm, app1Id, 900, 620, "light", "en");
  const box = await dlg.boundingBox();
  check("E3b1 short: dialog height ≤ 80dvh", box.height <= 0.8 * 620 + 2, `h=${Math.round(box.height)} cap=${Math.round(0.8 * 620)}`);
  const scrollDiv = dlg.locator("div.overflow-y-auto").first();
  const dims = await scrollDiv.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  check("E3b2 short: body scrolls", dims.sh > dims.ch + 10, `sh=${dims.sh} ch=${dims.ch}`);
  const acceptBtn = dlg.getByRole("button", { name: "Accept" });
  const aBox = await acceptBtn.boundingBox();
  check("E3b3 short: Accept visible WITHOUT scrolling", (await acceptBtn.isVisible()) && aBox.y + aBox.height <= 620 + 2, `bottom=${Math.round(aBox.y + aBox.height)}`);

  // Files section: image loads (absolute /files/hiring/ link), PDF pill.
  const fileImg = dlg.locator("img").first();
  const fileSrc = (await fileImg.getAttribute("src")) ?? "";
  await fileImg.evaluate((el) => el.decode().catch(() => {}));
  const fileW = await fileImg.evaluate((el) => el.naturalWidth);
  check("E3b4 short: attached image loads", fileW > 0 && fileSrc.includes("/files/hiring/"), `naturalWidth=${fileW} src=${fileSrc.slice(0, 80)}`);
  const hiringPdf = dlg.locator("a[href*='/files/hiring/']").first();
  check("E3b5 short: attached PDF pill (absolute link)", (await hiringPdf.count()) === 1, JSON.stringify((await hiringPdf.getAttribute("href").catch(() => null))?.slice(0, 80)));

  // History: scroll the section header into view → the submitted event is visible.
  const histHeader = dlg.locator("h3", { hasText: "History" }).first();
  await histHeader.scrollIntoViewIfNeeded();
  await sleep(400);
  const histVisible = await dlg.getByText(/Applied/).first().isVisible().catch(() => false);
  check("E3b6 short: history list fully reachable (Applied event)", histVisible);
  await adm.screenshot({ path: `${OUT}/03-hiring-short-900x620-light.png` });

  // Scroll to the TOP → footer STILL visible (pinned at all scroll positions).
  await scrollDiv.evaluate((el) => { el.scrollTop = 0; });
  await sleep(300);
  const aBoxTop = await acceptBtn.boundingBox();
  check("E3b7 short: footer visible at TOP scroll too", aBoxTop.y + aBoxTop.height <= 620 + 2, `bottom=${Math.round(aBoxTop.y + aBoxTop.height)}`);

  // --- Mobile + dark (en) and ar (RTL) — while app 1 is still `new`
  // (the footer's Accept/Decline only render for `new` applications).
  await openDetail(adm, app1Id, 390, 844, "dark", "en");
  const mBox = await adm.getByRole("dialog").last().boundingBox();
  check("E3c2 mobile dark: dialog ≤ 80dvh", mBox.height <= 0.8 * 844 + 2, `h=${Math.round(mBox.height)}`);
  await adm.screenshot({ path: `${OUT}/03-hiring-mobile-dark-files.png` });

  await openDetail(adm, app1Id, 390, 844, "light", "ar");
  check("E3c3 ar/RTL: dialog is RTL", (await dir(adm)) === "rtl");
  // Dialog-scoped overflow check: the ar/390 document ALSO shows a ~108 px
  // overflow, but it comes from the PRE-EXISTING mobile site header in the
  // staff state (two 44 px staff icon buttons + logo + chat CTA > 358 px —
  // same in EN, ~111 px; see main.md "Discovered during verification").
  // The dialog itself must fit.
  const rtlDlgBox = await adm.getByRole("dialog").last().boundingBox();
  check("E3c4 ar/RTL: dialog fits the 390 px viewport", rtlDlgBox.x >= -1 && rtlDlgBox.x + rtlDlgBox.width <= 391, `x=${rtlDlgBox.x} w=${rtlDlgBox.width}`);
  const arDocOverflow = await adm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`  (note: document-level overflow in ar staff state = ${arDocOverflow}px — pre-existing site-header issue, not the dialog)`);
  const arAccept = adm.getByRole("dialog").last().getByRole("button", { name: "قبول" });
  const arABox = await arAccept.boundingBox();
  check("E3c5 ar/RTL: Accept (قبول) pinned & visible", (await arAccept.isVisible()) && arABox.y + arABox.height <= 844 + 2, `bottom=${Math.round(arABox.y + arABox.height)}`);
  await adm.screenshot({ path: `${OUT}/03-hiring-rtl-mobile.png` });

  // --- Accept flow (temp password report) at the short viewport.
  await openDetail(adm, app1Id, 900, 620, "light", "en");
  await adm.getByRole("dialog").last().getByRole("button", { name: "Accept" }).click();
  const acceptDlg = await adm.getByRole("dialog").last();
  // The accept confirmation dialog has its own primary button.
  const acceptConfirm = acceptDlg.getByRole("button", { name: "Accept & create account" });
  await acceptConfirm.click();
  // The one-time password dialog appears (HiringAccepted → TempPasswordDialog).
  const pwReport = adm.getByRole("dialog").last().getByText("One-time password", { exact: true });
  await pwReport.waitFor({ timeout: 15_000 });
  check("E3b8 Accept flow: one-time password dialog shown", (await pwReport.count()) > 0);
  await adm.getByRole("button", { name: "Done" }).click();
  await adm.screenshot({ path: `${OUT}/03-hiring-accepted-password.png` });
  // Close whatever dialog is open.
  await adm.keyboard.press("Escape").catch(() => {});
  await sleep(400);

  // --- Decline flow at the short viewport (app 2).
  await openDetail(adm, app2Id, 900, 620, "light", "en");
  const declineBtn = adm.getByRole("dialog").last().getByRole("button", { name: "Decline" });
  await declineBtn.click();
  const declineDlg = adm.getByRole("dialog").last();
  const declineConfirm = declineDlg.getByRole("button", { name: "Decline", exact: true });
  await declineConfirm.click();
  await sleep(1200);
  const stillNew = sql(`select "Status" from "HiringApplications" where "Id"='${app2Id}'`);
  check("E3c1 Decline flow reachable + applied", stillNew === "declined", stillNew);

  // ---- Tidy the test applications (and the accepted account). ---------------
  try {
    for (const [appId, email] of [[app1Id, app1Email], [app2Id, app2Email]]) {
      const dirPath = `${UPLOAD_ROOT}/hiring/${appId}`;
      const fileIds = sql(`select "StoredName" from "HiringApplicationFiles" where "ApplicationId"='${appId}'`);
      for (const sn of fileIds ? fileIds.split("\n").filter(Boolean) : []) {
        rmSync(`${dirPath}/${sn}`, { force: true });
      }
      sql(`delete from "HiringApplicationFiles" where "ApplicationId"='${appId}'`);
      sql(`delete from "HiringApplicationEvents" where "ApplicationId"='${appId}'`);
      sql(`delete from "HiringApplications" where "Id"='${appId}'`);
      if (email === app1Email) {
        // Accept created an employee account — remove it (roles first).
        const uid = sql(`select "Id" from "AspNetUsers" where "Email"='${email}'`);
        if (uid) {
          sql(`delete from "AspNetUserRoles" where "UserId"='${uid}'`);
          sql(`delete from "AspNetUsers" where "Id"='${uid}'`);
        }
      }
    }
  } catch (e) {
    console.log(`  (cleanup warning: ${String(e).slice(0, 120)})`);
  }

  // ======================================================================
  // SUB 04 — no duplication, in-flight file, bootstrap failure, closed.
  // ======================================================================
  console.log("\n== sub 04: remaining send-race items ==");
  const ctxG2 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const gp = await ctxG2.newPage();
  const g2Posts = [];
  gp.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/chat/visitor")) g2Posts.push(1);
  });
  await gp.route("**/chat/visitor", async (route) => {
    const response = await route.fetch();
    await sleep(1500);
    await route.fulfill({ response });
  });
  const dupText = `no dup ${ts}`;
  await gp.goto(`${BASE}/en/chat`, { waitUntil: "domcontentloaded" });
  const g2Ta = gp.locator('[data-chat-part="bottom"] textarea');
  await g2Ta.waitFor({ timeout: 30_000 });
  await g2Ta.fill(dupText);
  await g2Ta.press("Enter");
  await gp.locator('[data-chat-part="thread"]').getByText(dupText, { exact: true }).first().waitFor({ timeout: 30_000 });
  const uiCount = await gp.locator('[data-chat-part="thread"]').getByText(dupText, { exact: true }).count();
  const g5Guest = await gp.evaluate(() => localStorage.getItem("hc.guestId"));
  const g5T = sql(`select "Id" from "ChatThreads" where "Kind"='visitor' and "GuestId"='${g5Guest}' limit 1`);
  const dbCount = sql(`select count(*) from "ChatMessages" where "ThreadId"='${g5T}' and "Body"='${dupText}'`);
  check("E4a1 pre-bootstrap send appears exactly ONCE (UI)", uiCount === 1, `count=${uiCount}`);
  check("E4a2 pre-bootstrap send exactly ONCE in DB", dbCount === "1", `count=${dbCount}`);

  // E4b — in-flight file: A is consumed by send 1, B survives for send 2.
  await gp.route("**/chat/threads/*/attachments", async (route) => {
    const response = await route.fetch();
    await sleep(1500);
    await route.fulfill({ response });
  });
  const fA = { name: "inflight-a.png", mimeType: "image/png", buffer: PNG };
  const fB = { name: "inflight-b.png", mimeType: "image/png", buffer: PNG };
  // Send 1 = file A (with chips pending, Enter sends the files only).
  await gp.locator('[data-chat-part="bottom"] input[type="file"]').setInputFiles([fA]);
  await gp.locator('[data-chat-part="bottom"]').getByText("inflight-a.png", { exact: true }).waitFor({ timeout: 10_000 });
  await g2Ta.press("Enter");
  // While A is still uploading (delayed route), attach B.
  await sleep(600);
  await gp.locator('[data-chat-part="bottom"] input[type="file"]').setInputFiles([fB]);
  await gp.locator('[data-chat-part="bottom"]').getByText("inflight-b.png", { exact: true }).waitFor({ timeout: 10_000 });
  const imgA = gp.locator('[data-chat-part="thread"] img[alt="inflight-a.png"]');
  await imgA.waitFor({ timeout: 30_000 }); // send 1 complete
  await sleep(800);
  const chipA = await gp.locator('[data-chat-part="bottom"]').getByText("inflight-a.png", { exact: true }).count();
  const chipB = await gp.locator('[data-chat-part="bottom"]').getByText("inflight-b.png", { exact: true }).count();
  check("E4b1 after send 1: A's chip is GONE", chipA === 0, `chipA=${chipA}`);
  check("E4b2 after send 1: B's chip SURVIVES", chipB === 1, `chipB=${chipB}`);
  // Send 2 = file B only.
  await g2Ta.press("Enter");
  const imgB = gp.locator('[data-chat-part="thread"] img[alt="inflight-b.png"]');
  await imgB.waitFor({ timeout: 30_000 }); // send 2 complete
  await sleep(800);
  const chipB2 = await gp.locator('[data-chat-part="bottom"]').getByText("inflight-b.png", { exact: true }).count();
  check("E4b3 after send 2: B's chip is gone", chipB2 === 0, `chipB=${chipB2}`);
  const attRows = sql(`select count(*) from "ChatAttachments" where "ThreadId"='${g5T}' and "MessageId" is not null`);
  const attMsgs = sql(`select count(distinct "MessageId") from "ChatAttachments" where "ThreadId"='${g5T}' and "MessageId" is not null`);
  check("E4b4 DB: two attachments on TWO DISTINCT messages (one each)", attRows === "2" && attMsgs === "2", `total=${attRows} msgs=${attMsgs}`);
  await gp.screenshot({ path: `${OUT}/04-inflight-file-mobile.png` });

  // E4c — bootstrap FAILURE: wait-error, text kept, retry + resend works.
  const ctxG3 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const g6 = await ctxG3.newPage();
  await g6.route("**/chat/visitor", (route) => route.abort());
  await g6.goto(`${BASE}/en/chat`, { waitUntil: "domcontentloaded" });
  const g6Ta = g6.locator('[data-chat-part="bottom"] textarea');
  await g6Ta.waitFor({ timeout: 30_000 });
  await sleep(2500); // let the failed bootstrap settle into the error state
  const retryBtn = g6.locator('button[aria-label="Reconnect"]');
  check("E4c1 bootstrap failure → retry control visible", (await retryBtn.count()) > 0);
  const keepText = "kept after failure";
  await g6Ta.fill(keepText);
  await g6Ta.press("Enter");
  await sleep(800);
  const kept = (await g6Ta.inputValue()) === keepText;
  check("E4c2 send during failure: text KEPT in composer", kept, `value='${await g6Ta.inputValue()}'`);
  const g3ErrVisible = (await g6.locator('[role="alert"]').count()) > 0;
  check("E4c3 an error is shown (bootstrap error or wait cap)", g3ErrVisible);
  // Lift the abort and retry.
  await g6.unroute("**/chat/visitor");
  await retryBtn.click();
  await g6.locator('[data-chat-part="thread"]').waitFor({ timeout: 30_000 });
  await g6Ta.fill(keepText);
  await g6Ta.press("Enter");
  await g6.locator('[data-chat-part="thread"]').getByText(keepText, { exact: true }).waitFor({ timeout: 30_000 });
  check("E4c4 after retry: the same text sends fine", true);

  // E4d — closed thread (user mode) disables the composer.
  // Reuse E2c's customer thread — the admin closes it now.
  const closeCust = await apiInPage(adm, `/chat/threads/${custThread}/close`, { method: "POST", body: { reason: "extras closed-thread test" } });
  check("E4d1 admin closed the customer thread", closeCust.status === 200, `status=${closeCust.status}`);
  await cust.reload({ waitUntil: "networkidle" });
  // A closed thread renders a "conversation is closed" note instead of the
  // composer form (no textarea at all).
  // exact + scoped to the bottom part (the list's closed-thread empty state
  // starts with the same sentence).
  const closedNote = cust
    .locator('[data-chat-part="bottom"]')
    .getByText("This conversation is closed.", { exact: true });
  await closedNote.waitFor({ timeout: 20_000 });
  await sleep(1500);
  check("E4d2 closed thread → composer replaced by closed note", await closedNote.isVisible());
  check("E4d3 closed thread → no composer rendered", (await cust.locator('[data-chat-part="bottom"] textarea').count()) === 0);
  await cust.screenshot({ path: `${OUT}/04-closed-thread-composer-desktop.png` });
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
