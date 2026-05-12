# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Link Props Equality (areLinkPropsEqual)

| #   | Invariant                                       | Description                                                                                                                                                                             |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reflexivity                                     | `areLinkPropsEqual(p, p) === true` for any `LinkProps`. A props object is always equal to itself regardless of the values it contains.                                                  |
| 2   | Symmetry                                        | `areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)`. The comparison order does not affect the result.                                                                                  |
| 3   | Single primitive prop change detects inequality | Changing any single primitive prop (`routeName`, `activeStrict`, `className`) while keeping others identical returns `false`. The comparator is sensitive to every individual field.      |
| 4   | Deep-equal routeParams with same key order      | Two distinct `routeParams` objects with identical keys and values compare as equal via `shallowEqual` (`Object.is` per key, order-insensitive).                                          |

## Shallow Equality (shallowEqual)

| #   | Invariant                              | Description                                                                                                                                                                                                |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reflexivity                            | `shallowEqual(o, o) === true` (Object.is fast-path). Includes the public CLAUDE.md contract that 99 % of Links pass `routeParams=undefined` and hit this branch.                                              |
| 2   | Symmetry                               | `shallowEqual(a, b) === shallowEqual(b, a)`. Requires the `hasOwnProperty` guard in the inner loop — without it, `shallowEqual({a:undefined}, {b:""})` returned `true` while the reverse returned `false`. |
| 3   | NaN-aware (Object.is, not `===`)       | `Object.is(NaN, NaN) === true` and `Object.is(+0, -0) === false`. Strict equality would invert both. Property tests check NaN sameness and +0/-0 distinction over arbitrary records.                       |
| 4   | Nullable short-circuit                 | `shallowEqual(undefined, record) === false` and `shallowEqual(record, undefined) === false` (no NPE). `shallowEqual(undefined, undefined) === true` via the Object.is fast-path.                          |
| 5   | Key-count short-circuit                | Different `Object.keys.length` returns `false` without iterating values. Adding a single key to one side breaks equality (verified symmetrically).                                                          |
| 6   | Key-order insensitivity                | `{a:1, b:2}` ≡ `{b:2, a:1}` regardless of internal insertion order. Documented public contract in CLAUDE.md L376.                                                                                          |

## Class Name Helper (buildActiveClassName)

| #   | Invariant                              | Description                                                                                                                                                                                                |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No double spaces in active concat     | When `isActive=true`, result must NOT contain `"  "` regardless of whitespace padding in base/active inputs. Regression-locks the original token-join bug.                                                  |
| 2   | Active class present                   | When `isActive=true` and `activeClassName` is a non-empty token, the result contains the token.                                                                                                            |
| 3   | Active class appears at most once     | If the active token already exists in base, the result has exactly one occurrence (token-level dedup via `Set`).                                                                                            |
| 4   | `isActive=false` returns base verbatim | When `isActive=false`, the function returns `baseClassName` unchanged.                                                                                                                                     |
| 5   | Whitespace-only active → base verbatim | When `activeClassName` is empty/whitespace-only (no `\S+` tokens after `parseTokens`), the function returns `baseClassName` as-is via `?? undefined` (not `?:`, so empty strings are preserved).            |
| 6   | Idempotency                            | `buildActiveClassName(true, a, buildActiveClassName(true, a, base))` yields the same token set as one application (no duplicates accumulate over repeated apply).                                            |

## Href Builder (buildHref)

| #   | Invariant                                          | Description                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `buildUrl=undefined` → fallback to `buildPath`     | If the URL plugin is absent, `buildHref` falls back to `router.buildPath` for the path-only href.                                                                                                          |
| 2   | `buildUrl` defined and returns string → preferred  | `buildHref` returns the `buildUrl` result, not `buildPath`, when both are defined.                                                                                                                         |
| 3   | Both throw → `undefined` + console.error           | Logs `"[real-router] Route \"<name>\" is not defined. The element will render without an href attribute."` and returns `undefined`.                                                                          |
| 4   | Hash encoding (RFC 3986 + defensive `%23`)         | On the `buildPath` fallback path, the appended fragment is `encodeURI`'d with `#` defensively replaced by `%23`. No literal `#` remains in the rendered fragment.                                          |
| 5   | Leading `#` is stripped before encoding/forwarding | `<Link hash="#section">` and `<Link hash="section">` produce identical hrefs — the leading `#` is a convenience for callers and is not part of the fragment.                                                |
| 6   | `buildUrl` receives `{ hash }` only when defined   | No-hash call → `buildUrl(name, params, undefined)`; with-hash call → `buildUrl(name, params, { hash: <stripped> })`. The helper must NOT pass `{ hash: undefined }` — plugins distinguish absent from empty. |

## Navigate Helper (navigateWithHash, #532)

| #   | Invariant                                         | Description                                                                                                                                                                                                |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Same route + same hash → no force / no hashChange | When `current.name === routeName`, params shallow-equal, and `current.hash === newHash`, the helper passes opts through verbatim. Adding `force: true` here would create an extra transition core would reject. |
| 2   | Same route + different hash → force + hashChange  | When the new hash differs from `state.context.url.hash`, the helper sets `opts.force = true` and `opts.hashChange = true` so core's SAME_STATES check is bypassed and subscribers can disambiguate.            |
| 3   | Different route → no hash bypass                  | The auto-force logic is exclusively the same-route hash-change signal. Cross-route navigation never sets `force`/`hashChange` even if hashes differ.                                                       |
| 4   | `opts.hash` propagation                           | `hash === undefined` → `opts.hash` is not set (preserve current). `hash` defined → `opts.hash` is forwarded verbatim to `router.navigate`.                                                                  |
| 5   | No current state → straight navigate              | When `router.getState()` returns `undefined` (router not started), the helper skips the same-route force logic and forwards opts as-is.                                                                    |

