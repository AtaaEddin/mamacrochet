---
name: ui-design
description: mamacrochet UI design rules — brand (feminine, soft, fluffy, joyful), shadcn/ui + Tailwind v4 tokens, mobile-first, light/dark, Arabic RTL, accessibility. Use when designing or building any screen, component, or visual change in frontend/.
---

# UI Design (mamacrochet)

Full brand spec: `doc/plans/20260926-1816_mvp-platform-foundation/11-visual-identity.md`.

## Brand

Feminine, soft, “fluffy”, cozy, joyful — like entering a store full of cute dolls.

- Warm pastel palette on cream (light) / deep plum (dark) — shadcn OKLCH tokens.
  Rose/coral primary; pastels for accents and fills, **deeper shades for text**.
- Rounded everything (xl→3xl), pill primary CTAs, soft low-opacity shadows.
- Gentle motion only (200–400 ms springs/fades, scale on press, slide-up sheets);
  honor `prefers-reduced-motion`.
- Cute illustrated empty states (crochet motifs); brief, soft success moments.
- Copy: warm, friendly, feminine voice — same natural warmth in Arabic.
- Decoration is the brand: tasteful and cheap — small SVGs (≤ ~50 KB each),
  no video/3D, nothing continuous, ≤ ~100 KB decorative on first load.

## Hard rules

- shadcn/ui components + **semantic tokens only** — no arbitrary hex in components.
  (For any new shadcn component, follow the `shadcn` skill: run
  `pnpm dlx shadcn@latest docs <component>` first.)
- Mobile-first: design the small phone first (bottom navigation, sheets,
  touch targets ≥ 44 px); desktop is an enlargement, not a shrunken page.
- Light + dark parity on every screen.
- Arabic RTL: logical properties (`ps/pe/ms/me/start/end`), verify chat bubbles,
  sheets, and the chat widget are mirrored correctly.
- WCAG AA: contrast on every text/surface combination (pastels fail if careless —
  test), visible focus, full keyboard paths, accessible names, never color-only state.
- Hierarchy: exactly one primary action per screen; generous whitespace; no nested
  cards; decoration never blocks content.

## Verify before done

1. Mobile viewport + desktop.
2. Light + dark.
3. English + Arabic (RTL).
4. Keyboard-only pass over the screen.
