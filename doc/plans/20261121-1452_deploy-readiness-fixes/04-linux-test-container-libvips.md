# 04 — Linux API-test container: load libvips

status: done
created: 2026-11-23 17:45

## Problem

First deploy run on the Pi: the API test stack (`deploy/docker-compose.test.yml`
→ `tests/Hanadicrochet.Api.Tests/Dockerfile`) failed with **60 failed / 507**:

```
System.TypeInitializationException … FileFixtures … System.DllNotFoundException :
Unable to load shared library 'libvips.so.42' or one of its dependencies …
```

Every failing test goes through `FileFixtures` (which generates PNG/JPEG/WebP bytes
with NetVips → images/bodies). The failure is *not* in `ProductImages` or the payload
store — it is the test container's runtime missing the native `libvips.so.42`.

## Root cause

`tests/Hanadicrochet.Api.Tests.csproj` intentionally references
`NetVips.Native.linux-x64` (sub-plan 01, D5), whose payload lives at
`runtimes/linux-x64/native/libvips.so.42`. But the test Dockerfile built with:

```dockerfile
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj
```

A RID-specific native asset under `runtimes/<rid>/native/` is only copied into the
build output when the project is built **with a `RuntimeIdentifier`**. Without one,
`dotnet build` omits the whole `runtimes/` folder, so `libvips.so.42` never reaches
`bin/…/libvips.so.42` and NetVips cannot load it. (Locally on Windows it worked
because `NetVips.Native.win-x64` ships the win `libvips` and was being copied.)

The bundled `libvips.so.42` is otherwise self-contained: `readelf -d` lists only
glibc/libstdc++/libm/libpthread/libdl/libgcc_s/ld-linux — all present in the Debian
SDK image, so no `apt-get install` is required.

## Fix

`tests/Hanadicrochet.Api.Tests/Dockerfile` — build for the RID, but write to the plain
output path and run **without** a RID:

```dockerfile
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj \
    -p:RuntimeIdentifier=linux-x64 -p:SelfContained=false \
    -p:AppendRuntimeIdentifierToOutputPath=false
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", \
     "--no-build", "--nologo"]
```

- `RuntimeIdentifier=linux-x64` (build) — makes the RID-specific native asset get copied.
- `SelfContained=false` — keeps the build framework-dependent (the SDK image already
  carries the .NET runtime), avoiding a self-contained runtime pack pull.
- `AppendRuntimeIdentifierToOutputPath=false` — puts the output in the plain
  `bin/Debug/net10.0/` (with `libvips.so.42` beside the test dll) instead of an
  `…/linux-x64/` subfolder.
- `dotnet test` gets **no** `RuntimeIdentifier`. First attempt passed it to `dotnet test`
  and the container died with `Could not find 'dotnet' host for the 'X64' architecture`
  (vstest launches an architecture-specific testhost from `/p:RuntimeIdentifier`). When
  the RID lives only in `dotnet build`, the test host simply runs the prebuilt dlls in
  the default path where `libvips.so.42` already sits.

## Decision

- **D1 — Keep `NetVips.Native.linux-x64` and build for the RID**, rather than
  `apt-get install libvips…`: the bundled binary matches sub-plan 01's decision, is
  self-contained, and avoids adding an OS-package install + apt-source step (whose
  Debian package name varies — `libvips42`/`libvips42t64`/`libvips`) to the hermetic
  test image.

## Verification

- `dotnet build tests/Hanadicrochet.Api.Tests/*.csproj -r linux-x64 -p:SelfContained=false -p:AppendRuntimeIdentifierToOutputPath=false`
  → 0 warnings; `libvips.so.42` lands in the plain `bin/Debug/net10.0/`. output dir.
- `dotnet test … --no-build --list-tests` (no RID) → resolves that output and discovers
the tests.
- Not run here (no Docker on the dev machine): the full hermetic suite on the Pi.