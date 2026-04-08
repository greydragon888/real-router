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
| 1   | Initial snapshot is IDLE regardless of prior router state            | `getSnapshot()` returns `{ isTransitioning: false, toRoute: null, fromRoute: null }` at creation time, no matter what navigations occurred before. |
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

## createTransitionSource — Destroy

| #   | Invariant                                                         | Description                                                                                                                   |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | destroy removes all router event listeners                        | After `destroy()`, navigations do not invoke any listener and `isTransitioning` remains false.                                |
| 2   | destroy is idempotent                                             | Calling `destroy()` N times does not throw.                                                                                   |
| 3   | post-destroy getSnapshot returns the last snapshot before destroy | `getSnapshot()` returns the snapshot that was current at destroy time.                                                        |
| 4   | post-destroy navigation does not update snapshot or throw errors  | Navigating after `destroy()` does not change the snapshot and does not throw. The snapshot remains at its destroy-time value. |
| 5   | post-destroy subscribe returns no-op unsubscribe                  | After `destroy()`, `subscribe()` returns a no-op. The listener is never called and the returned unsubscribe does not throw.   |

## stabilizeState — State Stabilization

| #   | Invariant                                            | Description                                                                       |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `stabilizeState(a, a) === a`                         | Same reference is returned immediately.                                           |
| 2   | `prev.path === next.path → result === prev`          | When paths match (same canonical URL), the previous State reference is preserved. |
| 3   | `prev.path !== next.path → result === next`          | When paths differ, the new State is returned.                                     |
| 4   | `stabilizeState(undefined, undefined) === undefined` | Both nullish values return prev.                                                  |
| 5   | `stabilizeState(undefined, state) === state`         | Transition from nullish to State returns next.                                    |
| 6   | `stabilizeState(state, undefined) === undefined`     | Transition from State to nullish returns next.                                    |

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

---

## Test Files

| File                                             | Invariants | Category                                                                                                     |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `tests/property/routeSource.properties.ts`       | 18         | `createRouteSource` snapshot tracking, lazy-connection lifecycle, and destroy behavior                       |
| `tests/property/routeNodeSource.properties.ts`   | 19         | `createRouteNodeSource` node scoping, lazy-connection with reconnection reconciliation, and destroy behavior |
| `tests/property/activeRouteSource.properties.ts` | 14         | `createActiveRouteSource` boolean tracking, areRoutesRelated filter optimization, and destroy behavior       |
| `tests/property/transitionSource.properties.ts`  | 16         | `createTransitionSource` state machine transitions, concurrent navigation, and destroy behavior              |
| `tests/property/errorSource.properties.ts`       | 6          | `createErrorSource` error tracking, version monotonicity, and destroy behavior                               |
