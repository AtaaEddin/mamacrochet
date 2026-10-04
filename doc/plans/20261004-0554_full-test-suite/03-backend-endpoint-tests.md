# 03 — Backend endpoint tests (HTTP)

status: done
parent: 20261004-0554_full-test-suite

TestServer through the real `Program` (sub-plan 01 fixture): real antiforgery,
real cookies, real multipart, real EF/Npgsql. Guest endpoints (no cookie)
never need CSRF; cookie-scoped mutations fetch `/antiforgery` per client.

## HealthTests

- `GET /health` → 200 `{"status":"ok","database":"connected"}`.

## IdentityEndpointsTests

- `POST /identity/register` (CSRF header) → 200 `UserDto` + auth cookie;
  weak password → 400; bad language → 400; duplicate email → 409.
- `POST /identity/login` → 200 + cookie; bad credentials → 401 `bad_credentials`
  (no user-leak asymmetry); unknown user → same 401; deactivated account →
  403 `deactivated`; lockout after repeated failures → 423 `locked`;
  staff door: `staff:true` as customer → 403 `staff_only`; seeded admin
  (`seed-admin@…`) staff login → 200 `isStaff` + `mustChangePassword:true`.
- `POST /identity/change-password` → 204; wrong current → 400.
- `GET /identity/me` → 401 unauthenticated; 200 with profile; CSRF:
  mutation without header → 403 `csrf`; with → ok.
- `POST /identity/guest-link` → links device; 2nd account → 409
  `guest_already_linked`; invalid guest id → 400.
- `POST /identity/me/avatar` (multipart, CSRF) → 200 filename; GET
  `/files/avatars/{file}` → 200 image.
- Antiforgery: `GET /antiforgery` → 200 token.

## CatalogEndpointsTests

- Seeded catalog (CatalogSeeder): `GET /catalog/categories` ≥ 4 rows;
  `GET /catalog/products` paged (`?page&pageSize`) + `$top`/`$filter`;
  `GET /catalog/products/{id}` 200 (unlisted visible to staff query?
  public list excludes unlisted) and 404 unknown.
- `GET /files/products/{p}/{img}` → 200 image (seeded images on disk).
- Staff (employee cookie): `POST /staff/products` JSON create → 200;
  `PATCH` update (unlist) → 200; unlisted then hidden from public list;
  `POST /staff/products/{id}/images` (multipart) → 201; `PUT` reorder;
  `DELETE` image; `POST /staff/categories` → 200; category with products →
  409 delete.
- Roles: customer cookie on `/staff/…` → 403; no cookie → 401.

## OrderEndpointsTests

- `POST /orders` (guest multipart, no CSRF, fresh guest id):
  - valid catalog → 200 id; valid custom (spec) → 200; file saved on disk
    (`UploadsRoot/orders/{id}/samples/…`); response `status="open"`.
  - bad name/phone → 400; bad kind → 400; unknown product → 404;
    5+1 files → 400; file >10 MB → 400; honeypot `website` → 200 but no DB row.
  - guest cap: 3 open guest orders (fresh id each) → 4th → 409 `guest_cap`.
- `GET /orders` (customer cookie): only own orders; after `guest-link` the
  guest device's orders appear (D14 backfill visible); `?kind&statuses`
  filters; `?search` matches id/name/phone; paged `items/total`.
- `GET /orders/{id}`: detail with `timeline` + `files` (customer: samples
  only, no receipt); 404 other customer's order; 409-ish? (not_found).
- `POST /orders/{id}/cancel` (customer cookie + CSRF): open → `cancelled`
  with reason; in_progress → ok; `closed` → 409; missing reason → 400.
- `POST /orders/{id}/status` (employee cookie + CSRF): full lifecycle walk
  open→in_progress→ready(finalPrice)→paid(receipt PDF)→delivered→closed;
  each hop visible in `timeline` to the customer; invalid jump → 409;
  employee without receipt → 400 `receipt_required`;
  admin override close (no receipt, with `note`) → `closed`, admin timeline
  has `AdminOnly` event, customer timeline does not.
- `POST /orders/{id}/notes` (CSRF) → 200; empty → 400.
- `POST /orders/{id}/assign` (admin CSRF) → 200; employee → 403? (employee
  allowed too? — per endpoint: any staff; verify in code) ; non-employee
  target → 400.
- `POST /orders/{id}/rate` (customer, closed) → 200; 2nd → 409;
  non-closed → 409.
- `GET /files/orders/{id}/{kind}/{name}`: customer samples 200;
  receipt without staff → 404/403; staff 200; traversal `..` → 400/404.
- Auto-cancel via lazy sweep: guest order with `CreatedAt = now-8d` (DB
  seed) → `GET /orders` as that customer → order `cancelled`.
- Admin trace: `GET /staff/customers` search finds a linked customer;
  admin `GET /orders` (if it exists) — verify route existence first
  (admin may list via the same `/orders` with a flag; check endpoints).

## ChatEndpointsTests

- `POST /chat/visitor` (fresh guest id): 200 `{threadId, token}`; same id
  again → same threadId; `reset=true` → new id, old closed; 5 resets → 6th
  429; invalid guest id → 400.
