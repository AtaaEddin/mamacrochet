# 02 — Frontend: conversation management UI (delete + guest new)

status: done

Frontend only. Uses the generated client from sub 01 (`chat.deleteThread`,
`bootstrapVisitorThread` with `reset`).

## 1. Customer delete (user mode)

- Thread list rows (the shared list markup: desktop left pane + mobile list
  step): a small `Trash2` icon button (end of the row, `aria-label` /
  `title` = "Delete conversation") → shadcn `AlertDialog` confirm:
  - title: "Delete this conversation?"
  - body: "It disappears from your list. If Hanadi writes to it again, the
    conversation comes back." (en/ar/tr)
  - confirm → `deleteThread(id)` (`lib/chat/api.ts` wrapper) → on ok:
    optimistic removal from `threads`; if the deleted thread was the one
    open (`?thread=`), also `onCloseThread()` (back to the list). On error:
    shown in the dialog footer and the dialog stays open (the
    `category-manager` confirm pattern).
- Guest mode gets no delete (there is no guest list; the reset below is the
  equivalent).

## 2. Guest "New conversation" (the capped reset)

- Top-bar control (guest mode only): a `Plus` button (`aria-label` =
  "Start a new conversation") → `AlertDialog` confirm ("Starting a new
  conversation closes this one for you. Hanadi can still see it.") →
  `use-chat.resetGuestThread()`. Guests have no list step, so the control
  lives in the top bar (reachable on mobile + desktop).
- `resetGuestThread(): void` — guest mode only: sets a one-shot `resetRef`
  flag + bumps `runKey` (same path as `reconnect`), re-running the bootstrap
  effect with `reset: true` → `bootstrapVisitorThread(guestId, reset)`.
- On success: new thread + token swap in. On 429 (the 5/24 h cap): the
  server kept the old thread open, and so does the client — the session
  effect re-loads the old thread, so only the transient error notice shows
  (no retry/error state over a conversation that still works). A plain
  (non-reset) bootstrap failure still surfaces as the retry state.

## 3. `lib/chat/api.ts`

- `deleteThread(threadId): Promise<ChatResult<void>>` → generated
  `Chat.deleteThread`.
- `bootstrapVisitorThread(guestId, reset = false)` — passes `reset` in the
  body (the generated type has it after sub 01's `gen:api`).

## 4. i18n (`messages/{en,ar,tr}.json`, `ChatPanel`)

- `deleteConversation`, `deleteConfirmTitle`, `deleteConfirmBody`,
  `deleteConfirmAction`, `cancel`, `newConversationGuest`,
  `newConversationGuestTitle/Body/Action`. ar/tr written in natural, warm
  brand voice (she/her feminine second person).

## Backend fix surfaced while verifying (sub 01 endpoint)

- `ChatService.DeleteThreadAsync`: a guest-linked visitor thread has
  `CustomerId = null`, so the original `thread.CustomerId != user.Id` check
  404'd a user's own (device-linked) threads. "Mine" now mirrors
  `ListThreadsAsync`: own `CustomerId` OR the thread's `GuestId` is linked to
  the user.

## Definition of done

- `pnpm typecheck` · `pnpm lint` (zero warnings) green. ✅
- Browser-verified (`frontend/scripts/verify-conversation-mgmt.mjs`,
  playwright-core vs system Chromium) — A/B/C create the user's thread via
  the signed-in `POST /chat/threads` (not the guest limiter), so only D/E
  touch the 5/min/IP guest bucket. All green:
  - A (mobile EN): delete → optimistic removal → server hides it → re-appears
    when the customer sends.
  - B (desktop EN): delete the open thread → back to the list.
  - C (mobile AR): delete dialog + title render in Arabic/RTL.
  - D (mobile EN dark, guest): new conversation → fresh thread, old one
    closed `guest_reset`.
  - E (API): reset closes the old thread; 5/24 h cap → the 6th reset is the
    app-level 429 (`rate_limited`, the cap message).
