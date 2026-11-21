# Commits — deploy-readiness fixes (2026-11-21)

| Date | Commit | Subject | Note |
|---|---|---|---|
| 2026-11-21 | 3de274a | build(deploy): patch vulnerable deps, LAN cookie opt-out, image probe (plan 20261121-1452) | Sub-plans 01–03 complete. ImageSharp → NetVips 3.2.0 (SkiaSharp rejected: AccessViolation on malformed JPEG bytes); SignalR.Client 10.0.15; Aspire 13.6.5 (+ one-time `aspire.cli` setup); `Auth:RequireHttps=false` opt-out; `/health` now reports `images`; new `deploy/preflight.sh`; `.gitattributes` LF. Verified: solution build 0 warnings, Release + `linux-musl-arm64` publish clean, 89 non-DB unit tests green, frontend typecheck/lint/63 tests green, preflight exercised on Windows. Not verified here: DB-backed API suite and the ARM64 image build (no Docker on the dev machine) — both run on the Pi. |
