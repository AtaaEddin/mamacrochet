import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Staff catalog API (plan 04) — products + categories management.
 *
 * Mutations (create/edit/delete, images) go through the typed `api` client,
 * which sends cookies + the CSRF token for `/staff` (plan 03 wiring). The
 * products LIST binds a single `[FromQuery] QuerySpec`, so the typed client
 * types its query as `never` — the list fetch builds the OData-style query
 * string by hand and sends cookies itself (still fully typed on the body).
 *
 * Browser-only.
 */

export type ProductDto = components["schemas"]["ProductDto"];
export type CategoryDto = components["schemas"]["CategoryDto"];
export type ProductImageDto = components["schemas"]["ProductImageDto"];
export type ProductPage = components["schemas"]["ProductPage"];
export type ApiError = components["schemas"]["ApiError"];
export type LocalizedContentInput =
  components["schemas"]["LocalizedContentInput"];
export type LocalizedNameInput =
  components["schemas"]["LocalizedNameInput"];
export type CreateProductRequest =
  components["schemas"]["CreateProductRequest"];
export type UpdateProductRequest =
  components["schemas"]["UpdateProductRequest"];
export type CreateCategoryRequest =
  components["schemas"]["CreateCategoryRequest"];
export type UpdateCategoryRequest =
  components["schemas"]["UpdateCategoryRequest"];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";

export interface StaffProductQuery {
  /** Case-insensitive title substring (OData `contains`). */
  titleSearch?: string | null;
  /** Filter to one category (its id), or `null` for all. */
  categoryId?: string | null;
  /** Filter by visibility (`null` = both). */
  isListed?: boolean | null;
  /** 1-based page number. */
  page?: number;
  /** Page size ($top). */
  pageSize?: number;
}

export function buildStaffProductsQuery(opts: StaffProductQuery = {}): string {
  const params = new URLSearchParams();
  const pageSize = Math.max(1, Math.min(96, opts.pageSize ?? 20));
  const page = Math.max(1, opts.page ?? 1);
  params.set("$top", String(pageSize));
  params.set("$skip", String((page - 1) * pageSize));
  params.set("$orderby", "createdAt desc");

  const clauses: string[] = [];
  if (opts.categoryId) clauses.push(`category eq '${opts.categoryId}'`);
  if (opts.isListed !== null && opts.isListed !== undefined) {
    clauses.push(`isListed eq ${opts.isListed ? "true" : "false"}`);
  }
  const q = opts.titleSearch?.trim();
  if (q) clauses.push(`contains(title, '${q.replace(/'/g, "''")}')`);

  const first = clauses[0];
  if (first !== undefined) {
    let filter = first;
    let i = 1;
    while (i < clauses.length) {
      filter = `and(${filter}, ${clauses[i]})`;
      i += 1;
    }
    params.set("$filter", filter);
  }
  return params.toString();
}

/** Staff products list (cookie-auth). `null` on any failure. */
export async function fetchStaffProducts(
  opts: StaffProductQuery = {},
): Promise<ProductPage | null> {
  const qs = buildStaffProductsQuery(opts);
  try {
    const res = await fetch(`${API_BASE}/staff/products?${qs}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as ProductPage;
  } catch {
    return null;
  }
}

/** All categories (cookie-auth). `null` on any failure. */
export async function fetchStaffCategories(): Promise<CategoryDto[] | null> {
  try {
    const res = await fetch(`${API_BASE}/staff/categories`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as CategoryDto[];
  } catch {
    return null;
  }
}

/** One product (cookie-auth). `null` on any failure. */
export async function fetchStaffProduct(id: string): Promise<ProductDto | null> {
  try {
    const res = await fetch(`${API_BASE}/staff/products/${id}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as ProductDto;
  } catch {
    return null;
  }
}

export async function createProduct(
  body: CreateProductRequest,
): Promise<{ ok: true; product: ProductDto } | { ok: false; error: ApiError }> {
  const res = await api.POST("/staff/products", { body });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, product: res.data as ProductDto };
}

export async function updateProduct(
  id: string,
  body: UpdateProductRequest,
): Promise<{ ok: true; product: ProductDto } | { ok: false; error: ApiError }> {
  const res = await api.PATCH("/staff/products/{id}", {
    params: { path: { id } },
    body,
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, product: res.data as ProductDto };
}

/** Soft delete (Admin-only on the server). */
export async function deleteProduct(
  id: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await api.DELETE("/staff/products/{id}", { params: { path: { id } } });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true };
}

/** Reorder images — `imageIds` must list every image exactly once. */
export async function reorderImages(
  productId: string,
  imageIds: string[],
): Promise<{ ok: true; images: ProductImageDto[] } | { ok: false; error: ApiError }> {
  const res = await api.PUT("/staff/products/{id}/images", {
    params: { path: { id: productId } },
    body: { imageIds },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, images: res.data as ProductImageDto[] };
}

export async function deleteImage(
  productId: string,
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await api.DELETE("/staff/products/{id}/images/{imageId}", {
    params: { path: { id: productId, imageId } },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true };
}

export async function createCategory(
  body: CreateCategoryRequest,
): Promise<{ ok: true; category: CategoryDto } | { ok: false; error: ApiError }> {
  const res = await api.POST("/staff/categories", { body });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, category: res.data as CategoryDto };
}

export async function updateCategory(
  id: string,
  body: UpdateCategoryRequest,
): Promise<{ ok: true; category: CategoryDto } | { ok: false; error: ApiError }> {
  const res = await api.PATCH("/staff/categories/{id}", {
    params: { path: { id } },
    body,
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, category: res.data as CategoryDto };
}

/** Soft delete (Admin-only on the server). */
export async function deleteCategory(
  id: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await api.DELETE("/staff/categories/{id}", { params: { path: { id } } });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true };
}
