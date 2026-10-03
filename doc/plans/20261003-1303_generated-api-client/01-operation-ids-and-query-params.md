# 01 — `operationId` + OData query params on every operation

status: done (2026-10-03)

.NET only. No behavior change: `WithName` sets endpoint metadata (which .NET 10
carries into the OpenAPI document as `operationId`), and the query-param
declarations are document metadata only — binding still happens through the
`QuerySpec` binder reading `Request.Query`.

## 1. `operationId` on all endpoints

All 72 operations need an operationId; today only 18 have one (chat + files).
Add `.WithName("tag.operation")` to every endpoint definition, following the
existing precedent (`chat.bootstrapVisitorThread`, `files.getOrderFile`).
Suggested groups (final names settled per route while implementing):

- identity: `identity.register`, `identity.login`, `identity.logout`,
  `identity.me.get`, `identity.me.update`, `identity.me.passwordChange`,
  `identity.guestLink`, `identity.avatar.upload`
- orders: `orders.create`, `orders.list`, `orders.detail`, `orders.cancel`,
  `orders.rate`, `orders.confirmDelivery`
- staff: `staff.ordersList`, `staff.ordersDetail`, `staff.ordersStatus`,
  `staff.ordersNote`, `staff.ordersPayment`, `staff.ordersDelivery`,
  `staff.ordersAssign`, `staff.products…`, `staff.categories…`,
  `staff.customers…`
- admin: `admin.ordersList`, `admin.ordersMetrics`, `admin.ordersStatus`,
  `admin.users…`, `admin.hiring…`
- catalog + public: `catalog.products`, `catalog.categories`,
  `hiring.submit`, `antiforgery.get`
- keep existing chat / files / health names exactly as they are

Rules: unique across the document (the generator requires it); treat
operationIds as API surface — they become generated method names, so renames
are breaking changes for the frontend.

## 2. OData query params on the 5 QuerySpec list operations

`GET /orders`, `GET /staff/orders`, `GET /admin/orders`, `GET /staff/products`,
`GET /catalog/products` currently declare **no** parameters in the document.
Declare on each:

| name | type | required | description |
|---|---|---|---|
| `$top` | integer | no | page size (min 1; max = endpoint cap) |
| `$skip` | integer | no | items to skip (min 0) |
| `$filter` | string | no | OData v4.01 filter — fields per the endpoint allowlist |
| `$orderby` | string | no | e.g. `createdAt desc` |

Implementation: one more `AddOperationTransformer` in `Program.cs` (where the
ApiError-envelope and binary-file transformers already live), keyed by the
operationIds from step 1. This keeps endpoint definitions clean and the whole
spec-decoration story in one file.

Note: `$`-prefixed parameter names are valid OpenAPI (OData uses them). The
generated client's handling of them is verified in sub-plan 02's spike.

## Definition of done

- [x] `dotnet build` → 0 warnings; `dotnet test` green (no tests exist yet —
  vacuously green).
- [x] Spec check: 72/72 operations have an `operationId`; the 5 list
  operations each carry exactly `$top/$skip/$filter/$orderby`; deep-diff
  against the previous spec = 54 added operationIds + 5 parameter arrays and
  nothing else (verified on a throwaway instance, then on the shared :8085
  after restart — see Notes).
- [ ] Committed `frontend/src/lib/api/schema.json` regenerated via
  `pnpm gen:api` — **deferred** (see Notes: parallel agent owns the in-flight
  schema files; their regen from the current :8085 picks up these changes).
- [x] No endpoint route, binding, validation, or response changed.

## Notes (2026-10-03, while implementing)

- **Parallel agent**: the chat app screen plan (sub-plan 02, "new
  conversations") is being implemented at the same time and owns
  `Endpoints/ChatEndpoints.cs` + `Endpoints/StaffCustomerEndpoints.cs`. This
  sub-plan does NOT touch those files; its two new operations
  (`POST /chat/threads`, `GET /staff/customers`) get operationIds when that
  plan lands. It did land concurrently — the parallel agent named them
  `chat.createThread` and `staff.searchCustomers` (no clash with this
  sub-plan's names).
- Final operationId list (20 new in this sub-plan's files): identity.
  register/login/logout/me.get/me.update/me.passwordChange/guestLink/
  avatar.upload, antiforgery.get, catalog.products.list/product.get/
  categories.list, admin.users.list/create/update/passwordReset/delete,
  hiring.submit, admin.hiring.list/get/accept/decline, staff.products.
  list/create/update/delete, staff.product.get, staff.productImages.
  add/reorder/delete, staff.categories.list/create/update/delete, orders.
  create/list/get/cancel/confirmDelivery/rate, staff.orders.list/get/status/
  note/payment/delivery/attachments/assign, admin.orders.metrics/list/get/
  payment/delivery/status. (files.* + chat.* + Health already had names.)
- Implementation note: .NET 10's bundled Microsoft.OpenApi types
  `OpenApiOperation.Parameters` as `IList<IOpenApiParameter>` (no
  `OpenApiParameters` class) — the transformer assigns
  `new List<IOpenApiParameter>()`.
- **Incident + recovery (2026-10-03 ~11:50 UTC)**: while killing a throwaway
  API instance (port 8099) a `pkill -f 'Hanadicrochet.Api.dll'` also matched
  the Aspire-managed API process, and a follow-up kill of the port-8085
  listener hit DCP's run-controller, taking down the whole Aspire stack
  (8085/3000/5432). Recovered by killing the stale DCP apiserver and
  re-running `dotnet run --project src/Hanadicrochet.AppHost` — all ports
  back UP, Postgres data intact (DCP persists on disk). **Lesson: never
  `pkill -f` on stack processes; kill by PID from `ss -tlnp` only.**
- Handoff state: shared :8085 now serves 72/72 named operations + the 5 OData
  param sets. `frontend/src/lib/api/schema.json` + `schema.d.ts` in the
  worktree are still the parallel agent's uncommitted versions (18 named
  ops); the next `pnpm gen:api` (theirs or ours, after their commit) produces
  the union. Do NOT run `gen:api` until the chat app screen work is
  committed.
