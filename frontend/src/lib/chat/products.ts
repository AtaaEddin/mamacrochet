import { API_BASE_URL } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Client-side catalog fetch for the chat product picker (plan 06): the
 * latest listed works, newest first. Short timeout + silent [] on failure —
 * the picker is a convenience, the conversation must never hang on it.
 */
const FETCH_TIMEOUT_MS = 4_000;

export type CatalogProduct = components["schemas"]["ProductDto"];

export async function fetchChatProducts(limit = 12): Promise<CatalogProduct[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${API_BASE_URL}/catalog/products?$top=${limit}&$orderby=createdAt desc`,
      { signal: controller.signal, credentials: "include" },
    );
    if (!res.ok) return [];
    const page = (await res.json()) as components["schemas"]["ProductPage"];
    return page.items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
