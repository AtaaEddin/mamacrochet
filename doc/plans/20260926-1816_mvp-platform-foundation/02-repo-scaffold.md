# 02 — Repo Scaffold (Aspire 13 + .NET 10 + Next.js 16)

status: done
parent: main.md

## Goal

A runnable local skeleton: one command starts Postgres + API + Web via Aspire;
migrations work; build is warning-free (warnings = errors); strict TS verified.

## Layout

``` (actual, 2026-09-26)
Mamacrochet.slnx           # .NET 10 XML solution format (dotnet new default)
src/
  Mamacrochet.AppHost/     # Aspire 13 AppHost (dev only) — Postgres + Api + Web (full stack)
  Mamacrochet.Api/         # ASP.NET Core Web API + EF Core (Npgsql); SignalR w/ plan 06
  Mamacrochet.ServiceDefaults/  # Aspire service defaults (OTel, health, resilience)
frontend/                  # Next.js 16.3 (App Router, src/ dir, Tailwind v4, shadcn/ui)
  tsconfig.json            # self-contained (Turbopack cannot resolve extends outside app root)
  src/lib/api/             # generated OpenAPI client (pnpm gen:api) + schema
  scripts/gen-api.mjs      # spec -> types (openapi-typescript)
deploy/                    # (plan 10) docker-compose, Caddyfile
```

## Decisions

- Solution at repo root; .NET projects under `src/`; Next.js under `frontend/`
  (separate from the solution; Aspire 13 runs it as a JS/Node resource in dev).
- AppHost resources: `Postgres` + `Api` + `Web` (Next.js via `AddNextJsApp` +
  `WithPnpm`) — the AppHost is the only way to run the dev stack
  (follow-up 2026-09-27, below; `scripts/dev.sh` retired).
- `Mamacrochet.ServiceDefaults` (template `aspire-servicedefaults`): OTel to the
  dashboard, health checks, service discovery, HttpClient resilience.
- OpenAPI: the API serves the spec in dev (`/openapi/v1.json`); the frontend
  client is generated (`pnpm gen:api` → `frontend/src/lib/api/`), committed,
  and typed via `openapi-fetch`.
- EF Core 10 + Npgsql; migrations live in `Mamacrochet.Api`; dashboard health checks for
  Postgres + Api.
- pnpm as package manager; ESLint (Next.js flat config) + Prettier; `pnpm typecheck`,
  `pnpm lint`, `pnpm test` scripts; lint must run with zero-warning tolerance in CI/scripts.
- shadcn/ui initialized in `frontend/` (design tokens, base components, light/dark CSS vars).
- Health endpoint `GET /health` (api) for container readiness.
- Env config: AppHost passes connection strings in dev; frontend reads `NEXT_PUBLIC_API_URL`.

## Tasks

- [x] Solution + Aspire 13 AppHost + Api (net10.0); dashboard verified
- [x] Postgres resource + EF Core DbContext + `InitialCreate` migration (empty model)
- [x] `create-next-app` for Next 16.3: TS, Tailwind v4, App Router, `src/` dir, pnpm, ESLint
- [x] `frontend/tsconfig.json` extends root `../tsconfig.json` (strict stays on)
- [x] shadcn init + scaffold page using tokens, live `/health` widget
- [x] Wire frontend → api (`NEXT_PUBLIC_API_URL`, fetch to `/health` shown on the page)
- [x] Verify: `dotnet build` 0 warnings, `pnpm typecheck` + `pnpm lint` clean, stack runs

## Result (2026-09-26)

- `Mamacrochet.slnx` (XML solution format is the .NET 10 default), projects AppHost + Api.
- **Aspire 13 needs no workload**: AppHost uses `Sdk="Aspire.AppHost.Sdk/13.5.4"`
  (NuGet-based); templates via `dotnet new install Aspire.ProjectTemplates`.
  Verified 13.x API changes: `.WithReference()` (replaces `.Reference()`),
  `WithHttpEndpoint(port:)` + `WithExternalHttpEndpoints()`.
- Postgres container + `mamacrochet` db; EF Core 10 + Npgsql 10.0.3; `dotnet-ef` 10.0.12
  (global tool); `InitialCreate` migration (empty model).
- Next.js 16.3.6 scaffold page shows live API + database health.
- **Fixed dev ports (documented)**: api **8085** (8080 is taken by local llama-server),
  web **3001**.
- Next dev server initially ran via `scripts/dev.sh`, NOT as an AppHost resource:
  DCP's process proxy failed to start it (silent FailedToStart) on the scaffold's
  Aspire version. **Superseded 2026-09-27** (see follow-ups): Aspire 13.5.4's
  `AddNextJsApp` runs it fine, so `scripts/dev.sh` is retired.

## Follow-ups (2026-09-27, owner-directed)

1. **AppHost runs the full dev stack** (postgres + api + web) and wires them
   together: `AddNextJsApp("web", "../../frontend")` + `WithPnpm()` +
   `WithHttpEndpoint(port: 3000, env: "PORT")` + `NEXT_PUBLIC_API_URL` → api
   endpoint; api gets `Cors__Origins` ← web endpoint (browser cross-origin in
   dev). `AddNextJsApp` is experimental in 13.x — `#pragma warning disable
   ASPIREJAVASCRIPT001` scoped to the call (dev-only; prod = compose, plan 10).
   Sources: aspire.dev/integrations/frameworks/javascript; learn.microsoft
   `JavaScriptHostingExtensions`.
2. **ServiceDefaults added** (the standard 3rd project the scaffold had skipped):
   `builder.AddServiceDefaults()` in the API → OTel logs/metrics/traces in the
   Aspire dashboard, service discovery, resilience. Custom JSON `/health` kept
   (frontend/deploy contract); `/alive` mapped for liveness instead of
   `MapDefaultEndpoints()` (it would remap `/health`).
   Source: aspire.dev/get-started/csharp-service-defaults.
3. **OpenAPI typed client pipeline**: .NET 10 exposes `/health`'s response schema
   via an operation transformer (`AddOperationTransformer` +
   `GetOrCreateSchemaAsync` + `AddComponent("ApiHealth")`) — the .NET 10
   replacement for the old `WithResponse<T>` extensions (source: learn.microsoft
   customize-openapi 10.0). `pnpm gen:api` fetches the spec from the running
   stack and writes `src/lib/api/schema.json` + `schema.d.ts` (openapi-typescript
   7.x — default export + `astToString`); `openapi-fetch` 0.17 provides the
   typed client (`src/lib/api/client.ts`); generated files are committed and
   eslint-ignored. Chosen over orval (React Query hooks/MSW — not needed yet,
   SSR friction) and MS typescript-fetch (axios, stale) — sources: openapi-ts
   pages.dev, orval SSR discussion #1057, pkgpulse 2026 comparison.
   First consumer: the footer `ApiStatus` pill.
4. **Verified**: `dotnet build` 0/0; typecheck/lint/build green; visual QA green
   against the Aspire-hosted stack; E2E browser check: footer pill reads
   **"API online"** (browser :3000 → CORS → API :8085 → Postgres, all under
   Aspire). Dev command: `dotnet run --project src/Mamacrochet.AppHost` (web
   :3000, api :8085, dashboard auto).
- CNA-generated `frontend/AGENTS.md` (official Next.js agent guidance) kept.
- Browser-visual check of the health widget: pending next UI session (no browser in
  this agent environment).

## Acceptance

- Fresh clone → `.NET 10 SDK` + `Node 22+` + `pnpm` → Aspire start → dashboard shows
  Postgres/Api/Web healthy; hello page loads; all checks green.
