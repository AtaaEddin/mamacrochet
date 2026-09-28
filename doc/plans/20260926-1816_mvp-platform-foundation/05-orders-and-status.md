# 05 — Orders & Status Board

status: done
parent: main.md

## Implementation decisions (2026-09-28)

### Model (entities in `Data/Orders.cs`)
- **Order**: `Id` (32-hex) · `Kind` = `catalog|custom` · `Status` =
  `open|in_progress|ready_for_payment|paid|delivered|closed|cancelled` ·
  `CustomerId` (nullable SetNull — set when the guest registers/confirms) ·
  `GuestId` (v4 GUID text, D14) · `ContactName/Phone` + optional
  `ContactEmail` · `ProductId` (nullable SetNull; bought product for
  catalog, referenced product for custom) · `Spec` (custom spec text; notes
  for catalog) · `EstimatedPrice/FinalPrice` (decimal? + `Currency`) —
  price = amount + currency code (D9), USD display only ·
  `AssignedEmployeeId` (nullable SetNull) · rating: `Rating` (1-5, nullable
  byte), `RatingComment`, `RatedAt` (after `closed`, customer, once) ·
  `CreatedAt`/`UpdatedAt`.
- **OrderEvent** (timeline = customer's live status board AND admin trace,
  single source of truth): `Kind` = `status|note|assignment|rating|auto` ·
  `Status` (nullable — new status of a status event) · `Note` · `AdminOnly`
  (bool — admin-override reasons are admin-trace-only; feeds plan 07 rule
  3: "visible in admin trace only") · `ActorId` (nullable — system events) ·
  `ActorName` · `ActorRole` = `customer|employee|admin|system` · `At`.
- **OrderAttachment**: `Kind` = `sample|wip|receipt|delivery-proof`
  (receipt / delivery-proof kinds reserved for plan 07) · stored under
  `{root}/orders/{orderId}/{attachmentId}.{ext}` (jpg/png/webp, ≤10 MB,
  ≤5 per order, magic-byte validated like avatars) · `OriginalName` ·
  `ContentType` · `Bytes` · `UploadedById`.
- Indexes: `OrderEvent(OrderId, At)`, `Order(Status)`, `Order(CreatedAt)`.

### State machine (guarded in the API; `Services/OrderService.cs`)
```
open → in_progress → ready_for_payment → paid → delivered → closed
open|in_progress → cancelled (reason required)
closed / cancelled are terminal
```
- `ready_for_payment` requires a `finalPrice`; `cancelled` always requires a
  note. The `paid`/`delivered`/`closed` transitions exist in the machine now;
  plan 07 layers the receipt/delivery recording forms + its extra guards on
  top (05 = the machine, 07 = the forms + enforcement).
- Admin override (D6): any → any (from non-terminal) with a **mandatory
  reason note**; out-of-matrix events stored `AdminOnly` (hidden from the
  customer status board, visible in the admin trace).

### API (ApiError envelope; CSRF prefixes += `/orders`)
- `POST /orders` (public guest creation, multipart, rate-limited 5/min/IP):
  kind, productId?, name, phone, email?, guestId (required v4 GUID, D14),
  spec?, files? (sample images) + honeypot (fake success, nothing stored).
  Caps: ≤3 open unlinked guest orders per device AND per phone (409).
  Authenticated callers: CustomerId set + guest linked idempotently — one
  flow for guest and logged-in. Catalog kind: listed product required,
  EstimatedPrice = product price. Response: order id + status only.
- Customer: `GET /orders` (mine = CustomerId me OR linked guestId; lazy
  auto-cancel), `GET /orders/{id}`, `POST /orders/{id}/cancel` (open /
  in_progress, reason required), `POST /orders/{id}/rating` (closed, once).
- Staff (Employee; assigned = AssignedEmployeeId me OR (null AND customer's
  default assignee me)): `GET /staff/orders` (QuerySpec: status /
  contactName/createdAt, top/skip), `GET /staff/orders/{id}`, `POST
  /staff/orders/{id}/status` {status, note?, finalPrice?}, `POST
  /staff/orders/{id}/notes`, `POST /staff/orders/{id}/attachments` (wip
  photos), `PATCH /staff/orders/{id}/assignment` (Admin only).
