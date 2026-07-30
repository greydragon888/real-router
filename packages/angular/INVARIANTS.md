# @real-router/angular — Invariants

Invariants verified by property-based tests in `tests/property/`.

Angular is the only framework adapter whose `src/dom-utils/` is a **git-tracked
copy** of `shared/dom-utils/` (ng-packagr does not follow symlinks the way
tsdown does). The property suite imports directly from
`packages/angular/src/dom-utils/` — if the copy ever drifts from the shared
source after a `pnpm -F @real-router/angular bundle` is forgotten, these tests
are the canary that catches it.

The invariant set mirrors `packages/svelte/INVARIANTS.md` one-for-one; any
divergence between the two suites is itself a smell — the underlying functions
are the same code.

## shouldNavigate (Link click handler)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Left click, no modifiers** — `shouldNavigate(evt) === true` | Standard left-click must trigger client-side navigation |
| 2 | **Any single modifier key** — `shouldNavigate(evt) === false` | Meta/Alt/Ctrl/Shift clicks open in new tab or trigger OS actions — must not be intercepted |
| 3 | **Non-zero button** — `shouldNavigate(evt) === false` | Middle-click (button=1) and right-click (button=2) have browser-native behavior |
| 4 | **Purity / cmd⇄ctrl symmetry** — same inputs always produce the same result; swapping meta⇄ctrl is symmetric | No side effects, the two modifiers are independently checked |
| 5 | **Multi-modifier combinations** — any combination of ≥2 modifiers returns `false` | Cmd+Shift / Ctrl+Alt+Shift are intercepted by the OS or browser |
| 6 | **Hostile button values** — NaN, ±Infinity, negative, out-of-range integers all return `false` | `button === 0` strict-equality rejects every non-zero value, including `NaN !== 0` |
| 7 | **All four modifiers held simultaneously → false** — pin test for the `!meta && !alt && !ctrl && !shift` chain | The implementation uses four independent `!` checks combined via `&&` — none of them must be silently dropped |

## buildActiveClassName (Link class computation)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Inactive returns baseClassName** — `buildActiveClassName(false, *, base) === base ?? undefined` | Inactive links must only show their base class |
| 2 | **Active includes activeClassName** — result contains `activeClassName` when `isActive=true` | Active links must visually indicate their state |
| 3 | **No "undefined" string** — result never contains the literal `"undefined"` | String concatenation with `undefined` must not leak into DOM class attribute |
| 4 | **No leading/trailing spaces** — `result === result.trim()` | DOM class attributes must be clean |
| 5 | **Token deduplication** — every token appears exactly once across the merged result | Set-based dedup must not regress to naïve concat (would inflate class strings and break cascade order) |
| 6 | **Multi-token order preserved** — multi-token `activeClassName` keeps declaration order in the output | Cascade order matters: `.btn.active { … }` rules rely on consistent token ordering |
| 7 | **Whitespace-only active falls back to base** — whitespace-only `activeClassName` returns `baseClassName ?? undefined` | The function uses `??` (not `?:`), so empty-string base is preserved verbatim |
| 8 | **Strict idempotency** — `buildActiveClassName(true, a, buildActiveClassName(true, a, base)) === buildActiveClassName(true, a, base)` | First call normalizes whitespace; second call must be a no-op |

## parseTokens (private helper, exercised via buildActiveClassName)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **`parseTokens(undefined) === []`** — falsy guard short-circuits to empty array | Without the guard, `undefined.match` would throw |
| 2 | **Empty / whitespace-only input → `[]`** — `/\S+/g` excludes all Unicode whitespace, not just ASCII space | A regression to `/[^ ]+/g` would leave `\t`/`\n` as tokens |
| 3 | **Roundtrip is a no-op on normalized input** — re-parsing `parseTokens(s).join(" ")` yields the same token set | Locks the regex behavior so a "clean-up" refactor cannot silently change token boundaries |

## buildHref

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fallback to `buildPath`** — when `router.buildUrl` returns `undefined`, the helper falls back to `router.buildPath` | Memory/console runtimes have no URL plugin; the fallback keeps `<a realLink>` usable everywhere |
| 2 | **Prefers `buildUrl` when available** — when `buildUrl` returns a string, that wins over `buildPath` | URL-aware plugins need to control the rendered href format |
| 3 | **Idempotence** — same args produce the same result; no side effects on success | Referential transparency is required for memoization and Angular signal-based change detection |
| 4 | **Invalid routeName → `undefined` + `console.error`** — when both `buildUrl` and `buildPath` throw, the helper returns `undefined` and logs a single error | Directive renders without `href` (defensive UX) instead of crashing the tree |
| 5 | **Hash encoding (RFC 3986 + defensive `%23`)** — fallback path appends `encodeURI(hash).replaceAll("#", "%23")` | `encodeURI` does NOT touch `#`; without the defensive replacement, `<a realLink hash="a#b">` would produce `…#a#b`, a different fragment |
| 6 | **Leading `#` stripped** — `<a realLink hash="#section">` and `<a realLink hash="section">` produce identical href | Convenience for consumers pasting a literal fragment |
| 7 | **`buildUrl` options shape** — no-hash calls pass `options=undefined`; with-hash calls pass `{ hash: <stripped> }`, never `{ hash: undefined }` | Plugins distinguish "no hash intent" from "explicit empty hash" |
| 8 | **Route name verbatim** — extended-ASCII names (digits, `-`, `_`) and Unicode names pass through without sanitization | The helper is content-agnostic; any pre-validation belongs to the router layer |
| 9 | **buildPath alone throws → undefined + console.error** — isolates the URL-plugin-absent error path | A regression that silently swallowed buildPath errors only would surface here |
| 10 | **Non-string params (BigInt, Symbol, Date) pass through verbatim** — forwarded by reference, no coercion | Locks the verbatim-passthrough contract |
| 11 | **Long routeName + Unicode pass through verbatim** | If the helper ever URL-encoded the name, Unicode-routed pages would break |
| 12 | **encodeFragmentInline matches the documented RFC 3986 + `%23` formula** | `encodeFragmentInline` (dom-utils) and `encodeHashFragment` (browser-env) are two independent copies of the same formula — drift sentinel |

