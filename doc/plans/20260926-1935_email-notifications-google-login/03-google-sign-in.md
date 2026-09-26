# 03 — Google Sign-In

status: proposed
parent: main.md

## Goal (decision D17)

One-tap Google login for customers — a core feature, shipping in this release.

## Scope

- ASP.NET Core Identity external login: Google **OIDC** (OpenID Connect) via the
  supported .NET 10 handler (verify current recommended approach online before
  implementing — built-in `Microsoft.AspNetCore.Authentication.Google` vs OpenIddict
  client; pick per official docs).
- UI: "Continue with Google" button on /login, /register, and the **"sign in to
  confirm" gate** (guest confirmation flow) — brand-styled per plan 11 of the main
  plan.
- First sign-in → creates a Customer account (Google email is inherently verified),
  then a light profile step (display name, phone — optional).
- **Guest merge**: if the signed-in email matches a guest's stored email (from a
  guest order contact or thread), show a confirm-merge step → links that guest's
  orders + threads to the account (same linking semantics as D14; explicit user
  confirmation for safety).
- Staff: **no** Google sign-in (staff accounts stay admin-created, email+password).

## Security notes

- Standard OAuth2/OIDC security: state/nonce, PKCE where applicable, redirect-URI
  allowlist (dev + prod origins only), account-enumeration care (generic messages),
  session fixation behavior consistent with cookie auth (main plan 03).

## Tasks

- [ ] Owner creates Google OAuth client (web origins dev+prod); credentials →
      `.env.example` placeholders only
- [ ] Identity external-login wiring (claims, verified-email flag, role=Customer)
- [ ] UI: Google button on login/register/confirm gate (brand-styled)
- [ ] Guest merge flow (email match → confirm → link orders + threads)
- [ ] E2E test: fresh Google login, merge case, staff unaffected

## Acceptance

- New user logs in with Google → account exists (email verified) → can order + chat.
- Guest who ordered with the same email signs in with Google → merge prompt → orders
  and thread appear under the account.
- Staff login flow unchanged; no Google button on /staff/login.
