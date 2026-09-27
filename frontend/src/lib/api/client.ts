import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Typed API client — types are generated from the API's OpenAPI spec
 * (`pnpm gen:api`, committed to this folder).
 *
 * baseUrl:
 * - dev: the AppHost injects NEXT_PUBLIC_API_URL (the API's external endpoint)
 * - prod (plan 10): Caddy serves the frontend and proxies /api → set
 *   NEXT_PUBLIC_API_URL=/api for same-origin calls
 */
export const api = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085",
});
