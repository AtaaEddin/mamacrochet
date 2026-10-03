# 03 — Migrate all call sites; remove the old client

status: proposed

Frontend only. After this, the repo has zero route strings outside
`src/lib/api/generated/`.

## 1. Migrate domain wrappers to generated methods

- `lib/chat/api.ts` — visitor bootstrap, thread list/detail, message
  list/send/read/claim, attachment upload (replaces raw fetch)
- `lib/orders/api.ts` — lists (replace `buildPageParams` /
  `buildMyOrdersQuery` with typed `$top/$skip/$filter/$orderby` query args),
  detail, cancel, rate, staff status/note/payment/delivery/assign (the
  multipart ones via generated methods), admin status, metrics, `submitOrder`
- `lib/api/client.ts` — hiring submit; the file keeps the transport wrapper +
  shared helpers (`fileSrc`, `refreshCsrfToken`, error parsing)
- `lib/chat/products.ts` — `fetchChatProducts` → catalog products with
  `{ $top, $orderby }`
- auth / admin / staff wrappers + the components that call the client
  directly (`/identity/me` in my-orders / staff-orders / admin-orders views,
  `account-view`, login/register/change-password forms, `user-dialogs`,
  `hiring-dialogs`, …) → generated `identity…` / `admin…` / `staff…` calls

Domain modules keep their value-add: `ApiError` mapping, result unwrapping
(`OrderCreated` → `{ ok, id, status }`), file-URL helpers, honeypot field,
guestId plumbing, OData `$filter` escaping (single shared helper if still
needed).

## 2. Remove

- `openapi-fetch` + `openapi-typescript` dependencies; `schema.d.ts`
- `api = createClient<paths>(…)` and every path-literal call site
- `buildPageParams` / `buildMyOrdersQuery` / `escapeOData` (unless kept as the
  shared `$filter` helper — decide while migrating)
- any leftover reference in `components/api-status.tsx` or docs to the old
  generated-types path

## 3. Docs

- `frontend/README.md` + the `client.ts` header comment: spec → generated
  SDK (per-operation methods), transport wrapper role.
- Repo-root `AGENTS.md` line "OpenAPI (dev spec → generated TS client)" —
  check the wording still fits; tighten only if misleading.
- `gen-api.mjs` header comment (now: spec fetch + SDK codegen).

## Definition of done

- `rg 'fetch\(' frontend/src` → only the transport wrapper.
- `rg -e '"/(identity|orders|chat|staff|admin|catalog|hiring|files)' frontend/src`
  → zero hits outside `src/lib/api/generated/`.
- `pnpm typecheck` · `pnpm lint` · `pnpm test` green.
- UI verified in a browser (mobile + desktop, light + dark): guest order
  creation with sample images (multipart), staff payment + delivery uploads,
  admin hiring accept/decline, chat attachments, list pagination/sorting on
  the orders and catalog screens.
- Plan file updated; `COMMITS.md` appended.
