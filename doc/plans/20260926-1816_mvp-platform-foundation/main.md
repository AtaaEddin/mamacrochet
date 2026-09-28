# MVP Platform Foundation

status: in-progress
created: 2026-09-26 18:16 (+03)
owner: agent (bootstrap, first plan)

## Goal

Ship the smallest platform that covers mamacrochet's full operating loop:
catalog of stock products **and** custom (made-to-order) products, order status board,
chat, receipt-based payment, delivery, hiring, and self-hosted deployment on low-power
hardware.

## Context (from owner)

- One employee today; no stock yet — the first catalog entries will be sample pieces
  (no stock) that customers can still order as made-to-order items.
- No payment gateway (Stripe etc.) for now: payment is agreed in chat between customer
  and employee, and proven by an uploaded receipt file.
- Everything is hosted on one machine (Raspberry Pi / old PC) via Docker.
- **First-release priorities (owner, 2026-09-26)**: working platform, products,
  orders, Arabic, chat, deployable. Gmail/email sending is OUT of the first release
  (future plan, D13).
- **Core product idea (owner, 2026-09-26)**: the website revolves around chat —
  **anonymous visitors** can browse, chat with the team, and start an order **without
  an account**; login/registration is asked only at the confirmation stage. The flow
  must feel seamless, friendly, easy — capture the visitor's attention early.
- **Brand feel (owner, 2026-09-26)**: feminine, soft “fluffy”, cozy and happy —
  “like entering a store full of cute dolls”, ambient and inviting (plan 11).

## Scope

### IN (MVP)

- Roles: Customer, Employee, Admin (RBAC, one User entity).
- Customer accounts: register + login. Release 1 has **no email sending**: no
  verification, no forgot-email page, no self-service reset (admin resets passwords).
  **Google sign-in (D17) is a core feature but ships in the future release** (with
  email/notifications) — see the future plan in `doc/plans/`.
- **Guest-first (D14)**: anonymous visitors browse, open a chat thread, and start an
  order (name + phone, no account); login/registration at confirmation links the
  order + thread to the account. Guest actions are bounded (D16).
- Staff accounts: separate login (no public registration); admin creates/assigns.
- Catalog: products (category, images, USD price, stock units, visibility), public
  browsing, mobile-first. Out-of-stock stays visible → "ask / request custom" CTA.
- Orders — **one concept** (decision D1): `kind = catalog | custom`; custom orders carry
  customer-uploaded sample images + spec text.
- Order status board: live timeline visible to customer and employee; admin sees all.
- Chat: floating chat widget for **anonymous visitors** (guest thread) + per-order
  threads (customer ↔ employee ↔ admin); attachments; realtime (D14).
- Payment: recorded amount + receipt file (pdf/image) required for `paid`
  (admin override requires a written reason note).
- Delivery: method + actual date/time + description; `closed` only when paid + delivered.
- Employee management: admin assigns customers→employees; work history, average duration,
  per-order customer rating.
- Hiring: public page + form (phone, email, country, nationality, languages, previous
  work) → admin accept/decline → employee account.
- Localization: en (default) + **ar (full RTL) — both complete for release 1**; tr
  scaffolded (translations best-effort / owner-supplied). Language from profile →
  Accept-Language.
- Themes: light + dark (system default + manual toggle).
- Brand & design language: feminine, soft/fluffy, cozy, happy (plan 11).
- Deployment: Docker Compose (postgres, api, web, caddy), local-disk file storage,
  backup script, one-shot deploy script.

### OUT (explicitly not in MVP)

- Regional / multi-currency pricing (Steam-like). Keep extension point: price stored as
  amount + currency code, display USD only.
- Payment gateways, public reviews site-wide, wishlists, coupons, promotions,
  analytics dashboards, native mobile apps, multi-tenant / marketplace fees.
- **Email sending of any kind in release 1** (Gmail SMTP = later plan, D13): no
  verification / forgot-email / notification emails — admin follows up offline
  (phone/chat).
- **Self-service password reset** in release 1 (admin resets; returns with the future
  email plan).
- **Google sign-in** in release 1 (core feature, future release — D17).
- **Full notification system** (in-app + email; customer/employee/admin) in release 1
  (D18) — ships with email support; release 1 keeps chat unread badges only.

## Sub-plans (this folder)

