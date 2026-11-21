#!/usr/bin/env bash
# Preflight for a hanadicrochet host — run BEFORE the first ./pipeline.sh:
#   ./preflight.sh
#
# It checks the things that otherwise fail 10–20 minutes into a build (or,
# worse, silently after deploy): 32-bit OS, missing Docker, too little RAM
# with no swap, no disk space, ports already taken, an unedited .env.
# Read-only: it changes nothing, only reports. Exit code 1 = do not deploy yet.
set -uo pipefail
cd "$(dirname "$0")"

if [[ -t 1 ]]; then
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  GREEN=""; YELLOW=""; RED=""; RESET=""
fi

fail=0
warn=0
ok()  { printf '  %sok%s     %s\n' "$GREEN" "$RESET" "$*"; }
wrn() { printf '  %swarn%s   %s\n' "$YELLOW" "$RESET" "$*"; warn=$((warn + 1)); }
bad() { printf '  %sFAIL%s   %s\n' "$RED" "$RESET" "$*"; fail=$((fail + 1)); }

echo "hanadicrochet preflight — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo

# --- 1. 64-bit OS -------------------------------------------------------------
echo "Architecture"
arch=$(uname -m)
case "$arch" in
  x86_64 | amd64 | aarch64 | arm64)
    ok "$arch (64-bit)"
    ;;
  armv7l | armv6l | armhf | i686 | i386)
    bad "$arch is 32-bit — the .NET 10 images (and this stack) need a 64-bit OS."
    bad "Reinstall the 64-bit OS image; a 64-bit kernel with a 32-bit userland also fails."
    ;;
  *)
    wrn "$arch is unrecognised — the deploy targets linux/arm64 or linux/amd64."
    ;;
esac

# --- 2. Docker ----------------------------------------------------------------
echo "Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ,)"
  if docker info >/dev/null 2>&1; then
    ok "daemon reachable"
    if docker compose version >/dev/null 2>&1; then
      ok "compose plugin $(docker compose version --short 2>/dev/null)"
    else
      bad "the docker compose plugin is missing (install docker-compose-plugin / Docker 24+)."
    fi
  else
    bad "daemon not reachable — start it (systemctl enable --now docker) and add your user to the docker group."
  fi
else
  bad "docker is not installed."
fi

# --- 3. Memory + swap -----------------------------------------------------------
echo "Memory"
if [[ -r /proc/meminfo ]]; then
  mem_mb=$(awk '/^MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo)
  swap_mb=$(awk '/^SwapTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo)
  if (( mem_mb >= 2048 )); then
    ok "${mem_mb} MB RAM, ${swap_mb} MB swap"
  elif (( mem_mb >= 1024 )); then
    if (( swap_mb >= 1024 )); then
      ok "${mem_mb} MB RAM + ${swap_mb} MB swap"
    else
      wrn "${mem_mb} MB RAM and only ${swap_mb} MB swap — add 2 GB of swap before the first build:"
      wrn "  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
    fi
  else
    bad "${mem_mb} MB RAM is too little for four containers plus a build."
  fi
else
  wrn "cannot read /proc/meminfo — skipping the memory check."
fi

# --- 4. Disk --------------------------------------------------------------------
echo "Disk"
if docker info >/dev/null 2>&1; then
  root_dir=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
  free_gb=$(df -Pk "$root_dir" 2>/dev/null | awk 'NR == 2 { printf "%d", $4 / 1024 / 1024 }')
  if [[ -n "${free_gb:-}" ]]; then
    if (( free_gb >= 10 )); then
      ok "${free_gb} GB free on ${root_dir}"
    elif (( free_gb >= 5 )); then
      wrn "${free_gb} GB free on ${root_dir} — a build needs ~5 GB; prune before deploying (./README.md → disk)."
    else
      bad "${free_gb} GB free on ${root_dir} — not enough to build the four images."
    fi
  else
    wrn "cannot stat ${root_dir} — skipping the disk check."
  fi
else
  wrn "docker daemon unreachable — skipping the disk check."
fi

# --- 5. Ports --------------------------------------------------------------------
echo "Ports"
if [[ -f .env ]]; then
  http_port=$( ( set -a; . ./.env; printf '%s' "${HTTP_PORT:-80}" ) )
else
  http_port=80
fi
stack_running=$(docker compose ps -q 2>/dev/null | head -n 1 || true)
if [[ -n "$stack_running" ]]; then
  ok "stack already running — port checks skipped (stop it with: docker compose down)"
else
  port_busy() {
    timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$1" 2>/dev/null
  }
  if port_busy "$http_port"; then
    wrn "TCP ${http_port} is already in use — set HTTP_PORT in .env to a free port."
  else
    ok "TCP ${http_port} free"
  fi
  if port_busy 443; then
    wrn "TCP 443 is in use — harmless for a LAN install (only used when CADDY_SITE is a domain),"
    wrn "  but stop whatever owns it before setting up HTTPS."
  else
    ok "TCP 443 free"
  fi
fi

# --- 6. .env ----------------------------------------------------------------------
echo "Configuration"
if [[ ! -f .env ]]; then
  wrn ".env does not exist yet — ./deploy.sh creates it from .env.example and exits."
  wrn "  Create it now: cp .env.example .env and set POSTGRES_PASSWORD."
else
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  case "${POSTGRES_PASSWORD:-}" in
    "" | "CHANGE-ME-long-random-string")
      bad "POSTGRES_PASSWORD is unset or still the example value — set a long random one."
      ;;
    *)
      ok "POSTGRES_PASSWORD set"
      ;;
  esac

  if [[ "${CADDY_SITE:-http://}" == "http://" && "${AUTH_REQUIRE_HTTPS:-}" != "false" ]]; then
    wrn "CADDY_SITE is http:// but AUTH_REQUIRE_HTTPS is not false — browsers drop Secure"
    wrn "  cookies on http://<lan-ip>, so signing in would appear to work and then 401."
    wrn "  Uncomment AUTH_REQUIRE_HTTPS=false in .env (remove it once the site has HTTPS)."
  fi
  if [[ "${CADDY_SITE:-}" == *"://"* && "${CADDY_SITE}" != "http://" ]]; then
    bad "CADDY_SITE=${CADDY_SITE} — use a bare domain (hanadicrochet.example.com) or exactly http://."
  fi
fi

# --- Summary ----------------------------------------------------------------------
echo
if (( fail > 0 )); then
  echo "Preflight FAILED: ${fail} blocking issue(s), ${warn} warning(s). Fix the FAILs before deploying."
  exit 1
fi
if (( warn > 0 )); then
  echo "Preflight passed with ${warn} warning(s) — review them, then run ./pipeline.sh"
else
  echo "Preflight passed. Next: ./pipeline.sh"
fi
