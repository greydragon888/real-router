# @real-router/sources

> Framework-agnostic subscription layer for Real-Router state

## File Structure

```
src/
├── createRouteSource.ts       — Full route state source with lazy-connection pattern
├── createRouteNodeSource.ts   — Node-scoped source with lazy-connection pattern + shouldUpdateNode filter
├── createActiveRouteSource.ts — Boolean active-route source using areRoutesRelated filter
├── createTransitionSource.ts  — Transition lifecycle source (isTransitioning, toRoute, fromRoute)
├── BaseSource.ts              — Internal Set-based listener management (not exported)
├── computeSnapshot.ts        — Same-reference snapshot optimization for route nodes
├── shouldUpdateCache.ts      — WeakMap<Router, Map<string, fn>> two-level cache
├── types.ts                  — RouterSource, RouteSnapshot, RouteNodeSnapshot, RouterTransitionSnapshot, ActiveRouteSourceOptions
└── index.ts                  — Public exports (4 factories + types)
```

## Two Source Patterns

### 1. Lazy-Connection (`createRouteSource`, `createRouteNodeSource`)

Subscribes to the router on the first listener and unsubscribes when all listeners are removed. No router subscription exists when there are zero listeners.

Because the subscription is driven by listener count, a mount/unmount/remount cycle doesn't leave a dangling subscription. Compatible with React's `useSyncExternalStore` and Strict Mode.

`createRouteNodeSource` reconciles its snapshot with the current router state on each reconnection. This handles Activity hide/show cycles where the source was disconnected and missed navigation events.

No `destroy()` call is required. The source cleans itself up automatically when the last listener unsubscribes. `destroy()` is still available for explicit teardown.

### 2. Eager-Connection (`createActiveRouteSource`, `createTransitionSource`)

The factory subscribes to the router immediately via `router.subscribe()` and delegates listener management to `BaseSource`. The router subscription is active for the lifetime of the source, regardless of how many listeners are attached.

Call `source.destroy()` to remove the router subscription and release resources. Failing to call `destroy()` leaves the subscription active, preventing the router from dropping the callback reference.

---

## Filtering & Dedup Pipeline

Each source applies a different pipeline between the raw router event and the listener notification.

### `createRouteSource`

No filter. Every navigation triggers a listener notification. The snapshot is the raw `{ route, previousRoute }` state from the router.

### `createRouteNodeSource`

```
Router event
  → shouldUpdateNode filter (cached predicate)
  → computeSnapshot (same-ref optimization)
  → Object.is dedup guard
  → listener notification
```

`shouldUpdateNode` checks whether the named node is in the transition path. If the navigation doesn't touch the node, the pipeline short-circuits and listeners are not called.

`computeSnapshot` returns the existing snapshot by reference when neither `route` nor `previousRoute` has changed. This prevents unnecessary re-renders in frameworks that use reference equality.

The `Object.is` dedup guard is a final safety net: if the snapshot reference hasn't changed, listeners are not notified.

### `createActiveRouteSource`

```
Router event
  → areRoutesRelated pre-filter
  → isActiveRoute check
  → Object.is dedup guard
  → listener notification
```

`areRoutesRelated` is a cheap string comparison that skips the `isActiveRoute` call entirely when the navigated route is unrelated to the tracked route. This avoids the param-matching overhead for the common case.

The `Object.is` dedup guard prevents a notification when the active state hasn't changed (e.g., navigating between two unrelated routes while the tracked route stays active).

---

## Internal Modules

### `BaseSource`

Manages a `Set` of listener functions. Exposes `subscribe`, `getSnapshot`, `updateSnapshot`, and `destroy`.

`subscribe` adds the listener to the Set and returns an unsubscribe function that removes it. `destroy` sets a `destroyed` flag and clears the listener Set. After `destroy`, `subscribe` returns a no-op and `updateSnapshot` is a no-op. Used by `createActiveRouteSource` and `createTransitionSource`. Note: `BaseSource` does not manage the router subscription — the wrapping factory handles that separately.

### `computeSnapshot`

Accepts the current snapshot, the router, nodeName, and an optional incoming `{ route, previousRoute }` transition. Determines whether the node is active by checking if the current route name equals or starts with `nodeName`. If the node is not active, sets `route` to `undefined`. Returns the current snapshot by reference if both `route` and `previousRoute` are identical to the values already in the snapshot. Otherwise returns a new snapshot object.

This node-scoping logic combined with reference stability keeps the snapshot stable across navigations that don't affect the node, which is the common case for deeply nested route trees.

### `shouldUpdateCache`

A two-level cache: `WeakMap<Router, Map<string, fn>>`.

The outer `WeakMap` key is the router instance. Using a `WeakMap` means the cache entry is eligible for garbage collection when the router is disposed, with no manual cleanup required.

The inner `Map` key is the `nodeName` string. The value is the cached `shouldUpdateNode` predicate for that router+nodeName pair.

On first access for a given router+nodeName combination, the predicate is created and stored. Subsequent calls return the cached predicate directly.

---

## Dependencies

| Dependency                 | Type    | Purpose                                                        |
| -------------------------- | ------- | -------------------------------------------------------------- |
| `@real-router/route-utils` | runtime | `areRoutesRelated` for active route filtering                  |
| `@real-router/types`       | runtime | `Router`, `State`, `Params`, `SubscribeState` type definitions |
| `@real-router/core`        | dev     | `createRouter` for tests                                       |

---

## Performance Characteristics

| Operation                          | Notes                                             |
| ---------------------------------- | ------------------------------------------------- |
| `createRouteSource` creation       | O(1), no caching needed                           |
| `createRouteNodeSource` creation   | O(1), single Map lookup for cached `shouldUpdate` |
| `createActiveRouteSource` creation | O(1), no caching needed                           |
| Subscription notification          | O(k), k = number of listeners                     |
| `shouldUpdate` filter              | O(1), cached predicate                            |
| `computeSnapshot`                  | O(1), reference comparison                        |

---

## Code Conventions

- 100% test coverage required
- Tests cover only the public API (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`, `createTransitionSource`)
- `v8 ignore @preserve` used for defensive guards that are unreachable via the public API
- Benchmarks use the mitata engine, not vitest bench

---

## Stress Test Coverage

7 stress tests in `tests/stress/` validate behavior under extreme conditions:

| Category | Tests | What they verify |
|----------|-------|-----------------|
| Memory & leaks | source-creation-memory, eager-subscription-leak, should-update-cache-growth | No leaks from source creation/destruction cycles, cache bounded |
| Concurrent | reconnection-storm, destroy-during-notification | Rapid subscribe/unsubscribe churn, destroy safety during emit |
| Integrity | listener-set-integrity, notification-pipeline, cross-source-interaction | Listener set consistency, notification ordering, multi-source isolation |

## See Also

- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
