#!/usr/bin/env bash
# hanadicrochet deploy pipeline (plan 20261004-1823/01) — run on the TARGET machine:
#   ./pipeline.sh
#
# Phases:  1. bases  — build base images present (pulled once, then reused)
#          2. tests  — API + UI suites in Docker (hermetic; no SDK on the host)
#          3. backup — pre-deploy pg_dump + uploads (skipped when no prod postgres)
#          4. clean  — stop the old stack + prune containers/networks
#          5. deploy — ./deploy.sh (build → up -d → wait for healthy)
#          6. clean  — prune the now-dangling images of the old release
#
# A failure at phases 1–3 leaves the running stack untouched (tests run while
# the old site keeps serving). VOLUMES ARE NEVER TOUCHED — see the safety
# table in doc/plans/20261004-1823_deploy-pipeline-and-domain/01.
#
# SKIP_TESTS=1 ./pipeline.sh — skip the test phase (air-gapped Pi, quick re-run).
set -euo pipefail
cd "$(dirname "$0")"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is not available"

TEST_COMPOSE=(docker compose -f docker-compose.test.yml)

# --- 1. Build bases -----------------------------------------------------------
# The build base images must live in the classic (tagged) image store: BuildKit
# imports them as cache objects, and our own `docker builder prune` below would
# then wipe them — forcing a registry re-fetch on EVERY run (which fails on
# flaky lines and re-downloads ~1 GB on a fresh Pi). Tagged = prune-proof.
# Pulled only when missing: steady-state runs never touch the registry here.
BUILDBASES=(mcr.microsoft.com/dotnet/sdk:10.0-noble node:22-alpine)
echo
echo "== [1/6] Build bases =="
for base in "${BUILDBASES[@]}"; do
  if docker image inspect "$base" >/dev/null 2>&1; then
    echo "present: $base"
  else
    echo "pulling: $base (first run or previously removed)"
    docker pull "$base" || die "cannot pull $base — network required (or docker load it from a shipped image tarball)"
  fi
done

# --- 2. Tests (API + UI, in Docker) -----------------------------------------
if [[ "${SKIP_TESTS:-0}" == "1" ]]; then
  echo "SKIP_TESTS=1 — skipping the test phase."
else
  echo
  echo "== [2/6] Tests =="
  # `up` (non-detached) stops its own containers on failure, so a failing
  # suite tears the test stack down with it; the extra `down` is belt &
  # braces (leftover network). die() exits before backup/clean/deploy —
  # the live stack never sees this.
  "${TEST_COMPOSE[@]}" build || die "test image build failed — deploy aborted (nothing was changed)."
  echo "-- api-tests (dotnet test against the ephemeral Postgres) --"
  if ! "${TEST_COMPOSE[@]}" up --exit-code-from api-tests test-postgres api-tests; then
    "${TEST_COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
    die "API tests failed — deploy ABORTED before backup/clean/deploy (live stack untouched). Fix the failures above and re-run."
  fi
  echo "-- web-tests (pnpm test) --"
  if ! "${TEST_COMPOSE[@]}" up --exit-code-from web-tests web-tests; then
    "${TEST_COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
    die "Web (UI) tests failed — deploy ABORTED before backup/clean/deploy (live stack untouched)."
  fi
  "${TEST_COMPOSE[@]}" down --remove-orphans
  echo "All tests passed."
fi

# --- 3. Pre-deploy backup ----------------------------------------------------
echo
echo "== [3/6] Pre-deploy backup =="
if [[ -n "$(docker compose ps --status running --services 2>/dev/null | grep -x postgres || true)" ]]; then
  ./backup.sh
else
  echo "No running prod postgres (fresh install or stopped stack) — skipping backup."
fi

# --- 4. Clean (pre) -----------------------------------------------------------
# Stop the old stack, then prune only what is safe (stopped containers, unused
# networks). No --volumes, no image prune -a: the named volumes (postgres
# data, uploads, Caddy TLS) are sacrosanct.
# NOTE: no `docker builder prune` here (or anywhere in the pipeline) — on
# classic Docker (no buildx plugin) it also wipes the last completed build's
# cache, which would force a full network `pnpm install` / `dotnet build`
# re-run on every steady-state run. Run `docker builder prune -f` manually
# when disk gets tight (see plan 20261004-1823/01).
echo
echo "== [4/6] Clean (pre) =="
docker compose down
docker container prune -f
docker network prune -f
docker system df

# --- 5. Deploy -----------------------------------------------------------------
echo
echo "== [5/6] Deploy =="
./deploy.sh

# --- 6. Clean (post) -------------------------------------------------------------
# The rebuild swapped the image tags: the old release's layers are dangling
# now — reclaim exactly that, plus the containers `up -d` replaced.
echo
echo "== [6/6] Clean (post) =="
docker image prune -f
docker container prune -f
docker compose ps
docker system df
echo
echo "Pipeline complete."
