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
  Mamacrochet.AppHost/     # Aspire 13 AppHost (dev only) — Postgres + Api
  Mamacrochet.Api/         # ASP.NET Core Web API + EF Core (Npgsql); SignalR w/ plan 06
frontend/                  # Next.js 16.3 (App Router, src/ dir, Tailwind v4, shadcn/ui)
  tsconfig.json            # extends ../tsconfig.json
scripts/dev.sh             # one-command dev (Aspire + Next dev)
deploy/                    # (plan 10) docker-compose, Caddyfile
```

## Decisions

- Solution at repo root; .NET projects under `src/`; Next.js under `frontend/`
  (separate from the solution; Aspire 13 runs it as a JS/Node resource in dev).
- AppHost resources: `Postgres` (Aspire Postgres resource) + `Api` (project reference).
  The Next dev server runs via `scripts/dev.sh` (pnpm) — see Result note on DCP.
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
- Next dev server runs via `scripts/dev.sh`, NOT as an AppHost resource: DCP's process
  proxy failed to start it in this environment (silent FailedToStart). TODO: re-evaluate
  Aspire 13 first-class Node hosting (`AddNodeApp`) — official Aspire skill added to
  `.agents/skills/aspire` for reference (incl. 13.x breaking changes).
- Verified end-to-end: `./scripts/dev.sh` → api `/health` =
  `{"status":"ok","database":"connected"}`, page renders on :3001.
- CNA-generated `frontend/AGENTS.md` (official Next.js agent guidance) kept.
- Browser-visual check of the health widget: pending next UI session (no browser in
  this agent environment).

## Acceptance

- Fresh clone → `.NET 10 SDK` + `Node 22+` + `pnpm` → Aspire start → dashboard shows
  Postgres/Api/Web healthy; hello page loads; all checks green.
