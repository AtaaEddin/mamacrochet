import {
  StaffCategories,
  StaffProduct,
  StaffProductImages,
  StaffProducts,
  type ApiError,
  type CategoryDto,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type ProductDto,
  type ProductImageDto,
  type ProductPage,
  type UpdateCategoryRequest,
  type UpdateProductRequest,
} from "@/lib/api/generated-client";
import { toApiError } from "@/lib/api/errors";
import { escapeOData } from "@/lib/api/odata";

/**
 * Staff catalog API (plan 04) — products + categories management.
 *
 * Every call goes through the generated per-operation SDK (plan
 * 20261003-1303): the products list passes typed `$top/$skip/$filter/
 * $orderby` query args, mutations pass `{ path, body }`. Cookies + the CSRF
 * header for `/staff` come from the app transport (`browserFetch`).
 *
 * Browser-only.
 */

export type {
  ApiError,
  CategoryDto,
  CreateCategoryRequest,
  CreateProductRequest,
  LocalizedContentInput,
  LocalizedNameInput,
  ProductDto,
  ProductImageDto,
  ProductPage,
  UpdateCategoryRequest,
  UpdateProductRequest,
} from "@/lib/api/generated-client";

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

function buildProductsQuery(opts: StaffProductQuery = {}) {
  const pageSize = Math.max(1, Math.min(96, opts.pageSize ?? 20));
  const page = Math.max(1, opts.page ?? 1);

  const clauses: string[] = [];
  if (opts.categoryId) clauses.push(`category eq '${opts.categoryId}'`);
  if (opts.isListed !== null && opts.isListed !== undefined) {
    clauses.push(`isListed eq ${opts.isListed ? "true" : "false"}`);
  }
  const q = opts.titleSearch?.trim();
  if (q) clauses.push(`contains(title, '${escapeOData(q)}')`);

  // OData `and()` function form (the staff binder accepts both it and the
  // infix `and` — this keeps the pre-migration wire shape).
  let filter: string | undefined;
  const first = clauses[0];
  if (first !== undefined) {
    filter = first;
    for (let i = 1; i < clauses.length; i++) {
      filter = `and(${filter}, ${clauses[i]})`;
    }
  }

  return {
    $top: pageSize,
    $skip: (page - 1) * pageSize,
    $orderby: "createdAt desc",
    ...(filter !== undefined ? { $filter: filter } : {}),
  };
}

/** Staff products list (cookie-auth). `null` on any failure. */
export async function fetchStaffProducts(
  opts: StaffProductQuery = {},
): Promise<ProductPage | null> {
  try {
    const res = await StaffProducts.list({ query: buildProductsQuery(opts) });
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

/** All categories (cookie-auth). `null` on any failure. */
export async function fetchStaffCategories(): Promise<CategoryDto[] | null> {
  try {
    const res = await StaffCategories.list();
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

/** One product (cookie-auth). `null` on any failure. */
export async function fetchStaffProduct(id: string): Promise<ProductDto | null> {
  try {
    const res = await StaffProduct.get({ path: { id } });
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

export async function createProduct(
  body: CreateProductRequest,
): Promise<{ ok: true; product: ProductDto } | { ok: false; error: ApiError }> {
  const res = await StaffProducts.create({ body });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, product: res.data };
}

export async function updateProduct(
  id: string,
  body: UpdateProductRequest,
): Promise<{ ok: true; product: ProductDto } | { ok: false; error: ApiError }> {
  const res = await StaffProducts.update({ path: { id }, body });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, product: res.data };
}

/** Soft delete (Admin-only on the server). */
export async function deleteProduct(
  id: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await StaffProducts.delete({ path: { id } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true };
}

/** Reorder images — `imageIds` must list every image exactly once. */
export async function reorderImages(
  productId: string,
  imageIds: string[],
): Promise<{ ok: true; images: ProductImageDto[] } | { ok: false; error: ApiError }> {
  const res = await StaffProductImages.reorder({
    path: { id: productId },
    body: { imageIds },
  });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, images: res.data };
}

export async function deleteImage(
  productId: string,
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await StaffProductImages.delete({ path: { id: productId, imageId } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true };
}

export async function createCategory(
  body: CreateCategoryRequest,
): Promise<{ ok: true; category: CategoryDto } | { ok: false; error: ApiError }> {
  const res = await StaffCategories.create({ body });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, category: res.data };
}

export async function updateCategory(
  id: string,
  body: UpdateCategoryRequest,
): Promise<{ ok: true; category: CategoryDto } | { ok: false; error: ApiError }> {
  const res = await StaffCategories.update({ path: { id }, body });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, category: res.data };
}

/** Soft delete (Admin-only on the server). */
export async function deleteCategory(
  id: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await StaffCategories.delete({ path: { id } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true };
}
