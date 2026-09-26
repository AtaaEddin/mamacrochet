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
- Email: SMTP (provider to be confirmed with owner — self-hosted deliverability is
  unreliable without a transactional email service). Templates exist in en/ar/tr (plan 08).
- Security: rate-limit auth endpoints, CSRF protection for cookie flows, strong password
  policy (ASP.NET Identity defaults), audit note on sensitive admin actions.

## Tasks

- [ ] Identity schema + migrations (users, roles, roles, refresh/reset tokens)
- [ ] API: register, verify, login, logout, forgot-email, reset-password, me (get/update profile)
- [ ] Frontend: /register, /login, /verify, /forgot-email, /reset, /account; /staff/login
- [ ] Authorization policies (Customer / Employee / Admin) enforced in API middleware
- [ ] Admin users page: list/search/create/edit/deactivate/delete/roles/assignment
- [ ] Email templates (en/ar/tr) + SMTP config (dev: local dev server, e.g., MailHog-equivalent)

## Acceptance

- Full register→verify→login flow; forgot-email→reset works end-to-end (test SMTP).
- Staff login separate from customer login; RBAC enforced server-side (wrong role → 403).
- Admin can disable a user and that user's session is rejected; all admin user actions
  work from mobile UI.
