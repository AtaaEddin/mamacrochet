# 01 — Backend QuerySpec unit tests

status: done

## Scope

`src/Hanadicrochet.Api/QuerySpec/**` is the $filter/$orderby query layer
(plan 04 D19). Baseline coverage: FilterParser 0% (221 lines), FilterAst 0%,
LikeExpressions 0%, QueryBinder 33%, QuerySpec(QueryOptions) 81%. All of it
is pure logic (expression trees + string parsing) — ideal unit tests, no DB.

## Targets

- **FilterParser.Parse** — every grammar rule:
  - comparisons: all 6 ops (eq/ne/lt/le/gt/ge), case-insensitive op names,
    literal-first (`'v' eq field` and `5 gt n`), field names lower-cased.
  - text functions: contains/startswith/endswith, case-insensitive fn names,
    string-literal argument required.
  - logical: and/or/not precedence + parenthesized groups + nesting depth
    limit (`MaxExpressionDepth`).
  - literals: string, number (incl. negative, decimal), bool, null, ISO
    dates (with/without time, with offset/Z, space separator).
  - errors: empty/whitespace input, unterminated string, invalid number
    (`-` alone), unknown character (`=`, `"`, `|`), lone literal, trailing
    tokens, unknown operator position, `and`/`or`/`not` in primary position,
    missing field/op pairs.
- **QueryBinder** — build against a small test entity:
  - Field(): eq/ne/lt/le/gt/ge for string/decimal/int/bool/DateTime types;
    null literals; type mismatches → QuerySpecException (string literal on
    int field, number on string field, date on bool, …).
  - TextField(): contains/startswith/endswith produce ILike expressions;
    comparison ops on a text-only field rejected; non-string fn argument
    rejected; field without Text fn rejected.
  - SortField(): orderable but filterable → "cannot be filtered".
  - ResolveOrder(): default order, asc/desc (case-insensitive), multi-field
    (only first used), bad direction, unknown field, text-only field,
    MaxOrderByLength exceeded.
  - BuildFilter over and/or/not/comparison/text-function trees; unknown
    field; SortOnly filter attempt.
- **LikeExpressions** — Escape (backslash/%/_ escaping), Pattern for all
  three functions + unknown function error.
- **QueryOptions.FromQuery** — default top, clamp to max, $skip, bad $top
  (non-int, <1), bad $skip, filter length limit, orderby passthrough.

## Result

3 new test files, 140 tests, all green (suite 208 → 348):
- `FilterParserTests.cs` — 61: all 6 ops, case-insensitive ops/keywords, literal-first
  comparisons, number/negative/bool/null/ISO-date literals, text functions, and/or/not
  precedence, parentheses to the depth limit (24 ok / 25 throws), and every documented
  error path (empty, unterminated string, bad number, unexpected chars, lone literal,
  malformed shapes).
- `QueryBinderTests.cs` — 52: per-type coercion (string/decimal/int/bool/DateTime)
  compiled + evaluated against an in-memory probe entity, logical composition,
  text-function ILIKE construction, sort-only fields, unknown/case-insensitive fields,
  $orderby resolution + all error paths + max length.
- `QuerySpecMiscTests.cs` — 27: LikeExpressions Escape/Pattern/Call (reflection over
  the internal .NET 10 call-node type), QueryOptions.FromQuery defaults/clamp/skip/
  orderby + integer + length errors.

**Bugs found & fixed (same precedent as plan 20261004-0554):**
1. `FilterParser.DatePattern` was anchored with `^` but matched at an explicit
   start position (`Regex.Match(input, i)`); `^` anchors to index 0, so **every
   date literal after the first token failed** (`createdAt eq 2026-10-05` →
   "Unexpected token '-10'"). Fix: drop the `^` anchor (one char) + comment.
   The date path was silently broken for the documented $filter contract.
2. `QueryBinder.Coerce` built `Expression.Constant(null, typeof(decimal/int/bool/DateTime))`
   for `field eq null` on non-nullable value types → unhandled
   `ArgumentException` (HTTP 500) instead of a clean 400. Fix: `NullOnNonNullable`
   → QuerySpecException ("not nullable; 'eq null' is not supported"); string
   (nullable) keeps null support.
