# Home "See all works" button + made-to-order CTA fix

status: done
created: 2026-10-03 16:02 (+03)
owner: agent (requested by owner 2026-10-03)

## Why (owner asks, 2026-10-03)

1. The home's "See all works" is only a small text link in the section
   header — owner: "I don't think the initial customers' eyes will catch it
   the first time." It needs to be a real, visible button at the bottom of
   the featured products grid.
2. Product page + in-chat product actions offer stock-0 (made-to-order)
   pieces as *request custom* only. Owner: "what if the customer wants the
   same product vs requesting custom?" — the common intent for a listed
   made-to-order piece is *exactly this piece, made for me*, which contradicts
   plan 04's own decision: "Stock = 0 catalog items are made to order …
   ordering them never decrements below 0."

## Scope (frontend only — no API changes)

1. **Home: "See all works" button below the featured grid** (`featured-works.tsx`):
   centered pill button (outline variant, `rounded-full`, h-11 = 44px tap
   target, ArrowRight icon flipped in RTL, reuses `Works.seeAll`). The small
   text link in the section header stays (desktop quick access).
2. **Product detail page** (`works/[id]/page.tsx`): CTA label is always
   "Order in chat" — stock state is already conveyed by the
   "In stock" / "Made to order" badge right above the price. Remove the
   `Works.cta.requestCustom` key (en/ar/tr).
3. **In-chat product actions** (`order-product-actions.tsx`): unify — both
   in-stock and made-to-order product bubbles get the same pair:
   "Order this" (kind=catalog) + "Similar, customized" (kind=custom,
   work as reference, spec prefilled). Remove the
   `Orders.create.requestCustom` key (en/ar/tr).
4. Backend: verified no change needed — order creation accepts
   `kind=catalog` for any *listed* product (no stock check), stock-0
   decrements never go below 0 (plan 04).
5. **AR mobile header overflow (found by this plan's AR verification)**:
   at 390px, RTL row 1 (logo + "تسجيل الدخول" + "لنتحدث") needs ~378px but
   only has 358px → 5px document overflow on every page (pre-existing;
   EN fits exactly). Fix: header row 1 `gap-3`→`gap-2`, guest sign-in pill
   `px-4`→`px-3`, chat CTA `px-5`→`px-4` (−20px; 44px heights unchanged).

Out of scope: reworking the CustomOffer block, staff/admin surfaces,
`/request-custom` page (already supports the reference picker).

## Decisions

- **Real button, not text link** (owner's point, confirmed): the bottom
  catch-all is the end-of-section affordance first-time customers reach
  after browsing; a text link reads as decoration. A pill button is visible
  without standing out.
  Sources (web, 2026-10-03):
  - NN/g — UX Guidelines for Ecommerce Homepages: https://www.nngroup.com/articles/ecommerce-homepages-listing-pages/
  - Baymard — Product Listing Page (PLP) UX: https://baymard.com/blog/product-listing-page-plp-ux
  - D2C "View All →" catch-all at the bottom of a product group: https://www.customfit.ai/blog/d2c-ecommerce/ecommerce-mega-menu-design
- **Outline, not filled**: home has exactly one primary action — the
  CustomOffer "chat" CTA (11-visual-identity: one primary per screen).
  Outline pill keeps "see all" one step below, matching the brand's pill
  CTAs (`rounded-full`).
- **"Order this" on a stock-0 piece = kind=catalog order of the exact
  piece** (the made-to-order flow). "Similar, customized" stays
  kind=custom (reference + spec). This restores plan 04's intent;
  plan 05's "out-of-stock → request this as custom" is superseded for the
  in-chat actions (the product-page deep link `/chat?work=` is unchanged).
- **Header overflow fix = spacing only** (no copy, no layout change): the
  AR strings are correct; the row was simply 20px too full. Padding/gap
  trims are the smallest change that keeps both locales inside 358px.

## Definition of done

1. `pnpm typecheck` · `pnpm lint` · `pnpm build` green.
2. Browser: mobile + desktop, light + dark, en + ar (RTL): home button
   below the grid, product page CTA (in-stock and made-to-order), in-chat
   product bubble actions for both states.
3. Plan status → done; COMMITS.md appended; clean commits.

## Verification (2026-10-03)

- `pnpm typecheck` · `pnpm lint` · `pnpm build` green.
- `scripts/verify-see-all-mto-cta.mjs` → **26 passed, 0 failed** (playwright-core
  vs system Chromium; screenshots in /tmp/hanadicrochet-shots).
- Verified in an isolated `git worktree` at HEAD + this plan's changes, served
  on :3100 through a dev-only CORS passthrough proxy (:8086 → API :8085):
  the main checkout was mid-migration by plan 20261003-1303 sub 03
  (in-progress, uncommitted) and its build was red; this plan's state must
  not depend on that workstream.
- Harness notes (harness bugs, not product bugs):
  - `POST /chat/visitor` is rate-limited per client IP (5/60 s, D16 step 1);
    every test context shares 127.0.0.1 → the suite keeps the AR chat
    bootstrap ≥75 s after the last EN chat check.
  - A cold first chat mount can lose the deep-link send to the dev
    StrictMode teardown race → the script retries the mto chat once in the
    same context; C4/C5 require two product bubbles (in-stock deep link
    sends its own message in the same guest thread).
