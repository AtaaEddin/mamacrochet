# 01 — Backend test harness

status: done
parent: 20261004-0554_full-test-suite

## Scope

`tests/Hanadicrochet.Api.Tests` (xUnit v2 + `Microsoft.AspNetCore.Mvc.Testing`),
added to `Hanadicrochet.slnx`. One shared `ApiTestFixture` per test run; every
test class is in one xUnit collection ("Api") → serial, shared DB, shared host.

## Design (as implemented)

- **Real host**: `WebApplicationFactory<Program>` runs the real `Program`
  (identity, antiforgery, EF/Npgsql, SignalR registration, health, seeder).
  `src/Hanadicrochet.Api/Program.Marker.cs` adds the required
  `public partial class Program` marker.
- **Test database**: fixture creates `hc_test_<8-hex>` on the local Postgres
  (`127.0.0.1:5432`, `postgres/postgres` — the pins AppHost uses), empty;
  Program startup `Migrate()` applies migrations. Dropped in `DisposeAsync`
  (`DROP DATABASE ... WITH (FORCE)`, best-effort).
- **Config overrides** — `WithWebHostBuilder(builder => builder.UseSetting(...))`
  (`.NET 10: WithHostBuilder` is gone; `UseSetting` keys are literal, so
  colon-form section keys):
  - `ConnectionStrings:hanadicrochet` → test DB.
  - `Uploads:Root` → temp dir (fixture-created, deleted on dispose).
  - `AdminSeed:Email` / `AdminSeed:Password` → deterministic `seed-admin@…`
    (`SeedAdmin123!`) — the seeded admin is a known account.
  - `Chat:TokenKey` left unset → ephemeral in-process key (fine: tokens are
    minted and read inside the same host).
  - A hard assert after host start fails loudly if overrides are missing.
- **Rate limiter off**: after host start the fixture replaces
  `IOptions<RateLimiterOptions>.Value.GlobalLimiter` with
  `PartitionedRateLimiter.Create<HttpContext, string>(_ =>
  RateLimitPartition.GetNoLimiter("test"))`.
  (`.NET 10 API change: `IRateLimiter`/`RateLimitResult` are gone; the global
  limiter is now a `PartitionedRateLimiter<HttpContext>`. Per-IP HTTP 429
  behavior is not asserted — D16 guest caps are asserted at service level in
  sub-plan 02.)
- **Shared collection**: `[CollectionDefinition("Api")]` +
  `ApiCollectionDefinition : ICollectionFixture<ApiTestFixture>`; tests take
  `ApiTestFixture` in the constructor; no mutable shared state — each test
  creates its own users/orders/threads with unique GUIDs.

## Helpers (public surface)

- `CreateClient()` → cookie-bearing `HttpClient` (per-client cookie jar,
  auto-redirect).
- `Services` → the host `IServiceProvider`; `CreateScope()` → `IServiceScope`
  (fresh scope per test for `AppDbContext`/`UserManager<AppUser>`).
- `TestUsers` (static): `UniqueEmail/UniqueName`, `CreateAsync(fx, role)` via
  `UserManager<AppUser>` (customer/employee/admin flags), `LoginAsync`
  (fetches the principal-scoped CSRF token, then `POST /identity/login`),
  `GetCsrfTokenAsync`, `PostJsonAsync/PatchJsonAsync/DeleteAsync`
  (auto `X-CSRF-TOKEN`), `JsonOrNull`/`ApiErrorCode` response helpers.
- `FileFixtures` (static): real tiny 1×1 PNG/JPEG/GIF/WebP bytes
  (ImageSharp, matching the app's encoder), a minimal hand-written PDF,
  `TooBig` (10 MB+1) buffer, `PlainText`.
- `ApiFixture` smoke tests live in `HealthTests` (health envelope, antiforgery
  token shape, unknown-route 404).

## DoD (met)

- `dotnet build` (solution) → 0 warnings.
- `dotnet test` → green with smoke tests (health via TestServer, antiforgery,
  404).
- Packages: `Microsoft.AspNetCore.Mvc.Testing` 10.0.12 (framework match),
  `xunit` 2.9.3 + `xunit.runner.visualstudio` 2.8.2 (v2-series runner — 3.x
  runners are for xunit v3), `Microsoft.NET.Test.Sdk` 18.10.1.
