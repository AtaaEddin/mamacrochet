# Deployment (plan 10)

One machine (Raspberry Pi / old PC) with Docker → the whole platform.
Exactly **4 containers**: `postgres`, `api`, `web`, `caddy`.
**Aspire is dev-only and never ships.** No Redis/queues/ES (decision D9).

```
internet ──► caddy (:80/:443) ──► web (:3000, Next standalone)
                      └────────► api (:8085, /api prefix stripped) ──► postgres
                                     └──► ./data/uploads (host volume)
```

## Files

| File                 | Purpose                                              |
|----------------------|------------------------------------------------------|
| `docker-compose.yml` | the 4 containers: healthchecks, volumes, no public ports except caddy |
| `Caddyfile`          | reverse proxy + TLS; `/api/*` → api, rest → web      |
| `.env.example`       | configuration template (copy to `.env`, gitignored)  |
| `pipeline.sh`        | **preferred** deploy: tests → backup → clean → deploy → clean |
| `docker-compose.test.yml` | ephemeral test stack (test-postgres + api-tests + web-tests) |
| `deploy.sh`          | deploy only (env check → images → up → health) — no tests |
| `backup.sh`          | pg_dump + uploads tar, keeps newest `KEEP_BACKUPS`   |
| `restore.md`         | restore procedure (db + uploads)                     |

Images: `../src/Hanadicrochet.Api/Dockerfile` (multi-stage .NET 10) and
`../frontend/Dockerfile` (Next standalone, `node:22-alpine`). Both build from
the **repo root** context (the `.dockerignore` at the root keeps them small).
All base images are multi-arch — building on the Pi produces ARM64 images.

## Quickstart (fresh machine)

```bash
# 1. Install Docker (engine + compose plugin), clone/copy the repo
# 2. Configure
cd deploy
cp .env.example .env      # set POSTGRES_PASSWORD, CADDY_SITE, MM_SITE_URL
# 3. Deploy
./pipeline.sh             # tests → backup → clean → deploy → clean
```

`pipeline.sh` (or plain `./deploy.sh`) prints the URL.

## Deploy pipeline (`pipeline.sh`, plan 20261004-1823/01)

One command, run **on the target machine**:

1. **Build bases** — `sdk:10.0-noble` + `node:22-alpine` present as tagged images
   (pulled once when missing; they must stay tagged — BuildKit + our
   `builder prune` would otherwise re-fetch them from the registry every run).
2. **Tests** — the API suite (xUnit, in a `dotnet/sdk:10.0` container against an
   ephemeral `postgres:16-alpine`, no volume) + the UI suite (`pnpm test` / Vitest
   in `node:22-alpine`), from `docker-compose.test.yml`. Nothing is installed on
   the host; nothing publishes ports; the test Postgres data dies with `down`.
3. **Backup** — `backup.sh` (skipped when no prod postgres is running yet).
4. **Clean (pre)** — `compose down` + prune stopped containers / unused
   networks. **Volumes are never touched** (postgres data, uploads, Caddy
   TLS).
5. **Deploy** — `deploy.sh` (build → `up -d` → wait for healthy).
6. **Clean (post)** — prune the old release's now-dangling image layers +
   swapped-out containers.

- **No automatic `docker builder prune`** (discovered): on classic Docker it
  wipes the last completed build's cache, forcing a full network
  `pnpm install` / `dotnet build` re-run on the next steady-state run. Run
  `docker builder prune -f` manually when disk gets tight.

- A test failure aborts **before** the old stack is stopped — the live site keeps
  serving; re-run after fixing.
- `SKIP_TESTS=1 ./pipeline.sh` skips the test phase (air-gapped Pi / quick re-run).
- The Playwright e2e smoke is **not** in the pipeline (needs the dev stack + a
  browser; run it on the dev machine as usual).
- Timing (Pi): first run also pulls `sdk:10.0` + `node:22-alpine` (~1 GB-class);
  steady state is build + 208 backend tests + 63 frontend tests — expect minutes.
  The air-gapped `images/*.tar` path pairs with `SKIP_TESTS=1` (the suites need
  internet for NuGet/pnpm, or ship the test images too). Plain-HTTP mode (`CADDY_SITE=http://`) serves
`http://<ip>:<HTTP_PORT>`; with a real domain Caddy obtains Let's Encrypt
certs automatically (port 443 must be reachable).

## Admin account (auto-seeded)

On the very first boot the api seeds **one admin account** — no manual
steps. `/staff/login` + the `/admin/*` pages require it.

- **E-mail**: `ADMIN_SEED_EMAIL` from `.env`, default `admin@hanadicrochet.example`.
- **Password**: `ADMIN_SEED_PASSWORD` from `.env`, otherwise a strong random
  password generated at first seed (fresh installs only — a later
  (re)start never overwrites a changed password).
- **Initial credentials are logged exactly once** by the api at first seed:

  ```bash
  cd deploy && docker compose logs api | grep -i "admin seeded"
  ```

- **First login** at `/staff/login` **forces a password change** — that new
  password is the one you use going forward. To use a fixed initial
  password instead, put it in `ADMIN_SEED_PASSWORD` *before* the first boot.

If the initial password was changed and is now lost: the log line above is
the recovery path; as a last resort update the user's hash in Postgres
(`restore.md` shows how to reach `psql`).

## Updating after a code change

On the dev machine, push/`rsync` the repo to the host, then on the host:

```bash
./deploy/pipeline.sh   # tests → backup → clean → deploy → clean
```

(Quick manual path, skips tests + backup:
```bash
cd deploy && docker compose build api web && docker compose up -d
```

(Rebuild `web` whenever `MM_SITE_URL` or any `NEXT_PUBLIC_*` changes — those
are inlined at build time. The api applies EF migrations on its own startup.)

## Air-gapped Raspberry Pi (no internet on the host)

Build on the dev machine for the target platform, ship the tars:

```bash
# dev machine (x64 → use --platform linux/arm64 for a Pi; native for an x64 box)
docker buildx build --platform linux/arm64 -f src/Hanadicrochet.Api/Dockerfile -t hanadicrochet-api:latest --load .
docker buildx build --platform linux/arm64 -f frontend/Dockerfile -t hanadicrochet-web:latest --load .
docker save hanadicrochet-api:latest hanadicrochet-web:latest > images.tar
# copy images.tar + repo to the host, then:
mkdir -p deploy/images && cp images.tar deploy/images/
./deploy/deploy.sh     # loads images/*.tar instead of building
```

Note: `postgres:16-alpine` and `caddy:2-alpine` are still pulled from Docker
Hub on first start. Fully offline: `docker pull` + `docker save` them too
(and put their tars in `deploy/images/`).

## Backups & cron

`backup.sh` → `backups/YYYYMMDD/{db.dump.gz,uploads.tar.gz}`, keeps the
newest `KEEP_BACKUPS` (default 7). Daily cron:

```cron
0 3 * * * /path/to/hanadicrochet/deploy/backup.sh >> /var/log/hanadicrochet-backup.log 2>&1
```

Restore: [`restore.md`](restore.md). Ship at least one backup off-machine
(e.g. `rclone copy backups/ remote:backups/`) — same-machine backups do not
protect against disk loss.

## Operations

- Status: `docker compose ps` · Logs: `docker compose logs -f api`
- Resource limits: uncomment the `mem_limit` lines in `docker-compose.yml`
  (target: ≤ ~1 GB RAM idle on a Pi).
- Security: the only public port is caddy's. Postgres/api/web are reachable
  from the compose network only. Change `POSTGRES_PASSWORD` before first use;
  `.env` holds it — keep it private (chmod 600).
