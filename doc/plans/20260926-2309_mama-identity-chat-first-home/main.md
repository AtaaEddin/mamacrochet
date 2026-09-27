# Mama identity v2 + chat-first home

status: done
parent: none (standalone brand/UX revision, requested by owner 2026-09-26)
supersedes-part-of: 20260926-1816_mvp-platform-foundation/11-visual-identity.md

## Owner feedback (2026-09-26, verbatim intent)

- **No rabbit.** Mascot = a woman with a **traditional headscarf that only
  binds the hair** — face AND neck/shoulders fully visible ("not a hijab",
  "not the neck-covering Turkish style", "like the European scarf women wore
  outside back in WW1"). Classic Turkish/Arabic *anneanne* (grandma) look.
- **Site color**: traditional **Turkish / old-World-Arabic** effect
  (owner also floated a Russian headscarf + Russian colors variant —
  documented as an alternative, not built).
- **Home layout**: a **very thin bar about order placement** first, then
  **immediately the works made so far** — most-ordered / high-rated only,
  **not all products**, with a **"show more"-style button**.
- **Chat is the core surface**: "relatively big chat UI instead of on the
  side" — chat always a **big section** alongside content: home, product
  picking, order page, and for **employees/admins** ("I always care about
  the chat that happened with the customer").

## Research (done 2026-09-26, recorded per AGENTS.md)

- Iznik ceramics: cobalt blue, turquoise, red (post-1555), green — the
  classic Ottoman palette:
  https://en.wikipedia.org/wiki/Iznik_pottery · https://crees.ku.edu/iznik
- Istanbul palette: "Iznik tile blue, Bosphorus turquoise, Turkish/tomato
  red" (colorarchive): https://colorarchive.org/regions/turkey-istanbul/
- Ottoman interiors: "pomegranate red, deep teal, and gold" cushions on
  warm neutrals, walnut wood, kilim rust/indigo/saffron/ivory:
  https://genroom.io/design/ottoman
- Arabian/old-world base: "saffron, terracotta, indigo, burgundy, gold,
  built on warm whites and sand tones… high-saturation colors in focused
  applications, not wall-to-wall":
  https://reslisdence.com/arabian-interior-design/
- Headscarf reference: hair-only wrap (WWI-era European working-women
  scarf / bandana wrap), no neck coverage — per owner clarification
  (distinguished from hijab/başörtüsü styles:
  https://www.halaltimes.com/differentiating-the-hijab-from-the-headscarf/)

## Decisions (final state as shipped)

1. **Mascot**: "Mama" — warm grandmother face, hair wrapped in a
   patterned scarf (pomegranate red + small turquoise flowers, side
   knot), **face AND neck/shoulders fully visible** (a hair scarf / bonnet
   look, explicitly NOT a hijab), rosy cheeks, gold earrings, small
   laugh lines. SVG, flat outline style, token-driven. Replaces the
   rabbit everywhere (logo mark, chat avatar, 404, empty states).
   Russian-variant palette noted as future token set (researched, not
   built).
2. **Palette v2** (light): warm sand background, deep espresso-brown
   text, primary = deep Turkish (Iznik) red, secondary = Iznik teal,
   accent = gold (focused accents on sand, never wall-to-wall — research
   rule). **Dark**: soft warm coffee-brown night (not black); Mama is
   **muted** in dark (deeper skin, muted scarf, deep-brass tile, warm
   parchment ink) — the first dark pass was too high-contrast and read
   as a scary mask (owner feedback). All pairs AA-checked via
   `scripts/contrast.mjs` (20/20).
3. **Home v3** (owner 2026-09-26, final): header (logo + chat CTA,
   **no nav menu** — the old "How it works"/"Shop" links are gone) →
   thin intro bar → **featured works** (category filter chips +
   "See all works" → `/works`, 3 cards + Show more) → **custom-offer
   block** ("Didn't find your liking? … we can do custom for you" →
   `/chat`). **No chat UI on the home page**, no how-it-works section.
   Home stays a calm, centered showcase (max-w-5xl) — the chat is its
   own destination.
4. **Chat as a destination** — `/chat`: ChatGPT-style thread (Mama
   avatar + plain text, visitor bubbles, single rounded composer),
   **full page width** (not a home-style centered column). Two ways to
   bring a product into the conversation (both required by owner):
   (a) **in-chat search** — search icon in the composer opens a picker
   over the catalog; (b) **product rail** — the free space next to the
   thread is a filterable list of existing works; **tap to add or
   drag-and-drop a card into the thread**. A picked work becomes a
   **product message** (art, name, price, rating/orders) with expandable
   in-place details — the visitor never leaves the chat. Deep link
   `/chat?work=<id>` seeds the thread (every work card links there).
   Local echo now; SignalR + real threads in plan 06, real catalog in
   plan 04.
5. **Works list page** — `/works`: full catalog grid (sample data),
   category filter chips (bags/dolls/small now; category data model in
   plan 04), cards → `/chat?work=<id>`, custom-offer CTA at the bottom
   near where pagination will sit. Built category/pagination-ready.
6. **Smart search** (D19, for plan 04's real catalog): expose an
   **OData-compatible query layer via an allowlist** — hand-rolled
   query-spec/param binder first (allowlisted fields, eq/gt/lt/contains,
   sort, paging); adopt a real OData endpoint
   (`Microsoft.AspNetCore.OData` / ODataQuery) only if needs outgrow it.
   Rationale: single low-power machine, no EDM overhead, allowlist keeps
   OData's RBAC security caveat manageable, frontend is ours.
7. **Order page** (D22, for plans 05/06): orders rail (side list) +
   **full-width middle stage** where the customer toggles **chat ⇄ order
   stages** with no page change (status timeline, receipt, delivery).
   Admin sees the same stage + full trace.
8. **Employee main page** (D23, for plan 06): ChatGPT-style workspace —
   conversation rail + ChatGPT thread + the order middle stage; the
   thread UI is identical to the customer's chat (one design, every
   role).
9. **Sample works** (6, placeholder until plan 04 ships real products):
   sunflower tote, pumpkin friend, owl bag, strawberry clip, little
   bird, teacup set — USD price, rating, order count (selection
   signal). Clearly labeled in code + this plan.
10. Motion/radii/accessibility rules from plan 11 unchanged (AA
    contrast, reduced-motion kill-switch, logical props, ≥44 px
    targets, inline SVG only).

## Tasks

- [x] Plan file + research record (this file)
- [x] Palette v2 in globals.css (light+dark+brand+mama tokens) + contrast pass
- [x] Mama illustrations (mark, bust, scene) + 6 work arts; rabbit files removed
- [x] Intro bar + featured works (category chips + see-all + show more) + sample data
- [x] Chat page `/chat` (ChatGPT-style, full width, product rail +
      drag-and-drop + in-chat search picker, product messages, ?work=)
- [x] Works page `/works` (catalog + categories + custom offer)
- [x] Header/logo/404/empty on new mascot; home v3 (no chat, no nav menu)
- [x] Messages en/ar/tr (ChatPanel/CustomOffer/Works; Hero/Values/Shop/
      HowItWorks/Widget removed)
- [x] QA suites + screenshots (38 checks, 15 scenarios) incl. chat & works pages
- [x] brand.md v2 (final), plans 04/05/06 notes, parent main.md (D19–D23)
- [x] Verify (typecheck/lint/build + contrast + QA + screenshots); status → done
