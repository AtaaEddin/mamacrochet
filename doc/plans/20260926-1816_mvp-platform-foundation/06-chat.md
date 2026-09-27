# 06 — Chat

status: proposed
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

## Tasks

- [ ] Entities + migrations: ChatThread (order/customer/guest nullable), ChatMessage,
      attachments reuse OrderAttachment/FileStorage; thread-token service for guests
- [ ] SignalR hub: cookie auth for order threads, thread-token auth for visitor threads,
      message events, typing (optional), unread counter sync, anonymous rate limiting
- [ ] REST: message list (paginated), send (also used by fallback poll path),
      thread unread state
- [ ] Frontend: chat component (message list, composer, attachments, image lightbox),
      thread list in My Orders / employee / admin views
- [ ] Floating chat widget (brand-styled per plan 11): bubble + panel, on every public
      page, guest thread bootstrap (guestId + thread token), works logged-out
- [ ] Staff “Visitors” inbox: guest thread list with previews, claim/assign,
      “create order from thread” action
- [ ] Realtime wiring: reconnect policy, fallback polling, mobile keyboard handling

## Acceptance

- A logged-out visitor on a phone opens the widget and chats in realtime with an
  employee; staff claim the thread and can convert it to an order; after the guest
  registers, thread + order appear under the account.
- Customer and employee exchange messages + images in realtime from two devices;
  admin can open the same thread and post.
- Killing the websocket (devtools) still delivers messages via fallback.
- Unread badges are correct per role; UI is usable on a small phone screen.

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
