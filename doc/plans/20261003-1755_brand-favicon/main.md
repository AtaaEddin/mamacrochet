# Brand favicon + static logo/bust images

status: done
created: 2026-10-03 17:55 (+03)
owner: agent (requested by owner: "also update the fav icon please")

## Why

`src/app/favicon.ico` is still the default Next.js black placeholder
(145 KB, zero brand colors). The brand mark (Hanadi face) is rendered all
over the UI as a theme-aware React SVG component, so its colors change
between light/dark themes.

Owner decisions (2026-10-03, in order):
1. "I think we need the logo to be as image or something, because when the
   theme changes, I don't like the changing colors of the logo." → the logo
   is brand identity: fixed colors in light AND dark themes.
2. The tile version renders as "a square with a face that is not
   centered" → "we need it to be without a background, the face, and in the
   middle." → the logo is the face only: no tile, transparent background,
   centered.
3. "please make sure the logo is symmetric" → mirror-symmetric art.
4. "the avatar of the logo face and the body at the bottom in the home page
   should also be an image" → the Hanadi bust (face + body) in the home
   CustomOffer (and the other places she appears) is a static image too.

## Scope

1. `public/brand/hanadi-mark.svg` — the logo: Hanadi face ONLY (scarf +
   flowers + earrings + face). No tile, no side knot/tail, transparent
   background, mirror-symmetric (mirror axis x=32), centered:
   - cheeks re-centered to cx 18/46 (source art had 14/42, off-axis),
   - nose made on-axis (source hook ended 0.5 off axis),
   - side knot/tail removed (the only large asymmetric element),
   - art bbox incl. strokes x 10..54, y 12.5..50.5 →
     `translate(-6.4 -5.8) scale(1.2)` (face ≈ 13px at a 16px tab).
2. `public/brand/hanadi-bust.svg` — the character bust (head + neck +
   shoulders, 96×96), transcribed AS-IS from `HanadiBust` (knot/tail kept —
   owner asked for symmetry on the logo only; the bust is the character
   view). Used wherever she appears.
3. `public/brand/icon-512.png` (512×512) + `public/brand/apple-icon.png`
   (180×180), rasterized from the logo SVG (headless Chromium screenshot).
4. Favicon registered via `icons` in `[locale]/layout.tsx`
   `generateMetadata` (SVG first, 512 PNG fallback, Apple touch icon).
5. All brand character render sites use the static images (next/image /
   SVG `<image>`), not the theme-aware components:
   - logo: site-header, site-footer, auth shell, join view, 3× chat-panel
     (8 sites) → `<Image src="/brand/hanadi-mark.svg">`;
   - bust: `home/custom-offer.tsx` → `<Image src="/brand/hanadi-bust.svg">`;
     `lost-scene.tsx` (404) + `empty-shelf.tsx` → `<image
     href="/brand/hanadi-bust.svg">` inside their scene SVGs (props stay
     theme-aware).
6. Delete: `src/app/favicon.ico` (default black square),
   `illustrations/hanadi-mark.tsx`, `illustrations/hanadi-scene.tsx`
   (both fully superseded). `hanadi-pieces.tsx` stays as the parameterized
   raw source of the brand art (its component wrappers are gone).

## Decisions

- **Logo colors are theme-fixed** (owner, 2026-10-03): a logo is identity —
  it keeps its colors in light and dark mode. The `dark` token block in
  `globals.css` re-mapped the brand vars, which is why the logo visibly
  changed; the static art has no variables at all.
- **Face only, no tile, centered** (owner, 2026-10-03): no square at all;
  the face (skin + coral scarf) carries the silhouette in both themes;
  every ink stroke lies on light fills, not on the page background, so it
  reads on light AND dark. Scale 1.2 keeps favicon-size presence.
- **Symmetric logo** (owner, 2026-10-03): mirror axis x=32. Verified by
  L10: 512px render compared pixel-by-pixel against its own mirror
  (≤0.2% of pixels may differ by >16/255). The bust is NOT symmetrized —
  it keeps the designed side knot/tail (character view, not requested).
- **Hex = browser-verified oklch() → sRGB conversions** of the
  light-theme tokens in `globals.css` (computed in Chromium, the same
  engine that renders the themed art, so static == themed-light pixels):
  skin `#d89c67`, blush `#fd9976`, scarf `#d13d45`, deep `#af2934`,
  flower `#8dd2d6`, gold `#e5bf6d`, ink `#3d2f28`, terracotta `#da915f`.
  (Supersedes earlier eyeballed approximations.)
- **One source of truth**: `public/brand/` holds the SVGs + PNGs; all
  `<Image>`/`<image>`/favicon links point at it. `hanadi-pieces.tsx`
  remains the parameterized art source (raw `<g>` pieces).
- **Bust everywhere she appears** (home CustomOffer, works list, 404,
  empty states) uses the same static image → the character never changes
  color between pages/themes; only her decorative props stay theme-aware.
- **Rasterize from the same SVG** (headless Chromium screenshot) so PNG and
  SVG are pixel-consistent; no new tooling.

Out of scope: OG image, Windows tiles, re-designing the character.

## Verification (scripts/verify-brand-favicon.mjs, isolated worktree)

- L1/L11/L11b home: header logo ~36px, bust ~128-160px, both render.
- L2 footer logo · L5 auth mark ~56px · L6 chat panel mark · L8 desktop.
- L3 favicon links (SVG + 512 PNG + apple) · L9 no /favicon.ico request.
- L4 light vs dark: header logo center crop pixel-identical (the
  transparent face areas show the theme background by design; the crop is
  the solid face core).
- L7 AR home renders.
- L10 logo mirror-symmetric (512px render vs its mirror).

## Definition of done

1. `pnpm typecheck` · `pnpm lint` · `pnpm build` green.
2. Browser suite L1–L11 green (isolated worktree; live tree belongs to the
   other active workstream).
3. Plan status → done; COMMITS.md appended; clean commit.
