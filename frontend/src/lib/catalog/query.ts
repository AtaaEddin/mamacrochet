import type { components } from "@/lib/api/schema";

/**
 * Public catalog query helpers (plan 04, D19) — browser fetch against the
 * API's OData-style endpoints.
 *
 * The endpoints bind a single `[FromQuery] QuerySpec`, so the generated
 * typed client types the query as `never`. We build the query string by hand
 * and parse the JSON body ourselves (still fully typed via the OpenAPI
 * component types). These are public (no cookies/CSRF needed).
 *
 * Browser-only.
 */

export type ProductPage = components["schemas"]["ProductPage"];
export type ProductDto = components["schemas"]["ProductDto"];
export type CategoryDto = components["schemas"]["CategoryDto"];
export type ApiError = components["schemas"]["ApiError"];

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";

/** Build the OData-style query string for `/catalog/products`. */
export function buildProductsQuery(opts: CatalogQuery = {}): string {
  const params = new URLSearchParams();
  const pageSize = Math.max(1, Math.min(96, opts.pageSize ?? 12));
  const page = Math.max(1, opts.page ?? 1);
  params.set("$top", String(pageSize));
  params.set("$skip", String((page - 1) * pageSize));
  params.set("$orderby", "createdAt desc");

  const clauses: string[] = [];
  if (opts.categoryId) clauses.push(`category eq '${opts.categoryId}'`);
  const q = opts.titleSearch?.trim();
  if (q) clauses.push(`contains(title, '${q.replace(/'/g, "''")}')`);
  const first = clauses[0];
  if (first !== undefined) {
    const second = clauses[1];
    params.set(
      "$filter",
      second !== undefined ? `and(${first}, ${second})` : first,
    );
  }
  return params.toString();
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchCatalogProducts(
  opts: CatalogQuery = {},
  signal?: AbortSignal,
): Promise<ProductPage | null> {
  const qs = buildProductsQuery(opts);
  return getJson<ProductPage>(`${API_BASE}/catalog/products?${qs}`, signal);
}

export async function fetchCatalogProduct(
  id: string,
  signal?: AbortSignal,
): Promise<ProductDto | null> {
  return getJson<ProductDto>(`${API_BASE}/catalog/products/${id}`, signal);
}

export async function fetchCatalogCategories(
  signal?: AbortSignal,
): Promise<CategoryDto[] | null> {
  const result = await getJson<CategoryDto[]>(`${API_BASE}/catalog/categories`, signal);
  return result;
}
