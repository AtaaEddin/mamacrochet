# 03 — Migrate all call sites; remove the old client

status: done

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
- `rg -e '"/(identity|orders|chat|staff|admin|catalog|hiring|files)/' frontend/src`
  → zero hits outside `src/lib/api/generated/` (and the transport wrapper's
  CSRF path matcher in `client.ts`; Next.js *page* routes like `/chat`,
  `/staff/orders` are navigation, not API calls).
- `pnpm typecheck` · `pnpm lint` · `pnpm test` green.
- UI verified in a browser (mobile + desktop, light + dark): guest order
  creation with sample images (multipart), staff payment + delivery uploads,
  admin hiring accept/decline, chat attachments, list pagination/sorting on
  the orders and catalog screens.
- Plan file updated; `COMMITS.md` appended.

## Notes (done 2026-10-03)

### What landed

- All domain wrappers migrated to generated methods: `lib/chat/api.ts`,
  `lib/chat/products.ts`, `lib/orders/api.ts`, `lib/staff/api.ts`,
  `lib/auth.ts`, `lib/catalog/query.ts` + `server.ts` (RSC server client
  instance in `server.ts`), `lib/api/client.ts` (hiring submit; keeps
  transport + `fileSrc`/CSRF helpers). `lib/api/odata.ts` kept as the single
  shared OData `$filter` builder (decision: one helper beats per-module
  string building; no route literals in it).
- ~20 components migrated (auth forms, account view, auth-badge, use-me,
  my/staff/admin orders views, staff products/visitors, admin users + hiring
  views/dialogs, api-status, chat page).
- Removed: `openapi-fetch`, `openapi-typescript`, `schema.d.ts`, all
  path-literal call sites, hand-built query strings.
- Small backend **spec-only** fix (no behavior change): the 4
  payment/delivery recording endpoints in `OrderEndpoints.cs` were missing
  `.Produces(…)` success types — the spec now declares them so the generated
  methods type their 200 bodies.
- DoD greps pass; `dotnet build` 0 warnings; typecheck/lint/test green.

### Browser verification (Playwright, real stack)

16-check script (12 UI scenarios S1–S9 + 4 DB assertions), run end-to-end in
**both light and dark**, each 16/16: home/works catalog renders, guest custom
order with sample image (multipart → `orders=1 files=1` in DB), guest chat
message + attachment (msgs/attachments in DB), customer register + profile
save + logout, customer login + my-orders, admin hiring accept (employee
account created in DB) + decline, admin users list, staff full lifecycle
open→in_progress→ready→paid (receipt file)→delivered (proof file)→closed
(`delivered pay=1 del=1 files=3` in DB). Console/network gate: zero
unexpected errors per run.

### Pre-existing product issues found (OUT of scope — candidates for
separate plans; none were fixed here)

1. **Chat attachment images never render** — the API returns *relative* signed
   URLs (`/files/chat/{tid}/{file}?sig=…`); `chat-panel.tsx` renders
   `attachment.url` raw, so the browser resolves it against the web origin
   (:3000 dev / Caddy web in prod) which has no `/files` route → 404. Every
   other file type already goes through `fileSrc()`; chat attachments were
   missed. Fix candidate: wrap chat attachment URLs in `fileSrc()`.
2. **Staff `/en/chat` auto-open 403** — the staff thread list intentionally
   includes unclaimed visitor threads, but `CheckAccessAsync` denies
   non-admins on threads with no assignee/customer → the auto-opened newest
   (guest) thread 403s on open. Fix candidate: skip/claim unclaimed threads
   on auto-open, or align list with access rules.
3. **Hiring detail dialog overflows** — no `max-h`/`overflow-y-auto` on the
   content; at viewport heights ≲ 1000px the Accept/Decline buttons sit
   below the fold and are unclickable. Fix candidate: cap dialog height with
   internal scroll.
4. **`use-chat.ts` `send()` clears `pendingFiles` unconditionally on
   completion** — a file attached while a previous send is still in flight
   vanishes silently (chip disappears, nothing uploaded, no error).
5. **Guest send before bootstrap completes is dropped silently** — `send()`
   early-returns when `activeThreadId` is null (POST `/chat/visitor` still in
   flight); the Send button is only disabled while `sending`, so the typed
   text is lost without feedback. (The chat page also fires the bootstrap
   twice — two mounted panels — doubling the D16 guest-bucket spend.)

### Test-harness notes (environmental, not product)

- Snap Chromium confines `/tmp` (private mount) — file-backed `File` objects
  from `/tmp` abort uploads with a misleading `net::ERR_ALPN_NEGOTIATION_FAILED`.
  QA fixtures must live under `/home/ataa/`.
- `POST /orders` returns **200** (not 201) on success (`Results.Ok`).
- D16 rate limiting is shared per IP with the parallel agent's stack:
  guest bucket 5/min (`POST /orders`, `/chat/visitor`, `/hiring`), auth
  bucket 30/min. The script self-heals (wait out the 60s window, retry) and
  the gate allowlists D16-correct 429/409 responses.
- D16 `guest_cap` (3 open unlinked orders per device/phone) → 409; the
  script's prep deletes stale QA guest orders each run.
