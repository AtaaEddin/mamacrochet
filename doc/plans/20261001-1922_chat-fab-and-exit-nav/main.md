# Chat FAB on every page + easy exit from chat

status: done
created: 2026-10-01 19:22 (+03)
owner: agent (requested by owner 2026-10-01)

## Why

Owner ask (2026-10-01): "a circle at the bottom corner on any page to open the
chat, for quick access" + "easy to navigate out of the chat back to the
previous page or the home page or the list page of products".

Today:
- `ChatLauncher` FAB exists but is **mobile-only** (`md:hidden`) — no corner
  circle on desktop (the 2026-09-26 decision "desktop keeps the header CTA"
  is hereby superseded: the FAB goes on every page, every viewport).
- `/chat` (guest + list mode) has **no exit affordance**: the thread view has a
  small centered "All conversations" back row, but there is no way back to
  *the previous page*, no Home link, and no link to the products list.

## Scope (small, frontend-only)

1. **FAB on every page** — remove `md:hidden` from `ChatLauncher`; keep it
   hidden where it is pointless: `/chat` (you are already in it) and
   `/staff`, `/admin` (team surfaces with their own chat inbox).
2. **Remember where the visitor came from** — clicking the FAB (or the header
   "Say hi" CTA) stores the current URL in `sessionStorage`; the chat page's
   Back button consumes it. No stored value (deep link / typed URL) → Home.
3. **Exit bar on `/chat`** (all three modes: guest, customer list, thread):
   - Back button (left arrow, `rtl:rotate-180`):
     - guest/list mode → previous page (stored) or Home;
     - thread mode → the conversations list (replaces the old centered row).
   - Home link + "All works" (products list `/works`) link, right side.
   - 44 px tall pills, icon + short label, light+dark+RTL+keyboard safe.

Out of scope: redesigning `/chat` itself, staff/admin navigation, new pages.

## Decisions

- **Left arrow, not a cross** for Back: research (Baymard "Back button
  expectations"; ux.stackexchange cross-vs-arrow) — the arrow reads as
  "return to the previous route", which is exactly the ask; a cross would
  read as "close chat" (ambiguous). Source:
  - https://baymard.com/research-articles/back-button-expectations
  - https://ux.stackexchange.com/questions/145594/cross-or-left-arrow-to-return-to-the-previous-page
- **Stored return-URL, not `history.back()`**: `history.back()` is
  unreliable (typed URLs, restored tabs, no same-tab app history). The FAB /
  header CTA are the only in-app entry points into `/chat`, so recording the
  URL at click time is deterministic and testable. Fallback: Home.
- **FAB stays quiet** (no pulse/bounce) — research on chat-widget placement:
  a launcher should be findable, not noticed (designpixil chatbot window
  patterns). It keeps its fixed `bottom-4 end-4` position (logical → RTL-safe).
- **Exit bar = pills with text labels** (not icon-only) on all viewports:
  the owner's ask is "easy to navigate out" — labeled destinations beat
  icon-guessing; 3 short labels fit 360 px width.
- Reuse existing wording where possible: `Chat.allConversations` (thread back),
  new `Chat.back` / `Chat.home` / `Chat.works` / `Chat.exitLabel` (nav label).
- `sessionStorage` key `hc.chatReturnTo` (per tab, cleared on consume;
  survives refresh; matches the `hc.guestId` convention).

## Files

- `frontend/src/lib/chat/return-to.ts` (new) — remember/consume helper.
- `frontend/src/components/chat-launcher.tsx` — all breakpoints + record return URL.
- `frontend/src/components/chat-cta-link.tsx` (new) — header CTA as client link
  (records return URL); header stays a server component.
- `frontend/src/components/site-header.tsx` — use `ChatCtaLink`.
- `frontend/src/components/chat-exit-bar.tsx` (new) — Back + Home + Works bar.
- `frontend/src/app/[locale]/chat/page.tsx` — exit bar in all 3 modes.
- `frontend/messages/{en,ar,tr}.json` — `Chat.back|home|works|exitLabel`.

## Verification (2026-10-01)

- `pnpm typecheck` + `pnpm lint` green. No backend touched (no dotnet changes).
- Browser: `pnpm`-free `node scripts/verify-fab-exit.mjs <BASE> <API_BASE>`
  (playwright-core + /snap/bin/chromium, kept in `frontend/scripts/` per repo
  convention) — **29/29 PASS**:
  - FAB visible: `/en` + `/en/works` mobile 390×844 (light+dark) AND desktop
    1280×800; geometry 56×56, 16 px margins, bottom-end corner; RTL `/ar` at
    bottom-START (x=16), logical `end-4` mirrors correctly.
  - FAB hidden: `/en/chat`, `/en/staff/chat`, `/en/admin/users` (signed-in;
    anonymous users are redirected to /login by the admin gate, where the
    FAB correctly shows).
  - Flow: `/en/works` → FAB → `/en/chat` → Back → `/en/works` (previous page).
  - F4: header "Say hi" CTA on `/chat` stores no return URL (guard: the
    locale-prefixed chat path must never be stored — fixed in 1a1e23d after
    review caught the dead `startsWith("/chat")` guard).
  - Fresh entry: `/en/chat` → Back → `/en` (Home fallback).
  - Exit bar links: Home → `/en`, All works → `/en/works`; Arabic labels
    الرئيسية / كل الأعمال verified.
  - Signed-in (register + `POST /identity/guest-link`, the same call the
    order confirmation makes): thread list shows the linked thread, thread
    Back label = "All conversations", Back → conversations list (no `?thread=`).
  - Exit bar geometry: 44 px pills, no horizontal overflow at 390 px LTR+RTL,
    composer still visible in guest chat.
  - Screenshots: `/tmp/hanadicrochet-shots/fab-*.png`.

Notes (observed, not fixed — out of scope):
- Pre-existing dev-only console warning on all pages (verified on main with
  changes stashed): hydration attribute mismatch "won't be patched up"
  (React 19 dev) + `401` console noise from the anonymous `/identity/me`
  probe. Neither is caused by this change; the 401 is handled by `use-me`.
- Dev-only quirk: the Next devtools indicator portal (`nextjs-portal` under
  the dev-overlay script) hijacks hit-testing in the bottom-LEFT corner,
  which in RTL is where the FAB sits — a dev-server artifact (no such
  element in a production build); the RTL e2e therefore replicates the
  FAB's behavior (record + navigate) instead of a raw click.
