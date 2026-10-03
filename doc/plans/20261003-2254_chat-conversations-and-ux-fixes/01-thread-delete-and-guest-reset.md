# 01 — Backend: customer thread delete + capped guest reset

status: done (2026-10-03)

Backend only (`src/Hanadicrochet.Api`). No schema change except the one
nullable column (EF migration, no reindex).

## Done — implementation + verification (2026-10-03)

- `ChatThread.CustomerDeletedAt` (nullable `timestamptz`) + migration
  `20261003203645_AddChatCustomerDeletedAt` (applied by `Migrate()` on dev
  API start; column verified in `hanadicrochet` DB).
- `ChatService.DeleteThreadAsync(user, threadId)` — staff → 403, not-
  customer's → 404, else `CustomerDeletedAt = now` (idempotent, no
  broadcast). Endpoint `DELETE /chat/threads/{threadId}` in the `mine`
  group (cookie auth), `204 No Content`, `WithName("chat.deleteThread")`.
- `SendMessageAsync` clears `CustomerDeletedAt` (thread resumes → row
  returns to the customer's list).
- `ListThreadsAsync` customer branch hides `CustomerDeletedAt != null`
  (admin/employee branches untouched).
- `BootstrapVisitorThreadAsync(…, bool reset)` — reset closes the device's
  active visitor thread (`ClosedReason = "guest_reset"`) then creates a
  fresh one. `MaxGuestResetsPerDay = 5` / 24 h per guestId
  (`GuestResetWindows`, same in-memory pattern as the message budget);
  exceeded → `ApiError("rate_limited", …)` → 429 (explicit in the
  bootstrap handler). `VisitorThreadRequest.reset` (old clients omit it).
- Frontend: `bootstrapVisitorThread(guestId, reset = false)` wrapper
  (call site in `use-chat` still `reset: false` — sub 02 wires the UI).
- `pnpm gen:api` — spec + generated client: new `ChatDeleteThread*`
  types + `Chat.deleteThread`; `reset` on `VisitorThreadRequest`.
- Verified via the live dev stack (curl + DB):
  - bootstrap → thread A; `reset:true` → thread B; A closed with
    `ClosedReason = 'guest_reset'` (visible in staff inbox — kept).
  - resets 1..5 accepted; 6th → **429** `rate_limited` "You have started
    too many new conversations today — please come back in a bit."
    (the global 5/min/IP limiter is a separate, earlier 429 — confirmed
    by message text).
  - unauthenticated `DELETE /chat/threads/{id}` → 401 (CSRF middleware
    answers 403 for cookie-protected mutations without a token — browser
    client always sends one).
  - authed customer delete + staff exclusion verified in the browser in
    sub 02.
- `dotnet build` 0 warnings · `pnpm typecheck` + `pnpm lint` green.


## 1. `CustomerDeletedAt` on `ChatThread` (`Data/Chat.cs`)

- `public DateTime? CustomerDeletedAt { get; set; }` — the customer hid the
  conversation (archive semantics, NOT a hard delete): excluded from that
  customer's thread list; cleared again by any later send (the conversation
  reappears when it resumes); staff/admin lists and the admin trace never
  see it (admin branch of `ListThreadsAsync` is untouched).
- EF Core migration (nullable `timestamp with time zone` column).

## 2. `DELETE /chat/threads/{threadId}` — the customer's delete

- `ChatService.DeleteThreadAsync(user, threadId)`:
  - customers only (`!user.IsEmployee && !user.IsAdmin` — staff keep their
    existing `close`; this route must not be reachable by staff: 403).
  - `thread.CustomerId == user.Id` (the thread's customer), else 404
    (don't leak existence across accounts).
  - sets `CustomerDeletedAt = now`, `UpdatedAt = now`; idempotent.
  - no broadcast (the customer's own list updates client-side; staff views
    are unaffected by design).
- Endpoint: `mine` group (cookie auth), `Results.NoContent()` on success,
  `.WithName("chat.deleteThread")`. Spec + generated client (`gen:api`).
- `SendMessageAsync` clears `CustomerDeletedAt` (thread resumes → list row
  returns) for every access level (guest re-send, customer re-entry, staff
  reply).

## 3. Guest reset on `POST /chat/visitor` (the guest "new conversation")

- `VisitorThreadRequest` gains `reset: bool` (default false — old clients /
  bootstraps unchanged).
- `BootstrapVisitorThreadAsync(…, reset)`:
  - `reset` + the device's active visitor thread exists → close it first:
    `IsClosed = true`, `ClosedAt = now`, `ClosedReason = "guest_reset"`
    (staff Visitors inbox still shows it — nothing erased, auditable), then
    create the new thread (existing path).
  - `reset` + no active thread → just create (same as today).
  - **Limit (the owner's "maybe limit it")**: max
    `MaxGuestResetsPerDevicePerDay = 5` resets per guestId per 24 h —
    in-memory sliding window, same pattern as `GuestMessagesPerMinute`
    (single instance, no Redis — D9). Exceeded →
    `ApiError("rate_limited", …)` → 429 (mapped by the existing
    `ResultFor`). Counter counts accepted resets only.
  - Honeypot + guestId validation unchanged (happens before any reset).
- Constants documented next to the existing guest limiter in `ChatService`.

## 4. Spec + client

- `pnpm gen:api` after the API builds (new `chat.deleteThread` operation;
  `reset` on `VisitorThreadRequest`). Regenerate committed `schema.json`.

## Definition of done

- `dotnet build` 0 warnings (no test project in the repo yet — behavior
  verified via API/browser in sub 02: delete access rules, re-appearance on
  send, reset close+create, reset limit 429).
- Spec + generated client committed; no frontend call sites yet (sub 02).
