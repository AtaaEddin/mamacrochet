# Deploy-readiness fixes (Raspberry Pi)

status: done
created: 2026-11-21 14:52

## Why

A readiness audit for the target Raspberry Pi found three code-level blockers/gaps.
The deployment scaffolding itself (plan 10, plan 20261004-1823) is complete; these are
defects, not new features.

| # | Problem | Impact on the Pi |
|---|---|---|
| 1 | `dotnet build` fails: 16 × `NU1902/NU1903` (audit warnings are errors) | `docker compose build api` and the pipeline's test image both fail → no deploy |
| 2 | Prod auth cookie is `SecurePolicy.Always` | Plain-HTTP LAN install (`CADDY_SITE=http://<ip>`) cannot store the cookie → sign-in silently fails on any device except `localhost` |
| 3 | No `.gitattributes`; pipeline pre-pulls the wrong SDK tag | A non-git copy (scp/zip/remote desktop) gets CRLF scripts (`bad interpreter: bash^M`); the Pi re-pulls a ~1 GB SDK image the Dockerfile doesn't use |

## Sub-plans

- [01 — dependency security patches](01-dependency-security-patches.md) — restore/build green again.
- [02 — plain-HTTP LAN auth cookie](02-http-lan-auth-cookie.md) — make hosting without TLS work per install.
- [03 — deploy script hardening](03-deploy-script-hardening.md) — LF guard + base-tag alignment.
- [04 — Linux API-test container: load libvips](04-linux-test-container-libvips.md) — build the test suite for `linux-x64` so the bundled libvips is copied.

## Decisions

- **D1 — Pin to the advisory "patched" versions, not the newest majors.** ImageSharp stays
  on the 3.x line (`3.2.0`); jumping to 4.x is an API-breaking migration with no benefit here.
  Source: <https://github.com/advisories/GHSA-j3p4-wp97-rph4> (affected `< 3.2.0`, patched `3.2.0`).
- **D2 — Touch only the packages the audit flags.** EF Core / Npgsql stay at their current
  versions: the Npgsql provider pins its EF Core dependency, so a blanket "latest patch"
  sweep risks `NU1605` downgrades for no security gain.
- **D3 — HTTPS stays the default.** The cookie fix is an opt-out for plain-HTTP installs
  (`Auth:RequireHttps=false`), not a global downgrade: `Secure` is still set whenever the
  request is https, including behind Caddy (forwarded headers are already wired for the
  compose bridge range, `Program.cs`).
- **D4 — Resolve the cookie policy through a small testable helper** so the three cases
  (dev, prod default, prod opt-out) are unit-tested instead of living in an untestable
  top-level statement.
- **D5 — Replace ImageSharp with NetVips/libvips.** ImageSharp 3.2.0 (the only patched
  3.x release) requires a build-time licence key, so Release/Docker builds fail without
  one. SkiaSharp was tried first and rejected: it segfaults on malformed input. libvips
  fails cleanly and is the engine behind sharp/imgproxy. Costs: the runtime image
  installs `vips` (~40 MB with deps), and EXIF orientation is now applied.
- **D6 — Upgrading Aspire to 13.6.5 adds a one-time per-machine prerequisite**:
  `dotnet dnx --yes aspire.cli@13.6.5 -- setup` (see `Readme.md`). Dev-only.

## Outcome

Code complete: build 0 warnings, Release publish clean, 84 non-database tests green.
Left to the owner (needs a Pi and Docker): the ARM64 image build (`apk add vips` is the
new runtime dependency) and the plan 10 ARM64 smoke test.
