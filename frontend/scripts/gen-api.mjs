#!/usr/bin/env node
/**
 * Regenerates the typed API client from the live API's OpenAPI spec.
 *
 * The dev stack must be running first:
 *   dotnet run --project src/Hanadicrochet.AppHost
 *
 * Outputs (all committed, so builds work without the API):
 *   src/lib/api/schema.json     — the bundled spec
 *   src/lib/api/schema.d.ts     — TypeScript types (openapi-typescript)
 *   src/lib/api/generated/      — per-operation SDK (@hey-api/openapi-ts,
 *                                 configured in openapi-ts.config.ts)
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const apiDir = join(root, "src", "lib", "api");
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

// Per-operation SDK (plan 20261003-1303): regenerate from the spec just
// written. --no-install keeps this offline; the binary is a devDependency.
execFileSync(
  "npx",
  ["--no-install", "openapi-ts", "-f", "openapi-ts.config.ts"],
  { cwd: root, stdio: "inherit" },
);
console.log(
  `gen:api: wrote src/lib/api/schema.json + schema.d.ts + src/lib/api/generated (${spec.info.title})`,
);
