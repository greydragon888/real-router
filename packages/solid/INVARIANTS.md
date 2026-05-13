# @real-router/solid — Invariants

Invariants verified by property-based tests in `tests/property/`.

## isRouteActive (RouterProvider selector)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact match** — `isRouteActive("X", "X") === true` | A link's own route must always be considered active |
| 2 | **Ancestor match** — `isRouteActive("parent", "parent.child") === true` | Parent links stay active when a child route is current (breadcrumb/nav highlighting) |
| 3 | **Non-ancestor prefix** — `isRouteActive("users", "users2") === false` | String prefix without dot boundary must NOT be treated as ancestor |
| 4 | **Reverse NOT true** — `isRouteActive("parent.child", "parent") === false` | A child link must NOT be active when only the parent is current |
| 5 | **Self-match** — `isRouteActive(name, name) === true` for any name | Redundant with #1 but tested with random dotted names for robustness |

## isSegmentMatch (RouteView helper)

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Exact self-match** — `isSegmentMatch(name, name, true) === true` | A route must always match itself in exact mode |
| 2 | **Exact mismatch** — `isSegmentMatch(a, b, true) === false` when `a !== b` | Exact mode must reject different names |
| 3 | **Parent prefix matches child** — `isSegmentMatch("parent.child", "parent", false) === true` | Non-exact mode must recognize ancestor relationships |
| 4 | **Child does not match parent** — `isSegmentMatch("parent", "parent.child", false) === false` | A parent route name cannot start with a child's longer name |

## buildActiveClassName (`shared/dom-utils/link-utils.ts`)

Mirrors the React adapter's invariant set so any regression in the shared symlink is caught on the Solid side too.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **No double spaces** — when `isActive=true`, result never contains `"  "` | Bug-1 regression: active concat used to emit `"base  active"`. CSS class lists tolerate it but downstream selectors and snapshot diffs do not. |
| 2 | **Active token present** — `isActive=true` + non-empty `activeClassName` → result contains the active token | Defines the function's primary purpose |
| 3 | **Active token at most once** — even if the active class is already in `baseClassName`, it must appear exactly once after merge | Set-based dedup of active vs base tokens |
| 4 | **Preserve base when inactive** — `isActive=false` → result is `baseClassName` verbatim | No `??`/coercion side-effect on the inactive branch |
| 5 | **Whitespace-only active token → base** — `activeClassName === ""` / whitespace → result equals `baseClassName` verbatim | `??`-not-`?:` branch in the helper |
| 6 | **Strict idempotency** — `f(true, a, f(true, a, base)) === f(true, a, base)` | First apply normalizes whitespace; second apply must reproduce the same string byte-for-byte |

## buildHref (`shared/dom-utils/link-utils.ts`)

Documents the hash-aware fallback contract introduced in #532 plus the long-standing fallback semantics.

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

## shallowEqual (`shared/dom-utils/link-utils.ts`)

Used internally by `navigateWithHash` (same-route detection). Symmetric with React's coverage.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Reflexivity** — `shallowEqual(o, o) === true` | Object.is fast-path; same-reference must always compare equal |
| 2 | **Symmetry** — `shallowEqual(a, b) === shallowEqual(b, a)` | Verdict is order-independent; defends against a regression iterating only one side |
| 3 | **NaN-aware** — `Object.is(NaN, NaN) === true`, `Object.is(+0, -0) === false` | Uses `Object.is`, not `===`. Switching to `===` would invert both edge cases |
| 4 | **Nullable short-circuit** — `(undefined, {})` and `({}, undefined)` are both `false` | Without the early check the value loop would NPE |
| 5 | **Key-count short-circuit** — different `Object.keys.length` → `false` | Performance + correctness: superset/subset must not pass |
| 6 | **Key-order insensitivity** — `{a:1, b:2}` ≡ `{b:2, a:1}` | Loop iterates one side's keys and looks up by name on the other |

## navigateWithHash (`shared/dom-utils/link-utils.ts`, #532)

The Link click-handler navigation helper. Auto-bypasses core's `SAME_STATES` rejection on same-route hash-only navigations.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Same route + same hash → pass-through** — `opts.force` / `opts.hashChange` are NOT set | Adding them would force a redundant transition where `SAME_STATES` correctly rejects |
| 2 | **Same route + different hash → auto-bypass** — `opts.force=true` + `opts.hashChange=true` | Without this, hash-only `<Link>` navigation silently no-ops against `SAME_STATES` |
| 3 | **Different route → no auto-bypass** — even if hash differs, `force`/`hashChange` are NOT set | Cross-route navigation always passes core's normal checks |
| 4 | **`opts.hash` propagation** — `hash === undefined` → not added; `hash` defined → forwarded verbatim | Plugins use the presence of the key as intent |
| 5 | **No current state → straight navigate** — `router.getState() === undefined` → no `force`/`hashChange` | Same-route detection is meaningless before the router has started |

## createHttpStatusSink

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Fresh `code === undefined`** — every call returns `{ code: undefined }`; writing to one sink does not leak into a later fresh sink | A module-level singleton would cross-pollinate response codes between concurrent requests |
| 2 | **Distinct identity per call** — N calls produce N distinct object references | `<HttpStatusCode>` writes through to the sink; sharing the reference across requests would corrupt the response status |

## createSignalFromSource

Solid-specific signal bridge: `RouterSource<T>` → `Accessor<T>` via `createSignal` + `onCleanup`.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Initial value mirrors `getSnapshot()`** | The accessor's first read must match the source's current snapshot |
| 2 | **Re-sync after subscribe (lazy reconciliation)** — if `getSnapshot()` changes between init read and the moment `subscribe` returns AND the new value is `!==` to the initial, the bridge picks up the change without a notify | Lazy cached sources reconcile their snapshot in `onFirstSubscribe` without notifying — the bridge calls `setValue(sync)` after `subscribe(...)` to compensate. Filtered on `!==` because Solid's default equality is strict (`0 === -0`, `NaN !== NaN`) |
| 3 | **Each emit propagates** — after N source emits, the accessor returns the last emitted value | Defines the bridge's primary purpose |
| 4 | **Default `===` equality** — re-emit of the same reference is a no-op | Solid `createSignal` default equality is strict `===` (not Object.is). A regression flipping to `{ equals: false }` would notify on every set and cascade spurious re-renders downstream |
| 5 | **Cleanup unsubscribes** — once the owner disposes, source emits no longer change the accessor | `onCleanup` contract; required for Solid's fine-grained ownership model to release subscriptions |

## createStoreFromSource

Solid-specific store bridge: `RouterSource<T>` → `createStore` + `reconcile`.

| # | Invariant | Why it must hold |
|---|-----------|-----------------|
| 1 | **Initial state mirrors `{...getSnapshot()}`** | Store is constructed from a shallow spread of the snapshot; field values match at creation |
| 2 | **Reconcile preserves identity for unchanged paths** — re-emitting a structurally-equal but freshly-allocated sub-object keeps the store's reference stable | Core granular-reactivity guarantee — readers of an unchanged path don't see a new reference and don't re-run. Without `reconcile`, every emit would invalidate every reader |
| 3 | **Changes are visible per-property** — emitting a snapshot with a single field change propagates the new value at that path | Defines the bridge's primary purpose |
| 4 | **Cleanup unsubscribes** — once the owner disposes, source emits do not mutate the store | `onCleanup` contract; required to release router subscriptions on component unmount |
