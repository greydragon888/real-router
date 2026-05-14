# @real-router/vue — Invariants

Invariants verified by property-based tests in `tests/property/`.

## isSegmentMatch (RouteView helper)

File: `tests/property/routeView.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact self-match** — `isSegmentMatch(name, name, true) === true` | A route must always match itself in exact mode |
| 2 | **Exact mismatch** — `isSegmentMatch(a, b, true) === false` when `a !== b` | Exact mode must reject different names |
| 3 | **Parent prefix matches child** — `isSegmentMatch("parent.child", "parent", false) === true` | Non-exact mode must recognize ancestor relationships |
| 4 | **Child does not match parent** — `isSegmentMatch("parent", "parent.child", false) === false` | A parent route name cannot start with a child's longer name |
| 5 | **Shared prefix without segment boundary does not match** — `isSegmentMatch("usersAdmin", "users", false) === false` | Prefix match requires a segment boundary (`.`), not raw string startsWith |
| 6 | **Empty-string edge cases (Vue semantics)** — exact `("", "", true)` returns `true` (bare `===`); non-exact rejects any empty input via `startsWithSegment`; `(name, "", true)` and `("", name, true)` both `false` | Vue's `isSegmentMatch` has no early-return guard — empty cases are handled by the surrounding pipeline (`evaluateMatch`) and by `startsWithSegment` itself; locking the behaviour prevents drift across adapters |
| 7 | **Extended ASCII alphabet** (digits, `_`, `-`, mixed case) preserves Inv 1, 3, 5 | route-utils' `SAFE_SEGMENT_PATTERN` (`/^[\w.-]+$/`) accepts the full ASCII surface; real routes use `users-list`, `posts_2024` — invariants must hold beyond the default lowercase alpha-only generator |
| 8 | **Wide-depth route names** (1–6 segments) preserve Inv 1, 3 | Deeply nested names exercise the regex-construction path of `startsWithSegment` (escape + dotOrEnd) at depths the default 1–4-segment generator misses |
| 9 | **Strict monotonicity** — for non-empty `name`, `exact(name, seg)=true ⇒ non-exact(name, seg)=true` | Exact match is a specialisation of non-exact: if `name === seg` (and both non-empty), `startsWithSegment` must also return `true` (segment boundary at end-of-string). The empty-empty corner is the documented exception. |

## shallowEqual (DOM-utils comparator — used by `useIsActiveRoute` and `navigateWithHash`)

File: `tests/property/shallowEqual.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `shallowEqual(o, o) === true` (Object.is fast-path) | Same-reference comparisons must short-circuit without iterating keys |
| 2 | **Symmetry** — `shallowEqual(a, b) === shallowEqual(b, a)` | Memo verdict must not depend on which side is iterated |
| 3 | **NaN-aware (Object.is, not `===`)** — `NaN === NaN` records compare equal; `+0` vs `-0` records compare unequal | `Object.is` semantics; strict equality would invert both cases |
| 4 | **Nullable short-circuit** — `(undefined, record)` and `(record, undefined)` both `false`; `(undefined, undefined)` `true` | Guards against NPE in the iteration loop and preserves Object.is fast-path on both-nil |
| 5 | **Key-count short-circuit** — different `Object.keys.length` → immediate `false` | Perf invariant; also rejects supersets without per-key iteration |
| 6 | **Key-order insensitivity** — `{a:1, b:2}` ≡ `{b:2, a:1}` | Documented public contract; iteration uses one side's keys with lookups in the other |
| 7 | **Symbol values (Object.is by reference)** — same Symbol ref → `true`; distinct Symbol refs → `false` | Symbols are identity-only; `===` and `Object.is` agree on them, but coverage must explicitly exercise the path |
| 8 | **Date values (Object.is by reference, not by epoch)** — same Date ref → `true`; distinct Date with identical `valueOf()` → `false` | Locks the no-value-equality contract for objects passed as params; consumers stabilize Date refs themselves if they want memo reuse |
| 9 | **Nested objects compared by reference (no deep compare)** — structurally-identical nested objects with distinct refs → `false`; shared nested ref → `true` | Documented gotcha — Vue consumers stabilize via `computed`/`shallowRef` when they want deep equality |
| 10 | **Explicit-undefined value counts as a present key** — `{a:1, b:undefined}` vs `{a:1}` → `false`; `{a:undefined}` vs `{b:undefined}` (same key count, different keys) → `false` via `hasOwnProperty` guard | The length comparison + `hasOwnProperty` inside the loop together prevent the "different keys, same undefined value" false-equal trap |
| 11 | **Frozen objects compare identically to mutable ones** — frozen record reflexivity + frozen↔mutable equivalence when keys/values match | Route snapshots emitted by `@real-router/core` are always frozen; `shallowRef` holds them as-is. `Object.keys` and `Object.is` work on frozen instances — the comparator must not branch on mutability |
| 12 | **Vue reactive proxies — identity-based reflexivity, no deep compare across proxies** — `shallowEqual(p, p) === true`; two reactive proxies wrapping structurally-identical records compare via per-key `Object.is` (true when all values primitive, false when any nested non-primitive) | `useIsActiveRoute` may receive a `routeParams` proxy from setup-scope state. The comparator must treat each proxy as its own identity and must NOT deep-compare across proxies — that would silently break the documented "stabilize via `computed` if you want deep equality" contract |
| 13 | **Prototype-pollution-resilient — `__proto__` / `constructor` / `hasOwnProperty` as own keys** — `{ [protoKey]: v }` reflexivity holds; symmetric records with the same proto-named own key compare via `Object.is(value, value)`; bare `{}` unaffected by inherited keys (zero own-keys short-circuit) | The loop uses `Object.keys` (own-properties only) + `Object.prototype.hasOwnProperty.call(next, key)` — both API entries skip inherited members. A regression to `for...in` or a missing `hasOwnProperty` guard would silently expose inherited prototype keys |

