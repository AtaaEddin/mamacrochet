#!/usr/bin/env node
/**
 * Regenerates the typed API client from the live API's OpenAPI spec.
 *
 * The dev stack must be running first:
 *   dotnet run --project src/Mamacrochet.AppHost
 *
 * Outputs (both committed, so builds work without the API):
 *   src/lib/api/schema.json  — the bundled spec
 *   src/lib/api/schema.d.ts  — TypeScript types (openapi-typescript)
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, "..", "src", "lib", "api");
const specUrl = process.env.API_URL ?? "http://localhost:8085/openapi/v1.json";

const res = await fetch(specUrl);
if (!res.ok) {
  console.error(
    `gen:api: cannot reach ${specUrl} (HTTP ${res.status}) — is the Aspire stack running?`,
  );
  process.exit(1);
}

const spec = await res.json();
// v7 API: default export returns an AST; astToString serializes it. $refs
// (incl. components) are resolved internally.
const ast = await openapiTS(spec, { alphabetize: true });
const types = astToString(ast);

writeFileSync(join(apiDir, "schema.json"), `${JSON.stringify(spec, null, 2)}\n`);
writeFileSync(join(apiDir, "schema.d.ts"), types);
console.log(`gen:api: wrote src/lib/api/schema.json + schema.d.ts (${spec.info.title})`);