| #  | File                                | Responsibility                                   | Status      |
|----|-------------------------------------|--------------------------------------------------|-------------|
| 01 | 01-agent-and-skills-setup.md        | Agent skills tree + prompts for Pi               | done        |
| 02 | 02-repo-scaffold.md                 | Aspire 13 + .NET 10 + Next.js 16 skeleton        | done        |
| 03 | 03-identity-and-roles.md            | Accounts, auth, RBAC, user management            | done        |
| 04 | 04-products-catalog.md              | Products, categories, images, stock, public shop | done        |
| 05 | 05-orders-and-status.md             | Order model, lifecycle, status board, assignment | done        |
| 06 | 06-chat.md                          | Realtime chat per order + attachments            | done        |
| 07 | 07-payments-receipts-delivery.md    | Receipt-gated payment, delivery, close rules     | proposed    |
| 08 | 08-localization-and-themes.md       | en/ar/tr i18n (RTL) + light/dark themes          | in-progress (foundation done 2026-09-26) |
| 09 | 09-hiring.md                        | Public hiring page + admin review                | done        |
| 10 | 10-deployment.md                    | Docker Compose prod, deploy/backup scripts       | in-progress (x64 re-verified 2026-09-28 incl. chat via Caddy; Pi test open) |
| 11 | 11-visual-identity.md               | Brand & design language (feminine/fluffy/joyful) | done        |

**Standalone brand/UX revision** — `doc/plans/20260926-2309_mama-identity-chat-first-home/`
(done 2026-09-26): "Mama" identity v2 (grandmother, hair-scarf not hijab; Iznik
red/teal/gold on warm sand; soft coffee dark) + chat-first home (D20/D21). Supersedes
part of plan 11 (mascot, palette, home layout); see its decisions D19–D23 above.

**Future plan (post release 1)** — sibling folder
`doc/plans/20260926-1935_email-notifications-google-login/`: email sending (D13),
notifications for all roles (D18), Google sign-in (D17), self-service password reset.

## Execution order (phases)

1. 01 (skills) + 02 (scaffold) — foundation, can run in parallel
2. 11 (visual identity) + 08 foundation (next-intl/RTL + brand theme tokens) —
   the look & feel exists before feature pages
3. 03 (identity, incl. guest mode + account linking) — everything depends on it
4. 04 (products) — needs auth + file storage
5. 06 (chat, incl. guest threads) + 05 (orders, incl. guest orders) —
   the core loop the site revolves around
6. 07 (payment/delivery rules) — completes the order loop
7. 08 (finish en + ar translations) + 09 (hiring)
8. 10 (deployment) + full end-to-end smoke test
→ then the future plan: email + notifications + Google sign-in (D13/D17/D18)

## Key decisions

