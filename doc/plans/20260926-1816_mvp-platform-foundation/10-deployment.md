# 10 — Deployment (Self-hosted, Low Power)

status: proposed
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

- [ ] Dockerfiles: api (multi-stage .NET 10, small final image), web (Next standalone)
- [ ] docker-compose.yml (healthchecks, restart policies, volumes, resource limits)
- [ ] Caddyfile (http→https auto, proxy /api + / to respective containers, websocket upgrade for SignalR)
- [ ] Migrations-on-startup guard in api (idempotent, single instance)
- [ ] deploy.sh + backup.sh + restore.md + .env.example
- [ ] Smoke test on Pi-class hardware (or QEMU ARM64): fresh install → deploy.sh →
      full user flow works over HTTPS (or local HTTP)

## Acceptance

- Fresh machine with Docker installed → `./deploy.sh` → site reachable, all healthchecks
  green, chat realtime works through Caddy, backup script produces a restorable dump.
- `docker compose ps` shows exactly the 4 containers; memory footprint within budget.
