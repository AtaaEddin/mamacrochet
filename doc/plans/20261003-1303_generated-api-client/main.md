# Generated per-operation API client — no route strings in the frontend

status: done
created: 2026-10-03 13:03 (+03)
owner: agent (requested by owner 2026-10-03)

## Why

Owner goal: "not to have string route in files like `frontend/src/lib/chat/api.ts`
— but to have it use a method function from the generated client."

The current `openapi-fetch` client is types-only: no per-operation functions are
generated, so every call site writes the route literal
(`api.POST("/chat/threads/{threadId}/messages", …)`). On top of that, several
endpoints need hand-built raw `fetch()` calls (multipart bodies and the
OData-style list queries the spec doesn't declare).

## Today (verified 2026-10-03)

- 72 OpenAPI operations; only **18 have an `operationId`** (chat + files, set via
  `.WithName("chat.…")` in `Endpoints/ChatEndpoints.cs` — in .NET 10 the
  endpoint name becomes the document's `operationId`).
- **5 list endpoints** bind through the custom `QuerySpec`/`QueryBinder`
  (plan 04, D19) reading `$top/$skip/$filter/$orderby` from `Request.Query`
  directly: `GET /orders`, `GET /staff/orders`, `GET /admin/orders`,
  `GET /staff/products`, `GET /catalog/products`. The OpenAPI document
  declares **no query parameters** for them, so a typed client cannot type
  their queries — the frontend builds the strings by hand
  (`buildPageParams`, `buildMyOrdersQuery`, `fetchChatProducts`).
- Raw `fetch()` with template-literal routes (all get generated methods
  instead):
  - `lib/orders/api.ts` — 3 list calls (customer/staff/admin), `submitOrder`
    (multipart), staff payment recording (multipart + receipt file), staff
    delivery recording (multipart + proof file), thread-with-files,
    admin metrics
  - `lib/api/client.ts` — public hiring submit (multipart)
  - `lib/chat/api.ts` — attachment upload (multipart)
  - `lib/chat/products.ts` — `GET /catalog/products?$top=&$orderby=`
- Transport plumbing that must keep working unchanged (lives in
  `lib/api/client.ts`): `credentials: "include"` cookies, CSRF
  `X-CSRF-TOKEN` on `/identity` + `/admin` mutations, 403-csrf re-fetch +
  retry, token refresh after login/register, fetch timeout, `ApiError`
  envelope parsing.

## Target

Every frontend API call goes through a **generated per-operation method
function** (one per operation, named from `operationId`, grouped by tag):

```ts
sendMessage({ path: { threadId }, body: { … } });
ordersList({ query: { $top: 20, $skip: 0, $orderby: "createdAt desc" } });
submitOrder({ body: { kind, name, phone, files } }); // multipart, typed
```

Domain modules (`lib/chat/api.ts`, `lib/orders/api.ts`, …) stay as thin
wrappers (error mapping, result unwrapping, file-URL helpers, honeypot +
guestId plumbing) but contain **zero route strings**. `openapi-fetch` + the
`openapi-typescript`-generated `schema.d.ts` are removed; committed
`schema.json` stays as the codegen input.

## Sub-plans

- `01-operation-ids-and-query-params.md` — .NET: `operationId` on all 72
  operations; declare the OData query parameters on the 5 QuerySpec list
  operations. No behavior change.
- `02-codegen-setup.md` — frontend: `@hey-api/openapi-ts` config + generated
  SDK; wire the existing cookie/CSRF/timeout wrapper as the transport;
  multipart + query-param spike. Coexists with the old client.
- `03-migrate-call-sites.md` — frontend: migrate all domain wrappers +
  components to generated methods; remove string routes, raw fetches, and the
  old dependencies.

## Progress

- **01 done (2026-10-03)**: 54 new `WithName`s + OData-param transformer in
  `Program.cs`. Shared :8085 serves 72/72 named operations + the 5 query
  param sets (verified; deep-diff clean). See 01 Notes (incl. an Aspire
  stack restart incident, recovered).
- **02 done (2026-10-03)**: `@hey-api/openapi-ts` 0.99.0 codegen wired
  (`openapi-ts.config.ts`, generated tree in `src/lib/api/generated/`,
  `gen-api.mjs` extended) + transport injected via
  `generated-client.ts` (`browserFetch` now exported, cookies/CSRF/retry
  unchanged). Browser spike: all 7 scenarios pass (OData `$`-params, 3
  multipart paths, typed 4xx, CSRF plumbing). Full `pnpm gen:api` run —
  regenerated spec files converge with the parallel agent's in-flight work
  (deep-diff = exactly 01's 59 nodes); typecheck + lint zero warnings. See
  02 Implementation log.
- **03 done (2026-10-03)**: all call sites migrated to the generated SDK;
  `openapi-fetch`/`openapi-typescript`/`schema.d.ts` removed; zero route
  strings + zero raw fetch outside the generated tree and transport. Browser
  verification 16/16 in light AND dark (guest order w/ multipart, chat
  attachment, hiring accept/decline, staff payment/delivery lifecycle,
  register/login, DB assertions). See 03 Notes.

## Known pre-existing issues (surfaced during 03 browser verification)

Not fixed under this plan (no behavior changes allowed). See
`03-migrate-call-sites.md` → “Pre-existing product issues found”:
chat attachment images 404 (missing `fileSrc()`), staff chat auto-open 403
(unclaimed visitor threads), hiring dialog overflow, two `use-chat` send
races (pending-file drop, pre-bootstrap send drop).

## Decisions (recorded with sources)

- **Generator: `@hey-api/openapi-ts` (v0.99.0 today) + `@hey-api/sdk` plugin +
  `@hey-api/client-fetch` (v0.13.1 today)** — emits a typed method function
  per operation (named from the operationId, grouped by tag) on top of a
  fetch transport. The previously mainstream option
  `openapi-typescript-codegen` is unmaintained; its README directs migration
  to `@hey-api/openapi-ts`. `openapi-fetch` (the current option) generates
  no per-operation functions at all — it is types-only with path-literal
  calls, exactly what the owner wants removed. Sources:
  - SDK plugin (typed functions per operation): https://heyapi.dev/openapi-ts/plugins/sdk
  - `openapi-typescript-codegen` unmaintained → `@hey-api/openapi-ts`: https://github.com/thulium/openapi-typescript-codegen
  - client-fetch: https://heyapi.dev/docs/openapi/typescript/clients/fetch
- **Transport stays ours.** `@hey-api/client-fetch` accepts a custom `fetch`
  implementation (config `fetch` option / `client.setConfig({ fetch })`).
  Inject the existing `client.ts` wrapper so cookies, CSRF, timeout and
  `ApiError` parsing are unchanged. Source: client-fetch docs (custom `fetch`
  config option).
- **Multipart = typed object, not hand-built FormData.** For
  `multipart/form-data` request bodies the SDK generates methods whose body is
  a typed object (incl. `File[]`); the generated `formDataBodySerializer`
  builds the `FormData`. So `submitOrder`, hiring submit, payment/delivery
  recording and attachment uploads all drop their raw fetch. Known rough edge
  (FormData Content-Type serialization) is covered by the sub-plan 02 spike;
  fallback is a generated method + explicit `FormData`/`bodySerializer`
  override (still no route strings). Source:
  https://github.com/hey-api/openapi-ts/issues/1590
- **One source of truth stays OpenAPI.** Same `/openapi/v1.json`;
  `pnpm gen:api` keeps its shape: fetch the live spec (Aspire stack running) →
  write `schema.json` → run codegen. No server-driven UI schemas, no
  hand-written DTOs — this plan only changes *how much* of the client is
  generated from the same spec.
- **`operationId` naming: lowercase `tag.operation`** — existing precedent
  (`chat.bootstrapVisitorThread`, `files.getOrderFile`). OperationIds are the
  generated method names, so they are API surface: stable, unique across the
  document.

## Out of scope

- Any UI change, behavior change, or API surface change (endpoints, request
  and response shapes are untouched).
- Server-component data fetching (the client is browser-only today and stays
  browser-only).
- OpenAPI diff-as-CI (the spec is reviewed when `pnpm gen:api` runs).
- The "UI build schema JSON" idea from the 2026-10-03 discussion — not needed
  for this goal; UI stays hand-built.
