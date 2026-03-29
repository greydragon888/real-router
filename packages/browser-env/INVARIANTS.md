# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Base Path Normalization

| #   | Invariant                                    | Description                                                                                                                                               |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `normalizeBase` is idempotent                | Calling `normalizeBase` twice produces the same result as calling it once. Ensures the function reaches a fixed point and repeated normalization is safe. |
| 2   | `normalizeBase` produces canonical form      | The result is either an empty string or a path that starts with `/` and has no trailing `/`. Guarantees a consistent shape for base path concatenation.   |
| 3   | `normalizeBase` preserves non-empty segments | Non-empty segments between slashes are preserved after normalization. Only leading/trailing slash handling changes the string, not its content.           |
| 4   | `normalizeBase("")` === `""`                 | Empty string input produces empty string output. Boundary case ensuring the identity property holds for the degenerate input.                             |

## Path Encoding

| #   | Invariant                                  | Description                                                                                                                                                   |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `safelyEncodePath` is idempotent           | Encoding an already-encoded path returns the same string. Prevents double-encoding when the function is applied to paths that may have been encoded upstream. |
| 2   | `safelyEncodePath` preserves slash count   | The number of `/`-separated segments is the same before and after encoding. Encoding never introduces or removes path separators.                             |
| 3   | `safelyEncodePath` is a fixpoint for ASCII | ASCII-only paths are returned unchanged. Only non-ASCII characters are percent-encoded.                                                                       |

## URL Parsing

| #   | Invariant                                         | Description                                                                                                                                                  |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `safeParseUrl` accepts valid HTTP paths           | Any well-formed path starting with `/` parses to a `URL` object whose `pathname` matches the input exactly. Confirms the parser does not mangle valid paths. |
| 2   | `safeParseUrl` rejects non-HTTP protocols         | URLs with protocols other than `http:` or `https:` (e.g. `ftp:`, `data:`, `file:`, `blob:`, `ws:`) return `null`. Prevents protocol-based injection.         |
| 3   | `safeParseUrl` isolates pathname from search/hash | The `pathname` property equals the path portion of the URL regardless of appended query strings or hash fragments.                                           |

## History API Wrappers

| #   | Invariant                                  | Description                                                                                                                                                           |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pushState` updates `location.pathname`    | After calling `pushState` with a given path, `globalThis.location.pathname` equals that path. Verifies the wrapper correctly delegates to the browser History API.    |
| 2   | `replaceState` updates `location.pathname` | After calling `replaceState` with a given path, `globalThis.location.pathname` equals that path. Verifies the wrapper correctly delegates to the browser History API. |

## Browser State Management

| #   | Invariant                                      | Description                                                                                                                                                                           |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `updateBrowserState` — push vs replace routing | When `replace` is `true`, calls `browser.replaceState`; when `false`, calls `browser.pushState`. Verifies the boolean flag correctly selects the History API method.                  |
| 2   | `updateBrowserState` — history state shape     | Only `name`, `params`, and `path` are stored in `history.state`. Transient and internal fields (`meta`, `id`, `transition`) are excluded to keep serialized state minimal and stable. |

## Route Extraction from Popstate

| #   | Invariant                                    | Description                                                                                                                                                          |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getRouteFromEvent` — valid state extraction | When `history.state` passes `isStateStrict`, the function extracts `name` and `params` directly without calling `matchPath`. Verifies the fast path for known state. |
| 2   | `getRouteFromEvent` — fallback to matchPath  | When `history.state` is invalid (null, undefined, or malformed), the function falls back to `api.matchPath(browser.getLocation())` to resolve the route.             |

## History Replacement Logic

| #   | Invariant                                             | Description                                                                                                                                     |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `shouldReplaceHistory` — `replace: true` forces true  | When `navOptions.replace` is `true`, the function always returns `true` regardless of other arguments.                                          |
| 2   | `shouldReplaceHistory` — no `fromState` forces true   | When `fromState` is `undefined` (first navigation) and `replace` is not explicitly set, the function returns `true` to avoid polluting history. |
| 3   | `shouldReplaceHistory` — reload to same state is true | When `navOptions.reload` is `true` and `areStatesEqual(to, from)` holds, the function returns `true` to replace rather than push a duplicate.   |
| 4   | `shouldReplaceHistory` — normal navigation is false   | When `replace` is `false`, `fromState` is defined, and the navigation is not a reload to the same state, the function returns `false`.          |

## Options Validation

| #   | Invariant                                         | Description                                                                                                                                   |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `createOptionsValidator` — valid types pass       | Partial options with types matching the defaults do not throw. Ensures correctly-typed configurations are accepted.                           |
| 2   | `createOptionsValidator` — invalid types throw    | Options with type mismatches against the defaults throw an `Error`. Catches misconfiguration at plugin init time.                             |
| 3   | `createOptionsValidator` — `undefined` opts pass  | Calling the validator with `undefined` does not throw. Allows omitting options entirely for default behavior.                                 |
| 4   | `createOptionsValidator` — unknown keys tolerated | Keys not present in the defaults object are silently ignored. Allows forward-compatible options objects without breaking existing validators. |

## Test Files

| File                                                | Invariants | Category                                                                           |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `tests/property/browserEnv.properties.ts`           | 16         | Base path normalization, path encoding, URL parsing, History API, state management |
| `tests/property/shouldReplaceHistory.properties.ts` | 4          | History replacement logic                                                          |
| `tests/property/validation.properties.ts`           | 4          | Options validation                                                                 |
