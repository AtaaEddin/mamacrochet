# COMMITS — 20261005-1348_test-coverage-completion

| Date | Hash | Subject | Note |
|------|------|---------|------|
| 2026-10-05 | c791d12 | test(api): QuerySpec unit tests (140) + parser date & binder null bugs (plan 20261005-1348/01) | 01: FilterParser/QueryBinder/LikeExpressions/QueryOptions; 2 real bugs fixed (date `^` anchor, `eq null` on non-nullable → 500). Suite 208→348. |
| 2026-10-05 | 2715025 | test(api): hub + sweep service tests (plan 20261005-1348/02) | 02: ChatHub 2%→100% (SSE over TestServer), sweep RunOnceAsync via reflection. Coverage 79.4%→91.9%. Suite 348→358. |
