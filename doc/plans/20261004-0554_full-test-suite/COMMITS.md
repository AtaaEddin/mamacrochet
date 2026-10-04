# COMMITS — 20261004-0554_full-test-suite

| Date | Hash | Subject | Note |
|------|------|---------|------|
| 2026-10-04 | c2faa5b | test(api): test harness — WebApplicationFactory<Program> on throwaway Postgres (plan 20261004-0554/01) | Sub-plan 01 done: xunit v2 + Mvc.Testing 10.0.12; real Program against hc_test_<8hex> (migrations+seed via the app itself); WithWebHostBuilder + colon-form UseSetting overrides (.NET 10: WithHostBuilder gone, UseSetting keys literal); no-op global limiter via PartitionedRateLimiter.Create + RateLimitPartition.GetNoLimiter (.NET 10 removed IRateLimiter/RateLimitResult); TestUsers (UserManager + CSRF-aware login/POST) + FileFixtures (tiny PNG/JPEG/GIF/WebP/PDF, 10 MB+1); HealthTests smoke 3/3 green; dotnet build 0 warnings. |
