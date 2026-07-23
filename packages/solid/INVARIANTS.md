# @real-router/solid — Invariants

Invariants verified by property-based tests in `tests/property/`. Test count: **152 PBT** across 11 files (as of audit follow-up rounds 4-22 in `2026-05-17`).

## isRouteActive (RouterProvider selector)

`tests/property/routerProvider.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact match** — `isRouteActive("X", "X") === true` | A link's own route must always be considered active |
| 2 | **Ancestor match** — `isRouteActive("parent", "parent.child") === true` | Parent links stay active when a child route is current (breadcrumb/nav highlighting) |
| 3 | **Non-ancestor prefix** — `isRouteActive("users", "users2") === false` | String prefix without dot boundary must NOT be treated as ancestor |
| 4 | **Reverse NOT true** — `isRouteActive("parent.child", "parent") === false` | A child link must NOT be active when only the parent is current |
| 5 | **Self-match** — `isRouteActive(name, name) === true` for any name | Redundant with #1 but tested with random dotted names for robustness |
| 6 | **Transitivity** — chain `a → a.b → a.b.c` ⇒ a active for a.b.c | Lattice structure of ancestor-relation; required for multi-level breadcrumb highlighting |
| 7 | **Empty link / empty current — sentinel coverage** (3 tests) — `("", non-empty)` → false, `(non-empty, "")` → false, `("", "")` → true (Object.is fast-path) | Locks the sentinel contract that RouterProvider relies on (`?? ""` for unstarted router) |
| 8 | **Sharper anti-symmetry** — for any a≠b, `isRouteActive(a, b)` ⇒ `¬isRouteActive(b, a)` | No two distinct names can be each other's ancestor; stronger than the constructed-pair check in #4 |
| 8a | **Long-string length stress** — reflexivity + anti-symmetry hold at ≥256-char strings | No quadratic perf collapse on user-pasted long route names |
| 8b | **Negative-domain — invalid route names do not throw** — `isRouteActive(invalid, valid)` returns boolean, never throws | Validation rejects malformed names at register-time, but the helper must defensively handle weird inputs (`""`, `"."`, `".leading"`, `"a..b"`, etc.) |

**§5.1 edge-case pin-tests** (5 explicit `it()` tests in the same file): `("", "")` → true, `("", "home")` → false, `("", ".")` → true (documented quirk), `("users", "users.")` → true, `("users.", "users.x")` → false. Locks observed behaviour on every "weird" input documented in the audit.

## isSegmentMatch (RouteView helper)

`tests/property/routeView.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact self-match** — `isSegmentMatch(name, name, true) === true` | A route must always match itself in exact mode |
| 2 | **Exact mismatch** — `isSegmentMatch(a, b, true) === false` when `a !== b` | Exact mode must reject different names |
| 3 | **Parent prefix matches child** — `isSegmentMatch("parent.child", "parent", false) === true` | Non-exact mode must recognize ancestor relationships |
| 4 | **Child does not match parent** — `isSegmentMatch("parent", "parent.child", false) === false` | A parent route name cannot start with a child's longer name |
| 5 | **Dot-boundary safety** — `isSegmentMatch("parent<suffix>", "parent", false) === false` when suffix has no leading dot | Naive `String.startsWith` alone would treat `"users2"` as descendant of `"users"`. The dot is the namespace separator |
| 6 | **Empty `routeName` (first arg) is never a match** against any non-empty segment | Both exact (`""` !== segment) and non-exact (`startsWithSegment` guards empty) branches return false |
| 7 | **Empty `fullSegmentName` (second arg) is never a match** against any non-empty name | Symmetric defensive answer; helper never expected to receive empty `fullSegmentName` in production |
| 8 | **Monotonicity exact→non-exact** — `isSegmentMatch(a, b, true) === true ⇒ isSegmentMatch(a, b, false) === true` | Relaxing the predicate cannot reject what strict accepts. Regression guard against inverted `exact` branch |
| 9 | **Cross-function consistency with isRouteActive** — `isSegmentMatch(routeName, segment, false) ⇔ isRouteActive(segment, routeName)` | Both functions decide "active in current state" but in different code paths. If they diverge, Link can show active while RouteView fails to render |

## collectElements (RouteView helper)

