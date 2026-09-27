# Restore procedure (plan 10)

Backups live in `deploy/backups/YYYYMMDD/` (see `backup.sh`):

- `db.dump.gz` — plain SQL dump of the PostgreSQL database
- `uploads.tar.gz` — everything in `data/uploads/` (product images, receipts,
  avatars, customer samples)

Pick the backup you want (e.g. `B=20261001`).

## 1. Stop the app (keep the data on disk)

```bash
cd deploy
docker compose down        # containers stop; ./data/ is untouched
```

## 2. Start only Postgres

```bash
docker compose up -d postgres
# wait until healthy:
docker compose ps
```

## 3. Restore the database

For a **fresh** database (recommended — matches a clean backup):

```bash
docker compose exec -T postgres pg_isready -U "$POSTGRES_USER"
gunzip -c backups/$B/db.dump.gz | docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

(For a **live** database this overwrites the current data — no automatic
rollback. Only do it intentionally; take a fresh backup first.)

## 4. Restore the uploads

```bash
tar -C data -xzf backups/$B/uploads.tar.gz   # overwrites/extends data/uploads
```

## 5. Start the full stack

```bash
docker compose up -d
./deploy.sh          # or: wait for healthchecks — it re-checks everything
```

The api applies any pending EF migrations on startup, so a restore onto a
newer schema is fine (new tables appear, old data is preserved).

## Verify

- `docker compose ps` → all 4 services `healthy`
- `curl -fsS http://localhost:<HTTP_PORT>/api/health` → `{"status":"ok",...}`
- Open the site: home, `/works`, one order page, and one uploaded file.