- Admin: `GET /admin/orders` (QuerySpec: status/customerId/employeeId/
  createdAt), `GET /admin/orders/{id}` (full trace incl. AdminOnly), `POST
  /admin/orders/{id}/status` (override, note mandatory), `GET
  /admin/orders/metrics` (per employee: completed count, avg open→delivered
  days, avg rating).
- Files: `GET /files/orders/{orderId}/{fileName}` — staff/admin any kind;
  customer: own order, `sample|wip` only. Binary transformer in
  Program.cs (like product images).
- **Auto-cancel (D16)**: unlinked guest orders (CustomerId null) in
  open/in_progress/ready_for_payment older than 7 days → cancelled with a
  system `auto` event (terminal statuses never auto-cancelled). Hosted
  sweep (startup + every 24 h) + lazy check on reads.

### Frontend (mobile-first, en/ar/tr, light/dark, RTL, guest-friendly)
- `lib/guest-id.ts`: device `guestId` (crypto.randomUUID → localStorage).
- **Order creation** (all guest-capable; guest step = name + phone +
  optional email, prefilled from profile when logged in):
  - `/request-custom`: spec text + sample images (≤5) + guest step.
  - Product page CTA stays `/chat?work={id}` (brand v2, buttons unchanged) —
    the in-chat product message gains the order actions: in-stock work →
    "order this" (kind=catalog); out-of-stock → "request this as custom"
    (kind=custom, references the product). This is the plan-04 handoff:
    the chat picker/rail loads REAL products from the public catalog API
    (SAMPLE_WORKS leaves the chat surface; home keeps its sample fallback).
  - Success state: order id + "staff will reach out in chat; you'll confirm
    when it's ready (sign-in/register then)".
- **Customer `/orders`** (D22 layout): rail (order list, status filter) +
  full-width stage = status board: step indicator open → closed + timeline
  (notes/photos; AdminOnly hidden) + attachments (sample/wip) + cancel
  reason + rating widget (closed only). Not signed in → sign-in/register
  prompt; after auth the client calls `/identity/guest-link` with the
  device guestId so guest orders appear.
- **Staff `/staff/orders`**: rail (assigned, status filter chips) + stage =
  detail + per-state action buttons: start work, progress note, WIP photo
  upload, set ready (+ final price), cancel (reason). (paid/delivered/close
  actions land with plan 07 forms.)
- **Admin `/admin/orders`**: table (filters status/customer/employee/date,
  pagination) + detail: full trace (incl. admin-only notes) + assignment
  control (employee select) + override transition (mandatory reason) +
  metrics panel (per employee: completed / avg days / avg rating).
- No realtime yet — plan 06 adds SignalR to these exact surfaces.

