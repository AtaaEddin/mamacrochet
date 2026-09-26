# 03 — Identity, Accounts & Roles

status: proposed
parent: main.md

## Goal

Customer self-service accounts + staff accounts with RBAC, and admin user management.

## Scope

- Roles: `Customer`, `Employee`, `Admin` (flags on one User entity; admin assigns).
- Customer flows (release 1, **no email sending**): register (name, email, phone,
  password) → account active immediately → login. No verification email, no
  forgot-email page, no self-service reset in release 1 — **admin resets a user's
  password** (temporary password shared offline, forced change on next login).
  Email-based verification/reset return with the future email plan (D13).
- **Guest mode (D14)**: anonymous visitors have a device `guestId` (random UUID in
  localStorage, sent with API/chat requests). Guests can open chat threads and create
  orders (plans 05/06). At confirmation the guest logs in or registers → the thread +
  order link to the account (idempotent; first account link wins).
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
- Email (owner decision 2026-09-26, D13 — **post release 1**): when email comes back,
  send from a Google account via SMTP (`smtp.gmail.com:587` STARTTLS) — OAuth 2.0
  (XOAUTH2) in production (basic auth retired by Google; required for Workspace),
  app password (2SV) only as a dev fallback, refresh token in `.env`, behind an
  `IEmailSender` abstraction. **Nothing email-related is built in release 1.**
  Sources: developers.google.com/workspace/gmail/imap/xoauth2-protocol,
  support.google.com/mail/answer/81126.
- Security: rate-limit auth endpoints, CSRF protection for cookie flows, strong password
  policy (ASP.NET Identity defaults), audit note on sensitive admin actions.

## Tasks

- [ ] Identity schema + migrations (users, roles)
- [ ] API: register, login, logout, me (get/update profile), admin password-reset
- [ ] Guest mode: guestId issuance/validation + link-to-account endpoint (order + thread)
- [ ] Frontend: /register, /login, /account; /staff/login; “sign in to confirm” gate
      component used at order confirmation
- [ ] Authorization policies (Customer / Employee / Admin) enforced in API middleware
- [ ] Admin users page: list/search/create/edit/deactivate/delete/roles/assignment +
      password-reset action
- [ ] (deferred — future email plan D13) verification / forgot-email / reset flows

## Acceptance

- Register→login flow works with no email involved; admin password reset works
  (forced change on next login); guest→account linking works for an order + thread.
- Staff login separate from customer login; RBAC enforced server-side (wrong role → 403).
- Admin can disable a user and that user's session is rejected; all admin user actions
  work from mobile UI.
