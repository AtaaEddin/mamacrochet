# 04 — Backend remainder to ≥90% per file

status: in-progress

Baseline (post-03 cobertura, 2026-10-05). Uncovered = executable lines,
from the run (per-method class blocks deduped):

| File | % | Uncovered lines |
|------|----|-----------------|
| `Endpoints/OrderEndpoints.cs` | 84.6% | 133 |
| `Services/ChatService.cs` | 80.8% | 179 |
| `Services/ProductAdministrationService.cs` | 66.3% | 124 |
| `Services/HiringService.cs` | 81.4% | 52 |
| `Endpoints/IdentityEndpoints.cs` | 86.6% | 40 |
| `Endpoints/ChatEndpoints.cs` | 87.6% | 40 |
| `Endpoints/StaffProductEndpoints.cs` | 85.3% | 34 |
| `Services/UserAdministrationService.cs` | 79.6% | 28 |
| `Program.cs` | 58.6% | 180 |
| `Services/ProductQueryBinders.cs` | 31.8% | 30 |
| `Services/OrderQueryBinders.cs` | 48.5% | 17 |
| `Services/ProductListing.cs` | 69.1% | 17 |
| `Services/OrderListing.cs` | 60.5% | 17 |
| `Endpoints/Helpers.cs` | 85.1% | 13 |
| `Data/Catalog.cs` | 89.7% | 4 |
| `Services/ChatTokenService.cs` | 95.4% | 5 |
| `Data/AdminAuditLog.cs` | 83.3% | 1 |
| `Services/ChatSweepService.cs` | 60.0% | 16 (loop) |
| `Services/OrderSweepService.cs` | 60.5% | 16 (loop) |

Everything else in `src/Hanadicrochet.Api` is already ≥90% except the
permanent exceptions (Migrations, design-time factory + ConfigurationLoader,
`obj/**` generated source — the gate in 07 must exclude generated source).

**Decision — sweep `ExecuteAsync` loops:** the 20 s startup delay + 24 h
interval make the loops unreachable in a sane test window (same decision as
sub-plan 02). Not an exception-list item on their own: after Batch B
(construction + catch-path coverage) each file sits at ~90–93% with only
the loop body uncovered, which meets the ≥90% rule.

**Decision — `Program.cs`:** not an exception. The uncovered surface is
reachable: OpenAPI document transformers (request the spec), rate-limit
rejection (hammer a limited endpoint), `/alive` predicate, the
`ApiExceptionHandler` class (unit test), and the whole non-Development
branch (a second factory with `EnvironmentName=Production`).

## Batch A — binders, listings, small statics (pure/fixture tests)

- `ProductListingTests.cs` — drive `ProductListing.ListAsync` directly with
  the fixture `AppDbContext` + `QueryHelpers.ParseQuery` synthetic
  IQueryCollection: `$top`/`$skip` paging, malformed `$filter`/`$orderby`
  → `ApiError("invalid")`, unknown field → 400, `publicOnly` hides
  unlisted, title search via `Public()` binder.
- `OrderListingTests.cs` — same shape for `OrderListing.ListAsync`
  (role-scoped query, `Customer()`/`Staff()`/`Admin()` binders, contact
  name + admin customer-text ILIKE).
- `ProductQueryBinders`/`OrderQueryBinders` — the factory methods and
  field allowlists get covered by the listings' binders above plus
  endpoint-level `$filter`/`$orderby`/`$search` requests:
  - public catalog: `?category=eq '...'`, `inStock=eq true`,
    `$search` title ILIKE, `$orderby createdAt asc/desc`,
    forbidden field (e.g. `price`) → 400.
  - staff products: `isListed`, `price`, `stockUnits` filters.
  - customer orders: `status` filter only; staff orders: `contactName`
    text; admin orders: `customerId`/`employeeId`/`customer` text
    (contact OR linked-account display name).
- `HelpersTests.cs` — `FileSignature.Info` for every `FileKind` +
  invalid kind → `ArgumentOutOfRangeException`; `AvatarImages.
  IsValidFileName/ContentType` (valid/invalid names, each extension);
  `HiringFiles` (MaxFiles/MaxBytes constants, `IsValidStoredName`,
  `ContentType` per extension).
- `Catalog`/`AdminAuditLog` model lines — cover the remaining navigation
  property setters/initializers by materializing them (Include on the
  inverse navigation in a listings test, or explicit entity construction
  in the admin audit batch) — 4 + 1 lines.

