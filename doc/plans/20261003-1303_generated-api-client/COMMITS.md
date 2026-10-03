# COMMITS — generated API client

| Date | Hash | Subject | Note |
|---|---|---|---|
| 2026-10-03 | d24033b | feat(api): operationId on all 72 ops + OData query params in spec | Sub-plan 01: 54 `WithName`s + OData-param transformer in `Program.cs`; live :8085 verified 72/72 named, 5 list ops carry `$top/$skip/$filter/$orderby`; spec deep-diff metadata-only |
| 2026-10-03 | 10f40a1 | feat(frontend): generated per-operation API client (hey-api openapi-ts) | Sub-plan 02: `@hey-api/openapi-ts` 0.99.0 SDK in `src/lib/api/generated/`, `gen-api.mjs` codegen step, `generated-client.ts` wires `browserFetch` (cookies/CSRF/retry); browser spike all-pass (OData params, 3× multipart, typed 4xx, CSRF); regenerated spec files |
| 2026-10-03 | 422af46 | docs(plans): generated api client — record sub-plans 01+02 commits | Plan folder (main + 01–03 + this file); 01 & 02 done, 03 proposed (migrate call sites, remove openapi-fetch) |
| 2026-10-03 | e43c295 | feat(frontend): migrate all API call sites to the generated SDK | Sub-plan 03: all domain wrappers + ~20 components on the generated SDK; openapi-fetch/openapi-typescript/schema.d.ts removed; spec-only .Produces fix on 4 payment/delivery endpoints; Playwright 16/16 light + dark; 5 pre-existing product issues documented (see 03 Notes) |
