# @real-router/sources

> Framework-agnostic subscription layer for Real-Router state

## File Structure

```
src/
├── BaseSource.ts                — Internal Set-based listener management + destroy safety
├── createRouteSource.ts         — Full route state source with lazy-connection pattern (non-cached)
├── createRouteNodeSource.ts     — Node-scoped source with lazy-connection + per-(router, nodeName) cache
├── createActiveRouteSource.ts   — Boolean active-route source with per-(router, name, params, opts) cache
├── createTransitionSource.ts    — Transition lifecycle + cached getTransitionSource wrapper
├── createErrorSource.ts         — Error lifecycle + cached getErrorSource wrapper
├── createDismissableError.ts    — Derived source: getErrorSource wrapped with dismissedVersion state
├── createActiveNameSelector.ts  — Shared O(1) active-name selector (Solid-style routeSelector port)
├── canonicalJson.ts             — Key-order-stable JSON serialization (cache keys for active-route)
├── normalizeActiveOptions.ts    — DEFAULT_ACTIVE_OPTIONS + normalizeActiveOptions helper
├── computeSnapshot.ts           — Same-reference snapshot optimization for route nodes
├── stabilizeState.ts            — Path-based State ref stabilization (not exported)
├── types.ts                     — Public type definitions
└── index.ts                     — Public exports
```

## Per-Router Cache Strategy

Most factories return a cached instance keyed by router and, where applicable, by the other arguments. The pattern is uniform across the package.

| Factory | Cache key | Entry lifetime |
|---------|-----------|----------------|
| `createRouteSource` | none (non-cached) | owner-driven; `destroy()` tears down |
| `createRouteNodeSource` | `WeakMap<Router, Map<nodeName, src>>` | until router GC |
| `createActiveRouteSource` | `WeakMap<Router, Map<compositeKey, src>>` | until router GC |
| `getTransitionSource` | `WeakMap<Router, src>` | until router GC |
| `getErrorSource` | `WeakMap<Router, src>` | until router GC |
| `createDismissableError` | `WeakMap<Router, src>` | until router GC |
| `createActiveNameSelector` | `WeakMap<Router, selector>` | until router GC |
| `createTransitionSource` / `createErrorSource` | none (advanced-use) | owner-driven; `destroy()` tears down |

**Composite key for `createActiveRouteSource`:** `` `${routeName}|${canonicalJson(params)}|${strict}|${ignoreQueryParams}` ``. Key-order-insensitive via `canonicalJson` — `{a:1, b:2}` and `{b:2, a:1}` hit the same entry.

**`Symbol`/`BigInt` fallback:** if `canonicalJson(params)` throws (non-serializable), `createActiveRouteSource` bypasses the cache and returns a fresh non-cached source for that specific call.

**`destroy()` on cached wrappers is a no-op** — the shared source lives until the router is garbage-collected, releasing the WeakMap entry automatically. Required so that adapter code like Angular `sourceToSignal` can call `destroy()` in `DestroyRef.onDestroy` without tearing down a shared instance.

## Two Subscription Patterns

### 1. Lazy-Connection (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`)

The `BaseSource` invokes `onFirstSubscribe` when the first listener attaches and `onLastUnsubscribe` when the last one detaches. Inside those callbacks, the wrapping factory subscribes to / unsubscribes from the router. No router subscription exists while there are zero listeners.

Because the subscription is driven by listener count, a mount/unmount/remount cycle doesn't leave a dangling subscription. Compatible with React's `useSyncExternalStore` and Strict Mode.

`createRouteNodeSource` reconciles its snapshot with the current router state on each reconnection. This handles Activity hide/show cycles where the source was disconnected and missed navigation events.

### 2. Eager-Connection (`createTransitionSource` / `getTransitionSource`, `createErrorSource` / `getErrorSource`)

The factory subscribes to router events immediately via `getPluginApi(router).addEventListener(...)` and delegates listener management to `BaseSource`. Event subscriptions stay active for the lifetime of the source.

For the cached `get*` variants, the source lives until the router is GC'd. External `destroy()` calls are no-ops.

For the non-cached `create*` variants, call `source.destroy()` to remove the router subscriptions. Failing to do so leaks a callback until the router itself is disposed.

## BaseSource semantics

- `subscribe(listener)` — adds to `#listeners` **before** calling `onFirstSubscribe`. Critical: if the `onFirstSubscribe` reconciliation triggers `updateSnapshot`, the just-added listener receives the notification. Without this order, adapters like Preact `useSyncExternalStore` polyfill would miss the post-reconnection snapshot on re-mount.
- `destroy()` — idempotent. Sets `#destroyed = true`, calls `onDestroy`, clears listeners. For cached-wrapper sources, the wrapper overrides `destroy()` with a no-op so external calls do not tear down the shared instance.

## Filtering & Dedup Pipeline

### `createRouteSource`

```
Router event
  → stabilizeState per field (path-based ref stabilization)
  → reference dedup guard
  → listener notification
```

### `createRouteNodeSource`

```
Router event
  → router.shouldUpdateNode(nodeName) predicate
  → computeSnapshot (stabilizeState + same-ref optimization)
  → Object.is dedup guard
  → listener notification
```

`router.shouldUpdateNode(nodeName)` checks whether the navigation touches the named node. If not, the pipeline short-circuits and listeners are not called.

