# Auto-seed an admin account (strong password)

status: done
created: 2026-10-03 21:26 (+03)
owner: agent (requested by owner 2026-10-03)

## Why

There is no admin bootstrap: `identity.register` creates plain customers,
`/admin/users` requires an admin, and the only seeder is the catalog
(`CatalogSeeder`). Getting a first admin today means a manual `UPDATE` on the
DB. Owner wants the platform to **auto-seed an admin with a good password** —
zero manual steps, on dev and on prod.

## Decisions

- **New `AdminSeeder`** in `src/Hanadicrochet.Api/Data/` (mirrors
  `CatalogSeeder`), run in the existing single-instance startup block
  (`Program.cs`) right after `Migrate()`, before the catalog seed.
  **No EF migration** (no schema change), no new dependencies, no new
  services, **no frontend changes** (login + forced-change gate already
  exist from plan 03).
- **Idempotent**: no-op while any non-deleted `IsAdmin` user exists
  (self-heals after all admins were soft-deleted). Same shape as the
  catalog seeder.
- **Email**: `AdminSeed:Email` config (env `AdminSeed__Email`), default
  `admin@hanadicrochet.example` (`.example` is IANA-reserved, never
  resolves; release 1 sends no email, D13). Blank/absent → default.
- **Password**: `AdminSeed:Password` config (env `AdminSeed__Password`)
  when set, else **generated**: 20 chars, ≥1 of each class (upper/lower/
  digit/symbol), drawn with `System.Security.Cryptography.RandomNumberGenerator`
  (public in .NET 10: `GetString(ReadOnlySpan<char>, int)` + `GetInt32(int)`)
  + Fisher–Yates shuffle. Satisfies the full default Identity policy
  (min 8, all four classes — exactly what `Program.cs` registers).
