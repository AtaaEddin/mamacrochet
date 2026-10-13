# 02 — Deploy, backup & restore on Windows 11

status: proposed
parent: main.md

## Goal

Make the existing `deploy/` tooling work on the Windows 11 machine:

1. clone with **correct line endings** (the only repo change: a `.gitattributes` — W5),
2. one-command deploy from the Ubuntu terminal (`./pipeline.sh`),
3. **daily scheduled backup** via Windows Task Scheduler (no new backup logic),
4. a **tested restore** (fresh-DB drill), and
5. documentation in `deploy/README.md`.

`pipeline.sh`, `deploy.sh`, `backup.sh`, `restore.md`, the compose file, and the
Caddyfile stay **unchanged**.

## Files

| File                 | Change |
|----------------------|--------|
| `.gitattributes` (root) | NEW — force LF for shell scripts and env files: `*.sh text eol=lf`, `*.env* text eol=lf`, `deploy/.env.example text eol=lf`. Without it a Windows git checkout (default `core.autocrlf=true`) makes `deploy.sh` CRLF → `bad interpreter: /usr/bin/env bash^M`, and CRLF `.env` values risk corrupting compose parsing. |
| `deploy/README.md`   | NEW section "Windows 11 host": WSL workflow (all commands from Ubuntu), the Task Scheduler recipe, backup log location, reboot/auto-start notes. |
| everything else      | unchanged |

## Steps

### 1. Clone with LF endings (PowerShell, the Windows user that owns the Ubuntu distro)

```powershell
git clone <repo-url> C:\hanadicrochet
cd C:\hanadicrochet
git config core.autocrlf false
```

Verify (Ubuntu terminal):

```bash
file /mnt/c/hanadicrochet/deploy/deploy.sh
# → "ASCII text" — NOT "ASCII text, with CRLF line terminators"
```

For an **existing** Windows clone checked out before `.gitattributes` existed:
`git rm --cached -r . && git reset --hard` (re-checkout with LF), or just re-clone.

### 2. First deploy (Ubuntu terminal)

```bash
cd /mnt/c/hanadicrochet/deploy
./pipeline.sh
```

- Fresh machine: the backup phase self-skips (nothing running), then full build +
  tests + deploy. Expect **~10–20 min** on an old PC (base-image pulls, builds,
  208 API tests + UI tests in Docker — plan 20261004-1823/01).
- If `POSTGRES_PASSWORD` / `CADDY_SITE` were never set, `deploy.sh` stops early:
  it created `.env` from `.env.example` — edit it (Notepad is fine; it stays LF)
  and re-run `./pipeline.sh`.
- **Admin account**: on first boot the api seeds the admin; if `ADMIN_SEED_PASSWORD`
  is empty the generated password is logged **once**:
  `docker compose logs api | grep -i admin` (see README "Admin account").
- The script ends with `docker compose ps` — exactly **4 healthy** — and the URL.

### 3. Daily backup — Windows Task Scheduler (GUI: `taskschd.msc`)

- **Task**: `hanadicrochet-backup`, General → "Run whether user is logged on or not"
  (Windows will store the WSL user's password), no "run with highest privileges".
- **Trigger**: Daily, 03:00.
- **Action**: Start a program
  - Program: `wsl.exe`
  - Arguments: `-d Ubuntu -- bash -lc "bash /mnt/c/hanadicrochet/deploy/backup.sh >> /mnt/c/hanadicrochet/deploy/backups/backup.log 2>&1"`
  - Start in: `C:\hanadicrochet`
- **Settings**: uncheck "Stop the task if it runs longer than 1 hour" → set it to
  **1 hour**; check "If the task fails, restart every 1 hour", max **2** retries;
  uncheck "Run task as soon as possible after a scheduled start is missed".
- **Test immediately**: right-click the task → **Run** → then (Ubuntu):
  ```bash
  ls /mnt/c/hanadicrochet/deploy/backups/      # newest folder = today
  ls /mnt/c/hanadicrochet/deploy/backups/<today>/   # db.dump.gz (+ uploads.tar.gz)
  ```
- WSL VM auto-starts on demand for the task — nothing else to configure (W4).
- **Known gotcha** (main.md risk): unattended WSL 2 on a locked machine can fail on
  some systems. The machine stays logged in (W8); if task runs still fail, switch the
  task to "Run only when user is logged on" and note it in the README section.

### 4. Restore drill (Ubuntu terminal)

Follow `deploy/restore.md` exactly — it is pure `docker compose` and runs unchanged:

1. Take the **latest** scheduled backup `B`.
2. Restore `B/db.dump.gz` into a **fresh** throwaway Postgres (restore.md step 3,
   fresh-DB path) — e.g. an ephemeral `postgres:16-alpine` container on a random port,
   or `docker compose run --rm --service-ports postgres` with a scratch data dir.
3. Check: 0 errors, all tables present (compare `\dt` counts against the live DB),
   row counts of a few key tables match.
4. Tear down the scratch container. The live stack was never touched.

(Do not restore into the live DB until it is actually needed — that is the
restore.md step 1–2 procedure: `docker compose down`, then restore.)

### 5. Document

`deploy/README.md` → new section **"Windows 11 host"**: everything runs from the
Ubuntu WSL terminal; repo at `C:\hanadicrochet` = `/mnt/c/hanadicrochet`; the Task
Scheduler recipe (steps above, incl. the logged-on fallback); backup log at
`deploy/backups/backup.log`; reboot behaviour (Docker auto-start +
`restart: unless-stopped` → stack returns by itself); disk hygiene (Docker Desktop →
Resources → "Reclaim disk space"; the pipeline's post-deploy prune is the main one).

## Windows-specific notes

- **Performance**: building from `C:\` (DrvFs) is slower than a Linux filesystem —
  irrelevant for a one-shot deploy a few times a week; the build cache lives inside
  Docker Desktop's own WSL volume (fast).
- **Disk growth**: images + build cache grow; `pipeline.sh`'s post-deploy prune keeps
  it bounded. If `C:\` ever gets tight: Docker Desktop → Settings → Resources →
  "Reclaim disk space by deleting unused data".
- **Time zone**: WSL 2 syncs the Windows time zone by default (`wsl.conf`
  `[time] useWindowsTimezone=true`) — backup folder dates match Windows.
- **Updates**: we build images from source (no `docker compose pull` in the flow);
  base images are re-pulled by the pipeline only when missing.
- **One command per action** (Ubuntu terminal, from `deploy/`):
  ```bash
  ./pipeline.sh    # test → backup → clean → deploy → clean
  ./backup.sh      # ad-hoc backup
  docker compose ps
  docker compose logs -f --tail=100 api
  ```

## Verification (acceptance for this sub-plan)

- [ ] Fresh clone on Windows → `file deploy/deploy.sh` = ASCII, **no CRLF**
- [ ] `./pipeline.sh` end-to-end on the Windows machine (fresh data dir): tests green
      *before* deploy, 4/4 healthy after, URL printed
- [ ] From a **second device on the LAN**: `http://<pc-ip>/` loads the site; a chat
      message round-trips in realtime through Caddy (same path as the 2026-09-28 x64
      verification)
- [ ] `docker compose ps` → exactly 4 containers, all healthy
- [ ] Task Scheduler: manual **Run** produces a complete backup folder; the 03:00
      trigger fires overnight and appends to `backup.log`
- [ ] Restore drill: latest dump → fresh DB → 0 errors, all tables
- [ ] **Full reboot** → wait a minute → site reachable again with zero manual action
- [ ] `free -h` (Ubuntu) while idle: WSL 2 VM stays well under the 3 GB cap
