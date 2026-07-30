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
| 7   | Determinism                            | Two consecutive calls with the same `(a, b)` arguments produce the same boolean. Locks the function against accidental introduction of hidden state (identity-keyed cache, mutable closure).                |

## Class Name Helper (buildActiveClassName)

| #   | Invariant                              | Description                                                                                                                                                                                                |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No double spaces in active concat     | When `isActive=true`, result must NOT contain `"  "` regardless of whitespace padding in base/active inputs. Regression-locks the original token-join bug.                                                  |
| 2   | Active class present                   | When `isActive=true` and `activeClassName` is a non-empty token, the result contains the token.                                                                                                            |
| 3   | Active class appears at most once     | If the active token already exists in base, the result has exactly one occurrence (token-level dedup via `Set`).                                                                                            |
| 4   | `isActive=false` returns base verbatim | When `isActive=false`, the function returns `baseClassName` unchanged.                                                                                                                                     |
| 5   | Whitespace-only active → base verbatim | When `activeClassName` is empty/whitespace-only (no `\S+` tokens after `parseTokens`), the function returns `baseClassName` as-is via `?? undefined` (not `?:`, so empty strings are preserved).            |
| 6   | Idempotency                            | `buildActiveClassName(true, a, buildActiveClassName(true, a, base))` yields the same token set as one application (no duplicates accumulate over repeated apply).                                            |
| 7   | Whitespace normalization               | Output never contains tab / newline / CR or any consecutive whitespace runs. Stronger than #1: catches a regression to character iteration that would emit non-space whitespace mid-result.                |
| 8   | Double-apply different active accumulates | `buildActiveClassName(true, B, buildActiveClassName(true, A, base))` contains both `A` and `B`. Chaining different active tokens performs union over base, not replacement.                              |
| 9   | Very long base className                  | A base with 256..1024 unique tokens + `isActive=true` yields exactly `K + 1` tokens (where K is the base token count) and the active token appears exactly once. Catches O(n²) regressions in dedup.    |

## Href Builder (buildHref)

