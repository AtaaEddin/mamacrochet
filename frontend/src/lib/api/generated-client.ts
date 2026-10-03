/**
 * Hand-written wiring for the generated per-operation API SDK
 * (plan 20261003-1303, sub-plan 02).
 *
 * The tree in `./generated/` is emitted by `@hey-api/openapi-ts` from the
 * committed spec (`pnpm gen:api`) — never edit it by hand. This module is
 * the only hand-written part of the generated client: it points the
 * generated client at the app's runtime base URL and routes every request
 * through the app transport (auth cookies, CSRF header, one-shot 403-csrf
 * retry), then re-exports the SDK surface.
 *
 * Browser-only, like the openapi-fetch client in `./client.ts` (sub-plan 03
 * removes that client).
 */
import { API_BASE_URL, browserFetch } from "./client";
import { client as generatedClient } from "./generated/client.gen";

// Override the generated defaults — the spec embeds its dev server URL —
// with the app's runtime base (env-driven), and install the cookie + CSRF
// transport. Every SDK method uses this client instance by default.
generatedClient.setConfig({
  baseUrl: API_BASE_URL,
  fetch: browserFetch,
});

export { generatedClient as client };
export * from "./generated";
