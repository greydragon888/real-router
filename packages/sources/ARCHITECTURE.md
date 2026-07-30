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
├── createRouteEnterGate.ts      — Route-enter guard gate: stateful decision closure (#1435, not a source)
├── guardLeaveListener.ts        — Route-exit guard HOF: subscribeLeave-listener wrapper (#1435, not a source)
├── canonicalJson.ts             — Key-order-stable JSON serialization (cache keys for active-route)
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

**Composite key for `createActiveRouteSource`:** `` `${routeName}|${canonicalJson(params)}|${canonicalJson(search)}|${strict}|${ignoreQueryParams}|${hashKey}` `` — 6-component since RFC-4 M2 (#1548) added the `search` channel (was 5-component since #532), where `hashKey` is `hash === undefined ? "" : `#${hash}``, isolating hash-aware tab-link variants (`createActiveRouteSource.ts:50,66`). Key-order-insensitive via `canonicalJson` — `{a:1, b:2}` and `{b:2, a:1}` hit the same entry (checked per field: `params` and `search` each normalize independently).

**Non-serializable fallback:** if `canonicalJson(params)` throws, `createActiveRouteSource` bypasses the cache and returns a fresh non-cached source for that specific call. Throw-triggers include `BigInt` (native `JSON.stringify`), `Map`, `Set`, `WeakMap`, `WeakSet`, `RegExp` (eager `TypeError` — these would otherwise collapse to `"{}"` and cause cache-key collisions), and circular references (path-based detector in `canonicalize()`). `Symbol`-valued fields are silently dropped (standard JSON semantics) — they do not bypass the cache.

**`destroy()` on cached wrappers is a no-op** — the shared source lives until the router is garbage-collected, releasing the WeakMap entry automatically. Required so that adapter code like Angular `sourceToSignal` can call `destroy()` in `DestroyRef.onDestroy` without tearing down a shared instance.

## Two Subscription Patterns

### 1. Lazy-Connection (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`)

The `BaseSource` invokes `onFirstSubscribe` when the first listener attaches and `onLastUnsubscribe` when the last one detaches. Inside those callbacks, the wrapping factory subscribes to / unsubscribes from the router. No router subscription exists while there are zero listeners.

Because the subscription is driven by listener count, a mount/unmount/remount cycle doesn't leave a dangling subscription. Compatible with React's `useSyncExternalStore` and Strict Mode.

All three lazy sources (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`) reconcile their snapshot with the current router state on each reconnection (#765/#766) — this handles Activity hide/show cycles where the source was disconnected and missed navigation events. The eager `createDismissableError` wrapper likewise catches up on first subscribe (#765.2), so an error that fired before the wrapper's first subscriber is still surfaced.

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
  → pre-filter: areRoutesRelated (new/prev route) OR hashFlip (#532)
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

### `stabilizeState`

State reference stabilization keyed on `path` **+** `state.context.url.hash` (#532) **+** `state.transition.reload` (#605). When all three match, returns `prev`; otherwise returns `next`. Reload navigations always bypass dedup (`next.transition.reload === true` returns `next` even on path-equal navs). Hash differences also surface as a fresh render so tab-style UIs (`/settings#profile` → `/settings#billing`) re-render. O(1) comparisons. Used by `computeSnapshot`, `createRouteSource`, and `createTransitionSource`.

### `canonicalJson`

Explicit `canonicalize()` clone that sorts object keys via byte-order comparison (`<` / `>`, locale-independent) before `JSON.stringify`. Used by `createActiveRouteSource` to build a stable cache key from the `params` and `search` arguments (each normalized independently, RFC-4 M2 / #1548). Throws `TypeError` on `BigInt` (standard `JSON.stringify` behaviour), `Map` / `Set` / `WeakMap` / `WeakSet` / `RegExp` (would otherwise collapse to `"{}"` and collide on cache keys), and circular references (path-based detector via `Set<object>` with `try/finally` cleanup — DAGs with shared refs serialise normally). `__proto__` is preserved as an own property (null-prototype sorted record). The caller falls back to a non-cached source on any throw.

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

| Dependency                 | Type    | Purpose                                                                                                          |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `@real-router/route-utils` | runtime | `areRoutesRelated` for active-route filtering                                                                    |
| `@real-router/core`        | runtime | `events` constants, `getPluginApi` for `createTransitionSource` / `createErrorSource` event subscriptions, plus type re-exports (`Router`, `State`, `Params`, `SubscribeState` — there is no standalone `@real-router/types` package) |

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
- [.claude/memory-baseline-2026-04-18.md](../../.claude/memory-baseline-2026-04-18.md) — Cross-adapter heap measurements
