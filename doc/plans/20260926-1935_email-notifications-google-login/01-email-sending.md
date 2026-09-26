# 01 — Email Sending (Google SMTP)

status: proposed
parent: main.md

## Scope

- `IEmailSender` + Google SMTP transport (decision D13, verified 2026-09-26):
  `smtp.gmail.com:587` STARTTLS, **OAuth 2.0 XOAUTH2** (client id/secret + refresh
  token in `.env` — never in the repo); app password (2SV enabled) as a dev fallback
  only. Basic auth is retired by Google; OAuth is required for Workspace.
  Sources: developers.google.com/workspace/gmail/imap/xoauth2-protocol,
  support.google.com/mail/answer/81126.
- **Transactional outbox** (no external queue — low-power target): `OutboxEmail`
  table (to, subject key, body template + data, status, retries), background sender in
  the API process (IHostedService), retry with backoff (max 3), failures logged for
  admin.
- **Localized templates (en/ar/tr)**: verification, forgot-email, password reset,
  order-lifecycle notifications, hiring invite/decline. Template engine: keep simple —
  verify current lightweight options online (e.g., Scriban vs plain Razor templates)
  before choosing (plan rule: search first).
- Volume: dozens–low hundreds/day — far under Gmail daily sending limits.

## Tasks

- [ ] Google OAuth setup: client credentials + refresh token flow, config keys in
      `.env.example` (empty values)
- [ ] Outbox table + migration + sender service (retry/backoff, concurrency 1)
- [ ] Template system + en/ar/tr templates for all flows above
- [ ] Self-service flows re-enabled: verify email, forgot-email, password reset
      (the UI pages exist from release 1 but were wired to "admin resets" — reconnect)
- [ ] Tests: outbox happy path, retry on failure, localization, token expiry handling

## Acceptance

- Register → verification email arrives (test Gmail account); forgot-email → reset
  link works; a notification email arrives in the recipient's profile language;
  SMTP failures are retried and visible in the admin log.
