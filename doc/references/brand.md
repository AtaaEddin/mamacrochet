# mamacrochet — Brand Mini-Guide

Status: **v2** (2026-09-26, owner-directed pivot — plan
`20260926-2309_mama-identity-chat-first-home`). Supersedes the v1
palette/mascot (warm cream + rose, rabbit) from plan 11.
Implementation: `frontend/src/app/globals.css` (tokens),
`frontend/src/components/illustrations/` (art). **Components must
reference semantic tokens only — no raw hex/oklch in components.**

## Mood

A warm, traditional **Turkish / old-World-Arabic** home: sand-colored
walls, pomegranate red, Iznik turquoise and brass gold used with
restraint ("focused applications, not wall-to-wall" — the saturation
rule from Arabian interior design). Feminine, cozy, grandmotherly.
Research: Iznik pottery palette (Wikipedia / ku crees), Istanbul palette
(colorarchive), Ottoman + Arabian interior guides (genroom,
reslisdence) — links in the plan file. (Owner also floated a Russian
headscarf + Russian colors variant — a future token set, not built.)

## The mascot — Mama

A warm grandmother in a **headscarf that only wraps and binds her hair** —
face and neck fully visible. Explicitly **not a hijab** and not the
neck-covering başörtüsü: the classic European working-women's hair scarf
of the early 1900s, as worn by many Turkish/Arabic grandmothers.
Pomegranate scarf with a turquoise-flower pattern, knot at the side of
the head, gold earrings, rosy cheeks, happy closed eyes, warm smile.
SVG (flat, 2–2.4 ink outlines, token fills): `mama-pieces.tsx` (raw
pieces), `mama-mark.tsx` (logo/avatar on gold tile), `mama-scene.tsx`
(bust). Replaces the rabbit everywhere: logo, chat avatar, 404, empty
states.

## Palette (OKLCH, in globals.css)

### Light — warm sand + Iznik

| Token            | Value                       | Use                        |
|------------------|-----------------------------|----------------------------|
| `--background`   | `oklch(0.976 0.013 85)`     | warm sand                  |
| `--foreground`   | `oklch(0.3 0.024 50)`       | deep espresso brown        |
| `--primary`      | `oklch(0.46 0.18 25)`       | deep Turkish (Iznik) red   |
| `--secondary`    | `oklch(0.45 0.07 195)`      | deep Iznik teal            |
| `--accent`       | `oklch(0.885 0.07 90)`      | soft gold                  |
| `--muted`        | `oklch(0.942 0.018 80)`     | deeper sand surfaces       |
| brand colors     | pomegranate / teal / gold / terracotta / olive | art, badges, chips |

### Dark — soft coffee night (not black, not scary)

Background `oklch(0.315 0.026 55)` (soft warm coffee — the first, deeper
pass at `0.28` with glowing cream outlines read as a scary mask; the
owner kept it light-theme-first and asked for a calmer night), card
`0.355`, text warm parchment `oklch(0.82 0.02 78)`, primary a softened
Turkish red with deep-brown text, muted teal + **deep brass** gold.
**Mama is muted in dark** (`--brand-mama-skin 0.55`, scarf `0.5`,
tile = deep brass `--brand-mama-tile`) so she stays warm, never
high-contrast.

**Contrast rule**: every text/surface pair passes WCAG AA 4.5:1 in both
themes — verified by `frontend/scripts/contrast.mjs` on every token
change. Brand colors are never text colors.

## Type (unchanged from v1)

- **Display**: Baloo Bhaijaan 2 (500/700/800) — headings, logo, numbers.
- **Body/UI**: Cairo (400/500/700). Both self-hosted via next/font;
  both cover Arabic + Latin + Latin-Ext (tr).
- `html[dir=rtl] body { line-height: 1.75 }` (ALREQ).

## Layout — chat is a destination (final, v3)

**Chat is the primary surface of this platform** — but it is its own
**page** (`/chat`), not a widget or a column on other pages. The header
chat CTA, the home custom-offer, and every work card (`/chat?work=<id>`) all lead there.

**Home** (calm, centered showcase — max-w-5xl, big side margins on
desktop; **no chat UI on home**, no how-it-works, no top nav menu):
header (logo + chat CTA; language/theme row on mobile) → thin intro bar
(one line about how ordering works + CTA) → **featured works**
(category filter chips, 3 cards + Show more, "See all works" → `/works`)
→ **custom-offer block** ("Didn't find your liking? … we can do custom
for you" → `/chat`).

**Chat page `/chat`** (ChatGPT-style, **full width & height**):
Mama avatar + plain-text messages, visitor bubbles, one rounded composer
with quick-topic chips. **Products live in the chat** — two entry points:
(a) **in-chat search**: the composer's search icon opens a picker over
the catalog; (b) **product rail**: the free space next to the thread is a
category-filtered list of works — **tap to add, or drag a card into the
thread** (drop target highlights). A picked work becomes a **product
message** (art, name, price, rating/orders) with expandable in-place
details ("what do you want to change? … it becomes your order").
Mobile: rail stacks under the composer; drag is optional (tap works).

**Works page `/works`** (D20): full catalog grid + category chips
(bags/dolls/small now; plan 04 brings categories/pagination) +
custom-offer CTA near where pagination sits. Cards → `/chat?work=<id>`.

**Order page (owner directive, built with plans 05/06)**: side list of
orders (rail) + a **full-width middle stage** where the user (customer or
employee) goes **back and forth between the chat and the order stages**
— the two views share the central screen via a toggle, not cramped
columns. Admin sees the same stage with the full trace. Mobile: same
two views + toggle, order list in a drawer.

**Employee main page (plan 06)**: ChatGPT-style workspace —
conversation rail (guests + orders) + ChatGPT thread + the order middle
stage. The thread UI is **identical to the customer's chat** — one
design for every role.

## Shape & motion (unchanged)

Radii base `0.875rem` (cards `rounded-3xl`), soft shadows, 1px
hairlines. Gentle CSS-only motion (fade/rise/pop/float, 200–500 ms);
`prefers-reduced-motion` kill-switch.

## Voice

Warm, feminine, second person — Mama's voice: "Hi, sweetheart! 👋".
Arabic is natural Arabic, not word-for-word. States get microcopy
(loading / empty / error / one-moment success).

## Sample works (until plan 04)

Six placeholder pieces (`src/lib/sample-works.ts`): sunflower tote, owl
bag, pumpkin friend, strawberry clip, little gold bird, tulip teacup —
illustrated in `work-art.tsx` (brand tokens). Plan 04 replaces them with
real products and the "most loved" selection query.

## Guardrails

- WCAG AA both themes; visible focus; keyboard paths; reduced-motion.
- RTL: logical properties only; verify chat panel, sheet, bubbles in `ar`.
- Low power: inline SVG only (0 KB raster on first load), no continuous
  heavy animation, static locales.
- One primary action per screen; decoration never out-shines it.
