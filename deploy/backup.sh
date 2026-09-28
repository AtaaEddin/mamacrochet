#!/usr/bin/env bash
# hanadicrochet backup (plan 10): pg_dump + uploads tar → ./backups/YYYYMMDD/
# Keeps the newest KEEP_BACKUPS (default 7, set in .env) and deletes older.
#
# Cron example (daily at 03:00, adjust the path):
#   0 3 * * * /path/to/hanadicrochet/deploy/backup.sh >> /var/log/hanadicrochet-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

[[ -f .env ]] || { echo "ERROR: .env missing (copy .env.example)" >&2; exit 1; }
set -a; # shellcheck disable=SC1091
source .env
set +a
KEEP_BACKUPS=${KEEP_BACKUPS:-7}

dest="backups/$(date +%Y%m%d)"
# Same-day re-run gets a timestamp suffix — nothing is ever overwritten.
if [[ -e "$dest" ]]; then
  dest="backups/$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$dest"

echo "Database  → $dest/db.dump.gz"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$dest/db.dump.gz"

if [[ -d data/uploads ]]; then
  echo "Uploads   → $dest/uploads.tar.gz"
  tar -C data -czf "$dest/uploads.tar.gz" uploads
fi

# Prune: keep the newest KEEP_BACKUPS backup folders.
ls -1dt backups/*/ 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf

echo "Done: $dest"
