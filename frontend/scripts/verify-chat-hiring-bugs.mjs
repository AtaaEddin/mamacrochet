#!/usr/bin/env node
/**
 * Verification — plan 20261003-2337 (chat & hiring bug fixes), all four
 * sub-plans, verified in a real browser (playwright-core against the
 * system Chromium — repo convention, cf. verify-conversation-mgmt.mjs).
 *
 * Usage: node scripts/verify-chat-hiring-bugs.mjs [BASE_URL] [API_BASE]
 *
 * Covers:
 *  - sub 01: a guest chat attachment renders through fileSrc() — an
 *    ABSOLUTE API URL, and the image actually loads (no 404).
 *  - sub 02: a non-admin employee opening an UNCLAIMED visitor thread
 *    claims it first (first-wins) and the thread opens (no 403); a
 *    concurrent double claim → exactly one 200 + one 409; auto-open never
 *    grabs an unclaimed thread for a plain employee (but does open the
 *    assignee's own thread); an admin opens an unclaimed thread directly
 *    without claiming it.
 *  - sub 03: the hiring detail dialog (long previous-work text) is capped
 *    at 80dvh with a scrollable body and a PINNED footer (visible without
 *    scrolling) — mobile + desktop, light + dark.
 *  - sub 04: a guest send issued BEFORE the bootstrap settles is WAITED
 *    for and delivered (never dropped); the bootstrap POST fires exactly
 *    once per mount (in-flight dedupe); the message survives a reload;
 *    user mode with no thread open disables the composer (and re-enables
 *    it once a thread opens).
 *
 * Screenshots → /tmp/hanadicrochet-shots (light + dark, mobile + desktop).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API_BASE = process.argv[3] ?? "http://localhost:8085";
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE ?? "/snap/bin/chromium";
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ---- In-page API (rides the page's auth cookie; CSRF for mutations) ---------
async function apiInPage(page, path, { method = "GET", body } = {}, retries = 3) {
  let lastErr = "";
  for (let i = 0; i < retries; i++) {
    try {
      return await doApiInPage(page, path, { method, body });
    } catch (e) {
      // Hard network failure (rare in dev) — retry once the page settles.
      lastErr = String(e).slice(0, 120);
      console.log(`  (apiInPage ${method} ${path} failed: ${lastErr} — retry ${i + 1})`);
      await sleep(800);
      if (!page.isClosed()) await page.evaluate(() => null).catch(() => {});
    }
  }
  throw new Error(`apiInPage ${method} ${path}: ${lastErr}`);
}
async function doApiInPage(page, path, { method = "GET", body } = {}) {
  return page.evaluate(async ({ apiBase, path, method, body }) => {
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
  // The global 5/min/IP bucket: wait for a fresh window on a *global* 429.
  for (
    let i = 0;
    i < 4 && res.status === 429 && !APP_CAP.test(data?.message ?? "");
    i++
  ) {
    console.log("  (global 429 on guest bootstrap — waiting 61 s for a fresh window)");
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

// ---- Identity (register + dev promotion) -------------------------------------
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
      data: {
        name,
        email,
        password: "Passw0rd!x",
        phone: "999000111",
        country: "Testville",
      },
    })
  ).status();
}
function promote(email, { employee = false, admin = false }) {
  sql(
    `UPDATE "AspNetUsers" SET "IsEmployee"=${employee}, "IsAdmin"=${admin} WHERE "Email"='${email}'`,
  );
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
// G1 survives past its block: sub 01 reuses the thread, sub 02 the row.
let pageG1 = null;
let g1Thread = "";
let g1Ts = 0;
try {
  // ---- Tidy leftovers from earlier runs (dev DB test artifacts). -------
  {
    const old = sql(
      `select "Id" from "ChatThreads" t where t."Kind"='visitor' and t."AssignedEmployeeId" is null ` +
        `and exists (select 1 from "ChatMessages" m where m."ThreadId"=t."Id" and m."Body" like 'hello pre-bootstrap %')`,
    );
    const ids = old ? old.split("\n").filter(Boolean) : [];
    if (ids.length > 0) {
      const list = ids.map((i) => `'${i}'`).join(",");
      sql(`delete from "ChatAttachments" where "ThreadId" in (${list})`);
      sql(`delete from "ChatMessages" where "ThreadId" in (${list})`);
      sql(`delete from "ChatThreadReads" where "ThreadId" in (${list})`);
      sql(`delete from "ChatThreads" where "Id" in (${list})`);
      console.log(`  (cleaned ${ids.length} leftover test thread(s))`);
    }
  }

  // ======================================================================
  // SUB 04 — guest send BEFORE bootstrap: waited for, never dropped.
  // ======================================================================
  console.log("\n== sub 04: pre-bootstrap send (guest, mobile) ==");
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    // Delay the bootstrap POST ~2.5 s so the send can be issued while the
    // thread still does not exist.
    await page.route("**/chat/visitor", async (route) => {
      const response = await route.fetch();
      await sleep(2500);
      await route.fulfill({ response });
    });
    const bootstrapPosts = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/chat/visitor")) {
        bootstrapPosts.push(r.url());
      }
    });

    g1Ts = Date.now();
    const guestSend = `hello pre-bootstrap ${g1Ts}`;
    await page.goto(`${BASE}/en/chat`, { waitUntil: "domcontentloaded" });
    const textarea = page.locator('[data-chat-part="bottom"] textarea');
    await textarea.waitFor({ timeout: 30_000 });
    // The bootstrap is still in flight (the route delay) — send NOW.
    await textarea.fill(guestSend);
    await textarea.press("Enter");

    // Let the delayed bootstrap land, the wait resolve, and the send flush.
    await page
      .locator('[data-chat-part="thread"]')
      .getByText(guestSend, { exact: true })
      .waitFor({ timeout: 30_000 });
    check("S4a pre-bootstrap send delivered (not dropped)", true);
    await sleep(500);
    check(
      "S4b exactly ONE bootstrap POST per mount (in-flight dedupe)",
      bootstrapPosts.length === 1,
      `posts=${bootstrapPosts.length}`,
    );
    check(
      "S4b2 no uncaught page errors",
      pageErrors.length === 0,
      pageErrors.join(" | ").slice(0, 200),
    );

    // Server-side: the message survives a reload (a settled second
    // bootstrap returns the SAME thread with the message).
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .locator('[data-chat-part="thread"]')
      .getByText(guestSend, { exact: true })
      .waitFor({ timeout: 30_000 });
    check("S4c message survives reload (server-side)", true);

    const guestId = await page.evaluate(() => localStorage.getItem("hc.guestId"));
    g1Thread = sql(
      `select "Id" from "ChatThreads" where "Kind"='visitor' and "GuestId"='${guestId}' limit 1`,
    );
    check("S4d guest thread exists in DB", g1Thread.length === 32, g1Thread);
    await page.screenshot({ path: `${OUT}/04-prebootstrap-send-mobile.png` });
    console.log(`  (G1 thread=${g1Thread} guest=${guestId})`);

    pageG1 = page;
  }

  // ======================================================================
  // SUB 01 — attachment renders through fileSrc(): absolute URL, loads.
  // ======================================================================
  console.log("\n== sub 01: attachment URL (guest, mobile) ==");
  {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const name = "hadi-att-test.png";

    const fileInput = pageG1.locator('[data-chat-part="bottom"] input[type="file"]');
    // Buffer form (not a disk path): this snap-Chromium sandbox reports
    // size 0 for path-set files, which the upload filter (size > 0) drops.
    await fileInput.setInputFiles({ name, mimeType: "image/png", buffer: png });
    await pageG1
      .locator('[data-chat-part="bottom"]')
      .getByText(name, { exact: true })
      .waitFor({ timeout: 10_000 });
    const imgResP = pageG1.waitForResponse(
      (r) => r.url().includes("/files/chat/") && r.request().method() === "GET",
    );
    await pageG1.locator('[data-chat-part="bottom"] textarea').press("Enter");
    const img = pageG1.locator(`[data-chat-part="thread"] img[alt="${name}"]`);
    await img.waitFor({ timeout: 30_000 });
    const src = await img.getAttribute("src");
    check(
      "S1a attachment img src is an ABSOLUTE API URL",
      !!src && /^https?:\/\//.test(src),
      String(src),
    );
    check(
      "S1b attachment src points at the chat file endpoint",
      !!src && src.includes("/files/chat/"),
      String(src),
    );
    const naturalWidth = await img.evaluate((el) => el.naturalWidth);
    check(
      "S1c attachment image actually loaded (no 404)",
      naturalWidth > 0,
      `naturalWidth=${naturalWidth}`,
    );
    const fileRes = await imgResP;
    check(
      "S1d chat file endpoint answered 200",
      fileRes.status() === 200,
      `status=${fileRes.status()}`,
    );
    await pageG1.screenshot({ path: `${OUT}/01-attachment-mobile-light.png` });

    // Dark-mode look of the same thread.
    await pageG1.emulateMedia({ colorScheme: "dark" });
    await sleep(600);
    await pageG1.screenshot({ path: `${OUT}/01-attachment-mobile-dark.png` });
    await pageG1.emulateMedia({ colorScheme: "light" });
  }

  // ======================================================================
  // SUB 02 — staff: claim-on-open, first-wins race, auto-open, admin.
  // ======================================================================
  console.log("\n== sub 02: staff unclaimed thread access ==");
  const ts = Date.now();
  const emp1Email = `claim1-${ts}@example.com`;
  // Re-locate G1's row: the preview carries this run's unique timestamp.
  const g1CardByPreview = (p) =>
    p.locator("article", { hasText: `hello pre-bootstrap ${g1Ts}` });
  const emp2Email = `claim2-${ts}@example.com`;
  const adminEmail = `claimadmin-${ts}@example.com`;

  const ctxE1 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  });
  const ctxE2 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  });
  const ctxA = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  });
  const e1 = await ctxE1.newPage();
  const e2 = await ctxE2.newPage();
  const adm = await ctxA.newPage();

  check("S2a register EMP1", (await registerIn(ctxE1, emp1Email, "Staff Uno")) === 200);
  check("S2b register EMP2", (await registerIn(ctxE2, emp2Email, "Staff Dos")) === 200);
  check("S2c register ADMIN", (await registerIn(ctxA, adminEmail, "Boss Admin")) === 200);
  promote(emp1Email, { employee: true });
  promote(emp2Email, { employee: true });
  promote(adminEmail, { admin: true });
  const emp1Id = sql(`select "Id" from "AspNetUsers" where "Email"='${emp1Email}'`);
  const emp2Id = sql(`select "Id" from "AspNetUsers" where "Email"='${emp2Email}'`);

  // --- EMP1 opens G1's UNCLAIMED thread from the staff inbox: claim-first.
  await e1.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  const g1Card = g1CardByPreview(e1);
  check("S2d G1 row visible in the staff inbox", (await g1Card.count()) === 1);
  await g1Card.getByRole("button", { name: "Open chat" }).click();
  await e1.waitForURL(/thread=/, { timeout: 15_000 });
  const e1ThreadId = new URL(e1.url()).searchParams.get("thread");
  check("S2e EMP1 landed on /chat?thread=<G1>", e1ThreadId === g1Thread, e1.url());
  await e1
    .locator('[data-chat-part="thread"]')
    .getByText(`hello pre-bootstrap ${g1Ts}`, { exact: true })
    .waitFor({ timeout: 15_000 });
  check("S2f thread opened for EMP1 with its messages (no 403)", true);
  const g1Assignee = sql(
    `select "AssignedEmployeeId" from "ChatThreads" where "Id"='${g1Thread}'`,
  );
  check(
    "S2g G1 now assigned to EMP1 (claimed on open)",
    g1Assignee === emp1Id,
    `assignee=${g1Assignee} emp1=${emp1Id}`,
  );
  await e1.screenshot({ path: `${OUT}/02-emp1-opened-thread.png` });

  // The inbox row now shows the assignee badge and no Claim button.
  await e1.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  const g1CardAfter = g1CardByPreview(e1);
  const g1CardText = (await g1CardAfter.first().innerText().catch(() => "")) ?? "";
  check(
    "S2h inbox row shows the assignee badge, Claim button gone",
    g1CardText.includes("Staff Uno") && !g1CardText.includes("Claim"),
    g1CardText.replace(/\n/g, " | ").slice(0, 140),
  );

  // --- First-wins race: EMP1 + EMP2 claim G2's fresh unclaimed thread.
  const g2Guest = randomUUID();
  const g2 = await guestBootstrap(g2Guest);
  check("S2i G2 bootstrap (race fixture)", g2.status === 200, `status=${g2.status}`);
  const g2Thread = g2.data?.thread?.id ?? "";
  // e2 has never navigated (about:blank → Origin: null → CORS preflight
  // fails): give it a real app origin first.
  await e2.goto(`${BASE}/en/staff/chat`, { waitUntil: "networkidle" });
  const [r1, r2] = await Promise.all([
    apiInPage(e1, `/chat/threads/${g2Thread}/claim`, { method: "POST" }),
    apiInPage(e2, `/chat/threads/${g2Thread}/claim`, { method: "POST" }),
  ]);
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  check(
    "S2j concurrent double claim → one 200 + one 409",
    statuses[0] === 200 && statuses[1] === 409,
    `statuses=${statuses}`,
  );
  const winnerId = sql(
    `select "AssignedEmployeeId" from "ChatThreads" where "Id"='${g2Thread}'`,
  );
  check(
    "S2k exactly one winner recorded",
    winnerId === emp1Id || winnerId === emp2Id,
    winnerId,
  );
  const loserResp = r1.status === 409 ? r1 : r2;
  check(
    "S2l 409 message names the other claimant",
    /just claimed by/i.test(String(loserResp.data?.message ?? "")),
    String(loserResp.data?.message),
  );

  // --- Auto-open: the UNASSIGNED employee must NOT be auto-opened into an
  // unclaimed thread; the assignee IS (their own latest open thread).
  const loser = winnerId === emp1Id ? e2 : e1;
  const winnerPage = winnerId === emp1Id ? e1 : e2;
  await loser.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await sleep(3000); // let the list load + any (wrong) auto-open happen
  check(
    "S2m auto-open SKIPS unclaimed threads for a plain employee",
    !loser.url().includes("thread="),
    loser.url(),
  );
  await winnerPage.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
  await winnerPage.waitForURL(/thread=/, { timeout: 15_000 });
  check(
    "S2n auto-open DOES open the employee's own claimed thread (G2)",
    winnerPage.url().includes(`?thread=${g2Thread}`),
    winnerPage.url(),
  );

  // --- Admin opens a fresh unclaimed thread directly: access, no claim.
  const g3Guest = randomUUID();
  const g3 = await guestBootstrap(g3Guest);
  check("S2o G3 bootstrap (admin fixture)", g3.status === 200, `status=${g3.status}`);
  const g3Thread = g3.data?.thread?.id ?? "";
  await adm.goto(`${BASE}/en/chat?thread=${g3Thread}`, { waitUntil: "networkidle" });
  await adm.locator('[data-chat-part="thread"]').waitFor({ timeout: 15_000 });
  await sleep(1500); // let any (wrong) error alert settle in
  const admAlerts = await adm
    .locator('[role="alert"]', { hasText: /do not have access/i })
    .count();
  check("S2p admin opens unclaimed thread — NO 403", admAlerts === 0);
  const g3Assignee = sql(
    `select coalesce("AssignedEmployeeId",'') from "ChatThreads" where "Id"='${g3Thread}'`,
  );
  check(
    "S2q admin open did NOT claim the thread (still unassigned)",
    g3Assignee === "",
    `assignee='${g3Assignee}'`,
  );
  await adm.screenshot({ path: `${OUT}/02-admin-unclaimed-thread.png` });

  // ======================================================================
  // SUB 04 — user mode with no thread open: composer disabled.
  // ======================================================================
  console.log("\n== sub 04: user-mode composer without a thread ==");
  {
    const custEmail = `nocust-${ts}@example.com`;
    const ctxC = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "light",
    });
    const cpage = await ctxC.newPage();
    check(
      "S4e register customer (no threads)",
      (await registerIn(ctxC, custEmail, "No Threads")) === 200,
    );
    await cpage.goto(`${BASE}/en/chat`, { waitUntil: "networkidle" });
    const cta = cpage.locator('[data-chat-part="bottom"] textarea');
    await cta.waitFor({ timeout: 15_000 });
    await sleep(2000); // no auto-open is possible (no threads)
    check(
      "S4f no thread auto-opened for a thread-less customer",
      !cpage.url().includes("thread="),
      cpage.url(),
    );
    check("S4g composer textarea disabled without a thread", await cta.isDisabled());
    const sendBtn = cpage.locator('[data-chat-part="bottom"] button[type="submit"]');
    check("S4h send button disabled without a thread", await sendBtn.isDisabled());
    await cpage.screenshot({ path: `${OUT}/04-composer-disabled-desktop.png` });

    // ...and re-enabled once a conversation opens.
    const newBtn = cpage.locator(
      '[data-chat-part="list"] button[aria-label="New conversation"]',
    );
    await newBtn.click();
    await cpage.waitForURL(/thread=/, { timeout: 15_000 });
    check("S4i composer re-enabled once a thread opens", !(await cta.isDisabled()));
  }

  // ======================================================================
  // SUB 03 — hiring detail dialog: 80dvh cap, scrollable body, pinned
  // footer. Seeded with a long previous-work text to force overflow.
  // ======================================================================
  console.log("\n== sub 03: hiring dialog overflow ==");
  const seedId = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  const longWork = ("Knitting and crocheting bags since 2015. ".repeat(40)).trim();
  sql(
    `insert into "HiringApplications" ("Id","Name","Email","NormalizedEmail","Phone","Country","Nationality","Languages","PreviousWork","Message","Status","AppliedAt","UpdatedAt") values ` +
      `('${seedId}','Overflow Tester','overflow@example.com','OVERFLOW@EXAMPLE.COM','12345','Testland','Tester',ARRAY['English','Arabic'],'${longWork.replace(/'/g, "''")}','Please review my (deliberately long) application.','new',now(),now())`,
  );
  try {
    const viewDialog = async (page, width, height, scheme, shot) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${BASE}/en/admin/hiring`, { waitUntil: "networkidle" });
      const reviewBtn = page.getByRole("button", { name: "Review" }).first();
      await reviewBtn.waitFor({ timeout: 20_000 });
      await reviewBtn.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 10_000 });
      await page
        .getByRole("button", { name: "Accept" })
        .waitFor({ timeout: 10_000 }); // detail loaded (footer appears)
      const box = await dialog.boundingBox();
      check(
        `S3-${shot} dialog height ≤ 80dvh`,
        box.height <= 0.8 * height + 2,
        `h=${Math.round(box.height)} cap=${Math.round(0.8 * height)}`,
      );
      const scrollDiv = dialog.locator("div.overflow-y-auto").first();
      const dims = await scrollDiv.evaluate((el) => ({
        sh: el.scrollHeight,
        ch: el.clientHeight,
      }));
      check(
        `S3-${shot} body scrolls (content overflows the cap)`,
        dims.sh > dims.ch + 10,
        `scrollHeight=${dims.sh} clientHeight=${dims.ch}`,
      );
      const accept = page.getByRole("button", { name: "Accept" });
      const aBox = await accept.boundingBox();
      check(
        `S3-${shot} footer pinned & visible WITHOUT scrolling`,
        (await accept.isVisible()) && aBox.y + aBox.height <= height + 2,
        `footerBottom=${Math.round(aBox.y + aBox.height)} viewport=${height}`,
      );
      await page.screenshot({ path: `${OUT}/03-hiring-dialog-${shot}.png` });
    };

    await viewDialog(adm, 1280, 800, "light", "desktop-light");
    await viewDialog(adm, 1280, 800, "dark", "desktop-dark");
    await viewDialog(adm, 390, 844, "light", "mobile-light");
    await viewDialog(adm, 390, 844, "dark", "mobile-dark");
  } finally {
    sql(`delete from "HiringApplications" where "Id"='${seedId}'`);
  }
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
