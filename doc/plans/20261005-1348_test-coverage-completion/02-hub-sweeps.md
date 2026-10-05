# 02 — Hub + sweep service tests

status: done

Real SignalR client round-trips over the TestServer + sweep `RunOnceAsync`
via reflection (private by design; the hosted-service loop is 24 h).

## ChatHubTests (real `HubConnection`, TestServer)

- guest: bootstrap `/chat/visitor` → connect with `?access_token=` →
  JoinThread → SendMessage → an assigned employee (claim first, cookie
  client) receives the `newMessage` broadcast; DB row persisted with
  guest sender; `clientId` echoed, not persisted.
- cookie customer: own thread; unrelated customer JoinThread →
  HubException("forbidden"); employee join before claim → forbidden;
  after claim → customer sends → employee receives (role "customer").
- guest token presented for a NON-visitor thread → forbidden.
- hub validation error → HubException (empty body).
- MarkRead (cookie) persists a read marker; guest MarkRead is a no-op.

## SweepServiceTests

- `ChatSweepService.RunOnceAsync` (reflection): stale (40 d) visitor
  thread closed with `auto_inactivity`; fresh visitor + stale ORDER
  thread untouched; 30 h orphan attachment row + file deleted; 1 h orphan
  untouched.
- `OrderSweepService.RunOnceAsync`: stale (10 d) guest order (open /
  in_progress) → cancelled + timeline `auto` event; stale CUSTOMER order
  and fresh guest order untouched.

## Result

Done 2026-10-05. 10 new tests, all green; full suite 348 → **358 passed**,
no regressions. Coverage (coverlet, full suite):

- `Hubs/ChatHub.cs` → **100%** (50/50 lines; was 2%).
- `ChatSweepService` 25% → 60%, `OrderSweepService` 27% → 57% — remaining
  uncovered lines are the `BackgroundService.ExecuteAsync` loop (20 s start
  delay + 24 h interval); `RunOnceAsync` logic is fully exercised.
- Backend overall 79.4% → **91.9%** (19163/20857 lines, file-aggregated).

Implementation notes (see main.md Decisions for the full recipe):

- SSE transport (not WebSockets) over the in-memory TestServer; the .NET 10
  client's third HTTP flow — a streaming send POST — breaks any wrapper that
  buffers content or forwards through an existing `HttpClient` (request
  objects may not be re-sent). Final design: `TestServerHandler` (a
  `DelegatingHandler` over `Factory.Server.CreateHandler()`) sharing one
  `CookieContainer` with a REST client used for login; guest sessions use
  `?access_token=` — the exact frontend patterns.
- `SweepServiceTests` build the services with the root `IServiceScopeFactory`
  (they open their own scope) and invoke private `RunOnceAsync(CancellationToken)`
  via reflection with `CancellationToken.None`.

New files: `ChatHubTests.cs` (6), `SweepServiceTests.cs` (4).
New test dependency: `Microsoft.AspNetCore.SignalR.Client` 10.0.12 (test
csproj only).
No app-behavior changes; no bugs found by these tests.
