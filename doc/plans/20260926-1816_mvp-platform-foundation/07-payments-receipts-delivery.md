# 07 — Payments (Receipt-based), Delivery & Closing

status: proposed
parent: main.md

## Goal

Implement the owner-mandated payment/delivery rules with hard server-side enforcement.

## Rules (owner-mandated — non-negotiable for MVP)

1. **No payment gateway.** Payment method (cash, bank transfer, etc.) is agreed in chat
   (or outside the platform).
2. Employee records the **paid amount** and uploads a **receipt file (pdf or image)**.
   An order can move to `paid` **only if a receipt is attached** — enforced in API
   and UI (disable button + server rejection).
3. **Admin override**: admin may move an order to `paid`/`closed` without a receipt,
   but a **written reason note is mandatory**; it is stored on the event and visible in
   the admin trace only (not in the customer view).
4. **Delivery** is agreed in chat or offline. Record: method (free text), **actual
   date/time** (datetime-local), description. Then status → `delivered`.
5. An order is `closed` when `paid` + `delivered` (customer "confirm delivery" button is
   optional input, not a gate). Admin can force-close at any time (rule 3 note applies
   when no receipt exists).

## Model

- `Payment`: order ref, amount, currency, method (free text), receipt file ref,
  recorded by (employee/admin), recorded at, note.
- `Delivery`: order ref, method, actual datetime, description, recorded by, recorded at.
- Both render on the order timeline (plan 05) and on the customer order detail
  (receipt file itself stays employee/admin-visible — customer sees "Payment recorded ✓").

## Tasks

- [ ] Entities + migrations: Payment, Delivery; file kinds `receipt` | `delivery-proof`
      (auth-protected storage)
- [ ] API: record payment (validate receipt presence unless admin-override+note),
      record delivery (validate datetime + method), close (validate paid+delivered
      or admin override + note)
- [ ] Frontend: employee payment form (amount, method, receipt upload with type/size check),
      delivery form (method, datetime, description); admin override dialog with
      mandatory reason; customer view of payment/delivery state (no raw files)
- [ ] Email: single notification when order reaches `ready_for_payment` (plan 03 SMTP)

## Acceptance

- UI + API both block `paid` without a receipt file (test with a crafted request).
- Admin override without receipt is blocked without a reason note, allowed with one;
  note appears only in admin trace.
- Delivery record stores method + exact datetime + description; close gate verified
  for both employee (must have paid+delivered) and admin (override path).
