import { createClient } from "@/lib/api/generated/client";
import {
  Categories,
  Product,
  Products,
  type CategoryDto,
  type ProductDto,
  type ProductPage,
} from "@/lib/api/generated";

/**
 * Server-side catalog fetch (plan 04) — used by server components (home
 * featured works, works list initial paint, product detail).
 *
 * Runs the generated SDK against its own client instance (not the browser
 * one — server components must not pull in the cookie/CSRF transport):
 * absolute base URL, plain fetch, per-call timeout. Next 15+ server fetch is
 * no-store by default, so no explicit cache option is needed.
 *
 * A server-side fetch needs an ABSOLUTE base:
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

function getJson<T>(
  run: (
    client: ReturnType<typeof createClient>,
    signal: AbortSignal,
  ) => Promise<{ data?: T; error?: unknown }>,
): Promise<T | null> {
  const client = createClient({ baseUrl: serverApiBase() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return run(client, controller.signal)
    .then((res) => (res.error ? null : (res.data ?? null)))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

/** Top `n` listed products, newest first (home featured works). */
export function serverFetchProducts(n = 6): Promise<ProductPage | null> {
  return getJson((client, signal) =>
    Products.list({
      client,
      signal,
      query: { $top: n, $orderby: "createdAt desc" },
    }),
  );
}

export function serverFetchProduct(id: string): Promise<ProductDto | null> {
  return getJson((client, signal) =>
    Product.get({ client, signal, path: { id } }),
  );
}

export function serverFetchCategories(): Promise<CategoryDto[] | null> {
  return getJson((client, signal) => Categories.list({ client, signal }));
}