## Batch B — sweeps, tokens, Program.cs

- `SweepServiceConstructionTests` — resolve `ChatSweepService` /
  `OrderSweepService` from the fixture root provider (ctor lines), and
  drive the `RunOnceAsync` catch path with a scope factory whose
  `GetRequiredService` throws (error-log branch). Remainder = loop only.
- `ChatTokenService` expired/malformed token paths (5 lines): craft
  tokens through the service's own issuer (expired `exp`) + a
  corrupt-payload token → `TryValidate` returns null.
- `ProgramTests.cs` (HTTP, fixture):
  - `GET /openapi/v1.json` (dev only — assert 200 + `ApiError` component
    present) → all three operation transformers (~135 lines).
  - `GET /alive` → liveness predicate line.
  - rate limit: hammer the limited guest endpoint past its window →
    429 `{"code":"rate_limited"}` (OnRejected callback).
  - `ApiExceptionHandler` unit test: unstarted response → 500
    `server_error` JSON + `true`; started response → `false`.
  - Production factory: `WithWebHostBuilder`-style second
    `WebApplicationFactory` with `ASPNETCORE_ENVIRONMENT=Production`
    (plus required config: connection string, CORS origins set → covers
    the `corsOrigins.Length > 0` branch): assert the host starts
    (covers `AddExceptionHandler`/`AddProblemDetails`/
    `UseExceptionHandler`/`UseForwardedHeaders` registration lines) and
    that an X-Forwarded-For request behaves as proxied.

## Batch C — HiringService + its endpoint error paths

Gap map (cov04c, 52 lines, all defensive guards):

| Lines | Region | Scenario to add |
|-------|--------|-----------------|
| 79-80 | `cleanLanguages.Count == 0` | submit 6 one-letter languages (passes count ≤ 6, all trimmed to < 2) |
| 84-86 | `files.Count > MaxFiles` | submit MaxFiles+1 valid small files |
| 94-95 | empty bytes | submit one 0-byte file |
| 100-102 | `unsupported_file_type` | submit a plain-text file |
| 116-124, 152-155 | re-apply path + old-file delete loop | submit twice with the same e-mail, both with a file |
| 192-193, 281-282 | unknown id (accept/decline) | admin decide on a valid-format nonexistent id |
| 212-213 | accept validation | accept with a bad e-mail shape |
| 243-244 | `!created.Succeeded` | unit test: `UserManager` with a stub `IUserStore` whose `CreateAsync` fails (endpoint path is pre-guarded by `email_taken`) |
| 293-294 | note > 1000 | decline with a 1001-char note |
| 331-332, 343-344 | `LoadAsync`/`IsApplicationId` | decide on a short / non-hex id |
| 370-388 | `DeleteStored` | covered by the re-apply delete (371-373 invalid-name arm needs a DB-poked `StoredName`; the 383-384 `IOException` arm stays if unreachable) |

## Batch D — product administration (largest service)

- `ProductAdministrationService` remaining 124 lines: image
  attach/detach (the `ProductImages.ProcessAsync` integration, 10-image
  cap, bad-file rejection), create/update/soft-delete/restore, price/
  stock/visibility transitions, category CRUD + delete-guard, and the
  `StaffProductEndpoints` remaining 34 lines (error paths: bad id
  format, not found, conflict) — endpoint tests through the staff
  product API.

## Batch E — orders, users, identity endpoints

- `OrderEndpoints` remaining 133 lines: the uncovered regions are the
  per-endpoint error branches (not found, forbidden, conflict,
  validation) across create/detail/transition/payment/delivery for
  customer/staff/admin — extend existing order endpoint tests, plus
  `UserAdministrationService` 28 lines (admin user management:
  disable/enable, role change, password reset, audit writes) and
  `IdentityEndpoints` 40 lines (login/logout/register/profile/
  password-change error paths).

## Batch F — ChatService + ChatEndpoints

- `ChatService` remaining 179 lines + `ChatEndpoints` 40 lines:
  guest lifecycle (thread create/expire/reset), attachment flows
  (upload caps, orphan purge paths), message paging edges, read marks,
  thread close/claim/assign, the rate-limit counters (guest
  messages/min, resets/day) — mostly by extending the existing chat
  endpoint tests with the missing scenarios.

## Order of work & verification

Batches in order A→F (cheapest first; each batch ends with a green
full suite). After each batch: re-run coverage, update the table above.
When every file is ≥90% (or a remaining miss is documented in
main.md Exceptions with justification), this sub-plan is done: full
suite green, per-file table updated, main.md row → done.

