# 01 — Dependency security patches

status: done

## Goal

`dotnet build Hanadicrochet.slnx` → 0 warnings again, without suppressing the audit
(`TreatWarningsAsErrors` and NuGet audit stay on — that is the point of the gate).

## Findings (2026-11-21, `dotnet list package --vulnerable`)

| Package | Was | Fixed | Advisory |
|---|---|---|---|
| `SixLabors.ImageSharp` | 3.1.12 | **removed** (see below) | GHSA-j3p4-wp97-rph4, GHSA-wmxv-xphr-5c9g, GHSA-jjfr-hcj7-qf5w, GHSA-j9gm-c75j-xc9q, GHSA-v76p-62qx-wwq2, GHSA-gwg2-r3hj-4w44 |
| `Microsoft.AspNetCore.SignalR.Client` → `SignalR.Common` | 10.0.12 (tests) | **10.0.15** | GHSA-334f-vvp4-7g6p (patched ≥ 10.0.13) |
| `Aspire.Hosting` / `Aspire.Hosting.AppHost` | 13.5.4 | **13.6.5** | GHSA-f7vh-h5g3-7jrh (`< 13.6.5`) |
| `MessagePack` (transitive, AppHost) | 2.5.302 | (cleared by the Aspire bump) | GHSA-qhrr-8q5h-9q3h |

## ImageSharp → NetVips (decision changed during the work)

The patched 3.x release (`3.2.0`) is the only one with the security fixes, and from
3.2.0 Six Labors enforces a **build-time licence key** for direct references
(<https://docs.sixlabors.com/articles/imagesharp>). Without a key a **Release** build
fails, i.e. `docker compose build api` fails. Owner decision: drop the dependency.

Tried and rejected: **SkiaSharp 4.157.0 / 4.156.2**. Creating a codec from arbitrary
malformed bytes (a 64-byte `FF D8 FF E0` blob) **segfaults the process**
(`0xC0000005` in `sk_codec_new_from_stream` / `sk_codec_new_from_data`), on every entry
point (`Stream`, `SKData`, `SKBitmap.Decode(bytes)`) and on both versions. An
untrusted upload path must not be able to kill the API.

Adopted: **NetVips 3.2.0 over libvips** (LGPL, the engine behind sharp/imgproxy).
Malformed/truncated input throws `VipsException`, which the pipeline maps to `null`.

- `ProductImages.cs`: header-only `NewFromBuffer` → `ThumbnailImage(…, Size.Down)` →
  `WebpsaveBuffer(q)`. `failOn: Warning` so a truncated JPEG is rejected instead of
  silently stored with grey bands.
- Windows dev/tests: `NetVips.Native.win-x64` (conditional on `OS == Windows_NT`, so the
  Linux image build doesn't carry it).
- Linux test container: `NetVips.Native.linux-x64` in the test project.
- Production image: `RUN apk add --no-cache vips` in the runtime stage (Alpine's
  package links libwebp/libjpeg/libpng — verified in its package metadata).
- EXIF orientation is now honoured while thumbnailing (libvips default); previously
  photos were stored unrotated.
- Tests generate fixtures with libvips instead of ImageSharp; the GIF fixture is a
  literal 43-byte GIF (libvips can read but not write GIF, and the API rejects GIF).

## Aspire 13.6.5 CLI bundle

13.6+ builds the AppHost against the Aspire CLI bundle: a machine without it fails with
`ASPIRE009`. One-time setup, documented in `Readme.md`:

```bash
dotnet dnx --yes aspire.cli@13.6.5 -- setup
```

(`AspireUseCliBundle=false` builds but warns `ASPIRE010`, which breaks the 0-warning rule.)

## Verification

- `dotnet build Hanadicrochet.slnx` → **0 warnings, 0 errors**.
- `dotnet publish src/Hanadicrochet.Api -c Release -p:UseAppHost=false` → clean (this is
  the Dockerfile's publish command; it is where the licence error used to appear).
- Filtered unit suite (no database needed: ProductImages, AuthCookiePolicy,
  FileSignatures, Helpers, QuerySpecMisc) → **84 passed**.
- Not run here: the full API suite (needs PostgreSQL/Docker; this machine cannot run
  Docker) and `dotnet list package --vulnerable` (its restore is what used to fail).