- `GET /chat/threads/{id}` with `X-Chat-Token` → 200 thread (guest view:
  no assignee/employee fields); without token → 403/404; wrong thread token
  → 403.
- `POST /chat/threads/{id}/messages` (guest token): 201 body; 201 product
  ref; 11th within a minute → 429; body >4000 → 400; closed thread → 409;
  `X-Chat-Token` on wrong thread → 403.
- Attachments: `POST /chat/threads/{id}/files` (guest token, multipart) →
  temp id; send with `attachments` → 201 with `attachments[]` URLs
  (`/files/chat/…?sig&exp`); GET that URL → 200 bytes; tampered sig → 404;
  `temp` without sig → 404.
- Staff flow: employee `POST /chat/threads` (CSRF) new conversation ok;
  claim (two employees, first wins — 409 second); `POST /chat/threads/{id}/assign`
  (admin) → reassign; `POST /chat/threads/{id}/close` (staff) → 204;
  guest send after close → 409.
- Customer: `DELETE /chat/threads/{id}` (CSRF) → 204 (archived, hidden from
  `GET /chat/threads`); employee `POST` reply → thread visible again.
- `GET /chat/threads/{id}/messages?since=` → paged; `?product=` filter.
- SignalR: `negotiate` endpoint reachable (200/400 shape) — hub groups
  verified at unit level only (no live client here).

## HiringEndpointsTests

- `POST /hiring` (public multipart, fresh email): 200 `{id, reapplied:false}`;
  same email again → 200 `reapplied:true`; honeypot `company` → 200 fake id
  (no row); missing email → 400; file >10 MB → 400.
- Admin: `GET /admin/hiring?status=pending` lists it; `GET /admin/hiring/{id}`;
  `POST /{id}/accept` → employee account created (login with temp password
  works, `isStaff:true`); `POST /{id}/decline` (with note) → status changed,
  2nd decline → 409; file `GET /files/hiring/{id}/{file}` (admin cookie) → 200.
- Roles: employee cookie on `/admin/hiring` → 403; guest → 401.

## AdminUserEndpointsTests

- `POST /admin/users` (admin CSRF, employee role) → 200 `{user, temporaryPassword}`;
  temp login → 200 + `mustChangePassword`; duplicate email → 409;
  bad role → 400.
- `PATCH /admin/users/{id}` role toggle (employee→customer) → 200;
  `POST /{id}/password-reset` → 200 (new temp password in body? verify DTO);
  `DELETE /{id}` → soft delete (login → 401/403 gone), admin cannot delete
  self → 400; deactivated account login → 403 `deactivated`.

## FileEndpointsTests

- Avatar/product/order/chat file routes: auth matrix + traversal rejections
  (covered per section above; consolidate asserts here for the 404/400
  shapes and content-type correctness).

## Result (done)

68 endpoint tests, all green in the full run (208/208 total with sub-plan 02):

- `HealthTests` 3 · `IdentityEndpointsTests` 16 · `CatalogEndpointsTests` 10 ·
  `OrderEndpointsTests` 14 · `ChatEndpointsTests` 8 · `HiringEndpointsTests` 9 ·
  `AdminUserEndpointsTests` 8 (file-route auth shapes are asserted inside the
  order/chat/hiring/identity tests, e.g. receipts staff-only, signed chat
  URLs, admin-only hiring files — no separate `FileEndpointsTests` class needed).
- Shared helpers: `EndpointHttp` (status + JSON + error-code asserts),
  `Multipart` fluent builder (fields/files, optional `X-CSRF-TOKEN`),
  `TestUsers` (unique users, login, CSRF token helpers), `FileFixtures`
  (tiny PNG/JPEG/GIF/WebP/PDF, 10 MiB too-big file).
- Notes (draft vs reality, all resolved against the code, no app changes):
  - guest cap = 3 open per phone/device → 4th create 409; honeypot fields
    `website` (orders) / `company` (hiring) → fake success, no row;
  - staff order routes live under `/staff/orders` (not `/orders`); admin
    override lives under `/admin/orders`; assignment is admin-only
    (`PATCH /staff/orders/{id}/assignment`, staff → 403);
  - `ready_for_payment` requires `finalPrice`; delivery requires `actualAt`
    within [now−5y, now+1d]; close = staff `status:"closed"` after
    customer `confirm-delivery` (confirmation only adds a timeline event);
  - chat tokens are thread-scoped (wrong/garbage token → 403 `forbidden`);
    claim is open to any staff (assigns the thread to the caller);
  - unknown roles in `POST /admin/users` are silently dropped → base
    `customer` role (200, not 400);
  - hiring languages: case-insensitive duplicates dedupe silently,
    >6 distinct → 400 `invalid_language`; message >2000 → 400.
- Test-hygiene fix (not an app bug): `ChatServiceTests.Access_OrderThread_Matrix`
  inserted a bare `Order` with `CreatedAt/UpdatedAt = 0001-01-01`, which
  made `GET /admin/orders` 500 (`ArgumentOutOfRangeException` when converting
  the epoch `DateTime` through a `DateTimeOffset` offset) in the full run.
  The test now sets real timestamps.
