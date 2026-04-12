# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/ssr-data-plugin` loads per-route data during SSR by intercepting `router.start()`. After route resolution, the matching loader runs and its result is written to `state.context.data` via the claim-based API, accessible on the returned state object.

**Core role:** A stateless interceptor that bridges route resolution and data loading on the server. Contains no rendering, serialization, or framework logic.

**Integration points with the core:**

- `api.claimContextNamespace("data")` — claims exclusive ownership of `state.context.data`
- `addInterceptor("start", ...)` — wraps `start()` to load data after route resolution
- `claim.write(state, data)` — writes loader result to the state's context
- `claim.release()` — releases the namespace claim on teardown
- Plugin hook (`teardown`) — removes interceptor and releases claim

## Package Structure

```
ssr-data-plugin/
├── src/
│   ├── index.ts        — Public API (exports factory + types) + module augmentation
│   ├── factory.ts      — ssrDataPluginFactory (validation, interceptor, claim-based context)
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

| Dependency           | What it provides                                           | Used in      |
| -------------------- | ---------------------------------------------------------- | ------------ |
| `@real-router/core`  | `getPluginApi`, types (`PluginFactory`, `Plugin`)          | `factory.ts` |
| `@real-router/types` | `StateContext` (module augmentation target)                 | `index.ts`   |

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
                ├── claim = api.claimContextNamespace("data")
                ├── api.addInterceptor("start", ...)
                │       └── claim.write(state, data)
                └── return { teardown }
                        └── claim.release()
```

**Why a closure instead of a class?**

- No mutable state — `claim` is the only binding, used for `write()` and `release()`
- No cross-method coordination — the interceptor uses `claim.write()`, teardown uses `claim.release()`
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
        │           claim.write(state, data)    ← writes to state.context.data
        │     NO:  skip (no data for this route)
        │
        └── return state
```

The interceptor runs **after** route resolution. If guards block the navigation, `next()` rejects and the loader never runs.

### Accessing data

```
const state = await router.start(url);
state.context.data    ← loader result, or undefined if no loader matched
```

Data lives directly on the state object's context. No separate retrieval method needed.

## SSR Usage Flow

```
// Server: per-request
const router = cloneRouter(baseRouter, deps);
router.usePlugin(ssrDataPluginFactory(loaders));
                                                    ← factory validates loaders (once)
                                                    ← usePlugin claims "data" namespace + registers interceptor

const state = await router.start(url);
                                                    ← interceptor: next(url) → state resolved
                                                    ← loader runs → claim.write(state, data)

const data = state.context.data;
                                                    ← data lives on state.context, no separate lookup

const html = renderToString(<App />);
router.dispose();
                                                    ← teardown: removes interceptor + releases claim
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
        └── claim.release()
              └── releases "data" namespace, allowing other plugins to claim it
```

Both operations are synchronous and infallible. No try/catch needed (unlike `persistent-params-plugin` which calls `setRootPath` during teardown).

## Validation

`validateLoaders(loaders)` runs at factory call time (before `PluginFactory` is returned):

| Check          | Rule                          |
| -------------- | ----------------------------- |
| Top-level type | Must be non-null object       |
| Values         | Each value must be a function |

Throws `TypeError` with `[@real-router/ssr-data-plugin]` prefix on violation.

No runtime validation — loaders are trusted after factory-time check. Loader return values are written as-is to `state.context.data` via `claim.write()`.

## Design Decisions

### Claim-based API for state.context.data

- `api.claimContextNamespace("data")` ensures exclusive ownership — no other plugin can write to the same namespace
- `claim.write(state, data)` writes loader result directly to `state.context.data`
- Data lives on the state object itself — no external store, no lookup by reference
- `claim.release()` on teardown frees the namespace for other plugins
- Module augmentation on `@real-router/types` provides type safety for `state.context.data`

### Object.hasOwn for loader lookup

`Object.hasOwn(loaders, state.name)` prevents prototype chain leakage. If `loaders` inherits properties (e.g., `toString`), they won't be treated as route loaders.

### No caching layer

Caching is intentionally omitted:

- SSR routers are short-lived (per-request `cloneRouter` → `dispose`)
- Caching across requests requires application-level concerns (cache invalidation, TTL, per-user data)
- Loaders can implement their own caching internally

## Stress Test Coverage

One stress test validates the core SSR invariant: **per-request isolation under concurrency**.

500 parallel `cloneRouter` → `usePlugin` → `start(/users/{i})` → `state.context.data` → `dispose()` cycles run simultaneously via `Promise.all`. Each request receives a unique URL and must retrieve its own data — no cross-request leakage.

This tests:

| Concern                     | What could go wrong                                        |
| --------------------------- | ---------------------------------------------------------- |
| Claim isolation             | Shared claim between clones would mix data                 |
| Interceptor registration    | Clone reuses parent's interceptor chain instead of own     |
| Teardown under load         | `dispose()` of one clone corrupts another's state          |
| Loader dispatch correctness | Wrong `state.name` → wrong loader called under concurrency |

Property-based tests are not used — the invariants are simple boolean conditions fully covered by unit tests. The stress test covers the one dimension unit tests cannot: concurrent access patterns that mirror real SSR server load.

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [persistent-params-plugin/ARCHITECTURE.md](../persistent-params-plugin/ARCHITECTURE.md) — Example of a more complex interceptor plugin
- [examples/ssr-react](../../examples/ssr-react) — Full SSR example using this plugin
