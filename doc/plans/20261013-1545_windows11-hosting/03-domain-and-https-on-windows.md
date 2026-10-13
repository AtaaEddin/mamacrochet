# 03 — Public domain + HTTPS on the Windows 11 host

status: proposed
parent: main.md

## Goal

Serve the site from a public domain with **automatic Let's Encrypt HTTPS** on the
Windows 11 host. The domain mechanics themselves — Cloudflare Registrar purchase,
DNS records, the 2-minute pre-buy IP check (static / dynamic / CGNAT), and the
optional orange-cloud (proxied) upgrade with DNS-01 — are host-agnostic and live in
`doc/plans/20261004-1823_deploy-pipeline-and-domain/02-cloudflare-domain.md`.
This sub-plan covers only the **Windows 11-specific** parts plus verification on this
host. No Caddyfile change is needed — the existing `{$CADDY_SITE}` block already does
automatic HTTPS for a bare domain (plan 10).

## Windows 11-specific steps

### 1. Router (same as the Pi)

- Forward **TCP 80 and TCP 443** to the PC's LAN IP.
- Give the PC a **stable LAN IP** (DHCP reservation in the router, or a static LAN
  IP) so the forward survives reboots — required for the port-forward to keep
  pointing at the box (plan 20261004-1823/02 "stable LAN IP" step).
- HTTP-01 validation needs port 80 reachable from the internet → the Cloudflare DNS
  record starts **DNS-only (grey cloud)**. (Orange-cloud path = Caddy
  `dns.providers.cloudflare` + DNS-01, per plan 20261004-1823/02 — no Windows
  difference.)

### 2. Firewall — add 443 (PowerShell, admin)

```powershell
New-NetFirewallRule -DisplayName "hanadicrochet HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Any
```

(80 was opened in 01.)

### 3. Wire the domain (Ubuntu terminal, `C:\hanadicrochet\deploy`)

Edit `.env`:

```ini
CADDY_SITE=example-domain.com          # the real domain, bare, no scheme
MM_SITE_URL=https://example-domain.com # metadata / canonical URLs
```

`MM_SITE_URL` is a **build arg** — Next inlines `NEXT_PUBLIC_*` at build time
(plan 10 note) → rebuild the web image:

```bash
cd /mnt/c/hanadicrochet/deploy
./pipeline.sh    # or, for a config-only change: docker compose build web && docker compose up -d web
```

Caddy then **auto-provisions and auto-renews** the Let's Encrypt certificate and
301-redirects HTTP→HTTPS — no Caddyfile edit, no cron, nothing to maintain
(caddyserver.com/docs/automatic-https). Certificates persist in `deploy/data/caddy/`.

### 4. Verify — from OUTSIDE the home network (phone on mobile data)

- [ ] `https://<domain>/` → 200; certificate valid, issuer Let's Encrypt
- [ ] `http://<domain>/` → **301** → `https://`
- [ ] `https://<domain>/en`, `/ar` (RTL) → 200
- [ ] `https://<domain>/api/health` → JSON, db connected
- [ ] chat: two devices, realtime message delivery over TLS (WebSockets through
      Caddy — the same path verified on 2026-09-28)
- [ ] a catalog product page and the order-status flow render (SSR path web→api
      intact through the new public URL)
- [ ] sanity from the PC itself: `curl -sI https://<domain>/ | head -5`

### 5. Re-run the scheduled backup once (02 task → **Run**)

So the first on-domain backup exists before relying on the public site.

## Rollback (back to LAN-only HTTP, ~2 minutes)

1. `.env`: `CADDY_SITE=http://`, `MM_SITE_URL=` (empty)
2. Rebuild the web image (`./pipeline.sh` or `docker compose build web && docker
   compose up -d web`)
3. Router forward + 443 firewall rule may stay — harmless; 443 just stops serving.

The Let's Encrypt cert in `deploy/data/caddy/` is simply unused; it expires quietly
after 90 days, which is fine (re-issued automatically if the domain is re-enabled).

## Acceptance

- Domain resolves at Cloudflare (grey-cloud A/CNAME per plan 20261004-1823/02),
  router forwards 80/443, `.env` wired, and after one pipeline run: every item in
  step 4 passes — **including from outside the LAN**.
- (Only if the owner opts into the Cloudflare proxy) the proxied/DNS-01 path verified
  with the same checklist, per plan 20261004-1823/02.

## Open

- The actual domain name — owner's choice; nothing in this plan depends on the
  literal name.
- Dynamic-IP handling (DDNS) applies exactly as in plan 20261004-1823/02 — the
  pre-buy check is about the router's public IP, not the OS; if the line is dynamic,
  the DDNS follow-up (there) also runs on this host (Task Scheduler instead of a
  systemd timer, same shape as the 02 backup task).
