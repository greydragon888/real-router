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
│   ├── index.ts            — Public API + StateContext module augmentation (data, ssrDataMode, ssrDataDeferred, ssrDataDeferredKeys)
│   ├── factory.ts          — ssrDataPluginFactory: thin adapter over createSsrLoaderPlugin (validateLoaders inlined)
│   ├── invalidate.ts       — invalidate(router, "data"): typed wrapper over markStale
│   ├── getSsrDataMode.ts   — getSsrDataMode(state): runtime-guarded reader of state.context.ssrDataMode
│   ├── server.ts           — injectDeferredScripts + getDeferBootstrapScript: streaming wire-format helpers (subpath: /server)
│   ├── errors.ts           — Re-export of LoaderRedirect / LoaderNotFound / LoaderTimeout / withTimeout (subpath: /errors)
│   ├── types.ts            — DataLoaderFn, DataLoaderFnFactory, DataLoaderFactoryMap, DataRouteEntry, SsrLoaderContext, SsrMode
│   ├── constants.ts        — ERROR_PREFIX (LOGGER_CONTEXT — internal)
│   └── shared-ssr/         — symlink → shared/ssr/ (createSsrLoaderPlugin, createLoadersValidator, defer, deferRegistry, staleRegistry, errors)
```

## Module Dependency Graph

```
index.ts
    ├── factory.ts
    │       ├── constants.ts (ERROR_PREFIX)
    │       ├── shared-ssr/createLoadersValidator.ts (inlined validateLoaders binding)
    │       ├── shared-ssr/createSsrLoaderPlugin.ts
    │       │       ├── shared-ssr/staleRegistry.ts (isStale + clearStale)
    │       │       └── shared-ssr/defer.ts (isDeferred — slow-path branch in writeLoaderResult)
    │       └── types.ts
    ├── invalidate.ts → shared-ssr/staleRegistry.ts (markStale)
    ├── getSsrDataMode.ts → shared-ssr (ALL_SSR_MODES, SsrMode)
    └── (re-exports defer, isDeferred, DeferredPayload from shared-ssr)

server.ts → shared-ssr (formatSettleScript, getDeferBootstrapScript)
errors.ts → shared-ssr/errors.ts (LoaderRedirect, LoaderNotFound, LoaderTimeout, withTimeout)
```

External dependencies:

| Dependency                        | What it provides                                                                | Used in                                |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| `@real-router/core/api`           | `getPluginApi`                                                                  | `shared-ssr/createSsrLoaderPlugin.ts`  |
| `@real-router/core/validation`    | `getInternals` (read-only access to internals.hydrationState scratchpad)        | `shared-ssr/createSsrLoaderPlugin.ts`  |
| `@real-router/types`              | `StateContext` (module augmentation target), `Plugin`, `PluginFactory`, `State` | `index.ts`, all factories              |

## Shared SSR Scaffolding

The plugin's factory + validation logic lives in [`shared/ssr/`](../../shared/ssr/) and is consumed via a git-tracked symlink at `src/shared-ssr` (same pattern as `shared/browser-env/` for browser/hash/navigation-plugin and `shared/dom-utils/` for framework adapters).

The shared module exports:

- `createSsrLoaderPlugin<T, D>(loaders, { namespace, errorPrefix })` — generic factory implementing the validate-compile-loop + start-interceptor + subscribeLeave-handler + claim/teardown pattern. Parameterised over loader return type `T` and dependency map `D`.
- `createLoadersValidator(errorPrefix)` — generic shape validator (non-null object → function values).
- `markStale` / `isStale` / `clearStale` — per-router stale registry backing the `invalidate()` helper. WeakMap-keyed by router instance; `Set<string>` per router holds the stale namespaces.

`@real-router/rsc-server-plugin` consumes the same helpers with a different namespace (`"rsc"`) and `T = ReactNode`. Because the shared logic is symlinked source (not a published package), bug fixes in one plugin's behaviour automatically apply to the other. The stale registry is one shared `WeakMap` — but namespace isolation comes free from the Set value, so `invalidate(router, "data")` and `invalidate(router, "rsc")` operate independently.

## Factory Pattern

The plugin uses a plain closure (not a class) — no mutable state to encapsulate. The closure logic itself lives in [`shared/ssr/createSsrLoaderPlugin.ts`](../../shared/ssr/createSsrLoaderPlugin.ts); `ssrDataPluginFactory` is a thin adapter that runs validation and forwards to the shared factory:

```
ssrDataPluginFactory(loaders)                ← factory.ts (~20 LOC)
        │
        │  1. validateLoaders(loaders)        ← validation.ts → createLoadersValidator(ERROR_PREFIX)
        │  2. createSsrLoaderPlugin<unknown, Dependencies>(loaders, { namespace: "data", errorPrefix })
        │
        └── createSsrLoaderPlugin returns PluginFactory (closure)
                │
                │  Called by router.usePlugin():
                │
                ├── api = getPluginApi(router)
                ├── dataClaim = api.claimContextNamespace("data")
                ├── modeClaim = api.claimContextNamespace("ssrDataMode")
                ├── try: compile factories → compiledLoaders Map
                │       └── factory(router, getDependency) per entry
                │       └── typeof check on each returned loader
                │   catch: dataClaim.release() + modeClaim.release() + rethrow
                ├── removeStartInterceptor = api.addInterceptor("start", ...)
                │       └── scratchpad-hit OR await loader → dataClaim.write(state, data)
                ├── removeLeaveListener = router.subscribeLeave(...)
                │       └── peek isStale → await loader → clearStale + dataClaim.write
                └── return { teardown }
                        └── removeStartInterceptor() + removeLeaveListener()
                            + dataClaim.release() + modeClaim.release()
