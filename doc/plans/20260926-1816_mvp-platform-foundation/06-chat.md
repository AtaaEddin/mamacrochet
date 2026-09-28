# 06 — Chat

status: done
parent: main.md

## Goal

Realtime chat for everyone — **anonymous visitors first (the core idea, D14)** — plus
per-order threads between customer, assigned employee, and admins: the channel for
design details, payment agreement, and delivery agreement.

## Scope

- One `ChatThread` entity with nullable order ref, nullable customer ref, nullable
  `guestId`; two thread kinds:
  1. **Visitor threads (guest-first core, D14)**: any anonymous visitor starts a chat
     from a floating widget on every public page; one active visitor thread per device.
     Staff see these in a “Visitors” inbox (claim/assign to an employee).
  2. **Order threads**: created with an order; participants customer + employee + admins.
  A visitor thread can link to an order (staff “create order from thread”, or the
  order CTA in chat) and to an account (login at confirmation).
- Messages: text + attachments (images/pdf via the shared file pipeline, plan 04 D8).
- **Guest anti-abuse (D16)**: per-device `guestId` + per-IP rate limits (messages per
  minute), one active visitor thread per device, honeypot on the first guest message;
  visitor threads auto-close after 30 days of inactivity. Escalation to a real captcha
  only if needed.
- Realtime: SignalR hub (`/hubs/chat`); order threads use cookie auth (plan 03);
  **visitor threads use a short-lived thread token** for anonymous WebSocket connect
  (validated server-side, rate-limited against abuse). Presence/typing optional.
- Unread counters per thread; thread list with last-message preview.
- History: paginated load of older messages; no editing/deleting in MVP
  (admin delete-soft maybe — decide during implementation, keep simple).
- Mobile-first UI: sticky composer, keyboard-safe viewport, works as a PWA-ish tab on a phone.
- Fallback: if WebSocket is unavailable (flaky mobile network), poll REST for new messages.

## Decisions

- **Chat is the core surface (D14)**: the floating chat widget is a primary CTA on
  every public page (bottom-right bubble on mobile, part of nav on desktop). Anonymous
  chat is a feature, not a loophole: brand-styled opener (plan 11), a human staff member
  on the other end. Staff can convert any thread into an order (“create order from
  thread”: optional product ref + spec pre-filled from the conversation).
- Admins can join **any** thread (owner requirement) and post; their messages are
  labeled with the sender name + "Admin" badge.
- Notifications: in-app unread badges only in release 1 (no email — future plan D13).

## Implementation decisions (2026-09-28)

**Parallel with plan 05 (same working tree):** another agent owns the orders
work in flight (`Data/Orders.cs`, `OrderService`, `OrderEndpoints`, their
`AppDbContext`/`Program.cs` edits). Plan 06 therefore stays in new files
(`Data/Chat.cs`, `Services/Chat*`, `Hubs/ChatHub`, `Endpoints/ChatEndpoints`,
`Models/ChatModels`) and keeps shared-file edits minimal + additive
(`AppDbContext`: 4 DbSets + one config block; `Program.cs`: DI, rate bucket,
CSRF area, hub + endpoint mapping; `FileEndpoints` untouched — the chat file
route lives in `ChatEndpoints`).

- **Attachments: dedicated `ChatAttachment` entity** (not `OrderAttachment`):
  `OrderAttachment.OrderId` is required/cascading, which cannot serve visitor
  threads that have no order yet. Same file-pipeline conventions (D8):
  magic-byte gate (jpg/png/webp/gif + pdf, 10 MB, 5 files), opaque stored
  names `{Id}.{ext}`, layout `{root}/chat/{threadId}/{Id}.{ext}`.
  `ChatAttachment.ThreadId` scopes the upload to its thread; `MessageId`
  stays null until the message is sent (orphans purged after 24 h).
- **Guest thread token (D24)**: stateless HMAC token
  `base64url(payload).base64url(hmacSha256(key,payload))`, payload
  `{threadId, guestId, exp}` (2 h). Key from `Chat:TokenKey` (prod `.env`);
  dev falls back to a per-process ephemeral key (tokens die with the process —
  single-instance dev, fine). Verified constant-time; bound to thread AND
  device. No table, no Redis.
