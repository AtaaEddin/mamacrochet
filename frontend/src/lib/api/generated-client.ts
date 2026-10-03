/**
 * The app's public SDK surface (plan 20261003-1303, sub-plans 02+03).
 *
 * The tree in `./generated/` is emitted by `@hey-api/openapi-ts` from the
 * committed spec (`pnpm gen:api`) — never edit it by hand. This module is
 * the only hand-written part of the generated client:
 *
 * 1. It imports `./client` for its side effect — that installs the app
 *    transport (base URL + cookie/CSRF `browserFetch`) on the generated
 *    client instance before any SDK method runs. (The import must come
 *    first: `./client` imports the SDK values directly from `./generated`,
 *    so the graph stays one-directional and there is no TDZ.)
 * 2. It re-exports the SDK surface. The generator groups operations by tag,
 *    but colliding tags (e.g. two `Orders` tags for admin vs staff) get
 *    numeric suffixes (`Orders3`, `Orders4`) that are useless at call sites,
 *    so the leaf operation classes are also exported under stable,
 *    tag-derived names. If a regeneration renames a class (a tag change on
 *    the API side), the alias fails to compile — deliberate, so the API
 *    surface change is noticed here, in one place.
 *
 * Browser-only: the installed transport sends auth cookies + CSRF headers.
 * Server components must not import this module — use
 * `lib/catalog/server.ts` (its own plain client) instead.
 */
import "./client";

// Leaf operation classes under stable, tag-derived names (the generator's
// tag-aggregator classes — `Admin`, `Admin2`, ... — are intentionally NOT
// re-exported here; use the leaf aliases instead).
export { Antiforgery } from "./generated";
export { Avatar } from "./generated";
export { Categories as CatalogCategories } from "./generated";
export { Product as CatalogProduct } from "./generated";
export { Products as CatalogProducts } from "./generated";
export { Chat } from "./generated";
export { Files } from "./generated";
export { HanadicrochetApi as Health } from "./generated";
export { Hiring } from "./generated";
export { Hiring2 as AdminHiring } from "./generated";
export { Identity } from "./generated";
export { Me } from "./generated";
export { Orders } from "./generated";
export { Orders3 as AdminOrders } from "./generated";
export { Orders4 as StaffOrders } from "./generated";
export { Staff } from "./generated";
export { Users as AdminUsers } from "./generated";
export { Categories2 as StaffCategories } from "./generated";
export { Product2 as StaffProduct } from "./generated";
export { ProductImages as StaffProductImages } from "./generated";
export { Products2 as StaffProducts } from "./generated";

// Everything else (types, Options, the remaining classes, the client
// instance): explicit exports above win, the star adds the rest.
export * from "./generated";
