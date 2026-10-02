# 04 — Products & Catalog

status: done
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
  max 1600px, WebP output, thumbnails); strict size/type limits (jpg, png, webp in;
  ~10 MB max per file; AVIF excluded in release 1 — see decisions).

## Decisions

- **Localized content**: product/category title+description stored as per-language rows
  (`ProductTranslation` per lang) instead of a single string. en is required, ar/tr optional
  (fallback: show en). Keeps plan 08 simple and matches the 3-language MVP.
- Image storage: local disk volume, deterministic paths by product id (plan 10 D8),
  served by the API; public for catalog images, **auth-protected** for receipts/samples (plan 07).
- Soft delete only (admin); hidden ≠ deleted.

### Implementation decisions (recorded 2026-09-27, web-verified)

- **Areas**: staff management under `/staff/*` (policy **Employee** — employees manage
  products too, plan scope) and public catalog under `/catalog/*`. The typed CSRF
  middleware gains `/staff` to its protected prefixes; `/catalog` is read-only GETs.
  `DELETE` of a product or category = **Admin only**.
- **Query layer (D19)**: hand-rolled OData-compatible binder, OData v4.01 parameter
  names (`$filter`, `$orderby`, `$top`, `$skip`). Supported subset: comparisons
  `eq ne lt le gt ge`, functions `contains/startswith/endswith`, logical `and or not`,
  parentheses, string/number/boolean/null/ISO-date literals; fields + operators per
  endpoint via an **allowlist** (unknown field/operator → 400 `invalid`). No EDM
  runtime. Reusable in plans 05/09.
  Sources: OData v4.01 Part 2 URL Conventions §5.1
  (docs.oasis-open.org/odata/odata/v4.01/...), learn.microsoft.com/en-us/odata/concepts/queryoptions-usage.
  - staff products filter: `id, categoryId, inStock, isListed, price, stockUnits, createdAt, title` (title = localized search).
  - public catalog filter: `category, inStock, title`.
  - order-by allowlist per endpoint; defaults: `-createdAt` (staff), `-createdAt` (public).
- **Image pipeline**: `SixLabors.ImageSharp` **3.1.12** (latest 3.x; .NET 8+ baseline →
  net10.0 OK). Inputs: **jpg, png, webp** (magic-byte validated, 10 MB max, 10 per request,
  ≤ 10 000 px sides). Output: normalized **WebP** — main ≤ 1600 px (q82) + thumbnail ≤ 480 px
  (q80). **AVIF is NOT accepted in release 1**: no built-in decoder/encoder in ImageSharp
  core (needs native third-party `HeyRed.ImageSharp.Heif`/libheif — against the low-power,
  4-container goal); WebP read+write IS built in. Owner uploads phone photos (jpg) / browser
  shots (png, webp) — no practical loss.
  Sources: nuget.org/packages/SixLabors.ImageSharp,
  sixlabors.com/posts/announcing-imagesharp-410, docs.sixlabors.com/articles/imagesharp/imageformats.
- **ImageSharp pinned to 3.1.12, NOT 4.1.2** (recorded 2026-09-28, verified by downloading
  both nupkgs and inspecting their MSBuild targets):
  - 4.1.2 ships a split license: the package embeds `SixLabors.ImageSharp.targets` with a
    `ValidateLicenseTask` that runs at **build time** and fails/warns unless a license key
    is provided — its "free" tier applies only to specific org types (non-profit, OSS
    product, transitive dependency, for-profit < $1M gross revenue). Our commercial posture
    is ambiguous (self-hosted store that may charge) and the repo is
    **warnings-as-errors**, so a Debug-time license warning is a build break.
  - 3.1.12 is plain **Apache-2.0** with no license-validation target, and has the same
    built-in WebP/JPEG/PNG support we need (3.x has no 4.x features we require: no AVIF/HEIC
    in either). Cost: the 3.x processing API is processor-based (`ApplyProcessor(new
    ResizeProcessor(...))`) instead of instance mutation — used via `ProductImages.cs`.
  Sources: nuget.org/packages/SixLabors.ImageSharp/4.1.2 (nupkg inspected:
  `tools/build/SixLabors.ImageSharp.targets` → `ValidateLicenseTask`),
  sixlabors.com/pricing (split-license terms), sixlabors.com/articles/imagesharp/license.
- **Storage paths** (deterministic, D8): `uploads/products/{productId}/{imageId}.webp` +
  `.thumb.webp`; served `GET /files/products/{productId}/{fileName}` (public,
  `Cache-Control: public, max-age=31536000, immutable`; names opaque-validated).
- **Cover image = first in the stored order** (no separate flag): reorder endpoint rewrites
  `SortOrder`; `CoverImage` in the DTO = `Images[0]`. Uploads append at the end; the first
  image of a product is auto-cover.
- **No slugs** — product detail is `/works/{id}` (id = 32-hex, URL-safe). Category filter
  param = category id.
