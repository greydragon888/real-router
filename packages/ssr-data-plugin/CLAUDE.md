# @real-router/ssr-data-plugin

> SSR per-route data loading via `start()` interceptor

## Exports

| Export                   | Kind     | Description                                                        |
| ------------------------ | -------- | ------------------------------------------------------------------ |
| `ssrDataPluginFactory`   | function | Plugin factory — pass loaders map, returns `PluginFactory`         |
| `getSsrDataMode`         | function | Read `state.context.ssrDataMode` with `"full"` fallback            |
| `DataLoaderFn`           | type     | Compiled loader signature: `(params) => Promise<unknown> \| unknown` |
| `DataLoaderFnFactory`    | type     | Factory signature: `(router, getDependency) => DataLoaderFn`       |
| `DataRouteEntry`         | type     | Per-route entry: factory (short form) or `{ ssr?, loader? }` object |
| `DataLoaderFactoryMap`   | type     | Record of route entries — pass to `ssrDataPluginFactory()`         |
| `SsrMode`                | type     | `"full" \| "data-only" \| "client-only"` — published per-route      |

### Subpath: `@real-router/ssr-data-plugin/errors`

| Export           | Kind     | Description                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `LoaderRedirect` | class    | Throw from a loader to map to HTTP 30x. Fields: `target: string`, `status: 301\|302\|307\|308` |
| `LoaderNotFound` | class    | Throw from a loader to map to HTTP 404. Field: `resource: string`                     |
| `LoaderTimeout`  | class    | Thrown by `withTimeout()` when the deadline elapses. Fields: `route: string`, `ms: number` |
| `withTimeout`    | function | `(routeName, ms, loader, options?) => Promise<T>` — race against a deadline; passes `{ signal }` to the loader for cooperative cancellation; optional `options.upstreamSignal` composes via `AbortSignal.any` (Node 20.3+) |

Discriminator is structural (`error.code === "LOADER_NOT_FOUND" | "LOADER_REDIRECT" | "LOADER_TIMEOUT"`), so consumers don't need to import the classes to inspect — `instanceof` is optional. The errors are reusable across both `@real-router/ssr-data-plugin` and `@real-router/rsc-server-plugin` (same shared source under `shared/ssr/errors.ts`).

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
  // Short form (backwards-compatible): factory directly. Mode defaults to "full".
  "home": () => () => fetchHomeData(),

  // Object form: { ssr?, loader? }.
  "admin.dashboard": { ssr: false },                       // false → "client-only", no loader
  "users.profile": {
    ssr: "data-only",
    loader: (router, getDep) => async (params) => fetchUser(params.id),
  },
  "docs.detail": {
    // Function-form resolver, called once per start() before the loader.
    ssr: (state) => state.params.format === "pdf" ? "client-only" : "full",
    loader: (router, getDep) => async (params) => fetchDoc(params.id),
  },
});
```

Loaders/entries keyed by route name. Factory runs once at `usePlugin()` time; the returned loader is cached. Uses `Object.entries()` at compilation time and `Map.get()` at runtime — no prototype chain leakage.

Validation at factory time: rejects `null`, non-objects, non-function values, unknown keys, invalid `ssr` types and string-form modes outside `allowedModes` with `TypeError`. Function-form `ssr` is validated at runtime per-navigation.

## Per-route SSR Mode

Three modes are supported:

| `ssr` config                 | mode marker       | server/client loader behaviour |
| ---------------------------- | ----------------- | ------------------------------ |
| omitted / `true` / `"full"`  | `"full"`          | runs (composes with #596)       |
| `"data-only"`                | `"data-only"`     | runs (composes with #596)       |
| `false` / `"client-only"`    | `"client-only"`   | **skipped** unconditionally     |
| `(state) => SsrMode`         | resolver result   | resolved per-navigation         |

The mode is published to `state.context.ssrDataMode` (typed via module augmentation). Read it via `getSsrDataMode(state)`:

```typescript
import { getSsrDataMode } from "@real-router/ssr-data-plugin";

