# @real-router/sources

> Framework-agnostic subscription layer for Real-Router state

## File Structure

```
src/
├── BaseSource.ts                — Internal Set-based listener management + destroy safety
├── createRouteSource.ts         — Full route state source with lazy-connection pattern (non-cached)
├── createRouteNodeSource.ts     — Node-scoped source with lazy-connection + per-(router, nodeName) cache
├── createActiveRouteSource.ts   — Boolean active-route source with per-(router, name, params, search, opts) cache
├── createTransitionSource.ts    — Transition lifecycle + cached getTransitionSource wrapper
├── createErrorSource.ts         — Error lifecycle + cached getErrorSource wrapper
├── createDismissableError.ts    — Derived source: getErrorSource wrapped with dismissedVersion state
├── createActiveNameSelector.ts  — Shared O(1) active-name selector (Solid-style routeSelector port)
├── createRouteEnterGate.ts      — Route-enter guard gate: stateful decision closure (not a source)
├── guardLeaveListener.ts        — Route-exit guard HOF: subscribeLeave-listener wrapper (not a source)
├── canonicalJson.ts             — Cache keys for active-route: the bag's keys sorted, each value spelled as core compares it
├── normalizeActiveOptions.ts    — DEFAULT_ACTIVE_OPTIONS + normalizeActiveOptions helper
├── computeSnapshot.ts           — Same-reference snapshot optimization for route nodes
├── stabilizeState.ts            — State ref stabilization keyed on path + url.hash + transition.reload (not exported)
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

**Composite key for `createActiveRouteSource`:** `` `${routeName}|${canonicalJson(params)}|${canonicalJson(search)}|${strict}|${ignoreQueryParams}|${hashKey}` `` — six components, where `hashKey` is `hash === undefined ? "" : `#${hash}``, isolating hash-aware tab-link variants (`createActiveRouteSource.ts`). The bag's key order does not count — `{a:1, b:2}` and `{b:2, a:1}` hit the same entry (checked per field: `params` and `search` are keyed independently) — while a nested plain object's does, because core compares it by `JSON.stringify`.

**Non-cached paths:** `createActiveRouteSource` bypasses the cache and returns a fresh source for that call in two cases — a NON-STRING route name, because the cache key coerces it and a non-string would share a slot with a well-typed name; and `canonicalJson` throwing on either the params or the search bag: on `BigInt` (native `JSON.stringify`), on circular references (path-based detector in `canonicalize()`), and on every value it cannot key the way core compares it, which the `canonicalJson.ts` docblock lists.

**`destroy()` on cached wrappers is a no-op** — the shared source lives until the router is garbage-collected, releasing the WeakMap entry automatically. Required so that adapter code like Angular `sourceToSignal` can call `destroy()` in `DestroyRef.onDestroy` without tearing down a shared instance.

## Two Subscription Patterns

### 1. Lazy-Connection (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`)

The `BaseSource` invokes `onFirstSubscribe` when the first listener attaches and `onLastUnsubscribe` when the last one detaches. Inside those callbacks, the wrapping factory subscribes to / unsubscribes from the router. No router subscription exists while there are zero listeners.

Because the subscription is driven by listener count, a mount/unmount/remount cycle doesn't leave a dangling subscription. Compatible with React's `useSyncExternalStore` and Strict Mode.

These three sources and `createDismissableError` pass `reconcile` to `BaseSource`, which runs it on a read made while the source has no listener and, once `onFirstSubscribe` has connected the source, for its first listener. A source that missed navigations while disconnected — an Activity hide/show, a remount, a read outside a reactive context — therefore answers its first read with the router's current state, not with the snapshot it held at disconnect. `createDismissableError` works the same way over the eager error source: an error raised while it has no listener reaches the read and the first subscribe.

The route and node sources catch up through `catchUpSnapshot`: the route becomes the router's own state object and `previousRoute` becomes `undefined`. The route, node and active sources record the router state their snapshot was last computed against (`computedFor`), so a read repeated without a navigation returns the same snapshot.

### 2. Eager-Connection (`createTransitionSource` / `getTransitionSource`, `createErrorSource` / `getErrorSource`)

The factory subscribes to router events immediately via `getPluginApi(router).addEventListener(...)` and delegates listener management to `BaseSource`. Event subscriptions stay active for the lifetime of the source.

For the cached `get*` variants, the source lives until the router is GC'd. External `destroy()` calls are no-ops.

For the non-cached `create*` variants, call `source.destroy()` to remove the router subscriptions. Failing to do so leaks a callback until the router itself is disposed.

## BaseSource semantics

- `subscribe(listener)` — adds to `#listeners` **before** `onFirstSubscribe` and the catch-up, so a snapshot they change reaches the just-added listener. The catch-up (`reconcile`, when the source has one) runs after `onFirstSubscribe`, on a connected source, and notifies only when it changes the snapshot (`Object.is`). A first subscribe that throws, in the connect or in the catch-up, is undone as an unsubscribe and rethrown.
- `getSnapshot()` — with `reconcile`, no listener and not destroyed, stores and returns `reconcile(stored)`; otherwise returns the stored snapshot, so a connected source answers from what it was told.
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
  → pre-filter: areRoutesRelated (new/prev route) OR hashFlip
  → isActiveRoute check (+ state.context.url.hash equality when opts.hash is set)
  → Object.is dedup guard
  → listener notification