## Result — Batch A + B (2026-10-05, cobertura /tmp/cov04c, 429 tests green)

| File | Before | After |
|------|--------|-------|
| `Program.cs` | 58.6% | **99.5%** (433/435) |
| `Services/ChatTokenService.cs` | 95.4% | **100%** |
| `Services/OrderListing.cs` | 60.5% | **100%** |
| `Services/OrderQueryBinders.cs` | 48.5% | **100%** |
| `Services/ProductListing.cs` | 69.1% | **100%** |
| `Services/ProductQueryBinders.cs` | 31.8% | **100%** |
| `Data/Catalog.cs` | 89.7% | **100%** |
| `Data/AdminAuditLog.cs` | 83.3% | **100%** |
| `Endpoints/Helpers.cs` | 85.1% | **92.0%** (80/87) |
| `Services/ChatSweepService.cs` | 60.0% | **95.0%** (loop only) |
| `Services/OrderSweepService.cs` | 60.5% | **94.6%** (loop only) |

- `Helpers.cs` remainder: line 142 = `FlagFor` default arm (unreachable dead arm),
  188-199 = `HiringFiles`/`AvatarImages` edge members not exercised (see batch
  C–F endpoint work; below threshold impact).
- `Program.cs` remaining uncovered = lines 544-545 only: the
  `ApiExceptionHandler.TryHandleAsync` `return false` guard. **Decision:**
  under .NET 10 `HttpResponse.HasStarted` is read-only and no longer driven by
  writes to the body (`IHttpResponseFeature.Body` is obsolete,
  `IHttpResponseBodyFeature.Stream` is get-only, `StartAsync` does not flip
  it) — the guard is only reachable from a real server that has begun
  sending. Documented residual (2 lines), not an exception-list file.
- Test recipes recorded (ProgramTests.cs):
  - Production factory: `builder.UseSetting("environment", "Production")`
    — `WebHostDefaults.EnvironmentKey` is `"environment"`, NOT
    `ASPNETCORE_ENVIRONMENT` (the env var name is not a config key; the
    first attempt silently ran the dev pipeline).
  - Self-proof of non-dev pipeline: CORS preflight for an origin that only
    the config list allows (not in the dev localhost fallback).
  - `WriteAsJsonAsync` serializes with web defaults (camelCase
    `"code"`): assert with `PropertyNameCaseInsensitive`.
- ChatTokenService: the 8 defensive unit tests (bad/short key, uncodeable
  base64url, wrong MAC, empty ids, missing/expired file sig) reached 100%.
- Sweep services: ctor + catch-path coverage; `ExecuteAsync` loop body
  remains (documented decision above) → 95.0% / 94.6%.

## Result — Batch C (2026-10-05, cobertura /tmp/cov04d, 441 tests green)

| File | Before | After |
|------|--------|-------|
| `Services/HiringService.cs` | 81.4% | **98.9%** (276/279) |

Remaining uncovered = lines 383-384, 386: the `catch (IOException)` block
in `DeleteStored` (defensive — `File.Delete` throwing requires a
simultaneously-locked file; not reliably triggerable on Linux).
Documented residual (3 lines).

**Bug found + fixed in-plan (precedent 20261004-0554):**
`HiringEndpoints` accept/decline checked
`result.Error.Code == "hiring_not_found"`, but the service produces
`ApiError.NotFound("hiring_not_found")` — code `"not_found"`,
message `"hiring_not_found"` (the app-wide convention: category code +
domain message). The 404 branch was dead: unknown ids on
`POST /admin/hiring/{id}/accept|decline` returned **400** instead of
**404**. Fixed both endpoint checks to `"not_found"` (matching the
convention used by the user/order/staff-product endpoints). No existing
test pinned the old 400 behavior.

Tests added:
- `HiringEndpointsTests` (+10): 6 one-letter languages →
  `invalid_language`; 4 files → `too_many_files`; plain-text file →
  `unsupported_file_type`; re-apply same e-mail (row count 1, new file,
  old file deleted from disk); re-apply with DB-poked invalid
  `StoredName` (disk delete skipped, metadata replaced); accept/decline
  unknown well-formed id → 404 `not_found`; accept bad e-mail → 400;
  decline 1001-char note → 400; non-hex id on both decide routes → 404.
