# 07 — Payments (Receipt-based), Delivery & Closing

status: done
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

## Implementation decisions (2026-09-28)

- **One row per order, like the domain says**: `Payment` and `Delivery` each have
  `OrderId` as primary key (unique per order — one receipt, one delivery). Re-recording
  after an override is a replace, not a stack.
- **Gates do their own transition**: `RecordPaymentAsync` / `RecordDeliveryAsync`
  write the status + timeline event directly in one `SaveChanges` instead of calling
  `TransitionAsync` — a tracked-but-not-yet-saved `Payment` row is invisible to the
  transition's re-query, so the gate and the data land atomically together.
  `ConfirmDeliveryAsync` is event-only (no status change).
- **`SaveProofFileAsync` returns `(OrderAttachment?, ApiError?)`**: the order's
  `Attachments` collection is not loaded in the payment/delivery queries; the proof
  file is stored under a freshly loaded attachment aggregate. File route:
  `OrderFiles.NamePattern` extended with `|pdf`, `ContentType` adds `application/pdf`;
  layout `{root}/orders/{orderId}/proof.{ext}`.
- **Photo cap scoping**: the 5-file cap now counts `kind == "sample" || kind == "wip"`
  only — receipts/proofs are single staff files and must not eat customer sample slots.
- **Admin gate bypass (rule 3)**: in `TransitionAsync`,
  `gateBypass = (status is Paid/Closed && !hasReceipt) || (status == Delivered && !hasDelivery)`
  for admins; the event gets `AdminOnly = !inMatrix || gateBypass` so the admin trace
  (not the customer view) is the only place the override is visible. A mandatory
  non-empty note is required whenever the bypass fires (400 `note_required` otherwise).
- **Customer scoping**: `PaymentDto.ReceiptUrl` / `DeliveryDto.ProofUrl` are
  null for customers (staff/admin only); the payment **note** is shown to the customer
  only when a receipt exists (admin-override notes never leak);
  `CanConfirmDelivery` = owner + status `delivered` + no prior confirmation event
  (once per order, enforced in `ConfirmDeliveryAsync` too — 409 after the first).
- **Timeline**: payment events carry `Status = paid`, delivery events `Status = delivered`;
  confirmation events carry neither (kind-only), rendered as "Delivery confirmed".
- **Datetime**: frontend `datetime-local` → ISO UTC (`new Date(v).toISOString()`);
  server parses `AssumeUniversal | AdjustToUniversal`.
- **Dialog state = mount-based**: dialog bodies render only while `open` (inner
  `useState` initializers), close via `onOpenChange`; a mount-based dialog resets
  amount/method/file per open — no stale form state across orders.

## Frontend decisions (2026-09-28)

- **`payment-delivery.tsx`**: one shared module — `PaymentCard` / `DeliveryCard`
  (amount, method, recorded-by, actual date-time, description, View receipt/proof
  links) + `RecordPaymentDialog` / `RecordDeliveryDialog` (amount, method, note,
  receipt file / method, actual date-time, description, proof file). File validation
  client-side: `<= 10 MB` and `pdf | jpeg | png | webp` (server re-validates magic
  bytes). Cards render in customer detail (no file links), staff stage, admin stage.
- **Customer confirm = direct button** (no dialog) in `my-orders-view` —
  `POST /orders/{id}/confirm-delivery`, inline error state, button disappears after.
- **Admin close UX**: no dedicated "Close order" button in the admin view — admin
  closes through the existing Override dialog (status `closed`, note required when
  the gate would block). Staff close stays a plain button at `paid`+`delivered`.
- **`hostDialogs` prop** on `StaffOrderStage` / `AdminOrderStage`: the desktop
  call-site hosts the payment/delivery dialogs (`hostDialogs={true}`), mobile
  passes `hostDialogs={false}` — see bug fix 1 below.
- **Attachments**: customer/staff attachment lists filter to `sample` / `wip`
  (receipts/proofs are staff files, shown via the cards instead).
- **i18n**: 35 keys × en/ar/tr (payment/delivery cards, forms, timeline labels,
  confirm CTA) — totals 131 keys per locale.

## Tasks

- [x] Entities + migrations: Payment, Delivery; file kinds `receipt` | `delivery-proof`
      (auth-protected storage). Migration `20260928150858_AddPayments`.
- [x] API: record payment (receipt required unless admin-override+note),
      record delivery (datetime + method required), close gate (paid+delivered or
      admin override + note), customer confirm-delivery, MapDetail Payment/Delivery/
      CanConfirmDelivery with role scoping.
