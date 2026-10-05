# Test-coverage completion (backend + frontend)

status: in-progress
created: 2026-10-05 13:48 (+03)
owner: agent (user request: "make sure all app is fully test covered")

## Source

User request 2026-10-05: "please make sure all app is fully test covered".
The suite from plan 20261004-0554 exists and is green (208 backend / 63
frontend tests), but a coverage audit (coverlet + @vitest/coverage-v8,
2026-10-05) shows large holes:

**Backend (coverlet, per source file, excl. migrations/Program/generated):**
- 79.4% overall (5582/7034 lines).
- **0%:** `QuerySpec/FilterParser.cs` (221 lines!), `QuerySpec/FilterAst.cs`,
  `QuerySpec/LikeExpressions.cs`, `Data/ConfigurationLoader.cs` (design-time),
  `Data/DesignTimeDbContextFactory.cs` (design-time).
- **< 60%:** `Hubs/ChatHub.cs` 2%, `ChatSweepService` 25%, `OrderSweepService`
  27%, `ProductQueryBinders` 32%, `QueryBinder` 33%, `AdminSeeder` 48%,
  `OrderQueryBinders` 49%, `ProductImages` 57%, `StaffCustomerEndpoints` 59%,
  `OrderListing` 61%.
- **60–90%:** `ProductAdministrationService` 66%, `ProductListing` 69%,
  `ChatService` 78%, `UserAdministrationService` 80%, `QuerySpec(QueryOptions)`
  81%, `HiringService` 81%, `OrderEndpoints` 85%, `Helpers` 85%,
  `StaffProductEndpoints` 85%, `IdentityEndpoints` 87%, `ChatEndpoints` 88%,
  `FileEndpoints` 92%.

**Frontend (vitest v8, hand-written code only — generated SDK excluded):**
- 38% overall, but only for files the tests import. **No test imports any
  component, page, or these lib modules at all:** `api/client.ts` (309 lines,
  5% via display tests), `orders/api.ts`, `staff/api.ts`, `chat/products.ts`,
  `catalog/server.ts`, `hooks/use-me.ts`, `sample-works.ts`, `utils.ts`.
- Partial: `api/errors.ts` 59%, `catalog/query.ts` 55%, `chat/api.ts` 38%,
  `chat/use-chat.ts` 78%.
- All ~40 hand-written components in `src/components/**` (except ui/ and
  illustrations/) are untested in unit tests; page flows are covered only by
  the opt-in Playwright smoke.

## Sub-plans