```

**Why a closure instead of a class?**

- Bindings are write-once at construction (`dataClaim`, `modeClaim`, `compiledLoaders`, listener removers) — no instance state mutates after `usePlugin()` returns.
- No cross-method coordination across instances — each binding is used by exactly one site (interceptor writes, teardown removes).
- Fewer files, fewer abstractions — proportional to the plugin's complexity.

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
        ├── loader = compiledLoaders.get(state.name)
        │     found: data = await loader(state.params)
        │            claim.write(state, data)    ← writes to state.context.data
        │     not found: skip (no data for this route)
        │
        └── return state
```

The interceptor runs **after** route resolution. If guards block the navigation, `next()` rejects and the loader never runs.

### subscribeLeave handler — CSR revalidation

A second listener registered alongside the start interceptor consumes the per-router stale flag set by `invalidate(router, "data")`. Runs in the awaited LEAVE_APPROVE phase, so fresh data lands on `nextRoute.context` *before* `TRANSITION_SUCCESS` fires.

```
router.navigate(...) (any CSR navigation)
        │
        ▼
  deactivation guards
        │
        ▼
  sendLeaveApprove → awaitLeaveListeners
        │
        ▼
  subscribeLeave handler
        │
        ├── isStale(router, "data")? no  → return (cheap WeakMap.get + Set.has)
        │
        ├── compiledLoaders.get(nextRoute.name)? none → return (flag preserved)
        │
        ├── modeClaim.write(nextRoute, mode)
        │
        ├── client-only / no-loader entry → return (flag preserved)
        │
        ├── data = await loader(nextRoute.params)
        │
        ├── signal.aborted? yes → return (flag preserved for the new nav)
        │
        ├── clearStale(router, "data")
        └── dataClaim.write(nextRoute, data)
        │
        ▼
  activation guards → completeTransition → TRANSITION_SUCCESS
```

**Peek-then-clear-after-write**: the flag is cleared only on a successful, non-cancelled loader write. This makes `invalidate()` survive every "non-refresh" outcome — no-entry hops, client-only mode, mode-only entries, cancellation by a newer navigation, and loader rejections all leave the flag for the next attempt.

