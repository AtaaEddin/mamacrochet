# 02 — Frontend: conversation management UI (delete + guest new)

status: proposed

Frontend only. Uses the generated client from sub 01 (`chat.deleteThread`,
`bootstrapVisitorThread` with `reset`).

## 1. Customer delete (user mode)

- Thread list rows (the shared list markup: desktop left pane + mobile list
  step): a small `Trash2` icon button (end of the row, `aria-label` /
  `title` = "Delete conversation", `stopPropagation` so the row still
  opens) → `AlertDialog` (shadcn) confirm:
  - title: "Delete this conversation?"
  - body: "It disappears from your list. If Hanadi writes to it again, the
    conversation comes back." (en/ar/tr)
  - confirm → `deleteThread(id)` (new `lib/chat/api.ts` wrapper) → on ok:
    optimistic removal from `threads`; if the deleted thread is the one
    open (`?thread=`), also `onCloseThread()` (back to the list). On error:
    `notice` row above the composer (existing pattern).
- Guest mode gets no delete (there is no guest list; the reset below is the
  equivalent).

## 2. Guest "New conversation" (the capped reset)

- Guest list step: same header row as user mode — title + `Plus` button
  (`onNewConversation` prop already rendered there; pass it for guests too).
- Guest action: `AlertDialog` confirm ("Starting a new conversation closes
  this one for you. Hanadi can still see it.") → `use-chat` gains
  `resetGuestThread(): void` — guest mode only: clears the session
  (`tokenRef=null`, messages, thread), runs the bootstrap effect with
  `reset: true` (one-shot flag consumed by the effect), i.e.
  `bootstrapVisitorThread(guestId, { reset: true })`.
- On success: new thread + token, URL stays `/chat` (guest threads are not
  URL-addressed yet), composer ready; on 429: the existing error notice
  shows the server message (≈ "You have started too many new conversations
  today — please come back in a bit.").
- `use-chat` change is additive: the bootstrap effect reads a
  `resetRef` flag (default false) and the public `resetGuestThread` sets it
  + bumps `runKey` (same path as `reconnect`).

## 3. `lib/chat/api.ts`

- `deleteThread(threadId): Promise<ChatResult<void>>` → generated
  `Chat.deleteThread`.
- `bootstrapVisitorThread(guestId, { reset = false })` — pass `reset` in
  the body (generated type already has it after sub 01's `gen:api`).

## 4. i18n (`messages/{en,ar,tr}.json`, `ChatPanel` + new keys)

- `deleteConversation`, `deleteConfirmTitle`, `deleteConfirmBody`,
  `newConversationGuest` (confirm: `newConversationGuestTitle/Body`).
  ar/tr written in natural, warm brand voice (she/her female forms).

## Definition of done

- `pnpm typecheck` · `pnpm lint` (zero warnings) green.
- Browser-verified (mobile + desktop, light + dark, en + ar):
  - user: delete a thread → gone from list, confirm dialog, open-thread
    edge (list step after delete), re-appears when staff reply (staff
    sends from /staff/chat or via API).
  - guest: new conversation → fresh empty thread, old one closed
    (`staff-visitors-view` shows it closed), 5th/6th reset → limit notice.
