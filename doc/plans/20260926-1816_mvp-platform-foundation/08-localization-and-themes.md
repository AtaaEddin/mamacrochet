# 08 — Localization (en/ar/tr) & Themes

status: in-progress
parent: main.md

## Goal

Full trilingual support — English (default), Arabic (full RTL), Turkish — plus
light/dark theming across the whole app. Release 1 ships **en + ar complete**; tr
catalogs are scaffolded (translations best-effort / owner-supplied).

**Sequencing note**: the *foundation* (next-intl setup, dir/RTL handling, brand theme
tokens from plan 11) is built right after the scaffold (02) so every feature page is
i18n-ready from the start; whole-page translations are finished last (phase 7).

## Decisions (foundation, verified 2026-09-26)

- **next-intl 4.14.7** — still the recommended App Router i18n for Next 16; explicit
  Next.js 16 support (PR amannn/next-intl#2054 “Next.js 16 update”) and first-class
  **Next 16.3 `next/root-params`** integration (next-intl.dev/blog/nextjs-root-params —
  we run 16.3.6). Sources: next-intl.dev/docs/getting-started/app-router,
  next-intl.dev/docs/routing/setup, next-intl.dev/docs/routing/middleware.
- **Locale-based routing, prefix `/en|/ar|/tr`** (`defineRouting`, `localePrefix` default
  `always`). Negotiation priority (built into `next-intl` proxy): URL prefix → cookie
  (`mamacrochet-locale`) → `Accept-Language` → `en`. This refines the plan’s
  “profile → Accept-Language → en” order: the profile preference (plan 03) will be
  written as the cookie/locale source once auth exists; URL+cookie is the standard,
  SEO-friendly, client-less mechanism and persists better than localStorage
  (supersedes the “localStorage only when logged out” hint).
- **File layout (Next 16.3 conventions)**: `src/i18n/{routing,request,navigation}.ts`,
  locale negotiation in `src/proxy.ts` (Next 16 renamed middleware→proxy, per
  `next/dist/docs`), **root layout moved into `app/[locale]/layout.tsx`** (Next 16.3
  allows nested root layouts; `getRequestLocale()` in `i18n/request.ts` reads the
  locale via `next/root-params`), `generateStaticParams` for static rendering.
  No pass-through `app/layout.tsx` (must not exist — it would shadow the root layout).
- **next-themes 0.4.6** for system/light/dark with no flash (official shadcn pattern,
  ui.shadcn.com/docs/dark-mode/next). Toggle in the header: segmented
  light/system/dark, persisted in localStorage (`mamacrochet-theme`); profile storage
  comes with plan 03. `disableTransitionOnChange` on.
- **Visual verification tooling**: `playwright-core` (devDependency) driven against the
  system Chromium (`/snap/bin/chromium`) via `frontend/scripts/verify-ui.mjs` —
  screenshots for mobile+desktop × light+dark × en+ar. Chosen over bundled Playwright
  browsers to keep the repo/host light (low-power rule).
- **Typography/RTL notes applied**: `<html lang dir>` per locale; CSS logical
  properties only in components; Arabic line-height ≥ 1.7 on body copy
  (w3.org/International/alreq — connected script needs room for diacritics/ligatures).

## Scope

- **Language resolution order**: user profile preference → `Accept-Language` header →
  `en`. Manual language switcher in the header (logged-out users: localStorage only).
- **UI strings**: frontend-owned JSON catalogs (`messages/en.json`, `ar.json`, `tr.json`)
  via **next-intl** (verify it is still the recommended approach for Next 16 at
  implementation time — search online per plan rule 3).
- **Domain content**: per-language rows (ProductTranslation etc., plan 04) with
  fallback to en. Admin translation editor per content item (3 tabs: en/ar/tr).
- **Emails**: not in release 1 (deferred with plan 03 / D13).
- **RTL**: `<html dir>` per language; use CSS logical properties (margin-inline etc.);
  verify layout of chat (bubbles), forms, tables, status board in Arabic.
- **Formatting**: Intl API for dates/numbers; currency shown as USD in all languages
  (plan D11); locale-aware date picker in delivery form.
- **Themes**: light + dark. Default = system preference; manual toggle (light/dark/system)
  persisted in profile (or localStorage when logged out). shadcn/ui design tokens
  (OKLCH CSS variables) for both modes, **palette from the brand system (plan 11)** —
  no hard-coded colors in components.

## Tasks

- [x] next-intl setup: providers, routing/middleware (proxy) language
      negotiation, catalogs (`messages/en.json`, `ar.json`, `tr.json`) — FOUNDATION DONE
- [ ] Translate core UI strings (catalog, orders, chat, auth, admin) en/ar/tr — phase 7
- [ ] RTL pass: dir handling, logical properties, component review (shadcn RTL
      support) — foundation done (`<html lang dir>`, logical props, QA verified);
      feature screens verified as they land
- [x] Theme provider (system/light/dark) + toggle in header — FOUNDATION DONE
      (next-themes, segmented light/system/dark, 44 px targets, localStorage
      key `mamacrochet-theme`)
- [x] Brand tokens: plan 11 palette/type/motion tokens into the shadcn theme
      (light+dark) — FOUNDATION DONE (see plan 11)
- [ ] (deferred — future email plan) email templates en/ar/tr
- [ ] Translation editor (admin/employee) for product/category content — with plan 04

## Result (foundation, 2026-09-26)

- Locale routing `/en|/ar|/tr` via next-intl 4.14.7 proxy; negotiation
  prefix → cookie → Accept-Language → en. Root layout in `app/[locale]/`,
  locale resolved in `i18n/request.ts` via `next/root-params` (16.3) with
  header fallback; all 3 locales prerender statically (`next build`: `●
  /en /ar /tr`).
- RTL verified programmatically: `dir=rtl`, logo mirrors right, chat widget
  mirrors left, no horizontal overflow at 390 px, Arabic title/H1 render.
- **Scaffold fix (blocking)**: Next 16.3.6 Turbopack cannot resolve a
  tsconfig `extends` to a file outside the app root (known Turbopack
  limitation; breaks both `next dev` and `next build`). `frontend/
  tsconfig.json` is now self-contained (all strict flags inlined, incl.
  `noUncheckedIndexedAccess`); repo-root `tsconfig.json` removed; AGENTS.md
  updated. Verified: build + dev + QA green.
- QA tooling committed: `frontend/scripts/contrast.mjs` (WCAG AA on tokens),
  `frontend/scripts/visual-qa.mjs` (fonts/RTL/overflow/touch/dark/reduced-
  motion on a running build), `frontend/scripts/verify-ui.mjs` (screenshots,
  playwright-core + system Chromium). No `pnpm test` script exists yet
  (vitest not scaffolded) — DoD item 2 tracked for a later plan.

## Acceptance

- Every page usable in en, ar, tr (no missing keys → no `[[key]]` shown);
  Arabic renders fully RTL with no mirrored/overlapping controls.
- Theme toggle persists across reload and login state; both themes pass contrast
  checks on text; no component shows unstyled in dark mode.