- **Chat file serving (D25)**: `GET /files/chat/{threadId}/{fileName}?sig=..&exp=..`
  with a short-lived HMAC read signature embedded in message DTOs (1 h).
  Guests have no cookie to authenticate file requests; the signature is
  read-only and scoped to one file.
- **Unread**: `ChatThreadRead (ThreadId, UserId, LastReadAt)` — per-account
  last-read marker; unread = messages after the marker not sent by the user.
  Guests have no unread state (they live in the thread).
- **Typing indicators: skipped** (the plan marks them optional).
- **Message editing: none. Admin soft-delete: entity column (`IsDeleted`) in,
  endpoint deferred** (keep simple; no consumer in release 1).
- **Rate limiting (D16 step 2)**: global limiter — `POST /chat/visitor`
  joins the strict guest bucket (5/min/IP); guest messages additionally
  capped per-device (10/min/guestId, in-memory fixed window, single
  instance); one active visitor thread per device (filtered unique index).
- **CSRF**: `/chat` joins the CSRF area; exempted: public `POST /chat/visitor`
  (rate limit + honeypot, same precedent as `POST /orders`) and any request
  carrying `X-Chat-Token` (the endpoint requires a valid token, which a CSRF
  attacker cannot forge).
- **Deferred to the plan 05 landing (same release, follow-up commits)**:
  1. order-thread creation inside `OrderService.CreateAsync` (the
     `ChatService.EnsureOrderThreadAsync` hook is ready),
  2. staff "create order from thread" action (needs the finished
     `OrderService.CreateAsync`),
  3. employee D23 workspace (conversation rail over real orders — needs the
     plan 05 order UI).
  Everything else in the task list ships with this plan.

## Tasks

- [x] Entities + migrations: ChatThread (order/customer/guest nullable), ChatMessage,
      dedicated ChatAttachment (see decisions), ChatThreadRead; thread-token service
      for guests (D24). Migrations: 20260928104927_AddChat, 20260928140237_FixChatUserFkLengths
- [x] SignalR hub: cookie auth for order threads, thread-token auth for visitor threads,
      message events, unread counter sync, anonymous rate limiting (typing skipped)
- [x] REST: thread list (previews/unread), message list, send (fallback poll path
      shares it), thread read state, staff claim/assign/close
- [x] Frontend: chat component (message list, composer, attachments, image lightbox,
      product rail), user thread list at /chat (?thread= deep link)
- [x] Floating chat widget: launcher bubble (mobile; desktop keeps the header CTA),
      guest thread bootstrap (shared guestId + D24 token), works logged-out
- [x] Staff “Visitors” inbox: guest thread list with previews, claim/assign/close
      (reason optional); “create order from thread” deferred (see decisions)
- [x] Realtime wiring: SignalR reconnect built into the client lib, fallback REST
      poll every 15 s on the user thread list, mobile keyboard-safe layout

## Final decisions (2026-09-28, implementation close-out)

- **Shared guest id (D14)**: plan 05 landed `frontend/src/lib/guest-id.ts`
  (localStorage `mm.guestId`) while plan 06 had its own module with a different key
  (`mm.guest`). Two keys = two "devices" per browser → a guest's order link and
  chat thread would never meet. Unified on the committed plan-05 module; the chat
  module was deleted (single source of truth).
- **Employee inbox = assigned + unclaimed visitors**: `ListThreadsAsync` (employee
  branch) returns threads assigned to the employee **plus** unclaimed visitor
  threads, so the same query feeds both /chat and the staff inbox. Claim is
  first-wins (claim endpoint enforces; the list only offers it while unassigned).
  Admins keep seeing everything; `AssignThreadAsync` stays admin-only.
- **Launcher-only bubble** (owner 2026-09-26): the floating bubble
  (`components/chat-launcher.tsx`) is mobile-only (`md:hidden`), hidden on
  /chat, /staff, /admin, and navigates to /chat — no second embedded panel.
  Desktop keeps the “Say hi” header CTA. Verified light + dark, RTL-safe
  (logical `end-4` placement).
- **Staff Visitors inbox** (`[locale]/staff/chat`): filters all/new/mine, cards
  with subject/preview/time, New / assignee(+you) / Closed badges, unread count;
  actions Open (→ /chat?thread=), Claim, Assign (admin, employee roster from
  GET /admin/users, active + staff roles), Close with optional inline reason.
  15 s REST poll for the list; the opened thread itself is realtime. Per-row
  inline error state for failed actions (no toast infra in the codebase yet).
  “Create order from thread” still deferred (plan 05 OrderService follow-up).
