import type { CategoryDto, ProductDto } from "@/lib/api/generated-client";

export type { CategoryDto, ProductDto };

/**
 * Localization helpers for catalog DTOs (plan 04).
 *
 * Every product/category carries per-language rows; the UI shows the row for
 * the active locale, falling back to `en`, then to the first available row
 * (the API guarantees an `en` row for products, so the fallback is a belt
 * and braces, not a dependency).
 *
 * Isomorphic (safe in server + client components).
 */

type LocalizedRow = { language: string; title?: string | null; description?: string | null; name?: string | null };

/**
 * Pick the row for `locale`, falling back to `en`, then the first row.
 * Returns `undefined` when there is no row at all.
 */
function pickRow(rows: readonly LocalizedRow[], locale: string): LocalizedRow | undefined {
  if (rows.length === 0) return undefined;
  const exact = rows.find((r) => r.language === locale);
  if (exact) return exact;
  const english = rows.find((r) => r.language === "en");
  if (english) return english;
  return rows[0];
}



/** Localized product title (always present — `en` row is required). */
export function productTitle(product: ProductDto, locale: string): string {
  const row = pickRow(product.localizations, locale);
  return (row?.title ?? "").trim() || "—";
}

/** Localized product description, or `null` when none is set. */
export function productDescription(product: ProductDto, locale: string): string | null {
  const row = pickRow(product.localizations, locale);
  const description = row?.description?.trim();
  return description ? description : null;
}

/** Localized category display name. */
export function categoryName(category: CategoryDto | null | undefined, locale: string): string | null {
  if (!category) return null;
  const row = pickRow(category.names, locale);
  return row?.name?.trim() || null;
}