| # | Scope | File | Status |
|---|-------|------|--------|
| 01 | Backend QuerySpec unit tests (FilterParser/QueryBinder/LikeExpressions/QueryOptions) | 01-backend-queryspec.md | done |
| 02 | Backend hub + sweep services (ChatHub, ChatSweep, OrderSweep) | 02-backend-hub-sweeps.md | proposed |
| 03 | Backend files & admin (ProductImages, AdminSeeder, StaffCustomerEndpoints, FileEndpoints) | 03-backend-files-admin.md | proposed |
| 04 | Backend remainder to ≥90% per file (ChatService, ProductAdminService, UserAdminService, HiringService, listings/bindners, endpoint error paths) | 04-backend-remainder.md | proposed |
| 05 | Frontend lib modules → 100% lines (client, errors, orders/api, staff/api, chat/*, catalog/*, hooks, sample-works, utils) | 05-frontend-lib.md | proposed |
| 06 | Frontend components → every hand-written component tested | 06-frontend-components.md | proposed |
| 07 | Coverage gate + docs (thresholds, commands, exception list) | 07-coverage-gate.md | proposed |

## Decisions

- **Target = "fully covered" defined as:** every hand-written source file at
  **≥ 90% line coverage**, and **100% for pure logic** (parsers, mappers,
  formatters, id generators) — with an explicit documented exception list
  (below). Branch coverage is a secondary signal, not a hard gate (a 95-branch
  file can hit 100% lines on a 90%-branch path; the point of this plan is to
  exercise every behavior, not hit a number).
- **Backend tooling:** `coverlet.collector` + `coverlet.msbuild` (test-only
  packages, added to the test csproj — the whole point of this plan is
  coverage, so the collector is justified tooling, not scope creep). Report
  via `dotnet test --collect:"XPlat Code Coverage"`.
- **Frontend tooling:** `@vitest/coverage-v8` (devDependency). Report via
  `pnpm coverage` (new script → `vitest run --coverage`). Generated SDK
  (`src/lib/api/generated/**`) is excluded from coverage — it is regenerated
  by `pnpm gen:api` and testing generated code is an anti-pattern.
- **ChatHub is tested through a real SignalR hub client** over
  `WebApplicationFactory` (anonymous + cookie + `access_token` query paths),
  not by instantiating the hub with a fake context.
- **Sweep services:** `RunOnceAsync` is private; tests invoke it via
  reflection and assert real side effects on the test DB (a stale visitor
  thread gets closed, orphan attachments purged, stale guest order
  auto-cancelled). The 15–20 s startup delay + 24 h interval keep them out of
  the normal test window, so no flakiness.
- **Frontend components:** Testing Library on jsdom (already set up).
  Purely presentational SVG illustrations and `src/components/ui/*` (shadcn
  passthroughs) are the documented exception; pages are covered by the
  opt-in e2e smoke (Next.js server components are not unit-testable in jsdom
  — see next docs on testing strategies).
- **No app-behavior changes** — tests + test tooling + coverage config only.
  If a test exposes a real bug: fix only if trivial and behavior-preserving
  for existing tests (same precedent as 20261004-0554); otherwise new plan.
  Two such bugs were found in sub-plan 01 (both fixed in-plan, both with all
  pre-existing 208 tests staying green): FilterParser's `^`-anchored date
  regex broke every non-first-token date literal; QueryBinder turned
  `nonNullableField eq null` into a 500 instead of a 400. See 01's Result.
- **Design-time code** (`DesignTimeDbContextFactory`, `ConfigurationLoader`)
  is an exception: it only runs under the EF CLI (`dotnet ef migrations`),
  never in-process; its behavior is exercised every time a migration is
  generated.
- **Program.cs** is covered structurally by every `WebApplicationFactory`
  test (the real host starts); no dedicated tests.
- **Concurrent-work safety:** an unrelated in-progress plan
  (20261004-1823 deploy pipeline) left a TEMPORARY drill file
  `tests/Hanadicrochet.Api.Tests/PipelineDrillTempFail.cs` that intentionally
  breaks the build ("Delete me"). It is not part of this plan and is not
  committed by it; local test runs temporarily move it aside and restore it.

## Exceptions (documented, permanent)

- `src/Hanadicrochet.Api/Migrations/**` — generated (EF Core).
- `src/Hanadicrochet.Api/Data/DesignTimeDbContextFactory.cs` +
  `Data/ConfigurationLoader.cs` — EF-CLI design-time only.
- `src/Hanadicrochet.ServiceDefaults/**`, `src/Hanadicrochet.AppHost/**` —
  dev-only orchestration/defaults (precedent: plan 20261004-0554 out-of-scope).
- `frontend/src/lib/api/generated/**` — generated SDK.
- `frontend/src/app/**` pages — covered by the opt-in Playwright smoke
  (sub-plan 05 of 20261004-0554); Next.js server components are not
  unit-testable in jsdom.
- `frontend/src/components/ui/**` — shadcn/ui generated passthroughs.
- `frontend/src/components/illustrations/**` — pure decorative SVG, no logic
  (brand decoration, plan 11).
- `frontend/src/i18n/**` — next-intl wiring (routing/request config), exercised
  by every page render in e2e.

## Definition of done

1. `dotnet build` → 0 warnings; `dotnet test` → green (208+ tests).
2. Backend coverage report: every file in the table above ≥ 90% lines
   (pure-logic files 100%) or on the exception list.
3. `pnpm typecheck` · `pnpm lint` · `pnpm test` → green.
4. Frontend coverage report: every hand-written `src/lib` file at 100% lines;
   every hand-written component in `src/components/**` (except exceptions)
   covered; thresholds enforced in vitest config.
5. Plan files updated · `COMMITS.md` appended · clean commit(s).
