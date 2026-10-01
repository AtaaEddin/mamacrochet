# 08 — Localization (en/ar/tr) & Themes

status: done
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
- [x] Translate core UI strings (catalog, orders, chat, auth, admin) en/ar/tr —
      phase 7 done 2026-09-28: final en/ar/tr pass complete, catalogs at full key
      parity (0 missing / 0 extra vs en, 714 lines each)
- [x] RTL pass: dir handling, logical properties, component review (shadcn RTL
      support) — done 2026-09-28: 12 UI components converted to logical properties,
      switch thumb gets an RTL flip, /ar DOM scan shows 0 physical utilities
- [x] Theme provider (system/light/dark) + toggle in header — FOUNDATION DONE
      (next-themes, segmented light/system/dark, 44 px targets, localStorage
      key `mamacrochet-theme`)
- [x] Brand tokens: plan 11 palette/type/motion tokens into the shadcn theme
      (light+dark) — FOUNDATION DONE (see plan 11)
- [ ] (deferred — future email plan) email templates en/ar/tr
- [x] Translation editor (admin/employee) for product/category content — with
      plan 04 (delivered in plan 04: product editor + category manager edit
      en/ar/tr titles/descriptions/names; API `PATCH /staff/products/{id}` +
      `PATCH /staff/categories/{id}` — checkbox verified 2026-09-28)

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

## Result (final pass, 2026-09-28)

- **Catalog parity + gaps**: ar/tr verified 0 missing / 0 extra keys vs en
  (714 lines each). Genuinely missing keys added: `AdminHiring.email`,
  `ApiError.fallback` (per-locale wording). Hardcoded a11y labels moved into
  the catalog: `Works.galleryLabel` / `Works.galleryPhoto` (photo tabs),
  `Works.navCategory` (home category group), `Works.navWorksByCategory`
  (works page category group) — now translatable per locale. `Locale`
  self-names localized per locale (en shows English names, ar shows Arabic,
  tr shows Turkish); `tr.Metadata.name` was `"mamacrochet"` → `"Mama Kroşe"`.
  `staff-products-view` hardcoded `Intl.NumberFormat("en")` → uses the active
  locale.
- **Translation quality pass (tr)**: "örümek" (spider) → "ören" (Join.pitch),
  "üretici" (producer) → zanaatkar / "bizzat" wording (Join), "biz iğnelerini
  çekelim" (pulled your needles) → "biz senin için örelim" (Orders.custom),
  "özer" → "örebilir" (ChatPanel.pickerEmpty), "eskiz" → "skiz"
  (CustomOffer.body), "Oturman" → "Oturumun" (ApiError.csrf),
  "sen" → "senin" (Staff.vYou), "çıkışları" → "oturumları sonlandırılır"
  (AdminUsers.deleteBody), paymentAdminBody clarified, plus grammar passes
  (Join.successBody, AdminUsers.formBody, Orders.deliveryIntro, Hiring.formBody,
  Profile.saveError/roleEmployee, Join.title, Join.hiringForm aria, Home.
  askMamaCta/heroTitle, Home.heroKicker, Home.heroCta, Orders.create.fileInvalid,
  ApiError.title).
- **Translation quality pass (ar)**: feminine register normalized to match the
  rest of the catalog (Staff.errorBody/retry/saveError/deleteError, AdminUsers.
  createBody, Join.pitch — "يُعمَل" passive removed), "مشرف" → "إدارية/إداريات"
  (ChatPanel.adminBadge, AdminHiring.forbidden*), "دخول الموظفين" → "دخول
  الموظفات" (Staff.staffSignin), "10MB" → "10 م.ب" (Orders.create.fileInvalid),
  minor wording (AdminHiring.forbiddenBody, ApiError.title).
- **RTL component review**: physical → logical properties in `ui/{select,
  toast,alert,button,field,dialog,table,alert-dialog,avatar,badge,switch}.tsx`
  + `chat-panel.tsx` (e.g. `pr-*`/`pl-*`→`ps`/`pe`, `text-left`→`text-start`,
  `right-*`→`end-*`); `switch` thumb flip for RTL (checked state pushes thumb
  the other way: `rtl:...data-checked:-translate-x-[calc(100%-2px)]`).
  Verified: 0 physical utilities on rendered /ar pages (DOM scan), compiled
  CSS contains the new `rtl:` variants, `visual-qa.mjs` all green
  (dir=rtl, logo mirrored, no overflow, AA contrast both themes).
- **Verification (DoD)**: `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm build` ✓
  (all 3 locales prerender) · `verify-ui.mjs` 15/15 shots en/ar/tr ×
  mobile/desktop × light/dark, 0 page errors · `visual-qa.mjs` all checks
  pass · product-page gallery a11y labels verified in browser en + ar
  ("Test amigurumi fox — photo 1" / "«ثعلب اختبار» — الصورة 1").
- **Tooling refresh**: `verify-ui.mjs` / `visual-qa.mjs` aligned with the
  current UI (works cards now link `/works/[id]`, fresh guest chat starts on
  the empty state, rail count compared against the live catalog endpoint,
  "show more" shot skips gracefully when the catalog fits one page).

## Result (bug fix — ThemeToggle hydration, 2026-10-01)

- **Bug**: every page logged `A tree hydrated but some attributes of the
  server rendered HTML didn't match` in dev (Turbopack). `ThemeToggle`
  rendered `aria-pressed`/active classes from `useTheme().resolvedTheme`,
  which is `undefined` on the server (→ System pressed) but already resolved
  on the client at hydration → mismatch; next-themes' inline script also
  mutates `<html>` (color-scheme + theme class) before hydration.
- **Fix**: (1) `ThemeToggle` is hydration-safe per the next-themes README
  ("Avoid Hydration Mismatch"): a `useMounted` flag via
  `useSyncExternalStore` (server snapshot on the server AND the first client
  render, client snapshot afterwards — no setState in an effect, lint-clean)
  — until mount no option is active, the pill keeps its layout (all muted),
  no CLS. (2) The active option now comes from `useTheme().theme` (the stored
  choice) instead of `resolvedTheme` — latent bug: `resolvedTheme` is always
  light/dark, so a user who explicitly picked System saw Light/Dark
  highlighted. (3) `suppressHydrationWarning` on `<html>` (README-mandated,
  one level deep — child mismatches still surface).
- **Verified in dev (Turbopack)**: /en + /ar × mobile 390×844 + desktop
  1280×800 × light + dark OS preference: 0 hydration console errors, 0 other
  console errors; after hydration System pressed in BOTH toggle instances
  (hidden desktop row + mobile row, fresh storage → defaultTheme); clicking
  Dark → `html.dark` + pressed state in both instances; choice persists after
  reload; explicit System pick on a light OS highlights System (old code:
  Light). `pnpm typecheck` ✓ · `pnpm lint` ✓.

## Acceptance

- Every page usable in en, ar, tr (no missing keys → no `[[key]]` shown);
  Arabic renders fully RTL with no mirrored/overlapping controls.
- Theme toggle persists across reload and login state; both themes pass contrast
  checks on text; no component shows unstyled in dark mode.