## buildActiveClassName (DOM-utils CSS-class composer)

File: `tests/property/linkUtils.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **No double spaces** — when `isActive=true`, result never contains `"  "` | Regression lock for a bug where active concat produced `"base  active"`; whitespace-padded base strings must collapse to single-space joins |
| 2 | **Active token present** — when `isActive=true` with non-empty `activeClassName`, the result contains the active token | The whole purpose of the helper — active state must be reflected in CSS |
| 3 | **Active token appears at most once** — no duplicate of `activeClassName` in the output | Prevents accidental `class="active active"` when `activeClassName` already exists in `base` |
| 4 | **Base preserved when inactive** — `isActive=false` returns `baseClassName` verbatim | The helper must be a no-op for inactive Links — preserves consumer-supplied class string exactly |
| 5 | **Whitespace-only `activeClassName` falls back to base verbatim** — `??`, not `?:` | Empty-string `base` is preserved verbatim and not coerced to `undefined` |
| 6 | **Strict idempotency** — `f(true, a, f(true, a, base)) === f(true, a, base)` | The first apply normalizes whitespace; the second over the normalized output reproduces the exact same string (not just the same token set) — catches token reordering or re-padding regressions |
| Behaviour lock | Dedup applies to the active token only, NOT to pre-existing duplicates in `base` | The helper uses `Set` for membership but pushes onto the original `baseTokens` array; locking this behaviour prevents a silent contract change during refactoring |

## buildHref (DOM-utils href builder)

File: `tests/property/linkUtils.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **`buildUrl=()=>undefined` falls back to `buildPath`** | Memory-plugin and console UIs have no `buildUrl`; the helper must still produce an href |
| 2 | **Prefers `buildUrl` when it returns a string** | Browser/Navigation/Hash plugins own URL encoding; their result must win over `buildPath` |
| 3 | **Returns `undefined` and logs when both throw** | Render-time recovery: bad `routeName` must not crash the tree; `<a>` renders without `href` |
| 4 | **Hash encoding (RFC 3986 + `%23` for `#`)** — buildPath fallback path appends `#${encodeURI(stripped).replaceAll("#", "%23")}`; `#` must not appear in the fragment portion | #532; guards against a future refactor swapping in a less strict encoder |
| 5 | **Leading `#` is stripped** — `<Link hash="#x">` and `<Link hash="x">` produce identical href | The leading `#` is a consumer convenience, not part of the fragment |
| 6 | **`buildUrl` receives `options=undefined` (no-hash) or `{ hash: <stripped> }` (with-hash)** — never `{ hash: undefined }` | Plugins distinguish "no hash intent" (`options === undefined`) from "explicit empty fragment" (`{ hash: "" }`); the helper must preserve that distinction |

## RouteView pipeline (`collectElements` + `buildRenderList` + `appendFallback`)