- `HiringServiceTests.cs` (new, 2 tests + stubs): `AcceptAsync` with a
  `UserManager<AppUser>` built on a stub store whose `CreateAsync`
  returns `IdentityResult.Failed(…)` → error mapped, no user row
  (endpoint path pre-guarded by `email_taken`); `SubmitAsync` with a
  0-byte `UploadFile` → `invalid` (the endpoint binder skips 0-byte
  parts, so the service guard is unit-tested).

.NET 10 identity test notes (probed, verified):
- `UserManager<T>` ctor is now
  `(IUserStore<T>, IOptions<IdentityOptions>, IPasswordHasher<T>,
  IEnumerable<IUserValidator<T>>, IEnumerable<IPasswordValidator<T>>,
  ILookupNormalizer, IdentityErrorDescriber, IServiceProvider,
  ILogger<UserManager<T>>)`.
- A store used with `CreateAsync` must implement
  `IUserPasswordStore<TUser>` (else `NotSupportedException`); the slim
  `IUserStore<TUser>` has 10 members (no logins/claims/stamps).
- `IdentityResult.Error(...)` is gone: use `IdentityResult.Failed(
  [new IdentityError { Code, Description }])`.
- `EntityFrameworkUserStore` is `UserStore` in the
  `Microsoft.AspNetCore.Identity.EntityFrameworkCore` assembly (not
  referenced by the test project — the stub approach avoids the ref).

## Result — Batch D (2026-10-05, cobertura /tmp/cov04f, 464 tests green)

| File | Before | After |
|------|--------|-------|
| `Endpoints/StaffProductEndpoints.cs` | 85.3% | **100%** (232/232) |
| `Services/ProductAdministrationService.cs` | 66.3% | **97.3%** (362/372) |

Remaining uncovered (9 lines, documented):
- 30: `const MaxPrice` declaration (no runtime code — counting artifact).
- 420-422: `ProcessOneAsync` `catch (Exception)` — only reachable when
  ImageSharp throws past its own internal catches (e.g. OOM mid-encode);
  a header-valid truncated PNG still fails at `ProductImages.ProcessAsync`
  (returns null → same "unsupported" result).
- 434-435, 437-441: `DeleteImageFiles` `IOException` /
  `UnauthorizedAccessException` catches (defensive file-system quirks).

**Bug found + fixed in-plan (precedent 20261004-0554):**
`ProductAdministrationService.UpdateAsync` never populated the `Category`
navigation after setting `CategoryId`, so a PATCH that sets/moves a
category returned a `ProductDto` with `category: null` (the DB row was
correct; only the response was stale). `CreateAsync` already does this
with an explicit comment; the fix mirrors it: after `SaveChanges`, assign
`product.Category` from an `AsNoTracking` lookup (same pattern, zero save-
semantics risk). No existing test pinned the stale null.

Tests added — `StaffProductAdminTests.cs` (23 tests):
- categories: list 200; update rename/filter/translations-replaced;
  update unknown → 404; update no names → 400; create validations
  (empty / no-en / duplicate / invalid lang / 81-char name / en-empty +
  ar-name) → 400; nameless optional translation dropped (200, en only);
  delete unknown → 404 (admin).
- products: create content validations (empty / no-en / en-empty-title /
  121-char title / 2001-char description / duplicate / invalid lang) →
  400; nameless optional translation dropped (200); price/stock guards
  (−1 / 1,000,001 / −1 / 100,001) → 400; boundary price 1,000,000 + bad
  currency code → 200 stored as USD; create with category (response links
  it); update unknown → 404; update moves to category (response links it);
  update validations (no-en content, unknown category, price/stock) → 400;
  soft delete unknown → 404 (admin).
- images: add to unknown product → 404; parseable form with no files →
  400 "No files uploaded" (an empty multipart body fails form binding
  before the handler — framework 400, not the service guard); 11 files →
  400 cap; good+bad files → 400 with the good file rolled back (row +
  both disk files gone); 10 MB+1 file → 400 size; header-valid PNG
  truncated mid-chunk → 400 (decode fail); reorder empty list and
  duplicated id → 400; delete unknown image → 404.

Test-infrastructure note: the ephemeral `hc-test-pg` container can exit
between sessions — `docker start hc-test-pg` before backend test runs.

## Result — Batch E (2026-10-13, coverlet JSON /tmp/covE, 492 tests green)

| File | Before | After |
|------|--------|-------|
| `Endpoints/OrderEndpoints.cs` | 84.6% | **95.5%** (826/865) |
| `Endpoints/IdentityEndpoints.cs` | 86.6% | **95.7%** (286/299) |
| `Services/UserAdministrationService.cs` | 79.6% | **100%** (137/137) |

