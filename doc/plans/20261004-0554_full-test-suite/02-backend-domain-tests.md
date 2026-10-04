# 02 — Backend domain tests (services)

status: proposed
parent: 20261004-0554_full-test-suite

Resolve services from a fresh app DI scope (same scope → same `AppDbContext`
instance the service uses); seed/assert through that context. Real Postgres.

## OrderServiceTests

- **CreateAsync**: catalog order ok; custom order (spec required); bad `kind`
  → 400; missing guest/customer id → 400; bad name/phone lengths → 400;
  unknown product → 404; catalog w/o product → 400; guest cap (3 open per
  device → 4th `guest_cap` 409); signed-in backfill creates linked order (D14);
  sample file stored on disk under `UploadsRoot`.
- **TransitionAsync** matrix (valid edges from `OrderStatus` doc-comment;
  invalid edges → `conflict`; terminal states immutable; duplicate status →
  `conflict`; employee ready-for-payment requires `finalPriceUsd`;
  employee→ready requires no open dispute? (n/a) — and `closed` requires
  receipt (non-admin → 400 `receipt_required`)).
- **RecordPaymentAsync**: staff without receipt → 400; with receipt → `paid`
  + `paidAmountUsd` set + `receiptFileName` + event; admin without receipt +
  mandatory note → `paid` + `AdminOnly` event (hidden from customer
  timeline); duplicate payment → 409; wrong current status → 409; amount
  validation.
- **RecordDeliveryAsync**: requires `method` + `actualAtUtc`; rejects
  `> now+1d` and `< now-5y`; duplicate → 409; wrong status → 409; description
  capped.
- **ConfirmDeliveryAsync**: from `delivered` only; idempotent-ish (2nd → 409);
  sets `deliveredAt`.
- **AddNoteAsync**: empty/short → 400; terminal order → 409 (locked); staff
  notes recorded; timeline event kind `note`.
- **AssignAsync**: non-employee → 400; ok sets `assignedEmployeeId` + event;
  idempotent same-assign ok.
- **RateAsync**: only `closed`; score <1 or >5 → 400; ok sets
  `customerRating`; 2nd → 409.
- **EnsureAutoCancelledAsync**: 8-day-old guest order → `cancelled` +
  `auto_cancelled` event (AdminOnly=false, customer-visible); fresh order
  untouched; `paid`+ never delivered old order untouched; linked order (any
  status) untouched.
- **MetricsAsync**: counts open/in_progress/ready; per-employee history rows
  for a finished order include rating + elapsed days.

## ChatServiceTests

- **CheckAccessAsync** matrix: admin → full; assigned employee → full;
  customer owner (own order thread) → full; linked guest (account thread,
  device) → full; other customer → `none`; guest token valid thread → full;
  guest token valid thread but wrong device → `none`; guest token on order
  thread → `none` (order threads are not guest-readable).
- **BootstrapVisitorThreadAsync**: creates `visitor` thread + token; 2nd
  call same id → same thread (idempotent); invalid guest id → 400;
  `reset=true` closes old (staff-visible? no — just closed) + new thread;
  5 resets/day → 6th → 429; honeypot → 400.
- **CreateThreadAsync**: customer self → `order` thread; staff on behalf of
  a customer → ok; staff targeting staff → 403; invalid guest id → 400.
- **SendMessageAsync**: guest token ok (body only + product + attachment);
  wrong-device token → 403; body > 4000 → 400; product ref not found → 404;
  10th message ok, 11th → 429; closed thread → 409 (admin excepted);
  attachment from another thread → 400; unknown temp file id → 404;
  subject auto-fill ("Order <n>"); staff reply to closed thread → 409 (staff
  reopens? no — 409).
- **ClaimThreadAsync**: ok sets assignee + event; 2nd claim (other) → 409
  with claimant name; order thread → 409 (`not_a_visitor_thread`);
  already assigned → 409.
- **CloseThreadAsync** (staff): ok + `closed` event; idempotent → 409.
- **CloseStaleVisitorThreadsAsync**: 31-day-old visitor → closed; recent
  untouched; non-visitor untouched.
- **PurgeOrphanAttachmentsAsync**: temp file >24h un-referenced → file gone +
  row gone; referenced file kept.
- **LinkThreadToOrderAsync**: links (event `order_linked`); idempotent;
  already linked to other order → 409; unknown order → 404; already
  linked → 400.

## GuestLinkServiceTests

- Link unowned → linked + backfills guest customer orders (D14) + thread;
  conflict (linked to other account) → `Conflict`; idempotent same account;
  `IsValidGuestId` unit: v4 ok; v1/v3/empty/garbage → false.

## ChatTokenServiceTests

- Token round-trip (thread+device in → out); wrong device → null;
  tampered hmac → null; expired (negative `TokenLifetime`) → null;
  malformed → null.
- File signature round-trip; expired → null; tampered → null.
- `new ChatTokenOptions()` (no `TokenKey`) → constructor throws on bad base64
  (short key) — and ephemeral mode works.

## FileSignaturesTests

- Detect: minimal PNG/JPEG/GIF/WebP/PDF bytes → correct kind;
- Reject: empty, <64 bytes of non-magic, text file → null.

## ApiModels / misc (pure)

- `ApiError` JSON shape (code+message) via a small serializer check.
- `OrderStatus` helpers: `IsValid`/`IsTerminal` all values.
