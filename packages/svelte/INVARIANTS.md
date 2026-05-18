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
| 6 | **Hostile button values (NaN, negative, ±Infinity) → false** — synthetic events from testing libraries can produce non-zero / non-finite button values; the strict `button === 0` check rejects all of them (NaN compares unequal to itself) | Locks the strict-equality semantics so a future relaxation (`button <= 0`, truthiness check) cannot silently re-enable navigation on synthetic edge events |
| 7 | **All four modifiers held simultaneously → false** — explicit pin for `meta+alt+ctrl+shift` together | The implementation uses four independent `!` checks combined via `&&`; if any one is silently dropped or weakened, this all-four case yields a clearer failure than the random Inv5 hit |

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
| 7b | **Empty-string base, active path returns just the active tokens** — `buildActiveClassName(true, active, "")` returns `active` verbatim; inactive `(false, _, "")` returns `""` (NOT `undefined`) | `baseClassName ?? undefined` only short-circuits on null/undefined; `""` is preserved as the empty class attribute on the DOM element |
| 8 | **Strict idempotency** — `buildActiveClassName(true, a, buildActiveClassName(true, a, base)) === buildActiveClassName(true, a, base)` | First call normalizes whitespace; second call over normalized input must be a no-op (no token reorder, no padding) |
| 9 | **`buildActiveClassName(true, "", "")` === `""`** — both empty-string inputs collapse to `""`, NOT `undefined` | `??` only triggers on null/undefined; some consumers might expect `undefined` here, but the contract is "empty string preserved" so that empty `class=""` lands on the element predictably |
| 10 | **Unicode whitespace (NBSP, LS, PS, OghamSpaceMark) treated as token separators** — `parseTokens` uses `/\S+/g`, which matches all Unicode whitespace, not just ASCII space | Copy-paste from rich-text editors often inserts NBSP between visually-spaced words; a regression to `/[^ ]+/g` would treat that as a single token and produce e.g. `"foo bar"` as one class |
| 11 | **Strict dedup on 10k tokens (Set-based O(n+m))** — large inputs do not stack-overflow, return correctly dedup'd output, and keep first-occurrence positions stable | Pins the Set-based optimization; a regression to O(n*m) naïve concat would still pass functionally but inflate runtime; a regression that reordered tokens would break cascade-order semantics |

## parseTokens (private helper, exercised via buildActiveClassName)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **`parseTokens(undefined) === []`** — falsy guard short-circuits to empty array | Without the guard, `undefined.match` would throw — buildActiveClassName must safely accept `baseClassName: undefined` |
| 2 | **Empty / whitespace-only input → `[]`** — `/\S+/g` excludes all Unicode whitespace, not just ASCII space | A regression to `/[^ ]+/g` would leave `\t`/`\n` as tokens, producing `"active\tclass"` style output |
| 3 | **Roundtrip is a no-op on normalized input** — re-parsing `parseTokens(s).join(" ")` yields the same token set | Locks the regex behavior so a "clean-up" refactor cannot silently change token boundaries |
| 4 | **NBSP / LS / PS / OghamSpaceMark split correctly** — Unicode whitespace counts as token separators, NBSP-only string returns `[]` | Locks `\S+` Unicode-aware matching; a regression to `[^ ]+` would mis-tokenize copy-paste payloads from word processors and chat clients |

