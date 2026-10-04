# 05 — Frontend e2e smoke (Playwright, opt-in)

status: proposed
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
3. **Guest chat** — home → floating chat button → panel opens → send a
   message (guest bootstrap) → message visible in thread; attachment
   (tiny PNG) upload → chip → send → image renders with an absolute API URL
   src (regression: 2337 sub-01). (mobile, light+dark)
4. **Register → account** — `/register` → fill → login → `/account` shows
   profile; logout → back to public. (mobile)
5. **Guest order → confirm login gate** — create a custom order as guest
   (with a sample image upload) → order created (visible after login link);
   the account gate is present. (mobile) — the deepest smoke: proves the
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
