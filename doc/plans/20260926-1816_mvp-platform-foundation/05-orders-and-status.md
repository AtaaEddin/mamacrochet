# 05 — Orders & Status Board

status: proposed
parent: main.md

## Goal

One Order concept (decision D1) with a transparent lifecycle, a live status board for
customer + employee, full admin trace, assignment, and per-order customer rating.

## Model

- `Order`: id, `kind` (catalog | custom), customer, assigned employee (nullable),
  product ref (nullable), custom spec (text + sample images), status,
  price estimate → final price, currency, timeline (events), rating.
- **Status lifecycle** (owner's vocabulary open/close/paid/delivered kept as the core):

  `open → in_progress → ready_for_payment → paid → delivered → closed`
  plus `cancelled` (reason required) reachable from `open` / `in_progress`.

  - `open`: created (catalog purchase or custom request), not yet started
  - `in_progress`: employee is working
  - `ready_for_payment`: work done; price fixed; payment method to be agreed in chat
  - `paid`: **receipt file attached** (employee) — see plan 07 rules
  - `delivered`: delivery recorded (method, actual date/time, description) — plan 07
  - `closed`: paid + delivered (or admin override with note)
  - `cancelled`: with written reason (customer request, admin, or employee)
- **Timeline events**: every status change + free note + actor + timestamp. This timeline
  **is** the customer-facing status board and the admin trace (single source of truth).
- `OrderAttachment`: files (samples, WIP photos, receipt, delivery proof) typed by kind.

## Rules

- Customer sees: only their orders, their status board (timeline), can chat, can
  confirm delivery (optional button), rates 1–5 + comment **after `closed`** (rating
  stored per order, shown to admin).
- Employee sees: only assigned orders; can start work, add progress notes + photos,
  set ready_for_payment (+final price), attach receipt → paid, record delivery, close.
- Admin sees: **all** orders, full trace (who worked, how long), can reassign
  customer→employee, cancel, override close without receipt (**mandatory reason note**,
  visible in admin trace only), override any status with note.
- Assignment: admin assigns an employee to a customer (default handler) and/or per order.
  Orders without assignment are visible to admin for assignment.
- Admin metrics (MVP-light, simple queries — no dashboard service): per employee:
  orders completed, avg days `open→delivered`, avg rating.

## Tasks

- [ ] Entities + migrations: Order, OrderEvent, OrderAttachment, assignment links
- [ ] State machine in API (guard every transition; reject invalid ones with clear error)
- [ ] API: order CRUD per role, status transitions, assignment, timeline read
- [ ] Frontend: customer "My orders" + order detail with live status board
- [ ] Frontend: employee "My orders" (filters by status) + action buttons per state
- [ ] Frontend: admin orders table (filter: status, customer, employee, date) +
      order detail with full trace + assignment controls + metrics panel
- [ ] Custom order creation flow: from product page (out-of-stock) or /request-custom
      (spec text + sample image upload)

## Acceptance

- End-to-end catalog order and custom order walk-through in the UI, all transitions
  guarded server-side (invalid transition → 409/400 with message).
- Customer status board updates live (plan 06 realtime) and is readable on a phone.
- Admin trace shows actor + timestamp for every event; metrics panel returns correct
  numbers for the test data.
