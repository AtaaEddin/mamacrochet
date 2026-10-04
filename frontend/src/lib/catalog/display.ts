import type { WorkArtKind } from "@/lib/sample-works";
import type { ProductDto } from "./localize";

/**
 * Catalog display model (plan 04) — the single shape the cards render.
 *
 * Real products map from the API DTO (caller passes the localized title);
 * the sample works (fallback when the API is unreachable) map from their
 * static data. One model, so the card does not branch on the data source.
 *
 * Isomorphic.
 */
export interface WorkDisplay {
  id: string;
  title: string;
  priceUsd: number;
  /** Browser-reachable image URL, or `null` (→ illustration/placeholder). */
  imageSrc: string | null;
  /** Fallback illustration when there is no photo. */
  art: WorkArtKind | null;
  inStock: boolean;
  /** Category id (for filtering), or `null` when uncategorized. */
  categoryId: string | null;
}

/**
 * Resolve an API file path (`/files/...`) against the browser-facing API base
 * so the same `src` works in dev (cross-origin `http://localhost:8085`) and
 * prod (same-origin under `/api`).
 *
 * A same-origin base (`/api`) is joined as a PATH PREFIX: `new URL(path, base)`
 * would drop the prefix (spec: an absolute path input replaces the base's
 * path), which would 404 every file in the prod deployment.
 */
export function fileSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";
  if (base.startsWith("/")) {
    return `${base.replace(/\/+$/, "")}${path}`;
  }
  try {
    const url = new URL(base);
    // Join as a path prefix: `new URL(path, base)` would replace the base's
    // path and drop any subpath (e.g. a cross-origin `/api` deployment).
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`;
    return url.toString();
  } catch {
    return path;
  }
}

/** Map an API product (localized title already resolved) to the card model. */
export function toWorkDisplay(
  product: ProductDto,
  title: string,
  art: WorkArtKind | null = null,
): WorkDisplay {
  return {
    id: product.id,
    title,
    priceUsd: Number(product.price),
    imageSrc: fileSrc(product.coverImage?.url ?? null),
    art,
    inStock: product.inStock,
    categoryId: product.category?.id ?? null,
  };
}
