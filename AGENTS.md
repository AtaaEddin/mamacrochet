# AGENTS.md — mamacrochet

Read this first. Deep task-specific knowledge lives in `.agents/skills/` (loaded on
demand) and in the active plan under `doc/plans/`. Keep this file small.

## What this is

Self-hosted store + commission platform for handmade crochet products (bags & more).
Customers buy in-stock pieces or request custom ones (sample images welcome), chat with
the maker, and follow a live status board. Payment is agreed in chat and proven by an
uploaded receipt file. Team: admin(s) + employee(s) (makers).

## Stack (verified 2026-09-26 — re-verify online before upgrading anything)

- Backend: .NET 10 (LTS, to Nov 2028) · ASP.NET Core Web API · EF Core (Npgsql) · SignalR
- Dev orchestration: Aspire 13.x (dev only, never shipped)
- Frontend: Next.js 16.x stable (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · pnpm
- Data: PostgreSQL · files on local disk (volume) · email via Google SMTP (OAuth2)
- Deploy: Docker Compose on Raspberry Pi / old PC (low-power, single machine)

## Repo layout (planned until scaffolded)

```
Mamacrochet.sln            src/Mamacrochet.AppHost   (Aspire, dev only)
src/Mamacrochet.Api        (API + SignalR + EF Core)  frontend/  (Next.js 16, src/ dir)
.agents/skills/            (agent skills)             .pi/prompts/  (prompt templates)
doc/plans/                 (plans, one folder each)   doc/references/ (saved material)
deploy/ scripts/           (docker-compose, Caddy, deploy/backup)
```

## Domain (main points)

- **Roles**: Customer / Employee / Admin. Admin manages users + roles, sees all orders
  and the full trace (who worked on what, how long), assigns customers→employees, reviews
  hiring requests, and may override closing without a receipt (**mandatory reason note**).
- **One "Order" concept** (no separate "process"): `kind = catalog | custom`; custom
  orders carry the customer's spec + sample images. Inquiries create orders (no anonymous chat).
- **Order lifecycle**: `open → in_progress → ready_for_payment → paid → delivered → closed`
  (+ `cancelled` with reason). Every change writes a timeline event = the customer's
  live status board and the admin trace.
- **Products**: category, images, USD price, stock units, visibility. Out-of-stock stays
  visible → "ask / request custom" CTA. Stock-0 items are made to order.
- **Chat**: one thread per order (customer ↔ employee ↔ admin), realtime (SignalR),
  attachments. Also the place where payment & delivery are agreed.
- **Payment**: NO gateway. Employee sets `paid` **only after** uploading a receipt
  (pdf/image) + recording the paid amount. Admin override requires a written reason.
- **Delivery**: agreed in chat or offline; record method + actual date/time + description.
  Order closes when paid + delivered.
- **Hiring**: public form (phone, email, country, nationality, languages, previous work)
  → admin accept/decline → employee account.
- **Localization**: en (default), ar (full RTL), tr. Language from profile → Accept-Language.
- **Themes**: light + dark (system default + manual toggle).
- **Employees** are rated per finished order; admin views work history + speed per employee.
- **Mobile-first**: every screen must work well on a phone.

## MVP cuts (do NOT build now)

- Regional / multi-currency pricing (price = amount + currency code; display USD only).
- Payment gateways, public reviews, wishlists, coupons, analytics dashboards, native apps.

## Plan system (mandatory)

- Plans live in `doc/plans/<YYYYMMDD-HHMM>_<title-slug>/` (creation datetime + main-plan title).
- Folder = one plan: `main.md` + small `NN-topic.md` sub-plans + `COMMITS.md`.
- **No giant plans** — split by single responsibility; each sub-plan finishable in one session.
- Every plan file has a `status:` header: `proposed | in-progress | done | cancelled`.
- **Search the web before any non-trivial decision** (versions, libraries, architecture,
  UX flows); record the decision + source links in the plan file.
- Any git commit related to a plan → append a row to that folder's `COMMITS.md`
  (date, short hash, subject, note), then commit the update.
- Work follows the active plan. Missing scope ⇒ write a new plan first; never expand silently.

## Code rules

- .NET: warnings are **errors** (`Directory.Build.props`); nullable on; schema changes only
  via EF Core migrations; no new infrastructure service without a justifying plan.
- TypeScript: strict (`tsconfig.json`); no `any`; no assertions to silence errors; explicit
  types at public/component/API boundaries; lint with zero warnings.
- Next.js: server components by default, minimal `"use client"`. **Never guess APIs** —
  read the version-matched docs bundled in the `next` package (`frontend/node_modules/next/dist/docs/`).
- UI: shadcn/ui + semantic design tokens (no arbitrary hex values); must work in light+dark,
  in RTL (ar), be accessible (names, keyboard, focus, contrast), and be mobile-first.
  No decorative-only effects.
- Self-hosted (low-power target): no Redis/queues/Elasticsearch; small images; DB indexes
  over in-memory filtering; small Docker images; only the 4 production containers.
- Never commit secrets, env files, or uploaded user files. Dev config via Aspire; prod via `.env`.
- Do not: delete/rename plan folders, rewrite git history, add dependencies "because it's
  easy", or change behavior beyond the active plan.

## Definition of done

1. `dotnet build` → 0 warnings · `dotnet test` green
2. `pnpm typecheck` · `pnpm lint` · `pnpm test` green
3. UI changes verified in a browser: mobile + desktop, light + dark
4. Plan file updated (status/decisions) · `COMMITS.md` appended · clean commit(s)
