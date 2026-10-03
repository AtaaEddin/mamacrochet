# 01 — Chat app screen (no page scroll, 4-part bordered layout)

status: in-progress (verification done 2026-10-02; commit pending)

The `/chat` page becomes a full-viewport chat app screen: no site header or
footer, no page scroll, four bordered parts (top bar / left conversation
list / middle thread / right works rail / bottom composer). Frontend-only —
no API changes, no migrations.

## Changes

### 1. Route group so `/chat` has no site chrome
- Move every `[locale]` segment except `chat/` into `[locale]/(shop)/`
  (route group — URLs unchanged): `account`, `admin`, `change-password`,
  `join`, `login`, `orders`, `page.tsx`, `register`, `request-custom`,
  `staff`, `works`, `not-found.tsx`.
- New `[locale]/(shop)/layout.tsx` renders `SiteHeader` + `main` +
  `SiteFooter` (moved out of the `[locale]` layout).
- `[locale]/layout.tsx` keeps `html`/`body`, providers, `ChatLauncher`,
  `Toaster` — drops the header/footer/main wrapper so `/chat` renders
  bare (its own `h-[100dvh]` fits exactly → no document scroll).

### 2. `ChatPanel` rework (the whole component)
- **Top bar** (replaces the old header + the separate exit bar):
  - start: Back button (44 px, `ArrowLeft` `rtl:rotate-180`,
    aria-label + title).
  - then: company logo `HanadiMark` `size-8` — no wordmark, no status line.
  - end: Home + All-works icon buttons (44 px), then the reconnect button
    only while `status === "error"`.
  - `h-14`, `border-b border-border`. `nav aria-label` for the three
    destinations.
- **Left** — conversation list (≥lg only; `lg:w-[280px] xl:w-[320px]`,
  `border-e border-border`, scrolls internally):
  - Users: `fetchThreads()` (existing endpoint) with preview + unread +
    closed badge, refreshed on a 15 s poll (moved off the page).
  - Guests: a single row for the device's visitor thread.
  - Row tap → open that thread (URL `?thread=`, the existing mechanism).
  - A "New conversation" slot lands with sub-plan 02 (render the button
    only when the handler prop is provided).
- **Middle** — the thread, unchanged rendering (`MessageRow`, empty state,
  closed banner), `min-h-0 flex-1 overflow-y-auto`, auto-scroll to bottom.
- **Right** — the product rail, unchanged, `lg:w-[340px] xl:w-[380px]`,
  `border-s border-border`, scrolls internally. Hidden below `lg`
  (products stay reachable via the composer's search button).
- **Bottom** — composer (full width, `border-t border-border`, always
  visible): error line, quick-topic chips, product picker, pending files,
  then the rounded composer (or the closed note). A growing textarea
  compresses the thread, never the composer.
- **Borders**: solid `border-border` (no `/60`) between every pair of parts.
- **Back semantics** (one level up):
  - mobile thread view → the conversation list;
  - anywhere else → previous page (return-to) or Home.
- **Mobile (<lg) flow**: top bar → (user: conversation list step) →
  thread + composer. Guests skip the list step. Back from the thread returns
  to the list (user) / previous (guest).

### 3. `/chat` page shrinks
- The page only decides mode + threads + Back and renders `<ChatPanel>`;
  the old full-page list view is gone (the list is now the left pane /
  mobile step inside the panel). The page root keeps `h-[100dvh]`.

### 4. i18n (`ChatPanel` namespace; `en`/`ar`/`tr`)
- Move `listTitle`, `listEmpty`, `noSubject`, `closed`, `home`, `works`,
  `exitLabel` from `Chat` into `ChatPanel`.
- Drop the status strings (`statusLive`/`statusConnecting`/`statusPolling`/
  `statusClosed`/`statusError`) and the `Chat.listHint` usage.
- Add `newConversation` (button label — wired in sub-plan 02).
- `Chat.back` + `Chat.allConversations` stay (the page still computes the
  Back label).

### 5. Cleanup
- Delete `components/chat-exit-bar.tsx` (superseded by the top bar).
- Update `scripts/verify-fab-exit.mjs` selectors that pointed at the old
  exit-bar row.
- New `scripts/verify-chat-app-screen.mjs` (DoD item 2).

## Verification (2026-10-02)

- `pnpm typecheck` · `pnpm lint` green · `dotnet build` 0 warnings/0 errors.
- `dotnet test`: no test project in the solution (no-op — nothing to run).
- `scripts/verify-chat-app-screen.mjs` — **44/44**, run twice back-to-back
  (mobile + desktop, EN + AR, light + dark; screenshots in
  `/tmp/hanadicrochet-shots`):
  - no page scroll; composer in viewport (mobile + desktop);
  - no site header/footer on `/chat`; one slim top bar (Back + logo,
    Home + Works icon buttons); no wordmark, no status line;
  - 4 borders ≥1 px (top-bottom / list-right / rail-left / bottom-top);
  - mobile: user list step (composer/thread hidden in it, page does not
    scroll); guest goes straight to the thread view;
  - guest visitor-thread row appears in the list (GM14/GD8);
  - signed-in user: list title, empty state, thread opens from the list.
- `scripts/verify-fab-exit.mjs` — **28/28** (FAB flow, back semantics,
  guest-link → linked thread shows in the signed-in list, RTL, dark).

### GD8 flake — root cause (resolved; QA-side only)

Two independent causes, both found with in-script network/console tracing:

1. **D16 guest budget (5/min per IP)** on `POST /chat/visitor`
   (`Program.cs` rate limiter, `guest` bucket). The harness creates several
   fresh guests from one IP, and dev StrictMode doubles every bootstrap
   call — the script 429s its own bootstraps, and `use-chat` has no
   automatic retry, so the row never appeared. Fix: `guestRow()` helper —
   wait for the row, else wait out the fixed 1-minute window, reload,
   wait again (one retry).
2. **`page.waitForSelector` never resolved for a row inside the mobile
   `display:none` list container** (playwright-core 1.63 + system Chromium,
   repro: row present in DOM per `locator.count()`, waitForSelector
   timed out for 20 s while the API calls all returned 200). Fix: poll
   `locator(ROW_SELECTOR).count()` instead.

## Definition of done (this sub-plan)
1. `dotnet build` 0 warnings · `dotnet test` green (untouched, re-verified;
   no test project exists yet — no-op).
2. `pnpm typecheck` · `pnpm lint` green.
3. Browser (playwright-core + system Chromium), EN + AR, light + dark,
   mobile 390×844 + desktop 1280×800:
   - `/en/chat` document does **not** scroll; no site header/footer.
   - Composer visible in the viewport without scrolling (mobile + desktop).
   - Only the thread and (≥lg) the works rail scroll internally.
   - Top bar has Back/logo/Home/Works; no "Hanadi" wordmark, no status line.
   - User sees the conversation list (left pane ≥lg / first step mobile);
     tapping a thread opens it; Back returns to the list (mobile) or
     previous (desktop).
   - Borders between top / left / middle / right / bottom are visible.
   - Screenshots → `/tmp/hanadicrochet-shots`.
4. Plan file + `COMMITS.md` updated; clean commit.
