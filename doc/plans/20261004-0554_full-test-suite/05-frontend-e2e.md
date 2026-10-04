# 05 — Frontend e2e smoke (Playwright, opt-in)

status: done
parent: 20261004-0554_full-test-suite

## Why opt-in

`pnpm test` must stay green on a bare clone (unit tests only). E2E needs the
live dev stack (API :8085 + Next :3000 + Postgres) — exactly what
`dotnet run --project src/Hanadicrochet.AppHost` provides. The repo already
uses `playwright-core` (dev scripts `scripts/*.mjs`) — same style.

## Harness

- `frontend/scripts/e2e/smoke.mjs` (new `e2e/` dir) + `pnpm e2e` script:
  - Launch Chromium via `playwright-core` with `executablePath`
    (`E2E_CHROMIUM`, else `/snap/bin/chromium`, else auto-detect),
    `--no-sandbox` (snap builds).
- **One `BrowserContext` per matrix cell** (fresh storage state each):
  - viewports: mobile `390×844` + desktop `1280×800`.
  - themes: light + dark (set `theme` in `localStorage` **before** page load —
    next-themes).
  - locales: `en` (default; ar RTL check is a plan-03 concern, smoke only).
- `BASE_URL` env (default `http://localhost:3000`), API
  `NEXT_PUBLIC_API_URL` not needed (browser uses the app's own config).
- Each scenario: named step checks like the 2337 verify script
  (pass/fail lines, screenshots on failure), non-zero exit on any failure.

## Scenarios (smoke, ~10–15 min of user journeys)

1. **Home loads** — `/` renders brand header + works grid (≥ 1 work card);
   no console errors. (both viewports × both themes)
2. **Work → detail** — click a work card → detail page shows price +
   CTA (buy/custom); back works. (mobile)
3. **Guest chat** — `/chat` page (chat is a page, not a floating widget —
   owner decision 2026-09-26) → send a message (guest bootstrap) → message
   visible in thread; attachment (tiny PNG) upload → chip → send → image
   renders with an absolute API URL src (regression: 2337 sub-01).
   (mobile, light+dark)
4. **Register → account** — `/register` → fill → login → `/account` shows
   profile; logout → back to public. (mobile)
5. **Guest order → confirm login gate** — create a custom order as guest
   (with a sample image upload) → success dialog; then `/orders` shows the
   sign-in gate. (mobile) — the deepest smoke: proves the
   anonymous→order→login pipeline end-to-end.

Scenario 5 may need a seeded product (catalog) — the Aspire dev DB has the
CatalogSeeder catalog, so no seeding in-script; if the stack DB is empty,
the scenario prints SKIP and the run still passes (smoke, not integration).

## DoD

- `pnpm e2e` green against the live Aspire stack (documented command in
  `frontend/README`? no — plan file + sub-plan notes; README unchanged).
- Screenshots on failure; exit code 1 on any failure.
- `pnpm typecheck`/`lint` unaffected (scripts/ is already in the lint scope —
  keep zero warnings).

## Result

`pnpm e2e` (→ `scripts/e2e/smoke.mjs`) — 37 checks across matrix cells
A (mobile/light, full), B (mobile/dark, home+chat), C (desktop/light,
home+detail), D (desktop/dark, home), E (mobile/light, guest order):

1. Home (both viewports × both themes): brand header, works grid ≥ 1 card,
   no console errors / no 5xx.
2. Work → detail: price + "Order in chat" CTA (it is a `<Link>`, not a
   button), back to home.
3. Guest chat: bootstrap → composer ready, text send, attachment send
   (real PNG bytes → chip → send → image in thread), src is an absolute API
   URL (2337 sub-01 regression) and actually loads (no 404).
4. Register → `/account` greeting → sign out → gate.
5. Guest custom order with sample photo → success dialog → `/orders`
   sign-in gate.

Failures print a screenshot path (`/tmp/hanadicrochet-e2e-shots/…`) and, for
the two submit paths (3.4, 5.1), the console/response trail + any `[role=alert]`.

### Bug found by the smoke (fixed in-plan, same precedent as 02/04)

**Signed-URL query mangled by `fileSrc`** — the sub-plan 04 subpath fix
joined API paths via `url.pathname = base + path`. A path that carries a
query (chat attachment signed URLs: `/files/chat/…/file.png?sig=…&exp=…`)
gets its `?` **percent-encoded into the path** (`file.png%3Fsig=…`) —
Chromium then requests a file that does not exist → every chat image 404'd.
Both implementations (`catalog/display.ts`, `api/client.ts`) now split the
query off before the pathname join and set it via `url.search`. Pinned by
a `fileSrc` case in `catalog/display.test.ts` (frontend suite: 62 → 63).

### Environment quirks handled in the harness (no app changes)

- **Chromium h2 "prior knowledge" vs HTTP/1.1-only dev API**: the first
  browser request on a fresh connection to `localhost:8085` (cleartext,
  non-standard port) can be dropped with `net::ERR_ALPN_NEGOTIATION_FAILED`.
  The harness warms the connection with a couple of no-op `fetch(health)`
  calls before each cell; if a 5xx still hits a scenario it is reported as
  a console error, not silently.
- **Guest submit budget is 5/min per IP** (`Program.cs`, plan 05/12):
  back-to-back `pnpm e2e` runs share it (A+B chat bootstrap + E order POST).
  The order submit and the chat bootstrap wait out the window (61 s) and
  retry once instead of failing.
- **Playwright file inputs**: `setInputFiles`/filechooser set no files on the
  app's `sr-only` inputs in this Chromium build (events fire, `files` stays
  empty). The harness builds a real `File` from bytes in-page (DataTransfer)
  and dispatches the real `change` event — the full React path from "file
  picked" on (chip, upload on send, magic-byte check server-side).
- **Expected anonymous 401s** (`/identity/me`, `/chat/threads`) are noise
  for the console check; only genuine page errors / 5xx fail a cell.

Verified against the live Aspire dev stack (Next :3000 + API :8085 +
Postgres): repeated green runs incl. the shared-window 429 retry path;
`pnpm typecheck` / `pnpm lint` zero findings.
