# 02 — Staff can open unclaimed visitor threads (claim-on-open) + first-wins claim

status: done

Frontend (three files) + one small backend method (`ChatService.ClaimThreadAsync`).
Source: API-client plan, notes item 2.

## Bug (verified 2026-10-03)

`ListThreadsAsync` employee branch (documented design —
`20260926-1816_mvp-platform-foundation/06-chat.md`: "the same query feeds both
/chat and the staff inbox. Claim is first-wins") returns assigned threads
**plus unclaimed visitor threads**. `CheckAccessAsync` grants a non-admin
employee a thread only as assignee/customer/linked-guest. So an employee
403s on `GET /chat/threads/{id}` + messages + hub join for any unclaimed
visitor thread — hit from three paths:

1. `/chat` **auto-open** (chat-panel sub-03 effect: newest open thread —
   often a fresh guest thread) → the whole screen lands in error state.
2. **List click** in `/chat` (unclaimed threads sit in the left pane).
3. **"Open"** in the Visitors inbox (`staff-visitors-view.tsx` →
   `/chat?thread=`).

Related gap: `ClaimThreadAsync` does a plain assign + save — last write wins,
so two employees claiming the same thread both "succeed" and the loser gets a
403 when the session loads, instead of a clean conflict. The plan doc says the
claim endpoint enforces first-wins; the code doesn't.

## Decision (main.md)

- **Explicit open = take it.** A non-admin employee opening an *unclaimed*
  thread (inbox "Open", list click — open **or** closed) claims it first,
  then navigates. "First-wins" is the documented claim model; the opener is
  the taker. Admins open directly (full access); customers keep opening
  their own/linked threads directly (they never claim).
- **Auto-open never grabs work.** The auto-open pick skips unclaimed threads
  for plain employees (`assigneeName === null`); admins are unaffected (they
  can open anything), customers' lists never contain unclaimed threads.
- **No list change** — the one-query list design from plan 06 stands.
- **Claim becomes first-wins** (conditional update; loser → 409 `conflict`).
  No schema change, no migration.

## Backend — `src/Hanadicrochet.Api/Services/ChatService.cs`

`ClaimThreadAsync`: keep the existing guards (staff-only via
`LoadStaffThreadAsync`, not-found, visitor-only). Replace the plain assign +
save with a conditional update:

```csharp
var now = DateTime.UtcNow;
var claimed = await db.ChatThreads
    .Where(t => t.Id == threadId && t.AssignedEmployeeId == null)
    .ExecuteUpdateAsync(s => s
        .SetProperty(t => t.AssignedEmployeeId, employee.Id)
        .SetProperty(t => t.UpdatedAt, now), ct);
if (claimed == 0)
{
    var other = await db.ChatThreads.AsNoTracking()
        .Where(t => t.Id == threadId)
        .Select(t => t.AssignedEmployee)
        .FirstOrDefaultAsync(ct);
    return new ChatThreadResult(new ApiError("conflict",
        other is null
            ? "This conversation is no longer available."
            : $"This conversation was just claimed by {other.DisplayName}."),
        null);
}
// then: refresh the row, broadcast threadUpdated, return the DTO
```

- The already-claimed message goes through the existing fallback display
  (the `conflict` code is not in the localized `ApiError` map — same as every
  other conflict error today; localizing all conflict messages is out of
  scope).
- `AssignThreadAsync` stays unconditional (admin re-assignment is allowed).
- 409 is already wired: `ResultFor` maps `conflict` → `Results.Conflict`, and
  the global OpenAPI transformer types every error as the `ApiError`
  envelope — **no spec change, no `pnpm gen:api` re-run needed**.
- No test project exists in the solution; verify in the browser per DoD.

## Frontend

- `chat-panel.tsx`
  - New prop `canOpenUnclaimed: boolean` (page computes: `!isStaff(me) ||
    me.roles.includes("admin")`).
  - Auto-open effect:
    `threads.find((item) => !item.isClosed && (canOpenUnclaimed || item.assigneeName !== null))`.
  - List item click: `onOpenThread` signature becomes
    `(item: ChatThreadListItem) => void` (was `(threadId: string)`).
- `app/[locale]/chat/page.tsx`
  - Pass `canOpenUnclaimed`.
  - Wrap `onOpenThread`: when `isStaff(me) && !me.roles.includes("admin") &&
    !item.assigneeName` → `await chatApi.claimThread(item.id)`; on failure
    `setNotice(r.error.message)` and do **not** navigate; on success
    navigate (existing `notice` state + 6 s auto-clear, same pattern as New
    conversation).
- `staff-visitors-view.tsx`
  - `openThread(id)` → `openThread(it: ThreadItem)`; same claim-first guard
    for non-admins (`!it.assigneeName`; closed threads included — an unclaimed
    closed thread is still unreadable for an employee, and claiming a
    finished thread is harmless: it just records who handled it).
  - Failure surfaces through the existing per-row `actionError` →
    localized `vActionFailed` (same as the Claim/Assign/Close buttons).
  - The explicit Claim button stays (claim without opening).

## Definition of done

- `dotnet build` → 0 warnings.
- `pnpm typecheck` · `pnpm lint` green.
- Browser-verified (real stack; light + dark; en + ar; mobile + desktop):
  1. Employee opens `/chat` with an unclaimed visitor thread present →
     lands in their newest **assigned** conversation (or the pick-list when
     they have none) — no 403, no thread auto-claimed (DB: assignee still
     null after the visit).
  2. Employee clicks an unclaimed thread in the `/chat` list → claimed (DB
     assignee = employee) + conversation opens, messages load.
  3. Inbox "Open" on an unclaimed thread (open and closed variants) →
     claimed + opens.
  4. Admin opens an unclaimed thread → opens without claiming (DB: assignee
     still null).
  5. Customer on `/chat` → auto-open of their own (incl. linked-guest)
     thread unchanged.
  6. Claim race: the admin creates an employee via the existing admin user
     management, then the two staff principals (admin + employee) claim the
     same unclaimed thread via direct API calls in the Playwright script →
     first `200`, second `409` with the "just claimed by …" body.
  7. No console/network 403s on any of the above.
