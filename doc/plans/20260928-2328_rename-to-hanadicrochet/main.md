# Rename — mamacrochet → hanadicrochet

`status: done`

## Why

The product is being renamed. Doing it **now** — before plan 10 ships — is the
cheapest moment: there is no production database, no live domain and no
deployed image yet. After first deploy this becomes a migration project.

Confirmed with the owner (2026-09-28): **change everything** — wordmark,
persona, code identifiers, keys, database, deploy config, docs, repo folder.

## Scope

### 1. Wordmark + persona (visible brand)
- Wordmark `mamacrochet` → `hanadicrochet` (site header, `messages.*.json`
  `name` field → meta/chat name).
- Persona **Mama → Hanadi** in all three languages — the maker is now
  Hanadi:
  - `en.json`: "Mama" → "Hanadi" (chat opener, "Chat with Mama", …)
  - `ar.json`: ماما → حنادي, brand "ماما كروشيه" → "حنادي كروشيه"
  - `tr.json`: "Mama Kroşe" → "Hanadi Kroşe"; possessive/dative forms done
    per-line (Hanadi'nin, Hanadi'yla, Hanadi'ya, Hanadi ile, …) — Turkish
    suffixes do not survive a blind replace.
- `MamaMark` illustration component → `HanadiMark` (file + symbol + imports).
  **Artwork unchanged** — the drawn face still reads "mama"; re-drawing it is
  a plan-11 design follow-up, not part of a rename.

### 2. .NET
- Folders + project files: `src/Mamacrochet.{Api,AppHost,ServiceDefaults}` →
  `src/Hanadicrochet.{…}`, `Mamacrochet.*.csproj` → `Hanadicrochet.*.csproj`.
- `Mamacrochet.slnx` → `Hanadicrochet.slnx`; all `namespace Mamacrochet.*`
  (71 files), `Projects.Mamacrochet_Api` (AppHost), csproj references.
- Connection string key `mamacrochet` → `hanadicrochet`
  (`ConnectionStrings__mamacrochet`, `GetConnectionString("mamacrochet")`,
  `appsettings.json`).
- Aspire: `AddDatabase("hanadicrochet")`, data volume
  `hanadicrochet-postgres-data`.
- Dockerfile: build paths + `ENTRYPOINT … Hanadicrochet.Api.dll`.

### 3. Frontend (behavioral keys)
- `mamacrochet-locale` cookie → `hanadicrochet-locale`
- `mamacrochet-theme` storage key → `hanadicrochet-theme`
- `text/mamacrochet-work` drag MIME → `text/hanadicrochet-work`
- `mm.auth` cookie → `hc.auth`, `mm.guestId` → `hc.guestId` (the `mm.`
  prefix was the old brand's initials) + comments.
- `schema.json` title/server `Mamacrochet.Api` → `Hanadicrochet.Api`
  (regenerated artifact; next `gen-api` run reproduces it).

### 4. Deploy (plan 10 — nothing deployed yet)
- compose: project name, images `hanadicrochet-{api,web}:latest`,
  `ConnectionStrings__hanadicrochet`, build path.
- `.env.example` + `.env`: `POSTGRES_USER`/`POSTGRES_DB` → `hanadicrochet`.
- Caddyfile: example domain `hanadicrochet.example.com`; deploy/backup
  script comments + paths.

### 5. Living docs
- `AGENTS.md` (title, dev command, layout block), `Readme.md`,
  `doc/README.md`, `.agents/skills/*`, `.pi/prompts/*`.

## Explicitly NOT touched
- **Git history** — no rewriting; the rename is a fresh commit.
- **Historical plan files** (`doc/plans/2026*/`) — records of what shipped
  under the old name; AGENTS.md forbids deleting/renaming plan folders.
- **Illustration artwork** (see scope 1).
- **Production migration** — none exists to migrate.

## Acceptable resets (dev only)
| Thing | Effect |
|---|---|
| New Aspire DB + volume | fresh empty `hanadicrochet` DB (migrations + `CatalogSeeder` rebuild). The old volume `mamacrochet-postgres-data` is left **orphaned on disk as a recoverable backup** of the QA data — delete it once the rename is trusted. |
| `mm.auth` → `hc.auth` | dev logouts |
| locale/theme/guestId keys | one-time preference reset |

## Verification
1. `dotnet build` 0/0 · `pnpm typecheck` · `pnpm lint` · `pnpm build` green.
2. Live: create `hanadicrochet` DB in the dev cluster, run the API with the
   new connection string → migrations apply, health OK, catalog seeded,
   register/login round-trip on the new cookie name.
3. Browser: wordmark + persona visible under all three locales.

## Execution log
- 2026-09-28: scope measured (170 real files; 682 `.next` artifacts
  regenerate). Plan written.
- 2026-09-28: 75cad0c (.NET) · ad1663f (frontend) · ab80af8 (deploy+docs).
  Live verification: fresh `hanadicrochet` DB in the dev cluster →
  migrations + CatalogSeeder OK, health OK, register/login round-trip
  issues the `hc.auth` cookie (verified on 127.0.0.1:5058 with the new
  binary — the Aspire stack on :8085 was still serving the pre-rename
  code). Test DB dropped from the old cluster afterwards.
- 2026-09-28: repo folder renamed to `…/repos/hanadicrochet` (final
  step). Dev stack restarts via `dotnet run --project
  src/Hanadicrochet.AppHost` → fresh volume + DB (the planned wipe);
  the old `mamacrochet-postgres-data` volume is orphaned on disk as a
  recoverable backup of the pre-rename QA data.
