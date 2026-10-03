import { defineConfig } from "@hey-api/openapi-ts";

/**
 * Codegen config for the per-operation API SDK (plan 20261003-1303, sub-plan
 * 02). Input is the committed spec `src/lib/api/schema.json` (refreshed by
 * `scripts/gen-api.mjs` from the live API); output is the committed tree
 * `src/lib/api/generated/`.
 *
 * Plugin notes (v0.99.0):
 * - `@hey-api/client-fetch` — thin fetch transport (Request-in /
 *   Response-out). The app's cookie/CSRF wrapper is injected at runtime
 *   via `client.setConfig({ fetch })` in `src/lib/api/client.ts` (wired by
 *   `src/lib/api/generated-client.ts`, which imports it for its side
 *   effect).
 * - `@hey-api/sdk` — one typed method per operation, named from the
 *   OpenAPI `operationId`, grouped by tag (`operations: "byTags"`).
 * - `paramsStructure: "grouped"` — calls take `{ path, query, body, ... }`.
 * - `responseStyle: "fields"` (fetch client only) — calls resolve to
 *   `{ data, error, response }`; `error` is the typed `ApiError` envelope
 *   for error responses the spec declares.
 */
export default defineConfig({
  input: "src/lib/api/schema.json",
  output: "src/lib/api/generated",
  plugins: [
    "@hey-api/client-fetch",
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      client: "@hey-api/client-fetch",
      operations: "byTags",
      paramsStructure: "grouped",
      responseStyle: "fields",
    },
  ],
});
