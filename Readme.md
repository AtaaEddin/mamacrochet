# mamacrochet

Self-hosted store + commission platform for handmade crochet products (bags & more).
Customers buy in-stock pieces or request a **custom** one (sample images welcome),
follow the order's live status board, and chat with the maker. Payment is agreed in
chat and proven by an uploaded receipt.

## Roles

- **Customer** — browse the catalog, order (stock or custom), chat, track status, rate.
- **Employee** (maker) — manage products, work assigned orders, chat, record payment
  (receipt upload) and delivery.
- **Admin** — everything above + users/roles, full order trace, customer→employee
  assignment, hiring review, and overrides (always with a written note).

## Stack

- .NET 10 (LTS) · ASP.NET Core · EF Core (PostgreSQL) · SignalR · Aspire 13 (dev only)
- Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui · pnpm
- Docker Compose on Raspberry Pi / old PC — everything self-hosted on one machine

## Languages & themes

English (default), Arabic (RTL), Turkish · light & dark · mobile-first.

## Development (planned — see plans below)

- Prereqs: .NET 10 SDK, Node 22+, pnpm
- `dotnet run --project src/Mamacrochet.AppHost` → Aspire dashboard (Postgres + API + Web)
- `pnpm install && pnpm dev` in `frontend/`

## Docs

- [`AGENTS.md`](AGENTS.md) — project rules + domain summary (read this first)
- [`doc/plans/`](doc/plans/) — all plans: one folder per plan (main + sub-plans + commits log)
- [`doc/README.md`](doc/README.md) — how the plan system works
