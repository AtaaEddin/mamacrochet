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
   - **Dynamic-IP caveat:** the A record presumes a stable public IP. If the Pi sits
     behind a dynamic-IP or CGNAT connection: get a static IP from the ISP, or use a
     short-TTL A record kept fresh by a small update script (separate follow-up plan if
     needed).
3. **Router** — forward TCP **80 + 443** to the Pi (Caddy is the only container that
   publishes ports; both must be reachable from the internet).

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
- Dynamic-IP handling if the Pi has no stable public IP (follow-up plan if needed).