- [x] Frontend: employee payment form (amount, method, receipt upload with
      type/size check), delivery form (method, datetime, description); customer
      confirm-delivery button; admin override path (existing dialog, gate on the
      server); customer view of payment/delivery state (no raw files, note hidden
      without receipt).
- [x] (deferred — future email plan D13) notification when order reaches
      `ready_for_payment` — not built.

## Bugs found + fixed during implementation/QA

1. **Payment note leak**: the admin-override note was rendered in the customer
   detail. Fixed: note shown to customer only when a receipt exists;
   re-verified in API QA (override flow → note absent for customer, present in
   admin trace).
2. **Duplicate dialog portals**: the mobile and desktop stage layouts each
   mounted `StaffOrderStage`/`AdminOrderStage`, so both invocation sites rendered
   the payment/delivery dialogs → two portals in `<body>` → the second portal's
   overlay intercepted the first's submit click ("subtree intercepts pointer
   events"). Fixed with the `hostDialogs` prop (desktop hosts, mobile
   `hostDialogs={false}`); single portal verified in browser QA. (The plan-05
   dialogs still double-render — known issue, out of this plan's scope.)

## Verification record (2026-09-28)

**API QA (live, curl, all passed)**: QA account reset; customer register +
guest-link of three orders; staff full flow (payment w/ receipt → `paid` →
delivery w/ proof → `delivered` → close → `closed`); gate rejections (payment
without receipt 409, close without paid+delivered 409, delivery without method/
datetime 400); admin override flow (→ `paid` and → `closed` without receipt —
blocked without note, allowed with; note in admin trace only); customer scoping
(404 on staff routes, own-order list); file ACL (customer 404 on receipt/proof,
staff 200); payment-note-leak check; metrics endpoint.

**Browser QA (Playwright, snap Chromium 153, 24/24)** on a fresh order O7
(advanced to `ready_for_payment` via API, then the whole lifecycle in the UI):
- **Staff desktop**: order selectable at ready_for_payment → no receipt link
  before recording → payment dialog (amount 42, method, receipt.pdf, note) →
  card shows "42 … USD" + View receipt → delivery dialog (method, actual
  date-time, description, proof.png) → View proof → Close order visible.
- **Customer**: order selectable at delivered → Payment + Delivery cards → no
  receipt/proof links (scoped) → Confirm delivery → button gone → timeline
  shows "Delivery confirmed".
- **Staff**: close → `closed`, no action buttons left.
- **Admin** (table rows): payment card + View receipt, delivery card + View proof.
- **Staff mobile 390px + dark**: cards render (mobile-host check).
- **/ar customer**: RTL (`html[dir=rtl]`) + Arabic cards. **/ar staff mobile**:
  RTL + Arabic cards.
DB end-state: `closed` with 1 payment + 1 delivery + 1 confirmation event.

**Gates**: `dotnet build` 0 warnings / 0 errors; `pnpm typecheck`, `pnpm lint`,
`pnpm build` clean.

**Test-environment notes (not app bugs)**: snap Chromium 153 cannot send
FormData `File` objects from `setInputFiles`/input (ALPN negotiation failure) —
the QA harness re-encodes Files from `arrayBuffer()` bytes in a fetch wrapper
(`/tmp/qa_filefix.cjs`), and that wrapper must strip the copied `content-type`
(the `Request` constructor pins the original FormData's boundary, mismatching
the re-serialized body → Kestrel 400 with empty body). Snap confinement:
`setInputFiles` paths must be under `/home/ataa/` (`/tmp` is invisible to the
snap).

## Known issues (pre-existing / out of scope)

- Plan-05 stage dialogs (cancel, override, …) still double-render on
  mobile+desktop invocation sites (same bug class as bug fix 2; plan-05
  dialogs only).
- Form POST with **no** CSRF cookie/token → 500 instead of 403: built-in
  `ValidateRequestAsync` throws `InvalidOperationException` escaping the
  `catch (AntiforgeryValidationException)` in `AntiforgeryMiddleware`
  (Program.cs). No state change, generic envelope (no data leak); app flows
  always send a token. Documented, no code change in this plan.
- ThemeToggle hydration warning E394 (dev-only, pre-existing).

## Acceptance

- [x] UI + API both block `paid` without a receipt file (API 409 on crafted
  request; UI has no path — the form requires the file input; server re-check).
- [x] Admin override without receipt is blocked without a reason note, allowed
  with one; note appears only in admin trace (customer payload verified).
- [x] Delivery record stores method + exact datetime + description; close gate
  verified for employee (paid+delivered required) and admin (override path).
