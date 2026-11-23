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

## A note on the RID detour

Two container runs chased the native lib by building with a `RuntimeIdentifier` — first
passing it to `dotnet test`, then only to `dotnet build`:

1. `dotnet test -p:RuntimeIdentifier=linux-x64` → `Could not find 'dotnet' host for the
   'X64' architecture` (vstest launches an architecture-specific testhost from the flag).
2. `dotnet build -p:RuntimeIdentifier=linux-x64` (with `AppendRuntimeIdentifierToOutputPath=false`,
   RID-less `dotnet test`) → still `Could not find 'dotnet' host for the 'X64' architecture`.
   A RID build emits RID-specific `testhost`/apphost artifacts, and even from a
   framework-dependent RID build the container cannot launch the X64 testhost. **Any RID in
   the build poisons `dotnet test` here** — the RID approach is abandoned.

## Fix (final)

Copy the bundled `libvips.so.42` into the test output **explicitly** and keep the build
RID-free:

`tests/Hanadicrochet.Api.Tests.csproj`:

```xml
<PackageReference Include="NetVips.Native.linux-x64" Version="8.18.7" GeneratePathProperty="true" />
<None Include="$(PkgNetVips_Native_linux-x64)/runtimes/linux-x64/native/libvips.so.42"
      Condition="'$([MSBuild]::IsOSPlatform(Linux))'"
      Link="libvips.so.42"
      CopyToOutputDirectory="PreserveNewest" />
```

`tests/Hanadicrochet.Api.Tests/Dockerfile` is back to a plain build + test (no RID):

```dockerfile
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj --nologo
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", "--no-build", "--nologo"]
```

- The `None` item (Linux only) copies the bundled `libvips.so.42` **flat** beside the
  test dll (NetVips resolves `libvips.so.42` from the app base dir — verified). Windows
  is untouched: it still gets libvips transitively from the API project's
  `NetVips.Native.win-x64`.
- The generated path property retains the hyphen: `$(PkgNetVips_Native_linux-x64)`.

## Decision

- **D1 — Bundle the binary, don't `apt-get install`.** The bundled `libvips.so.42` is
  self-contained (only glibc/libstdc++/libm per `readelf -d`), matches sub-plan 01, and
  avoids an OS-package install whose Debian package name varies across releases
  (`libvips42`/`libvips42t64`/`libvips`).
- **D2 — No `RuntimeIdentifier` in the Dockerfile build/test.** It reliably breaks
  `dotnet test` in the container (`Could not find 'dotnet' host for the 'X64' architecture`).

## Verification

- Forcing the `None` item on in a RID-free build → `libvips.so.42` lands flat in
  `bin/Debug/net10.0/` beside the test dll (0 warnings/errors).
- With the Linux condition active, a RID-free `dotnet build` is clean on Windows
  (item correctly excluded there).
- Not run here (no Docker on the dev machine): the full hermetic suite on the Pi.