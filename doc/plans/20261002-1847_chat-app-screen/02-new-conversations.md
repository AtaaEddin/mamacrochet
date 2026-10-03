# 02 — New conversations for customers and employees

status: proposed

Owner ask: "both customers and employees to be able to open new
conversations as they want."

Today, threads only appear via order creation (per-order thread) or guest
bootstrap (per device). A signed-in customer cannot start a free chat
(e.g. ask about a custom piece before ordering), and an employee cannot open
a conversation with a customer proactively. The schema already supports it:
`ChatThread.OrderId`/`GuestId` are nullable and `CustomerId` is nullable —
no migration, only new rows + endpoints.

## Backend (API only, no migration)

1. `POST /chat/threads` — cookie auth (any signed-in user; the role is
   re-checked server-side):
   - body: `{ subject?: string (≤80, optional), customerId?: string }`
   - **Customer**: creates `{ kind: visitor, customerId: <self> }`.
     `customerId` in the body is ignored (a customer starts threads with
     themselves, not others).
   - **Employee (incl. admin)**: `customerId` is required and must be an
     active, non-deleted **customer** (staff can't open staff threads here).
     Creates `{ kind: visitor, customerId, assignedEmployeeId: <self> }` —
     so it shows up in the staff inbox and the customer sees it as theirs.
   - Returns the new `ThreadDto` (same DTO the list/detail use).
   - No new thread kind: `kind=visitor` means "not bound to an order" —
     the 30-day stale-thread sweep covers these too (D16).
2. `GET /staff/customers?search=&page=&pageSize=` — Employees/Admins:
   searchable list of active customers (display name / phone / email),
   small DTO (`id`, `displayName`, `phone`, `email`) — the picker behind
   the employee's "New conversation".

Both routes join the OpenAPI spec → `pnpm gen:api` regenerates the client.

## Frontend

- **Customer** (`/chat` left list, sub-plan 01's "new" slot): a
  "New conversation" button (Plus) above the list. Click →
  `POST /chat/threads` → open the returned thread (`?thread=`).
- **Employee** (staff Visitors inbox): "New conversation" button → dialog
  with customer search (debounced `GET /staff/customers`) → pick one →
  `POST /chat/threads` → open the thread in the chat surface (same
  navigation as the existing "open in chat" action).
- i18n: `ChatPanel.newConversation` (already reserved in sub-plan 01) +
  `Staff.newConversation*` (button, dialog title, search placeholder,
  empty/no-results, errors) in `en`/`ar`/`tr`.

## Access invariants (already true, asserted in tests/docs)

- `CheckAccessAsync` grants: customer → `CustomerId` match; employee →
  `AssignedEmployeeId` match; admin → any. The new threads satisfy all
  three for the intended parties without service changes.
- `ListThreadsAsync` already returns them to the right owners (customer by
  `CustomerId`, staff by `AssignedEmployeeId`).

## Definition of done (this sub-plan)
1. `dotnet build` 0 warnings · `dotnet test` green (new endpoint tests where
   the repo has endpoint tests).
2. `pnpm typecheck` · `pnpm lint` green; API client regenerated.
3. Browser: customer "New conversation" appears in the list, creates +
   opens a thread; employee dialog finds a customer, creates + opens a
   thread; the thread is visible to both sides. Light + dark, mobile +
   desktop. Screenshots.
4. Plan + `COMMITS.md` updated; clean commit.
