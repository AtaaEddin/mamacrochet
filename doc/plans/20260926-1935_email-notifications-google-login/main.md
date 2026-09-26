# Post-Release-1: Email, Notifications & Google Sign-In

status: proposed
created: 2026-09-26 19:35 (+03)
owner: agent
context: decisions D13/D17/D18 in
`doc/plans/20260926-1816_mvp-platform-foundation/main.md`

## Goal

The "trust & reach" release, right after release 1:

1. **Email sending** (Google SMTP — D13): verification, forgot-email, password reset,
   notifications, hiring invite/decline.
2. **Notifications for all roles** (customer, employee, admin — D18): in-app center +
   localized email.
3. **Google sign-in** (OAuth 2.0/OIDC — D17): the core one-tap login.

## Why after release 1 (owner decision, 2026-09-26)

Release 1 must first prove the core loop (guest chat → order → receipt → delivery)
works; email, notifications, and Google login ship in the very next version.

## Sub-plans

| #  | File                  | Responsibility                                  | Status   |
|----|-----------------------|-------------------------------------------------|----------|
| 01 | 01-email-sending.md   | Google SMTP transport + transactional outbox    | proposed |
| 02 | 02-notifications.md   | Notification center + event catalog (all roles) | proposed |
| 03 | 03-google-sign-in.md  | Google OAuth/OIDC login + guest merge           | proposed |

## Execution order

1. 01 (email) — the transport everything else sends through
2. 03 (Google sign-in) — builds on ASP.NET Identity from the main plan (03-identity)
3. 02 (notifications) — uses email (01) + SignalR

## Open questions

- Which Google account sends mail (personal Gmail vs Workspace on the store's domain)?
  Owner to confirm; custom domain ⇒ set SPF/DKIM.
- Google OAuth client: register dev + prod origins (owner creates the OAuth app in
  Google Cloud Console).