`tests/property/routeView.properties.ts` (added round 4, §2.1)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Null-safe** — `collectElements(null, [])` and `collectElements(undefined, [])` do not throw, leave result empty | Solid's JSX runtime emits `null`/`undefined` children for conditional rendering; collector must tolerate |
| 2 | **Non-marker tolerance** — primitives, strings, numbers, arbitrary objects in input → silently dropped, result stays empty | JSX may mix marker-children with plain content (text nodes, fragments); filter without crashing |
| 3 | **Order preservation** — markers appear in result in the same order as in input | Required for RouteView's first-Match-wins semantics; reorder would silently change which child renders |
| 4 | **Concat homomorphism** — `collect([...left, ...right]) ≡ collect(left) ∥ collect(right)` | Fundamental flatten-collect property; a depth-first walk swap would break here |
| 5 | **Arbitrary nesting** — triple-nested arrays `[[m1, [m2, [m3]]]]` flatten to `[m1, m2, m3]` | Solid's `<For>`/conditional rendering produces nested children; recursive `Array.isArray` walk must handle any depth |

## buildRenderList (RouteView helper)

`tests/property/routeView.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 8 | **At-most-one rendered (mutual exclusion)** — `buildRenderList(markers, routeName, nodeName).length <= 1` | Documented "first-match-wins" + "Self ⊥ NotFound mutual exclusion" contract; renderList must NEVER contain more than one entry |
| 8b | **Match suppresses Self/NotFound** when active route lives in the matched subtree | Even if Self and NotFound are also present, the activating Match alone wins |
| 8c | **UNKNOWN_ROUTE + NotFound → exactly one rendered (the NotFound)** | When no Match activates and active route === UNKNOWN_ROUTE, NotFound fires (not Self), assuming parent nodeName !== UNKNOWN_ROUTE |
| 9 | **First-Match-wins among multiple Match markers** — two Match markers with the same segment → only the first contributes | Locked via identifiable `"FIRST"` / `"SECOND"` payloads. Protects against last-wins refactor (e.g. reduce-based loop) |
| 10 | **First-Self-wins** — two Self markers in same RouteView → only the first contributes (`selfMarker ??= child`) | Later Self markers silently ignored; protects against last-wins switch |
| 11 | **Empty markers → empty result** — `buildRenderList([], any, any) === []` | Defensive baseline; no phantom element spawned |

## buildActiveClassName (`shared/dom-utils/link-utils.ts`)

`tests/property/linkUtils.properties.ts`. Mirrors the React adapter's invariant set so any regression in the shared symlink is caught on the Solid side too.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **No double spaces** — when `isActive=true`, result never contains `"  "` | Bug-1 regression: active concat used to emit `"base  active"`. CSS class lists tolerate it but downstream selectors and snapshot diffs do not. |
| 2 | **Active token present** — `isActive=true` + non-empty `activeClassName` → result contains the active token | Defines the function's primary purpose |
| 3 | **Active token at most once** — even if the active class is already in `baseClassName`, it must appear exactly once after merge | Set-based dedup of active vs base tokens |
| 4 | **Preserve base when inactive** — `isActive=false` → result is `baseClassName` verbatim | No `??`/coercion side-effect on the inactive branch |
| 5 | **Whitespace-only active token → base** — `activeClassName === ""` / whitespace → result equals `baseClassName` verbatim | `??`-not-`?:` branch in the helper |
| 6 | **Strict idempotency** — `f(true, a, f(true, a, base)) === f(true, a, base)` | First apply normalizes whitespace; second apply must reproduce the same string byte-for-byte |
| 6a | **Whitespace-immunity** — padded base (`\t`, `\n`, extra spaces) produces the same sorted token list as unpadded base | `parseTokens(value.match(/\S+/g))` normalizes; token set is the API-meaningful unit, not raw string |
| 7 | **Long-string length stress** — ≥256-char base preserves "active class present exactly once" | `parseTokens` is linear in length; no truncation, no thrash on `clsx(...arbitraryArgs)` |
| 8 | **base=undefined edge cases** (4 explicit pin-tests) — `(true, 'x', undefined)` → `'x'`; `(false, 'x', undefined)` → `undefined` (защита `??` vs `||`); `(true, '', undefined)` → `undefined`; `(true, 'a b c', undefined)` → `'a b c'` | Lock the `??` operator branch — switch to `||` would coerce `undefined` to `""` silently |

## buildHref (`shared/dom-utils/link-utils.ts`)

`tests/property/linkUtils.properties.ts`. Documents the hash-aware fallback contract introduced in #532 plus the long-standing fallback semantics.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Falls back to `buildPath` when `buildUrl` returns undefined** | URL plugins (`browser-plugin`, `navigation-plugin`) may bail; `Link` must still render an href |
| 2 | **Falls back to `buildPath` when `buildUrl` is absent** | Memory/console runtimes ship without a URL plugin |
| 3 | **Prefers `buildUrl` when defined and non-undefined** | The URL plugin is authoritative on the rendered href |
| 4 | **Throws → undefined + `console.error`** | `<Link>` must render without href rather than crash; error log helps consumers diagnose missing routes |
| 5 | **Hash encoding (RFC 3986 + defensive `%23` for `#`)** — fallback path appends `encodeURI(hash).replaceAll("#", "%23")` | `encodeURI` does not encode `#`; without the defensive replace, a hash containing `#` produces an invalid URL |
| 6 | **Leading `#` is stripped** — `hash="#x"` and `hash="x"` produce the same href | Convenience accepted defensively; the leading `#` is not part of the fragment |
| 7 | **Empty hash → no `#` suffix** — `hash === ""` (or `"#"` after strip) returns the bare path | Avoids stray `/path#` in href attributes |
| 8 | **`buildUrl` receives `{ hash }` only when defined** — never `{ hash: undefined }` | Plugins distinguish "no hash intent" (`options === undefined`) from "explicit empty fragment" (`options = { hash: "" }`) |
| 9 | **Hash determinism, NOT idempotency** — `buildHref(...) === buildHref(...)` on identical inputs; feeding the wire output back in DOUBLE-encodes (`%20` → `%2520`) per the decoded-input contract (#1211) | Pure-read determinism (no hidden state); the `hash` value is a decoded fragment, so a literal `%` is escaped to `%25` — idempotency on pre-encoded input is deliberately NOT a contract |
| 10 | **Path with query string + hash combo** — `/users?q=1#tab` → `<path>?<query>#<hash>` order preserved | Query string must come BEFORE hash per WHATWG URL; a swap would parse path as `users`, fragment as `tab?q=1`, losing query |
| 11 | **Relative path (no leading `/`)** — `users/list#tab` is preserved verbatim, no leading `/` injected | Custom plugins (memory-plugin, history-less adapters) emit relative paths; must not break |
| 12 | **`buildUrl` returning `null` / empty string falls through to `buildPath`** (3 explicit pin-tests) — `buildUrl=() => ""` → fallback; `buildUrl=() => null` (cast escape) → fallback; `buildUrl=() => "" + hash` → buildPath + hash | `BuildUrlFn` type contract is `string \| undefined`, but defensive `typeof url === "string" && url.length > 0` guards against `""` (would render `<a href="">` → silent self-navigation) and `null` (would render as `"null"` in stringifying renderers). |

## shallowEqual (`shared/dom-utils/link-utils.ts`)

`tests/property/shallowEqual.properties.ts`. Used internally by `navigateWithHash` (same-route detection). Symmetric with React's coverage.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `shallowEqual(o, o) === true` | Object.is fast-path; same-reference must always compare equal |
| 2 | **Symmetry** — `shallowEqual(a, b) === shallowEqual(b, a)` | Verdict is order-independent; defends against a regression iterating only one side |
| 3 | **NaN-aware** — `Object.is(NaN, NaN) === true`, `Object.is(+0, -0) === false` | Uses `Object.is`, not `===`. Switching to `===` would invert both edge cases |
| 4 | **Nullable short-circuit** — `(undefined, {})` and `({}, undefined)` are both `false` | Without the early check the value loop would NPE |
| 5 | **Key-count short-circuit** — different `Object.keys.length` → `false` | Performance + correctness: superset/subset must not pass |
| 6 | **Key-order insensitivity** — `{a:1, b:2}` ≡ `{b:2, a:1}` | Loop iterates one side's keys and looks up by name on the other |
| 7 | **Hostile keys are treated as ordinary string keys** — `__proto__`, dotted (`a.b`), Unicode keys do NOT confuse the loop with prototype lookups | `Object.prototype.hasOwnProperty.call(next, key)` guard prevents prototype-chain traversal |
| 8 | **Transitivity** — `a≡b ∧ b≡c ⇒ a≡c` | Required for a well-formed equivalence relation. Breaking it would silently break `navigateWithHash`'s same-route detection |
| 8a | **BigInt edge cases** (4 explicit pin-tests) — `1n === 1n` → true; `0n === -0n` → true (no signed-zero); `1n vs -1n` → false; `1n vs Number(1)` → false (no coercion) | Object.is on BigInt has no coercion to Number; locking this prevents silent same-route detection breakage on `id: 0n` |
| 9 | **Shallow-clone equivalence** — `shallowEqual(o, {...o}) === true` | Very common production pattern: spreading params before passing to navigate(). Clone has different identity but same own enumerable keys |
| 10 | **Cyclic objects do not cause infinite recursion** (3 explicit pin-tests) — self-cyclic record is reflexive; two structurally-identical cycles are NOT equal (per-key Object.is fails on `b !== a`); cross-referenced records do not crash | shallowEqual is one-level-deep by contract; locking the no-recursion answer prevents a "deep equality" refactor from stack-overflowing |
| 11 | **Undefined values vs missing keys at same length** — `{a: undefined, b: 1}` vs `{c: undefined, b: 1}` → false (hasOwnProperty guard prevents `undefined === undefined` silent match); positive control `{a: undefined}` vs `{a: undefined}` → true | Hot-spot bug-class: a naive `prev[key] === next[key]` without ownership check would collapse to true. Defends `navigateWithHash`'s same-params detection from missing real key changes |

## navigateWithHash (`shared/dom-utils/link-utils.ts`, #532)

`tests/property/navigateWithHash.properties.ts`. The Link click-handler navigation helper. Auto-bypasses core's `SAME_STATES` rejection on same-route hash-only navigations.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Same route + same hash → pass-through** — `opts.force` / `opts.hashChange` are NOT set | Adding them would force a redundant transition where `SAME_STATES` correctly rejects |
| 2 | **Same route + different hash → auto-bypass** — `opts.force=true` + `opts.hashChange=true` | Without this, hash-only `<Link>` navigation silently no-ops against `SAME_STATES` |
| 3 | **Different route → no auto-bypass** — even if hash differs, `force`/`hashChange` are NOT set | Cross-route navigation always passes core's normal checks |
| 4 | **`opts.hash` propagation** — `hash === undefined` → not added; `hash` defined → forwarded verbatim | Plugins use the presence of the key as intent |
| 5 | **No current state → straight navigate** — `router.getState() === undefined` → no `force`/`hashChange` | Same-route detection is meaningless before the router has started |
| 6 | **Auto-force overrides explicit `{force: false}`** — same route + different hash + `extraOptions.force=false` → still forces to `true` | Hash-only navigation MUST bypass SAME_STATES even if consumer accidentally passes `force: false`; documented override semantics |

## createHttpStatusSink

`tests/property/httpStatusSink.properties.ts`

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fresh `code === undefined`** — every call returns `{ code: undefined }`; writing to one sink does not leak into a later fresh sink | A module-level singleton would cross-pollinate response codes between concurrent requests |
| 2 | **Distinct identity per call** — N calls produce N distinct object references | `<HttpStatusCode>` writes through to the sink; sharing the reference across requests would corrupt the response status |
| 3 | **Last-write-wins on `.code`** — after N writes, `sink.code === codes.at(-1)`; writing `undefined` after a numeric code resets to `undefined` | `<HttpStatusCode>` writes during render; multiple instances must yield the last-rendered value, not first-wins or accumulator |
| 4 | **Shape stability** — sink owns exactly the `code` key (no metadata leakage); after `.code = N`, key set still equals `["code"]` | Public contract advertised in CLAUDE.md: `HttpStatusSink` is `{ code: number \| undefined }`. Adding bookkeeping fields would break consumers serializing via `{...sink}` |
| — | **Object.freeze breaks the documented constraint** (it-test) — `Object.freeze(sink)` makes `sink.code = N` throw TypeError under strict mode | Documented constraint, not a guarded one. Locks the failure mode so a defensive `Object.freeze` refactor surfaces here |

## createSignalFromSource

`tests/property/createSignalFromSource.properties.ts`. Solid-specific signal bridge: `RouterSource<T>` → `Accessor<T>` via `createSignal` + `onCleanup`.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Initial value mirrors `getSnapshot()`** | The accessor's first read must match the source's current snapshot |
| 2 | **Re-sync after subscribe (lazy reconciliation)** — if `getSnapshot()` changes between init read and the moment `subscribe` returns AND the new value is `!==` to the initial, the bridge picks up the change without a notify | Lazy cached sources reconcile their snapshot in `onFirstSubscribe` without notifying — the bridge calls `setValue(sync)` after `subscribe(...)` to compensate. Filtered on `!==` because Solid's default equality is strict (`0 === -0`, `NaN !== NaN`) |
| 3 | **Each emit propagates** — after N source emits, the accessor returns the last emitted value | Defines the bridge's primary purpose |
| 4 | **Default `===` equality — no spurious notify on same-reference re-emit** (verified via `createRenderEffect` run counter) — 3 same-reference emits produce `runs === 1` (baseline run only) | Solid `createSignal` default equality is strict `===` (not Object.is). A regression flipping to `{ equals: false }` would notify on every set and cascade spurious re-renders. The render-effect counter catches this — an accessor()-only check would not, because under `{equals: false}` accessor() still returns the same value |
| 5 | **Cleanup unsubscribes** — once the owner disposes, source emits no longer change the accessor | `onCleanup` contract; required for Solid's fine-grained ownership model to release subscriptions |
| 6 | **Error propagation from source** (2 tests) — `getSnapshot()` throw at init → bubbles to `createRoot`; `subscribe()` throw after `createSignal(getSnapshot())` → bubbles unchanged | Intentional: no defensive `try/catch`. A thrown source error is a contract violation, not recoverable; swallowing would hide bugs |
| 7 | **Double subscribe in one owner** — two calls on same source produce two independent listeners (`listeners() === 2`); both cleaned up together when shared owner disposes | Sources contract guarantees fan-out support. Locks the "no dedupe by source identity" behaviour |

## createStoreFromSource

`tests/property/createStoreFromSource.properties.ts`. Solid-specific store bridge: `RouterSource<T>` → `createStore` + `reconcile`.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Initial state mirrors `{...getSnapshot()}`** | Store is constructed from a shallow spread of the snapshot; field values match at creation |
| 2 | **Reconcile preserves identity for unchanged paths** — re-emitting a structurally-equal but freshly-allocated sub-object keeps the store's reference stable | Core granular-reactivity guarantee — readers of an unchanged path don't see a new reference and don't re-run. Without `reconcile`, every emit would invalidate every reader |
| 3 | **Changes are visible per-property** — emitting a snapshot with a single field change propagates the new value at that path | Defines the bridge's primary purpose |
| 4 | **Cleanup unsubscribes** — once the owner disposes, source emits do not mutate the store | `onCleanup` contract; required to release router subscriptions on component unmount |
| 5 | **Lazy reconcile after subscribe** — snapshot mutates during `subscribe()` without notifying; bridge picks up the change via `setState(reconcile(getSnapshot()))` after `subscribe(...)` returns | Mirrors createSignalFromSource Inv 2; cached lazy sources reconcile in `onFirstSubscribe` without notifying |
| 6 | **Null/non-object snapshot — behaviour-pin** (2 tests) — `getSnapshot: () => null` → empty store, no throw; `getSnapshot: () => 42` → empty store, no throw | `T extends object` defends at compile time; `as unknown as object` cast can sneak null/primitive. Solid `reconcile` is tolerant — silently no-ops on the empty store. Locks behaviour so a future defensive `if (typeof snapshot !== "object") throw` change surfaces as a test diff |

## shouldNavigate (`shared/dom-utils/link-utils.ts`)

`tests/property/shouldNavigate.properties.ts`. The gating helper used by every framework adapter on link clicks. Decides whether a click should be intercepted (true) or left to the browser (false: new-tab modifiers, middle-click, right-click).

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Modifier negation** — `shouldNavigate({button: 0, ...mods}) === !(any modifier set)` | If ANY of meta/alt/ctrl/shift is true, return false regardless of button. Locks the AND semantics of `!evt.<modifier>Key` clauses. Critical UX guarantee for ctrl/cmd-click → "open in new tab" |
| 2 | **Non-left button → false** regardless of modifiers — `button !== 0` always blocks navigation | Middle/right buttons must never navigate in-app. Crucial for "middle-click → open in new tab" UX |
| 3 | **Left button + no modifiers → true** (happy path) — the single combination that triggers in-app navigation | If this fires false, every link in every adapter becomes a no-op |
| 4 | **Synthetic event without `button` field → false** (also in `linkUtils.properties.ts`) — `evt.button === undefined !== 0` → false | Safe default for synthetic events from custom event factories. Regression guard against `!evt.button` normalization that would silently turn synthetic clicks into navigations |

## applyLinkA11y (`shared/dom-utils/link-utils.ts`)

`tests/property/applyLinkA11y.properties.ts` (jsdom-backed PBT — `@vitest-environment jsdom` magic comment) + `tests/property/linkUtils.properties.ts` (null/undefined defensive guard) + `tests/functional/link-directive.test.tsx` (DOM interactions).

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Null/undefined element → no-op (no throw)** — `applyLinkA11y(null)` and `applyLinkA11y(undefined)` do not throw | Defensive guard for unmounted DOM nodes or pre-mount calls |
| 2 | **Idempotency** — `applyLinkA11y(el)` followed by `applyLinkA11y(el)` yields the same attribute state as a single call (role="link", tabindex="0") | `hasAttribute` guard ensures second application reads the attributes set by the first and short-circuits |
| 3 | **HTMLAnchorElement / HTMLButtonElement skip** — `<a>` and `<button>` get NEITHER `role` NOR `tabindex` injected; non-focusable elements (div, span, li, section, article, p, header, nav, …) DO get role="link" + tabindex="0" | Anchors and buttons are natively accessible; injecting `role="link"` would break native a11y semantics |
| 4 | **Existing `role` / `tabindex` preserved** — pre-set role (e.g. `"button"`, `"menuitem"`, `"tab"`, `"switch"`, `"checkbox"`) or tabindex (e.g. `"-1"`, `"0"`, `"1"`, `"5"`) survives `applyLinkA11y` call; only the unset attribute is filled with the default | Consumer-supplied a11y attributes must not be silently overwritten — defensive `hasAttribute` guard is the contract |

## keyOf / canonicalJson (`shared/dom-utils/scroll-restore.ts` — test-only export)

`tests/property/scrollRestoreKey.properties.ts`. **`keyOf`/`canonicalJson`** are internal helpers behind `createScrollRestoration`'s sessionStorage cache. **Not exported from the `shared/dom-utils/index.ts` barrel** — exposed only via direct file path for test access (audit-2026-05-16 #S3).

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **`keyOf` shape** — `keyOf(state) === `${state.name}:${canonicalJson({...state.params, ...state.search})}`` for any state — keyed over BOTH the path and query channels (RFC-4 M2, #1548), merged (not `params:search`) so a query-less route keeps its pre-split key shape (`name:{}`). Locked also via a separator check ("colon comes right after name, no embedded colons in the prefix"). | The persisted sessionStorage key format. A change to the separator or composition silently invalidates every saved scroll position across an upgrade |
| 2 | **`canonicalJson` key-order-insensitive** — `canonicalJson({a:1, b:2}) === canonicalJson({b:2, a:1})` for any record | Defines the same-route same-params/search scroll-cache entry sharing. `<Link routeParams={...}>` / `<Link routeSearch={...}>` with semantically-equal values must hit the same key |
| 3 | **`canonicalJson` deterministic** — `canonicalJson(x) === canonicalJson(x)` across N calls on the same value | Locks against accidental randomized iteration order |
| 4 | **`canonicalJson` recursive sort** — nested object keys are also sorted at every depth (`canonicalReplacer` applies recursively) | A top-only sort would silently desync cache keys for deep params |
| 5 | **`canonicalJson` arrays preserve positional order** — arrays are not sorted (only object keys); `canonicalJson(arr) === JSON.stringify(arr)` for primitive arrays | Arrays are positional data; sorting them would corrupt semantic meaning |
| 6 | **Primitive / null / undefined pass-through** — matches `JSON.stringify` semantics; null → `"null"`; undefined → `undefined` (the value, not the string) | `canonicalReplacer` short-circuits non-object values, preserving JSON.stringify behaviour |