The flag itself lives in `shared/ssr/staleRegistry.ts` — a module-level `WeakMap<Router, Set<string>>` so per-router isolation comes free from WeakMap key identity (`cloneRouter()` clones get their own flag set).

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
        ├── removeLeaveListener()
        │     └── array.splice on #leaveListeners — cannot throw
        │
        ├── dataClaim.release()
        │     └── releases "data" namespace
        │
        └── modeClaim.release()
              └── releases "ssrDataMode" namespace
```

All operations are synchronous and infallible. No try/catch needed (unlike `persistent-params-plugin` which calls `setRootPath` during teardown). The stale flag in the per-router `WeakMap` is **not** cleared on teardown — markStale entries are GC'd along with the router. A subsequent `usePlugin(ssrDataPluginFactory(...))` on the same router would inherit any pending flag (which is consistent with "the next refresh wins" semantics).

## Validation

`validateLoaders(loaders)` runs at factory call time (before `PluginFactory` is returned):

| Check          | Rule                          |
| -------------- | ----------------------------- |
| Top-level type | Must be non-null object       |
| Values         | Each value must be a function |

Throws `TypeError` with `[@real-router/ssr-data-plugin]` prefix on violation.

Factory-time validation checks the `loaders` object. Plugin-registration-time validation (in the compilation loop) checks that each factory returns a function. Loader return values are written as-is to `state.context.data` via `claim.write()`.

## Design Decisions

### Claim-based API for state.context.data

- `api.claimContextNamespace("data")` ensures exclusive ownership — no other plugin can write to the same namespace
- `claim.write(state, data)` writes loader result directly to `state.context.data`
- Data lives on the state object itself — no external store, no lookup by reference
- `claim.release()` on teardown frees the namespace for other plugins
- Module augmentation on `@real-router/types` provides type safety for `state.context.data`

### Prototype safety via Object.entries

Prototype safety is ensured at two levels: `Object.entries(loaders)` at compilation time only iterates own enumerable properties (inherited prototype keys are excluded), and `compiledLoaders.get(state.name)` at runtime looks up only compiled entries. If `loaders` inherits properties (e.g., `toString`), they won't be compiled as route loaders.

### No caching layer

Caching is intentionally omitted:

- SSR routers are short-lived (per-request `cloneRouter` → `dispose`)
- Caching across requests requires application-level concerns (cache invalidation, TTL, per-user data)
- Loaders can implement their own caching internally

### Error-safe compilation

The compilation loop is wrapped in `try/catch`. If any loader factory throws during `factory(router, getDependency)`, or if the returned value is not a function:

- `claim.release()` is called to free the `"data"` namespace
- The error is re-thrown to the `usePlugin()` caller
- No interceptor is registered (it runs after the loop)

This prevents permanently blocking the namespace when a factory has a bug.

### DI Access via getDependency

Loader factories follow the same DI pattern as `GuardFnFactory` and `LifecycleHookFactory`:

```typescript
const loaders: DataLoaderFactoryMap = {
  "users.profile": (router, getDependency) => async (params) => {
    const db = getDependency("db");
    return db.query("SELECT * FROM users WHERE id = ?", params.id);
  },
};
```

The factory receives `(router, getDependency)` once at `usePlugin()` time. The returned loader is cached in a `Map` and reused on every `start()` call. This mirrors the lazy compilation pattern used by `lifecycle-plugin` and `preload-plugin`, except ssr-data-plugin compiles eagerly (all factories at registration, not on first use).

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

Property-based tests (35 invariants in `tests/property/`) complement functional and stress tests — see INVARIANTS.md for the full list, including the security-critical `escapeForScript` family (`numRuns: 1000`), the `defer()` payload-constructor invariants, the stale-registry algebra (`markStale`/`isStale`/`clearStale` idempotency + per-router/per-namespace isolation), the `getSsrDataMode` read-side guard, and `invalidate()` cloneRouter isolation. The stress test covers the one dimension unit tests cannot: concurrent access patterns that mirror real SSR server load.

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [persistent-params-plugin/ARCHITECTURE.md](../persistent-params-plugin/ARCHITECTURE.md) — Example of a more complex interceptor plugin
- [examples/ssr-react](../../examples/ssr-react) — Full SSR example using this plugin
