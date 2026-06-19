# path-matcher

Internal package providing the segment-trie URL matcher, parameter encoding/decoding, constraint validation, and path building. Not published to npm -- consumed by `route-tree` which wraps it via `createMatcher`.

## Exports

Public surface is intentionally narrow (#740): `index.ts` exports only these plus types. Encoding helpers, `createSegmentNode`, and constraint validation are **internal** — used inside `SegmentMatcher`/`registration`, and in tests imported directly from `src/*` (not the package index).

| Export | Description |
|--------|-------------|
| `SegmentMatcher` | Core class: `registerTree()`, `match()`, `buildPath()`, `hasRoute()` |
| `buildParamMeta(path)` | Extracts URL/query/splat params + constraints; exports `PARAM_NAME_PATTERN` (single param-name grammar) |

### Types

| Type | Description |
|------|-------------|
| `SegmentMatcherOptions` / `ResolvedMatcherOptions` | Matcher configuration (caseSensitive, strictTrailingSlash, etc.) |
| `MatchResult` | Match output: `{ segments, params, meta }` |
| `CompiledRoute` | Internal compiled route with build slots, constraints, caches |
| `MatcherInputNode` | Tree node input for `registerTree()` |
| `SegmentNode` | Trie node: static children, param child, splat child |
| `ParamMeta` | Extracted param metadata (urlParams, queryParams, spatParams, constraintPatterns) |
| `BuildParamSlot` / `BuildPathOptions` | Path building types |
| `ConstraintPattern` | `{ pattern: RegExp, constraint: string }` |
| `URLParamsEncodingType` | `"default"` / `"uri"` / `"uriComponent"` / `"none"` |

## Gotchas

- **Zero dependencies (runtime AND dev)** -- `path-matcher` imports nothing from `search-params` anywhere: not in `src/**`, not in `tests/**`. The test helper `tests/helpers/createTestMatcher.ts` ships its own minimal inline `parse`/`build` that mirrors `search-params` no-strategies defaults. This keeps the package fully self-contained
- **`parseQueryString`/`buildQueryString` are REQUIRED** in `SegmentMatcherOptions` -- no default. Constructing a matcher without them is a type error. Tests use `createTestMatcher()` from `tests/helpers/createTestMatcher.ts` which wires an inline minimal parser; production uses `route-tree/createMatcher()` which wires `search-params.parse`/`build`
- **Inline test parser can drift from `search-params`** -- if you change query-string semantics in `search-params` (boolean/null handling, encoding rules), update `tests/helpers/createTestMatcher.ts` in lockstep. There is no automatic drift check — tests will keep passing against stale semantics
- **Single-pass scanner** -- `SegmentMatcher.match()` uses a single-pass `#scanPath` that replaces 4 separate scans (hash, unicode, query, double-slash) for performance
- **Static cache** -- Routes without URL params are cached after first `registerTree()` for O(1) matching
- **Constraint validation is two-phase** -- During `match()`, constraints filter out non-matching routes; during `buildPath()`, constraints throw on invalid param values. Both validate the **decoded** value: `match()` runs `#validateConstraints` *after* `#decodeParams`, so a constraint describes the value the consumer receives, not the raw URL segment — `/users/%35` satisfies `<\d+>` (decodes to `5`), and a raw form matching the regex but decoding to a violating value is rejected (#857)
- **Splat encoding** -- Splat params (`*path`) encode each segment individually (preserving `/` separators) via the single `encodeParam(value, encoding, true)` in `encoding.ts`; `compileBuildParts` reuses it instead of inlining, so the `encodeParam` unit/property suites assert the exact code prod runs (#860)
- **`buildParamMeta` query detection is mask-based** -- before locating the query `?`, both the optional-param marker (`:param?`) **and** `?` inside a `<...>` constraint (e.g. the lazy quantifier in `:id<\d?>`) are neutralized on a length-preserving mask, so neither is mistaken for the query separator and the match index still maps onto the original path (#738/#741)
- **Single param-name grammar** -- `PARAM_NAME_PATTERN` (`[^/?<]+`, exported from `buildParamMeta.ts`) is the one definition of allowed param-name chars; both `URL_PARAM_RGX` (match-meta) and `compileBuildParts`'s build regex derive from it, so match and build can't disagree on a name (#738)
- **Name-less marker rejected at registration (#858)** -- `PARAM_NAME_PATTERN` requires ≥1 char, so a bare marker with no name (`:`, `*`, or one carrying only a modifier — `:?`, `:<\d+>`) is not a valid param. `registerTree()` throws `[SegmentMatcher.registerTree] Empty parameter name …` at every child-creation site (param branch + optional fork in `insertIntoTrieFrom`, splat branch in `processSegment`) via the shared `extractParamName`/`throwEmptyParamName` helpers. Without the guard a name-less marker compiled to a phantom empty-named slot: `match("/files/x")` captured `{ "": "x" }` while `buildPath` emitted a literal `/files/*` and `buildParamMeta` reported no param — a three-way match/build/meta desync of the #736/#738 class
- **Static segments do not backtrack** -- once a segment matches a static child, traversal commits to it; if the rest fails it does NOT retry a param sibling (`/users/new/posts` with `/users/new`+`/users/:id/posts` → `undefined`). Intentional/greedy (INVARIANTS Matching #16, #740)
- **Empty required param rejected at build** -- `buildPath` throws for `""` on a required param (it would collapse the segment and match the parent); optional params unaffected (#740)
- **Performance-critical encoding** -- `encodeURIComponentExcludingSubDelims` uses pre-check regex to skip encoding for all-safe strings (29-57x faster for alphanumeric)
- **Param-name conflict detection (#736)** -- a trie position is keyed by *position*, not by name; the captured value is written under the name recorded on that position. `registerTree()` therefore throws `[SegmentMatcher.registerTree] Parameter name conflict …` when **two different routes** put differently-named params/splats on the **same** position (`/user/:id` + `/user/:slug/profile`) — otherwise first-registration would silently win and the second route would capture under the wrong key. The guard is strictly cross-route: a single route's own consecutive optionals (`/a/:b?/:c?/d`, `/a/:b?/:c/d`) legitimately reuse one position via the optional-omit branch, tracked by the per-route `ownNodes` set in `registration.ts` so they never trip the guard

## File Map

```
src/SegmentMatcher.ts         -- core class: match(), buildPath(), registerTree() (incl. #validateConstraints / #validateBuildConstraints)
src/buildParamMeta.ts         -- param metadata extraction; PARAM_NAME_PATTERN
src/encoding.ts               -- URL param encoding/decoding strategies
src/percentEncoding.ts        -- percent-encoding validation
src/pathUtils.ts              -- createSegmentNode, normalizeTrailingSlash
src/registration.ts           -- registerNode (tree-to-trie compilation)
src/types.ts                  -- all type definitions
src/index.ts                  -- public API re-exports
tests/helpers/createTestMatcher.ts -- shared factory wiring search-params into SegmentMatcher for tests & benchmarks
tests/unit/                   -- unit tests
tests/property/               -- property-based tests (incl. param-name conflict + name-less marker rejection, #736/#858)
tests/stress/                 -- scale/throughput guards (run via `test:stress`)
tests/benchmarks/             -- performance benchmarks
```
