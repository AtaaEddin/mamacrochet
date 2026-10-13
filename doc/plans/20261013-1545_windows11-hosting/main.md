# Hosting on Windows 11 (the "old PC")

status: in-progress
created: 2026-10-13 15:45 (+03)
owner: agent (user request: "another fully hosting plan, as detailed as the Raspberry Pi
one, but for Windows 11")

## Goal

Run the entire verified production stack on the owner's **Windows 11 PC** — the "old PC"
named in the MVP target (plan 10: "Raspberry Pi ARM64 or old PC x64") — using
**Docker Desktop on the WSL 2 backend**: the same 4 containers, the same Caddyfile, and
the same `deploy/` scripts (`pipeline.sh` → `deploy.sh`, `backup.sh`, `restore.md`)
with **zero changes to the stack**. The machine is fully automated: starts on boot,
deploys with one command, backs up on a schedule, and can serve a public domain with
automatic HTTPS.

This is a re-verification on a second host class, not a first test: the x64 stack was
already smoke-tested end-to-end (incl. chat realtime through Caddy, SSR routes, and
restore) on 2026-09-27/28 — plan 10 "Done" notes.

## Why Docker Desktop (WSL 2) — and not native Windows services

Considered: run everything natively — PostgreSQL for Windows (installer + service), the
API as a .NET Windows service (IIS or Kestrel + a service wrapper), the Next standalone
bundle under a `node.exe` service wrapper (WinSW/NSSM), and `caddy.exe` via `sc.exe`/
WinSW (Caddy's documented Windows-service paths). **Rejected:**

1. **Breaks the "exactly 4 production containers" rule** (AGENTS.md / D9) — the native
   path is a different process topology with a different deploy/backup/restore
   procedure, and the Dockerized test pipeline (plan 20261004-1823/01, 208 API tests)
   no longer applies to it.
2. **New third-party dependencies** (NSSM or WinSW) — AGENTS.md: no dependencies
   "because it's easy", no new infrastructure without a justifying plan.
3. **Doubles the maintenance surface** — two production paths (Linux containers +
   native Windows) with version drift (native Postgres vs `postgres:16-alpine`).
4. **Docker Desktop is free** for personal use and small businesses (< 250 employees
   AND < $10M revenue) — the owner qualifies (docs.docker.com/subscription/desktop-license).

The native path remains a fallback only if this PC cannot run WSL 2 (virtualization
unavailable) — that would need its own plan; this plan does not implement it.

With Docker Desktop's WSL 2 backend, a full Linux kernel runs on the machine and the
compose stack executes inside it exactly as on the Pi. `docker` commands work from any
Windows terminal, so the existing bash scripts run **unmodified** from the WSL (Ubuntu)
terminal.

## Production architecture on Windows 11

| Layer       | Component                          | Notes                                                        |
|-------------|------------------------------------|--------------------------------------------------------------|
| Host OS     | Windows 11 x64 (Home or Pro)       | "old PC"; virtualization enabled in UEFI                     |
| VM          | WSL 2 (`docker-desktop` distro)    | capped via `%UserProfile%\.wslconfig` (01)                   |
| Engine      | Docker Desktop (WSL 2 backend)     | auto-start on sign-in (01)                                   |
| Containers  | `postgres` / `api` / `web` / `caddy` | identical `deploy/docker-compose.yml` (plan 10)           |
| Firewall    | Windows Defender Firewall          | inbound TCP 80, +443 with a domain (01/03)                   |
| Scheduler   | Windows Task Scheduler             | daily `backup.sh` (02)                                       |
| Domain      | Caddy automatic HTTPS (Let's Encrypt) | only when `CADDY_SITE` is a real domain (03)            |

- Still **exactly 4 containers**; only Caddy publishes ports — unchanged from plan 10.
- Data: `deploy/data/` on `C:\` (bind-mounted from the WSL 2 VM); backups in
  `deploy/backups/`. No data lives inside the Docker Desktop VHD.
- **Memory budget** (assume 8 GB RAM old PC): cap the WSL 2 VM at 3 GB + 1 GB swap —
  defaults would be 50 % of host RAM and 25 % swap (learn.microsoft.com/windows/wsl/wsl-config).
  The containers idled at ~265 MiB total (x64 baseline, 2026-09-28), leaving build headroom.
- **Network**: WSL 2 stays on the default **NAT** mode — no `mirrored` mode or netsh
  portproxy needed, because Docker Desktop publishes 80/443 on the **Windows host**
  itself; LAN (and, with router port-forward, internet) traffic reaches Caddy directly.
  WebSockets (SignalR) ride the same published ports — verified through Caddy on 2026-09-28.

## Sub-plans

| #  | Scope                                                                                          | File                           | Status   |
|----|-----------------------------------------------------------------------------------------------|--------------------------------|----------|
| 01 | Machine setup: virtualization check, WSL 2 + Ubuntu, Docker Desktop, `.wslconfig` cap, firewall, power, auto-start | 01-windows11-machine-setup.md  | in-progress |
| 02 | Deploy + backup + restore on Windows: LF line-ending guard (`.gitattributes`), WSL workflow, Task Scheduler backup | 02-deploy-backup-on-windows.md | proposed |
| 03 | Public domain + HTTPS: router port-forward, firewall 443, Caddy Let's Encrypt, outside-LAN verification | 03-domain-and-https-on-windows.md | proposed |

Execution order: 01 → 02 → (optional, when a domain is bought) 03.

## Key decisions

| ID  | Decision | Rationale / source (verified 2026-10-13) |
|-----|----------|------------------------------------------|
| W1  | **Docker Desktop with the WSL 2 backend** is the Windows 11 production runtime; stack, Caddyfile, scripts, and pipeline unchanged. | docs.docker.com/desktop/wsl — WSL 2 backend is default on supported systems, full Linux kernel, dynamic memory, `docker` CLI available from any Windows terminal |
| W2  | Cap the WSL 2 VM in `%UserProfile%\.wslconfig`: `memory=3GB`, `processors=4`, `swap=1GB` (scale to the machine). Defaults are 50 % of RAM / all cores / 25 % swap. | learn.microsoft.com/windows/wsl/wsl-config |
| W3  | All deploy tooling runs from the WSL **Ubuntu** distro (installed by `wsl --install`); no Git Bash, no new tools. | learn.microsoft.com/windows/wsl/install; docs.docker.com/desktop/wsl (WSL integration) |
| W4  | Daily backup at 03:00 via **Windows Task Scheduler** invoking `wsl.exe -d Ubuntu -- bash …/deploy/backup.sh` — the WSL VM auto-starts on demand; zero duplication of backup logic (script unchanged). | WSL basic commands (`wsl.exe -d <distro>`); `deploy/backup.sh` |
| W5  | Repo gains a **`.gitattributes`** forcing LF for `*.sh` and `*.env*` — a Windows git checkout (default `core.autocrlf=true`) would otherwise turn bash scripts CRLF (`bad interpreter: bash^M`) and risk corrupting `.env` values in the compose parser. | Windows git default autocrlf; compose `.env` parsing |
| W6  | The public-domain path is identical to the Pi (Caddy automatic HTTPS, HTTP-01): the Windows-specific parts are only the firewall 80/443 rules + router port-forward. Domain mechanics (Cloudflare Registrar, DNS records, optional orange-cloud + DNS-01) stay in plan 20261004-1823/02 — not duplicated here. | caddyserver.com/docs/automatic-https; 20261004-1823/02 |
| W7  | **Native Windows hosting rejected** (Postgres service + IIS/Kestrel + WinSW/NSSM + caddy.exe) — breaks the 4-container rule, adds third-party dependencies, doubles the maintenance surface. | "Why Docker Desktop" above; caddyserver.com/docs/running documents the sc.exe/WinSW paths that would be used |
| W8  | The machine stays **logged in** (home-server mode, locking the screen is fine): simplest reliable base for WSL scheduled tasks and Docker auto-start; no sleep on AC power. | Windows 11 power settings; see 01 |

## Acceptance (whole plan)

- Fresh Windows 11 PC → 01 → 02 → one `./pipeline.sh` run → site reachable from a
  **second device on the LAN**; `docker compose ps` = exactly 4 healthy; chat realtime
  works through Caddy; the scheduled backup produces a dump that restores cleanly
  (restore.md, fresh-DB drill); after a full reboot the site returns **without manual action**.
- With a domain configured (03): `https://<domain>` works from **outside** the home
  network, HTTP→HTTPS 301, Let's Encrypt certificate, chat realtime over TLS.
- Memory within budget: WSL 2 VM under the 3 GB cap while the stack idles and during
  a steady-state deploy.

## Risks / open questions

- **Unattended Task Scheduler + WSL 2 on a locked machine** is a known flaky area on
  some systems. Mitigation: keep the machine logged in (W8); if the task still fails
  unattended, switch it to "run only when user is logged on" (the machine is logged in
  almost all the time anyway). To be confirmed during the 02 smoke test.
- **Windows Update reboots** take the site down for a while; containers return
  themselves (`restart: unless-stopped` + Docker Desktop auto-start). Acceptable on a
  home box; the owner can defer updates during busy periods.
- **Docker Desktop auto-updates** occasionally require an engine restart. If the engine
  is down, the site is down until it restarts — acceptable; auto-update can be disabled
  in Docker Desktop settings.
- **First run on an old PC is slow** (~10–20 min: base-image pulls + builds + 208 API
  tests + UI tests in Docker). Expected; steady-state deploys take minutes.
- The PC's public-IP situation (static / dynamic / CGNAT) matters only for 03 — the
  same pre-buy check as plan 20261004-1823/02 applies to the router, not the OS.

## Sources (verified 2026-10-13)

- Docker Desktop — WSL 2 backend (prerequisites, WSL integration, dynamic memory, data
  location): https://docs.docker.com/desktop/wsl/
- Docker Desktop license — free for personal use / small business:
  https://docs.docker.com/subscription/desktop-license/
- WSL install on Windows 11 (`wsl --install`, WSL 2 default, Win 10 2004+/Win 11):
  https://learn.microsoft.com/en-us/windows/wsl/install
- `.wslconfig` — `memory`/`processors`/`swap` defaults + limits, `localhostForwarding`,
  `autoMemoryReclaim`, the 8-second rule: https://learn.microsoft.com/en-us/windows/wsl/wsl-config
- WSL networking — default NAT, localhost forwarding, LAN access/portproxy, mirrored
  mode, WSL firewall: https://learn.microsoft.com/en-us/windows/wsl/networking
- Caddy — Automatic HTTPS (real domain, external ports 80/443 required):
  https://caddyserver.com/docs/automatic-https
- Caddy — HTTPS quick-start: https://caddyserver.com/docs/quick-starts/https
- Caddy — Windows service (sc.exe / WinSW) — the rejected native path:
  https://caddyserver.com/docs/running
- Existing x64 verification (baseline this plan re-uses): plan 10 "Done (2026-09-28)"
  and plan 20261004-1823/01.
