# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## URL Roundtrip

| #   | Invariant                                       | Description                                                                                                                                                                                            |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `matchUrl(buildUrl(name))` preserves route name | Parsing a URL that was built from a route name returns a state whose `name` matches the original input. Confirms that `buildUrl` and `matchUrl` are inverse operations across arbitrary hash prefixes. |
| 2   | State path matches `buildPath` output           | The `path` field in the matched state equals what `buildPath` returns for the same route. Verifies that the hash URL layer does not alter the underlying path representation.                          |

## Hash Prefix Inclusion

| #   | Invariant                           | Description                                                                                                                 |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Built URL contains the hash prefix  | `buildUrl` output always includes `#${prefix}` as a substring. Ensures the configured prefix is never silently dropped.     |
| 2   | Built URL starts with `#${prefix}/` | The URL begins with the full hash prefix followed by `/`. Confirms the separator between prefix and path is always present. |

## Hash Prefix Stripping

| #   | Invariant                                                               | Description                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `matchUrl` returns a defined state for a URL built with the same prefix | When the URL was produced by `buildUrl` with a given prefix, `matchUrl` always finds a matching route. Verifies that prefix stripping is the exact inverse of prefix inclusion. |
| 2   | `matchUrl` returns `undefined` for a URL with a different prefix        | A URL carrying a prefix that does not match the router's configured prefix resolves to no route. Prevents cross-prefix collisions when multiple hash routers share a page.      |

## Regex Escaping

| #   | Invariant                                          | Description                                                                                                                                                              |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `createHashPrefixRegex` matches the literal prefix | The compiled regex matches `#${prefix}` and `#${prefix}/some/path` as literal strings, even when the prefix contains regex metacharacters such as `.`, `+`, `?`, or `*`. |
| 2   | Regex does not match a different literal character | The regex rejects a hash followed by any character other than the configured prefix. Confirms that metacharacters are escaped and not interpreted as wildcards.          |
| 3   | Regex does not match a bare `#` with no prefix     | A string containing only `#` does not satisfy the regex. Prevents the empty-prefix edge case from matching everything.                                                   |

## Default Prefix Behavior

| #   | Invariant                                               | Description                                                                                                                                                           |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Empty prefix produces URLs starting with `#/`           | When `hashPrefix` is `""`, `buildUrl` output starts with `#/` and not `#!/`. Confirms the default configuration uses plain hash routing without a hashbang.           |
| 2   | `createHashPrefixRegex` returns `null` for empty prefix | An empty prefix yields `null` instead of a regex, signalling that simple `hash.slice(1)` stripping should be used. Avoids an unnecessary regex match on the hot path. |

## Parameter Encoding

| #   | Invariant                                                  | Description                                                                                                                                                                                             |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Path param `id` survives `buildUrl` → `matchUrl` roundtrip | After encoding a route with a parameterized path and parsing the resulting URL, `state.params.id` equals the original value. Verifies that URL encoding and decoding are symmetric for hash-based URLs. |
| 2   | State path matches `buildPath` after param roundtrip       | The `path` in the matched state equals `buildPath` output for the same route and params. Confirms the path representation is stable across the full encode/decode cycle.                                |

## URL-Unsafe Encoding

| #   | Invariant                                                        | Description                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Arbitrary string `id` survives `buildUrl` → `matchUrl` roundtrip | Path params containing URL-unsafe characters (spaces, `&`, `=`, `#`, unicode) are correctly encoded by `buildUrl` and decoded by `matchUrl`. Verifies that encoding is truly symmetric, not just for ASCII alphanumeric values. |

## Base Path

| #   | Invariant                                         | Description                                                                                                                                                         |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Built URL starts with `${base}#${prefix}/`        | When a `base` option is configured, `buildUrl` output always starts with the base followed by `#`, the hash prefix, and `/`. Ensures base is not silently dropped.  |
| 2   | `buildUrl` → `matchUrl` roundtrip works with base | A URL built with a non-empty base can be parsed back to the original route name via `matchUrl`. Verifies that the base path before `#` does not break hash parsing. |

## Hash Fallback

| #   | Invariant                                                    | Description                                                                                                                                                            |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `extractHashPath` returns `"/"` for prefix-only hash         | When the hash contains only the prefix and no path (e.g., `#!`), `extractHashPath` falls back to `"/"`. This maps to the index route and prevents empty-path matching. |
| 2   | `extractHashPath` returns `"/"` for bare `#` with null regex | A bare `#` with no prefix regex yields `"/"` after `hash.slice(1)` produces an empty string. Ensures the fallback works for the default (no prefix) configuration.     |

## Route Rejection

| #   | Invariant                                                      | Description                                                                                                                                                     |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `matchUrl` returns `undefined` for hash path matching no route | When the hash URL contains a valid prefix but the path segment doesn't match any defined route, `matchUrl` returns `undefined`. Prevents phantom route matches. |

## Test Files

| File                                      | Invariants | Category                                                                                                                                               |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/property/hashPlugin.properties.ts` | 19         | URL roundtrip, hash prefix inclusion, prefix stripping, regex escaping, default prefix, parameter encoding, unsafe encoding, base, fallback, rejection |
