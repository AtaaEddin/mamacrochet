import {
  CatalogCategories,
  CatalogProduct,
  CatalogProducts,
  type CategoryDto,
  type ProductDto,
  type ProductPage,
} from "@/lib/api/generated-client";
import { escapeOData } from "@/lib/api/odata";

/**
 * Public catalog query helpers (plan 04, D19) through the generated
 * per-operation SDK (plan 20261003-1303): the list passes typed
 * `$top/$skip/$filter/$orderby` query args. Public (no cookies/CSRF needed
 * for the API — the shared transport still sends the same-site auth cookie,
 * which the public endpoints ignore).
 *
 * Browser-only.
 */

export type { CategoryDto, ProductDto, ProductPage };
export type { ApiError } from "@/lib/api/generated-client";

export interface CatalogQuery {
  /** Filter to one category (its id), or `null` for all. */
  categoryId?: string | null;
  /** Case-insensitive title substring (OData `contains`). */
  titleSearch?: string | null;
  /** 1-based page number. */
  page?: number;
  /** Page size ($top). */
  pageSize?: number;
}

/** Build the typed OData query args for the catalog products list. */
export function buildProductsQuery(opts: CatalogQuery = {}) {
  const pageSize = Math.max(1, Math.min(96, opts.pageSize ?? 12));
  const page = Math.max(1, opts.page ?? 1);

  const clauses: string[] = [];
  if (opts.categoryId) clauses.push(`category eq '${opts.categoryId}'`);
  const q = opts.titleSearch?.trim();
  if (q) clauses.push(`contains(title, '${escapeOData(q)}')`);

  // OData v4.01 infix `and` (the D19 subset — `and(a, b)` is the OData v3
  // convention and the parser rejects it).
  let filter: string | undefined;
  const first = clauses[0];
  if (first !== undefined) {
    const second = clauses[1];
    filter = second !== undefined ? `${first} and ${second}` : first;
  }

  return {
    $top: pageSize,
    $skip: (page - 1) * pageSize,
    $orderby: "createdAt desc",
    ...(filter !== undefined ? { $filter: filter } : {}),
  };
}

async function getJson<T>(
  run: (signal?: AbortSignal) => Promise<{ data?: T; error?: unknown }>,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const res = await run(signal);
    if (res.error) return null;
    return res.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchCatalogProducts(
  opts: CatalogQuery = {},
  signal?: AbortSignal,
): Promise<ProductPage | null> {
  return getJson(
    (sig) => CatalogProducts.list({ query: buildProductsQuery(opts), signal: sig }),
    signal,
  );
}

export async function fetchCatalogProduct(
  id: string,
  signal?: AbortSignal,
): Promise<ProductDto | null> {
  return getJson((sig) => CatalogProduct.get({ path: { id }, signal: sig }), signal);
}

export async function fetchCatalogCategories(
  signal?: AbortSignal,
): Promise<CategoryDto[] | null> {
  return getJson((sig) => CatalogCategories.list({ signal: sig }), signal);
}