**Bug 6 found + fixed in-plan (precedent 20261004-0554):**
`OrderEndpoints` (guest-create product lookup, customer confirm-delivery
and rating, staff status/notes/assignment/payment/delivery) and
`AdminUserEndpoints` (update) compared the service result code against
`"product_not_found"` / `"order_not_found"` / `"user_not_found"`, but
`ApiError.NotFound(message)` hardcodes `Code = "not_found"` with the
category in `Message`. The 404 branches were dead: unknown products on
guest create and unknown orders on the staff/customer routes returned
**400** (or a conflict) instead of **404**. Fixed all affected checks to
`"not_found"` (the app-wide convention). No existing test pinned the old
statuses.

**Bug 7 found + fixed in-plan:**
`UserAdministrationService.ResetPasswordAsync` set
`target.MustChangePassword = true` **before** `RemovePasswordAsync`.
The EF store persists eagerly on its own `SetPasswordHashAsync` call,
so a failed `AddPasswordAsync` left the DB row with the wiped hash
**and** `MustChangePassword = true` — a locked-out user flagged for a
password change they can't make. Fix: set the flag only after a
successful add (remove-then-add order kept: .NET 10
`AddPasswordAsync` refuses users that already have a password
(`UserAlreadyHasPassword`), and the token-based `ResetPasswordAsync`
needs a `IUserTwoFactorTokenProvider` the app does not register).

Tests added:
- `OrderEndpointsTests` (+~40): guest create (catalog + custom with
  sample images, out-of-stock visible, unknown product → 404
  [Bug 6]), customer list/detail (own orders incl. guest-linked,
  cancel + reason, rate + comment, confirm-delivery conflict), staff
  list/detail/status/notes (terminal order guard)/attachments
  (sample/wip kinds, cap, bad bytes)/assignment (blank clears,
  invalid id → 400, non-employee → 400)/payment (receipt upload +
  amount, conflicts)/delivery (method/date guards, proof file),
  admin detail (staff view), admin status transitions (note required,
  unknown word → 400, skip-to-paid without receipt → 409, delivery
  before payment → 409), order-file endpoints (content-type sniff,
  unknown → 404). Helper `CreateClosedOrderAsync` drives a
customer-linked guest order to `closed` via the admin override flow
  (admin transitions require a `note` — probed: the guard fires
  before the state machine).
- `IdentityEndpointsTests` (+~12): register validation (empty/
  weak/duplicate), login empty credentials → 401, logout, profile
  PATCH validations (name/phone/country/language), password-change
  (wrong current, weak new), avatar (empty → 400, oversize → 400,
  replace deletes the old file), guest-link (bad id → 400, unknown →
  404, conflict → 409).
- `AdminUserEndpointsTests` (+8): PATCH unknown → 404 [Bug 6],
  self-modification → 403, invalid employee assignment → 400,
  successful assignment (audit row), password-reset unknown → 404,
  DELETE unknown → 404, DELETE self → 403.
- `UserAdministrationServiceTests.cs` (new, 2 tests + a rejecting
  `IPasswordValidator<AppUser>` — .NET 10 requires **both**
  `ValidatePasswordAsync(user, password)` and `ValidateAsync(
  userManager, user, password)`): create identity failure → mapped
  error, no user row; reset add failure → `policy_failed` mapped,
  `MustChangePassword` NOT persisted [Bug 7].

Remaining uncovered, both files (documented residual):
- `OrderEndpoints` 39 lines: in-handler `user is null` →
  `Unauthenticated()` guards + the `Unauthenticated()` helper itself
  (991-993). Unreachable through the HTTP surface:
  `ActiveUserAuthorizationHandler` re-checks the DB (missing/inactive/
  deleted/locked) and rejects before any authorized handler runs — the
  same conclusion as the plan's earlier analysis of the identity
  guards.
- `IdentityEndpoints` 13 lines: same guard kind (`user is null` arms
  in profile/password-change/guest-link/avatar handlers).

Coverage-tooling note (this session): coverlet 6 writes the JSON
summary as `{assembly: {path: {class: {method: {Lines: {line: hits}}}}}}`
and includes **0-hit lines**, so per-line max-hits dedupe over the JSON
is exact (the Cobertura XML path is no longer needed). `/tmp/covrep.py`
updated to this shape.
