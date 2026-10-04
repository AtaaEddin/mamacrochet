# Deploy pipeline + Cloudflare domain

status: proposed
created: 2026-10-04 18:23 (+03)
owner: agent (user request: "pipeline on deployment: first run tests API + UI, then clean
resources on the target machine (Raspberry Pi), then deploy (build docker, etc.); I'll get a
domain from Cloudflare myself — accommodate that in the plan/deployment and report how to
connect the domain")

## Why

`deploy.sh` (plan 10) works, but: nothing stops broken code from shipping to the target,
the Pi's scarce disk/RAM are never reclaimed between deploys, and the site has no public
identity yet — no domain, no HTTPS. This plan:

1. A one-command deploy pipeline **on the target machine**: tests (API + UI) →
   pre-deploy backup → resource cleanup → deploy → post-deploy cleanup. A failed test
   aborts **before** anything touching the running stack is done.
2. A **Cloudflare domain** (owner buys it via Cloudflare Registrar) wired to Caddy for
   automatic Let's Encrypt HTTPS, with a documented upgrade path to the proxied
   (orange-cloud) setup.

## Sub-plans

| #  | Scope                                                                          | File                          | Status    |
|----|------------------------------------------------------------------------------|-------------------------------|-----------|
| 01 | Deploy pipeline on the target machine: test → backup → clean → deploy → post-clean | 01-deploy-pipeline.md | proposed |
| 02 | Cloudflare domain: registration, DNS, HTTPS via Caddy, `.env` wiring, verification, optional proxied upgrade | 02-cloudflare-domain.md | proposed |

## Decisions

- **Tests run in Docker on the target — not a native SDK install on the Pi.** The
  backend suite (208 xUnit tests) needs a real Postgres, so the pipeline runs it in an
  `mcr.microsoft.com/dotnet/sdk:10.0` container against an **ephemeral**
  `postgres:16-alpine` container (no volume → auto-removed). The frontend suite is
  `pnpm test` (Vitest, jsdom, no browser) in `node:22-alpine`. Rationale: no .NET SDK /
  Node toolchain permanently on a low-power Pi, hermetic (same versions on dev box and
  Pi), and test containers are transient tooling — not stack services, so the "4
  production containers" rule is untouched.
- **Playwright e2e (37 checks) is NOT in the pipeline** — it needs a browser and the live
  Aspire dev stack; it stays opt-in/dev-only per plan 20261004-0554/05.
- **Cleanup = explicit per-resource prunes; never volumes, never `image prune -a`,
  never `system prune`.** Full safety table in 01. Rationale: `--volumes`/
  `docker volume prune` would destroy the postgres/uploads/TLS named volumes;
  `image prune -a` would wipe base images and force re-pulls every deploy.
- **Order: tests → backup → clean → deploy → post-clean.** The post-deploy prune is what
  reclaims the old release's image layers (they become dangling once `up -d` swaps the
  tag). A failed test leaves the running stack 100% untouched.
- **Pre-deploy backup** (existing `backup.sh`) before every deploy that carries a
  migration; skipped only on fresh install (no data exists yet).
- **Domain: DNS-only (grey cloud) is the default** — Caddy's existing Let's Encrypt
  HTTP-01 flow works unchanged (LE must reach the Pi's port 80 directly). The proxied
  (orange-cloud) upgrade is documented in 02 and uses Caddy's `dns.providers.cloudflare`
  module (DNS-01 via a CF API token) — chosen because HTTP-01 is unreliable through the
  Cloudflare edge.
- **Owner buys the domain through Cloudflare Registrar** (at cost, no markup; the zone
  is created automatically with Cloudflare nameservers — no nameserver change needed).

## Sources

- Cloudflare Registrar — register a domain (steps, verified email, no IDNs):
  https://developers.cloudflare.com/registrar/get-started/register-domain/
- Cloudflare Registrar — domains at cost / no markup; purchased domains automatically
  use Cloudflare for authoritative DNS:
  https://developers.cloudflare.com/fundamentals/manage-domains/add-site/
- Caddy module `dns.providers.cloudflare` — DNS-01 usage, token permissions
  (`Zone.Zone:Read` + `Zone.DNS:Edit`), `tls { dns cloudflare … }` Caddyfile syntax:
  https://github.com/caddy-dns/cloudflare
- Cloudflare proxy status — per-record Proxied vs DNS-only semantics:
  https://developers.cloudflare.com/dns/proxy-status/
- Let's Encrypt behind a Cloudflare proxy — HTTP-01 vs DNS-01 behavior:
  https://community.letsencrypt.org/t/how-does-lets-encrypt-work-when-i-use-cloudflare-proxy-with-ssl/242266
- .NET SDK containers — arm64 `10.0-noble` tags; "Test .NET Applications with SDK
  Container" pattern: https://github.com/dotnet/dotnet-docker (README.sdk.md,
  samples/build-in-sdk-container.md)