## buildHref

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fallback to `buildPath`** — when `router.buildUrl` returns `undefined`, the helper falls back to `router.buildPath` | Memory/console runtimes have no URL plugin; the fallback keeps `<Link>` usable everywhere |
| 2 | **Prefers `buildUrl` when available** — when `buildUrl` returns a string, that wins over `buildPath` | URL-aware plugins (browser/navigation/hash) need to control the rendered href format |
| 3 | **Idempotence** — same args produce the same result; no internal state, no side effects on success | Referential transparency is required for memoization and reactivity |
| 4 | **Invalid routeName → `undefined` + `console.error`** — when both `buildUrl` and `buildPath` throw, the helper returns `undefined` and logs a single error | Element renders without `href` (defensive UX) instead of crashing the tree |
| 5 | **Hash encoding (RFC 3986 + defensive `%23`)** — fallback path appends `encodeURI(hash).replaceAll("#", "%23")` | `encodeURI` does NOT touch `#`; without the defensive replacement, `<Link hash="a#b">` would produce `…#a#b`, a different fragment |
| 6 | **Leading `#` stripped** — `<Link hash="#section">` and `<Link hash="section">` produce identical href | The leading `#` is a convenience for consumers pasting a literal fragment, not part of the fragment value |
| 7 | **`buildUrl` options shape** — no-hash calls pass `options=undefined`; with-hash calls pass `{ hash: <stripped> }`, never `{ hash: undefined }`. **`hash === ""` is explicitly forwarded as `{ hash: "" }`** (NOT collapsed to `undefined`) | Plugins distinguish "no hash intent" from "explicit empty hash" — the helper must not collapse the two; a regression that stripped falsy values would break the tri-state contract |
| 8 | **Extended-ASCII route names (digits, `-`, `_`) pass through verbatim** — `users-list`, `posts_2024`, `v1.users` reach `router.buildUrl` / `router.buildPath` without sanitation | The helper is content-agnostic; any pre-validation belongs to the router layer. A future refactor that lowercased or stripped chars would silently break real-world routes |
| 9 | **`buildPath` throws while `buildUrl` is undefined → `undefined` + `console.error`** — isolates the buildPath-only failure path from the both-throw case in Inv4 | The standard "URL plugin absent, route invalid" scenario; a regression that swallowed buildPath errors only (e.g. mistakenly added a try/catch around buildPath but not around the buildUrl branch) would surface here |
| 10 | **Non-string params (BigInt, Symbol, Date) forwarded by reference** — params are NOT JSON-stringified or coerced; verbatim pass-through to `buildUrl` / `buildPath`. If the router throws (e.g. `JSON.stringify` on BigInt → TypeError), the helper's try/catch surfaces it as the standard "Route not defined" error path | Locks the verbatim-passthrough contract; consumers using `as unknown as Params` runtime escape hatches rely on this. A future refactor that pre-coerced params would break custom plugin integrations |
| 11 | **Long routeName (1024 chars) + Unicode names ("пользователь.profile.用户", "page-🎉") forwarded verbatim** — the helper does not validate, truncate, or URL-encode the name | The helper is content-agnostic; route-utils may reject these at the router layer, but buildHref must not pre-validate (some i18n setups deliberately register Unicode-routed pages via custom matchers) |
| 12 | **`encodeFragmentInline` formula matches the documented RFC 3986 + `%23` reference** — `encodeURI(decoded).replaceAll("#", "%23")` for every input | Drift-safety lock: there are TWO independent copies of this one-liner (`shared/dom-utils/link-utils.ts` and `shared/browser-env/url-context.ts`) that the symlink graph cannot deduplicate; pin tests catch drift in either copy and surface it loudly. Sub-delims (`&=?:`) preserved, BMP CJK encoded as `%XX%XX%XX`, spaces as `%20`, `#` as `%23` |

