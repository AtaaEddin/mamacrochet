---
name: deployment
description: hanadicrochet self-hosted deployment — Docker Compose on a Raspberry Pi / old PC (4 containers, low power). Use when touching deploy/, Dockerfiles, docker-compose, Caddyfile, scripts/, or production configuration.
---

# Deployment (hanadicrochet)

## Target

One machine: Raspberry Pi (ARM64) or old PC (x64), Docker, low power
(≤ ~1 GB RAM idle). Everything self-hosted. **Aspire is dev-only and never ships.**

## Production — 4 containers only

| Container | Notes |
|---|---|
| `postgres` | `postgres:16-alpine`, data volume |
| `api` | .NET 10 (multi-stage, distroless/alpine final); applies EF migrations on startup (single instance) |
| `web` | Next.js **standalone** output, `node:22-alpine` |
| `caddy` | reverse proxy; automatic HTTPS (Let's Encrypt) when a domain exists, plain HTTP otherwise; WebSocket upgrade for SignalR |

- No Redis/queues/Elasticsearch. Files = host volume `./data/uploads`.
- Config via `.env` (template `deploy/.env.example`); **no secrets in the repo**.
- Any new service/container requires a plan entry justifying it.

## Scripts & hygiene

- `deploy/deploy.sh` — host-side: compose up -d + healthcheck wait + status print.
- `deploy/backup.sh` — `pg_dump` (gzip) + uploads tar → `./backups/YYYYMMDD/`, keep
  last N; `deploy/restore.md` documents restore.
- Air-gapped Pi path: `docker save`/`load` documented in deploy docs.
- Images: multi-stage, small; keep startup fast.
- After any deploy: `docker compose ps` (exactly 4 healthy) + hit the health endpoint.

## Commands

```bash
docker compose -f deploy/docker-compose.yml up -d   # local prod-parity
./deploy/backup.sh                                  # backup
./deploy/deploy.sh                                  # deploy on the host
```