## navigateWithHash (#532)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Same route + same hash → pass-through** — `opts.force` / `opts.hashChange` are NOT set | Adding flags would force an extra transition where core's SAME_STATES correctly rejects |
| 2 | **Same route + different hash → auto-bypass** — `opts.force = true; opts.hashChange = true` | Without this, hash-only navigation would silently no-op |
| 3 | **Different route → no auto-bypass** — flags are exclusively the same-route hash-change signal | Cross-route navigation goes through the normal path |
| 4 | **`opts.hash` propagation** — `hash === undefined` leaves the key absent; defined hash forwarded verbatim | Plugins distinguish "no hash intent" from "explicit empty hash" |
| 5 | **No current state → straight navigate** — `router.getState() === undefined` short-circuits the same-route logic | First-time navigation never hits the auto-bypass branch |
| 6 | **Same route + `hash === undefined` → preserved** — `newHash = hash ?? currentHash`, no flags set | Passing `undefined` signals "don't change the fragment" |
| 7 | **`extraOptions` pass-through** — fields from `extraOptions` (`replace`, `meta`, …) survive the hash merge | Consumers can set `{ replace: true }` alongside `hash="x"` |
| 8 | **Same route + different params or search → no auto-bypass** — `shallowEqual(current.params, routeParams) === false` OR `shallowEqual(current.search, routeSearch ?? current.search) === false` gates the branch (query channel added RFC-4 M2, #1548) | Cross-params or cross-search navigation reaches the normal path |
| 9 | **`current.context.url` absent → defensive `""` fallback** | Router started without a URL plugin (memory-only) still works correctly |
| 10 | **Consumer `force=true` survives every branch** — last-write-wins, no downgrade | Auto-bypass cannot downgrade consumer's explicit flags |
| 11 | **Same route + `currentHash=""` + `hash=undefined` → preserved without flags** | The "already at no-fragment, no nav-intent" path |

## shallowEqual

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `shallowEqual(o, o) === true` | `Object.is` fast-path; locks zero-cost identity check |
| 2 | **Symmetry** — `shallowEqual(a, b) === shallowEqual(b, a)` | One-side iteration must still produce an order-independent verdict |
| 3 | **NaN-aware** — uses `Object.is`, not `===` | `Object.is(NaN, NaN) === true`, `Object.is(+0, -0) === false` |
| 4 | **Nullable short-circuit** — `(undefined, record)` and `(record, undefined)` both return `false`; `(undefined, undefined) === true` | Without the guard, the iteration loop would NPE |
| 5 | **Key-count short-circuit** — different `Object.keys.length` → immediate `false` | Performance invariant; also makes superset comparisons correct |
| 6 | **Key-order insensitivity** — `{a:1, b:2}` ≡ `{b:2, a:1}` | One-side iteration + `hasOwnProperty` lookup makes the verdict order-independent |
| 7 | **Symbol values compared by reference** | Object.is on identity-equal symbols returns true, distinct refs false |
| 8 | **Date compared by reference, NOT by epoch** — distinct `Date` refs with equal epoch are unequal | No deep-equality fast path |
| 9 | **No deep compare** — structurally-identical-but-distinct nested objects are unequal | Locks shallow semantics |
| 10 | **`hasOwnProperty` guard** — explicit-undefined keys are NOT equal to missing keys with the same count | Without the guard, two records with same key count but different keys whose values are `undefined` would falsely compare equal |
| 11 | **BigInt values compared by Object.is (by value)** | `Object.is(1n, 1n) === true`; locks acceptance of BigInt in records |
| 12 | **Symbol-keyed properties excluded by `Object.keys`** | Two records differing only in Symbol-keyed values compare equal — locks contract against a future `Reflect.ownKeys()` switch |
| 13 | **Empty objects are equal** — `shallowEqual({}, {}) === true` | Length-0 short-circuit; iteration loop is vacuously true |

## applyLinkA11y

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Null / undefined no-op** — does not throw, does not touch the document | Angular directive lifecycle may invoke with null before view init |
| 2 | **`<a>` / `<button>` skipped** — native role/tabindex semantics preserved | Stamping `role="link"` on a native `<a>` fights the implicit role on some screen readers |
| 3 | **Injectable tags receive `role="link"` + `tabindex="0"`** — `<div>`, `<span>`, etc. become keyboard-focusable links | Consumers writing `<div realLink>` get a11y for free |
| 4 | **Pre-existing `role` preserved** — `hasAttribute` guard, not `getAttribute` | Empty-string role still counts as "set"; respects intentional `role="presentation"` overrides |
| 5 | **Pre-existing `tabindex` preserved** — same `hasAttribute` guard | `tabindex="-1"` for "skip in tab order" must survive |
| 6 | **Idempotent** — applying twice yields the same DOM state | The directive's update path may run on every change detection cycle |
