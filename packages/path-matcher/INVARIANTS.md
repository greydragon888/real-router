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

## Path Rejection

| #   | Invariant                            | Description                                                                                                                                                                    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Raw Unicode rejection                | `match()` returns `undefined` for paths containing raw Unicode characters (U+0080–U+FFFF). Unencoded Unicode in URL paths is rejected before trie traversal.                   |
| 2   | Double-slash rejection               | `match()` returns `undefined` for paths containing `//`. Consecutive slashes are invalid path structure.                                                                       |
| 3   | Hash fragment stripping              | `match(path + "#fragment")` produces the same result as `match(path)`. Fragment identifiers are silently stripped before matching.                                             |
| 4   | Malformed percent-encoding rejection | `match()` returns `undefined` when a matched param contains a malformed percent sequence (`%XX` where X is not a hex digit). Invalid encoding is caught during param decoding. |

## Roundtrip Extensions

| #   | Invariant                      | Description                                                                                                                                                                                  |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Optional param value roundtrip | `match(buildPath("search", {query})).params` equals `{query}`. Optional parameter values survive the build/match cycle, not just the route name (which Matching #3 already covers).          |
| 2   | Encoding-aware roundtrip       | `match(buildPath(name, params)).params` equals the original params for all 4 encoding strategies (`default`, `uri`, `uriComponent`, `none`). Matching #1/#2 only test with default encoding. |

## Test Files

| File                                    | Invariants | Category                                                                            |
| --------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `tests/property/encoding.properties.ts` | 7          | URL parameter encoding/decoding                                                     |
| `tests/property/matching.properties.ts` | 21         | Segment Trie matching, path building, rejection, hash stripping, encoding roundtrip |
