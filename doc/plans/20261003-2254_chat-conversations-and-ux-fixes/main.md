# Chat conversation management (delete / new) + chat UX fixes

status: in-progress
created: 2026-10-03 22:54 (+03)
owner: agent (requested by owner 2026-10-03)

## Owner asks (verbatim intent, 2026-10-03, in order)

1. "customer should be able to delete its previous conversations and add new
   ones (for guest customer no login maybe limit it)"
2. "even switching to Arabic the conversation sides shouldn't flip sides"
3. "in chat UI, the products menu at bottom of show all products is just text
   and not a link to navigate to the products list page"
4. "Not sure about this but maybe when a customer clicks on request or order
   the product it adds it into a new conversation or? not sure what's the best
   for our system and UX"
5. "Hanadi in Arabic should be هنادي"

## Today (verified 2026-10-03 in code)

- **Threads have no customer-side delete** (`Data/Chat.cs`): only
  `IsClosed/ClosedAt/ClosedReason` (staff close + 30-day stale sweep).
  Customer "add new" already exists (sub 02 of 20261002-1847: `+` button,
  `POST /chat/threads`).
- **Guest** = exactly one active visitor thread per device (unique filtered
  index + idempotent `POST /chat/visitor`); no new/delete UI at all.
- **RTL**: `MessageRow` positions sides with `self-end` (mine) vs. start
  (staff) — flex-column inline-end follows the document direction, so in `ar`
  the customer bubble flips to the left and the staff side to the right.
- **Works rail foot** (`ProductRail` → `t("railFoot")`) is a plain `<p>` —
  the "browse the full list" text has no link to `/works`.
- **Product CTA**: `/works/[id]` CTA → `/chat?work=<id>`; the product message
  is auto-sent into the *auto-opened latest* thread (user mode) — or never
  sent when the customer has no open thread (the auto-open finds none).
  Guests: device thread. In-thread product bubble keeps "order this /
  custom like this" (guest-capable order form → order + per-order thread).
- **Arabic name**: `messages/ar.json` spells the brand persona **حنادي**
  (10×) — the owner's correct spelling is **هنادي**.

## Decision for ask 4 (owner delegated: "not sure what's the best")

**"Order in chat" starts a NEW conversation about the work.**

Rationale (researched 2026-10-03; sources in `04-product-cta-new-conversation.md`):

- The platform is chat-first by design: payment & delivery are agreed in chat,
  staff work per-conversation (claim/assign/close), and each order is a
  conversation unit (order thread). A fresh order intent from a product page
  is a fresh unit — WhatsApp Business's own model ("customers can … place
  orders without leaving WhatsApp"; the catalog feeds *conversations*, not an
  external checkout form).
- The status quo muddles: the product lands in whatever the latest open
  thread was (unrelated products pile into one thread) and is silently
  dropped when no thread is open.
- Scope of the change: **logged-in customers** arriving with `?work=` get
  `POST /chat/threads` (customer thread) + the product message in it.
  Guests keep their single device thread (their "new conversation" is the
  capped reset, sub 01/02). Staff behavior unchanged.

## Ask 1 semantics (decided)

- **Customer delete = hide-from-me with archive re-appearance** (Messenger /
  Google Messages "archive" pattern; per-participant, not hard delete):
  `DELETE /chat/threads/{id}` sets `CustomerDeletedAt` on the thread; the
  thread is excluded from that customer's list; **any** later send (staff
  reply or the customer re-entering the URL) clears it and the conversation
  reappears. Staff/admin lists, the admin full trace, and the order status
  board are untouched — nothing is erased server-side.
- **Guest "add new" = capped reset** (D16: anonymous, one live thread per
  device — kept): `POST /chat/visitor` gains `reset: true` → the device's
  active visitor thread is closed (`ClosedReason = "guest_reset"`, staff can
  still see it) and a fresh thread is created. Limit: **5 resets / device /
  24 h** (in-memory window like the guest message limiter; no Redis — D9).
  Guests get no delete at all (the reset *is* the delete; there is no guest
  list to clean).
- Guests keep the existing per-IP global limiter + 10 msg/min/device.

## Sub-plans

- `01-thread-delete-and-guest-reset.md` — API: `CustomerDeletedAt` +
  migration, `DELETE /chat/threads/{id}` (customer), guest reset on
  bootstrap + 5/24 h cap, OpenAPI spec + generated client.
  **Done 2026-10-03** (build 0 warn; API-verified via curl+DB: reset closes
  the old thread with `guest_reset`, 6th reset → app-level 429
  `rate_limited`, unauth DELETE → 401/CSRF 403; spec + generated client
  regenerated. The customer-authed DELETE is exercised in the browser in
  sub 02).
- `02-conversation-management-ui.md` — chat UI: per-thread delete + confirm
  (user mode), guest "New conversation" button + confirm + limit notice,
  `use-chat` guest reset, i18n (en/ar/tr).
- `03-rtl-thread-sides.md` — thread sides stay fixed in `ar`
  (`dir="ltr"` message column, `dir="auto"` message bodies).
- `04-product-cta-new-conversation.md` — `?work=` for logged-in customers
  opens a NEW conversation with the work; `?work=` dropped after the first
  send (guests included).
- `05-rail-link-and-ar-name.md` — works-rail "browse the full list" becomes
  a real link to `/works`; ar.json حنادي → هنادي (10×) + verify script.

## Definition of done (all sub-plans)

1. `dotnet build` 0 warnings; schema change via EF migration only (no test
   project in the repo yet — behavior verified via browser/API).
2. `pnpm typecheck` · `pnpm lint` (zero warnings) green.
3. Browser-verified: customer delete (guest + user, mobile + desktop,
   light + dark), guest reset + limit, `ar` thread sides unflipped (customer
   right / staff left), rail link navigates to `/works`, ar name reads
   هنادي, product CTA opens a fresh conversation (logged-in customer) and
   still works for guests.
4. Plan file updated; `COMMITS.md` appended; clean commit(s).