const mode = getSsrDataMode(state);
if (mode === "full") {
  // render HTML server-side
} else if (mode === "data-only") {
  // ship JSON only, render shell HTML
} else {
  // mode === "client-only": no loader was called, app fetches client-side
}
```

**`"client-only"` skips the loader unconditionally** — both on the server and on the client. The application is responsible for client-side fetching (React Query, `useEffect`, Suspense, etc.) when it detects the mode marker. This is the simplest semantic: no environment detection in the plugin, fully symmetric.

The function-form resolver receives `state` **before** the mode is written to context, so resolvers should not read `state.context.ssrDataMode` (it will be `undefined`). Branch on `state.params`, `state.path`, or `state.name` instead.

## Module Structure

```
src/
├── factory.ts     — ssrDataPluginFactory: thin adapter that validates + delegates to createSsrLoaderPlugin
├── validation.ts  — validateLoaders = createLoadersValidator(ERROR_PREFIX) — generic shared validator
├── types.ts       — DataLoaderFn, DataLoaderFnFactory, DataLoaderFactoryMap (public-facing types)
├── errors.ts      — Re-export from shared-ssr/errors (LoaderRedirect, LoaderNotFound, LoaderTimeout, withTimeout)
├── constants.ts   — ERROR_PREFIX (LOGGER_CONTEXT — internal)
├── index.ts       — Public exports + module augmentation (@real-router/types for StateContext)
└── shared-ssr/    — symlink → shared/ssr/ (createSsrLoaderPlugin, createLoadersValidator, errors)
```

The `factory.ts` and `validation.ts` are intentionally tiny adapters — the actual try/catch + interceptor + claim logic lives in [`shared/ssr/`](../../../shared/ssr/) and is consumed by both `ssr-data-plugin` (T = `unknown`, namespace = `"data"`) and `rsc-server-plugin` (T = `ReactNode`, namespace = `"rsc"`).

## Gotchas

### Timing: data written after subscribers

`claim.write()` happens in the `start` interceptor **after** `await next(path)`. By that time, `onTransitionSuccess` hooks and `subscribe()` callbacks have already fired. This means:

- **Works:** `const state = await router.start(url); state.context.data` — caller sees data
- **Works:** SSR render — server does `await start()`, then reads `state.context.data`
- **Does NOT work:** `router.subscribe(state => state.context.data)` — data is `undefined` in subscribe callback

This is by design for SSR.

### No caching

Every `start()` triggers a fresh loader call. Caching is the caller's responsibility (e.g., within the loader function itself).

### Teardown releases both claims

`unsubscribe()` removes the `start` interceptor and releases **both** the `"data"` namespace and the `"ssrDataMode"` namespace claims. In SSR, `router.dispose()` triggers teardown automatically.

### Loader errors propagate

If a loader throws, the error propagates through the `start()` promise. The caller's `try/catch` handles it — same as any async guard failure.

## Composition with `rsc-server-plugin`

`@real-router/ssr-data-plugin` and `@real-router/rsc-server-plugin` follow the **same factory pattern** (claim-based namespace + `start()` interceptor) and are designed to run **side-by-side** on the same router. Their namespaces are distinct:

- `ssr-data-plugin` → `state.context.data` (plain JSON / `unknown`)
- `rsc-server-plugin` → `state.context.rsc` (`ReactNode` / RSC payload)

```typescript
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { rscServerPluginFactory } from "@real-router/rsc-server-plugin";

router.usePlugin(
  ssrDataPluginFactory({
    "users.profile": () => async (params) => ({
      preferences: await prefs.get(params.id),
    }),
  }),
  rscServerPluginFactory({
    "users.profile": () => async (params) => {
      const user = await db.users.findById(params.id);
      return <UserProfile user={user} />;
    },
  }),
);

const state = await router.start("/users/42");

state.context.data; // JSON — hydrate via window.__SSR_STATE__
state.context.rsc;  // ReactNode — render Flight stream separately

const ssrJson = serializeRouterState(state, { excludeContext: ["rsc"] });
const flight = renderToReadableStream(state.context.rsc); // bundler's renderer
```

The two plugins **do not interfere**: distinct namespaces, independent teardown, independent claim release. Composition is verified by `rsc-server-plugin`'s property tests (invariants 14-15).