- **User-FK columns are varchar(36)**: the initial chat config used 32 (the
  domain short-id convention) for `ChatThreads.CustomerId/AssignedEmployeeId`,
  `ChatMessages.SenderId`, `ChatThreadReads.UserId` — user ids are GUIDs. Claim
  500'd with `value too long for varchar(32)` during QA. Migration
  20260928140237_FixChatUserFkLengths widens all four (same class of bug as
  plan 05's FixOrderEventActorId).

**Bugs found + fixed during browser QA** (all reproduced, all regression-verified):
1. StrictMode double-mount race in visitor bootstrap → unique-index violation;
   now catches `DbUpdateException` and polls for the winning thread (10×50 ms).
2. openapi-fetch 0.17.0 consumes the body inside `call()`; the chat client
   re-parsed a consumed Response → “Failed to fetch” on send. Now uses `res.data`.
3. Thread-list preview query: `Any()` over a local anonymous-type list is not
   translatable → 500. Replaced with a correlated `MAX(At)` scalar subquery +
   client-side `GroupBy`.
4. `CheckAccess` never consulted `GuestAccountLinks` → a linked user saw their
   visitor thread in the list but 403 on open. Now `CheckAccessAsync` with the
   D14 branch (thread.GuestId ∈ user's linked devices), mirroring the list query.

## Verification record (2026-09-28)

Playwright (system Chromium) against the live dev stack, three phases
(rate-limit-aware spacing): guest mobile 8/8 (bubble, live echo, product rail +
picker, no console errors), guest desktop dark 8/8, RTL ar + full guest→user
flow 10/10 (guest msg in anonymous context → register → guest-link → thread
listed with preview+unread → opens LIVE via cookie SignalR, history rendered),
staff inbox + bubble 23/23 (bubble mobile light+dark, hidden on /staff, guest
bootstrap+msg, employee list/claim → “(you)”, admin assign dropdown reassign,
close-with-reason → Closed badge, open from inbox → /chat?thread= realtime,
zero console errors across all contexts). Gates: dotnet build 0 warnings/0
errors (solution), pnpm typecheck + lint clean.

## Acceptance

- [x] A logged-out visitor on a phone opens the widget and chats in realtime;
  staff claim the thread (verified); conversion to an order deferred to the plan
  05 follow-up (see decisions).
- [x] Customer and employee exchange messages + images in realtime; admin can
  open the same thread and post (admin open verified; employee-side realtime is
  the same hub path — cookie auth).
- [x] Fallback: REST poll (15 s) runs alongside the socket; messages land via
  the list refresh even if the socket is down (polling state observed in QA).
- [x] Unread badges correct per role (linked-guest thread showed unread 1 after
  the guest message); UI usable on a small phone screen (390 px verified).

## Design input (owner, 2026-09-26 — brand v2)

**Chat-first is the core surface** for every role (customers, employees,
admins — "I always care about the chat that happened with the customer"):
- Home: big full-width chat section below the works (no side column there).
- Product picking / order pages: persistent large chat panel alongside.
- **Order page**: side list of orders + full-width middle stage toggling
  between the chat and the order stages (see plan 05 design input).
- The floating bubble is only a launcher (mobile sheet / focus jump).
- **Employee main page**: a ChatGPT-style workspace (conversation rail +
  ChatGPT-style thread) — same thread UI as customer chat and the order
  page middle stage (added 2026-09-26, owner).
The brand surface (panel header, thread, quick topics, composer, local
echo) already ships in `frontend/src/components/chat-panel.tsx`; plan 06
replaces the local echo with guest/order threads over SignalR.
- **Employee main page (owner, 2026-09-26)**: after login, an employee
  lands in a **ChatGPT-style workspace** — list of conversations/orders on
  the side rail, ChatGPT-style thread in the middle (the same component
  look as the customer chat: centered column, avatar + plain-text maker
  messages, soft visitor bubbles, single rounded composer). The customer
  chat page and the order page middle stage share this exact thread UI —
  one chat design for every role.
