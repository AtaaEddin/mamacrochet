# 08 — Localization (en/ar/tr) & Themes

status: proposed
parent: main.md

## Goal

Full trilingual support — English (default), Arabic (full RTL), Turkish — plus
light/dark theming across the whole app. Release 1 ships **en + ar complete**; tr
catalogs are scaffolded (translations best-effort / owner-supplied).

**Sequencing note**: the *foundation* (next-intl setup, dir/RTL handling, brand theme
tokens from plan 11) is built right after the scaffold (02) so every feature page is
i18n-ready from the start; whole-page translations are finished last (phase 7).

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

- [ ] next-intl setup: providers, routing/middleware language negotiation, catalogs
- [ ] Translate core UI strings (catalog, orders, chat, auth, admin) en/ar/tr
- [ ] RTL pass: dir handling, logical properties, component review (shadcn RTL support)
- [ ] Theme provider (system/light/dark) + toggle in header + token audit (no raw hex)
- [ ] Brand tokens: plan 11 palette/type/motion tokens into the shadcn theme (light+dark)
- [ ] (deferred — future email plan) email templates en/ar/tr
- [ ] Translation editor (admin/employee) for product/category content

## Acceptance

- Every page usable in en, ar, tr (no missing keys → no `[[key]]` shown);
  Arabic renders fully RTL with no mirrored/overlapping controls.
- Theme toggle persists across reload and login state; both themes pass contrast
  checks on text; no component shows unstyled in dark mode.
