# Commits — 20260926-1816_mvp-platform-foundation

Append a row for **every** git commit related to this plan (see AGENTS.md → Plan system),
then commit the update.

| Date (local) | Commit | Subject | Note |
|--------------|--------|---------|------|
| 2026-09-26 18:45 | 2038e05 | chore: bootstrap repo — AGENTS.md, plan system, first MVP plan, language configs | First agent: AGENTS.md (domain + rules), doc/ plan system, first plan (main + 10 sub-plans), .gitignore, tsconfig.json (strict), Directory.Build.props (warnings as errors), .editorconfig, rewritten Readme.md, reference doc moved to doc/references/ |

| 2026-09-26 19:05 | 305a321 | docs(plans): owner decisions — drop item 5, email via Google SMTP (D13) | Owner confirmed: ignore list item 5; email via a Google account over SMTP (OAuth 2.0 in prod, app-password dev fallback) — not self-hosted mail. Added D13 to main.md, reworked plan 03 email decisions (IEmailSender), AGENTS.md stack line |

| 2026-09-26 19:38 | 03300f6 | docs(plans): owner updates — guest-first chat core, no email in r1, brand plan 11, guest anti-abuse, future plan (email+notifications+Google login) | Owner: guest-first anonymous chat/orders is THE core idea (D14) w/ anti-abuse bounds (D16); email out of release 1 (D13 post-r1); feminine/fluffy/joyful brand (D15 + new plan 11); en+ar complete in r1; Google sign-in = core but future release (D17); notifications for all roles ship with email (D18) → new plan folder 20260926-1935 |

| 2026-09-26 19:47 | 7f3dca3 | feat: agent skills tree + prompts (plan 01 done) | Plan 01 executed: official skills (shadcn, react-best-practices) downloaded unmodified into .agents/skills/, own skills nextjs/dotnet/ui-design/deployment, prompts review/ui-review/deploy in .pi/prompts/ |

| 2026-09-26 20:47 | 1062cbc | feat: scaffold Aspire 13 + .NET 10 API + Next.js 16 frontend (plan 02 done) | Plan 02 executed: Mamacrochet.slnx, AppHost (Aspire.AppHost.Sdk 13.5.4, Postgres+Api, 13.x APIs WithReference/WithHttpEndpoint), Api (EF Core 10 + Npgsql 10.0.3, /health, InitialCreate migration, no https redirect), frontend (Next 16.3.6 CNA, tsconfig extends root, shadcn init, health widget page), scripts/dev.sh (api :8085, web :3001), official Aspire skill added to .agents/skills/. Verified: dotnet build 0 warnings, pnpm typecheck+lint clean, live run: /health {"status":"ok","database":"connected"} + page renders |

| 2026-09-26 22:43 | 4e6736c | feat: brand system + i18n/theme foundation (phase 2: plans 11 + 08-foundation) | Phase 2 executed. Plan 11 (done): brand tokens (warm cream/coral-rose light, deep plum dark; 20/20 pairs WCAG AA via scripts/contrast.mjs), fonts Baloo Bhaijaan 2 + Cairo (next/font, cover en/ar/tr+latin-ext), CSS motion + reduced-motion kill-switch, illustration set (bunny mark/mascot, yarn, empty shelf, 404, confetti, loader), brand home + 404, floating chat widget brand treatment, doc/references/brand.md. Plan 08 foundation (done): next-intl 4.14.7 /en|/ar|/tr prefix routing + proxy (prefix→cookie→Accept-Language→en) + en/ar/tr catalogs + root layout in app/[locale]/ via next/root-params (16.3), RTL dir+logical props QA-verified, next-themes system/light/dark + segmented toggle, 2-row mobile header (≥44px targets). Blocking scaffold fix: Next 16.3.6 Turbopack can't resolve tsconfig `extends` outside app root → frontend/tsconfig.json self-contained (strict flags kept), root tsconfig removed, AGENTS.md updated. QA tooling (playwright-core + system Chromium): visual-qa.mjs (24 checks), verify-ui.mjs (11 screenshots), contrast.mjs. Verified on prod build: /en /ar /tr SSG, 24/24 QA, 11/11 screenshots, dotnet build 0 warnings + pnpm typecheck/lint clean |

| 2026-09-26 | f7e1b23 | feat(brand v2): Mama identity, Turkish/Arabic palette, chat-first home + /chat & /works pages | Brand/UX revision (standalone plan 20260926-2309): mascot Mama, palette v2, home v3, /chat + /works pages, D19–D23 recorded, plan 05/06 design notes |

| 2026-09-27 | ef36a05 | feat(dev): Aspire runs the full stack + ServiceDefaults + OpenAPI typed client | Follow-up 2026-09-27: AppHost hosts postgres+api+web (AddNextJsApp+WithPnpm, ports 8085/3000, CORS+URL wiring), scripts/dev.sh retired, ServiceDefaults (OTel/health/resilience), pnpm gen:api pipeline (openapi-typescript 7 + openapi-fetch, committed schema, ApiStatus first consumer) |
