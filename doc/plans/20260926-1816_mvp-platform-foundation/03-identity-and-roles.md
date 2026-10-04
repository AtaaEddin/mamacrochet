# 03 — Identity, Accounts & Roles

status: done
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
- **Typed error envelope (implemented 2026-09-27)**: every JSON 4xx/429/500 body is
  `ApiError { code, message }` — including auth failures (cookie `OnRedirectToLogin` /
  `OnRedirectToAccessDenied` overridden to write 401/403 JSON instead of 302/empty, since
  .NET 10 auto-returns empty bodies for `IApiEndpointMetadata` endpoints). Error codes:
  `bad_credentials`, `unauthenticated`, `forbidden`, `deactivated`, `staff_only`,
  `self_modification`, `invalid`, `email_taken`, `user_not_found`, `guest_already_linked`,
  `locked` (423), `rate_limited` (429), `server_error` (500), `csrf`. Frontend maps `code`
  to localized messages. File 404s stay empty (binary endpoint).
- **CSRF: token-based** — `GET /antiforgery` → token; mutations under `/identity` `/admin`
  send `X-CSRF-TOKEN`. Custom typed middleware (typed 403 JSON). .NET 10 antiforgery tokens
  are scoped to the authenticated principal → middleware MUST run after
  `UseAuthentication()`. Multipart endpoints (`IFormFile`) auto-get antiforgery metadata in
  .NET 10 → `.DisableAntiforgery()` keeps the custom middleware as the single validation
  path. Sources: learn.microsoft.com/aspnet/core/security/anti-request-forgery + .NET 10
  ref-pack XML.
- **Temp passwords** (admin create/reset): generated server-side, returned once, satisfy
  the FULL default Identity policy (8+ chars, upper, lower, digit, non-alphanumeric symbol;
  `RequireNonAlphanumeric = true` documented explicitly), force change on next login
  (`MustChangePassword`).
- **Admin actions audited** in `AdminAuditLogs` (actor, target, action, note, at) in the
  same save as the change: `user.created`, `user.roles.changed`, `user.assigned`,
  `password.reset`, `user.deleted`. Self-modification guard: an admin cannot change their
  own record (403 `self_modification`).
- **Soft semantics**: users are deactivated (`IsActive=false`) or soft-deleted
  (`DeletedAt` + security-stamp rotation) — never hard-deleted; both block sign-in;
  deleted users 404 in admin lists; sessions of deactivated users are rejected
  (`ActiveUserAuthorizationHandler`).
- **Guest linking (D14)**: `POST /identity/guest-link` idempotent, first-account-wins;
  `guestId` format validated; result `GuestLinkResult { linkedAt }`.
- **Avatars**: local disk `uploads/avatars/{userId}-{guid}.{ext}`, magic-byte detection
  (jpg/png/webp), max 1 MB, opaque validated file names, old file best-effort cleanup,
  `GET /files/avatars/{fileName}` (404 on missing/invalid name, path traversal blocked).
- **Rate limiting** (.NET 10 built-in `RateLimiterOptions`): 30/min/IP on `/identity` +
  `/admin`, 300/min/IP default; rejection = typed `ApiError("rate_limited")` 429.
- **OpenAPI / typed client (.NET 10)**: `app.MapOpenApi()` default route is
  `/openapi/v1.json` (source:
  learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0).
  Success schemas declared per endpoint with `.Produces(status, typeof(T))` — .NET 10
  replaced the old `WithResults` (`OpenApiRouteHandlerBuilderExtensions.Produces` / `.Accepts`,
  verified in `Microsoft.AspNetCore.App.Ref` 10.0.12 XML). Error envelope + binary avatar
  (`200 image/*` binary, empty 404) added by operation transformers in `Program.cs`
  (operation id `files.getAvatar`). `pnpm gen:api` → committed
  `frontend/src/lib/api/schema.{json,d.ts}` (openapi-typescript 7 + openapi-fetch).

- **Rate-limit partitioning (frontend session fix)**: the strict 30/min budget now
  covers only auth/admin *actions* (POST/PUT/PATCH/DELETE under `/identity` or
  `/admin`); `GET /identity/me` sits on the default 300/min budget because it fires
  on every page load (header badge + account pages) and was 429-ing live sessions.
- **Browser-only typed client**: cookie auth can't be served from server components,
  so `frontend/src/lib/api/client.ts` wraps fetch with `credentials: "include"`, a
  cached `GET /antiforgery` token (10 s hard timeout → falls through to the server's
  403 `csrf` → the one-shot retry re-fetches), CSRF on mutating `/identity`+`/admin`
  calls, and a raw `uploadAvatar()` helper (OpenAPI can't model multipart `File`).
  `avatarSrc()` resolves `/files/avatars/…` against the API base.
- **`useMe` semantics**: only 401/410 means "no longer signed in" → redirect to
  `/login`; any other failure (429/5xx/network) renders a retry card — transient
  errors must never bounce a signed-in user.
- **Deactivate vs delete are distinct copy** (Scope's two soft ops): deactivating
  keeps the row with an Inactive badge and login fails with `deactivated`; deleting
  is a soft delete (`DeletedAt`) — the row disappears, history is kept, and login
  fails with `bad_credentials` (indistinguishable from a wrong password by design).
- **CORS with credentials (.NET 10)**: `policy.AllowCredentials()` —
  `WithCredentials()` no longer exists in .NET 10 (CS1061).
- **Admin route client-gated**: signed-in non-admins get a 403 card on
  `/admin/users`; anonymous users redirect to `/login`. The server still enforces
  the policy — the gate is UX, not security.
- **UI language**: the site locale follows next-intl routing (URL/cookie);
  the profile language is a stored preference and syncs only when changed, so
  visiting `/ar` doesn't overwrite a logged-in user's saved `en` preference.

## Tasks

- [x] Identity schema + migrations (users, roles)
- [x] API: register, login, logout, me (get/update profile), admin password-reset
- [x] Guest mode: link-to-account endpoint (guestId issuance is frontend, plans 05/06)
- [x] Frontend: /register, /login, /account; /staff/login (the “sign in to confirm”
      gate component ships with the order flow, plans 05/06 — this plan provides the
      pages + the auth library it builds on)
- [x] Authorization policies (Customer / Employee / Admin) enforced in API middleware
- [x] Admin user management API: list/search/create/edit/deactivate/delete/roles/
      assignment + password-reset (audited) — UI page pending with the frontend task
- [ ] (deferred — future email plan D13) verification / forgot-email / reset flows

## Bug fixes

- **2026-10-04 — header showed the customer “My orders” icon to staff/admin**
  (found by owner review): the header `Package` link (`/orders`, plan 05 customer
  status board) rendered for **every** signed-in user, so employees/admins saw a
  “My orders” entry that is meaningless for team accounts (they get an empty
  customer list). Staff/admin have their own order surfaces instead
  (`/staff/orders`, `/admin/orders`). Fix: the `Package` icon renders for
  customers only (`!isStaff`); staff keep “Staff orders” + “Products (team)”,
  admin additionally gets “Admin orders” / “Team desk” / “Join requests”.

## Acceptance

- Register→login flow works with no email involved; admin password reset works
  (forced change on next login); guest→account linking works for an order + thread.
- Staff login separate from customer login; RBAC enforced server-side (wrong role → 403).
- Admin can disable a user and that user's session is rejected; all admin user actions
  work from mobile UI.
