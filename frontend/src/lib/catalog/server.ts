import type { ProductPage, ProductDto, CategoryDto } from "./query";

/**
 * Server-side catalog fetch (plan 04) — used by server components (home
 * featured works, works list initial paint, product detail).
 *
 * The browser client uses `NEXT_PUBLIC_API_URL` (dev: absolute
 * `http://localhost:8085`, prod: relative `/api`). A server-side fetch needs an
 * ABSOLUTE base:
 *   - prod: the web container reaches the api container at `http://api:8085`
 *     (set `API_SERVER_URL` in docker-compose) — the `/api` path is a
 *     browser-only Caddy route and is not resolvable from Node.
 *   - dev: `NEXT_PUBLIC_API_URL` is already absolute, so we reuse it; falls
 *     back to the dev default.
 *
 * Every fetch has a hard timeout and returns `null` on any failure, so a
 * slow/dead API degrades to the sample data instead of hanging the page.
 *
 * Server-only (uses absolute URLs; do not import from client components).
 */

const DEV_API = "http://localhost:8085";
const FETCH_TIMEOUT_MS = 2_500;

function serverApiBase(): string {
  const explicit = process.env.API_SERVER_URL;
  if (explicit) return explicit;
  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (pub && /^https?:\/\//.test(pub)) return pub;
  return DEV_API;
}

async function getJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${serverApiBase()}${path}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Top `n` listed products, newest first (home featured works). */
export async function serverFetchProducts(n = 6): Promise<ProductPage | null> {
  return getJson<ProductPage>(`/catalog/products?$top=${n}&$orderby=createdAt desc`);
}

export async function serverFetchProduct(id: string): Promise<ProductDto | null> {
  return getJson<ProductDto>(`/catalog/products/${id}`);
}

export async function serverFetchCategories(): Promise<CategoryDto[] | null> {
  return getJson<CategoryDto[]>("/catalog/categories");
}
