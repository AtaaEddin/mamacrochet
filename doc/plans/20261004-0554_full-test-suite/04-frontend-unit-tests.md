# 04 — Frontend unit tests (Vitest)

status: proposed
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
