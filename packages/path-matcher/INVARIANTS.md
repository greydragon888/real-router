# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Encoding

| #   | Invariant                                 | Description                                                                                                                                                                                 |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Encode-decode roundtrip                   | `DECODING[enc](ENCODING[enc](v)) === v` for all 4 encoding strategies (`default`, `uri`, `uriComponent`, `none`) and arbitrary Unicode strings. Every encoded value can be fully recovered. |
| 2   | Splat roundtrip                           | `DECODING[enc](encodeParam(v, enc, true)) === v` for splat-style values containing `/` separators. Splat encoding preserves the full value across the encode/decode cycle.                  |
| 3   | Splat preserves slash count               | `encodeParam(v, enc, true)` produces a string with the same number of `/` characters as the original value. Splat encoding never adds or removes path separators.                           |
| 4   | None encoding is identity                 | `ENCODING_METHODS.none(v) === v` and `DECODING_METHODS.none(v) === v` for any string. The `none` strategy passes values through unchanged.                                                  |
| 5   | Safe strings unchanged by default encoder | Strings containing only unreserved characters (`[a-zA-Z0-9_\-.~]`) pass through the `default` encoder without modification.                                                                 |
| 6   | Encoder determinism                       | Two calls to `ENCODING_METHODS[enc](v)` with the same arguments always return the same string. Encoders are pure functions.                                                                 |
| 7   | Splat single-segment equals non-splat     | `encodeParam(v, enc, true) === ENCODING_METHODS[enc](v)` when `v` contains no `/`. A single-segment splat value encodes identically to a regular param value.                               |

## Matching

