# 01 — Deploy pipeline on the target machine (test → clean → deploy)

status: proposed
parent: main.md

## Goal

One command on the target machine (Raspberry Pi / old PC) that:

1. runs the **API + UI test suites** (in Docker, hermetic),
2. takes a **pre-deploy backup**,
3. **cleans Docker resources** (no data risk),
4. **deploys** (existing `deploy.sh`: `.env` check → images → `up -d` → health wait),
5. reclaims **post-deploy disk**.

A failure at steps 1–3 leaves the currently running site untouched.

## Files

| File | Change |
|------|--------|
| `deploy/pipeline.sh` | NEW — orchestrator (phases below), `set -euo pipefail`, `SKIP_TESTS=1` escape hatch |
| `deploy/docker-compose.test.yml` | NEW — ephemeral test stack (3 services, no published ports, no named volumes) |
| `tests/Hanadicrochet.Api.Tests/Dockerfile` | NEW — `mcr.microsoft.com/dotnet/sdk:10.0-noble` (multi-arch incl. arm64), copy repo, `dotnet build`, CMD `dotnet test --no-build` |
| `frontend/Dockerfile.test` | NEW — `node:22-alpine` + corepack (pnpm pinned in `package.json` → 12.6.0), `pnpm install --frozen-lockfile`, CMD `pnpm test` |
| `tests/Hanadicrochet.Api.Tests/ApiTestFixture.cs` | Make the test-DB connection env-driven: `TEST_DB_HOST` / `TEST_DB_PORT` / `TEST_DB_USER` / `TEST_DB_PASSWORD` (defaults unchanged: `127.0.0.1:5432`, `postgres`/`postgres`) so the same fixture works against the Aspire dev Postgres **and** the ephemeral test container. `MaintConnectionString` becomes `static readonly` (same call sites). |
| `deploy/README.md` | Document the pipeline, air-gapped notes, Pi timing expectations |

`deploy.sh`, `deploy/docker-compose.yml`, both production Dockerfiles, `backup.sh` stay
**unchanged** — the pipeline invokes `./deploy.sh` for the deploy phase.

## Phases (order matters)

1. **test** — two sequential `docker compose -f deploy/docker-compose.test.yml up` runs,
   then `down`:
   - run 1: `--build --exit-code-from api-tests`
   - run 2: `--exit-code-from web-tests` (reuses the built images from run 1)
   - Services:
     - `test-postgres` — `postgres:16-alpine`, `POSTGRES_USER/PASSWORD=postgres/postgres`
       (matches the fixture defaults), `pg_isready` healthcheck, **no volume** (data is
       ephemeral; container + its data vanish with `down`), internal-only.
     - `api-tests` — build context = repo root, Dockerfile
       `tests/Hanadicrochet.Api.Tests/Dockerfile` (root `.dockerignore` already excludes
       `bin/ obj/ node_modules/ .git`), env `TEST_DB_HOST=test-postgres`,
       `depends_on: test-postgres: service_healthy`. Exit code = 208-test suite.
     - `web-tests` — build context = repo root, Dockerfile `frontend/Dockerfile.test` →
       `pnpm test` (Vitest, jsdom, no browser).
   - `SKIP_TESTS=1` skips the whole phase (escape hatch; documented: air-gapped Pi
     without the test images shipped, quick re-run after a verified change).
2. **backup** — `./backup.sh` (pg_dump + uploads → `backups/YYYYMMDD/`). Skipped when the
   prod stack is not running yet (fresh install — no data to lose). `backup.sh` itself
   stays strict (a cron failure must still fail loudly).
3. **clean (pre)** — `docker compose down` (stop the old stack), then:
   - `docker container prune -f`
   - `docker network prune -f`
   - `docker builder prune -f` (dangling build cache only)
   - `docker system df` snapshot (report to the user)
4. **deploy** — `./deploy.sh` (unchanged: `.env` check → load `images/*.tar` or
   `docker compose build` → `up -d` → wait-for-healthy → status/URL).
5. **clean (post)** — `docker image prune -f` (the old release's layers are dangling now),
   `docker container prune -f` (containers swapped out by `up -d`),
   `docker builder prune -f`, final `docker compose ps` + `docker system df`.

## Cleanup safety rules (must not be broken)

| Command | Verdict | Why |
|---------|---------|-----|
| `docker container prune -f` | ✅ | stopped containers only (old stack, test leftovers) |
| `docker image prune -f` (no `-a`), post-deploy only | ✅ | dangling (unreferenced) layers/images only — after `up -d` the old `hanadicrochet-*` layers are exactly the reclaimable set |
| `docker builder prune -f` (no `--all`) | ✅ | dangling build cache; `--all` is a manual option only (saves disk, costs rebuild time) |
| `docker network prune -f` | ✅ | unused networks only |
| `docker system df` | ✅ | read-only report |
| `docker image prune -a` / `docker system prune` / anything `--volumes` / `docker volume prune` | ❌ **forbidden** | `--volumes`/`volume prune` would delete the named volumes = **postgres data + user uploads + Caddy TLS certs**; `image prune -a` wipes base images (`postgres:16-alpine`, `caddy:2-alpine`, `node:22-alpine`, `sdk:10.0`) → re-pull on every deploy; `system prune` behavior varies by version — no shorthand |

Volumes are the crown jewels (postgres, uploads, caddy TLS) and are **never** pruned;
this plan adds no volume-cleanup path at all.

## Design rationale

- **Tests in Docker, not a native SDK on the Pi:** the suite needs .NET 10 SDK + a
  Postgres at the host the fixture expects. Installing SDK + Node on a low-power Pi is
  permanent disk/RAM cost for nothing; containers are hermetic (identical versions on
  dev box and Pi) and the one-time image cost (~1 GB-class: `sdk:10.0` + `node:22-alpine`
  + the app images) is documented in the README. Air-gapped path: `docker save` the test
  images too, or `SKIP_TESTS=1`.
- **Sequential test runs** (api, then web): one unambiguous failure at a time, and no
  concurrent dotnet+node RAM peak on a 4–8 GB Pi.
- **Clean before build, prune dangling after deploy:** at pre-clean the old app images
  are still tagged (and are the running fallback) — a dangling-only prune can't (and
  mustn't) remove them. After `up -d` the old layers are dangling → post-clean reclaims
  exactly the previous release's disk. The build happens with the old stack **down**, so
  the Pi never builds while also serving (no RAM doubling).
- **No CI (GitHub Actions) in this plan** — the pipeline is host-side by design (tests
  run where the deploy runs). A CI variant reusing the same `docker-compose.test.yml` is
  a future plan if/when a remote host appears.
- **`.env` stays the single config source** — the pipeline reads nothing else; no new
  env vars besides `SKIP_TESTS` (pipeline-level, not `.env`).

## Acceptance

- Fresh machine: `./deploy/pipeline.sh` → both suites green → backup skipped (fresh) →
  clean → deploy → 4/4 healthy → post-clean; `docker system df` sane.
- Second run (code unchanged): full pipeline green; post-clean reclaims the dangling
  layers from run 1; postgres data + uploads + TLS certs intact (volumes untouched).
- **Failure drill:** an intentionally failing test (scratch worktree) → pipeline exits
  non-zero; the previously running stack is still up and serving; no images built.
- Air-gapped Pi: `SKIP_TESTS=1` + `images/*.tar` (existing `deploy.sh` path) works.
- Pi timing documented in README: first run includes pulling `sdk:10.0` +
  `node:22-alpine` (~1 GB-class); steady state = build + 208 backend tests + 63 frontend
  tests — expect minutes, not seconds.

## Open

- none (domain name choice lives in 02).
