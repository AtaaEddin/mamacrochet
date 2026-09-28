import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

/**
 * Typed API client — types are generated from the API's OpenAPI spec
 * (`pnpm gen:api`, committed to this folder).
 *
 * baseUrl:
 * - dev: the AppHost injects NEXT_PUBLIC_API_URL (the API's external endpoint)
 * - prod (plan 10): Caddy serves the frontend and proxies /api → the API
 *   (`handle_path /api/*` strips the prefix) — set NEXT_PUBLIC_API_URL=/api
 *
 * Cookie auth (plan 03):
 * - `credentials: "include"` sends the browser's `mm.auth` + antiforgery
 *   cookies on every call. Dev is cross-origin but same-site
 *   (localhost:3000 → localhost:8085), so SameSite=Lax delivers them.
 * - CSRF: mutations under `/identity` + `/admin` carry `X-CSRF-TOKEN`.
 *   The token comes from `GET /antiforgery`, cached per page load. The API
 *   scopes tokens to the authenticated principal, so:
 *   - call `refreshCsrfToken()` after login/register (principal changed),
 *   - a 403 `csrf` body triggers one transparent re-fetch + retry.
 *
 * Browser-only: relative baseUrls (prod) and the auth cookies mean the client
 * must not be used from server components without cookie forwarding.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";

type ApiError = components["schemas"]["ApiError"];
type UserDto = components["schemas"]["UserDto"];
type CsrfTokenBody = components["schemas"]["CsrfToken"];
type ProductImageDto = components["schemas"]["ProductImageDto"];

let csrfToken: Promise<string | null> | null = null;

/** Drop the cached token — the antiforgery token is principal-scoped. */
export function refreshCsrfToken(): void {
  csrfToken = null;
}

/**
 * Fetch with a hard timeout. A wedged socket must never park a form submit
 * forever: on timeout the caller falls back (e.g. no CSRF header → the API
 * answers 403 `csrf` and the one-shot retry re-fetches a fresh token).
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const CSRF_FETCH_TIMEOUT_MS = 10_000;

function ensureCsrfToken(): Promise<string | null> {
  csrfToken ??= fetchWithTimeout(
    `${API_BASE_URL}/antiforgery`,
    { credentials: "include" },
    CSRF_FETCH_TIMEOUT_MS,
  )
    .then((res) => (res.ok ? res.json() : null))
    .then((body: CsrfTokenBody | null) => (body ? body.token : null))
    .catch(() => null);
  return csrfToken;
}

function requestPathname(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Relative (prod baseUrl under Node SSR) — the URL is the path itself.
  }
  // Prod proxies the API under /api; match the API's own path prefixes.
  return pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
}

function needsCsrf(url: string, method: string): boolean {
  if (!/^(POST|PUT|PATCH|DELETE)$/.test(method)) return false;
  const p = requestPathname(url);
  return (
    p === "/identity" ||
    p.startsWith("/identity/") ||
    p === "/admin" ||
    p.startsWith("/admin/") ||
    p === "/staff" ||
    p.startsWith("/staff/")
  );
}

async function withCsrfRetry(request: Request, retried: boolean): Promise<Response> {
  const response = await globalThis.fetch(request, { credentials: "include" });
  if (!retried && response.status === 403) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      let body: ApiError | null = null;
      try {
        const parsed = (await response.clone().json()) as ApiError;
        body = typeof parsed.code === "string" ? parsed : null;
      } catch {
        body = null;
      }
      if (body && body.code === "csrf") {
        // Stale/anonymous token — refetch and retry once.
        refreshCsrfToken();
        const token = await ensureCsrfToken();
        if (token) {
          const headers = new Headers(request.headers);
          headers.set("X-CSRF-TOKEN", token);
          return withCsrfRetry(new Request(request, { headers }), true);
        }
      }
    }
  }
  return response;
}

async function browserFetch(request: Request): Promise<Response> {
  if (needsCsrf(request.url, request.method)) {
    const token = await ensureCsrfToken();
    if (token) {
      const headers = new Headers(request.headers);
      headers.set("X-CSRF-TOKEN", token);
      request = new Request(request, { headers });
    }
  }
  return withCsrfRetry(request, false);
}

export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  fetch: browserFetch,
});

/**
 * Avatar upload (multipart). The OpenAPI binary schema models the file as a
 * string, which cannot express a browser FormData, so this one call goes
 * through raw fetch — with the same cookie + CSRF wiring as the typed
 * client (the endpoint's antiforgery comes from the same middleware).
 */
export async function uploadAvatar(file: File): Promise<
  | { ok: true; user: UserDto }
  | { ok: false; error: ApiError }
> {
  const form = new FormData();
  form.append("file", file);
  const token = await ensureCsrfToken();
  const headers = new Headers();
  if (token) headers.set("X-CSRF-TOKEN", token);
  const request = new Request(`${API_BASE_URL}/identity/me/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
    headers,
  });
  const response = await withCsrfRetry(request, false);
  if (!response.ok) {
    let error: ApiError = { code: "server_error", message: response.statusText };
    try {
      const parsed = (await response.json()) as ApiError;
      if (typeof parsed.code === "string") error = parsed;
    } catch {
      // Keep the fallback envelope.
    }
    return { ok: false, error };
  }
  const user = (await response.json()) as UserDto;
  return { ok: true, user };
}

/**
 * Product image upload (plan 04, multipart). Files go under the form key
 * `files` (the API binds an `IFormFileCollection`). Same cookie + CSRF wiring
 * as the avatar upload: the built-in antiforgery middleware validates the
 * X-CSRF-TOKEN header on form endpoints. Returns the product's full image
 * list (re-fetch, not a patch).
 */
export async function uploadProductImages(
  productId: string,
  files: File[] | FileList,
): Promise<{ ok: true; images: ProductImageDto[] } | { ok: false; error: ApiError }> {
  const form = new FormData();
  for (const file of Array.from(files)) form.append("files", file);
  const token = await ensureCsrfToken();
  const headers = new Headers();
  if (token) headers.set("X-CSRF-TOKEN", token);
  const request = new Request(
    `${API_BASE_URL}/staff/products/${encodeURIComponent(productId)}/images`,
    { method: "POST", credentials: "include", body: form, headers },
  );
  const response = await withCsrfRetry(request, false);
  if (!response.ok) {
    let error: ApiError = { code: "server_error", message: response.statusText };
    try {
      const parsed = (await response.json()) as ApiError;
      if (typeof parsed.code === "string") error = parsed;
    } catch {
      // Keep the fallback envelope.
    }
    return { ok: false, error };
  }
  const images = (await response.json()) as ProductImageDto[];
  return { ok: true, images };
}

/**
 * Avatar URLs are API paths (`/files/avatars/...`). Resolve them against the
 * API base so the same component works in dev (cross-origin) and prod
 * (same-origin under /api).
 */
export function avatarSrc(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  try {
    return new URL(avatarUrl, API_BASE_URL).toString();
  } catch {
    return avatarUrl;
  }
}
