# 02 — Plain-HTTP LAN auth cookie

status: done

## Problem

`Program.cs` set the application cookie to `CookieSecurePolicy.Always` outside Development.
The documented self-hosted default (`deploy/.env.example`: `CADDY_SITE=http://`) serves the
site over plain HTTP on a LAN address. Browsers accept `Secure` cookies only from a secure
context; `http://localhost` counts as one, `http://192.168.x.x` does not. So on the Pi:

- sign-in returns 200, but the `hc.auth` cookie is dropped by the browser;
- every following request is 401 → "login does nothing" for staff and customers.

The existing localhost smoke test cannot see this, which is why it survived plan 10.

## Decision

Keep HTTPS-only as the **default**; allow an explicit opt-out per install:

```
Auth__RequireHttps=false   # only for a plain-HTTP LAN deployment
```

- default: `Always` outside Development (unchanged security posture);
- `false`: `SameAsRequest` → `Secure` still appears whenever the request is https, including
  behind Caddy (forwarded headers already restore the scheme from `X-Forwarded-Proto`);
- Development: `SameAsRequest` (unchanged).

## Changes

- New `src/Hanadicrochet.Api/Services/AuthCookiePolicy.cs` — resolves the policy from
  environment + configuration (single place, unit-testable).
- `Program.cs` — use it for `cookie.Cookie.SecurePolicy`.
- `deploy/.env.example` + `deploy/README.md` — document the switch for LAN installs.
- Tests:
  - `AuthCookiePolicyTests` — dev default, prod default, prod opt-out (pure logic, all paths).
  - Endpoint test — a sign-in over plain HTTP with the opt-out returns `Set-Cookie` **without**
    `Secure`, and the cookie actually authenticates (`/identity/me` → 200).

## Out of scope

Forcing HTTPS, TLS certificates for IP addresses, or changing `SameSite`.

## Verification

- `AuthCookiePolicyTests` (7 cases: dev default, prod default, opt-out, explicit true in
  both environments, blank value, invalid value) → green.
- The end-to-end test (`Login_PlainHttpOptOut_SetsCookieBrowserKeepsOnLanIp`) compiles
  but could not be executed here: it needs the PostgreSQL-backed `ApiTestFixture`.
  Run `dotnet test` where Postgres/Docker is available before deploying.
