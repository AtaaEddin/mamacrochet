---
description: Walk through the mamacrochet production deployment checklist
argument-hint: "[target: pi|pc]"
---
Run the deployment checklist for ${1:-pi} (see the deployment skill and plan 10).

1. Pre-flight: branch state, `dotnet build` 0 warnings, `pnpm typecheck` + `pnpm lint`
   green, no secrets/env files in the commit.
2. Build: api (multi-stage .NET 10), web (Next.js standalone), postgres 16-alpine,
   caddy 2. Check final image sizes (keep small).
3. Host: `docker compose -f deploy/docker-compose.yml up -d` → exactly 4 containers,
   all healthy; migrations applied on startup.
4. Smoke: https (or http) up, health endpoint ok, catalog renders, chat widget
   connects through Caddy (WebSocket upgrade), login works, one upload stored in
   ./data/uploads.
5. Backups: run deploy/backup.sh, verify a dump + uploads tar appear, check retention.
6. Report: container list + sizes, health results, anything off.
