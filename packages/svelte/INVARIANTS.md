# @real-router/svelte — Invariants

Invariants verified by property-based tests in `tests/property/`.

## shouldNavigate (Link click handler)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Left click, no modifiers** — `shouldNavigate(evt) === true` | Standard left-click must trigger client-side navigation |
| 2 | **Any single modifier key** — `shouldNavigate(evt) === false` | Meta/Alt/Ctrl/Shift clicks open in new tab or trigger OS actions — must not be intercepted |
| 3 | **Non-zero button** — `shouldNavigate(evt) === false` | Middle-click (button=1) and right-click (button=2) have browser-native behavior |
| 4 | **Purity / cmd⇄ctrl symmetry** — same inputs always produce the same result; swapping meta⇄ctrl is symmetric | Function has no side effects, and the two modifiers are independently checked |
| 5 | **Multi-modifier combinations** — any combination of ≥2 modifiers returns `false` | Cmd+Shift / Ctrl+Alt+Shift etc. are intercepted by the OS or browser; cannot be treated as navigation |

## buildActiveClassName (Link class computation)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Inactive returns baseClassName** — `buildActiveClassName(false, *, base) === base` | Inactive links must only show their base class |
| 2 | **Active includes activeClassName** — result contains `activeClassName` when `isActive=true` | Active links must visually indicate their state |
| 3 | **No "undefined" string** — result never contains the literal `"undefined"` | String concatenation with `undefined` must not leak into DOM class attribute |
| 4 | **No leading/trailing spaces** — `result === result.trim()` | DOM class attributes must be clean — browsers tolerate whitespace but it indicates a bug |
| 5 | **Token deduplication** — every token appears exactly once across the merged result | Set-based dedup optimization must not regress to naïve concat (would inflate class strings and break CSS specificity ordering for consumers) |
| 6 | **Multi-token order preserved** — multi-token `activeClassName` keeps declaration order in the output | Cascade order matters: `.btn.active { … }` rules rely on consistent token ordering |
| 7 | **Whitespace-only active falls back to base** — whitespace-only `activeClassName` returns `baseClassName ?? undefined` | The function uses `??` (not `?:`), so empty-string base is preserved verbatim and the active-concat branch is skipped |
| 8 | **Strict idempotency** — `buildActiveClassName(true, a, buildActiveClassName(true, a, base)) === buildActiveClassName(true, a, base)` | First call normalizes whitespace; second call over normalized input must be a no-op (no token reorder, no padding) |

## parseTokens (private helper, exercised via buildActiveClassName)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **`parseTokens(undefined) === []`** — falsy guard short-circuits to empty array | Without the guard, `undefined.match` would throw — buildActiveClassName must safely accept `baseClassName: undefined` |
| 2 | **Empty / whitespace-only input → `[]`** — `/\S+/g` excludes all Unicode whitespace, not just ASCII space | A regression to `/[^ ]+/g` would leave `\t`/`\n` as tokens, producing `"active\tclass"` style output |
| 3 | **Roundtrip is a no-op on normalized input** — re-parsing `parseTokens(s).join(" ")` yields the same token set | Locks the regex behavior so a "clean-up" refactor cannot silently change token boundaries |