- **Identity columns**: `Id` = 32-hex string (`Guid.ToString("N")`) on Category/Product/
  ProductImage; translation rows have composite keys `(ProductId|CategoryId, Language)`.
  Timestamps = `DateTime` (UTC). FKs: Product→Category **SetNull** (re-categorize or
  uncategorized when a category row vanishes), Product.CreatedById/UpdatedById→AppUser
  **SetNull**, translations/images **Cascade** from product.
- **Seeding**: idempotent `CatalogSeeder` after `Migrate()` in Program.cs (fixed GUIDs):
  4 categories (en/ar/tr names) + the 6 sample pieces the site already shows (stock 0,
  USD). **No images in the seed** — the owner's photos are not in the repo yet; they get
  uploaded from the staff image manager.
- **Catalog CTAs** (plans 05/06 not built yet): in-stock → "Ask in chat" and out-of-stock
  → "Ask about this / request a custom one" both deep-link **`/chat?work={id}`**
  (brand v2). Order creation (kind=custom referencing the product) + the in-chat product
  picker land with plans 05/06; the button targets are unchanged.
- **Frontend data**: Next 16 server components `fetch` the API directly (uncached by
  default in Next 16; the catalog is small + DB-indexed — no cache layer). File URLs are
  API paths; SSR resolves them against the request origin + `/api` base (prod, Caddy)
  or `NEXT_PUBLIC_API_URL` (dev, absolute). Staff pages gate on the signed-in user's
  roles (same pattern as plan 03's client).
- **Public catalog frontend** (recorded 2026-09-28): home featured works = async SSR
  server component (top-6 products + category chips as links into `/works?category=`);
  `/works` list = a `"use client"` component that owns the interactive fetching
  (category chips, debounced title search, "show more" pagination) so filtering/search/
  paging work without full reloads; product detail `/works/{id}` = async SSR server
  component (gallery is a client island). A unified `WorkDisplay` card model bridges
  real products and the sample fallback so the card never branches on the data source.
  Home degrades to `SAMPLE_WORKS` if the API is unreachable (decorative surface); the
  works list shows an error + retry instead (never fake data). Query-spec endpoints bind
  a single `[FromQuery] QuerySpec`, so the generated typed client types the query as
  `never` — the browser fetch builds `$top/$skip/$filter/$orderby` by hand and parses
  the typed JSON. Server components fetch the API directly with a 2.5 s hard timeout
  (returns `null` → fallback); prod SSR base = `API_SERVER_URL` (docker-compose), dev
  reuses the absolute `NEXT_PUBLIC_API_URL`.
- **Staff frontend** (recorded 2026-09-28): `/staff/products` is a thin server page
  rendering one `"use client"` `StaffProductsView` that gates on the signed-in user
  (`/identity/me` + `isStaff`) and routes between three modes — product **list**
  (debounced title search + category filter + listed-only switch + "load more"
  pagination, `$orderby=createdAt desc`), **editor** (create/edit form + image
  manager), and **categories** (inline CRUD). The editor remounts per product via a
  React `key` (fresh form per id); after create it keeps the editor open so the maker
  can add photos. The **image manager is parent-controlled**: it receives the
  `images` array and reports changes up (single source of truth in the editor) so
  upload/reorder/delete all reconcile against one list; cover = `images[0]`. Category
  select uses an explicit `__none__` sentinel (Base UI Select treats `value=""` as
  unselected). **Role gate**: `isAdmin = me.roles.includes("admin")` hides the
  destructive product/category delete buttons from employees (create/edit/reorder/
  visibility stay available). Destructive confirms use the plan-03 `AlertDialog`
  pattern (action button runs the async delete; dialog closes only on success).
- **Base UI (shadcn) primitives** (recorded 2026-09-28): the `Button` is
  `@base-ui/react/button` — **no `asChild`**; a button-styled link applies
  `buttonVariants(...)` to a `<Link>`. `Select` is controlled via `value` +
  `onValueChange(v, e)` (null-guard with `v && …`); `SelectValue` renders the chosen
  label. `Switch` is `checked` + `onCheckedChange(c) => c === true`. `AlertDialogAction`
  is a plain `Button` (does **not** auto-close); `AlertDialogCancel`/`Close` auto-close —
  so destructive deletes render `<AlertDialog open onOpenChange={o => !o && setConfirm(false)}>`
  and let success (parent unmount / navigate) close it.
- **Browser QA note** (recorded 2026-09-28): this environment's headless Chromium reads
  files injected by Playwright `setInputFiles` **by path** as size 0 (`arrayBuffer()`
  → `NotFoundError`), which aborts the multipart body (`net::ERR_ALPN_NEGOTIATION_FAILED`).
  Passing the file **buffer** to `setInputFiles` (`{name,mimeType,buffer}`) supplies real
  bytes and the upload works end-to-end. The app upload path is correct (in-memory `File`
  uploads and curl both succeed); the size-0 file is a test-harness artifact, not a bug.

- **Bug fix — product images 404** (recorded 2026-10-02, live-verified):
  `GET /files/products/{productId}/{fileName}` served nothing — `IsValidName` also
  required `fileName.StartsWith(productId)`, but per this plan's storage scheme the
  file name is `{imageId}.webp` (a different 32-hex), so the gate was always false and
  every image request 404'd (silent: the card falls back to the illustration). Ownership
  is enforced by the per-product directory (`{root}/products/{productId}/`) plus the
  opaque regex gates; the StartsWith condition was removed. Verified: restored QA images
  serve `200 image/webp` with bytes identical to disk; cross-product and traversal
  requests 404.
- **Staff entry point**: header gets a staff chip (employees see it, admins too) once
  plan 03's frontend lands — this plan ships `/staff/products` behind it.

## Tasks

- [x] Entities + migrations: Product, ProductImage, Category, ProductTranslation (+ CategoryTranslation) — `20260927210749_Catalog`
- [x] API CRUD (Employee+Admin), visibility toggle, search/filter ($filter/$orderby/$top/$skip), image upload endpoints — curl-verified end-to-end (staff login, CRUD, upload/reorder/delete, category CRUD, public query spec)
- [x] File pipeline: validation, resize/thumbnail, storage path scheme — verified on disk (WebP, ≤1600/≤480, no upscaling)
- [x] Frontend: staff products pages (list, editor, image manager, category CRUD) — verified in-browser (en, Arabic RTL, light+dark, mobile+desktop): anonymous sign-in gate, staff login, product list + search + category filter, create/edit product, image upload (cover badge), reorder (move up/down), image delete, admin-only product delete, category create/edit + admin-only category delete; employee (non-admin) sees the management UI with the admin-only delete buttons hidden
- [x] Frontend: public catalog (home featured, category chips, title search, product detail) mobile-first, stock badge, "request custom" CTA — verified in-browser (en/ar/tr, Arabic RTL, light+dark, mobile+desktop; search + category filter + detail navigation + made-to-order CTA) and in a prod `next build`
- [x] Seed: create categories + first sample products (stock 0) — photos: owner uploads from UI (not in repo) — verified via API (4 categories + 6 products)

### Framework findings (recorded 2026-09-28 — verified against .NET 10 / EF Core 10 sources & reflection)

- **EF Core 10 has no `EF.Functions.ILike` in the base assembly** — `ILike(DbFunctions,
  string, string[, escape])` is provided by the **Npgsql provider**
  (`NpgsqlDbFunctionsExtensions`). The binder builds the call via `LikeExpressions`.
  (Base assembly only has `Like` + `Random`.)
  Source: reflection probe over Microsoft.EntityFrameworkCore 10 + Npgsql.EntityFrameworkCore.PostgreSQL 10.
- **.NET 10 removed `MethodInfo.IsGeneric` / `IsGenericDefinition`** — use
  `GetGenericArguments().Length` for generic-method detection.
  Source: refactoring a reflection helper against net10.0 (CS0117).
- **C# 13 (net10 default) makes `and`/`or`/`not` contextual keywords** — pattern
  variables with those names break in expression positions (renamed in FilterParser).
- **`Enumerable.Any<TSource>(IEnumerable<TSource>, Predicate)`** must be built in
  expression trees with `Expression.Call(null, method, args)` (static extension) and the
  2-parameter overload selected explicitly, or EF picks `Any<TSource>(TSource[])`.
- **ImageSharp 3.x API**: processor-based (`ApplyProcessor(new ResizeProcessor(new
  ResizeOptions { Mode = ResizeMode.Max, Size = (N, N) }, image.Size))`); WebP encoder =
  `SixLabors.ImageSharp.Formats.Webp.WebpEncoder`.
- **Minimal-API multipart**: `IFormFile[]` binds `null` (unsupported shape); use
  **`IFormFileCollection`** for multi-file. Form endpoints carry anti-forgery metadata and
  require `app.UseAntiforgery()` in the pipeline (the built-in middleware sets the sentinel
  the framework checks; it validates tokens only on form endpoints — JSON mutations stay
  on the path-scoped plan-03 middleware).
  Source: aspnetcore/src/Antiforgery/src/AntiforgeryMiddleware.cs (main).
- **EF unique-index swap cycle**: reordering under `UNIQUE(ProductId, SortOrder)` throws
  `circular dependency` on a direct swap — fixed with two-phase save (shift all keys off,
  then apply target order).
- **EF untracked navigation trap**: replacing a translation collection on an entity loaded
  **without** `.Include(n => n.Translations)` leaves old DB rows untracked → Clear()+Add()
  becomes a bare INSERT on the composite PK → `23505 duplicate key`. All product/category
  loads now include `Translations` (and `Category.Translations` via `ThenInclude`).
- **Query-spec `SortField` concept**: a field can be registered sort-only (accepted by
  `$orderby`, rejected in `$filter` with `Field 'x' cannot be filtered.`) — used for
  `createdAt` on the public catalog.

## Acceptance

- Employee can create a product with 5 images, hide/show it, edit price/units — mobile UI.
- Public catalog renders in all 3 languages (en fallback), fast on mobile, RTL in Arabic.
- Out-of-stock CTA creates an order and opens chat (integration with plan 05/06).
