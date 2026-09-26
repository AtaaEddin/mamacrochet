# 11 — Visual Identity & Design Language

status: proposed
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

## Deliverables / tasks

- [ ] Brand mini-guide: `doc/references/brand.md` (mood, palette, type, shape, motion, voice)
- [ ] Tokens implemented in the shadcn theme (light + dark), wired during scaffold (02)
- [ ] Chat widget brand treatment (mascot, opener, panel styling)
- [ ] Illustration set v1: empty states, 404, success, loader
- [ ] RTL + dark + mobile visual pass per feature (part of each feature's DoD)

## Acceptance

- The site reads as “cute / soft / cozy” on first visit (owner's gut check).
- Both themes pass contrast checks; RTL is clean in ar; decorative first-load budget
  respected on a mid-range phone.
