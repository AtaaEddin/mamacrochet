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
 * Parse the ApiError envelope from an error response, falling back to a
 * generic envelope when the body is not JSON or lacks a `code`. A null
 * `response` (network failure) yields the fallback directly.
 */
async function parseApiError(
  response: Response | null,
  fallbackMessage: string = "",
): Promise<ApiError> {
  const fallback: ApiError = { code: "server_error", message: fallbackMessage };
  if (response) {
    try {
      const parsed = (await response.json()) as ApiError;
      if (typeof parsed.code === "string") return parsed;
    } catch {
      // Keep the fallback envelope.
    }
  }
  return fallback;
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

/**
 * POST a FormData body with the full cookie + CSRF wiring (multipart
 * uploads). The generated client can't express FormData, so these calls
 * build a Request by hand; the response is parsed to `T`, or the ApiError
 * envelope is returned on failure.
 */
export async function postForm<T = unknown>(
  url: string,
  form: FormData,
): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const token = await ensureCsrfToken();
  const headers = new Headers();
  if (token) headers.set("X-CSRF-TOKEN", token);
  const request = new Request(url, {
    method: "POST",
    credentials: "include",
    body: form,
    headers,
  });
  const response = await withCsrfRetry(request, false);
  if (!response.ok) {
    return { ok: false, error: await parseApiError(response, response.statusText) };
  }
  const data = (await response.json()) as T;
  return { ok: true, data };
}

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
  // /orders joins the CSRF area (customer cancel/rating) except the public
  // POST /orders guest submit — it is rate-limited + honeypot + D16-capped,
  // not CSRF-protected (same precedent as /hiring on the API side).
  // /chat joins the CSRF area (plan 06) for cookie-auth thread calls; the
  // public POST /chat/visitor guest bootstrap is exempt (rate limit +
  // honeypot, same precedent as POST /orders) — guest token calls carry
  // X-Chat-Token instead and are exempt server-side.
  return (
    p === "/identity" ||
    p.startsWith("/identity/") ||
    p === "/admin" ||
    p.startsWith("/admin/") ||
    p === "/staff" ||
    p.startsWith("/staff/") ||
    (p === "/orders" && method !== "POST") ||
    p.startsWith("/orders/") ||
    (p === "/chat" && method !== "POST") ||
    (p.startsWith("/chat/") && !(p === "/chat/visitor" && method === "POST"))
  );
}

async function withCsrfRetry(request: Request, retried: boolean): Promise<Response> {
  // The Request's body stream is consumed once it is sent, and a consumed
  // Request cannot be re-wrapped (`new Request(consumed, ...)` throws).
  // Keep a pre-flight clone so the one-shot retry can replay the mutation.
  const replay = request.clone();
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
          return withCsrfRetry(new Request(replay, { headers }), true);
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
    return { ok: false, error: await parseApiError(response, response.statusText) };
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
    return { ok: false, error: await parseApiError(response, response.statusText) };
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
  return fileSrc(avatarUrl);
}

/** Resolve any API path (e.g. hiring files) against the API base. */
export function fileSrc(apiPath: string): string {
  try {
    return new URL(apiPath, API_BASE_URL).toString();
  } catch {
    return apiPath;
  }
}

export type HiringSubmitResult =
  | { ok: true; id: string; reapplied: boolean }
  | { ok: false; error: ApiError };

/**
 * Public hiring application (plan 09): multipart FormData through raw
 * fetch — the same precedent as `uploadAvatar` (a FormData body can't be
 * expressed in the generated binary schema). No CSRF header: the endpoint
 * is public and is protected server-side by the strict rate bucket +
 * honeypot instead.
 */
export async function submitHiringApplication(data: {
  name: string;
  email: string;
  phone: string;
  country: string;
  nationality: string;
  /** Comma-separated free-text languages (1–6, 2–32 chars each). */
  languages: string;
  previousWork: string;
  message: string;
  files: File[];
}): Promise<HiringSubmitResult> {
  const form = new FormData();
  form.append("name", data.name);
  form.append("email", data.email);
  form.append("phone", data.phone);
  form.append("country", data.country);
  form.append("nationality", data.nationality);
  form.append("languages", data.languages);
  form.append("previousWork", data.previousWork);
  form.append("message", data.message);
  // Honeypot field — the UI always sends it empty (D16).
  form.append("company", "");
  for (const file of data.files) {
    form.append("files", file);
  }

  let response: Response | null = null;
  try {
    response = await fetch(`${API_BASE_URL}/hiring`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
  } catch {
    response = null;
  }

  if (!response || !response.ok) {
    return { ok: false, error: await parseApiError(response) };
  }
  const body = (await response.json()) as components["schemas"]["HiringSubmitted"];
  return { ok: true, id: body.id, reapplied: body.reapplied };
}
