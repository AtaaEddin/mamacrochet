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
RID-free.

The copy lives in a **build Target**, not a `<None Include="…">` item:

`tests/Hanadicrochet.Api.Tests.csproj`:

```xml
<PackageReference Include="NetVips.Native.linux-x64" Version="8.18.7" GeneratePathProperty="true" />

<Target Name="CopyBundledLibVips"
        AfterTargets="Build"
        Condition="'$([MSBuild]::IsOSPlatform(Linux))' and Exists('$(PkgNetVips_Native_linux-x64)/runtimes/linux-x64/native/libvips.so.42')">
  <Copy SourceFiles="$(PkgNetVips_Native_linux-x64)/runtimes/linux-x64/native/libvips.so.42"
        DestinationFolder="$(OutDir)"
        SkipUnchangedFiles="true" />
</Target>
```

## Why a Target, not a `None` item

The `GeneratePathProperty` value (`$(PkgNetVips_Native_linux-x64)`) is written to
`obj/*.nuget.g.props` **by restore**, and that props file is imported only on a *later*
evaluation pass of the project. An `Include="$(…)"` on an item is expanded at the very
*first* evaluation, before restore's output is available, so on the container's single
`dotnet build` the item silently captured an **empty** path. MSBuild never re-expands an
item's `Include`` once captured, so nothing was copied → the test run died with
`DllNotFound libvips.so.42` even though the bundled binary was present. (Locally the
probe-verification looked green because the evaluation where the property *was* populated
won the race on that machine.) A `Target` guarded `AfterTargets="Build"` reads the property
at **execution time** — restore has definitely completed — so it always sees the real path.
Verified deterministically: a clean, single, RID-free `dotnet build` running edit 20261121-1452/04
lands `libvips.so.42` flat beside the test dll in `bin/Debug/net10.0/`.

`tests/Hanadicrochet.Api.Tests/Dockerfile` is back to a plain build + test (no RID):

```dockerfile
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj --nologo
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", "--no-build", "--nologo"]
```

- The Target (Linux only) copies the bundled `libvips.so.42` **flat** beside the
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

- The `CopyBundledLibVips` Target, forced on in a clean single RID-free build,
  deterministically lands `libvips.so.42` flat in `bin/Debug/net10.0/` beside the
  test dll (0 warnings/errors) — the property is read at execution time, after
  restore, so it is never empty.
- With the Linux condition active, the real RID-free `dotnet build` is clean on
  Windows (Target correctly excluded there; 0 warnings, 0 errors).
- Not run here (no Docker on the dev machine): the full hermetic suite must be
  **re-run on the target after `docker compose -f deploy/docker-compose.test.yml build`**
  (rebuild the test image so a stale layer from the previous `<None>` iteration is
  not reused).