### Guest→account link (D14 — final semantics, fixed in QA 2026-09-28)
- **One account per device, many devices per account.** `GuestAccountLinks`
  is keyed by `GuestId` (first account to link wins per device); the
  `UserId` index is **non-unique** (a customer signs in on phone AND
  desktop — each device's guest orders must surface). Linking a device
  already owned by another account → 409 `guest_already_linked`.
- **Confirmation backfill (D14: "on success the order links to the
  account"):** a new link (and every idempotent re-link, and the
  authenticated `POST /orders` path) sets `CustomerId` on the device's
  unowned orders. Confirmed orders then (a) show the customer name in
  staff/admin views, (b) get the account's default handler, (c) stop
  counting against the guest caps, (d) stop being subject to the 7-day
  auto-cancel (all keyed on `CustomerId == null`).
- **Guest caps apply to anonymous creators only** — a signed-in caller
  is confirmed by definition (the 5/min rate limit still applies to all).

### QA record (2026-09-28, live API + headless browser, DOM-level checks)
- Full lifecycle both roles verified: guest create (custom + catalog) →
  admin assign → employee start/note/ready(+finalPrice) → customer link
  idempotent → cancel → admin override (note) → rating (5, once; 409
  repeat; 400 out-of-range).
- Attachments: staff `files` multipart upload (wip) → timeline row +
  authenticated file URL (anon 401, cookie 200); empty upload → 400.
- Auto-cancel: backdated unlinked order → cancelled + `auto` event on
  lazy read. Guest caps: 3 open OK, 4th → 409 `guest_cap` (device + phone).
- Metrics endpoint + panel: per-employee completed / avg days / avg
  rating verified against DB.
- UI (headless Chromium, CDP): request-custom, chat product actions,
  /orders anon + customer (rail→detail→timeline click), staff rail+detail,
  admin table+metrics, `/ar` RTL (`dir=rtl`), dark mode (`dark` class +
  near-black bg), mobile 390px list⇄detail. No console page errors on
  any surface (one pre-existing theme-toggle hydration warning,
  site-wide, not from this plan).
- Bugs found & fixed in QA: untranslatable guest-cap LINQ (split
  IQueryable), `ActorId`/`UploadedById` varchar(32) vs 36-char GUIDs
  (migration `FixOrderEventActorId`), link-by-guest-only duplicate key
  (→ explicit by-user check + 409), guest-link one-device-per-account
  + missing D14 backfill (this section).

### Open integration seam (flagged, plan 06 territory)
- `frontend/src/lib/chat/guest-id.ts` (plan-06 WIP) duplicates
  `frontend/src/lib/guest-id.ts` with a **different localStorage key**
  (`mm.guest` vs `mm.guestId`). Same D14 identity must be shared across
  chat threads and orders — unify on one module/key when 06 lands.

### Boundaries
- **06**: ChatThread/ThreadMessage, guest thread token, floating widget,
  SignalR hub, Visitors inbox, thread↔order wiring, live updates, "create
  order from thread" staff action, order-page chat⇄stage toggle.
- **07**: Payment/Delivery entities + receipt/delivery-proof file kinds,
  record-payment (receipt-gated unless admin override+note),
  record-delivery, close enforcement, customer "payment recorded ✓" view.
- **04 CTA item** (out-of-stock → custom order + chat): satisfied here
  (creation) + 06 (chat wiring).

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
- **Guest orders (D14)**: an anonymous visitor can create an order with **name + phone
  (required)** and email (optional); the order stores the device `guestId`. When the
  order reaches `ready_for_payment` the customer-side flow prompts login/registration;
  on success the order (and any linked thread) links to the account. Staff can see guest
  contact details and may record payment for unlinked orders (offline flow).
- **Guest anti-abuse (D16)**: guests stay easy to start but bounded — rate limits per
  device (`guestId`) + IP, a small cap on open guest orders (per device and per phone
  number), **unconfirmed guest orders auto-cancel after 7 days** (lazy check on read +
  daily sweep), honeypot field on the guest order form. A real captcha (e.g.
  Cloudflare Turnstile) is added only if spam actually materializes. Registration at
  confirmation stays the final gate (D14).

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

- [x] Entities + migrations: Order, OrderEvent, OrderAttachment, assignment links
- [x] State machine in API (guard every transition; reject invalid ones with clear error)
- [x] API: order CRUD per role, status transitions, assignment, timeline read
- [x] Frontend: customer "My orders" + order detail with live status board
- [x] Frontend: employee "My orders" (filters by status) + action buttons per state
- [x] Frontend: admin orders table (filter: status, customer, employee, date) +
      order detail with full trace + assignment controls + metrics panel
- [x] Order creation flows (all guest-capable): in-stock purchase, product page
      (out-of-stock CTA), /request-custom (spec text + sample images); guest step =
      name + phone (+ optional email)

## Acceptance

- End-to-end catalog order and custom order walk-through in the UI, all transitions
  guarded server-side (invalid transition → 409/400 with message).
- Customer status board updates live (plan 06 realtime) and is readable on a phone.
- Guest journey works with no account until confirmation: browse → chat → order
  (name + phone) → register at confirmation → order appears in “My orders”.
- Admin trace shows actor + timestamp for every event; metrics panel returns correct
  numbers for the test data.

## Design input (owner, 2026-09-26 — brand v2)

**Order page layout**: side list of orders (navigation rail) + a full-width
middle stage where the user (customer OR employee) goes **back and forth
between the chat and the order stages** — chat view and stage/timeline view
share the same central screen (tab/toggle), not cramped columns. Mobile:
same two views stacked with a toggle; order list collapses to a drawer.
The admin sees the same stage, with the full trace. (Recorded in
`20260926-2309_mama-identity-chat-first-home` + `doc/references/brand.md`.)
