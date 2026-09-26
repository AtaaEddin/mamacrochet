# 02 — Repo Scaffold (Aspire 13 + .NET 10 + Next.js 16)

status: proposed
parent: main.md

## Goal

A runnable local skeleton: one command starts Postgres + API + Web via Aspire;
migrations work; build is warning-free (warnings = errors); strict TS verified.

## Layout

```
Mamacrochet.sln
src/
  Mamacrochet.AppHost/     # Aspire 13 AppHost (dev only)
  Mamacrochet.Api/         # ASP.NET Core Web API + SignalR + EF Core (Npgsql)
frontend/                  # Next.js 16 (App Router, src/ dir, Tailwind v4, shadcn/ui)
  tsconfig.json            # extends ../tsconfig.json
deploy/                    # (plan 10) docker-compose, Caddyfile
scripts/                   # (plan 10) deploy.sh, backup.sh
```

## Decisions

- Solution at repo root; .NET projects under `src/`; Next.js under `frontend/`
  (separate from the solution; Aspire 13 runs it as a JS/Node resource in dev).
- AppHost resources: `Postgres` (Aspire Postgres resource), `Api` (project reference),
  `Web` (frontend dev server as an executable/node resource).
- EF Core 10 + Npgsql; migrations live in `Mamacrochet.Api`; dashboard health checks for
  Postgres + Api.
- pnpm as package manager; ESLint (Next.js flat config) + Prettier; `pnpm typecheck`,
  `pnpm lint`, `pnpm test` scripts; lint must run with zero-warning tolerance in CI/scripts.
- shadcn/ui initialized in `frontend/` (design tokens, base components, light/dark CSS vars).
- Health endpoint `GET /health` (api) for container readiness.
- Env config: AppHost passes connection strings in dev; frontend reads `NEXT_PUBLIC_API_URL`.

## Tasks

- [ ] `dotnet new sln` + Aspire 13 templates (AppHost + Api, net10.0); verify
      `dotnet run --project src/Mamacrochet.AppHost` opens the dashboard
- [ ] Postgres resource + EF Core DbContext + first migration (empty context ok)
- [ ] `create-next-app` for Next 16: TS, Tailwind v4, App Router, `src/` dir, pnpm, ESLint
- [ ] `frontend/tsconfig.json` extends root `../tsconfig.json` (strict stays on)
- [ ] shadcn init + one base page using tokens (bg-background, text-foreground, dark variant)
- [ ] Wire frontend → api (env var, one fetch to `/health` shown on the page)
- [ ] Verify: `dotnet build` 0 warnings, `pnpm typecheck` + `pnpm lint` clean,
      browser shows hello page with live health status

## Acceptance

- Fresh clone → `.NET 10 SDK` + `Node 22+` + `pnpm` → Aspire start → dashboard shows
  Postgres/Api/Web healthy; hello page loads; all checks green.