```

`areRoutesRelated` is a cheap string comparison that skips the `isActiveRoute` call entirely when the navigated route is unrelated to the tracked route. Hash-aware sources (`opts.hash` set) add a third pre-filter branch — `hashFlip` — that passes the filter on a same-path, different-hash transition (`state.context.url.hashChanged`), which the route comparison alone would miss.

## Internal Modules

### `BaseSource`

Manages a `Set` of listener functions. Exposes `subscribe`, `getSnapshot`, `updateSnapshot`, and `destroy`. See semantics above.

### `computeSnapshot`

Determines whether a node is active for a given route and builds the `{ route, previousRoute }` snapshot with `stabilizeState`-based reference preservation. Returns the input snapshot by reference if neither field changed — the common case for navigations that don't touch the node.

`nodeRoute(state, nodeName)` is the route a node source shows on a router state: `state` while the node is active (the root `""` always is), otherwise `undefined`. `catchUpSnapshot(current, route)` is the catch-up the route and node sources share: `current` when it already shows `route` with no `previousRoute`, otherwise `{ route, previousRoute: undefined }`.

### `stabilizeState`

State reference stabilization keyed on `path` **+** `state.context.url.hash` **+** `state.transition.reload`. When all three match, returns `prev`; otherwise returns `next`. Reload navigations always bypass dedup (`next.transition.reload === true` returns `next` even on path-equal navs). Hash differences also surface as a fresh render so tab-style UIs (`/settings#profile` → `/settings#billing`) re-render. O(1) comparisons. Used by `computeSnapshot`, `createRouteSource`, and `createTransitionSource`.

### `canonicalJson`

Explicit `canonicalize()` clone that sorts the bag's own keys via byte-order comparison (`<` / `>`, locale-independent) before `JSON.stringify`, and spells each value as core compares it; the `canonicalJson.ts` docblock states how each kind of value is spelled and which ones throw. Used by `createActiveRouteSource` to build a stable cache key from the `params` and `search` arguments (each keyed independently). Circular references throw through a path-based detector (`Set<object>` with `try/finally` cleanup — DAGs with shared refs serialise normally). `__proto__` is preserved as an own property (null-prototype record). The caller falls back to a non-cached source on any throw.

### `normalizeActiveOptions`

Returns a fully-defaulted options object from a partial input. `DEFAULT_ACTIVE_OPTIONS` is a frozen constant. Used internally by `createActiveRouteSource` and re-exported for adapter code that builds its own cache keys.

### `createDismissableError`

Composition over `getErrorSource`. Wraps the per-router error source with an additional `dismissedVersion: number` state. Snapshot fields: `error, toRoute, fromRoute, version, resetError`.

- `error` (and `toRoute`/`fromRoute`) are exposed as `null` when `underlying.version <= dismissedVersion`.
- `resetError()` captures current underlying `version` into `dismissedVersion`, then calls `updateSnapshot` to notify all subscribers. Passed inside the snapshot (not as a separate export) so that framework reactive bridges propagate it naturally.
- The wrapper is eager-lazy: the internal `BaseSource` subscribes to `getErrorSource` in `onFirstSubscribe` and disconnects in `onLastUnsubscribe`. No external `destroy()` needed.
- While it has no listener, a read reconciles with the error source: a new error, or the same error object with a new version, reaches it.

Consolidates the dismissal state pattern that was duplicated across all 6 adapter `RouterErrorBoundary` components.

### `createActiveNameSelector`

Shared selector providing O(1) active-name checks with ONE `router.subscribe` for any number of distinct `routeName` listeners. Internal state:

- `listenersByName: Map<string, Set<() => void>>` — multi-map of subscribers.
- `activeByName: Map<string, boolean>` — cached previous-active diff input.

On each router transition, iterates over subscribed names; for each uses `areRoutesRelated` pre-filter, then diffs `prevActive` vs recomputed `nextActive`, notifies only names whose status actually flipped. Lazy-connected: no router subscription until first listener; disconnects on last.

Framework-agnostic port of the `routeSelector` pattern from `@real-router/solid`'s `RouterProvider`. `createActiveSource` resolves a default-options link through it, and every adapter except Solid routes its active state through `createActiveSource`; Solid's `Link` uses the `createSelector` its `RouterProvider` builds.

## Dependencies

| Dependency                 | Type    | Purpose                                                                                                          |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `@real-router/route-utils` | runtime | `areRoutesRelated` for active-route filtering                                                                    |
| `@real-router/core`        | peer    | `events` constants, `getPluginApi` for `createTransitionSource` / `createErrorSource` event subscriptions, plus type re-exports (`Router`, `State`, `Params`, `SubscribeState` — there is no standalone `@real-router/types` package) |

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
