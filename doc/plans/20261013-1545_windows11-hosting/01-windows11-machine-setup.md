# 01 — Windows 11 machine setup (WSL 2 + Docker Desktop)

status: in-progress
parent: main.md

## Goal

Bring a fresh Windows 11 PC (the owner's "old PC") to a state where:

1. WSL 2 + Ubuntu work,
2. Docker Desktop runs on the WSL 2 backend and auto-starts on sign-in,
3. the WSL 2 VM is memory-capped (`.wslconfig`),
4. the Windows firewall allows inbound 80 (443 added in 03 with a domain),
5. the machine does not sleep on AC power.

One session. Everything after this sub-plan happens from the Ubuntu terminal.

## Prerequisites

- Windows 11 (Home or Pro), x64, **≥ 8 GB RAM**, ≥ 20 GB free disk (images + cache + data)
- **Virtualization enabled in UEFI** (VT-x / AMD-V) — check: Task Manager →
  Performance → CPU → "Virtualization: Enabled". If "Disabled": reboot → UEFI → enable.
- Stable internet (first deploy pulls ~1–2 GB of base images)

## Steps

Commands in **PowerShell as Administrator** unless noted.

### 1. WSL 2 + Ubuntu

```powershell
wsl --install
```

Installs the VM platform + kernel + Ubuntu and sets WSL 2 as the default version
(learn.microsoft.com/windows/wsl/install). Restart when prompted.

- First Ubuntu launch: create the **Linux username + password** — remember them; the
  deploy scripts and the scheduled backup task (02) run as this user.
- Verify: `wsl -l -v` → `Ubuntu` … `2`.

### 2. Docker Desktop

- Download the installer (docker.com/products/docker-desktop) → install → sign in with
  a free **Personal** account (licensing: docs.docker.com/subscription/desktop-license).
- During setup: accept the **WSL 2 based engine** (default on supported systems —
  docs.docker.com/desktop/wsl).
- Enable the integration: Docker Desktop → Settings → Resources → **WSL Integration**
  → switch on **Ubuntu** → Apply.
- Verify **from the Ubuntu terminal**:
  ```bash
  docker version      # Client AND Server sections, Server OS: linux
  docker run --rm hello-world
  ```
- If this machine ever had a Docker Engine installed directly inside a WSL distro,
  remove it first — it conflicts with Docker Desktop (docs.docker.com/desktop/wsl).

### 3. Cap the WSL 2 VM — `%UserProfile%\.wslconfig`

Create `C:\Users\<you>\.wslconfig` (does not exist by default):

```ini
[wsl2]
memory=3GB
processors=4
swap=1GB
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
```

- Defaults without this file: `memory` = 50 % of host RAM, `processors` = all cores,
  `swap` = 25 % (learn.microsoft.com/windows/wsl/wsl-config). On an 8 GB PC that means
  4 GB — too much for this stack; 3 GB is comfortable (containers idle ~265 MiB, builds
  get the rest).
- Scale to the machine: more RAM → can leave at default; less than 8 GB → `memory=2GB`
  and expect a slower first build.
- Apply: `wsl --shutdown`, wait for the "8 second rule" (docs), reopen Ubuntu.

### 4. Firewall (inbound)

```powershell
New-NetFirewallRule -DisplayName "hanadicrochet HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Any
```

(443 is added in 03 only when a domain exists.) Deterministic regardless of the
firewall rules Docker Desktop creates for its own published ports.

### 5. Power — never sleep on AC

- Settings → System → Power and battery → "When plugged in, PC goes to sleep after"
  → **Never** (the *display* may still turn off — that is fine).
- Or: `powercfg /change standby-timeout-ac 0`
- **Keep the machine logged in** (W8): locking the screen is fine, logging off is not
  (WSL scheduled tasks + Docker auto-start are simplest with a user session present).

### 6. Auto-start

- Docker Desktop → Settings → General → **"Start Docker Desktop when you sign in to
  your computer"** → on.
- The compose file already has `restart: unless-stopped` on all 4 services — when the
  engine comes up after a reboot, the whole stack follows (verified on reboot in 02).

### 7. Repo location

- Clone to **`C:\hanadicrochet`** (short, no spaces, not OneDrive/Drive-synced) —
  02 does the actual clone. In WSL this path is `/mnt/c/hanadicrochet`.

## Verification checklist (from the Ubuntu terminal unless noted)

- [ ] `wsl -l -v` → Ubuntu, version 2
- [ ] `docker version` shows a Linux server; `docker run --rm hello-world` OK
- [ ] `docker compose version` OK (compose plugin visible through the WSL integration)
- [ ] `free -h` inside Ubuntu → total memory ≈ the 3 GB cap
- [ ] PowerShell (admin): `Get-NetFirewallRule -DisplayName "hanadicrochet HTTP"` → Enabled
- [ ] Settings shows sleep = Never on AC
- [ ] Docker Desktop starts on its own after a reboot (leave the machine alone for a
      minute; taskbar icon returns, `docker version` OK without starting it by hand)

## Notes / gotchas

- Docker Desktop stores **its engine** in `C:\Users\<you>\AppData\Local\Docker\wsl`
  (the `docker-desktop` VHD). That is the engine + image store, **not our data** —
  our data lives in the repo's `deploy/data/` (02). Never back up "the Docker folder"
  as a substitute for `backup.sh`.
- WSL 2 networking stays on default **NAT** — no `mirrored` mode, no netsh portproxy:
  Docker Desktop binds 80/443 on the Windows host itself, so LAN clients reach
  `http://<pc-ip>/` directly (confirmed by the 02 smoke test from a second device).
  Mirrored mode (Win 11 22H2+) would only matter if we ran non-Docker WSL services.
- If `wsl --install` reports virtualization problems: UEFI check from prerequisites;
  some laptops gate it behind a "Virtualization Technology" toggle per socket.
