# 01 — Deploy pipeline on the target machine (test → clean → deploy)

status: done
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
| `frontend/Dockerfile.test` | NEW — `node:22-alpine` + corepack (pnpm pinned in `package.json` → 12.6.0), `pnpm install --frozen-lockfile`, CMD `pnpm test`; includes the `pnpm` priming stage (see below) |
| `tests/Hanadicrochet.Api.Tests/ApiTestFixture.cs` | Make the test-DB connection env-driven: `TEST_DB_HOST` / `TEST_DB_PORT` / `TEST_DB_USER` / `TEST_DB_PASSWORD` (defaults unchanged: `127.0.0.1:5432`, `postgres`/`postgres`) so the same fixture works against the Aspire dev Postgres **and** the ephemeral test container. `MaintConnectionString` becomes `static readonly` (same call sites). |
| `deploy/README.md` | Document the pipeline, air-gapped notes, Pi timing expectations |

`deploy.sh`, `deploy/docker-compose.yml`, `backup.sh` stay **unchanged** — the
pipeline invokes `./deploy.sh` for the deploy phase. `frontend/Dockerfile` got a
small **production fix discovered during verification** (corepack re-download
flakiness — see below); `tests/Hanadicrochet.Api.Tests/Dockerfile` is otherwise
unchanged.

## Phases (order matters)

1. **bases** — ensure the build base images (`mcr.microsoft.com/dotnet/sdk:10.0-noble`,
   `node:22-alpine`) exist as **tagged images in the classic store**; `docker pull`
   only when missing (steady-state runs never touch the registry). Runs before tests
   and also with `SKIP_TESTS=1` (the deploy-phase build needs them too). Why:
   BuildKit imports *untagged* base images as cache objects, so our own pre-clean
   `docker builder prune -f` wipes them — discovered on the dev box: every run then
   re-fetched `sdk:10.0-noble` from the registry and failed intermittently
   (`connection reset by peer`). Tagged classic images survive `builder prune`.
2. **test** — two sequential `docker compose -f deploy/docker-compose.test.yml up` runs,
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
3. **backup** — `./backup.sh` (pg_dump + uploads → `backups/YYYYMMDD/`). Skipped when the
   prod stack is not running yet (fresh install — no data to lose). `backup.sh` itself
   stays strict (a cron failure must still fail loudly).
4. **clean (pre)** — `docker compose down` (stop the old stack), then:
   - `docker container prune -f`
   - `docker network prune -f`
   - `docker system df` snapshot (report to the user)
5. **deploy** — `./deploy.sh` (unchanged: `.env` check → load `images/*.tar` or
   `docker compose build` → `up -d` → wait-for-healthy → status/URL).
6. **clean (post)** — `docker image prune -f` (the old release's layers are dangling now),
   `docker container prune -f` (containers swapped out by `up -d`),
   final `docker compose ps` + `docker system df`.

## Cleanup safety rules (must not be broken)

| Command | Verdict | Why |
|---------|---------|-----|
| `docker container prune -f` | ✅ | stopped containers only (old stack, test leftovers) |
| `docker image prune -f` (no `-a`), post-deploy only | ✅ | dangling (unreferenced) layers/images only — after `up -d` the old `hanadicrochet-*` layers are exactly the reclaimable set |
| `docker builder prune -f` (no `--all`) | 🖐 manual only | **Discovered:** on classic Docker (no buildx plugin — e.g. the Pi's package `docker.io`) it also prunes the *last completed build's* cache, so a pipeline run after the prune re-ran `pnpm install`/`dotnet build` from the network. Removed from the pipeline; run it by hand when disk gets tight. (Phase 1 keeps the base images tagged so no prune re-fetches them.) |
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

## Production fix discovered during verification (2026-10-04)

**Symptom:** intermittent `docker compose build` failures in the prod web image —
`Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-12.6.0.tgz`
→ `read ETIMEDOUT`, and (pnpm 12) a second fetch of the platform native binary
(`@pnpm/exe.linux-x64-musl`). Reproduced on the dev box's flaky line; would hit
any target machine intermittently.

**Root cause:** corepack caches the pnpm install **per layer** — every stage that
runs `pnpm` (prod `deps` + `build` stages; the single stage in
`frontend/Dockerfile.test`) re-downloads the pnpm tarball *and* the pnpm-native
binary from the registry. Verified by reading corepack 0.36 source in
`node:22-alpine`: runtime reuse requires the `.corepack` marker in the install
folder, and pnpm 12's wrapper stores its 57 MB `pnpm-native` binary inside that
same install folder — neither survives across stages unless copied.

**Fix (both `frontend/Dockerfile` and `frontend/Dockerfile.test`):** a new `pnpm`
priming stage copies the pinned `frontend/package.json` and runs
`corepack enable && pnpm --version` once (fetches tarball + native binary into
`/root/.cache/node/corepack`); every pnpm-using stage adds
`COPY --from=pnpm /root/.cache/node/corepack /root/.cache/node/corepack` after
`corepack enable`. Verified: with the primed home, `pnpm --version` exits 0
under `docker run --net none` (no registry contact for the binary).

**Known cosmetic:** fully offline, pnpm 12.6.0 prints one non-fatal
`[WARN] ERR_PNPM_BAD_CONFIG_DEP` (its "package manager dependency" metadata check)
while still working; with a working line the check succeeds and the build is
silent. `npm_config_pm_on_fail=ignore` does NOT suppress it in 12.6.0 — left as-is.

## Verification (dev machine, 2026-10-05)

- **Full green run**: 348/348 API tests (Docker, ephemeral Postgres, no volume) +
  11 files / 63 tests UI (Vitest in Docker) → pre-deploy backup → clean →
  deploy → post-clean: `Pipeline complete.`, 4/4 containers healthy, `/api/health`
  = `ok` + DB connected, site answers through Caddy.
- **Steady-state run**: test phase builds from warm cache (zero registry contact),
  backup produced `backups/<date>/`, old-release layers pruned after deploy.
- **Failure drill** (temporarily added failing test, then removed): pipeline
  aborts **before** backup/clean/deploy with an explicit ERROR line and the live
  stack stays untouched; the test stack (containers + network) is cleaned up.
- Fixes discovered & applied during verification, documented above: the
  Corepack/pnpm priming stage, the base-image tagging phase, and removing the
  automatic `docker builder prune` (classic Docker prunes the last completed
  build's cache, which forced a network `pnpm install` re-run every run).

## Open

- none (domain name choice lives in 02).