- **Validation**: creation goes through `UserManager<AppUser>.CreateAsync`
  → Identity validates + hashes (`PasswordHasher<AppUser>`, PBKDF2 100k
  iters — the same hasher login verifies against). A configured password
  that fails policy ⇒ IdentityResult error ⇒ **startup aborts with a clear
  message** (fail fast beats an admin that can't log in).
- **First login**: account starts with `MustChangePassword = true` →
  plan 03's forced-change gate makes the owner pick their own password.
  The initial password is **logged exactly once** (Information level) at
  creation: `admin seeded: <email> / <password>`.
- **Account shape**: `IsAdmin = true`, `IsEmployee = false` (admins pass
  every staff check in code: `IsEmployee || IsAdmin`), `IsActive = true`,
  `Language = "en"`, `DisplayName = "Admin"`, `UserName = email`,
  `NormalizedEmail = email.ToUpperInvariant()` (same as the register path).
- **Collision**: if the email is already taken by a non-admin user ⇒
  startup aborts with a clear message (set `AdminSeed__Email` to a free
  address). Never silently promote an existing user.
- **Recovery paths** (the one-time log line is not durable):
  1. `docker compose logs api | grep -i "admin seeded"` (dev: console),
  2. set `AdminSeed__Password` for a known password (applied on the first
     seed only — re-seed never overwrites a changed password),
  3. psql on the box (owner owns the machine; last resort).
- **Prod wiring** (plan 10 conventions): `docker-compose.yml` api service
  passes `AdminSeed__Email`/`AdminSeed__Password` from `.env`
  (`${ADMIN_SEED_EMAIL:-}` / `${ADMIN_SEED_PASSWORD:-}`, empty = unset →
  generated); `.env.example` documents the optional block;
  `deploy/README.md` gets an "Admin account" section (credentials, forced
  change, recovery).
- **Not in scope**: multiple seeded admins, self-service admin creation,
  emailing the password (no email in release 1, D13), multi-instance
  startup races (plan 10 = single machine, single api container; the
  seeder still tolerates a lost race via the unique email index +
  re-check, it just can't log two different passwords for one email).

## Sources (checked 2026-10-03)

- `RandomNumberGenerator.GetString(ReadOnlySpan<char>, int)` — public
  .NET 10, cryptographically secure:
  learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.randomnumbergenerator.getstring?view=net-10.0,
  source: source.dot.net/system.security.cryptography/System/Security/Cryptography/RandomNumberGenerator.cs.html
- `PasswordHasher<TUser>.HashPassword` / `PasswordValidator<TUser>` —
  public Identity APIs (aspnetcore-10.0):
  learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.passwordhasher-1.hashpassword?view=aspnetcore-10.0,
  learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.passwordvalidator-1?view=aspnetcore-10.0
- **No public `PasswordGenerator`** in ASP.NET Identity (API page 404) →
  hand-rolled with `RandomNumberGenerator` (as above).
- Microsoft's seeding sample passes credentials in from outside
  (user-secrets style), confirming "never hardcode seed passwords":
  github.com/dotnet/AspNetCore.Docs/blob/master/aspnetcore/security/authorization/secure-data/samples/final2.1/Data/SeedData.cs

## Verification (definition of done)

1. `dotnet build` → 0 warnings.
2. Live on a **scratch `postgres:16-alpine`** (same image as prod compose),
   API run with env overrides (dev DB untouched):
   - fresh DB A (no `AdminSeed__*`): startup logs exactly one
     `admin seeded` line; `POST /identity/login` (staff door) with those
     credentials → 200; `/identity/me` → `IsAdmin: true`,
     `MustChangePassword: true`; **restart** → no second seed line,
     still 1 user, login still works.
   - fresh DB B with `AdminSeed__PASSWORD` set: login with that exact
     password works (fixed-password path).
   - fresh DB C with a weak `AdminSeed__PASSWORD` (e.g. `short`):
     startup **aborts** with the clear policy message.
3. `pnpm typecheck` / `pnpm lint` / `pnpm test` green (no frontend
   change — sanity only). No UI to browser-verify (the forced-change
   gate was browser-verified in plan 03).

## Files

- new `src/Hanadicrochet.Api/Data/AdminSeeder.cs`
- new `src/Hanadicrochet.Api/Models/AdminSeedOptions.cs`
- `src/Hanadicrochet.Api/Program.cs` (options registration + startup call)
- `deploy/docker-compose.yml` (2 env passthroughs, api service)
- `deploy/.env.example` (optional `ADMIN_SEED_*` block, commented)
- `deploy/README.md` ("Admin account" section)
- this plan folder (+ `COMMITS.md`)

## Verification results (2026-10-03)

All on scratch `postgres:16-alpine` containers (ports 15543-15545, DBs
`hc_seedtest*`), API run as the built dll with env overrides — dev DB
touched only via these scratch DBs, then all removed:

- **A generated**: boot logged exactly
  `Admin seeded: admin@hanadicrochet.example / <20-char pw> — …`; staff
  login (antiforgery → `POST /identity/login`, `staff: true`) → 200;
  `GET /identity/me` → `roles: [customer, admin]`,
  `mustChangePassword: true`, `isActive: true`. **Restart** → 0 seed
  lines, `AspNetUsers` count still 1, existing session still 200.
- **B fixed**: `AdminSeed__Password=Fixed-Str0ng-Pass!` → seed line shows
  exactly that password; login 200.
- **C weak**: `AdminSeed__Password=short` → process aborts with
  `AdminSeeder: cannot create the admin account '…': Passwords must be at
  least 8 characters.. Check AdminSeed:Email …` (non-zero exit).
- `dotnet build` → 0 warnings. `docker compose config -q` → parses.
  `pnpm typecheck` / `pnpm lint` green (no frontend change). No UI to
  browser-verify.

Implementation notes (vs. plan): `UserManager<TUser>` exposes neither
`Context` nor `IQueryable` in .NET 10 → existence checks run on
`AppDbContext.Users` (the seeder now takes both `AppDbContext` and
`UserManager<AppUser>`); `IdentityError` carries `Code`/`Description`
