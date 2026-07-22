# @real-router/rsc-server-plugin

> Per-route `ReactNode` (RSC payload) loading via `start()` interceptor — bundler-agnostic mirror of `ssr-data-plugin`

## Exports

| Export                    | Kind     | Description                                                                |
| ------------------------- | -------- | -------------------------------------------------------------------------- |
| `rscServerPluginFactory`  | function | Plugin factory — pass loaders map, claims `"rsc"` and `"ssrRscMode"` namespaces |
| `rscActionPluginFactory`  | function | Plugin factory — pass `() => RscActionResult \| undefined`, claims `"rscAction"` |
| `getSsrRscMode`           | function | Read `state.context.ssrRscMode` with `"full"` fallback                      |
| `invalidate`              | function | `(router, "rsc") => void` — mark `"rsc"` stale; next navigation re-runs the RSC loader |
| `RscLoaderFn`             | type     | Compiled loader signature: `({ params, search }) => Promise<ReactNode> \| ReactNode` (RFC-4 M2 / #1548) |
| `RscLoaderTarget`         | type     | `{ params, search }` — the two destination channels handed to a loader     |
| `RscLoaderFnFactory`      | type     | Factory signature: `(router, getDependency) => RscLoaderFn`                |
| `RscRouteEntry`           | type     | Per-route entry: factory (short form) or `{ ssr?, loader? }` object        |
| `RscLoaderFactoryMap`     | type     | Record of route entries — pass to `rscServerPluginFactory()`               |
| `RscSsrMode`              | type     | `"full" \| "client-only"` — RSC subset (`"data-only"` excluded)             |
| `RscActionResult<R, F>`   | type     | `{ returnValue?: { ok, data: R }, formState?: F }` — Server Action result |
| `RscPayload<R, F>`        | type     | `{ root: ReactNode } & RscActionResult<R, F>` — canonical Flight shape    |

### Subpath: `@real-router/rsc-server-plugin/errors`

| Export           | Kind     | Description                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `LoaderRedirect` | class    | Throw from a loader to map to HTTP 30x. Fields: `target: string`, `status: 301\|302\|307\|308` |
| `LoaderNotFound` | class    | Throw from a loader to map to HTTP 404. Field: `resource: string`                     |
| `LoaderTimeout`  | class    | Thrown by `withTimeout()` when the deadline elapses. Fields: `route: string`, `ms: number` |
| `withTimeout`    | function | `(routeName, ms, loader, options?) => Promise<T>` — race against a deadline; passes `{ signal }` to the loader for cooperative cancellation; optional `options.upstreamSignal` composes via `AbortSignal.any` (Node 20.3+) |

Mirror of `@real-router/ssr-data-plugin/errors` — same `shared/ssr/errors.ts` source. RSC apps that use `rsc-server-plugin` can import from this subpath without taking a dependency on `ssr-data-plugin`. Discriminator is structural (`error.code === "LOADER_NOT_FOUND" | ...`).

## How It Works

1. `rscServerPluginFactory(loaders)` validates loaders at factory call time, returns `PluginFactory`
2. On `router.usePlugin()`: claims the `"rsc"` namespace via `api.claimContextNamespace("rsc")` and registers a `start` interceptor
3. On `router.start(url)`: interceptor wraps `next(path)`, awaits the state, calls the matching loader, writes the resulting `ReactNode` to `state.context.rsc` via `claim.write()`
4. The caller pipes `state.context.rsc` through their bundler's `renderToReadableStream` (e.g. `@vitejs/plugin-rsc/rsc`, `react-server-dom-webpack/server.edge`)

## Variant B — `ReactNode`, not Flight bytes

The plugin publishes a `ReactNode` (a Server Component element) — **not** a buffered Flight payload. Rationale (see `.claude/rfc-rsc-server-plugin.md` for full evidence):

- **Streaming:** caller can pipe Flight in parallel with HTML rendering — TTFB-friendly
- **Bundler-agnostic:** plugin never imports `react-server-dom-*`; signatures across webpack/turbopack/parcel/esm differ
- **Industry alignment:** matches React Router 7 (`unstable_RSCStaticRouter`) and TanStack Start (`renderServerComponent`)
- **Sync allowed:** `RscLoaderFn` returns `Promise<ReactNode> | ReactNode` — many Server Components are synchronous

## SSR-Only by Design (with explicit CSR revalidation channel)

Intercepts only `start()`, not `navigate()`. Same rationale as `ssr-data-plugin`:

- SSR needs the `ReactNode` **before** Flight render — `start()` interceptor provides this
- CSR `navigate()` resolves state synchronously; the interceptor would arrive after render
- CSR data fetching belongs in application layer (React Query, Suspense, RSC re-fetch endpoint)

The plugin **does** register a single `subscribeLeave` listener for the
`invalidate(router, "rsc")` revalidation channel (#605). The listener is
cheap when no flag is set — a `WeakMap` lookup + `Set.has` early-return —
and only re-runs the loader when the application has explicitly marked
the namespace stale. This is opt-in CSR refetch with honest semantics
(loader runs in the awaited LEAVE_APPROVE phase, fresh `ReactNode` lands
on `state.context.rsc` *before* `TRANSITION_SUCCESS` fires).

## Configuration

```typescript
rscServerPluginFactory({
  // Short form: factory directly. Mode defaults to "full".
  home: () => async () => <HomePage />,

  // Object form: { ssr?, loader? }.
  "admin.dashboard": { ssr: false },                       // false → "client-only"
  "users.profile": {
    ssr: "full",
    loader: () => async (params) => {
      const user = await fetchUser(params.id);
      return <UserProfile user={user} />;
    },
  },
  "docs.detail": {
    ssr: (state) => state.params.format === "pdf" ? "client-only" : "full",
    loader: () => async (params) => <Doc id={params.id} />,
  },
});
```

Validation at factory time: rejects `null`, non-objects, non-function values, unknown keys, invalid `ssr` types, and **`"data-only"`** (RSC has no semantically meaningful "data without component" — see `RscSsrMode`).

## Per-route SSR Mode

`rsc-server-plugin` supports a strict subset of `SsrMode`: `"full"` and `"client-only"`. `"data-only"` is rejected at factory time with a typed error:

```
[@real-router/rsc-server-plugin] mode "data-only" is not allowed for route "X". Allowed: full, client-only
```

| `ssr` config                 | mode marker       | server/client loader behaviour |
| ---------------------------- | ----------------- | ------------------------------ |
| omitted / `true` / `"full"`  | `"full"`          | runs (composes with #596*)      |
| `false` / `"client-only"`    | `"client-only"`   | **skipped** unconditionally     |
| `(state) => RscSsrMode`      | resolver result   | resolved per-navigation         |

> **\*#596 composition caveat.** The #596 hydration-scratchpad skip (reuse the
> server value instead of re-running the loader on the client) fires **only** when
> `"rsc"` is present in the hydrated `state.context` — an **in-memory / object
> handoff**. Under the package's own recommended `excludeContext: ["rsc"]`
> serialization (a `ReactNode` can't survive JSON), the namespace is cut from the
> payload → the scratchpad `in`-check is false → the loader **re-runs** on the
> client (validated: `clientLoaderCalls === 1`). So with the recommended
> `excludeContext`, do **not** register this plugin on the client — there is no
> server value to reuse and the loader would run again. The skip is real only for
> Variant-B in-memory handoff. See "Post-hydration loader skip" in the README.

Mode is published to `state.context.ssrRscMode`. Read it via `getSsrRscMode(state)`:

```typescript
import { getSsrRscMode } from "@real-router/rsc-server-plugin";

const mode = getSsrRscMode(state);
if (mode === "full") {
  const flight = renderToReadableStream(buildRscPayload(state));
  // pipe Flight + SSR HTML
} else {
  // mode === "client-only": no Server Component was rendered server-side;
  // the client requests the Flight stream over a separate /__rsc endpoint
  // (or the app uses a different rendering strategy entirely)
}
```

Function-form resolvers receive `state` **before** the mode is written. Use `state.params` / `state.path` / `state.name` for branching; do not read `state.context.ssrRscMode`.

## Module Structure

```
src/
├── factory.ts          — rscServerPluginFactory: thin adapter; validates loaders inline (createLoadersValidator binding) + delegates to createSsrLoaderPlugin
├── actionFactory.ts    — rscActionPluginFactory: claims "rscAction" namespace, publishes Server Action result
├── buildRscPayload.ts  — buildRscPayload(state, rootOverride?): wire-format helper for { root, returnValue, formState }
├── getSsrRscMode.ts    — getSsrRscMode(state): runtime-guarded reader of state.context.ssrRscMode
├── invalidate.ts       — invalidate(router, "rsc"): typed wrapper over markStale for CSR revalidation
├── types.ts            — RscLoaderFn, RscLoaderFnFactory, RscLoaderFactoryMap, RscActionResult, RscPayload (public-facing types)
├── errors.ts           — Re-export from shared-ssr/errors (LoaderRedirect, LoaderNotFound, LoaderTimeout, withTimeout)
├── constants.ts        — ERROR_PREFIX (logger context, internal) + ALLOWED_RSC_MODES (single source of truth for factory / validator / read-side guard)
├── index.ts            — Public exports + module augmentation on @real-router/types (StateContext: rsc, rscAction, ssrRscMode — three namespaces total)
└── shared-ssr/         — symlink → shared/ssr/ (createSsrLoaderPlugin, createLoadersValidator, staleRegistry, errors)
```

`factory.ts` is intentionally a tiny adapter — the actual try/catch + interceptor + claim logic lives in [`shared/ssr/`](../../../shared/ssr/) and is consumed by both `rsc-server-plugin` (`T = ReactNode`, namespace = `"rsc"`) and `ssr-data-plugin` (`T = unknown`, namespace = `"data"`). The previous standalone `validation.ts` was inlined into `factory.ts:11` (single-use binding, no other importer) — the validator factory itself remains shared at `shared-ssr/createLoadersValidator.ts`.

## Gotchas

### Timing: rsc payload written after subscribers

`claim.write()` happens in the `start` interceptor **after** `await next(path)`. By that time, `onTransitionSuccess` hooks and `subscribe()` callbacks have already fired. This means:

- **Works:** `const state = await router.start(url); state.context.rsc` — caller sees the ReactNode
- **Works:** SSR render — server does `await start()`, then reads `state.context.rsc`, then pipes Flight
- **Does NOT work:** `router.subscribe(state => state.context.rsc)` — `rsc` is `undefined` in subscribe callback

This is by design for SSR.

### Serialization: strip "rsc" before transport

`state.context.rsc` is a `ReactNode` (object tree containing functions/symbols). It cannot be JSON-serialized for client transport. Use the `excludeContext` option on `serializeRouterState`:

```typescript
const json = serializeRouterState(state, { excludeContext: ["rsc"] });
```

The Flight payload travels via the bundler's stream renderer; the router state JSON travels alongside it.

### No bundler dependency

This package depends ONLY on `react` (peer) and `@real-router/core` (peer) + `@real-router/types`. Notably absent: `react-server-dom-*`, `@vitejs/plugin-rsc`, `react-dom`. The caller wires the renderer.

### Single rsc-server-plugin per router

The `"rsc"` namespace is exclusive (collision detection in `claimContextNamespace`). Registering two `rscServerPluginFactory()` plugins on the same router throws `RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`.

### Teardown releases both claims

`unsubscribe()` removes the `start` interceptor, removes the `subscribeLeave` revalidation listener, and releases **both** the `"rsc"` namespace and the `"ssrRscMode"` namespace claims. In SSR, `router.dispose()` triggers teardown automatically.

### Stale flag survives plugin teardown until router is GC'd

The per-router stale flag set by `invalidate(router, "rsc")` lives in a module-level `WeakMap<Router, Set<string>>` and is **not** cleared on `unsubscribe()`. Teardown removes the consumer (the `subscribeLeave` listener) but not the producer's mark. Concretely:

```typescript
invalidate(router, "rsc");          // flag set
unsub();                            // listener gone, flag still in WeakMap
const reSub = router.usePlugin(rscServerPluginFactory(loaders));
await router.navigate(...);          // ← new listener picks up the pre-existing flag → loader re-runs
```

This is **the intended behaviour** for hot-swap scenarios on a long-lived router instance. The flag becomes unreachable (and GC'd) only when the router itself is GC'd — `cloneRouter()` clones get a fresh registry entry via WeakMap key isolation, so per-request SSR is unaffected.

If you need to drop the flag without disposing the router, navigate to a route with a registered loader once after `invalidate` to consume it, OR re-architect to avoid the hot-swap (typical apps don't).

### `invalidate(router, "rsc")` — CSR revalidation

```typescript
import { invalidate } from "@real-router/rsc-server-plugin";

// Fire-and-forget — stale until any next navigation
invalidate(router, "rsc");

// Explicit await — pair with a same-route reload
invalidate(router, "rsc");
await router.navigate(state.name, state.params, { reload: true });
```

Mechanics: `invalidate()` flips a per-router `Set<namespace>` flag (`WeakMap` keyed by router). The plugin's `subscribeLeave` listener consumes the flag in the awaited LEAVE_APPROVE phase of the **next** navigation — re-runs the RSC loader for the destination route (`nextRoute.name`), writes a fresh `ReactNode` to `nextRoute.context.rsc`, then resolves. Activation guards run, `completeTransition` fires `TRANSITION_SUCCESS`, and subscribers see the new payload.

Behaviour during an in-flight transition is **deferred**: the current transition completes unchanged; the *following* navigation consumes the flag. This preserves the invariant "one transition = one `state.context` snapshot".

Idempotent — multiple `invalidate()` calls before the next navigation collapse to a single re-run. Cheap when not stale: a single `WeakMap` lookup + `Set.has` check per navigation. Surgical for multi-namespace routes — only `"rsc"` re-runs; a side-by-side `ssr-data-plugin` keeps its cached `state.context.data` unless its own `invalidate()` was also called.

**Failure semantics (intended, but sharp).** The refresh loader runs in the awaited LEAVE_APPROVE phase with **no internal `try/catch`** (`shared/ssr/createSsrLoaderPlugin.ts`, the `subscribeLeave` handler), so a rejecting loader **rejects the consuming `navigate()`** — a navigation that would have succeeded *without* `invalidate`. And because the stale flag is cleared only *after* a successful write, a rejection **keeps the flag set**: every subsequent navigation to a loader-bearing route re-runs the loader and fails again until it recovers. The degradation escalates from "stale payload" to "cannot navigate." This is intended (ARCHITECTURE lists loader rejections among the flag-preserving outcomes, and a test pins the propagation) — mitigate on the caller side: `catch` the `navigate()` rejection, or make the loader infallible (`catch` → previous payload).

### Loader errors propagate

If a loader throws, the error propagates through the `start()` promise. The caller's `try/catch` handles it — same as any async guard failure or `ssr-data-plugin` loader.

The RSC loader runs **after** `await next(path)` committed the state and emitted `TRANSITION_SUCCESS`, so a rejection here does **not** roll the start back (#763): the committed state stands and `router.isActive()` stays `true` — only the `start()` promise rejects. On SSR the per-request router is discarded; on the client the router stays consistent with the observed success.

### Sync loader allowed

`RscLoaderFn` accepts both sync and async returns. `claim.write(state, await loader(...))` correctly handles both — `await` on a non-Promise resolves synchronously to the value.

### Coverage report appears empty in stdout

The root [`vitest.config.unit.mts`](../../vitest.config.unit.mts) uses the `["text", { skipFull: true }]` coverage reporter, which **omits files with 100% coverage from the printed table**. Running `pnpm test` may show an empty `% Stmts` table — that means **all source files are at 100%**, not that coverage is missing. The full report is written to `coverage/` (lcov, json, json-summary) regardless. Verify via `cat coverage/coverage-summary.json` if needed.

## Composition with `ssr-data-plugin`

`@real-router/rsc-server-plugin` and `@real-router/ssr-data-plugin` follow the **same factory pattern** (claim-based namespace + `start()` interceptor) and are designed to run **side-by-side** on the same router. Their namespaces are distinct:

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

state.context.data; // { preferences: { theme: "dark", ... } }   — JSON, hydrate-safe
state.context.rsc;  // <UserProfile user={...} />                — ReactNode, Flight-stream

const ssrJson = serializeRouterState(state, { excludeContext: ["rsc"] });
const flight = renderToReadableStream(state.context.rsc);
```

### Three-plugin composition (with Server Actions)

For RSC apps that ship Server Actions, add `rscActionPluginFactory` as a third plugin. It claims a separate `"rscAction"` namespace so Server Action results (returnValue / formState) become part of router state and can be serialized, inspected, or read by other Server Components.

```typescript
import { rscServerPluginFactory, rscActionPluginFactory, type RscPayload } from "@real-router/rsc-server-plugin";
import { decodeAction, decodeReply, loadServerAction } from "@vitejs/plugin-rsc/rsc";

let actionResult: RscActionResult | undefined;

if (request.method === "POST") {
  // … decode + execute action …
  actionResult = { returnValue: { ok: true, data: ... } };
}

const router = cloneRouter(baseRouter, { db });
router.usePlugin(
  rscServerPluginFactory(loaders),
  rscActionPluginFactory(() => actionResult),  // ← captures via closure
);

const state = await router.start(pathname);

state.context.rsc;        // ReactNode (Flight-stream)
state.context.rscAction;  // RscActionResult — JSON-serializable

// Use the canonical RscPayload<TReturn, TFormState> type for the
// Flight payload — single source of truth shared with SSR + browser entries.
const payload: RscPayload = {
  root: state.context.rsc,
  returnValue: state.context.rscAction?.returnValue,
  formState: state.context.rscAction?.formState,
};
```

See [`rfc-rsc-server-plugin-payload-action.md`](../../.claude/rfc-rsc-server-plugin-payload-action.md) for design rationale and tradeoffs.

### `buildRscPayload(state, rootOverride?)` — wire-format helper

Removes the repeated `{ root: state.context.rsc, returnValue: ..., formState: ... }` boilerplate. Reads `state.context.rsc` and `state.context.rscAction` and returns a `RscPayload<TReturn, TFormState>`. Pass `rootOverride` to wrap the per-route Server Component tree (e.g. with cross-cutting layout chrome) without rebuilding the payload by hand.

```ts
import { buildRscPayload } from "@real-router/rsc-server-plugin";

const state = await router.start(pathname);

// Default — root = state.context.rsc:
const flight = renderToReadableStream(buildRscPayload(state));

// With wrapping override (Server Component composition):
const wrapped = (
  <>
    <NotificationBanner action={state.context.rscAction} />
    {state.context.rsc}
  </>
);
const payload = buildRscPayload<MyData, ReactFormState>(state, wrapped);
```

`returnValue` and `formState` are **omitted** (not set to `undefined`) when their source is missing — works under `exactOptionalPropertyTypes: true` consumers without ceremony.

**Why both?** RSC apps frequently ship two distinct payloads:
1. **JSON state** for client-side hydration (theme, locale, feature flags, hydration-bound user data) — travels via `<script>window.__SSR_STATE__=...</script>`
2. **Flight payload** for the rendered Server Component tree — travels via `<script>__FLIGHT_DATA__.push(...)</script>` chunks

Composition is verified by invariants 14-15 in [INVARIANTS.md](INVARIANTS.md) — both plugins coexist without cross-namespace mutation; teardown of one does not affect the other.
