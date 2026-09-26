# 04 — Products & Catalog

status: proposed
parent: main.md

## Goal

Product management (admin + employee) and a public, mobile-first catalog.

## Scope

- Product fields: title, description, category, images (multiple, ordered, cover),
  price (decimal + currency code, default USD — decision D11), stock units,
  visibility (shown/hidden), timestamps, created/edited by.
- Categories: localized names (en/ar/tr), ordering, visibility.
- Public catalog: browse all / by category, text search, product detail page,
  **in-stock / out-of-stock** badge.
- Out-of-stock product stays visible: CTA "Ask about this / request a custom one"
  → creates an order (kind=custom referencing the product) and opens chat (plans 05/06).
- Stock = 0 catalog items are **made to order** (we have no stock of our samples yet):
  ordering them never decrements below 0; they are produced per order.
- In-stock purchase: "Add to order" → simple order checkout (no gateway; payment details
  happen in chat afterwards — plan 07).
- Image uploads: multiple per product; server-side processing (ImageSharp: resize to
  max 1600px, webp/avif where supported, thumbnails); strict size/type limits (jpg, png,
  webp, avif; ~10 MB max per file).

## Decisions

- **Localized content**: product/category title+description stored as per-language rows
  (`ProductTranslation` per lang) instead of a single string. en is required, ar/tr optional
  (fallback: show en). Keeps plan 08 simple and matches the 3-language MVP.
- Image storage: local disk volume, deterministic paths by product id (plan 10 D8),
  served by the API; public for catalog images, **auth-protected** for receipts/samples (plan 07).
- Soft delete only (admin); hidden ≠ deleted.

## Tasks

- [ ] Entities + migrations: Product, ProductImage, Category, ProductTranslation
- [ ] API CRUD (Employee+Admin), visibility toggle, search/filter, image upload endpoints
- [ ] File pipeline: validation, resize/thumbnail, storage path scheme
- [ ] Frontend: admin/employee products pages (list, editor, image manager)
- [ ] Frontend: public catalog (home, category, search, product detail) mobile-first,
      stock badge, "request custom" CTA
- [ ] Seed: create categories + first sample products (stock 0) with the owner's photos

## Acceptance

- Employee can create a product with 5 images, hide/show it, edit price/units — mobile UI.
- Public catalog renders in all 3 languages (en fallback), fast on mobile, RTL in Arabic.
- Out-of-stock CTA creates an order and opens chat (integration with plan 05/06).