## navigateWithHash (#532)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Same route + same hash → pass-through** — `opts.force` / `opts.hashChange` are NOT set | Adding flags would force an extra transition where core's SAME_STATES correctly rejects |
| 2 | **Same route + different hash → auto-bypass** — `opts.force = true; opts.hashChange = true` (both flags as a conjunction) | Without this, hash-only navigation would silently no-op against core's SAME_STATES check; both flags must land together — a regression that sets only one would re-introduce the no-op bug |
| 3 | **Different route → no auto-bypass** — flags are exclusively the same-route hash-change signal | Cross-route navigation goes through the normal path; auto-flags would corrupt subscriber semantics |
| 4 | **`opts.hash` propagation** — `hash === undefined` leaves the key absent; defined hash forwarded verbatim | Plugins can distinguish "no hash intent" from "explicit empty hash" downstream |
| 5 | **No current state → straight navigate** — `router.getState() === undefined` short-circuits the same-route logic | First-time navigation never hits the auto-bypass branch |
| 6 | **Same route + `hash === undefined` → preserved** — `newHash = hash ?? currentHash`, no flags set | Passing `undefined` signals "don't change the fragment" — nothing to bypass |
| 7 | **`extraOptions` pass-through** — fields from `extraOptions` (`replace`, `meta`, …) survive the hash merge | Consumers can set `{ replace: true }` alongside `hash="x"`; both must reach `router.navigate` |
| 8 | **Wide-depth route names (6+ levels) — no perf regression, same auto-bypass semantics** — the depth-agnostic strict-equality check on `current?.name === routeName` holds for deeply nested names | Locks the matcher under broader inputs; `arbRouteName`'s narrow domain (1-2 deep) alone could mask depth-sensitive regressions |
| 9 | **Same routeName + different params (shallowEqual false) → no auto-bypass** — branch guard is `shallowEqual(current.params, routeParams)`; if it's false, neither `force` nor `hashChange` are added even when route names match | Pins param sensitivity: a regression that compared only route names would over-fire auto-bypass on legitimately new navigations (e.g. `users.view` with different `id`) |
| 10 | **`state.context.url` absent → `currentHash` defaults to `""`** — defensive `(current.context as { url?: ... })?.url?.hash ?? ""` path keeps the same-route hash-change logic functional in memory-only / no-URL-plugin setups | Defense-in-depth: routers started without a URL plugin must not crash the helper; the `""` fallback keeps Inv2/Inv6 evaluable |
| 11 | **Consumer-set `force=true` in `extraOptions` survives — last-write-wins, no downgrade** — auto-bypass cannot DOWNGRADE consumer flags to `false`; on same route + different hash, consumer's `force` stays `true` and `hashChange` is added; on no mismatch or cross-route, consumer's `force` survives untouched | Composition lock; a regression that hard-set `force = false` on the no-mismatch branch would silently drop consumer's explicit force intent |
| 12 | **`hash === ""` explicitly forwarded as `{ hash: "" }`** — NOT collapsed to `undefined` even when `currentHash` is also `""` (same route + both empty → no force, but `opts.hash` is still absent because the input was `undefined`, while explicit `""` is preserved) | Tri-state lock: plugins distinguish `undefined` ("no intent"), `""` ("clear fragment"), and `"value"` ("set fragment") downstream; collapsing `""` would break the contract |

## shallowEqual

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `shallowEqual(o, o) === true` | `Object.is` fast-path; locks zero-cost identity check |
| 2 | **Symmetry** — `shallowEqual(a, b) === shallowEqual(b, a)` | One-side iteration must still produce an order-independent verdict |
| 3 | **NaN-aware** — uses `Object.is`, not `===` | `Object.is(NaN, NaN) === true`, `Object.is(+0, -0) === false`. Strict equality would invert both |
| 4 | **Nullable short-circuit** — `(undefined, record)` and `(record, undefined)` both return `false`; `(undefined, undefined) === true` | Without the guard, the iteration loop would NPE |
| 4b | **Empty objects equal** — `shallowEqual({}, {}) === true` (distinct refs, zero keys → vacuously true); `({}, non-empty)` returns `false` via key-count short-circuit | A regression that treated empty objects as not-equal (e.g. a misplaced `if (keys.length === 0) return false`) would break Link memoization for the common no-params case |
| 5 | **Key-count short-circuit** — different `Object.keys.length` → immediate `false` | Performance invariant; also makes superset comparisons correct |
| 6 | **Key-order insensitivity** — `{a:1, b:2}` ≡ `{b:2, a:1}` | One-side iteration + `hasOwnProperty` lookup makes the verdict order-independent |
| 7 | **Symbol values compared by reference** — `Object.is` on identity-equal symbols returns true, distinct refs false | Locks reference semantics for symbol values |
| 8 | **Date compared by reference, NOT by epoch** — distinct `Date` refs with equal epoch are unequal | No deep-equality fast path — consumers stabilize refs themselves |
| 9 | **No deep compare** — structurally-identical-but-distinct nested objects are unequal | Locks shallow semantics; consumers wanting deep equality must stabilize refs |
| 10 | **`hasOwnProperty` guard** — explicit-undefined keys are NOT equal to missing keys with the same count | Without the guard, two records with same key count but different keys whose values are `undefined` would falsely compare equal |
| 11 | **BigInt values compared by `Object.is` (by value)** — `Object.is(1n, 1n) === true`, distinct BigInt values are unequal, BigInt vs Number with same numeric value is `false` (no coercion) | Ensures BigInt is accepted in records at all (the function signature is `object \| undefined` which accepts any value type); a regression that swapped `Object.is` for `===` would still pass for ordinary numbers but locks the type-strict semantics that React's shallowEqual provides |
| 12 | **Symbol-keyed properties excluded by `Object.keys`** — records differing ONLY in Symbol-keyed values compare equal; Symbol-keyed properties never bump the key count | Theoretical concern (the `Params` type forbids Symbol keys at compile time) but runtime escape hatches could expose it; the lock prevents a future refactor that switched to `Reflect.ownKeys()` — which would suddenly include Symbol keys and silently change the documented contract |

