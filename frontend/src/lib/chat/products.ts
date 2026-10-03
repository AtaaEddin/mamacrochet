import {
  CatalogProducts,
  type ProductDto as CatalogProduct,
} from "@/lib/api/generated-client";

/**
 * Client-side catalog fetch for the chat product picker (plan 06): the
 * latest listed works, newest first. Short timeout + silent [] on failure —
 * the picker is a convenience, the conversation must never hang on it.
 */
const FETCH_TIMEOUT_MS = 4_000;

export type { CatalogProduct };

export async function fetchChatProducts(limit = 12): Promise<CatalogProduct[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await CatalogProducts.list({
      query: { $top: limit, $orderby: "createdAt desc" },
      signal: controller.signal,
    });
    if (res.error) return [];
    return res.data.items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
