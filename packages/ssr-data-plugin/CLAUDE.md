# @real-router/ssr-data-plugin

> SSR per-route data loading via `start()` interceptor

## How It Works

1. `ssrDataPluginFactory(loaders)` validates loaders at factory call time, returns `PluginFactory`
2. On `router.usePlugin()`: claims `"data"` namespace via `api.claimContextNamespace("data")` and registers a `start` interceptor
3. On `router.start(url)`: interceptor wraps `next(path)`, awaits the state, calls matching loader, writes result to `state.context.data` via `claim.write()`
4. Data is accessible via `state.context.data` after `await router.start(url)`

## SSR-Only by Design

Intercepts only `start()`, not `navigate()`. Rationale:

- SSR needs data **before** `renderToString()` — `start()` interceptor provides this
- CSR `navigate()` changes state immediately, then the interceptor runs — data arrives after render, useless without a subscription mechanism
- CSR data fetching belongs in application layer (React Query, Suspense, `useEffect`)
- Keeping `navigate()` off the hot path avoids performance overhead

## Configuration

```typescript
ssrDataPluginFactory({
  "home": (params) => fetchHomeData(),
  "users.profile": (params) => fetchUser(params.id),
})
```

Loaders keyed by route name. Each receives `Params`, returns `Promise<unknown>`. Uses `Object.hasOwn` for lookup — no prototype chain leakage.

Validation at factory time: rejects `null`, non-objects, non-function values with `TypeError`.

## Module Structure

```
src/
├── factory.ts     — ssrDataPluginFactory: validates loaders, intercepts start(), claims "data" namespace
├── validation.ts  — validateLoaders: factory-time validation (non-null object, function values)
├── types.ts       — DataLoaderFn, DataLoaderMap
├── constants.ts   — LOGGER_CONTEXT, ERROR_PREFIX
└── index.ts       — Public exports + module augmentation (@real-router/types for StateContext)
```

## Gotchas

### Timing: data written after subscribers

`claim.write()` happens in the `start` interceptor **after** `await next(path)`. By that time, `onTransitionSuccess` hooks and `subscribe()` callbacks have already fired. This means:

- **Works:** `const state = await router.start(url); state.context.data` — caller sees data
- **Works:** SSR render — server does `await start()`, then reads `state.context.data`
- **Does NOT work:** `router.subscribe(state => state.context.data)` — data is `undefined` in subscribe callback

This is by design for SSR. Identical to the previous `getRouteData()` timing.

### No caching

Every `start()` triggers a fresh loader call. Caching is the caller's responsibility (e.g., within the loader function itself).

### Teardown releases claim

`unsubscribe()` removes the `start` interceptor and releases the `"data"` namespace claim. In SSR, `router.dispose()` triggers teardown automatically.

### Loader errors propagate

If a loader throws, the error propagates through the `start()` promise. The caller's `try/catch` handles it — same as any async guard failure.