The predicate is created once per source instance — safe, because `createRouteNodeSource` is itself per-`(router, nodeName)` cached, so the predicate is created at most once per logical source.

### `createActiveRouteSource`

```
Router event
  → areRoutesRelated pre-filter
  → isActiveRoute check
  → Object.is dedup guard
  → listener notification
```

`areRoutesRelated` is a cheap string comparison that skips the `isActiveRoute` call entirely when the navigated route is unrelated to the tracked route.

## Internal Modules

### `BaseSource`

Manages a `Set` of listener functions. Exposes `subscribe`, `getSnapshot`, `updateSnapshot`, and `destroy`. See semantics above.

### `computeSnapshot`

Determines whether a node is active for a given route and builds the `{ route, previousRoute }` snapshot with `stabilizeState`-based reference preservation. Returns the input snapshot by reference if neither field changed — the common case for navigations that don't touch the node.

### `stabilizeState`

Path-based State reference stabilization. Compares `prev.path` with `next.path`. When paths match, returns `prev`; otherwise returns `next`. O(1) string comparison. Used by `computeSnapshot`, `createRouteSource`, and `createTransitionSource`.

### `canonicalJson`

`JSON.stringify` with a replacer that sorts object keys via `toSorted((a, b) => a.localeCompare(b))` before serialization. Used by `createActiveRouteSource` to build a stable cache key from the `params` argument. Throws on `BigInt` (standard `JSON.stringify` behaviour) — the caller falls back to a non-cached source.

### `normalizeActiveOptions`

Returns a fully-defaulted options object from a partial input. `DEFAULT_ACTIVE_OPTIONS` is a frozen constant. Used internally by `createActiveRouteSource` and re-exported for adapter code that builds its own cache keys.

### `createDismissableError`

Composition over `getErrorSource`. Wraps the per-router error source with an additional `dismissedVersion: number` state. Snapshot fields: `error, toRoute, fromRoute, version, resetError`.

- `error` (and `toRoute`/`fromRoute`) are exposed as `null` when `underlying.version <= dismissedVersion`.
- `resetError()` captures current underlying `version` into `dismissedVersion`, then calls `updateSnapshot` to notify all subscribers. Passed inside the snapshot (not as a separate export) so that framework reactive bridges propagate it naturally.
- The wrapper is eager-lazy: the internal `BaseSource` subscribes to `getErrorSource` in `onFirstSubscribe` and disconnects in `onLastUnsubscribe`. No external `destroy()` needed.

Consolidates the dismissal state pattern that was duplicated across all 6 adapter `RouterErrorBoundary` components.

### `createActiveNameSelector`

Shared selector providing O(1) active-name checks with ONE `router.subscribe` for any number of distinct `routeName` listeners. Internal state:

- `listenersByName: Map<string, Set<() => void>>` — multi-map of subscribers.
- `activeByName: Map<string, boolean>` — cached previous-active diff input.

On each router transition, iterates over subscribed names; for each uses `areRoutesRelated` pre-filter, then diffs `prevActive` vs recomputed `nextActive`, notifies only names whose status actually flipped. Lazy-connected: no router subscription until first listener; disconnects on last.

Framework-agnostic port of the `routeSelector` pattern from `@real-router/solid`'s `RouterProvider`. Currently internal to adapters that choose the fast-path; wider integration in Link components deferred to opt-in migration.

## Dependencies

| Dependency                 | Type    | Purpose                                                        |
| -------------------------- | ------- | -------------------------------------------------------------- |
| `@real-router/route-utils` | runtime | `areRoutesRelated` for active-route filtering                  |
| `@real-router/types`       | runtime | `Router`, `State`, `Params`, `SubscribeState` type definitions |
| `@real-router/core`        | dev     | `createRouter` for tests                                       |

## Performance Characteristics

| Operation                          | Notes                                             |
| ---------------------------------- | ------------------------------------------------- |
| `createRouteSource` creation       | O(1), no caching                                  |
| `createRouteNodeSource` creation   | O(1), WeakMap + Map lookup, cached per-nodeName   |
| `createActiveRouteSource` creation | O(k log k) for `canonicalJson(params)`; key cached |
| `getTransitionSource` / `getErrorSource` creation | O(1), WeakMap lookup                  |
| Subscription notification          | O(k), k = number of listeners                     |
| `router.shouldUpdateNode`          | O(1) per call; cached in core                     |
| `computeSnapshot`                  | O(1) reference comparison                         |

## Code Conventions

- 100% test coverage required
- Tests cover only the public API
- `v8 ignore @preserve` used for defensive guards that are unreachable via the public API
- Benchmarks use the mitata engine, not vitest bench

## Stress Test Coverage

Stress tests in `tests/stress/` validate behavior under extreme conditions:

| Category       | Tests                                                                       | What they verify                                                        |
| -------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Memory & leaks | source-creation-memory, eager-subscription-leak, should-update-cache-growth | No leaks from source creation/destruction cycles, bounded growth        |
| Concurrent     | reconnection-storm, destroy-during-notification                             | Rapid subscribe/unsubscribe churn, destroy safety during emit           |
| Integrity      | listener-set-integrity, notification-pipeline, cross-source-interaction     | Listener set consistency, notification ordering, multi-source isolation |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick exports reference
- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
- [.claude/memory-baseline-2026-04-18.md](../../.claude/memory-baseline-2026-04-18.md) — Cross-adapter heap measurements
