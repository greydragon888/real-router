# @real-router/ssr-data-plugin

> SSR per-route data loading via `start()` interceptor

## Exports

| Export                   | Kind     | Description                                                        |
| ------------------------ | -------- | ------------------------------------------------------------------ |
| `ssrDataPluginFactory`   | function | Plugin factory — pass loaders map, returns `PluginFactory`         |
| `getSsrDataMode`         | function | Read `state.context.ssrDataMode` with `"full"` fallback            |
| `invalidate`             | function | `(router, "data") => void` — mark `"data"` stale; next navigation re-runs the loader |
| `defer`                  | function | `(opts: { critical, deferred }) => DeferredPayload` — declares a critical/deferred split returned from a loader (#610) |
| `isDeferred`             | function | Type guard — `true` iff value is a `defer()` payload                |
| `DeferredPayload`        | type     | Branded `{ critical, deferred }` shape returned by `defer()`        |
| `DataLoaderFn`           | type     | Compiled loader signature: `({ params, search }, context?: { signal: AbortSignal }) => Promise<unknown> \| unknown` (RFC-4 M2 / #1548) |
| `DataLoaderTarget`       | type     | `{ params, search }` — the two destination channels handed to a loader |
| `SsrLoaderContext`       | type     | `{ signal: AbortSignal }` — passed by the leave handler so cancellation-aware loaders can abort in-flight work |
| `DataLoaderFnFactory`    | type     | Factory signature: `(router, getDependency) => DataLoaderFn`       |
| `DataRouteEntry`         | type     | Per-route entry: factory (short form) or `{ ssr?, loader? }` object |
| `DataLoaderFactoryMap`   | type     | Record of route entries — pass to `ssrDataPluginFactory()`         |
| `SsrMode`                | type     | `"full" \| "data-only" \| "client-only"` — published per-route      |

### Subpath: `@real-router/ssr-data-plugin/server`

| Export                      | Kind     | Description                                                                                                  |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `injectDeferredScripts`     | function | `(stream, deferredMap, opts?) => ReadableStream<Uint8Array>` — wraps an HTML stream with `<script>__rrDefer__("key", json)</script>` tags emitted as each promise resolves. Default `bootstrap: true` prepends the registry installer. |
| `getDeferBootstrapScript`   | function | Returns the inline JS (no `<script>` wrapper) that installs `__rrDeferRegistry__` + `__rrDefer__` / `__rrDeferError__`. Embed once in `<head>` so React hydration sees a pristine `#root`. |
| `InjectDeferredScriptsOptions` | type  | `{ serialize?: Serializer; serializeError?: (e: unknown) => string; bootstrap?: boolean }` — opt-in `devalue.stringify` / `superjson.stringify` for non-JSON deferred payloads, custom error shape, or bootstrap suppression. |
| `Serializer`               | type     | `(value: unknown) => string` — alias for `injectDeferredScripts`'s `serialize` slot. Stable contract: must produce a JSON-parseable string (`JSON.parse(serializer(v))` round-trips on the client). Default is `JSON.stringify`. |

Server-only — Node `ReadableStream` / Web Streams. Application server (e.g.
Express + Vite middleware) splits `index.html` by `<!--defer-bootstrap-->`
in `<head>` for the bootstrap and `<!--ssr-outlet-->` inside `<div id="root">`
for the React stream piped through `injectDeferredScripts`. See
[examples/web/react/ssr-examples/ssr-streaming](../../examples/web/react/ssr-examples/ssr-streaming/).

### Subpath: `@real-router/ssr-data-plugin/errors`

| Export           | Kind     | Description                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `LoaderRedirect` | class    | Throw from a loader to map to HTTP 30x. Fields: `target: string`, `status: 301\|302\|307\|308` (default `302`) |
| `LoaderNotFound` | class    | Throw from a loader to map to HTTP 404. Field: `resource: string`                     |
| `LoaderTimeout`  | class    | Thrown by `withTimeout()` when the deadline elapses. Fields: `route: string`, `ms: number` |
| `withTimeout`    | function | `(routeName, ms, loader, options?) => Promise<T>` — race against a deadline; passes `{ signal }` to the loader for cooperative cancellation; optional `options.upstreamSignal` composes via `AbortSignal.any` (Node 20.3+) |

Discriminator is structural (`error.code === "LOADER_NOT_FOUND" | "LOADER_REDIRECT" | "LOADER_TIMEOUT"`), so consumers don't need to import the classes to inspect — `instanceof` is optional. The errors are reusable across both `@real-router/ssr-data-plugin` and `@real-router/rsc-server-plugin` (same shared source under `shared/ssr/errors.ts`).

## How It Works

1. `ssrDataPluginFactory(loaders)` validates loaders at factory call time, returns `PluginFactory`
2. On `router.usePlugin()`: claims `"data"` namespace via `api.claimContextNamespace("data")` and registers a `start` interceptor
3. On `router.start(url)`: interceptor wraps `next(path)`, awaits the state, calls matching loader, writes result to `state.context.data` via `claim.write()`
4. Data is accessible via `state.context.data` after `await router.start(url)`

## SSR-Only by Design (with explicit CSR revalidation channel)

Intercepts only `start()`, not `navigate()`. Rationale:

- SSR needs data **before** `renderToString()` — `start()` interceptor provides this
- CSR `navigate()` changes state immediately, then the interceptor runs — data arrives after render, useless without a subscription mechanism
- CSR data fetching belongs in application layer (React Query, Suspense, `useEffect`)
- Keeping `navigate()` off the hot path avoids performance overhead

The plugin **does** register a single `subscribeLeave` listener for the
`invalidate(router, "data")` revalidation channel (#605). The listener is
cheap when no flag is set — a `WeakMap` lookup + `Set.has` early-return —
and only re-runs the loader when the application has explicitly marked
the namespace stale. This is opt-in CSR refetch with honest semantics
(loader runs in the awaited LEAVE_APPROVE phase, fresh data lands on
`state.context.data` *before* `TRANSITION_SUCCESS` fires).

## Configuration

```typescript
ssrDataPluginFactory({
  // Short form (backwards-compatible): factory directly. Mode defaults to "full".
  "home": () => () => fetchHomeData(),

  // Object form: { ssr?, loader? }.
  "admin.dashboard": { ssr: false },                       // false → "client-only", no loader
  "users.profile": {
    ssr: "data-only",
    loader: (router, getDep) => async ({ params }) => fetchUser(params.id),
  },
  "docs.detail": {
    // Function-form resolver, called once per start() before the loader.
    ssr: (state) => state.search.format === "pdf" ? "client-only" : "full",
    loader: (router, getDep) => async ({ params }) => fetchDoc(params.id),
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

The function-form resolver receives `state` **before** the mode is written to context, so resolvers should not read `state.context.ssrDataMode` (it will be `undefined`). Branch on `state.params`, `state.search`, `state.path`, or `state.name` instead.

## Module Structure

```
src/
├── factory.ts     — ssrDataPluginFactory: thin adapter that inlines validateLoaders (createLoadersValidator(ERROR_PREFIX)) + delegates to createSsrLoaderPlugin
├── types.ts       — DataLoaderFn, DataLoaderFnFactory, DataLoaderFactoryMap, DataRouteEntry, SsrLoaderContext, SsrMode (public-facing types)
├── errors.ts      — Re-export from shared-ssr/errors (LoaderRedirect, LoaderNotFound, LoaderTimeout, withTimeout)
├── server.ts      — Server-side wire-format helpers: injectDeferredScripts, getDeferBootstrapScript, Serializer (#610). Subpath: @real-router/ssr-data-plugin/server.
├── constants.ts   — ERROR_PREFIX (LOGGER_CONTEXT — internal)
├── index.ts       — Public exports + module augmentation (@real-router/types for StateContext, including ssrDataDeferred / ssrDataDeferredKeys)
└── shared-ssr/    — symlink → shared/ssr/ (createSsrLoaderPlugin, createLoadersValidator, errors, defer, deferRegistryClient, deferWireFormat, staleRegistry, types)
```

The `factory.ts` is intentionally tiny (`validateLoaders` is a single-line binding inlined here after the deleted `validation.ts`) — the actual try/catch + interceptor + claim logic lives in [`shared/ssr/`](../../../shared/ssr/) and is consumed by both `ssr-data-plugin` (T = `unknown`, namespace = `"data"`) and `rsc-server-plugin` (T = `ReactNode`, namespace = `"rsc"`).

## Gotchas

### Timing: data written after subscribers

`claim.write()` happens in the `start` interceptor **after** `await next(path)`. By that time, `onTransitionSuccess` hooks and `subscribe()` callbacks have already fired. This means:

- **Works:** `const state = await router.start(url); state.context.data` — caller sees data
- **Works:** SSR render — server does `await start()`, then reads `state.context.data`
- **Does NOT work:** `router.subscribe(state => state.context.data)` — data is `undefined` in subscribe callback

This is by design for SSR.

### No caching

Every `start()` triggers a fresh loader call. Caching is the caller's responsibility (e.g., within the loader function itself).

### Teardown releases four claims

`unsubscribe()` removes the `start` interceptor, removes the `subscribeLeave` revalidation listener, and releases **all four** namespace claims:

- `"data"` — loader's resolved value (or `defer().critical`)
- `"ssrDataMode"` — resolved per-route SSR mode
- `"ssrDataDeferred"` — record of deferred promises from `defer()`
- `"ssrDataDeferredKeys"` — declared deferred-key list (SSR-serializable)

All four are claimed during `usePlugin()` and released in lock-step on teardown — partial-rollback on factory compilation error is verified by `tests/functional/data-loader.test.ts` "releases ... namespace when ... is already claimed". In SSR, `router.dispose()` triggers teardown automatically.

### `defer({ critical, deferred })` — formal critical/deferred split (#610)

Loaders may return `defer({ critical, deferred })` to declare a critical
bundle (resolved before the shell renders) and a record of deferred promises
(streamed after via inline `<script>__rrDefer__("key", json)</script>` chunks).

```ts
import { defer } from "@real-router/ssr-data-plugin";

"products.detail": () => ({ params }) => {
  const product = getProduct(params.id);
  if (!product) throw new LoaderNotFound(`product:${params.id}`);

  return defer({
    critical: { product },
    deferred: {
      reviews: fetchReviews(params.id),
      related: fetchRelated(params.id),
    },
  });
}
```

The plugin writes:

- `state.context.data` — `critical` (existing contract, no consumer change)
- `state.context.ssrDataDeferred` — `Record<string, Promise<unknown>>`. On the
  server the actual loader-returned promises; on the client (post-hydration)
  registry-backed promises that resolve as the inline settle scripts land.
- `state.context.ssrDataDeferredKeys` — declared key list, included in the
  SSR JSON state so the client plugin can reconstruct the map.

**Reserved deferred-map keys.** `defer()` rejects with `TypeError(/is reserved/)` for any of `__proto__`, `constructor`, `prototype`. These names would corrupt the prototype chain during client-side reconstruction (`ensureRegistryPromise(key)` runs through `Object.create(null)`-backed maps already as defence-in-depth, but rejecting upstream keeps the wire-format symmetric — server payload === client reconstruction).

**Shallow-clone freeze (security invariant).** `defer()` freezes a **shallow clone** of the deferred map, not the caller's own reference. Two guarantees follow:

1. `Object.freeze()` doesn't surprise the caller — they still hold a mutable reference.
2. Post-`defer()` mutations to the caller's map (e.g. `userMap.evil = somePromise` or `userMap.__proto__ = ...`) **cannot** smuggle entries that bypass the reserved-key / thenable validation pass. The validator inspects the snapshot at call time; the payload uses an independent frozen clone.

Promise references inside the clone are preserved (shallow), so the settle pipeline observes the same `Promise` instances the validator's defensive `.catch(() => {})` was attached to (defends against `unhandledRejection` for eagerly-rejected promises before `injectDeferredScripts` attaches its real `.then`).

Server pipeline:

```ts
import { renderToReadableStream } from "react-dom/server";
import {
  getDeferBootstrapScript,
  injectDeferredScripts,
} from "@real-router/ssr-data-plugin/server";

const reactStream = await renderToReadableStream(<App />);
const deferred =
  (state.context as { ssrDataDeferred?: Record<string, Promise<unknown>> })
    .ssrDataDeferred ?? {};

// Wrap the React stream — settle scripts are interleaved in resolution order.
const stream = injectDeferredScripts(reactStream, deferred, {
  bootstrap: false, // emit bootstrap separately (cleaner React hydration)
});

const bootstrap = `<script>${getDeferBootstrapScript()}</script>`;
// Embed `bootstrap` in <head>, pipe `stream` into <div id="root"> body.
```

Adapter consumers:

- React: `useDeferred(key)` + `<Await>` / `<Streamed>` from `@real-router/react/ssr`
  (see [packages/react/CLAUDE.md](../react/CLAUDE.md))
- Preact: `useDeferred(key)` + `<Await>` / `<Streamed>` from `@real-router/preact/ssr`
  (see [packages/preact/CLAUDE.md](../preact/CLAUDE.md))

**Adapters that intentionally don't dogfood `defer()`:**

- **Solid** — has native `createResource` + serialised resources; the framework's own splice protocol (`$df()`) interleaves with `<Suspense>` automatically, so the adapter's `<Await>` is available but `examples/web/solid/ssr-examples/ssr-streaming/` keeps the per-component `createResource` pattern (see that example's `loaders.ts` for the rationale).
- **Vue** — `<Suspense>` + `async setup()` resolves promises *before* emitting each chunk (chunked-blocking, no progressive HTTP-flush), and inline `<script>__rrDefer__(…)` settle scripts inside the streamed body trip Vue's hydration walker ("Hydration completed but contains mismatches"). The Vue example uses per-component `await fetchX()` in `<script setup>` instead — same `<Await>` API ships in `@real-router/vue/ssr` for cases where the consumer has already adapted their data layer to a single deferred channel.
- **Svelte** — native `{#await}` blocks have the same chunked-blocking semantics as Vue. The adapter exposes `<Await>` / `<Streamed>` via `@real-router/svelte/ssr` for symmetry, but the Svelte example uses `{#await}` directly.
- **Angular** — uses `injectDeferred()` (signal-based, asymmetric — see [packages/angular/CLAUDE.md](../angular/CLAUDE.md)) when paired with `defer()`. The streaming example uses native `@defer` blocks + `withIncrementalHydration()` instead, since Angular's chunk loading and per-block hydration cover the same ground without needing the wire-format bridge.

In short: `defer()` is an opt-in API for adapters whose framework lacks a native server-side promise integration (Preact) or whose ecosystem already aligns with the inline-settle-script transport (React via `<Suspense>` + `use()`). Pick the framework-native pattern when the adapter ships one.

`devalue` / `superjson` integration: pass `{ serialize: devalue.stringify }`
to `injectDeferredScripts` for non-JSON deferred payloads. Pair with
`hydrateRouter(router, json, { deserialize: devalue.parse })` for the
critical-data side.

Composes with `invalidate(router, "data")`:
`router.navigate(state.name, state.params, state.search, { reload: true })`
after `invalidate(...)` re-runs the loader, overwrites both critical data and
the deferred map. The new deferred promises replace the old ones in
`state.context.ssrDataDeferred`.

### `invalidate(router, "data")` — CSR revalidation

```typescript
import { invalidate } from "@real-router/ssr-data-plugin";

// Fire-and-forget — stale until any next navigation
invalidate(router, "data");

// Explicit await — pair with a same-route reload
invalidate(router, "data");
await router.navigate(state.name, state.params, state.search, { reload: true });
```

Mechanics: `invalidate()` flips a per-router `Set<namespace>` flag (`WeakMap` keyed by router). The plugin's `subscribeLeave` listener peeks the flag in the awaited LEAVE_APPROVE phase of every navigation. When the destination route has a loader-bearing entry, it runs the loader for `nextRoute.name`, writes fresh data to `nextRoute.context.data` and a mode marker to `nextRoute.context.ssrDataMode`, then clears the flag. Activation guards run, `completeTransition` fires `TRANSITION_SUCCESS`, and subscribers see the new payload.

**Peek-then-clear-after-write** semantics — the flag is cleared *only* after a successful, non-cancelled loader write. So:

- **No-entry navigation** (route not in loaders map) — listener no-ops, flag preserved for the next attempt.
- **Client-only / no-loader entry** — mode marker written, loader skipped, flag preserved.
- **Cancelled navigation** (newer `navigate()` aborts the older controller) — late-resolving loader sees `signal.aborted`, skips the write, flag preserved for the new navigation to consume.
- **Loader rejection** — the leave handler awaits the refresh loader with **no `try/catch`**, so the rejection **rejects the whole `navigate()`** — a navigation that would have succeeded *without* `invalidate`. The flag is preserved (cleared only after a successful write), so **every** subsequent navigation to a loader-bearing route re-runs the loader and fails again until it recovers — the degradation escalates from "stale data" to "cannot navigate." Intended (ARCHITECTURE lists it among the flag-preserving outcomes; a test pins the propagation), but mitigate on the caller side: `catch` the `navigate()` rejection, or make the loader infallible (`catch` → previous payload).

Idempotent — multiple `invalidate()` calls before the next refresh collapse to a single re-run (Set-deduplicated). Cheap when not stale: a single `WeakMap.get` + `Set.has` check per navigation. Survives `cloneRouter()` boundaries — the `WeakMap` is keyed by router instance, each clone has its own flag set.

#### Cancellation-aware loaders (#605)

The leave handler passes the navigation's `AbortController.signal` to the loader as the second argument:

```ts
"users.profile": () => async ({ params }, ctx) => {
  // Real-world: thread signal into fetch so the network layer cancels
  // when the navigation is superseded by a newer click.
  const response = await fetch(`/api/user/${params.id}`, {
    signal: ctx?.signal,
  });

  return response.json();
},
```

The start interceptor calls the loader **without** a context arg — SSR boot path apps that need a request-scoped signal use the existing `getDep("abortSignal")` pattern from `createRequestScope` + `withTimeout({ upstreamSignal })`.

**Important:** a signal aborted *before* `addEventListener("abort", …)` does NOT auto-fire the listener. Robust loaders check `signal.aborted` upfront:

```ts
return async (_params, ctx) => {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 25);

    const onAbort = (): void => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };

    if (ctx?.signal.aborted) {
      onAbort();

      return;
    }

    ctx?.signal.addEventListener("abort", onAbort, { once: true });
  });
  ...
};
```

Non-breaking change via TypeScript contravariance — existing `({ params }) => …` loaders without the second arg compile and run unchanged.

### Hydration scratchpad: presence wins (`{ data: undefined }` skips the loader)

The post-hydration scratchpad-skip path uses `config.namespace in hydrationState.context` — `in`, not `!== undefined`. Contract: **scratchpad presence wins**. If the server explicitly serialised a value into `state.context.data` (even an `undefined` left over from a programmatic state object that never went through `JSON.stringify`), the plugin treats that as the server's authoritative answer and skips re-running the loader on the client.

In practice this only matters for in-memory hydration paths — JSON-roundtrip strips `undefined` values, so a typical `serializeRouterState(state)` → `<script>window.__SSR_STATE__=…</script>` → `hydrateRouter` flow can't carry `data: undefined` across. The contract is documented here so a future refactor that flips to `!== undefined` knows it's a behaviour change, not a bug fix. Frozen by `tests/functional/data-loader.test.ts` "treats explicit `data: undefined` in hydrated context as missing" (the test name is from the user's perspective: "no value", and the plugin honours that as "server said: no value, stop here").

**Guarded against a missing `context` (#762).** The `in` check is preceded by `hydrationState.context !== undefined`. A hand-built partial source (`{ name, path }` with no `context` — type-legal via `hydrateRouter`'s `{ path: string }` object-source cast, which stashes it in the scratchpad with no runtime validation) no longer crashes `start()` with a bare `TypeError: Cannot use 'in' operator … in undefined`; a missing `context` is treated as "no server value for this namespace" and the loader runs. This is orthogonal to presence-wins, which is about presence of the *namespace key* within an existing `context`. Frozen by `data-loader.test.ts` "runs the loader instead of crashing when the hydration source has no context".

### Loader errors propagate

If a loader throws, the error propagates through the `start()` promise. The caller's `try/catch` handles it — same as any async guard failure.

On the `start()` path the loader runs **after** `await next(path)` committed the state and emitted `TRANSITION_SUCCESS`. When that loader rejects, core does **not** roll the start back (#763): the committed state stands and `router.isActive()` stays `true` — only the `start()` promise rejects. On SSR the per-request router is discarded so this is moot; on the client the router stays consistent with the success subscribers already observed. (The CSR `invalidate(...)` path runs the loader in the awaited LEAVE_APPROVE phase, *before* `TRANSITION_SUCCESS`, so a rejection there fails the `navigate()` before any commit.)

## Composition with `rsc-server-plugin`

`@real-router/ssr-data-plugin` and `@real-router/rsc-server-plugin` follow the **same factory pattern** (claim-based namespace + `start()` interceptor) and are designed to run **side-by-side** on the same router. Their namespaces are distinct:

- `ssr-data-plugin` → `state.context.data` (plain JSON / `unknown`)
- `rsc-server-plugin` → `state.context.rsc` (`ReactNode` / RSC payload)

```typescript
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { rscServerPluginFactory } from "@real-router/rsc-server-plugin";

router.usePlugin(
  ssrDataPluginFactory({
    "users.profile": () => async ({ params }) => ({
      preferences: await prefs.get(params.id),
    }),
  }),
  rscServerPluginFactory({
    "users.profile": () => async ({ params }) => {
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
