# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/ssr-data-plugin` loads per-route data during SSR by intercepting `router.start()`. After route resolution, the matching loader runs and its result is stored in a `WeakMap<State, unknown>`, accessible via `router.getRouteData()`.

**Core role:** A stateless interceptor that bridges route resolution and data loading on the server. Contains no rendering, serialization, or framework logic.

**Integration points with the core:**

- `addInterceptor("start", ...)` — wraps `start()` to load data after route resolution
- `api.extendRouter({ getRouteData })` — exposes data retrieval on the router instance
- Plugin hook (`teardown`) — removes interceptor and extension

## Package Structure

```
ssr-data-plugin/
├── src/
│   ├── index.ts        — Public API (exports factory + types) + module augmentation
│   ├── factory.ts      — ssrDataPluginFactory (validation, interceptor, extension)
│   ├── validation.ts   — validateLoaders (factory-time validation)
│   ├── types.ts        — DataLoaderFn, DataLoaderMap
│   └── constants.ts    — ERROR_PREFIX, LOGGER_CONTEXT
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── validation.ts
            │       └── constants.ts
            └── types.ts
```

External dependencies:

| Dependency          | What it provides                                           | Used in      |
| ------------------- | ---------------------------------------------------------- | ------------ |
| `@real-router/core` | `getPluginApi`, types (`State`, `PluginFactory`, `Plugin`) | `factory.ts` |

## Factory Pattern

Unlike `persistent-params-plugin` (which uses a class for mutable state), this plugin uses a plain closure — there is no mutable state to encapsulate.

```
ssrDataPluginFactory(loaders)                ← factory.ts
        │
        │  Runs once on call:
        │  - validateLoaders(loaders)
        │
        └── returns PluginFactory (closure)
                │
                │  Called by router.usePlugin():
                │
                ├── api = getPluginApi(router)
                ├── dataStore = new WeakMap<State, unknown>()
                ├── api.addInterceptor("start", ...)
                ├── api.extendRouter({ getRouteData })
                └── return { teardown }
```

**Why a closure instead of a class?**

- No mutable state — `dataStore` is a `WeakMap` that only grows via `set()`, never needs reassignment
- No cross-method coordination — the interceptor and `getRouteData` share only the `WeakMap` reference
- Fewer files, fewer abstractions — proportional to the plugin's complexity

## Data Flow

### start() interceptor

```
router.start(url)
        │
        ▼
  start interceptor
        │
        ├── state = await next(path)
        │     └── core resolves route: guards → state change → State object
        │
        ├── Object.hasOwn(loaders, state.name)?
        │     YES: data = await loaders[state.name](state.params)
        │           dataStore.set(state, data)
        │     NO:  skip (no data for this route)
        │
        └── return state
```

The interceptor runs **after** route resolution. If guards block the navigation, `next()` rejects and the loader never runs.

### getRouteData()

```
router.getRouteData(state?)
        │
        ├── s = state ?? router.getState()
        │
        ├── s is null? → return null (router not started)
        │
        └── dataStore.get(s) ?? null
```

Returns `null` for both "no state" and "no data for this state" cases.

## SSR Usage Flow

```
// Server: per-request
const router = cloneRouter(baseRouter, deps);
router.usePlugin(ssrDataPluginFactory(loaders));
                                                    ← factory validates loaders (once)
                                                    ← usePlugin registers interceptor + extension

const state = await router.start(url);
                                                    ← interceptor: next(url) → state resolved
                                                    ← loader runs → dataStore.set(state, data)

const data = router.getRouteData();
                                                    ← dataStore.get(router.getState()) → data

const html = renderToString(<App />);
router.dispose();
                                                    ← teardown: removes interceptor + extension
                                                    ← WeakMap entries eligible for GC
```

## Teardown Lifecycle

```
unsubscribe() or router.dispose()
        │
        ▼
  Plugin.teardown()
        │
        ├── removeStartInterceptor()
        │     └── array.splice — cannot throw
        │
        └── removeExtensions()
              └── deletes getRouteData from router instance
```

Both operations are synchronous and infallible. No try/catch needed (unlike `persistent-params-plugin` which calls `setRootPath` during teardown).

## Validation

`validateLoaders(loaders)` runs at factory call time (before `PluginFactory` is returned):

| Check          | Rule                          |
| -------------- | ----------------------------- |
| Top-level type | Must be non-null object       |
| Values         | Each value must be a function |

Throws `TypeError` with `[@real-router/ssr-data-plugin]` prefix on violation.

No runtime validation — loaders are trusted after factory-time check. Loader return values are stored as-is in the `WeakMap`.

## Design Decisions

### WeakMap<State, unknown> for storage

- States are frozen objects — valid WeakMap keys
- Automatic GC: when a State is no longer referenced (after `dispose()` or next navigation), its data is collected
- No manual cleanup, no memory leaks, no stale data
- O(1) lookup by state reference

### Object.hasOwn for loader lookup

`Object.hasOwn(loaders, state.name)` prevents prototype chain leakage. If `loaders` inherits properties (e.g., `toString`), they won't be treated as route loaders.

### No caching layer

Caching is intentionally omitted:

- SSR routers are short-lived (per-request `cloneRouter` → `dispose`)
- Caching across requests requires application-level concerns (cache invalidation, TTL, per-user data)
- Loaders can implement their own caching internally

## Stress Test Coverage

One stress test validates the core SSR invariant: **per-request isolation under concurrency**.

500 parallel `cloneRouter` → `usePlugin` → `start(/users/{i})` → `getRouteData()` → `dispose()` cycles run simultaneously via `Promise.all`. Each request receives a unique URL and must retrieve its own data — no cross-request leakage.

This tests:

| Concern                     | What could go wrong                                        |
| --------------------------- | ---------------------------------------------------------- |
| WeakMap isolation           | Shared WeakMap between clones would mix data               |
| Interceptor registration    | Clone reuses parent's interceptor chain instead of own     |
| Teardown under load         | `dispose()` of one clone corrupts another's state          |
| Loader dispatch correctness | Wrong `state.name` → wrong loader called under concurrency |

Property-based tests are not used — the invariants are simple boolean conditions fully covered by unit tests. The stress test covers the one dimension unit tests cannot: concurrent access patterns that mirror real SSR server load.

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [persistent-params-plugin/ARCHITECTURE.md](../persistent-params-plugin/ARCHITECTURE.md) — Example of a more complex interceptor plugin
- [examples/ssr-react](../../examples/ssr-react) — Full SSR example using this plugin