| ID   | Decision                                                                                                              | Rationale / source (verified 2026-09-26) |
|------|-----------------------------------------------------------------------------------------------------------------------|------------------------------------------|
| D1   | **One `Order` entity** with `kind: catalog \| custom`. No separate "process" entity. Inquiries (chat about a product) create an order. | Owner asked for simplicity w/o confusion. Matches Etsy: "custom order requests" convert to listings/orders (help.etsy.com/hc/en-us/articles/115015663107). Commission platforms (MakerQ, Eccolo) track a commission as one project with milestones + client portal (makerq.app, eccolo.app). |
| D2   | .NET 10 (LTS, supported until Nov 2028)                                                                                | learn.microsoft.com/dotnet/core/versions  |
| D3   | Aspire 13.x (latest 13.5.4) for **local dev orchestration only**; not part of the production image. Aspire 13 requires the .NET 10 SDK and is polyglot (JS first-class). | aspire.dev/whats-new/aspire-13, github.com/microsoft/aspire/releases |
| D4   | Next.js **16.x stable** (16.3.4 as of 2026-09-26; 16.4.0 still canary) + React 19, App Router                          | npmjs.com/package/next, nextjs.org/blog/next-16, nextjs.org/blog/next-16-3 |
| D5   | UI: Tailwind CSS v4 + shadcn/ui (official agent skill available)                                                        | github.com/shadcn-ui/ui/tree/main/skills/shadcn |
| D6   | PostgreSQL + EF Core (Npgsql) + migrations                                                                              | owner preference; standard pairing        |
| D7   | Realtime: SignalR (built into ASP.NET) — no extra service                                                                | chat + status updates; low-power target   |
| D8   | Files (product images, receipts, customer samples): local disk on a Docker volume, served by the API (auth where needed) | self-hosted, single machine; object storage = later plan |
| D9   | No Redis / queues / Elasticsearch in MVP. Services = postgres, api, web, caddy only                                     | low-power Raspberry Pi / old PC target    |
| D10  | MVP languages: en, ar, tr only (ar full RTL)                                                                             | owner requirement                         |
| D11  | Prices stored as amount + currency code; display USD only; regional pricing deferred to a future plan                   | owner: MVP first                          |
| D12  | Next.js agent guidance: version-matched docs bundled inside the `next` npm package; AGENTS.md + `nextjs` skill point at them | nextjs.org/docs/app/guides/ai-agents      |
| D13  | Email (**post release 1**) sent from a **Google account via SMTP** (owner decision 2026-09-26; no self-hosted mail): `smtp.gmail.com:587` STARTTLS, OAuth 2.0 (XOAUTH2) in production — basic auth is retired by Google and required-to-OAuth for Workspace; app password (2SV) only as a dev fallback. Volume is a few dozen/day, far under Gmail daily limits. | developers.google.com/workspace/gmail/imap/xoauth2-protocol, support.google.com/mail/answer/81126 |
| D16  | **Guest anti-abuse (with D14)**: easy start, bounded scale — rate limits per device (`guestId`) + IP, small caps on open guest orders (per device and per phone), unconfirmed guest orders auto-cancel (7 days), stale guest threads auto-close (30 days), honeypot on guest forms; real captcha (e.g. Cloudflare Turnstile) only if spam materializes. Registration at confirmation stays the final gate. | Owner concern 2026-09-26: prevent mass guest orders (DoS/DB spam) while keeping the start easy |
| D17  | **Google sign-in (OAuth 2.0/OIDC) = core feature, ships post release 1** (together with email/notifications) so release 1 proves the core loop first. On first sign-in, guest orders/threads with a matching email are merged into the account (user-confirmed). | Owner 2026-09-26: “very very important… maybe not for the first release” |
| D18  | **Notifications for all roles (customer, employee, admin) ship in the same release as email support**: in-app notification center (realtime via SignalR) + localized email; event catalog covers order lifecycle, chat, hiring, ratings. Release 1 keeps chat unread badges only. | Owner 2026-09-26 |
| D19  | **Smart search/filtering (plan 04)**: OData-compatible query layer via an **allowlist** — hand-rolled query-spec/param binder first (allowlisted fields, eq/gt/lt/contains, sort, paging); real OData endpoint only if needs outgrow it. Single low-power box, no EDM overhead, allowlist keeps OData's RBAC caveat manageable. | Owner 2026-09-26 + research (Microsoft OData docs; ODataQuery) |
| D20  | **Works list is a separate page** (`/works`): category filter + pagination-ready grid; home shows the limited "most loved" grid (category chips, Show more) + "See all works" → `/works`. Future: many categories. | Owner 2026-09-26 |
| D21  | **Chat is a destination page** (`/chat`): ChatGPT-style, **full width** (home stays a centered showcase). Products live **in the chat**: in-chat search picker AND a product rail (tap or drag-and-drop a work into the thread); picked works become product messages with in-place expandable details (`/chat?work=<id>` deep link). **No chat UI on the home page**; home closes with a "didn't find your liking? we can do custom" CTA → chat. How-it-works section and top nav menu removed. | Owner 2026-09-26 ("very important") |
| D22  | **Order page** (plans 05/06): orders rail (side list) + **full-width middle stage** where the customer toggles **chat ⇄ order stages** (status timeline, receipt, delivery) with no page change. Admin sees the same stage + the full trace (who did what, how long). Mobile: two views + toggle. | Owner 2026-09-26 |
| D23  | **Employee main page** (plan 06): ChatGPT-style workspace — conversation rail + ChatGPT thread + the order middle stage; thread UI identical to the customer's chat (one design, every role). | Owner 2026-09-26 |
| D24  | **Guest thread tokens (plan 06)**: stateless HMAC tokens (`base64url(payload).base64url(mac)`, payload `{threadId, guestId, exp}`, 2 h) for anonymous SignalR/REST access to visitor threads — no table, no Redis (D9); key via `Chat:TokenKey` (ephemeral per-process in dev). | Plan 06 implementation, 2026-09-28 |
| D25  | **Chat file serving (plan 06)**: short-lived HMAC read signatures in message DTOs (`/files/chat/{threadId}/{fileName}?sig&exp`, 1 h) — guests have no cookie, the signature is read-only and per-file. | Plan 06 implementation, 2026-09-28 |

## Risks / open questions

- Regional pricing algorithm (Steam-like up/down-scaling per region) — deferred; needs its
  own plan when it comes in (research: Steam's regional pricing + purchasing-power models).
- Single employee today: assignment logic must still support N employees (owner requirement).
- A dedicated Google account (custom domain via Google Workspace preferred; SPF/DKIM on
  the domain) to be chosen when the future email plan (D13) starts — not needed for
  release 1.
- No email in release 1 ⇒ no self-service password reset and no verification; admin
  handles resets and relies on the phone number collected at guest order time
  (owner-accepted trade-off).
