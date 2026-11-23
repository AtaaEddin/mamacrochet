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

`tests/Hanadicrochet.Api.Tests/Dockerfile` — build and run the suite for the RID:

```dockerfile
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj \
    -p:RuntimeIdentifier=linux-x64 -p:SelfContained=false
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", \
     "--no-build", "--nologo", "-p:RuntimeIdentifier=linux-x64", "-p:SelfContained=false"]
```

- `RuntimeIdentifier=linux-x64` — makes the RID-specific native asset get copied.
- `SelfContained=false` — keeps the build framework-dependent (the SDK image already
  carries the .NET runtime), avoiding a self-contained runtime pack pull.

## Decision

- **D1 — Keep `NetVips.Native.linux-x64` and build for the RID**, rather than
  `apt-get install libvips…`: the bundled binary matches sub-plan 01's decision, is
  self-contained, and avoids adding an OS-package install + apt-source step to the
  hermetic test image.

## Verification

- `dotnet build tests/Hanadicrochet.Api.Tests/*.csproj -r linux-x64 -p:SelfContained=false`
  → 0 warnings; `libvips.so.42` lands in `bin/Debug/net10.0/linux-x64/`.
- `dotnet test … --no-build -p:RuntimeIdentifier=linux-x64 -p:SelfContained=false --list-tests`
  → parses the flags and resolves the RID output path (457 tests discovered).
- Not run here (no Docker on the dev machine): the full hermetic suite on the Pi.