| #   | Invariant                            | Description                                                                                                                                                                                 |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Roundtrip: route name preserved      | `match(buildPath(name, params)).segments[-1].fullName === name`. Building a path and matching it back always resolves to the same route name.                                               |
| 2   | Roundtrip: params preserved          | `match(buildPath(name, params)).params` equals the original params object. Parameter values survive the build/match cycle without loss or corruption.                                       |
| 3   | Optional param roundtrip             | A route with an optional param matches the same route name whether the param is present or absent. Both `buildPath("search", {query})` and `buildPath("search", {})` resolve to `"search"`. |
| 4   | Splat param roundtrip                | Splat param values are fully restored after `buildPath` then `match`. Multi-segment path structures survive the cycle intact.                                                               |
| 5   | Match determinism                    | Calling `match(path)` twice with the same path returns identical segment names and params. The matcher has no mutable state that affects results.                                           |
| 6   | Static beats param priority          | When a static child and a param child exist at the same trie level, the static child always wins. `/users/new` matches the static `users.new` route, not the param `users.profile` route.   |
| 7   | Param fallback for non-static values | When a path segment does not match any static child, the param child captures it. Non-static values correctly fall through to the param route.                                              |
| 8   | Param beats splat priority           | When a param child and a splat child exist at the same trie level, the param child always wins for single-segment values.                                                                   |
| 9   | Constraint satisfaction              | Params extracted from a matched constrained route always satisfy the constraint regex. A route declared as `/:id<\d+>` only matches when `id` is numeric.                                   |
| 10  | Constraint rejection                 | `buildPath` throws when a param value violates the route's constraint pattern. Invalid values are caught before the path is built.                                                          |
| 11  | Case insensitivity                   | With `caseSensitive: false`, matching produces the same route name regardless of the case of static path segments.                                                                          |
| 12  | buildPath starts with `/`            | `buildPath` always returns a string starting with `/`, for param routes, splat routes, and optional-param routes alike.                                                                     |
| 13  | Trailing slash option                | With `trailingSlash: "always"`, `buildPath` always returns a string ending with `/`.                                                                                                        |
| 14  | Param-name grammar agreement         | The match-path and build-path grammars accept the **same** param-name character class (canonical set: any char except `/`, `?`, `<` — derived from the single `PARAM_NAME_PATTERN`). For any valid name (incl. `-`, `.`, `~`, not just `\w`), `match()` captures the value under exactly the name `buildPath()` expects — they can never disagree (#738). |
| 15  | Constraint-aware query detection     | A `?` inside a `<...>` constraint (lazy quantifier, optional group — `:id<\d?>`) is never mistaken for the query separator. `buildParamMeta` preserves `urlParams`, the constraint, and `pathPattern`; `queryParams` is unaffected. A real query after the constraint is still detected (#738). |
| 16  | Static-segment no-backtrack (limitation) | The segment trie is **greedy**: once a path segment matches a static child, `match()` does NOT backtrack to a param sibling if the remainder fails. With `/users/new` + `/users/:id/posts`, `match("/users/new/posts")` returns `undefined` (it commits to static `new`). Intentional for determinism/performance — model overlapping routes so the static prefix is also a valid stem, or avoid the overlap (#740). |
| 17  | Empty required param rejected at build | `buildPath` throws `Missing required param '<name>' (empty string)` when a **required** param is given `""` — an empty value would collapse the segment and silently match the parent route (`buildPath("u.p", {id:""})` → `/users/`). Treated like a missing param. Optional params are unaffected (#740). |
| 18  | Canonicalization fixpoint (`build∘match`) | Matching a built path and re-building from the recovered params reproduces the **same** path and params: `buildPath(name, match(buildPath(name, p)).params) === buildPath(name, p)`, and a second `match` agrees. The property `core`'s `rewritePathOnMatch` depends on — holds for any value under `default`/`uriComponent` (incl. `/`) and for splat under all 4 strategies. |
| 19  | strictQueryParams rejection          | With `strictQueryParams`, `match()` returns `undefined` when the query contains a key not declared by the route; a query of only declared keys matches and captures them. |
| 20  | queryParamsMode loose vs default     | `buildPath` drops an **undeclared** query key in default mode (bare path), and keeps it under `queryParamsMode: "loose"`. |
| 21  | Declared query value roundtrip       | A declared query param value survives `build → match`: `match(buildPath(name, {q})).params` equals `{q}`. |
| 22  | strictTrailingSlash matching         | With `strictTrailingSlash`, the input's trailing-slash-ness must equal the route's: a route declared without a trailing slash rejects a trailing-slash input (and vice-versa). Without the option, both forms match. |
| 23  | Constraint filtering at match        | `match()` returns `undefined` when a captured value violates the route's constraint regex (route filtered out); a satisfying value is admitted and captured. Complements #9 (satisfaction). |
| 24  | Splat backtracking                   | When a splat node has a child route, a remainder that matches the child resolves to the more-specific child; a remainder that doesn't falls back to the wildcard capture. |
| 25  | Query overrides same-named path param | A query key equal to a path-param name **overwrites** the captured path value: `match("/u/5?id=9").params` → `{ id: "9" }`. Query params are merged into the same object as path params (`#mergeQueryParams`), query last. Intentional/documented (#843): `buildPath` never emits a path param as a query key, so the build→match roundtrip is unaffected; the collision only arises for hand-crafted URLs where a query shadows a path segment. |

## Path Rejection

| #   | Invariant                            | Description                                                                                                                                                                    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Raw Unicode rejection                | `match()` returns `undefined` for paths containing raw Unicode characters (U+0080–U+FFFF). Unencoded Unicode in URL paths is rejected before trie traversal.                   |
| 2   | Double-slash rejection               | `match()` returns `undefined` for paths containing `//`. Consecutive slashes are invalid path structure.                                                                       |
| 3   | Hash fragment stripping              | `match(path + "#fragment")` produces the same result as `match(path)`. A fragment (everything after the **first** `#`) is stripped before matching **and before query parsing** — whether it follows the path directly (`/a#f`) or a query string (`/a?q=1#f`). A `#` before the `?` is handled by `#scanPath`'s truncation branch; a `#` after the `?` is stripped from the query substring by an `indexOf("#")` in `#preparePath` — without it the fragment was folded into the query value (`?ref=v#f` → `ref="v#f"`, #842). |
| 4   | Malformed percent-encoding rejection | `match()` returns `undefined` (never throws) when a matched param contains a percent sequence that is either **syntactically** malformed (`%XX` where X is not a hex digit, or truncated) **or** syntactically valid but **semantically invalid UTF-8** (`%E0%41`, `%C0%80`, `%FF`, surrogate halves). The first is caught by `validatePercentEncoding`; the second by a try/catch around `decodeURIComponent`/`decodeURI` in `#decodeParams` (#737). |
| 5   | Undecodable query rejection          | `match()` returns `undefined` (never throws) when the query string makes the injected query parser throw (e.g. `?x=%E0%41` → `decodeURIComponent` URIError). The `parseQueryString` call in `#buildResult` is wrapped in try/catch so a malformed query yields an unmatched URL, not a crash (#737). |
| 6   | Never-throw across the option matrix | `match()` never throws for **any** input string under **any** combination of options (`caseSensitive`, `strictTrailingSlash`, `strictQueryParams`, all 4 `urlParamsEncoding` values) — in the path, splat, and query positions. |

## buildParamMeta (parser)

Structural invariants of the pure path-pattern parser, verified **model-based**: a random structural model is rendered to a path and `buildParamMeta`'s output is checked against the model (the model — not the parser — is the oracle).

| #   | Invariant                       | Description                                                                                                                                                              |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exact classification            | `urlParams` / `queryParams` / `spatParams` / `paramTypeMap` / `pathPattern` and the set of constrained names all equal the independently-derived model, order included. |
| 2   | Splat ⊆ url, disjoint type map  | Every splat name is also a url param; no name is classified as both url and query.                                                                                      |
| 3   | pathPattern is the query-free residue | Re-parsing `meta.pathPattern` yields the same `urlParams` and an empty `queryParams`.                                                                              |
| 4   | Determinism / purity            | Two calls on the same input produce structurally equal output.                                                                                                          |
| 5   | Optional marker vs directly-following query | A `?` optional marker immediately followed by a query (`/:id??tab` → `:id?` + `?tab`) is separated correctly — the optional `?` is not mistaken for the query separator, `pathPattern` keeps the marker, and `queryParams` has no spurious `?`. (Bug found by the structural suite; same class as #738.) |

## Roundtrip Extensions

| #   | Invariant                      | Description                                                                                                                                                                                  |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Optional param value roundtrip | `match(buildPath("search", {query})).params` equals `{query}`. Optional parameter values survive the build/match cycle, not just the route name (which Matching #3 already covers).          |
| 2   | Encoding-aware roundtrip       | `match(buildPath(name, params)).params` equals the original params for all 4 encoding strategies (`default`, `uri`, `uriComponent`, `none`) **for values without `/` in a non-splat param**. Matching #1/#2 only test with default encoding. **Scope caveat (audit 1.5):** a `/` inside a non-splat param value only roundtrips under `default`/`uriComponent` (which percent-encode `/`→`%2F`); under `uri` (`encodeURI`) and `none` (identity) the `/` stays raw and becomes an extra path segment, so the single-param route no longer matches. Use a **splat** param (`*path`) for multi-segment values — Encoding #2/#3 cover splat roundtrip across all strategies. |

## Undefined-strip (Layered Contract)

Level 2 of the layered `undefined`-strip contract defined in [rfc-query-param-semantics.md](../core/.claude/rfc/rfc-query-param-semantics.md) section 5.3 bis. `SegmentMatcher.buildPath` never emits `undefined` into the final URL regardless of how the injected query engine behaves.

| #   | Invariant                                   | Description                                                                                                                                                                           |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | URL output never contains `undefined`       | For any `params` (including mixed `defined + undefined`), `buildPath(name, params, { queryParamsMode: "loose" })` produces a URL with no `=undefined` segment and no literal `undefined` key. |
| 2   | Build → match recovers only defined keys    | After `match(buildPath(name, params))`, any key whose input value was `undefined` is absent from `result.params`. Defined keys survive the cycle.                                     |
| 3   | Undefined-key equivalence                   | `buildPath(name, {defined, key: undefined})` produces the identical URL to `buildPath(name, {defined})` for any defined subset. Adding or removing `undefined` keys does not affect output. |
| 4   | Engine-independence of final URL            | Even when the injected `buildQueryString` performs no filtering, the final URL produced by `buildPath` contains no `=undefined` segment. Documents the current matcher contract (strip happens at engine or caller level). |

## Test Files

| File                                              | Category                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tests/property/encoding.properties.ts`           | URL parameter encoding/decoding                                                      |
| `tests/property/matching.properties.ts`           | Segment Trie matching, path building, rejection, hash stripping, encoding roundtrip |
| `tests/property/buildparammeta.properties.ts`     | `buildParamMeta` structural invariants (model-based)                                |
| `tests/property/canonicalization.properties.ts`   | `build∘match` fixpoint (rewritePathOnMatch contract)                                 |
| `tests/property/query-modes.properties.ts`        | strictQueryParams, queryParamsMode loose/default, query value roundtrip             |
| `tests/property/match-semantics.properties.ts`    | strictTrailingSlash, constraint filtering, splat backtracking, never-throw matrix   |
| `tests/property/decode-safety.properties.ts`      | `match()` never-throw on valid-hex/invalid-UTF-8 percent (#737)                      |
| `tests/property/param-grammar.properties.ts`      | Unified param-name grammar + constraint-`?` no-leak (#738)                           |
| `tests/property/param-name-conflict.properties.ts`| Param-name aliasing conflict detection (#736)                                       |
| `tests/property/undefined-strip.properties.ts`    | Undefined-strip layered contract (RFC 5.3 bis, level 2)                             |