## applyLinkA11y

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Null / undefined no-op** — does not throw, does not touch the document (verified by `document.body.innerHTML` snapshot before/after) | Svelte 5 action lifecycle may invoke with null in transition cases |
| 2 | **`<a>` / `<button>` skipped** — native role/tabindex semantics preserved | Stamping `role="link"` on a native `<a>` fights the implicit role on some screen readers |
| 3 | **Injectable tags receive `role="link"` + `tabindex="0"`** — `<div>`, `<span>`, etc. become keyboard-focusable links | Consumers writing `<div use:link>` get full a11y for free |
| 4 | **Pre-existing `role` preserved** — `hasAttribute` guard, not `getAttribute` | Empty-string role still counts as "set"; respects intentional `role="presentation"` overrides |
| 5 | **Pre-existing `tabindex` preserved** — same `hasAttribute` guard | `tabindex="-1"` for "skip in tab order" must survive |
| 6 | **Idempotent** — applying twice yields the same DOM state | Svelte `use:` action `update()` may run on every reactive change |
| 7 | **Form elements (`<input>`, `<textarea>`, `<select>`) receive role+tabindex** — they're NOT in the skip list (which is hard-coded to `<a>` / `<button>`) | Pin-test against accidental scope changes; consumers shouldn't use `use:link` on form elements semantically, but the runtime contract is content-agnostic and a refactor that extended the skip list would silently change behavior |
| 8 | **SVG elements (non-HTMLElement) receive role+tabindex via duck typing** — `<svg>` constructed via `createElementNS` passes the `instanceof HTMLAnchorElement/Button` checks (returns false) and gets stamped just like `<div>` | TypeScript would block this at the boundary (`HTMLElement \| null \| undefined` param type), but consumers using `as` casts or rest-prop-spreading via Svelte action could reach here; lock current runtime behavior so SVG-based icon links work |

## createHttpStatusSink

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fresh instance per call** — N invocations produce N distinct object identities | A singleton sink would leak HTTP status between concurrent SSR requests |
| 2 | **Initial `code === undefined`** — fresh sink starts without a status code | Signals to the consumer "no `<HttpStatusCode>` has written yet" → default to 200 |
| 3 | **Mutable (not frozen)** — `<HttpStatusCode>` writes `sink.code = code` during render; `Object.isFrozen(sink) === false`; last-write-wins on repeated writes | Freezing would throw under ESM strict mode; documented constraint |
| 4 | **Frozen sink throws on write (strict-mode TypeError)** — if a consumer calls `Object.freeze(sink)`, subsequent `sink.code = N` writes throw `TypeError`; pre-freeze writes are preserved | Locks the documented "don't `Object.freeze` the sink" JSDoc contract as a runtime failure mode; a future refactor that returned `Object.freeze(...)` from the factory itself would surface here, AND consumers cannot accidentally defeat the mutable-write contract |
| 5 | **Concurrent requests — N sinks isolate writes** — N distinct sinks written with distinct codes (sequentially OR via `Promise.all` with microtask yields) each retain their own value, no cross-contamination | Stronger form of Inv1 pinning realistic SSR-render semantics; a regression toward module-level state would silently leak status codes between concurrent requests |
| 6 | **All HTTP status codes (1xx-5xx) round-trip** — every realistic status code (101, 200, 201, 204, 301, 302, 304, 4xx, 5xx) is stored and read back verbatim; `undefined` is a valid reset value | Value-preservation lock across the full HTTP code surface; some prior implementations clamped or validated codes — this contract is "store whatever the consumer writes" |

