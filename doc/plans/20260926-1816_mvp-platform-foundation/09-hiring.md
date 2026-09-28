# 09 — Hiring (Public)

status: done
parent: main.md

## Implementation decisions (recorded 2026-09-27, web-verified)

- **Areas** (mirrors plan 04's `/staff` + `/catalog` split and the existing
  `/admin/users`): public submit under `POST /hiring` (multipart), admin queue
  under `/admin/hiring/*` (Admin policy). Admin mutations are covered by the
  existing typed CSRF middleware (`/admin` prefix); the public multipart submit
  is outside `/identity`|`/admin` and uses `.DisableAntiforgery()` (same reason
  as the avatar upload — form-bound auto-antiforgery would need the built-in
  middleware, which we don't register).
- **Entities**: `HiringApplication` (Id = 32-hex, `NormalizedEmail` UNIQUE →
  re-applying updates the same row), `HiringApplicationFile`,
  `HiringApplicationEvent` (status history: submitted / re_applied / accepted /
  declined — the plan's "keeps status history"). Status = `new → accepted |
  declined`; accept/decline are only valid from `new` (a decided row can only
  re-enter via a new application). `Languages` = `string[]` (Npgsql `text[]`).
  `DecidedById → AppUser` Restrict (audit trail survives if the admin account
  is soft-deleted). `AdminAuditLog` row written in the same save (plan 03
  pattern).
- **Accept**: reuses plan 03's temp-password flow (`TempPasswords` +
  `UserManager.CreateAsync`, `MustChangePassword = true`, `IsEmployee = true`) →
  admin shares credentials offline (release 1 has no email, D13). Email may be
  corrected in the accept dialog; taken email → 409 `email_taken` (admin can
  then promote an existing customer via `/admin/users` — no duplicate-user path
  is invented here). Release-1 note: the plan's acceptance line "decline sends
  the localized email" is deferred with D13 (offline contact per scope).
- **Public submit safety (D16 spirit)**: honeypot field (`company`) — a filled
  honeypot gets a warm 200 without storing anything; `/hiring` joins the strict
  rate-limit bucket (30/min per IP, same as auth actions) in `Program.cs`;
  validation: name 2–80, email ≤ 320, phone 3–20, country 2–64, nationality
  ≤ 64, 1–6 languages (2–32 each), previous work ≤ 4000, message ≤ 2000,
  ≤ 3 files × 10 MB.
- **Files (previous work)**: admin-only, no image processing (these are
  proof, not catalog images — the ImageSharp pipeline is plan 04's). Types by
  magic bytes only (never the extension / Content-Type — verified practice,
  e.g. Baeldung "Determine if a File Is a PDF" `%PDF-` / `25 50 44 46 2D`;
  same hand-rolled approach the repo already uses in
  `AvatarImages.DetectExtension`; no new dependency per AGENTS.md): jpg,
  png, webp, pdf. Stored at `uploads/hiring/{appId}/{fileId}{ext}`
  (deterministic, D8); served `GET /files/hiring/{appId}/{storedName}` behind
  the Admin policy with the DB row re-verified (no path traversal: stored
  names are `{32-hex}.(jpg|png|webp|pdf)`).
- **Re-apply**: updates the row, replaces the file set (old files deleted
  best-effort), resets status to `new`, appends `re_applied` event.
- **Frontend**: public `/join` (server shell + one client form, warm brand
  voice, mobile-first, success state with the existing confetti-hearts
  illustration); admin `/admin/hiring` (table + status filter + detail dialog
  with files + history; accept dialog pre-fills the application's contact
  data; temp-password handoff dialog reuses plan 03's pattern). Admin entry:
  second icon in the header badge (HeartHandshake → /admin/hiring) next to the
  team desk; footer link "Join the team" → /join. Multipart submit goes
  through raw `fetch` FormData (same precedent as `uploadAvatar`).
- **i18n**: new `Join` + `AdminHiring` namespaces in en/ar/tr; new ApiError
  codes registered in `errors.ts` (`file_too_big`, `too_many_files`,
  `unsupported_file_type`, `already_decided`, `hiring_not_found`,
  `invalid_email`, `invalid_language`).
- **Dev isolation (this session only, no repo changes)**: the other agent runs
  the Aspire stack on :8085/:3000 with its own Postgres; this branch is
  verified in a git worktree with a standalone stack — dedicated
  `postgres:18.3` container (127.0.0.1:5433), API on :8086
  (`dotnet run`, env-overridden connection string + `Cors__Origins`),
  `next dev -p 3001` with `NEXT_PUBLIC_API_URL=http://localhost:8086`.
  Note for future dev sessions: `NEXT_PUBLIC_API_URL` must stay on the
  `localhost` host (not `127.0.0.1`) when the page runs on `localhost` —
  SameSite=Lax antiforgery cookies are not sent cross-site, which 403s
  every mutation.
- **base-ui 1.8 dialog stacking limitation**: two *open* controlled dialogs
  (`<Dialog open>`) unmounted in the same render tick leave the lower one's
  portal (popup + inert overlay) orphaned in `document.body`, permanently
  blocking the page. Hiring dialogs therefore follow plan 03's proven
  one-dialog-at-a-time pattern: opening Accept/Decline swaps out (not stacks
  on) the detail dialog. Keep this in mind for any future stacked-dialog UI.
- **Latent bug fixed while verifying** (`src/lib/api/client.ts`):
  `withCsrfRetry` rebuilt the retried request from the *already-consumed*
  fetch `Request` (`new Request(consumed, {headers})` throws "Cannot construct
  a Request with a Request object that has already been used"). Now the
  original is cloned before the first fetch; the retry re-wraps the clone.
  Unreachable in normal flows (retries are rare) but a guaranteed crash on
  every 403-csrf retry.

## Verification (2026-09-27, browser-verified)

Stack: worktree branch `plan/09-hiring`, standalone Postgres :5433 + API
:8086 + `next dev` :3001. `dotnet build` 0 warnings, `pnpm typecheck` +
`pnpm lint` clean. Playwright (mobile 390×844 + desktop 1280×900, light +
dark) ran the full flow, all green:

- `/en/join` mobile light: submit with 2 file uploads → success state +
  confetti; footer "Join the team" link present.
- Desktop light + dark: form renders, dark tokens correct.
- `/ar/join`: `dir=rtl`, Arabic copy, layout mirrored.
- Admin: login → header badge → `/en/admin/hiring` queue (all rows,
  pagination), status filter (New/All/Accepted), detail dialog (files +
  event history), accept dialog (prefilled) → confirm → temp-password
  dialog (shown once) → Done → table interactive again, decline flow with
  note → row status updates, accepted filter.
- Non-admin (employee) account: `/en/admin/hiring` shows the "Admins only"
  card (403 gate) — no data leak.
- API-level (curl): public submit 200, honeypot 200-no-store, re-apply
  resets to `new` + `re_applied` event, accept 200 + audit log,
  accept with taken email 409 `email_taken`, decline 200 + note in detail,
  second accept/decline 409 `already_decided`, non-admin 403, admin file
  serve 200 (employee 403, bad name 404), rate bucket present in config.

Note: screenshot review is recorded but the current model cannot view
images; behavior/structure checks (RTL dir, dialog stacking fix, table
interactivity after dialogs) cover the visual-critical paths.

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

- [x] Entity + migration: HiringApplication (+ files)
- [x] API: public submit (rate-limited), admin list/detail/accept/decline
- [x] Frontend: /join form (validation, uploads, success state), admin hiring page
- [x] Acceptance wiring into plan 03 account creation (offline credentials in release 1)

## Acceptance

- Anonymous visitor submits the form on a phone; admin sees it in the queue;
  accept creates a working employee login end-to-end; decline is recorded
  (release 1: offline contact — the localized email is deferred with D13).
