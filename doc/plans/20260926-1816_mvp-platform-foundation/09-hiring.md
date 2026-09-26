# 09 — Hiring (Public)

status: proposed
parent: main.md

## Goal

Public "we're hiring" disclosure + application flow, ending in an employee account.

## Scope

- Public page `/join`: short pitch + application form:
  name, phone, email, country, nationality, languages (multi), previous work
  (text description + optional image/PDF uploads), optional message.
- Application: stored with status `new → accepted | declined` + admin notes;
  visible to admin only (list + filter by status/date).
- Accept flow: admin accepts → creates the employee account (email must match the
  application or be corrected) → release 1: admin shares credentials offline (invite
  email with set-password link comes with the future email plan D13).
- Decline flow: admin declines with optional note; release 1: no email — admin
  contacts the applicant offline (phone); localized email comes later (D13).
- Public page is localized (en/ar/tr) and mobile-first.

## Decisions

- Reuse FileStorage for previous-work uploads (private, admin-only access).
- One application per email (re-applying updates the same record, keeps status history).
- No auto-reject; all applications go to the admin queue.

## Tasks

- [ ] Entity + migration: HiringApplication (+ files)
- [ ] API: public submit (rate-limited), admin list/detail/accept/decline
- [ ] Frontend: /join form (validation, uploads, success state), admin hiring page
- [ ] Acceptance wiring into plan 03 account creation (offline credentials in release 1)

## Acceptance

- Anonymous visitor submits the form on a phone; admin sees it in the queue;
  accept creates a working employee login end-to-end; decline sends the localized email.
