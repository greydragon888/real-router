# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## URL Roundtrip

| #   | Invariant                                           | Description                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `matchUrl(buildUrl(name))` preserves route name     | Parsing a URL that was built from a route name returns a state whose `name` matches the original input. Confirms that `buildUrl` and `matchUrl` are inverse operations for static routes.                                                                             |
| 2   | `matchUrl(buildUrl(name, params))` preserves params | After a full URL roundtrip with a parameterized route, the decoded `params.id` equals the original value. Verifies that URL encoding and decoding are symmetric for path parameters.                                                                                  |
| 3   | `buildUrl` is deterministic                         | Calling `buildUrl` twice with the same route name and params produces identical URLs. Ensures the function has no hidden state or randomness.                                                                                                                         |
| 4   | URL roundtrip preserves URL-unsafe characters       | Arbitrary strings (Unicode, slashes, percent-literals, query-like chars) survive the `buildPath → new URL() → extractPath → matchPath` pipeline. Uses `fc.pre` to skip unsupported inputs — verifies that IF the route matches, the param value is preserved exactly. |

## Base Path

| #   | Invariant                                        | Description                                                                                                                                                                                                                    |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Built URL always starts with the configured base | For any normalized base path, `buildUrl` produces a URL that begins with that base followed by `/`. Confirms the base is always prepended and the path separator is never omitted.                                             |
| 2   | Roundtrip works for any normalized base          | `matchUrl(buildUrl(name))` returns the correct route name regardless of which normalized base path the router was configured with. Ensures base path stripping in `matchUrl` is the exact inverse of prepending in `buildUrl`. |
| 3   | Roundtrip preserves params for non-empty base    | With a non-empty base path, `params.id` survives a full `buildUrl` → `matchUrl` roundtrip unchanged. Confirms that base path stripping does not corrupt the path segment that carries the parameter.                           |

## Trailing Slash Normalization

| #   | Invariant                                                       | Description                                                                                                                                                                                               |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trailing slash in base has no effect on output                  | A base configured with a trailing slash (e.g., `/app/`) produces the same URL as the same base without one (e.g., `/app`). Verifies that `normalizeBase` is applied consistently before URL construction. |
| 2   | URLs built with a trailing-slash base contain no double slashes | When the base has a trailing slash, the resulting URL never contains `//`. Prevents malformed URLs that would break server routing or URL matching.                                                       |

## Query String Resilience

| #   | Invariant                                                 | Description                                                                                                                                                                                       |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Arbitrary query strings do not break route resolution     | Appending random query parameters to a valid URL does not prevent `matchUrl` from identifying the correct route. Confirms the URL API separates pathname from search through the full pipeline.   |
| 2   | Query strings do not break parameterized route resolution | Appending random query parameters to a parameterized route URL preserves both route name and `params.id`. Verifies that search string extraction does not interfere with path parameter decoding. |

## Path Extraction

| #   | Invariant                                                         | Description                                                                                                                                                            |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `extractPath` always returns a path starting with `/`             | For any pathname built from `base + path`, `extractPath` returns a result beginning with `/`. Guarantees the path matcher always receives valid input.                 |
| 2   | `extractPath(base, base)` returns `/`                             | When the pathname equals the base exactly (empty stripped path), the result is `/`. Covers the `index` route edge case.                                                |
| 3   | `extractPath` returns pathname unchanged when base does not match | When the pathname does not start with the configured base, `extractPath` returns it as-is. Ensures misconfigured or external URLs are not corrupted by base stripping. |

## URL Resolution — Negative Case

| #   | Invariant                                          | Description                                                                                                                                                          |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `matchUrl` returns undefined for non-matching URLs | URLs that do not correspond to any route in the tree produce `undefined`. Validates the negative path of the full URL resolution pipeline (parse → extract → match). |

## Test Files

| File                                         | Invariants | Category                                                                                              |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `tests/property/browserPlugin.properties.ts` | 15         | URL roundtrip, base path, trailing slash, query string resilience, path extraction, negative matching |