## getActiveSegment (RouteView component-local helper)

Helper lives inside the `<script module>` block of `RouteView.svelte`. Property tests use an inline replica that depends on the production `startsWithSegment` from `@real-router/route-utils`.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reserved names `notFound` / `self` never returned** — even when the route literally starts with `notFound.` / `self.` and a snippet of that name is registered; the result is always typed `string` (never `undefined` / `null`) | `notFound` is the UNKNOWN_ROUTE fallback slot; `self` is the exact-match slot for the node. Confusing them with regular segments would silently route unmatched URLs to a wrong page |
| 2 | **Dotted reserved-prefix routes (`notFound.detail`) are excluded** — the route does not unintentionally pick up the reserved snippet | Locks the contract that reserved slots are render-time only, never segment-match targets |
| 3 | **Empty result when no segment matches** — returns `""`, not `undefined`, not `notFound` | Sentinel for `RouteView` to fall through to the `notFound`/`self` branches |
| 4 | **First-match wins** — `for…in` insertion order (ES2015+ spec) is observable; the first non-reserved snippet whose name forms a segment prefix is returned | Consumers expect deterministic resolution; out-of-order iteration would cause flicker between hot-reloads |
| 5 | **Nested `node` prefix composition** — segment `s` under `node="users"` matches `users.s`, not `s` or `<other>.s` | Nested `<RouteView nodeName="users">` must only see routes under that node |
| 6 | **Snippet keys with `undefined` / `null` values still matched by key** — the function inspects KEYS only (via `for…in`), not values; reserved-name check still applies even when value is `undefined` | Consumers sometimes pass `notFound: undefined` for conditional rendering; locks iteration semantics so a future refactor that filtered by truthy values doesn't silently change matching |
| 7 | **100-segment route names — no stack overflow, O(N) iteration** — the function uses `for…in` over snippets (constant N) and `startsWithSegment` on each; depth of the route name does not change complexity | Pathological-depth lock; pins the linear-in-snippets contract against any matcher refactor that re-introduced per-segment recursion |
| 8 | **Leading dot (`.foo`) — no match for `foo` snippet (literal `.foo` ≠ `foo`)** — `startsWithSegment(".foo", "foo")` is false because the leading dot is not a valid segment separator | Boundary-parser lock for real-router's "route names never start with `.`" convention; surfaces drift if `startsWithSegment` ever started accepting dot-prefixed inputs |

## createReactiveSource

Bridges `RouterSource<T>` to a Svelte-reactive `{ readonly current: T }` getter. Property tests run under `environment: "node"` where `svelte/reactivity` resolves to its server stub (`createSubscriber → () => () => {}`), isolating the pure data path from Svelte's effect tracking. Reactivity itself is covered by stress and functional tests under jsdom.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Identity preservation** — every read of `.current` returns the value produced by `source.getSnapshot()`, by reference | Cloning or `$state.snapshot()` wrapping would invalidate every downstream `$derived` on each read, breaking Svelte 5's fine-grained reactivity |
| 2 | **Multiple reads, same snapshot** — `N` consecutive `.current` reads return identical `Object.is`-equal refs while `getSnapshot()` is stable | Locks stability for the common "no navigation between reads" path |
| 3 | **Snapshot transitions observable** — after the underlying source advances its snapshot, the next `.current` read picks up the new value (no caching) | The getter must call `getSnapshot()` fresh each time; cached reads would lag behind router state |
| 4 | **Error propagation** — `getSnapshot()` throws → `.current` throws | Swallowing would mask broken sources; the boundary handles its own retry logic |