## HTTP Status Sink (createHttpStatusSink)

| #   | Invariant                              | Description                                                                                                                                                                                                |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fresh `code === undefined`             | Every factory call returns `{ code: undefined }`. A module-level singleton would leak HTTP status across concurrent SSR requests; writes to a previous sink must not affect subsequent fresh sinks.         |
| 2   | Distinct identity per call             | N calls produce N distinct object references. `<HttpStatusCode>` writes through to the sink — sharing a reference across requests cross-pollinates response codes between concurrent renders.              |

## RouteView Pipeline (collectElements / buildRenderList / processMatch)

Issue [#626](https://github.com/greydragon888/real-router/issues/626). Covers
the three internal stages of `<RouteView>` over generated `ReactElement`
trees of `<Match>` / `<Self>` / `<NotFound>` leaves (optionally
`<Fragment>`-wrapped).

| #   | Invariant                                          | Description                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `collectElements` source-order preservation        | For any flat input of `<Match>` / `<Self>` / `<NotFound>`, the result preserves source order — `result[i].type === input[i].type` for every index.                                                          |
| 2   | `collectElements` flatness post-recursion          | Fragments (including nested) are flattened; result contains only `Match` / `Self` / `NotFound` element types — never `Fragment`, host elements, or arrays.                                                  |
| 3   | `buildRenderList` first-match wins                 | N copies of `<Match segment=X>` with `routeName=X` produce a render list with exactly one entry. Duplicate segments are short-circuited by `processMatch.alreadyActive`.                                    |
| 4   | `buildRenderList` first-Self wins                  | N copies of `<Self>` with `routeName === nodeName` produce exactly one rendered entry with key `__route-view-self__`. Subsequent `<Self>` elements update no state in `recordFallback`.                       |
| 5   | `buildRenderList` Self priority over NotFound      | When `<Self>` matches (`routeName === nodeName`), `<NotFound>` is never appended even if the route also satisfies `UNKNOWN_ROUTE`. Self has priority in `appendFallback`.                                    |
| 6   | `buildRenderList` activeMatchFound precludes fallback | Any activating `<Match>` suppresses both `<Self>` and `<NotFound>` from the render list. `appendFallback` is gated by `!activeMatchFound`.                                                                  |
| 7   | `processMatch` keepAlive sticky activation         | Once a `keepAlive=true` segment becomes visible, it stays in `hasBeenActivated` for the RouteView's lifetime. Subsequent navigations to a different route still render it (in hidden mode).                  |
| 8   | `processMatch` alreadyActive short-circuit         | After the first `<Match>` activates within a `buildRenderList` pass, subsequent matches with overlapping segments are short-circuited via the `alreadyActive` flag — exactly one entry rendered per pass.    |

Cross-check (not in #626, tightens fallback contract): `<NotFound>` is
appended to the render list **only** when `routeName === UNKNOWN_ROUTE`
AND no `<Match>` activated AND no `<Self>` consumed the slot.

## Segment Matching (isSegmentMatch)

| #   | Invariant                  | Description                                                                                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Exact match ↔ strict equality | `isSegmentMatch(r, s, true)` returns `true` if and only if `r === s`. The exact flag delegates to strict string equality with no prefix logic.                                 |
| 2   | Monotonicity               | If `isSegmentMatch(r, s, true)` then `isSegmentMatch(r, s, false)`. Exact match is a subset of non-exact match — relaxing the constraint never removes a previously valid match. |
| 3   | Self-match                 | `isSegmentMatch(name, name, false) === true` for any valid route name. Every name is a prefix of itself at a dot boundary.                                                     |
| 4   | Dot boundary               | `"users"` does not match `"users2"` non-exactly. Prefix matching respects dot separators and does not match partial segment names (e.g., `users` vs `users2`).                 |
| 5   | Empty segment → false      | An empty `segment` argument never matches a non-empty route name (root case handled by structural callers, not by `isSegmentMatch`).                                            |

## Test Files

| File                                            | Invariants | Category                                                                                       |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `tests/property/link.properties.ts`             | 4          | `areLinkPropsEqual` — reflexivity, symmetry, sensitivity, deep-equal                            |
| `tests/property/shallowEqual.properties.ts`     | 6          | `shallowEqual` — reflexivity, symmetry, NaN-aware, nullable, key-count, key-order               |
| `tests/property/linkUtils.properties.ts`        | 6 + 6      | `buildActiveClassName` (6) + `buildHref` incl. hash encoding/strip/forwarding (6)              |
| `tests/property/navigateWithHash.properties.ts` | 5          | `navigateWithHash` (#532) — same-route same/different hash, cross-route, propagation, no-state |
| `tests/property/httpStatusSink.properties.ts`   | 2          | `createHttpStatusSink` — fresh code, distinct identity per call                                |
| `tests/property/routeView.properties.ts`        | 5          | `isSegmentMatch` — exact, monotonicity, self-match, dot boundary, empty segment                |
| `tests/property/routeView.pipeline.properties.ts` | 8 + 1    | RouteView pipeline (#626) — `collectElements` (2), `buildRenderList` (4), `processMatch` (2) + cross-check |
