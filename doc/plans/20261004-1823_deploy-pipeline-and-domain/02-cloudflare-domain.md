# 02 — Cloudflare domain + HTTPS

status: proposed
parent: main.md

## Goal

The site gets a real domain, owned in **Cloudflare** (owner purchases it), with DNS
wired so **Caddy obtains and renews a Let's Encrypt certificate automatically** — the
exact flow plan 10's Caddyfile was designed for, zero Caddyfile changes for the default
path. A proxied (orange-cloud) upgrade is documented as an option, not the default.

## Owner actions (manual, Cloudflare dashboard)

1. **Buy the domain** — dashboard → **Register domains** → search → **Purchase** → pick
   term + contact + payment → complete (~30 s). Registrar prices are at cost, no markup.
   The domain is **automatically added as a zone using Cloudflare nameservers** — no
   nameserver change or verification at another registrar.
   - Prereq: the Cloudflare account email must be verified (ICANN requirement).
   - Cloudflare Registrar does not support internationalized (Unicode) domain names.
2. **DNS records** — dashboard → the zone → **DNS → Records**. The critical choice is
   **proxy status: DNS only (grey cloud)** on every record — Caddy must receive
   Let's Encrypt's HTTP-01 challenge directly on the Pi's port 80; with an orange
   (proxied) record the challenge traffic goes through the Cloudflare edge and HTTP-01
   does not reliably work.

   | Type  | Name  | Content            | Proxy status        |
   |-------|-------|--------------------|---------------------|
   | A     | `@`   | `<Pi public IPv4>` | **DNS only** (grey) |
   | CNAME | `www` | `<apex domain>`    | **DNS only** (grey) |

   Add an `AAAA` record if the Pi has a public IPv6 address.
   - **Dynamic-IP caveat** — the A record presumes a stable public IP. What the
     pre-check outcome means for keeping the record correct:

     | Outcome        | Record maintenance                                   |
     |----------------|------------------------------------------------------|
     | Static public v4 | Set the A record **once** — never touched again.   |
     | Dynamic public v4 | **Automated, not manual:** a small DDNS updater on the Pi (script + systemd timer, ~10 min) checks the public IP and updates the A record via the Cloudflare API **only when it changed** — set up once, then unattended (a few calls per year at most). Separate follow-up plan covers script + timer + API token (`Zone.DNS:Edit`), with a short-TTL A record. |
     | CGNAT (no public v4) | Use the **AAAA** record for the Pi's global IPv6 (prefix is usually stable) — one record, no updater. |

     Alternative to DDNS on a dynamic line: buy a static-IP add-on from the ISP.
3. **Router** — two things:
   - Give the Pi a **stable LAN IP** (a DHCP reservation by MAC in the router admin is
     the simplest; a static LAN IP on the Pi also works) — otherwise a DHCP lease
     change silently breaks the port forward and the site dies without an error.
   - Forward TCP **80 + 443** to that reserved IP (Caddy is the only container that
     publishes ports; both must be reachable from the internet).

## Pre-check (2 minutes, do before buying the domain)

On the Pi:

```bash
curl -s ifconfig.me          # what the internet sees
ip -6 addr | grep global     # any public IPv6?
```

Compare `ifconfig.me` with the **WAN IP shown in the router admin**:

- **Same** (and not in `100.64.0.0/10`) → real public v4: static → the A record is
  set-and-forget; dynamic → DDNS or a static-IP add-on (step 2 caveat).
- **Different** → **CGNAT**: no usable public v4, port forwarding is impossible.
  Cleanest path is usually IPv6 — add an `AAAA` record for the Pi's global v6 address
  (and allow inbound 80/443 for v6 in the router); if there is no global v6 either,
  get a static IP from the ISP or write a follow-up plan for a different approach.

## Deployment wiring (on the Pi)

```dotenv
# deploy/.env
CADDY_SITE=<domain>               # bare domain, no scheme — e.g. hanadicrochet.com
MM_SITE_URL=https://<domain>       # metadata/canonical URL (inlined at web build time)
```

Then run `./deploy/pipeline.sh` (or `./deploy.sh`): on first start with a real domain
Caddy **automatically obtains the Let's Encrypt certificate** (existing behavior — the
Caddyfile is unchanged). The `web` image is rebuilt on every run, which is required here
because `NEXT_PUBLIC_SITE_URL` is a build-time arg.

## Verification (all must pass)

- [ ] `curl -sSI https://<domain>/` → 200, certificate valid for the domain,
      `Strict-Transport-Security` header present.
- [ ] `curl -sSI http://<domain>/` → redirect to HTTPS.
- [ ] `https://www.<domain>/` resolves and serves (CNAME to apex).
- [ ] Chat realtime over `wss://<domain>/api/hubs/chat` (real browser, guest chat
      widget, mobile + desktop) — same surface the plan-10 smoke test covered.
- [ ] Page metadata/canonical shows `https://<domain>` (proves `MM_SITE_URL` was inlined).
- [ ] `docker compose logs caddy` shows the certificate issuance exactly once; renewal
      afterwards is automatic (Caddy renews in the background — no manual step ever).
- [ ] `docker compose ps` → exactly 4 healthy containers (stack shape unchanged).
- [ ] Reachable from outside the LAN (phone on mobile data).

## Optional upgrade — proxied (orange cloud) [not the default]

Benefits: origin IP hidden, Cloudflare WAF / rate limiting / DDoS protection, free edge
TLS (Universal SSL), static-asset caching. Enable only **after** the DNS-only path works
(flip both records' proxy status to **Proxied**):

1. Cloudflare dashboard → **API tokens** → create a token with
   **`Zone.Zone:Read`** + **`Zone.DNS:Edit`** for the zone.
2. `deploy/.env`: `CF_API_TOKEN=<token>` (secret — `.env` is gitignored, never committed).
3. `deploy/docker-compose.yml` — pass it to caddy: add
   `CF_API_TOKEN: ${CF_API_TOKEN:-}` to the caddy service `environment`.
4. `deploy/Caddyfile` — inside the site block:

   ```
   tls {
       dns cloudflare {env.CF_API_TOKEN}
   }
   ```

   → Caddy switches to **DNS-01** challenges via the Cloudflare API (works with the proxy
   ON — no port-80 dependency) and keeps a valid Let's Encrypt cert for the
   Cloudflare→origin connection (set the zone's SSL/TLS mode to **Full (strict)**).
5. Client-facing TLS is now Cloudflare's Universal SSL (Let's Encrypt at the edge); the
   DNS records stay **Proxied**.
6. Re-run the pipeline and re-verify the checklist above (the origin cert is Caddy's
   DNS-01-issued one; the client sees Cloudflare's — both valid for the domain).

## Acceptance

- Owner has purchased the domain in Cloudflare; DNS-only A + CNAME records live;
  router forwards 80/443; `.env` wired; one pipeline run later: every verification item
  passes, including from outside the LAN.
- (Only if the owner opts into the proxy) proxied path verified with the same checklist.

## Open

- The actual domain name — owner's choice; no plan work depends on the literal name.
- Dynamic-IP handling if the Pi has no stable public IP: DDNS follow-up plan
  (Pi script + systemd timer + Cloudflare API token `Zone.DNS:Edit`, short-TTL A
  record) — written only if the pre-check shows a dynamic v4 line.
