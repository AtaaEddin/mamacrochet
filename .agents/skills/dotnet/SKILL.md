---
name: dotnet
description: .NET 10 / ASP.NET Core conventions for the Hanadicrochet.Api backend. Use when writing C# code, EF Core models/migrations, SignalR hubs, API endpoints, or upload handling in src/.
---

# .NET 10 (hanadicrochet backend)

## Layout

- `src/Hanadicrochet.Api` — Web API + SignalR + EF Core (Npgsql). The single deployable.
- `src/Hanadicrochet.AppHost` — Aspire 13, **dev only**; never referenced by Api.

## Non-negotiables

- Warnings are errors (`Directory.Build.props`): fix the root cause. No `#pragma
  warning disable` or suppression attributes without a note in the plan file.
- Nullable enabled; no `!` non-null assertions to silence the compiler.
- Schema changes **only** via EF Core migrations (`dotnet ef`); no manual DB edits,
  no `EnsureCreated` in production.

## Conventions

- Thin controllers; domain rules live in services: the order state machine,
  receipt-gated payment, guest caps/rate limits (D16), timeline event writes.
- Order state machine: every transition guarded in one place; invalid transition ⇒
  409 with a clear message; timeline event written in the same DB transaction.
- Auth: ASP.NET Identity (cookies). Role policies Customer/Employee/Admin. Guest
  endpoints take a `guestId`, enforce rate limits + caps, and never trust client
  contact data beyond validation.
- Uploads: validate type/size **before** processing; ImageSharp for resize/webp/avif +
  thumbnails; deterministic storage paths on the uploads volume.
- SignalR: cookie auth for order threads; short-lived thread token for guest threads;
  re-verify the participant server-side on every hub event (never trust the client).
- Email: **none in release 1** (future plan D13: `IEmailSender` + outbox table only).
- Low-power target: no busy workers — lazy or daily sweeps (e.g., guest order
  auto-cancel); DB indexes for all list filters (status, employee, customer, date);
  never in-memory-filter unbounded sets.

## Commands

- build: `dotnet build` (must be 0 warnings) · test: `dotnet test`
- migrations: `dotnet ef migrations add <Name>` · `dotnet ef database update`