| #   | Invariant                                          | Description                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `buildUrl=undefined` → fallback to `buildPath`     | If the URL plugin is absent, `buildHref` falls back to `router.buildPath` for the path-only href.                                                                                                          |
| 2   | `buildUrl` defined and returns string → preferred  | `buildHref` returns the `buildUrl` result, not `buildPath`, when both are defined.                                                                                                                         |
| 3   | Both throw → `undefined` + console.error           | Logs `"[real-router] Route \"<name>\" is not defined. The element will render without an href attribute."` and returns `undefined`.                                                                          |
| 4   | Hash encoding (RFC 3986 + defensive `%23`)         | On the `buildPath` fallback path, the appended fragment is `encodeURI`'d with `#` defensively replaced by `%23`. No literal `#` remains in the rendered fragment.                                          |
| 5   | Leading `#` is stripped before encoding/forwarding | `<Link hash="#section">` and `<Link hash="section">` produce identical hrefs — the leading `#` is a convenience for callers and is not part of the fragment.                                                |
| 6   | `buildUrl` receives `{ hash }` only when defined   | No-hash call → `buildUrl(name, params, search, undefined)`; with-hash call → `buildUrl(name, params, search, { hash: <stripped> })`. Query channel at position 3 (RFC-4 M2 / #1548), hash options at position 4. The helper must NOT pass `{ hash: undefined }` — plugins distinguish absent from empty. |
| 7   | No literal `#` in fragment                         | Generalizes the implicit assertion in #4: across all input shapes (incl. emoji / RTL / ZWJ-composed text) the fragment portion of the rendered href never contains a literal `#` — only `%23`.            |

## Navigate Helper (navigateWithHash, #532)

| #   | Invariant                                         | Description                                                                                                                                                                                                |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Same route + same hash → no force / no hashChange | When `current.name === routeName`, params shallow-equal, and `current.hash === newHash`, the helper passes opts through verbatim. Adding `force: true` here would create an extra transition core would reject. |
| 2   | Same route + different hash → force + hashChange  | When the new hash differs from `state.context.url.hash`, the helper sets `opts.force = true` and `opts.hashChange = true` so core's SAME_STATES check is bypassed and subscribers can disambiguate.            |
| 3   | Different route → no hash bypass                  | The auto-force logic is exclusively the same-route hash-change signal. Cross-route navigation never sets `force`/`hashChange` even if hashes differ.                                                       |
| 4   | `opts.hash` propagation                           | `hash === undefined` → `opts.hash` is not set (preserve current). `hash` defined → `opts.hash` is forwarded verbatim to `router.navigate`.                                                                  |
| 5   | No current state → straight navigate              | When `router.getState()` returns `undefined` (router not started), the helper skips the same-route force logic and forwards opts as-is.                                                                    |
| 6   | Force + hashChange tandem (XNOR)                   | Across every (currentName, targetName, currentHash, newHash) combination, `opts.force` and `opts.hashChange` are either both set OR both absent. Stronger than #2: prevents a future refactor from splitting the flags into independent code paths.                                                       |
| 7   | Shallow params equality determinism                | Same-route detection uses `shallowEqual(current.params, routeParams)`, not reference equality. Distinct param objects with identical shape trigger the hash-bypass path; structurally different params skip it even when the route name matches.                                                       |

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
| 7   | `processMatch` keepAlive sticky activation         | Once a `keepAlive=true` segment activates, `buildRenderList` reports it via `activatedName`; RouteView commits it to `hasBeenActivated` in a post-render effect (#1251), keeping it sticky for the RouteView's lifetime. Subsequent navigations to a different route still render it (in hidden mode). |
| 8   | `processMatch` alreadyActive short-circuit         | After the first `<Match>` activates within a `buildRenderList` pass, subsequent matches with overlapping segments are short-circuited via the `alreadyActive` flag — exactly one entry rendered per pass.    |
| 9   | `collectElements` recursion termination            | Depth-N Fragment wrapping (N up to 10) terminates and returns the inner Match element. Defends against an iterator regression that loses the terminating case.                                              |
| 10  | `buildRenderList` stability                        | Two consecutive calls with identical `(elements, routeName, freshSet)` produce render lists of equal length, identical `activeMatchFound`, and identical per-index `type` + `key`. No hidden state.         |
| 11  | `processMatch` keepAlive monotonicity              | Across a sequence of `buildRenderList` passes with distinct route names targeting different `<Match keepAlive>` segments, the committed `hasBeenActivated` (grown by RouteView's effect from each pass's `activatedName`) grows monotonically — no entry is ever removed. |
| 12  | Large element arrays                               | `buildRenderList` correctly resolves first-match-wins and NotFound conditional across 50..120 Match elements. Guards against an O(n²) regression in the linear walk.                                       |
| 13  | keepAlive with falsy routeName                     | `<Match keepAlive segment="x">` against `routeName=""` does NOT activate and does NOT enter the keepAlive set. A segment previously activated (committed via the effect) stays in `hasBeenActivated` and renders hidden during a `routeName=""` transition. |
| 14  | `buildRenderList` first-NotFound wins (#1220)      | N copies of `<NotFound>` on `routeName === UNKNOWN_ROUTE` produce exactly one rendered entry (key `__route-view-not-found__`) carrying the **first** NotFound's children — symmetric with first-Self (#4). Count alone can't discriminate (last-wins also yields one entry); the child marker proves first-wins. `recordFallback` guards the assignment with `notFoundFound` (before #1220 it was unconditional → last-wins). |

Cross-check (not in #626, tightens fallback contract): `<NotFound>` is
appended to the render list **only** when `routeName === UNKNOWN_ROUTE`
AND no `<Match>` activated AND no `<Self>` consumed the slot.

**#1251 — `buildRenderList` is a pure walk:** it no longer mutates
`hasBeenActivated` inline (which coupled the pure winner computation to a side
effect — blocking memoization — and was unsafe under concurrent rendering, where
a discarded render would leave a phantom entry that later renders an un-committed
match as a hidden keepAlive subtree). It READS the Set (a `ReadonlySet`) for the
hidden-render decision and RETURNS `activatedName`; RouteView commits it to the
Set in a post-render `useEffect`, so only committed renders record an activation.
Invariants 7 / 11 / 13 simulate that effect (adding `activatedName` to the Set)
between passes.

## Segment Matching (isSegmentMatch)

| #   | Invariant                  | Description                                                                                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Exact match ↔ strict equality | `isSegmentMatch(r, s, true)` returns `true` if and only if `r === s`. The exact flag delegates to strict string equality with no prefix logic.                                 |
| 2   | Monotonicity               | If `isSegmentMatch(r, s, true)` then `isSegmentMatch(r, s, false)`. Exact match is a subset of non-exact match — relaxing the constraint never removes a previously valid match. |
| 3   | Self-match                 | `isSegmentMatch(name, name, false) === true` for any valid route name. Every name is a prefix of itself at a dot boundary.                                                     |
| 4   | Dot boundary               | `"users"` does not match `"users2"` non-exactly. Prefix matching respects dot separators and does not match partial segment names (e.g., `users` vs `users2`).                 |
| 5   | Empty segment → false      | An empty `segment` argument never matches a non-empty route name (root case handled by structural callers, not by `isSegmentMatch`).                                            |
| 6   | Dot-boundary multi-segment | For a deep route name `a.b.c.d` (up to 5 segments): every ancestor prefix matches non-exactly; only the full path matches exactly; a segment longer than the route never matches either way. |
| 7   | Empty routeName (root)     | `isSegmentMatch("", segment, *)` returns `false` for every non-empty segment (exact + non-exact). `isSegmentMatch("", "", *)` returns `false` (early-return on empty `fullSegmentName`). Locks root-vs-segment behavior — root self-matching is `processMatch`'s job via `nodeName`, not this function's. |
| 8   | Deep route names           | Self-match and prefix-ladder behavior holds for 20..64-segment route names. Defends against an accidental O(n²) regression in the dot-boundary regex. |

## Test Files

| File                                            | Invariants | Category                                                                                       |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `tests/property/link.properties.ts`             | 4          | `areLinkPropsEqual` — reflexivity, symmetry, sensitivity, deep-equal                            |
| `tests/property/shallowEqual.properties.ts`     | 7          | `shallowEqual` — reflexivity, symmetry, NaN-aware, nullable, key-count, key-order, determinism  |
| `tests/property/linkUtils.properties.ts`        | 9 + 7      | `buildActiveClassName` (9 — incl. very-long base) + `buildHref` (7)                            |
| `tests/property/navigateWithHash.properties.ts` | 7          | `navigateWithHash` (#532) — same-route same/different hash, cross-route, propagation, no-state, tandem, params determinism |
| `tests/property/httpStatusSink.properties.ts`   | 2          | `createHttpStatusSink` — fresh code, distinct identity per call                                |
| `tests/property/routeView.properties.ts`        | 8          | `isSegmentMatch` — exact, monotonicity, self-match, dot boundary, empty segment, multi-segment depth, empty routeName, deep names |
| `tests/property/routeView.pipeline.properties.ts` | 14 + 1   | RouteView pipeline (#626, #1220) — `collectElements` (3: order, flatness, termination), `buildRenderList` (7: first-match, first-Self, first-NotFound, Self priority, activeMatchFound, stability, large arrays), `processMatch` (4: sticky, alreadyActive, monotonicity, falsy routeName) + cross-check |

## Reactive Lifecycle Regressions (integration, not property-based)

Example-based integration guards in `tests/integration/reactive-lifecycle.test.tsx`
lock the reactive-source lifecycle fixes from the #778 audit and the #1218
enter-guard. These are distinct from the fast-check invariants above — they
assert concrete mount / hide / show sequences under React 19's `<Activity>`,
not generated inputs.

| Probe | Locks                                                                                                              | Issue                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1    | `RouterProvider` under `<Activity>` is fresh after hide → navigate → show (`createRouteSource` reconnect reconcile) | [#765](https://github.com/greydragon888/real-router/issues/765)           |
| P2    | A `RouterErrorBoundary` mounted AFTER a navigation error still shows the fallback (eager error-source priming)      | [#765](https://github.com/greydragon888/real-router/issues/765) / [#778](https://github.com/greydragon888/real-router/issues/778) |
| P3    | N unique-params `<Link>` release their router subscriptions on unmount (lazy source connection)                     | [#766](https://github.com/greydragon888/real-router/issues/766)           |
| PC2   | `useRouteEnter` skips its handler after an `<Activity>` catch-up reconcile leaves `previousRoute` undefined         | [#1218](https://github.com/greydragon888/real-router/issues/1218)         |

The `useRouteEnter` mount-side `!previousRoute` guard (#1218) is additionally
covered by a functional regression (PC1) in
`tests/functional/useRouteEnter.test.tsx` — the Provider mounted AFTER a
navigation, where the source's initial snapshot carries `previousRoute:
undefined` while `transition.from` is truthy.
