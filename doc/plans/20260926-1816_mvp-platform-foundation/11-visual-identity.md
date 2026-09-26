# 11 — Visual Identity & Design Language

status: done
parent: main.md

## Goal

One coherent brand feel on every screen: **feminine, soft (“fluffy”), cozy, and
happy** — the feeling of “entering a store full of cute dolls”, ambient and inviting.
The design keeps the flow effortless (guest-first, D14) and respects accessibility +
the low-power deployment target.

## Direction

- Mood: warm, soft, playful, reassuring — never harsh, never “corporate SaaS”.
- The **floating chat widget is part of the brand**: friendly opener, a cute mascot
  avatar (simple & cute — e.g. a soft bunny or a yarn ball; final art decided at
  implementation), inviting copy (“Hi! 👋 Ask me anything”).
- Ambient, not distracting: subtle pastel washes/textures, gentle motion, illustrated
  cozy empty states, brief delightful success moments (e.g. soft confetti on
  “order created”).

## Design tokens (built on shadcn/ui OKLCH tokens)

- Palette (light): warm cream backgrounds; soft rose/coral primary; secondary pastels
  (lavender, sage, butter) for accents; deep warm brown-plum for text.
- Palette (dark): deep plum/charcoal backgrounds (not pure black); muted pastels for
  accents; warm off-white text — same mood, calmer.
- **WCAG AA contrast is mandatory** in both themes: pastels fail if used carelessly —
  test text on every surface; deeper shades for text, pastels for fills/decoration.
- Shape: generous radii (rounded-xl → rounded-3xl), soft low-opacity shadows, pill
  primary CTAs.
- Type: friendly rounded display font (headings) + highly readable body font,
  **both self-hosted via next/font**, both with good Arabic coverage. Evaluate at
  implementation (search online per plan rule): Latin — Quicksand / Baloo 2 / Nunito;
  Arabic — Baloo Bhaijaan 2 / Cairo / Tajawal. Keep ≤ 2 families, few weights.
- Motion: gentle springs + fades (200–400 ms), scale on press, slide-up sheets on
  mobile; honor `prefers-reduced-motion` (disable all motion).
- Illustrations: hand-drawn-style crochet motifs (yarn, hooks, flowers, hearts,
  bunnies), one consistent line style; small SVGs (≤ ~50 KB each); no video/3D/Lottie.

## Copy tone

- Warm, friendly, second person; feminine brand voice (“we'll make it just for you”).
- Same warmth in Arabic — natural Arabic, not word-for-word translation.
- Microcopy for every state: loading (soft), empty (inviting), error (reassuring),
  success (celebratory but brief).

## Guardrails (do not violate)

- Low-power target: decorative assets are small and cached; no continuous animation;
  no video/3D/WebGL; first-load decorative budget ≈ ≤ 100 KB.
- RTL: everything mirrors correctly; verify chat bubbles, sheets, and the widget in ar.
- Accessibility: AA contrast, focus-visible styles, keyboard paths, reduced-motion.
- Tokens only: components reference semantic tokens — no arbitrary hex in components.
- Decoration never blocks content or competes with the primary action.

## Decisions (verified 2026-09-26)

- **Fonts (2 families, both cover ar + latin + latin-ext ⇒ en/ar/tr all covered)**:
  - Display/headings: **Baloo Bhaijaan 2** (Ek Type; weights 500/700/800) — round, soft,
    friendly; the “fluffy” face of the brand.
  - Body/UI: **Cairo** (weights 400/500/700) — highly readable, modern, the de-facto
    standard for professional Arabic UI.
  - Verified via the Google Fonts CSS API (`fonts.googleapis.com/css2`) subset lists:
    Baloo Bhaijaan 2 = arabic, latin, latin-ext, vietnamese; Cairo = arabic, latin,
    latin-ext (+cyrillic). Rejected: Nunito & Quicksand (no Arabic), Tajawal (no
    latin-ext ⇒ Turkish ı/ğ/ş would fall back). Both SIL OFL. Self-hosted at build
    time via `next/font/google` (no runtime CDN — low-power friendly).
  - Sources: fonts.google.com/specimen/Baloo+Bhaijaan+2, fonts.google.com/specimen/Cairo,
    rawad.io/en/blog/web-accessibility-arabic-sites (Arabic font choice),
    aivensoft.com/en/blog/rtl-design-arabic-websites (Cairo for Arabic UI).
- **Motion: pure CSS, no animation library** (no framer-motion): keyframes + Tailwind v4
  `--animate-*` tokens (fade/rise/pop/float, 200–450 ms, gentle spring bezier), global
  `prefers-reduced-motion` kill-switch. Keeps client JS lean (low-power target).
- **Pastel professionalism**: high-lightness hues only work with structural contrast —
  deep warm brown-plum text (not black), muted pastels for fills, one confident coral-rose
  primary. Reference studies: colorarchive.org/guides/pastel-color-palette (structural
  contrast), shadcn.io/theme/marshmallow (calibrated pastels, AA-checked).
- **Contrast is measured, not eyeballed**: `frontend/scripts/contrast.mjs` parses the
  token blocks from `globals.css`, converts OKLCH→sRGB, and fails (exit 1) when any
  text/surface pair misses WCAG AA (4.5:1). Run it on every token change.
- **Mascot**: soft bunny (crochet vibe, yarn companion) — hand-drawn-style inline SVGs,
  single stroke color (deep plum `--color-brand-ink`) + pastel fills via brand tokens.
  No raster assets in the brand kit (SVG only, ≤ ~50 KB each).
- **Home page is a real brand surface, not a scaffold demo** (owner, 2026-09-26):
  professional copy + typography hierarchy (display 56–72 px hero → 16–18 px body),
  one value proposition above the fold, one primary action (chat, guest-first D14),
  value props, “how it works”, shop “coming soon” teaser, footer. No dev-facing text.

## Deliverables / tasks

- [x] Brand mini-guide: `doc/references/brand.md` (mood, palette, type, shape, motion, voice)
- [x] Tokens implemented in the shadcn theme (light + dark) — `frontend/src/app/globals.css`
- [x] Chat widget brand treatment (mascot, opener, panel styling) — `chat-widget.tsx`
      (messaging itself ships with plan 06; the brand surface is final)
- [x] Illustration set v1 — `src/components/illustrations/`: bunny mark, hero
      mascot + yarn, empty shelf (coming-soon/empty state), 404 lost scene,
      confetti hearts (success), yarn loader
- [ ] RTL + dark + mobile visual pass per feature (part of each feature's DoD)

## Result (2026-09-26)

- Brand surface shipped on the home page: hero (mascot, ambient pastel wash,
  display type), value props, how-it-works, shop coming-soon teaser, footer,
  floating chat widget with bunny mascot + opener, 404 page.
- All 20 token text/surface pairs pass WCAG AA in both themes
  (`frontend/scripts/contrast.mjs`); rendered-pixel + layout QA passes
  (`frontend/scripts/visual-qa.mjs`, production build).
- First load: HTML 72 KB + initial latin fonts 134 KB + JS 658 KB (static,
  cacheable); decorative raster = 0 (inline SVG only).

## Acceptance

- The site reads as “cute / soft / cozy” on first visit (owner's gut check).
- Both themes pass contrast checks; RTL is clean in ar; decorative first-load budget
  respected on a mid-range phone.
