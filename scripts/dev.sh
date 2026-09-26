#!/usr/bin/env bash
# Full dev stack: Aspire (Postgres + API on :8085) + Next.js dev server (on :3001).
# Usage: ./scripts/dev.sh   (Ctrl+C stops both)
set -euo pipefail
cd "$(dirname "$0")/.."

export NEXT_PUBLIC_API_URL="http://localhost:8085"

( cd frontend && pnpm dev -p 3001 ) &
WEB_PID=$!
trap 'kill "$WEB_PID" 2>/dev/null || true' EXIT

dotnet run --project src/Mamacrochet.AppHost