File: `tests/property/routeView.pipeline.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **`collectElements` preserves source order** — `result[i].type === input[i].type` | RouteView relies on insertion order to derive first-match-wins; a reorder would change which Match activates first |
| 2 | **`collectElements` result is flat** — contains only `Match`/`Self`/`NotFound`, never `Fragment` / DOM elements | Pipeline assumes flat input; a leaked Fragment would crash `evaluateMatch` on a missing `segment` prop |
| 3 | **`buildRenderList` is deterministic** — two calls with same `(elements, routeName, nodeName)` produce structurally equal `{ rendered, activeMatchFound }` | Pure function contract; a stray Date/Math.random would surface here and silently break SSR/CSR parity |
| 4 | **First-match wins** — N copies of `<Match segment=X>` with `routeName=X` → exactly one render entry; first Match suppresses any later one that would also match | `activeMatchFound` short-circuit is the only guard against double-activation; a regression renders all matching segments simultaneously |
| 5 | **First `<Self>` wins** — N copies of `<Self>` with `routeName === nodeName` → exactly one Self render | Symmetric with first-Match; `recordFallback` short-circuits on `slots.selfVNode !== null` after the first Self is captured |
| 6 | **Self priority over NotFound** — `<Self>+<NotFound>` with `routeName === nodeName` → only Self appears, regardless of source order | `appendFallback` checks `slots.selfVNode && routeName === nodeName` first; order-flip regression silently breaks UX at node-match points |
| 7 | **Active Match suppresses fallbacks** — any activating Match suppresses both Self and NotFound | `appendFallback` is gated by `!activeMatchFound`; without this, a user-route Match could co-render with a NotFound and produce duplicate content |
| 8 | **NotFound only on `UNKNOWN_ROUTE`** — non-UNKNOWN_ROUTE + no Match → NotFound NOT rendered; UNKNOWN_ROUTE + no Match → NotFound rendered | Locks the fallback semantic: NotFound is not a generic "no Match" catch-all, it is route-name-specific |
| 9 | **Last NotFound wins** — two `<NotFound>` siblings under UNKNOWN_ROUTE → only the second is rendered | Vue's `appendFallback` uses `elements.filter(...NotFound).at(-1)`; this asymmetry vs first-wins-for-Self is intentional and locked here so a refactor does not silently flip it |
| 10 | **`evaluateMatch.fullSegmentName` construction** — `nodeName ? "${nodeName}.${segment}" : segment` | Locks the join character (`.`) and the empty-nodeName branch; a regression to `/` or to mis-handling the empty branch would silently break root-level matching |

## navigateWithHash (DOM-utils click handler for `<Link hash>`, #532)

File: `tests/property/navigateWithHash.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Same route + same hash → no auto `force`/`hashChange`** | Adding flags would force an extra transition where core's `SAME_STATES` would correctly reject |
| 2 | **Same route + different hash → `force: true, hashChange: true`** | Hash-only navigation would otherwise silently no-op against `SAME_STATES`; subscribers disambiguate via `state.context.url.hashChanged` |
| 3 | **Different route → no auto-bypass** even if hash differs | `force`/`hashChange` are exclusively the same-route hash-change signal |
| 4 | **`opts.hash` propagation** — `undefined` → key absent; defined → forwarded verbatim | Plugins distinguish "preserve current hash" from "explicit hash value" |
| 5 | **Same route + `hash=undefined` → hash preserved, no force** | Passing `undefined` signals "don't change the fragment"; nothing to bypass in `SAME_STATES` |
| 6 | **No current state → pass-through** (no `force` logic) | Initial navigation has no current state to compare against — the auto-bypass branch must short-circuit |

## createHttpStatusSink (SSR utility)

File: `tests/property/httpStatusSink.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fresh instance per call** — N calls return N pairwise-distinct refs; writing `sink.code` on one never leaks to another | Per-request status state cannot be shared; a singleton would cause cross-request status leakage in concurrent SSR |
| 2 | **Initial `code === undefined`** — every fresh sink starts without a status code | The server's signal that no `<HttpStatusCode>` has written yet; consumer defaults to 200 |

## vLink router stack — stateful PBT

File: `tests/property/vLink.stack.properties.ts`

Stateful model-based test using `fc.commands` + `fc.modelRun`. The directive keeps a module-level LIFO stack of routers that `RouterProvider` pushes on mount and pops on unmount. Out-of-order unmount safety is the documented contract.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Top-of-stack consistency** — after any sequence of push/release ops, `getDirectiveRouter()` returns the last router still present (or throws on empty) | The directive must always resolve to the innermost surviving provider; a stale `pop`-based release would break the contract when the parent is released before the child |
| 2 | **Release identity** — release function removes the SPECIFIC router it was bound to, regardless of stack position | `Array.prototype.lastIndexOf` finds the exact instance; out-of-order release (parent before child) must preserve the invariant. A regression to a positional pop would silently corrupt the stack |
| 3 | **Idempotent release** — calling the same release function twice is a no-op on the second call | The `idx !== -1` guard in `pushDirectiveRouter`'s closure short-circuits the second call. Without it, a double-release would remove the wrong router |
| 4 | **No cross-contamination** — releasing router A never affects the presence of any other router B in the stack | Each release function captures its own router by closure; releases are independent. A regression that uses a single shared index would cross-contaminate |
