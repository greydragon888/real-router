# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## createRouteSource — Snapshot Tracking

| #   | Invariant                                                    | Description                                                                                                                                                                         |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Initial snapshot reflects router state                       | `getSnapshot()` returns `{ route: router.getState(), previousRoute: undefined }` at source creation time, regardless of prior navigation history.                                   |
| 2   | Route name matches navigation target                         | After navigating to a route, `getSnapshot().route.name` equals the navigated route name.                                                                                            |
| 3   | previousRoute after A to B equals A                          | After navigating A then B, `getSnapshot().previousRoute.name` equals A's route name.                                                                                                |
| 4   | Snapshot after A to B to C has route C and previousRoute B   | After three sequential navigations, the snapshot correctly reflects the last two routes in the chain.                                                                               |
| 5   | getSnapshot returns same object reference without navigation | Calling `getSnapshot()` multiple times without any intervening navigation returns the exact same object reference (referential equality).                                           |
| 6   | Listener called at most once per navigation                  | A subscribed listener is invoked at most once for each successful navigation. When `stabilizeState` determines the snapshot hasn't changed (same path), the listener is not called. |
| 7   | Destructured methods work without `this` context             | `subscribe`, `getSnapshot`, and `destroy` extracted via destructuring all function correctly without being bound to the source instance.                                            |

## createRouteSource — Lazy-Connection

| #   | Invariant                                                           | Description                                                                                                                                             |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No router subscription before first subscribe                       | Creating a source does not subscribe to the router. The router subscription is established only when the first listener is added.                       |
| 2   | Router subscription removed after last listener unsubscribes        | After all listeners unsubscribe, the source disconnects from the router and subsequent navigations do not invoke any listener.                          |
| 3   | Re-subscribing after full unsub creates a new router subscription   | After a complete subscribe/unsubscribe cycle, adding a new listener establishes a fresh router subscription, verified by spy call count.                |
| 4   | N simultaneous listeners produce exactly one router.subscribe call  | No matter how many listeners are added, the source calls `router.subscribe` exactly once.                                                               |
| 5   | Removing one of N listeners does not disconnect router subscription | Unsubscribing a single listener while others remain active keeps the router subscription alive and the remaining listeners continue to receive updates. |
| 6   | K subscribe/unsubscribe cycles produce zero leaked subscriptions    | Repeated mount/unmount cycles leave no dangling router subscriptions. The spy call count equals the number of cycles.                                   |
| 7   | Double-unsubscribe is safe and does not affect remaining listeners  | Calling a returned unsubscribe function twice is a no-op the second time. Other active listeners continue to receive updates normally.                  |

## createRouteSource — Subscribe Order

