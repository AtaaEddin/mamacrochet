import { client as generatedClient } from "./generated/client.gen";
import {
  Hiring,
  Identity,
  ProductImages,
  type ApiError,
  type CsrfToken,
  type ProductImageDto,
  type UserDto,
} from "./generated";
import { toApiError } from "./errors";

/**
 * App API transport (plan 20261003-1303) — the cookie + CSRF layer behind
 * the generated per-operation SDK (`./generated-client`). All API calls go
 * through the generated client; this module only holds the transport
 * (`browserFetch`, installed on the generated client below), the CSRF token
 * plumbing, and the three file-upload wrappers.
 *
 * baseUrl:
 * - dev: the AppHost injects NEXT_PUBLIC_API_URL (the API's external endpoint)
 * - prod (plan 10): Caddy serves the frontend and proxies /api → the API
 *   (`handle_path /api/*` strips the prefix) — set NEXT_PUBLIC_API_URL=/api
 *
 * Cookie auth (plan 03):
 * - `credentials: "include"` sends the browser's `hc.auth` + antiforgery
 *   cookies on every call. Dev is cross-origin but same-site
 *   (localhost:3000 → localhost:8085), so SameSite=Lax delivers them.
 * - CSRF: mutations under `/identity` + `/admin` + `/staff` + (most of)
 *   `/orders` + `/chat` carry `X-CSRF-TOKEN`. The token comes from
 *   `GET /antiforgery`, cached per page load. The API scopes tokens to the
 *   authenticated principal, so:
 *   - call `refreshCsrfToken()` after login/register (principal changed),
 *   - a 403 `csrf` body triggers one transparent re-fetch + retry.
 *
 * The only route strings in the app live in `needsCsrf` below: they are
 * transport-level CSRF area prefixes (path metadata), not call sites —
 * every actual API call is a generated SDK method.
 *
 * Browser-only: relative baseUrls (prod) and the auth cookies mean the
 * transport must not be used from server components without cookie
 * forwarding (the catalog server fetch uses its own plain client instead).
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";

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
    .then((body: CsrfToken | null) => (body ? body.token : null))
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

/**
 * CSRF area prefixes — the single intentional route-string exception to
 * "zero route strings outside the generated tree": these are transport
 * metadata (which API areas require the X-CSRF-TOKEN header), matching the
 * API's own `RequireCsrf` middleware. No request is built from them.
 */
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

/**
 * The app's fetch transport for the generated SDK client: cookie + CSRF
 * header + one-shot 403-csrf retry. Request in, Response out — the same
 * shape `@hey-api/client-fetch`'s `fetch` config option expects.
 */
export async function browserFetch(
  input: Request | string | URL,
  init?: RequestInit,
): Promise<Response> {
  let request: Request =
    input instanceof Request ? input : new Request(input, init);
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

// Install the app transport on the generated SDK client (idempotent —
// setConfig merges). Every SDK method uses this client instance by default.
generatedClient.setConfig({
  baseUrl: API_BASE_URL,
  fetch: browserFetch,
});

// ---- file-upload wrappers --------------------------------------------------

export type HiringSubmitResult =
  | { ok: true; id: string; reapplied: boolean }
  | { ok: false; error: ApiError };

/**
 * Public hiring application (plan 09) through the generated SDK's multipart
 * body (the `formDataBodySerializer` builds the FormData — it skips null/
 * undefined, so an absent field is simply not sent). No CSRF header: the
 * endpoint is public and is protected server-side by the strict rate bucket
 * + honeypot (same precedent as the guest order submit).
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
  try {
    const res = await Hiring.submit({
      body: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        country: data.country,
        nationality: data.nationality,
        languages: data.languages,
        previousWork: data.previousWork,
        message: data.message,
        // Honeypot field — the UI always sends it empty (D16).
        company: "",
        files: data.files,
      },
    });
    if (res.error) return { ok: false, error: toApiError(res.error) };
    return { ok: true, id: res.data.id, reapplied: res.data.reapplied };
  } catch {
    // Network failure (offline, timeout) — no response to parse.
    return { ok: false, error: toApiError(null) };
  }
}

/**
 * Avatar upload (multipart) through the generated SDK. The CSRF header comes
 * from the transport (the endpoint is in the /identity CSRF area).
 */
export async function uploadAvatar(file: File): Promise<
  | { ok: true; user: UserDto }
  | { ok: false; error: ApiError }
> {
  try {
    const res = await Identity.avatar.upload({ body: { file } });
    if (res.error) return { ok: false, error: toApiError(res.error) };
    return { ok: true, user: res.data };
  } catch {
    return { ok: false, error: toApiError(null) };
  }
}

/**
 * Product image upload (plan 04, multipart) through the generated SDK.
 * Files go under the form key `files` (the API binds an `IFormFileCollection`).
 * Returns the product's full image list (re-fetch, not a patch).
 */
export async function uploadProductImages(
  productId: string,
  files: File[] | FileList,
): Promise<{ ok: true; images: ProductImageDto[] } | { ok: false; error: ApiError }> {
  try {
    const res = await ProductImages.add({
      path: { id: productId },
      body: { files: Array.from(files) },
    });
    if (res.error) return { ok: false, error: toApiError(res.error) };
    return { ok: true, images: res.data };
  } catch {
    return { ok: false, error: toApiError(null) };
  }
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

/**
 * Resolve any API path (e.g. hiring files) against the API base. Same rule
 * as `catalog/display.ts`: a same-origin base (prod `/api`) is a path
 * prefix to join, not a URL base (which would drop the prefix).
 */
export function fileSrc(apiPath: string): string {
  if (API_BASE_URL.startsWith("/")) {
    return `${API_BASE_URL.replace(/\/+$/, "")}${apiPath}`;
  }
  try {
    const url = new URL(API_BASE_URL);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${apiPath}`;
    return url.toString();
  } catch {
    return apiPath;
  }
}

// Type aliases kept for the call sites (now sourced from the generated SDK).
export type { ApiError, HiringSubmitted, ProductImageDto, UserDto } from "./generated";
