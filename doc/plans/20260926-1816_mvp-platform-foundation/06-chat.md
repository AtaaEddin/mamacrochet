# 06 — Chat

status: proposed
parent: main.md

## Goal

Realtime chat per order between customer, assigned employee, and admins — the channel
for design details, payment agreement, and delivery agreement.

## Scope

- One thread per order; participants: customer + assigned employee + all admins.
- Messages: text + attachments (images/pdf via the shared file pipeline, plan 04/08 D8).
- Realtime: SignalR hub (`/hubs/chat`), cookie auth (plan 03). Presence (online) is
  out of MVP; typing indicator optional.
- Unread counters per thread; thread list with last-message preview.
- History: paginated load of older messages; no editing/deleting in MVP
  (admin delete-soft maybe — decide during implementation, keep simple).
- Mobile-first UI: sticky composer, keyboard-safe viewport, works as a PWA-ish tab on a phone.
- Fallback: if WebSocket is unavailable (flaky mobile network), poll REST for new messages.

## Decisions

- **Inquiries become orders (D1 from main)**: no anonymous chat. Asking about an
  out-of-stock or custom product creates an `open` order first, then the chat thread
  exists on it. Entry points: product page CTA, /request-custom page, order page.
- Admins can join **any** thread (owner requirement) and post; their messages are
  labeled with the sender name + "Admin" badge.
- Notifications: in-app unread badges in MVP; email-per-message is out (noisy + SMTP load).
  A single email when an order reaches `ready_for_payment` is included (plan 07).

## Tasks

- [ ] Entities + migrations: ChatMessage (thread ref = order id), attachments reuse
      OrderAttachment/FileStorage
- [ ] SignalR hub with authorization (participant check per order), message events,
      typing event (optional), unread counter sync
- [ ] REST: message list (paginated), send (also used by fallback poll path),
      thread unread state
- [ ] Frontend: chat component (message list, composer, attachments, image lightbox),
      thread list in My Orders / employee / admin views
- [ ] Realtime wiring: reconnect policy, fallback polling, mobile keyboard handling

## Acceptance

- Customer and employee exchange messages + images in realtime from two devices;
  admin can open the same thread and post.
- Killing the websocket (devtools) still delivers messages via fallback.
- Unread badges are correct per role; UI is usable on a small phone screen.
