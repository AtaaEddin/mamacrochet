#!/usr/bin/env bash
# One-shot deploy for the hanadicrochet host (plan 10) — run from anywhere:
#   ./deploy.sh
#
# Steps: .env check → load prebuilt images (images/*.tar, air-gapped path)
# or build locally → compose up → wait for all healthchecks → print status.
set -euo pipefail
cd "$(dirname "$0")"

die() { echo "ERROR: $*" >&2; exit 1; }

# --- 1. Configuration -------------------------------------------------------
if [[ ! -f .env ]]; then
  cp .env.example .env
  die "created .env from .env.example — edit it (POSTGRES_PASSWORD, CADDY_SITE) and re-run"
fi
set -a; # shellcheck disable=SC1091
source .env
set +a

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is not available"

# --- 2. Images ---------------------------------------------------------------
# Air-gapped path: put prebuilt tars here (docker save on the dev machine,
# see README.md) and they are loaded instead of building.
if compgen -G "images/*.tar" >/dev/null; then
  echo "Loading prebuilt images from images/ ..."
  for tarball in images/*.tar; do
    docker load -i "$tarball"
  done
else
  echo "Building images (first run takes a while) ..."
  docker compose build
fi

# --- 3. Start -----------------------------------------------------------------
echo "Starting stack ..."
docker compose up -d

# --- 4. Wait for health -------------------------------------------------------
timeout_sec=${WAIT_TIMEOUT:-180}
start=$SECONDS
while :; do
  unhealthy=$(docker compose ps --format '{{.Health}}' | grep -cv '^healthy$' || true)
  running=$(docker compose ps --format '{{.State}}' | grep -c '^running$' || true)
  if [[ "$unhealthy" -eq 0 && "$running" -eq 4 ]]; then
    break
  fi
  if (( SECONDS - start >= timeout_sec )); then
    echo
    docker compose logs --tail=50
    die "stack did not become healthy within ${timeout_sec}s"
  fi
  sleep 5
done

# --- 5. Status -----------------------------------------------------------------
echo
docker compose ps
case "${CADDY_SITE:-http://}" in
  http://) echo "Site: http://<this-machine>:${HTTP_PORT:-80}" ;;
  *) echo "Site: https://${CADDY_SITE}" ;;
esac
echo "Backups: ./backup.sh  ·  see README.md for cron + restore"
