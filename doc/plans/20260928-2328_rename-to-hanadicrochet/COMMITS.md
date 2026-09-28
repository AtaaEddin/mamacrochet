# Commits — 20260928-2328_rename-to-hanadicrochet

Append a row for every git commit related to this plan (see AGENTS.md → Plan
system), then commit the update.

| Date (local) | Commit | Subject | Note |
|--------------|--------|---------|------|
| 2026-09-28 | 75cad0c | chore: rename .NET solution to Hanadicrochet | Projects/folders/slnx, 71 namespaces, connection string key, Aspire DB+volume, auth cookie mm.auth→hc.auth, Dockerfile. Live-verified on port 5058: fresh hanadicrochet DB (migrations+seed), register/login round-trip issues hc.auth. Old volume left orphaned as backup |
| 2026-09-28 | ad1663f | chore: rename brand to hanadicrochet in frontend | Wordmark + persona Mama→Hanadi (en/ar حنادي/tr with per-line suffixes), Hanadi* mascot components, --brand-hanadi-* tokens, locale/theme/MIME/guestId keys, schema.json. 28 files, 144/144 pure-rename lines; typecheck/lint/build green |
| 2026-09-28 | ab80af8 | chore: rename to hanadicrochet in deploy + living docs | Compose project+images+build path, POSTGRES_USER/DB, Caddyfile example domain, scripts, AGENTS.md/Readme/skills/prompts. Historical plan files intentionally untouched |