## buildHref

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fallback to `buildPath`** — when `router.buildUrl` returns `undefined`, the helper falls back to `router.buildPath` | Memory/console runtimes have no URL plugin; the fallback keeps `<Link>` usable everywhere |
| 2 | **Prefers `buildUrl` when available** — when `buildUrl` returns a string, that wins over `buildPath` | URL-aware plugins (browser/navigation/hash) need to control the rendered href format |
| 3 | **Idempotence** — same args produce the same result; no internal state, no side effects on success | Referential transparency is required for memoization and reactivity |
| 4 | **Invalid routeName → `undefined` + `console.error`** — when both `buildUrl` and `buildPath` throw, the helper returns `undefined` and logs a single error | Element renders without `href` (defensive UX) instead of crashing the tree |
| 5 | **Hash encoding (RFC 3986 + defensive `%23`)** — fallback path appends `encodeURI(hash).replaceAll("#", "%23")` | `encodeURI` does NOT touch `#`; without the defensive replacement, `<Link hash="a#b">` would produce `…#a#b`, a different fragment |
| 6 | **Leading `#` stripped** — `<Link hash="#section">` and `<Link hash="section">` produce identical href | The leading `#` is a convenience for consumers pasting a literal fragment, not part of the fragment value |
| 7 | **`buildUrl` options shape** — no-hash calls pass `options=undefined`; with-hash calls pass `{ hash: <stripped> }`, never `{ hash: undefined }` | Plugins distinguish "no hash intent" from "explicit empty hash" — the helper must not collapse the two |

## navigateWithHash (#532)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Same route + same hash → pass-through** — `opts.force` / `opts.hashChange` are NOT set | Adding flags would force an extra transition where core's SAME_STATES correctly rejects |
| 2 | **Same route + different hash → auto-bypass** — `opts.force = true; opts.hashChange = true` | Without this, hash-only navigation would silently no-op against core's SAME_STATES check |
| 3 | **Different route → no auto-bypass** — flags are exclusively the same-route hash-change signal | Cross-route navigation goes through the normal path; auto-flags would corrupt subscriber semantics |
| 4 | **`opts.hash` propagation** — `hash === undefined` leaves the key absent; defined hash forwarded verbatim | Plugins can distinguish "no hash intent" from "explicit empty hash" downstream |
| 5 | **No current state → straight navigate** — `router.getState() === undefined` short-circuits the same-route logic | First-time navigation never hits the auto-bypass branch |
| 6 | **Same route + `hash === undefined` → preserved** — `newHash = hash ?? currentHash`, no flags set | Passing `undefined` signals "don't change the fragment" — nothing to bypass |
| 7 | **`extraOptions` pass-through** — fields from `extraOptions` (`replace`, `meta`, …) survive the hash merge | Consumers can set `{ replace: true }` alongside `hash="x"`; both must reach `router.navigate` |

## shallowEqual

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `shallowEqual(o, o) === true` | `Object.is` fast-path; locks zero-cost identity check |
| 2 | **Symmetry** — `shallowEqual(a, b) === shallowEqual(b, a)` | One-side iteration must still produce an order-independent verdict |
| 3 | **NaN-aware** — uses `Object.is`, not `===` | `Object.is(NaN, NaN) === true`, `Object.is(+0, -0) === false`. Strict equality would invert both |
| 4 | **Nullable short-circuit** — `(undefined, record)` and `(record, undefined)` both return `false`; `(undefined, undefined) === true` | Without the guard, the iteration loop would NPE |
| 5 | **Key-count short-circuit** — different `Object.keys.length` → immediate `false` | Performance invariant; also makes superset comparisons correct |
| 6 | **Key-order insensitivity** — `{a:1, b:2}` ≡ `{b:2, a:1}` | One-side iteration + `hasOwnProperty` lookup makes the verdict order-independent |
| 7 | **Symbol values compared by reference** — `Object.is` on identity-equal symbols returns true, distinct refs false | Locks reference semantics for symbol values |
| 8 | **Date compared by reference, NOT by epoch** — distinct `Date` refs with equal epoch are unequal | No deep-equality fast path — consumers stabilize refs themselves |
| 9 | **No deep compare** — structurally-identical-but-distinct nested objects are unequal | Locks shallow semantics; consumers wanting deep equality must stabilize refs |
| 10 | **`hasOwnProperty` guard** — explicit-undefined keys are NOT equal to missing keys with the same count | Without the guard, two records with same key count but different keys whose values are `undefined` would falsely compare equal |

