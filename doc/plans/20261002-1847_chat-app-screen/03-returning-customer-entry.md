# Sub-plan 03 — Returning-customer entry ("not just say hi")

status: done (verified 2026-10-03; commit 58b8bed)
created: 2026-10-02 (owner ask, mid sub-plan 02)

Owner ask (2026-10-02): "instead of just saying 'say hi' I need a convient way
for a customer when it returns back to the website to see its chat UI."

## Gap (verified in code, 2026-10-02)

- The site's chat entry points are the header CTA `Nav.hello` ("Say hi",
  `chat-cta-link.tsx`) and the floating bubble (`chat-launcher.tsx`) — both
  identical for guests and signed-in users.
- A signed-in customer who comes back has ongoing conversations, but the CTA
  doesn't say that, and arriving at `/chat` with no `?thread=` shows the
  middle pane "pick a conversation" — no thread is pre-opened.

## Changes (frontend-only; no API changes)

1. **Thread-aware header CTA** (`chat-cta-link.tsx`, client — the header
   stays a server component):
   - After hydration and on every in-site navigation (the header persists
     across navigations, so refetch per pathname):
     `GET /chat/threads?closed=false` (page 1, ≤ 50).
   - `200` + ≥ 1 open thread → label `Nav.yourChat` + badge = number of open
     (unclosed) threads. `401` (guest/anonymous) or 0 threads → keep
     "Say hi" (no badge).
   - Initial render is always "Say hi" (hydration-safe); the variant appears
     only after the fetch resolves. Request-id guard against races.
2. **`/chat` auto-opens the latest conversation** (signed-in users):
   - `chat-panel.tsx`: once the thread list has loaded, in user mode with no
     `?thread=`, call `onAutoOpenThread(threadId)` with the latest OPEN
     thread (the API list is already ordered by last activity desc —
     `ListThreadsAsync`). One-shot per panel mount (ref guard): Back to the
     list (removing `?thread=`) must not re-trigger.
   - `chat/page.tsx`: the handler is `router.replace` → `?thread=…` — the URL
     stays the single source of truth, no local state.
   - `?thread=` writes are unified on `router.replace` (the list tap used a
     hard `window.location.search` navigation — a full reload on every thread
     switch, incompatible with auto-open).
   - Guests unchanged (their single visitor thread auto-selects, D16).

## i18n (en / ar / tr)

- `Nav.yourChat`, `Nav.yourChatAria` (param `{count}`) — new.
  `Nav.hello` unchanged (still the guest / no-threads label).

## Out of scope

- Staff/admin inbox or account-page redesign (the CTA variant applies to any
  signed-in user with open threads — that is the whole point).
- Unread-message count badge — the badge is the count of open
  conversations ("see its chat UI"); per-row unread badges already exist in
  the list.

## DoD

- `pnpm typecheck` + `pnpm lint` green.
- Browser (light + dark, mobile + desktop):
  - Guest on a shop page: CTA "Say hi", no badge.
  - Signed-in user, 0 threads: "Say hi" (200 + empty list).
  - Signed-in user, N open threads: "Your chat" + badge N.
  - `/chat` without `?thread=`: auto-opens the latest open thread (URL gains
    `?thread=`, middle pane shows that thread).
  - Mobile: `/chat` lands on the thread view (list hidden); Back → list, and
    it STAYS on the list (no auto re-select).
- QA: new `RC` section in `verify-chat-app-screen.mjs` (reuses its
  registered user).

## Verification (2026-10-03)

- `pnpm typecheck` + `pnpm lint` green (no API change — no `dotnet build`
  delta for this sub-plan; verified on the final tree state).
- `scripts/verify-chat-app-screen.mjs` — **RC section 17/17** (full script
  78/78): guest CTA "Say hi" (no badge span); signed-in user with 0 threads
  → "Say hi"; after `POST /chat/threads` → CTA "Your chat" + badge "1"
  (+ aria-label); `/chat` auto-opens the latest open thread (URL `?thread=`,
  middle pane visible, no "Pick a conversation"); mobile lands in the thread
  view, Back → list and STAYS on the list; dark context badge OK; no page
  errors. Screenshot: `return-customer-cta-desktop.png` in
  `/tmp/hanadicrochet-shots`.
- i18n `Nav.yourChat`/`Nav.yourChatAria` in `en`/`ar`/`tr`.