| #   | Invariant                                                                                | Description                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | First listener is registered BEFORE `onFirstSubscribe` runs                              | Synchronous `updateSnapshot` triggered from inside `onFirstSubscribe` reaches the just-added listener — verified via post-prime snapshot identity. |
| 2   | `subscribe → navigate → unsubscribe → subscribe` reconnects without missing navigations  | The re-subscribed listener observes a subsequent navigation exactly once, confirming the reconnect path re-arms the listener set.        |
| 3   | Navigation while disconnected (zero subscribers) is reconciled on re-subscribe (#765)    | After a full unsubscribe, a navigation that lands with zero subscribers, then re-subscribe: `getSnapshot().route` reflects the navigation that happened while disconnected — not the stale pre-disconnect snapshot. Kills the "stale snapshot survives reconnect" mutant. |

## createRouteSource — Destroy

| #   | Invariant                                           | Description                                                                                                                                              |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | destroy() removes router subscription               | After `destroy()`, navigations no longer invoke any listener, confirming the router subscription was removed.                                            |
| 2   | destroy() is idempotent                             | Calling `destroy()` N times is safe and equivalent to calling it once. No errors are thrown and the subscription remains removed.                        |
| 3   | getSnapshot() after destroy returns last snapshot   | `getSnapshot()` continues to return the snapshot captured at destroy time, preserving the last known state.                                              |
| 4   | subscribe() after destroy returns no-op unsubscribe | Calling `subscribe()` on a destroyed source returns a no-op function. The listener is never invoked and calling the returned unsubscribe does not throw. |

## createRouteNodeSource — Node Scoping

| #   | Invariant                                                                  | Description                                                                                                                                         |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Node is active after navigating to itself                                  | After navigating directly to a node's route, `getSnapshot().route` is not undefined.                                                                |
| 2   | Node is active for descendant routes                                       | After navigating to any descendant of the node, `getSnapshot().route` is not undefined.                                                             |
| 3   | Node is inactive for unrelated routes                                      | After navigating to a route that is neither the node nor any of its descendants, `getSnapshot().route` is undefined.                                |
| 4   | Root node is always active                                                 | A source created with `nodeName = ""` always has a non-undefined `route` that matches `router.getState()`, regardless of the current route.         |
| 5   | Listener not called when navigation is outside node subtree                | Navigating to a route unrelated to the node does not invoke the listener.                                                                           |
| 6   | Snapshot reference is stable when navigation does not affect node          | When a navigation doesn't touch the node's subtree, `getSnapshot()` returns the exact same object reference as before (Object.is equality).         |
| 7   | Root source route is not undefined when node source route is not undefined | If a node-scoped source has a defined route, the root-scoped source (`nodeName = ""`) also has a defined route. The root is a superset of any node. |
| 8   | previousRoute reflects prior route after within-subtree navigation         | After navigating A then B within the node's subtree, `getSnapshot().previousRoute.name` equals A's route name.                                      |
| 9   | previousRoute chain: after A→B→C in subtree, previousRoute is B            | After three sequential navigations within the subtree, `previousRoute` reflects the second navigation, not the first.                               |
| 10  | previousRoute is global, includes routes outside node subtree              | After leaving the subtree and returning, `previousRoute` holds the route from outside the subtree that was navigated away from.                     |

## createRouteNodeSource — Lazy-Connection and Reconnection

| #   | Invariant                                                                | Description                                                                                                                                       |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No router subscription before first subscribe                            | Creating a node source does not subscribe to the router until the first listener is added.                                                        |
| 2   | Router unsubscribes when last listener is removed                        | Removing all but the last listener does not disconnect from the router. Removing the final listener triggers exactly one router unsubscribe call. |
| 3   | Snapshot reflects current state after reconnection                       | After unsubscribing, navigating, then re-subscribing, the snapshot reflects the current router state rather than the stale pre-disconnect state.  |
| 4   | Snapshot is current after multiple mount/unmount cycles with navigations | Across repeated subscribe/navigate/unsubscribe/resubscribe cycles, the snapshot always reflects the actual current router state on reconnection.  |
| 5   | Double-unsubscribe is safe and does not affect remaining listeners       | Calling a returned unsubscribe function twice is a no-op the second time. Other active listeners continue to receive updates normally.            |

## createRouteNodeSource — Cache Identity

| #   | Invariant                                                                                  | Description                                                                                                                |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `createRouteNodeSource(router, name)` returns the same instance for the same `(router, name)` key | Per-router × per-nodeName caching is reference-stable.                                                            |
| 2   | Different nodeNames on the same router yield different instances                           | Cache differentiation on the nodeName dimension.                                                                          |
| 3   | Different routers are isolated: same nodeName yields independent instances                 | WeakMap keying prevents cross-router cache collisions.                                                                     |
| 4   | Different-router subscriptions are isolated                                                | A navigation on one router does not notify subscribers of a source bound to a different router (same nodeName).            |

## createRouteNodeSource — Destroy

| #   | Invariant                                       | Description                                                                                                       |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | destroy is idempotent                           | Calling `destroy()` multiple times does not throw and leaves the source in a consistent torn-down state.          |
| 2   | subscribe returns no-op after destroy           | After `destroy()`, calling `subscribe()` returns a no-op unsubscribe function and the listener is never invoked.  |
| 3   | getSnapshot returns last snapshot after destroy | `getSnapshot()` returns the snapshot that was current at destroy time, preserving the last known state.           |
| 4   | destroy removes router subscription             | After `destroy()`, exactly one router unsubscribe call has been made, confirming the subscription was cleaned up. |

## createActiveRouteSource — Boolean Tracking

| #   | Invariant                                                       | Description                                                                                                                                                                 |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Initial value matches router.isActiveRoute                      | At creation time, `getSnapshot()` equals `router.isActiveRoute(routeName, params, strict, ignoreQueryParams)` for any combination of options.                               |
| 2   | Snapshot consistent with router.isActiveRoute after navigations | After any sequence of navigations, `getSnapshot()` always equals the result of `router.isActiveRoute` with the same arguments.                                              |
| 3   | Listener called only when boolean value changes                 | The listener is invoked only when the active state transitions from `true` to `false` or vice versa. Navigations that don't change the boolean do not trigger the listener. |
| 4   | strict=false: parent route active when on descendant            | With `strict: false` (the default), a parent route is considered active when the current route is any of its descendants.                                                   |
| 5   | strict=true: parent route inactive when on descendant           | With `strict: true`, a parent route is only active when the current route exactly matches it, not when on a descendant.                                                     |
| 6   | Monotonicity: strict=true active implies strict=false active    | If a route is active under `strict: true`, it is also active under `strict: false` for the same params. The strict mode is a subset of the non-strict mode.                 |

## createActiveRouteSource — areRoutesRelated Filter

| #   | Invariant                                                             | Description                                                                                                                                                          |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Filter is transparent: snapshot matches oracle after every navigation | The `areRoutesRelated` pre-filter is a pure optimization. The snapshot value after every navigation matches `router.isActiveRoute` exactly, as if no filter existed. |
| 2   | Listener not called for navigations between unrelated routes          | When navigating between routes that have no relationship to the tracked route, the listener is never invoked.                                                        |
| 3   | Listener called when navigating to and from watched route             | When navigating into or out of the tracked route (and the boolean value changes), the listener is invoked.                                                           |

## createActiveRouteSource — Cache Identity (canonicalJson-keyed)

| #   | Invariant                                                                                  | Description                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Params equivalent under `canonicalJson` hit the same cache entry                           | `{a:1, b:2}` and reordered `{b:2, a:1}` deterministically yield the same source instance.                                         |
| 2   | Different routers are isolated under the same `(name, params, options)` key                | WeakMap keying prevents cross-router cache collisions.                                                                            |
| 3   | Hash-aware monotonicity under no-url-plugin fixture                                        | When `opts.hash` is a **non-empty** string and the router has no URL-publishing plugin, the snapshot is `false` across every navigation — `readContextHash` returns `""`, which never equals a non-empty fragment. Exception: `opts.hash === ""` matches the empty fragment, so an active route returns `true` even with no plugin (#532). |
| 4   | Hash-aware variants are cache-isolated from hash-less variants                             | The same `(name, params, options-without-hash)` and `(name, params, options-with-hash)` calls return different instances.         |

## createActiveRouteSource — Lazy-Connection and Reconnection (#766)

| #   | Invariant                                                                   | Description                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No router subscription before first subscribe                               | Creating an active-route source does not subscribe to the router until the first listener is added.                                                                                                                 |
| 2   | Connects on first listener, disconnects on last, reconnects on re-subscribe | The router subscription is established on the first listener, torn down when the last detaches, and re-established when a new listener attaches after a full unsubscribe — verified by spy call count.                |
| 3   | Active state changed while disconnected is reconciled on re-subscribe        | After a full unsubscribe, a navigation that flips the tracked route's active status while the source has zero listeners, then re-subscribe: `getSnapshot()` reflects the current boolean — `onFirstSubscribe` reconciles, not the stale pre-disconnect value. |

## createActiveRouteSource — Destroy

| #   | Invariant                                                   | Description                                                                                                                 |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | destroy unsubscribes from router                            | After `destroy()`, navigations no longer invoke any listener, confirming the router subscription was removed.               |
| 2   | destroy is idempotent                                       | Calling `destroy()` N times does not throw and leaves the source consistently torn down.                                    |
| 3   | post-destroy getSnapshot returns last boolean value         | `getSnapshot()` returns the boolean value that was current at destroy time.                                                 |
| 4   | post-destroy subscribe returns no-op unsubscribe            | After `destroy()`, `subscribe()` returns a no-op. The listener is never called and the returned unsubscribe does not throw. |
| 5   | post-destroy navigation: no errors and snapshot not updated | Navigating after `destroy()` does not throw and does not change the snapshot from its value at destroy time.                |

## createTransitionSource — State Machine

| #   | Invariant                                                            | Description                                                                                                                                        |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Initial snapshot is IDLE regardless of prior router state            | `getSnapshot()` returns `{ isTransitioning: false, isLeaveApproved: false, toRoute: null, fromRoute: null }` at creation time, no matter what navigations occurred before. |
| 2   | isTransitioning is true and toRoute set at TRANSITION_START          | When a navigation begins (observable via an async guard), `isTransitioning` is `true` and `toRoute.name` equals the navigation target.             |
| 3   | Snapshot returns to IDLE after each successful navigation            | After every completed navigation, the snapshot is back to the IDLE state.                                                                          |
| 4   | Snapshot returns to IDLE after guard rejection (TRANSITION_ERROR)    | When a guard rejects a navigation, the snapshot returns to IDLE after the error event.                                                             |
| 5   | Snapshot returns to IDLE after navigation cancel (TRANSITION_CANCEL) | When a navigation is cancelled by a subsequent navigation, the snapshot returns to IDLE after the cancel event.                                    |
| 6   | fromRoute at TRANSITION_START matches the prior router state         | During a transition, `fromRoute.name` equals the route that was active before the navigation started.                                              |
| 7   | All IDLE snapshots are the same object reference                     | Every time the source returns to IDLE, `getSnapshot()` returns the exact same object (Object.is equality). IDLE is a singleton reference.          |
| 8   | Listener is invoked on each transition state change                  | The listener is called at least twice during an async navigation: once at TRANSITION_START and at least once more when the transition resolves.    |

## createTransitionSource — Concurrent Navigation

| #   | Invariant                                                                | Description                                                                                                                                                     |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Concurrent cancel: first navigation cancelled, final snapshot is IDLE    | When a second navigation cancels the first, the final snapshot after both settle is IDLE.                                                                       |
| 2   | Final snapshot is IDLE after all concurrent navigations settle           | After firing multiple navigations concurrently and awaiting all of them, the snapshot is always IDLE.                                                           |
| 3   | toRoute reflects current navigation target during concurrent transitions | While the first navigation is in progress, `toRoute.name` matches its target. After the second navigation takes over and completes, `isTransitioning` is false. |

## createTransitionSource — isLeaveApproved Monotonicity

| #   | Invariant                                                                | Description                                                                                                                          |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `isLeaveApproved` goes `true` on `TRANSITION_LEAVE_APPROVE`, then `false` on `TRANSITION_SUCCESS` | The flag tracks the activation-pending window; SUCCESS restores IDLE.                                                |
| 2   | `isLeaveApproved` resets to `false` on `TRANSITION_ERROR` (activate-guard rejection) | Any terminal error event restores IDLE.                                                                                       |
| 3   | `isLeaveApproved` resets to `false` on `TRANSITION_CANCEL`               | A concurrent navigation that cancels the current one restores IDLE.                                                                  |

## createTransitionSource — Destroy

| #   | Invariant                                                         | Description                                                                                                                   |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | destroy removes all router event listeners                        | After `destroy()`, navigations do not invoke any listener and `isTransitioning` remains false.                                |
| 2   | destroy is idempotent                                             | Calling `destroy()` N times does not throw.                                                                                   |
| 3   | post-destroy getSnapshot returns the last snapshot before destroy | `getSnapshot()` returns the snapshot that was current at destroy time.                                                        |
| 4   | post-destroy navigation does not update snapshot or throw errors  | Navigating after `destroy()` does not change the snapshot and does not throw. The snapshot remains at its destroy-time value. |
| 5   | post-destroy subscribe returns no-op unsubscribe                  | After `destroy()`, `subscribe()` returns a no-op. The listener is never called and the returned unsubscribe does not throw.   |

## stabilizeState — State Stabilization

| #   | Invariant                                                  | Description                                                                                         |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `stabilizeState(a, a) === a`                               | Same reference is returned immediately.                                                             |
| 2   | `prev.path === next.path → result === prev`                | When paths match (same canonical URL), the previous State reference is preserved.                   |
| 3   | `prev.path !== next.path → result === next`                | When paths differ, the new State is returned.                                                       |
| 4   | `stabilizeState(undefined, undefined) === undefined`       | Both nullish values return prev.                                                                    |
| 5   | `stabilizeState(undefined, state) === state`               | Transition from nullish to State returns next.                                                      |
| 6   | `stabilizeState(state, undefined) === undefined`           | Transition from State to nullish returns next.                                                      |
| 7   | Hash-aware: same path, different hash → returns `next`     | Synthetic path-equal states with differing `state.context.url.hash` surface as a fresh render (#532). |
| 8   | Hash-aware: same path, same hash → returns `prev` (dedup)  | Two path-and-hash-equal states stabilize to the prev reference.                                     |
| 9   | Hash-aware: presence flip (undefined ↔ string) → returns `next` | Adding or removing a hash claim is a render-relevant change in either direction.                  |
| 10  | Reload-aware (synthetic): `next.transition.reload=true` → returns `next` | Verified directly on path-equal synthetic states, not just observed via router output (#605). |
| 11  | Reload-aware (synthetic): `next.transition.reload=false` → returns `prev` | Non-reload navs to the same path dedup normally.                                            |
| 12  | Reload-aware is one-way                                    | `prev.transition.reload=true` alone does not bypass dedup — only `next.reload=true` triggers it.    |

---

## computeSnapshot — Node Snapshot Builder

| #   | Invariant                                                       | Description                                                                                                                          |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Reference stability without `next`                              | `computeSnapshot(snap, router, node)` then re-fed (`computeSnapshot(first, router, node)`) returns the same reference (idempotent).   |
| 2   | Idempotency under same `next`                                   | `f(snap, router, node, next) === f(f(...), ...)` when `next` is fixed.                                                                |
| 3   | Root dominance                                                  | `nodeName === ""` → `result.route === router.getState()`.                                                                             |
| 4   | Subtree containment                                             | When the navigated route exactly matches the node, `result.route` is defined and equals the navigated route.                          |
| 5   | False-positive subtree match                                    | `node="users"` + current `"users.list"` is active (parent contains child).                                                            |
| 6   | Unrelated route                                                 | `result.route` is `undefined`, `previousRoute` carries the input value, and the result equals `currentSnapshot` by reference.         |
| 7   | leaf-active ⇒ ancestor-active (containment monotonicity)         | If `computeSnapshot(.., node="users.list").route` is defined, then `computeSnapshot(.., node="users").route` is also defined and equals it. |
| 8   | Root is at-least-as-active as any specific nodeName              | When a specific node is inactive, the root snapshot still reflects `router.getState()`; when active, both snapshots share the same route reference. |

---

## createErrorSource — Error Tracking

| #   | Invariant                                                | Description                                                                                                                                              |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Error snapshot version increments monotonically          | Each new error produces a snapshot with a strictly greater `version` than the previous one. Version never decreases or stays the same across errors.      |
| 2   | Error cleared on TRANSITION_SUCCESS                      | After a successful navigation, `error` is `null`, `toRoute` is `null`, and `fromRoute` is `null`. The error state fully resets on any successful transition. |
| 3   | Snapshot reference stable between events                 | Calling `getSnapshot()` multiple times without an intervening error event returns the exact same object reference (referential equality).                 |
| 4   | Destroy is idempotent                                    | Calling `destroy()` N times does not throw and leaves the source consistently torn down.                                                                 |

## createErrorSource — Destroy

| #   | Invariant                                                        | Description                                                                                                                   |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Post-destroy listeners not notified on new errors                | After `destroy()`, new navigation errors do not invoke any subscribed listener.                                               |
| 2   | Post-destroy getSnapshot returns last snapshot before destroy    | `getSnapshot()` returns the snapshot that was current at destroy time, preserving the last known state.                       |
| 3   | Long-run version monotonicity (≥100 errors)                      | Across sequences of 100+ navigation errors, the snapshot `version` is strictly increasing — no plateau, no rollback.          |
| 4   | `TRANSITION_SUCCESS` does NOT advance `version`                  | A successful navigation clears `error`/`toRoute`/`fromRoute` but the `version` field is sticky (only `TRANSITION_ERROR` advances it). |
| 5   | `TRANSITION_CANCEL` leaves snapshot reference unchanged          | A concurrent navigation that cancels another does not produce any error event; the source's snapshot reference is preserved.   |

---

## canonicalJson — Cache-Key Stability

| #   | Invariant                                                     | Description                                                                                                                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Key-order invariance                                          | `canonicalJson(x) === canonicalJson(reorder(x))` for any deep reordering of object keys.                                                                     |
| 2   | Determinism                                                   | Repeated calls with the same input produce the same string.                                                                                                  |
| 3   | Idempotency under JSON round-trip                             | `canonicalJson(JSON.parse(canonicalJson(x))) === canonicalJson(x)`.                                                                                          |
| 4   | Structural collisions match canonical equality                | Two records collide on `canonicalJson` iff they are structurally identical up to key order (oracle: independent sorted-JSON encoder).                        |
| 5   | Deep-recursion stability                                      | Nested structures (objects within objects within arrays) terminate without throwing and the result round-trips back to itself through `canonicalJson`.        |
| 6   | Throw-contract: `Map` / `Set` / `WeakMap` / `WeakSet` / `RegExp`     | These instances would otherwise collapse to `"{}"` and silently collide on cache keys. `canonicalJson` throws `TypeError` eagerly at any nesting depth so callers fall back to a fresh non-cached source. |
| 7   | Throw-contract: `BigInt`                                       | `JSON.stringify` rejects `BigInt`; `canonicalJson` propagates that `TypeError` at any nesting depth so the cache fallback runs.                                |
| 8   | Throw-contract: circular references                            | Native `JSON.stringify` throws `TypeError` on a cycle, but the canonicalising replacer copies each level into a fresh object — the native cycle detector never sees the original graph. `canonicalJson` runs its own path-based detection (`Set<object>` with finally-cleanup) so cycles surface as `TypeError("circular structure")` while DAGs (shared refs reachable via independent branches) serialise normally. |
| 9   | `__proto__` key preservation (no prototype pollution / no collision) | `__proto__` is treated as a regular own property — the canonical output of `{ __proto__: 1, b: 2 }` differs from `{ b: 2 }` and from `{ __proto__: 2, b: 2 }`. Implementation uses `Object.create(null)` for the sorted record. |
| 10  | Locale independence (byte-order key comparison)                 | Object keys are sorted with raw `<` / `>` comparisons rather than `localeCompare`, so the canonical form does not drift across Node ICU builds or system locales. Different insertion orders of the same key set produce identical canonical strings. |

---

## normalizeActiveOptions — Defaults & Idempotency

| #   | Invariant                                                  | Description                                                                                                       |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Idempotency                                                | `normalize(normalize(x))` structurally equals `normalize(x)`.                                                     |
| 2   | Default-fill semantics                                     | Missing booleans default to `DEFAULT_ACTIVE_OPTIONS`; missing `hash` stays `undefined` (the "ignore hash" sentinel). |
| 3   | DEFAULT_ACTIVE_OPTIONS immutability                        | Repeated normalizations do not mutate the frozen defaults.                                                        |
| 4   | Explicit values pass through                               | Any explicitly-provided field is returned verbatim, regardless of defaults.                                       |
| 5   | Input non-mutation                                         | `normalize(x)` does not mutate its input — repeated normalisations leave the input's keys, values, and ordering structurally identical to the pre-call snapshot. |
| 6   | Output totality                                            | Result always has exactly three own keys — `strict`, `ignoreQueryParams`, `hash` — regardless of which fields the input supplied. |

---

## createDismissableError — Dismissal Wrapper

| #   | Invariant                                                                       | Description                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Version non-decreasing across error / reset / getSnapshot cycles                | Across any random sequence of error events and `resetError()` calls, the snapshot's `version` is non-decreasing.                          |
| 2   | After `resetError()`, error is null until a new error arrives                   | Immediately after `resetError()`, `error`, `toRoute`, and `fromRoute` are all `null` until the next `TRANSITION_ERROR` event.            |
| 3   | `resetError()` is idempotent                                                    | Back-to-back `resetError()` calls produce the same snapshot — `version` does not change, `error` stays `null`.                            |
| 4   | Subscribers fire only on state-relevant actions                                 | Listener call count is at least the number of (error events + first reset after each error) — purely cosmetic operations don't notify.   |
| 5   | `createDismissableError(router)` is per-router cached                           | Repeated calls return the same instance for the same router.                                                                              |
| 6   | `resetError()` no-op-guard: extra resets after dismissal do not notify          | When `currentVersion <= dismissedVersion`, `resetError()` short-circuits without bumping listener notifications — only the first reset after each fresh error fires the listener. |
| 7   | Error before first subscribe is caught up on subscribe (#765.2)                 | An error event that fires while the wrapper has zero subscribers is surfaced on first subscribe: `getSnapshot()` returns the error (not `{ error: null, version: 0 }`) and the listener added before `onFirstSubscribe` receives the reconcile — closing the reconnect-staleness gap. |

---

## createActiveNameSelector — Shared Active-Name Checker

| #   | Invariant                                                                       | Description                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cache identity                                                                  | `createActiveNameSelector(router)` returns the same instance for the same router.                                                        |
| 2   | `isActive(name)` mirrors the documented non-strict semantics                    | After any sequence of navigations, `isActive(name)` equals `current.name === name \|\| current.name.startsWith(name + ".")` (oracle).    |
| 3   | Listener fires only on per-name flips                                           | The number of listener calls equals the number of times the active state for the watched name actually changed across navigations.        |
| 4   | Multiple listeners on the same name see identical notification counts           | Two independent listeners on the same `(router, name)` are called the same number of times.                                              |
| 5   | Listeners for disjoint names don't fire on each other's flips                   | When `nameA` and `nameB` occupy different top-level subtrees, navigations changing one's active state don't notify the other's listeners. |
| 6   | Unsubscribe → re-subscribe restores active state from current router state      | After full unsubscribe, navigation, and re-subscribe, `isActive(name)` reflects the live router state (not the pre-disconnect cache).    |
| 7   | `destroy()` on the cached selector is a no-op — selector remains usable          | After `destroy()`, `subscribe(name, listener)` still returns a function and `isActive(name)` still returns a boolean.                     |
| 8   | `.`-boundary prefix-match: no false-positive on shared string prefix             | Names that share a string prefix without a trailing dot do not activate each other. E.g. `subscribe("users", ...)` stays `false` after `navigate("usersAdmin")` and flips `true` only after a descendant like `navigate("users.list")`. |
| 9   | Subscription sharing: K listeners on K distinct names produce exactly ONE `router.subscribe` call | The selector keeps a single shared router subscription regardless of how many distinct names consumers subscribe to — the headline value-prop over per-name `createActiveRouteSource`. |
| 10  | Last-unsubscribe releases the router subscription exactly once                  | After every selector consumer detaches, the shared `router.subscribe` handle is unsubscribed exactly once. |
| 11  | `isActive(name)` works before any `subscribe(...)` — fallback path is correct   | The pre-subscribe path consults `router.getState()` directly when the `activeByName` cache is empty, returning the same boolean as the post-subscribe path.    |
| 12  | Listener exception isolation (#767)                                             | A throwing listener never suppresses notifications to same-name siblings — each listener runs in its own try/catch; the thrown error is re-thrown asynchronously via `queueMicrotask`. Removing the try/catch fails this property (closes the §4.3 property gap — the isolation was previously killed only by a unit test). |
| 13  | Stale-generation unsubscribe does not orphan a live subscriber (#1206)          | Duplicate `(name, callback)` subscriptions produce N unsubscribe closures over one deduped Set. After that generation is fully torn down and a later `subscribe` re-creates the name, a stale closure's teardown must NOT delete the live generation's map entry — the closure bails when `listenersByName.get(name) !== its captured Set`. |

---

## stabilizeState — Transitivity, Defensive Read, Hash × Reload

| #   | Invariant                                                                       | Description                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Transitivity for path-equal triples                                             | For three path-equal, non-reload states `a, b, c`: `stab(stab(a, b), c) === stab(a, stab(b, c)) === a`. Chained stabilizations in `createRouteSource` therefore collapse a sequence of N idempotent navigations to a single snapshot reference. |
| 2   | Hash flip beats `reload=false` (branch order)                                   | When `prev.path === next.path` but the hashes differ, the stabilizer returns `next` regardless of `next.transition.reload === false`. The hash check happens before the reload check in `src/stabilizeState.ts:46-58`. |
| 3   | `reload=true` beats hash-equal                                                  | When the hashes match but `next.transition.reload === true`, the stabilizer returns `next` — the reload bypass overrides the dedup. |
| 4   | hash `undefined` ↔ `""` is observable (cross-plugin semantics)                  | Different plugins write hash differently: hash-plugin omits `state.context.url` entirely (read as `undefined`); browser-plugin writes `{ hash: "" }`. The stabilizer treats these as distinct, returning `next` on the mismatch — documented as expected cross-plugin behaviour. |
| 5   | Defensive read on malformed state                                               | A state lacking the mandatory `transition` field does not crash `readReloadFlag`. The defensive cast returns `false` (not-a-reload), so dedup proceeds normally. |

---

## BaseSource — Notification Pipeline (direct instrumentation)

| #   | Invariant                                                                       | Description                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Listener added BEFORE `onFirstSubscribe` runs                                   | A synchronous `updateSnapshot()` called from inside `onFirstSubscribe` reaches the listener registered by the very same `subscribe(...)` call. Verified by direct instrumentation (no router setup). |
| 2   | `onFirstSubscribe` fires exactly once per full disconnect → reconnect cycle     | Across N cycles of `subscribe → unsub`, `onFirstSubscribe` is called exactly N times. |
| 3   | Listener exception isolation                                                    | If a listener throws inside `notify()`, the remaining listeners still observe the update. The thrown error is re-thrown asynchronously via `queueMicrotask(() => { throw e; })`, so global error handlers / test harnesses still surface it. |

---

## createRouteEnterGate — Route-Enter Guard Gate (#1435)

| #   | Invariant                                                                       | Description                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Same reference dispatches at most once                                           | For a valid route/previousRoute, N consecutive gate calls with the SAME `route` reference dispatch exactly once — the `lastHandledRoute` dedupe arm (guards React StrictMode's dev double-invoke). Generative (`routeEnterGate.properties.ts`). |
| 2   | A dispatch implies the guards passed                                            | A non-null result implies `route.transition.from` is truthy (skip-initial cleared) AND `previousRoute` is present (the non-nullable-contract guard, #1218); under `skipSameRoute`, additionally `transition.from !== route.name`. |
| 3   | Per-instance dedupe state                                                       | Each `createRouteEnterGate()` owns an independent `lastHandledRoute`; sibling gates never share dedupe state. |

---

## guardLeaveListener — Route-Exit Guard HOF (#1435)

| #   | Invariant                                                                       | Description                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Same-name skip (default)                                                        | `route.name === nextRoute.name` with the default `skipSameRoute` skips the handler; `skipSameRoute: false` fires it. Uses **live** `.name`s (pre-commit). |
| 2   | Reentrant-abort pre-check                                                       | An already-aborted `signal` skips the handler (an `abort` listener would not fire retroactively). Ordered after the same-name skip, before dispatch. |
| 3   | Passthrough blocks the transition                                               | On a genuine departure the listener returns the handler's value verbatim, so a returned Promise reaches core's `settleLeavePromises` and blocks activation; a skipped guard returns `undefined`. (Verified by the unit truth-table.) |

---

## Test Files

| File                                                       | Invariants | Category                                                                                                     |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `tests/property/routeSource.properties.ts`                 | 22         | `createRouteSource` snapshot tracking, lazy-connection, subscribe-order (BaseSource pre-onFirstSubscribe), reconnect reconcile (#765), destroy |
| `tests/property/routeEnterGate.properties.ts`              | 2          | `createRouteEnterGate` same-reference at-most-once dispatch (StrictMode idempotence), dispatch-implies-guards-passed (#1218) |
| `tests/property/routeNodeSource.properties.ts`             | 23         | `createRouteNodeSource` node scoping, lazy-connection + reconnection, cache identity (per-router × nodeName), destroy |
| `tests/property/activeRouteSource.properties.ts`           | 19         | `createActiveRouteSource` boolean tracking (hash-aware via `arbActiveOptions`), filter, cache identity (canonicalJson + hash isolation), lazy-connection + reconnection (#766), destroy |
| `tests/property/transitionSource.properties.ts`            | 20         | `createTransitionSource` state machine, isLeaveApproved monotonicity, concurrent navigation (async-guard cancellation), destroy |
| `tests/property/errorSource.properties.ts`                 | 9          | `createErrorSource` error tracking, version monotonicity (incl. long-run + SUCCESS-doesn't-advance), CANCEL no-op, destroy |
| `tests/property/stabilizeState.properties.ts`              | 20         | `stabilizeState` reflexivity, path/hash/reload-aware path-equivalence, idempotency, nullish-handling, transitivity, hash×reload interaction, defensive read |
| `tests/property/computeSnapshot.properties.ts`             | 15         | `computeSnapshot` reference stability, idempotency, root dominance, subtree containment, unrelated-route, containment monotonicity, `.`-boundary prefix-match |
| `tests/property/canonicalJson.properties.ts`               | 14         | `canonicalJson` key-order invariance, determinism, idempotency, structural collisions, deep-recursion, throw-contract (Map/Set/Weak\*/RegExp/BigInt), DAG vs cycle, `__proto__` preservation, locale-independence (1000 runs/test) |
| `tests/property/normalizeActiveOptions.properties.ts`      | 7          | `normalizeActiveOptions` idempotency, default-fill, defaults immutability, explicit pass-through, input non-mutation, output totality (1000 runs/test) |
| `tests/property/createDismissableError.properties.ts`      | 7          | `createDismissableError` version monotonicity, reset semantics, idempotency, listener fidelity, cache identity, `resetError` no-op-guard, catch-up on first subscribe (#765.2) |
| `tests/property/createActiveNameSelector.properties.ts`    | 15         | `createActiveNameSelector` cache identity, oracle alignment, per-name listener isolation, reconnection, destroy, `.`-boundary prefix-match, subscription sharing (one router.subscribe for N names), last-unsubscribe disconnect, pre-subscribe fallback path, listener-exception isolation (#767 §4.3), stale-generation no-orphan (#1206) |
| `tests/property/baseSource.properties.ts`                  | 3          | `BaseSource` subscribe-order (listener added BEFORE `onFirstSubscribe`), `onFirstSubscribe` once-per-cycle, listener exception isolation in `notify()` (1000 runs/test) |
