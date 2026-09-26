# mamacrochet — Brand Mini-Guide

Status: v1 (phase 2, 2026-09-26). Source of truth for feel:
`doc/plans/20260926-1816_mvp-platform-foundation/11-visual-identity.md`.
Implementation lives in `frontend/src/app/globals.css` (tokens) and
`frontend/src/components/illustrations/` (art). **Components must reference
semantic tokens only — no raw hex/oklch in components.**

## Mood

Feminine, soft (“fluffy”), cozy, joyful — “entering a store full of cute
dolls”. Warm and reassuring, never harsh, never corporate. One confident
coral-rose primary carries the action; pastels are fills and decoration,
deep warm brown-plum carries the text. Structural contrast is what keeps
pastels professional (colorarchive.org pastel guide).

## Palette (OKLCH, in globals.css)

### Light — warm cream

| Token            | Value                      | Use                          |
|------------------|----------------------------|------------------------------|
| `--background`   | `oklch(0.985 0.007 85)`    | warm cream page              |
| `--foreground`   | `oklch(0.3 0.024 30)`      | deep warm brown-plum text    |
| `--primary`      | `oklch(0.53 0.19 25)`      | coral-rose (CTAs, steps)     |
| `--primary-fg`   | `oklch(0.985 0.004 85)`    | warm white on primary        |
| `--secondary`    | `oklch(0.947 0.03 90)`     | butter                       |
| `--accent`       | `oklch(0.94 0.035 300)`    | soft lavender                |
| `--muted`        | `oklch(0.955 0.014 80)`    | quiet surfaces               |
| brand pastels    | rose / butter / sage / lavender | icon chips, ambient washes, illustrations |

### Dark — deep plum (not black)

Background `oklch(0.3 0.028 330)`, card `0.345`, text warm off-white
`oklch(0.93 0.01 80)`, primary a brighter muted rose with deep-plum text,
pastels muted one step. Same mood, calmer.

**Contrast rule**: every text/surface pair must pass WCAG AA 4.5:1 in both
themes. Verified by `frontend/scripts/contrast.mjs` (run on every token
change). Brand pastels are never used as text colors.

## Type

- **Display** (headings, logo wordmark, numbers): **Baloo Bhaijaan 2**
  (500/700/800) — round, soft, friendly; covers Arabic + Latin + Latin-Ext.
- **Body/UI**: **Cairo** (400/500/700) — highly readable, professional
  Arabic + Latin + Latin-Ext.
- Both self-hosted at build time via `next/font/google` (no runtime CDN).
- Scale: hero display 40→60px, section titles 30→36px, body 16→18px.
- Arabic needs room: `html[dir=rtl] body { line-height: 1.75 }` (ALREQ).
- ≤ 2 families, few weights (plan 11 guardrail).

## Shape & space

- Radii from a generous base (`--radius: 0.875rem`): cards `rounded-3xl`,
  hero/shop frames `rounded-[2.5rem]`, pills for CTAs and switchers.
- Soft low-opacity shadows (`shadow-sm`/`shadow-lg`), 1px `border-border/60`
  hairlines — cards float gently, they never box.
- Mobile-first: single column, then 2–3 columns at `sm`/`md`.

## Motion

Gentle only (plan 11): `fade-in` 350ms, `rise` 500ms, `pop` 450ms spring
(cubic-bezier 0.34,1.56,0.64,1), `float` 5s ambient loop for the mascot and
yarn accents. Scale on press for CTAs. **`prefers-reduced-motion` disables
all of it** (global kill-switch in globals.css). No continuous animation
beyond the ambient float; no video/3D/Lottie.

## Mascot & illustrations

- **Mama's bunny** — round cream head, rose inner ears, blush cheeks, ink
  outline. Logo mark (face), hero scene (with yarn ball), 404 companion.
- Motifs: yarn ball + trailing thread, hearts, 4-point sparkles, price tag,
  shelf. One consistent hand-drawn style: `--brand-ink` outline (2–2.5),
  pastel fills from the brand tokens, nothing photographic.
- SVG only, inline in React components, each ≤ ~5 KB (budget: ≤ 50 KB,
  first-load decorative ≤ 100 KB — actual first-load raster = 0).
- All art is `aria-hidden` and theme-aware (fills/strokes switch with the
  brand tokens in dark mode).

## Voice

Warm, friendly, second person; feminine brand voice — “we'll make it just
for you”. States always get microcopy: soft loading, inviting empty,
reassuring error, brief celebratory success (confetti hearts, one moment).
Arabic is natural Arabic, not word-for-word (see `messages/ar.json`).

## Guardrails (do not violate)

- Low power: small cached assets, no continuous heavy animation.
- RTL: everything mirrors (logical properties only); verify chat bubbles,
  sheets, and the widget in `ar`.
- Accessibility: AA contrast, visible focus, keyboard paths, reduced-motion.
- Tokens only; decoration never blocks content or out-shines the primary
  action (one primary action per screen).