## applyLinkA11y

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Null / undefined no-op** — does not throw, does not touch the document | Svelte 5 action lifecycle may invoke with null in transition cases |
| 2 | **`<a>` / `<button>` skipped** — native role/tabindex semantics preserved | Stamping `role="link"` on a native `<a>` fights the implicit role on some screen readers |
| 3 | **Injectable tags receive `role="link"` + `tabindex="0"`** — `<div>`, `<span>`, etc. become keyboard-focusable links | Consumers writing `<div use:link>` get full a11y for free |
| 4 | **Pre-existing `role` preserved** — `hasAttribute` guard, not `getAttribute` | Empty-string role still counts as "set"; respects intentional `role="presentation"` overrides |
| 5 | **Pre-existing `tabindex` preserved** — same `hasAttribute` guard | `tabindex="-1"` for "skip in tab order" must survive |
| 6 | **Idempotent** — applying twice yields the same DOM state | Svelte `use:` action `update()` may run on every reactive change |

## createHttpStatusSink

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fresh instance per call** — N invocations produce N distinct object identities | A singleton sink would leak HTTP status between concurrent SSR requests |
| 2 | **Initial `code === undefined`** — fresh sink starts without a status code | Signals to the consumer "no `<HttpStatusCode>` has written yet" → default to 200 |
| 3 | **Mutable (not frozen)** — `<HttpStatusCode>` writes `sink.code = code` during render | Freezing would throw under ESM strict mode; documented constraint |

## getActiveSegment (RouteView component-local helper)

Helper lives inside the `<script module>` block of `RouteView.svelte`. Property tests use an inline replica that depends on the production `startsWithSegment` from `@real-router/route-utils`.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reserved names `notFound` / `self` never returned** — even when the route literally starts with `notFound.` / `self.` and a snippet of that name is registered | `notFound` is the UNKNOWN_ROUTE fallback slot; `self` is the exact-match slot for the node. Confusing them with regular segments would silently route unmatched URLs to a wrong page |
| 2 | **Dotted reserved-prefix routes (`notFound.detail`) are excluded** — the route does not unintentionally pick up the reserved snippet | Locks the contract that reserved slots are render-time only, never segment-match targets |
| 3 | **Empty result when no segment matches** — returns `""`, not `undefined`, not `notFound` | Sentinel for `RouteView` to fall through to the `notFound`/`self` branches |
| 4 | **First-match wins** — `for…in` insertion order (ES2015+ spec) is observable; the first non-reserved snippet whose name forms a segment prefix is returned | Consumers expect deterministic resolution; out-of-order iteration would cause flicker between hot-reloads |
| 5 | **Nested `node` prefix composition** — segment `s` under `node="users"` matches `users.s`, not `s` or `<other>.s` | Nested `<RouteView nodeName="users">` must only see routes under that node |

## createReactiveSource

Bridges `RouterSource<T>` to a Svelte-reactive `{ readonly current: T }` getter. Property tests run under `environment: "node"` where `svelte/reactivity` resolves to its server stub (`createSubscriber → () => () => {}`), isolating the pure data path from Svelte's effect tracking. Reactivity itself is covered by stress and functional tests under jsdom.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Identity preservation** — every read of `.current` returns the value produced by `source.getSnapshot()`, by reference | Cloning or `$state.snapshot()` wrapping would invalidate every downstream `$derived` on each read, breaking Svelte 5's fine-grained reactivity |
| 2 | **Multiple reads, same snapshot** — `N` consecutive `.current` reads return identical `Object.is`-equal refs while `getSnapshot()` is stable | Locks stability for the common "no navigation between reads" path |
| 3 | **Snapshot transitions observable** — after the underlying source advances its snapshot, the next `.current` read picks up the new value (no caching) | The getter must call `getSnapshot()` fresh each time; cached reads would lag behind router state |
| 4 | **Error propagation** — `getSnapshot()` throws → `.current` throws | Swallowing would mask broken sources; the boundary handles its own retry logic |
