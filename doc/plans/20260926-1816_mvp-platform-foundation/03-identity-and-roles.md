# 03 — Identity, Accounts & Roles

status: proposed
parent: main.md

## Goal

Customer self-service accounts + staff accounts with RBAC, and admin user management.

## Scope

- Roles: `Customer`, `Employee`, `Admin` (flags on one User entity; admin assigns).
- Customer flows: register (email + password) → verification email → login;
  **forgot email** (search by email, sends a candidate email — do not leak account
  existence in the response); **password reset** (signed, single-use, expiring link).
- Staff flows: separate `/staff` login (no public registration); admin creates staff users.
- User profile: display name, phone, country, language preference (en/ar/tr), avatar.
- User management (admin): list/search, create, edit, activate/deactivate (soft),
  delete (soft), assign roles, assign customer→employee.
- Deactivated users are rejected on their next authenticated request.

## Decisions

- **Use ASP.NET Core Identity** (cookie template): battle-tested password hashing,
  token infrastructure (verification/reset), no hand-rolled crypto.
  (Confirm current .NET 10 template shape when implementing.)
- Auth: **cookie-based** (httpOnly, SameSite=Lax, secure in prod) for the first-party
  Web + same-origin API; SignalR connects with the same cookie. No public/3rd-party API
  in MVP, so no JWT needed. Re-check guidance if an external API becomes necessary.
- Email (owner decision 2026-09-26, D13): send from a **Google account via SMTP**
  (dedicated store account; not self-hosted mail). `smtp.gmail.com`, port 587 STARTTLS.
  Auth: **OAuth 2.0 (XOAUTH2)** in production — basic auth is retired by Google and OAuth
  is required for Workspace; app password (2SV enabled) only as a dev fallback.
  Refresh token lives in `.env` (never in the repo). Volume is a few dozen messages/day —
  far under Gmail's daily sending limits. Implement behind an `IEmailSender` abstraction
  so the provider can be swapped later without touching callers.
  Sources: developers.google.com/workspace/gmail/imap/xoauth2-protocol,
  support.google.com/mail/answer/81126. Templates exist in en/ar/tr (plan 08).
- Security: rate-limit auth endpoints, CSRF protection for cookie flows, strong password
  policy (ASP.NET Identity defaults), audit note on sensitive admin actions.

## Tasks

- [ ] Identity schema + migrations (users, roles, roles, refresh/reset tokens)
- [ ] API: register, verify, login, logout, forgot-email, reset-password, me (get/update profile)
- [ ] Frontend: /register, /login, /verify, /forgot-email, /reset, /account; /staff/login
- [ ] Authorization policies (Customer / Employee / Admin) enforced in API middleware
- [ ] Admin users page: list/search/create/edit/deactivate/delete/roles/assignment
- [ ] `IEmailSender` + Google SMTP transport (OAuth2 primary, app-password dev fallback,
      in-memory/console sender when no SMTP config) + email templates (en/ar/tr)

## Acceptance

- Full register→verify→login flow; forgot-email→reset works end-to-end (test SMTP).
- Staff login separate from customer login; RBAC enforced server-side (wrong role → 403).
- Admin can disable a user and that user's session is rejected; all admin user actions
  work from mobile UI.
