# Full test suite (backend + frontend)

status: in-progress
created: 2026-10-04 05:54 (+03)
owner: agent (user request: "write full test suite")

## Source

User request 2026-10-04: "you need to write full test suite". The AGENTS.md
definition of done demands `dotnet test` and `pnpm test` green, but no tests exist:

- No test project in the solution — `dotnet test` at the root finds nothing.
- `frontend/package.json` has no `test` script, no vitest/playwright config.
- Prior plans explicitly deferred this: 20261003-2337 main.md DoD ("test-project
  verification is a separate plan"), 20261003-1303 notes (browser verification only).

This plan is that separate plan: a full suite for the backend (xUnit +
`WebApplicationFactory` on a real Postgres test database — the API is EF/Npgsql-
backed, so the DB must be real) and the frontend (Vitest unit tests), plus an
opt-in Playwright smoke (e2e) run against the live Aspire dev stack.

## Sub-plans

| # | Scope | File | Status |
|---|-------|------|--------|
| 01 | Backend test harness (project, fixture, test DB, helpers) | 01-backend-test-harness.md | done |
| 02 | Backend domain tests (services: orders, chat, tokens, links, signatures) | 02-backend-domain-tests.md | done |
| 03 | Backend endpoint tests (HTTP: identity, catalog, orders, chat, hiring, admin, files) | 03-backend-endpoint-tests.md | proposed |
| 04 | Frontend unit tests (Vitest + Testing Library) | 04-frontend-unit-tests.md | proposed |
| 05 | Frontend e2e smoke (Playwright-core, opt-in, live dev stack) | 05-frontend-e2e.md | proposed |

## Decisions

- **xUnit v2** + `Microsoft.NET.Test.Sdk` + `Microsoft.AspNetCore.Mvc.Testing`
  (not xUnit v3: v2 is the stable mainstream choice, no analyzer-warning risk
  under `TreatWarningsAsErrors`).
- **Real Postgres, real Program.** One dedicated test database per
  `dotnet test` run (unique name, created + dropped by the fixture), migrated by
  the app's own EF migrations (the Program startup `Migrate()` runs inside
  `WebApplicationFactory<Program>`). Host = the local Postgres that Aspire
  pins (`127.0.0.1:5432`, `postgres/postgres` — see AppHost.cs).
- **The real `Program` under test** (no slice app): real Identity/antiforgery,
  real EF/Npgsql, real SignalR hub registration, real rate-limit middleware
  (with a no-op global limiter in the test host — HTTP 429 is per-IP and not
  unit-testable; the D16 guest caps are asserted at service level instead).
- **One shared serial collection** for the backend (xUnit collections run
  serially; tests isolate via unique GUIDs, not per-test schemas).
- **Guest rate limits are static/in-memory** (`GuestChatRateLimiter`) — endpoint
  tests use a fresh guest id per test so buckets never collide.
- **Frontend:** Vitest + @testing-library/react + jsdom; `pnpm test` =
  `vitest run`. Pure-lib tests first (zero mocks), then hook/component tests
  with module mocks. e2e is a **separate opt-in script** (needs the live stack;
  not part of `pnpm test`) to keep CI/DoD green on a bare clone.
- **No behavior changes**: tests only. If a test exposes a real bug, the fix
  goes to a new plan (AGENTS.md: "never expand silently") — documented in the
  sub-plan + COMMITS note.

## Out of scope

- Test projects for AppHost/ServiceDefaults (dev-only orchestration /
  infrastructure defaults — no behavior to unit-test today).
- Load/performance tests (low-power single-instance target; not requested).
- e2e coverage beyond smoke (full-flow browser verification stays each
  plan's DoD job).

## Definition of done

1. `dotnet build` → 0 warnings (incl. `tests/Hanadicrochet.Api.Tests`).
2. `dotnet test` → green.
3. `pnpm typecheck` · `pnpm lint` · `pnpm test` → green.
4. e2e smoke green against the live dev stack (mobile + desktop, light + dark).
5. Plan file updated (status) · `COMMITS.md` appended · clean commit(s).
