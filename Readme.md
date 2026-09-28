# hanadicrochet

Self-hosted store + commission platform for handmade crochet products (bags & more).
Even without an account, visitors can chat with the maker, buy in-stock pieces, or
request a **custom** one (sample images welcome) — an account is only needed to confirm
an order. Every order follows a live status board. Payment is agreed in chat and proven
by an uploaded receipt.

## Roles

- **Visitor** (no account) — browse, chat, start an order (name + phone); sign in at
  confirmation.
- **Customer** — browse the catalog, order (stock or custom), chat, track status, rate.
- **Employee** (maker) — manage products, work assigned orders, chat, record payment
  (receipt upload) and delivery.
- **Admin** — everything above + users/roles, full order trace, customer→employee
  assignment, hiring review, and overrides (always with a written note).

## Stack

- .NET 10 (LTS) · ASP.NET Core · EF Core (PostgreSQL) · SignalR · Aspire 13 (dev only)
- Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui · pnpm
- Docker Compose on Raspberry Pi / old PC — everything self-hosted on one machine

## Feel, languages & themes

Soft, feminine, cozy — light & dark · English (default), Arabic (RTL), Turkish ·
mobile-first.

## Development

- Prereqs: .NET 10 SDK, Node 22+, pnpm, Docker
- One command: `dotnet run --project src/Hanadicrochet.AppHost` → Aspire runs the
  whole dev stack: Postgres + API on :8085 + Next dev on :3000 (see the Aspire
  dashboard in the terminal output)
- Site at http://localhost:3000 (default locale `en`), API health at
  http://localhost:8085/health

## Deployment (production)

Self-hosted on one machine (Raspberry Pi / old PC) — 4 containers
(postgres, api, web, caddy), local-disk uploads, one script:

- `deploy/deploy.sh` — one-shot deploy (builds or loads images, starts, waits for health)
- `deploy/backup.sh` + `deploy/restore.md` — backups & restore
- details: [`deploy/README.md`](deploy/README.md) (config in `deploy/.env`, air-gapped Pi path)

## Docs

- [`AGENTS.md`](AGENTS.md) — project rules + domain summary (read this first)
- [`doc/plans/`](doc/plans/) — all plans: one folder per plan (main + sub-plans + commits log)
- [`doc/README.md`](doc/README.md) — how the plan system works
