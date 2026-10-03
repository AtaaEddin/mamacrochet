# Chat app screen — no page scroll, 4-part bordered layout, new conversations

status: done (all sub-plans verified 2026-10-03)
created: 2026-10-02 18:47 (+03)
owner: agent (requested by owner 2026-10-02)

## Why — the owner's asks (2026-10-02, in order)

1. "The chat UI shouldn't be scrollable, so the input field message should be
   visible — maybe the only component with scroll is the product list on the side."
2. "The chat UI can be without the main header bar; the buttons of back, home
   and all works can be alongside the name and the logo of the operator."
3. "We don't need to say *Hanadi* and *online* or something — cut the left side;
   a small top holds the company logo and under it a list of current
   conversations."
4. "Both customers and employees to be able to open new conversations as they
   want."
5. "Make sure the borders between each part (left menu, middle, right menu,
   and bottom) are clear."

## Today (verified in browser, 2026-10-02)

- `/en/chat` still renders the site header + site footer around the panel, and
  the page root is `h-[100dvh]` → the document is taller than the viewport and
  **the whole page scrolls**. Measured (desktop 1280×800): scrollHeight 1112 >
  800, composer bottom at y=825 → **the input is below the fold**. Mobile
  390×844: scrollHeight 1220 > 844 (store footer hangs below the chat).
- The exit bar (Back / Home / All works) is a separate row above the panel;
  the panel header shows the HanadiMark + "Hanadi" wordmark + status line
  ("Online — usually replies in a few minutes").
- Signed-in customers see a full-page list (no side list); guests never see a
  list; nobody (customer or employee) can start a new conversation — threads
  only appear via order creation or guest bootstrap.

## Target

A full-viewport **chat app screen** — no site chrome, no page scroll; only the
parts that contain lists scroll, and every part has a clear border:

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR   [←] [logo] ·····················  [home] [works]       │  slim, border-b
├──────────────┬───────────────────────────────────────┬───────────┤
│ LEFT         │ MIDDLE                                │ RIGHT     │
│ conversations│ thread (messages) — scrolls           │ works     │
│ list —       │                                       │ rail —    │
│ scrolls      │                                       │ scrolls   │
│ [+ new (02)] │                                       │           │
├──────────────┴───────────────────────────────────────┴───────────┤
│ BOTTOM  composer — full width, border-t, ALWAYS visible          │
└──────────────────────────────────────────────────────────────────┘
```

- **Top bar**: company logo (small, no wordmark, no online/status text) +
  Back (start side) + Home / All works (end side), 44 px targets,
  `border-b`. Retry appears here only on connection error.
- **Left** (≥lg): the user's conversation list (previews, unread, closed
  badge) + "New conversation" (sub-plan 02). Below lg it is not a pane — it
  becomes the first mobile step (see below).
- **Middle**: the thread. Scrolls internally; auto-scroll to bottom.
- **Right** (≥lg): the product rail (real works), scrolls internally — "the
  product list on the side". Below lg, products stay reachable through the
  composer's search button (existing picker).
- **Bottom**: the composer, full width, `border-t`, always visible.
- **Mobile (<lg)**: top bar → (user: conversation list) → thread + composer.
  The list is a step, not a pane: tapping a conversation opens it; Back in
  the top bar returns to the list. Guests skip the list (one tap from the
  FAB straight to the conversation — chat-first).
- **Borders**: solid `border-border` (no /60 opacity) between every pair of
  parts so the 4-part structure reads at a glance.

## Sub-plans

- `01-chat-app-screen-ui.md` — the screen itself (route-group restructure,
  panel rework, mobile flow, i18n, QA script). Frontend-only.
- `02-new-conversations.md` — `POST /chat/threads` + staff customer search +
  "New conversation" in the customer list and the staff inbox.
- `03-returning-customer-entry.md` — returning customer: thread-aware header
  CTA ("Your chat" + open-count badge) and `/chat` auto-opens the latest open
  conversation.

## Decisions (recorded with sources)

- **Route group for chrome-less `/chat`** — the App Router way to opt one
  route out of the shared header/footer without touching any other page:
  move all `[locale]` pages except `chat/` into `[locale]/(shop)/` with its
  own layout that carries `SiteHeader` + `main` + `SiteFooter`. URLs are
  unchanged (route groups are invisible). Sources:
  - Next.js docs, Route Groups: https://nextjs.org/docs/app/building-your-application/routing/route-groups
  - Vercel route-groups example (`(shop)` group pattern): https://github.com/vercel/next-app-router-playground/tree/main/app/route-groups
- **3-pane conversation list | thread | context rail** is the established
  multi-conversation chat layout (list on the left, thread in the middle,
  auxiliary pane on the right); mobile collapses list ⇄ thread into stacked
  steps. Source: MUI X Chat layout docs
  (https://mui.com/x/react-chat/basics/layout/) — conversation list sidebar +
  thread shell with header/message list/composer.
- **Composer stays in the bottom part, thread absorbs the squeeze**: the
  column heights are definite (no page scroll), so a growing textarea
  compresses the thread instead of pushing the composer away — the input
  can never scroll out of view.
- **Icon-only nav in the top bar** (Back / Home / Works, 44 px,
  aria-label + title): the owner cut the wordmark/status text, so labels
  would fight the logo for width on a 320 px screen; tooltips + accessible
  names keep them discoverable. (Supersedes the 2026-10-01 "labeled pills"
  decision, which applied to the old full-width exit bar row.)
- **Back = one level up**: mobile thread → conversation list; everywhere else
  → previous page (return-to) or Home. Desktop keeps the list pane visible,
  so Back there is always previous/Home.
- **Guests don't see a list step**: one active visitor thread per device
  (D16) — a list of one item adds a tap without information.
- **No migration for sub-plan 02**: new threads are new `ChatThread` rows
  (`kind=visitor`, no order, no guest) — the schema already supports
  threads without orders (nullable `OrderId`/`GuestId`, nullable
  `CustomerId`).

## Out of scope

- Staff/admin page redesign (their inbox keeps the site chrome; sub-plan 02
  only adds a "New conversation" action to it).
- Multi-currency, gateways, analytics (MVP cuts).
- Native mobile apps; this is the responsive web app screen.

## Notes (2026-10-02, while doing sub-plan 01)

- **GD8 flake — root cause (QA, not an app bug).** The guest row check
  flaked because (a) `POST /chat/visitor` sits under D16's strict guest
  budget (5/min/**per IP** — `Program.cs` rate limiter, `guest` bucket);
  this harness creates several guests from one IP (and dev StrictMode
  doubles every bootstrap call), so it 429s itself; and (b)
  `page.waitForSelector` never resolved for a row inside the mobile
  `display:none` list container (playwright-core 1.63 + system Chromium)
  while `locator.count()` is reliable. The QA scripts now wait out the
  fixed 1-minute window + retry once, and poll `count()`.
- **Observation (candidate for a later plan, not done here):** the guest
  bootstrap has no automatic retry — if `POST /chat/visitor` fails (a 429
  behind a shared/NAT IP, or a transient hiccup), the user gets a 6 s error
  line and the manual ↻ retry button in the top bar, but no automatic
  recovery. Consider a bounded backoff retry in `use-chat.ts`.
- **`dotnet test` is a no-op today:** the solution has no test project
  (nothing to run); DoD item "dotnet test green" holds vacuously.
