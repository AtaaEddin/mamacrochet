# 03 — Backend files & admin (ProductImages, AdminSeeder, StaffCustomerEndpoints)

status: done

Coverage (2026-10-05, post-02 baseline):

| File | Before | Target |
|------|--------|--------|
| `Services/ProductImages.cs` | 56.6% (43/76) | **100%** (pure logic) |
| `Data/AdminSeeder.cs` | 47.5% (29/61) | ≥90% |
| `Endpoints/StaffCustomerEndpoints.cs` | 59.3% (16/27) | ≥90% |
| `Endpoints/FileEndpoints.cs` | ≥90% already | keep (covered by FileSignatures tests area) |

## ProductImagesTests (pure unit tests, no DB)

Generate real images with ImageSharp (already an API dependency) and drive
`ProductImages.ProcessAsync`:

- JPEG / PNG / WebP inputs (magic-byte gate + decode + re-encode).
- Large 2000×1500 → main downscaled to 1600×1200, thumb ≤480 (480×360).
- Small 100×50 → no resize, dimensions preserved.
- Wide 10001×8 → over `MaxSourceSide` → null.
- Empty stream → null; >10 MB (10 MB + 1 zero bytes) → null (size gate).
- GIF magic bytes → null; 2-byte truncated JPEG magic → null (short buffer).
- Valid JPEG magic + corrupted body → null (Identify throws).
- Outputs start with `RIFF`…`WEBP`; `Processed.MainName/ThumbName` patterns.

Unreachable-defensive caveat: `ImageInfo is null` / `Width <= 0` branches —
`IdentifyAsync` either returns a positive `ImageInfo` or throws; noted, not
forced.

## AdminSeederTests (real DB + UserManager via fixture)

- **Idempotent:** admins exist (fixture seed) → `SeedAsync` is a no-op
  (admin count unchanged), incl. blank options.
- **Explicit email + password:** unique e-mail → creates the admin with
  `IsAdmin`, `MustChangePassword`, `IsActive`, `NormalizedEmail`,
  `DisplayName = "Admin"`, `Language = "en"`; `CheckPasswordAsync` accepts
  the configured password. Self-cleanup (hard delete) in `finally`.
- **Blank options → DefaultEmail + generated password:** temporarily
  soft-delete the seeded admin (restore in `finally`; no other test depends
  on it), run `SeedAsync` with blank options → creates
  `AdminSeeder.DefaultEmail` admin; the generated password (read via the DB
  hash? no — via reflection on the private `GeneratePassword`) is 20 chars,
  ≥1 of each class, no look-alikes (l/1/0/O). `CheckPasswordAsync` can't
  verify the generated value externally, but `CreateAsync` success already
  proves the Identity policy passes. Cleanup: restore seeded admin, hard
  delete the DefaultEmail admin.
- **Identity failure:** unique… no — a *taken* e-mail (a plain customer with
  that e-mail exists, no admin gap) → `InvalidOperationException` mentioning
  the address.

The `DbUpdateException` race branch (two instances seeding concurrently)
cannot be forced deterministically — noted, not covered.

## StaffCustomerEndpointsTests (HTTP, fixture)

`GET /staff/customers` (staff customer search — "New conversation" picker):

- Employee sees created customers (2, by display name); staff accounts
  never listed (create an employee, search by its name → absent).
- Search by display name substring; by phone substring; `_` metachar is
  escaped (search `AnnB` does NOT match `Ann_B`); LIKE on e-mail too.
- Paging: `pageSize=1` → 1 item, `Pages == total`; `page/pageSize` clamps
  (0 / 999) still 200.
- Non-staff customer → 403 `{"code":"forbidden"}`.
- Anonymous → 401.

Also exercises `ChatService.SearchCustomersAsync` (LIKE-escape branch,
clamp branches) — lifts ChatService toward its 90% in sub-plan 04.

## Bug found by the tests (fixed in-plan, precedent 20261004-0554)

**Bug 3 — `ChatService.SearchCustomersAsync`: LIKE escape never applied.**
The term was escaped for Postgres LIKE (`\_`, `\%`, `\[`) but the
2-arg `EF.Functions.Like(value, pattern)` overload was used, which Npgsql
translates to `LIKE @p ESCAPE ''` — an *empty* escape character. With
`ESCAPE ''` the backslash is a literal, so **any search term containing
`_`, `%` or `[` matched nothing** (a customer named `Ann_B` is
unfindable by `Ann_B`; the "New conversation" picker is broken for such
names). Reproduced with a scratch test: endpoint-shaped 3-column OR query
returned `[]` while a single-column query with `ESCAPE '\'` matched.

Fix: pass the escape character explicitly on all three columns:
`EF.Functions.Like(value, pattern, likeEscape)` with `likeEscape` the
single backslash → Npgsql emits `LIKE @p ESCAPE '\'`.
One expression, no behavior change for any existing test (none covered
metachar terms), trivial ⇒ fixed in-plan per the precedent.
(`AdminUserEndpoints` uses the same LIKE pattern but strips the metachars
deliberately — checked, no fix needed.)

## Result

Status: done. New test files:

- `ProductImagesTests.cs` — 11 tests (pure unit, ImageSharp-generated
  inputs): JPEG/PNG/WebP accepted → `Processed` with RIFF…WEBP main+thumb;
  2000×1500 → 1600×1200 (long side 1600, thumb ≤480); 100×50 and 1×1
  unchanged; empty / >10 MB / unknown magic / 2-byte / valid-magic-corrupt
  → null; `MainName`/`ThumbName` patterns.
- `AdminSeederTests.cs` — 4 tests (fixture DB): idempotent no-op with an
  active admin; explicit email+password → admin with IsAdmin /
  MustChangePassword / IsActive / NormalizedEmail / DisplayName "Admin" /
  Language "en" + `CheckPasswordAsync` passes; blank options →
  DefaultEmail admin + `GeneratePassword` reflection-checked 50× (20 chars,
  all four classes, no l/1/0/O); taken email → actionable
  `InvalidOperationException` ("AdminSeeder", address, config hint).
  Every test self-cleans (hard-deletes created admins, restores soft-hidden
  fixture admins in `finally`).
- `StaffCustomerEndpointsTests.cs` — 4 tests (HTTP): employee sees
  customers and never staff; search by display name / phone / e-mail
  fragment; **`_`-escape** (search `Ann{h}B` does NOT match
  `Ann_{h}_B`; the literal `_` search DOES — regression-guard for Bug 3);
  paging (pageSize=1 → pages=3, page=3; clamps page=0→1, pageSize=999→50);
  customer → 403 `{"code":"forbidden"}`; anonymous → 401.

Source change: `ChatService.SearchCustomersAsync` (Bug 3 fix, 4 lines).

Verification: full suite green — 377 passed / 0 failed (the only failure
in an unfiltered run is the untracked, intentional
`PipelineDrillTempFail` drill, excluded per plan convention).

Coverage (post-03 run):

| File | Before | After |
|------|--------|-------|
| `Services/ProductImages.cs` | 56.6% | **100.0%** (152/152) |
| `Data/AdminSeeder.cs` | 47.5% | **90.2%** (110/122) |
| `Endpoints/StaffCustomerEndpoints.cs` | 59.3% | **100.0%** (54/54) |
| `Endpoints/FileEndpoints.cs` | ≥90% | 92.0% (92/100) — kept |
| Backend overall | 91.9% | **92.2%** |

All three targets met (ProductImages 100% per the pure-logic rule).
