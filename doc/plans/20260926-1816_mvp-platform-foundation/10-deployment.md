# 10 — Deployment (Self-hosted, Low Power)

status: in-progress
parent: main.md

## Goal

Everything runs on one machine (Raspberry Pi ARM64 or old PC x64) via Docker,
deployable with one script, with backups.

## Production architecture (4 containers, nothing else)

| Container   | Image basis                | Notes                                        |
|-------------|----------------------------|----------------------------------------------|
| postgres    | `postgres:16-alpine`       | data volume `/var/lib/postgresql/data`       |
| api         | .NET 10 distroless/alpine  | Web API + SignalR; applies EF migrations on startup (single instance) |
| web         | `node:22-alpine`           | Next.js **standalone** output                |
| caddy       | `caddy:2`                  | reverse proxy; automatic HTTPS (Let's Encrypt) when a domain exists, plain HTTP otherwise |

- **Aspire is dev-only** (decision D3) — never part of the production stack.
- File storage: host directory `./data/uploads` (Docker volume) mounted into `api`;
  API serves files (catalog public; receipts/samples auth-protected).
- Config: `.env` (template committed as `.env.example`); no secrets in the repo.
- Postgres: healthcheck + `pg_dump` backup target.
- Power budget (Raspberry Pi): target ≤ ~1 GB RAM idle, modest CPU; no Redis/queues/ES
  (decision D9); keep Next.js bundle lean (plan 02/04 rules).

## Scripts

- `deploy/deploy.sh`: on the host — pull/`docker load` images, `docker compose up -d`,
  wait for healthchecks, print status. (Images built on the dev machine:
  `docker buildx` multi-platform or single-arch to match the host; document `docker save`/`load`
  path for air-gapped Pi.)
- `deploy/backup.sh`: `pg_dump` (gzip) + tar of `./data/uploads` → `./backups/YYYYMMDD/`;
  keep N last; cron example in docs.
- `deploy/restore.md`: restore procedure (db + uploads).
- `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/.env.example`.

## Tasks

- [x] Dockerfiles: api (multi-stage .NET 10, small final image), web (Next standalone)
- [x] docker-compose.yml (healthchecks, restart policies, volumes, resource limits)
- [x] Caddyfile (http→https auto, proxy /api + / to respective containers, websocket upgrade for SignalR)
- [x] Migrations-on-startup guard in api (idempotent, single instance)
- [x] deploy.sh + backup.sh + restore.md + .env.example
- [ ] Smoke test on Pi-class hardware (or QEMU ARM64): fresh install → deploy.sh →
      full user flow works over HTTPS (or local HTTP)
      — **remaining**: x64 passed twice (2026-09-27 initial, 2026-09-28 re-verified on
      current HEAD incl. chat realtime through Caddy + SSR routes — see below);
      ARM64/real-hardware pass still open.

## Acceptance

- Fresh machine with Docker installed → `./deploy.sh` → site reachable, all healthchecks
  green, chat realtime works through Caddy, backup script produces a restorable dump.
- `docker compose ps` shows exactly the 4 containers; memory footprint within budget.

## Done (2026-09-27)

- **Images**: `src/Mamacrochet.Api/Dockerfile` (multi-stage `sdk:10.0` →
  `aspnet:10.0-alpine`, `UseAppHost=false`) and `frontend/Dockerfile` (3-stage
  `node:22-alpine`, corepack-pinned pnpm, Next `output: "standalone"`, static+
  public copied). Both build from the repo-root context; new root `.dockerignore`
  keeps node_modules/.next/bin/obj/env out. All base images are multi-arch.
- **Compose**: exactly 4 services (postgres/api/web/caddy); only caddy publishes
  ports (80 + 443); api/web/postgres reachable from the compose network only;
  healthchecks on all four; `api` gates on a healthy postgres; `restart:
  unless-stopped`; optional `mem_limit` lines for a Pi; data in `./data/`.
- **Caddy**: one site block `{$CADDY_SITE:http://}` — plain HTTP for LAN/IP, or a
  bare domain → automatic Let's Encrypt. `handle /api/*` strips the prefix →
  api:8085 (same-origin for the browser → cookie auth works, no CORS); everything
  else → web:3000. WebSockets need no config (Caddy upgrades automatically).
- **API production fixes (found by the smoke test)**:
  1. `AddExceptionHandler<ApiExceptionHandler>()` ran **after** `builder.Build()`
     → read-only service collection → crash on prod startup (dev never hit the
     branch). Moved before `Build()`; also added `AddProblemDetails()` — .NET 10
     requires it for the parameterless `UseExceptionHandler()` (verified with a
     minimal repro).
  2. `UseForwardedHeaders` (prod only, trusting the 172.16.0.0/12 compose bridge —
     only Caddy can reach the unpublished api port) so client IPs stay correct
     for rate limiting and Secure cookies set behind TLS termination.
  3. Migrations-on-startup guard: `db.Database.Migrate()` before `app.Run()`
     (idempotent; compose gates it on a healthy postgres).
- **Frontend**: `output: "standalone"` in `next.config.ts`; `NEXT_PUBLIC_SITE_URL`
  fallback fixed to `||` (empty build-arg string made `new URL("")` throw during
  prerender) — in `layout.tsx` metadataBase.
- **Scripts**: `deploy.sh` (.env check → load `images/*.tar` or build → up →
  wait-for-healthy → status/URL), `backup.sh` (pg_dump + uploads tar, same-day
  timestamp suffix, keep-last-N), `restore.md`, `.env.example`, `README.md`
  (incl. air-gapped `docker save`/`load` Pi path + cron).
- **Smoke test (x64, 2026-09-27)**: fresh `postgres:16-alpine` → api container
  applied all EF migrations on an empty DB on first boot (10 tables); full
  `docker compose up` → all 4 healthy; through Caddy: `/`→200, `/ar`→200 (RTL
  messages load from the standalone bundle), `/en/works`→200, `/api/health`→
  JSON, `/api/identity/me`→401 typed ApiError, OpenAPI correctly 404 in
  Production. `backup.sh` dump + uploads tar verified; restore of the dump into
  a **fresh** DB: 0 errors, 10 tables. `deploy.sh` run end-to-end: 4/4 healthy,
  URL printed.

## Done (2026-09-28) — x64 re-verification on current HEAD (52fbc2d)

Run from a **clean worktree at HEAD** (main worktree carried plan-07 WIP),
fresh `deploy.sh` on a fresh data dir:

- **Stack**: 4/4 healthy; only Caddy publishes ports; 9/9 EF migrations applied
  on the empty DB (25 tables). The `fail:` DbCommand line in api logs is EF's
  normal first probe on an empty database, not an error.
- **HTTP through Caddy**: `/`→307 `/en`; `/en /ar /tr /en/works`→200 — including
  the **SSR catalog pages** (web→api `API_SERVER_URL` path added in 7a3f1a9
  after the first smoke test, now verified in prod); `/api/health` ok + db
  connected; `/api/identity/me`→401 typed; OpenAPI→404 in prod.
- **Chat realtime through Caddy (acceptance item closed)**: Node
  `@microsoft/signalr@10` with **WebSockets forced** (long-poll fallback
  impossible): guest bootstrap `POST /api/chat/visitor` → two WS connections to
  `/api/hubs/chat` through Caddy (thread token survives the upgrade) →
  `JoinThread` both → `SendMessage` → both clients receive `newMessage`
  realtime → message present in REST history via `X-Chat-Token`. Caddy needed
  no change for WebSockets, as predicted.
- **Backup**: `backup.sh` → plain `pg_dump` 16.15 + uploads tar; **restore into a
  fresh DB: 0 errors, 25/25 tables, 9/9 migrations**.
- **Memory baseline (x64 dev box, shortly after smoke)**: api 124 MiB, web
  61 MiB, postgres 67 MiB, caddy 14 MiB — **~265 MiB total**, well under the
  ~1 GB budget (x64 reference; ARM64 numbers come with the owner's Pi run).

## Open

- ARM64 / real-hardware smoke test (owner, on the Pi or QEMU).
- Pi memory budget check on real hardware (owner's Pi run) — x64 baseline
  recorded 2026-09-28 (~265 MiB total); revisit after plan 07 lands.
