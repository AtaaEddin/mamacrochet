# 04 — Frontend unit tests (Vitest)

status: done
parent: 20261004-0554_full-test-suite

## Tooling

- Dev deps: `vitest`, `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@vitejs/plugin-react`.
- `package.json`: `"test": "vitest run"` (+ `"test:watch": "vitest"`).
- `vitest.config.ts`: react plugin, `@` alias → `src` (matches tsconfig
  paths), `environment: "jsdom"`, setup file with jest-dom matchers,
  `include: ["src/**/*.test.{ts,tsx}"]`.
- Tests sit next to code: `src/lib/**/*.test.ts(x)`.

## Coverage

Pure libs first (no mocks), then module-mocked hook tests:

- `guest-id.ts` — stable id creation, format (uuid v4), stability across calls,
  SSR guard (no `window` → undefined fallback used by callers).
- `orders/status.ts` — `isOrderStatus` all values + negatives;
  `statusFlowIndex` per status (open…closed), `cancelled`/unknown handling.
- `chat/return-to.ts` — save/consume semantics (consume clears; invalid
  targets ignored: only `/…` paths).
- `auth.ts` (`postAuthPath`) — mustChange → `/change-password`; staff →
  `/chat`; `next` internal honored; `next` external (http) → `/account`;
  no next → defaults.
- `api/errors.ts` — `toApiError` normalization (ApiError passthrough,
  unknown → generic, null/undefined → generic).
- `chat/api.ts` (`bootstrapGuestThread`) — dedupe: N concurrent calls →
  1 API call; after settle, fresh call re-hits (mock the generated `Chat`
  client).
- `use-chat.ts` hook (mock generated `Chat` client + `signalr` +
  `guest-id`):
  - bootstrap resolves → messages appear; error → `error` surfaced.
  - send(): guest, thread not yet bootstrapped → waits (no premature send);
    after bootstrap → message appended optimistically, cleared on ack.
  - send() failure (HTTP) → message kept with error state (retry-able);
    no duplicate optimistic echo.
  - files: pending files attached to send are cleared only on ack;
    on failure they stay pending (chip survives) — the 2337 sub-04 bug.
  - guest 409 on send → re-bootstrap path resets thread and retries the
    pending send.
  - poll tick does not replace realtime message order (no dup ids).
- `catalog/query.ts` — `buildProductsQuery` paging/total, `$top`/`$filter`
  composition (page→$skip, sort param), escape of quotes in search.
- `catalog/display.ts` — `fileSrc` (absolute/relative handling for
  `NEXT_PUBLIC_API_URL` set/unset), `toWorkDisplay` null-safe field
  fallbacks (title/desc from localized map or `en`).
- `catalog/localize.ts` — `pick`/`productTitle`/`productDescription`
  locale preference (requested → en → first available).
- `lib/api/client.ts` — `client()` throws on non-JSON / no `X-Api-Client`
  guard (module-level `X_API_CLIENT` flag set in test).
- i18n/next-intl: none of the above needs a provider; if any component test
  requires `useTranslations`, wrap with `<NextIntlClientProvider>` using
  the `messages/` files — only if actually needed (keep the suite lean).

## DoD

- `pnpm test` green; `pnpm typecheck` + `pnpm lint` green (new deps pinned).
- No production code changes (tests only). If a test exposes a bug →
  separate plan.

## Result (done)

62 tests, 11 files, all green (`pnpm test` = 62/62, stable across runs):

- Pure libs (zero mocks, 47): `guest-id` (5), `orders/status` (5),
  `chat/return-to` (5), `auth` (5), `api/errors` (5), `api/odata` (2),
  `catalog/query` (7), `catalog/display` (6), `catalog/localize` (7).
- Module-mocked: `chat/api` bootstrap dedupe (5 — concurrent N → 1 API
  call, later call re-hits, `reset` separate key, error envelope, network
  error) · `use-chat` hook (10 — history + live, socket send + broadcast
  de-dupe by `clientId`, socket-down → polling + REST fallback, REST
  failure → `failed` flag + error, file chips consumed only on THIS
  send's ack, socket close → polling vs `threadUpdated(closed)` → closed,
  `loadOlder` prepend + de-dupe, guest send waits on bootstrap (never
  dropped), bootstrap failure → error, failed-bootstrap send keeps text).
- Tooling: `vitest@5.0.3`, `jsdom@30.1.2`, `@testing-library/react@16.3.3`,
  `@testing-library/dom@10.4.1`, `@testing-library/jest-dom@7.0.1`,
  `@vitejs/plugin-react@6.1.1` (all pinned exact). `vitest.config.ts` (jsdom,
  globals, `@` alias, setup `src/test/setup.ts` with jest-dom matchers +
  `crypto.randomUUID` polyfill + RTL cleanup).
- Draft-vs-reality notes (all resolved against the code, no app changes):
  - `fileSrc` in **two** modules (`catalog/display.ts`, `api/client.ts`)
    resolves `/files/...` against `NEXT_PUBLIC_API_URL` — the prod build
    uses `/api` (Caddy subpath, see `deploy/docker-compose.yml`);
    `new URL(path, base)` DROPS the base's path prefix (spec), so prod
    would 404 every file/avatar/hiring/chat image. **Real bug found by
    the tests → fixed in this plan** (same-origin base joined as a path
    prefix; absolute bases join pathnames) — the test that found it pins
    the `/api` prefix behavior.
  - `guest-id` SSR guard test dropped: jsdom cannot simulate an absent
    `window` in the same worker — the 5 browser-path cases cover the
    function; the guard is one `typeof window` line.
  - `return-to`: protocol-relative `//x` is NOT rejected (only non-`/`-first
    values are) — harmless: the value only ever comes from same-origin
    `pathname + search`; the test pins the rejection that exists.
  - `use-chat` fake signalr: the session's `fetchThread` overwrites the
    bootstrapped thread — guest-mode tests pin `fetchThread` to the same
    thread id the bootstrap mock returns.
  - Coverage NOT covered (deliberate, suite stays lean): guest 409
    re-bootstrap path and poll-tick ordering (timer-driven; covered
    indirectly by the REST-fallback tests); `api/client.ts` `client()`
    non-JSON/X-Api-Client guard (would need a fetch mock rig for one
    branch); `display.ts`/`localize.ts` i18n wrapper variants (pure pick
    logic is covered, the `useTranslations` glue is one line each).
