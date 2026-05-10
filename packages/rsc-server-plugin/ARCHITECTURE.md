# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/rsc-server-plugin` loads per-route `ReactNode` (RSC payload) during SSR by intercepting `router.start()`. After route resolution, the matching loader runs and its result is written to `state.context.rsc` via the claim-based API. The caller is responsible for piping the published `ReactNode` through the bundler's Flight renderer.

**Core role:** A stateless interceptor that bridges route resolution and Server Component dispatch. Contains no rendering, no Flight serialization, no bundler logic — keeping the plugin fully bundler-agnostic.

**Mirror of `ssr-data-plugin`:** The architecture is a one-to-one mirror, with three differences:

1. Namespace `"rsc"` instead of `"data"`
2. Loader return type is `Promise<ReactNode> | ReactNode` (sync allowed) instead of `Promise<unknown>`
3. Explicit generic `<Dependencies>` on the factory function (improvement over `ssrDataPluginFactory` where the generic only existed on `DataLoaderFactoryMap`)

**Integration points with the core:**

- `api.claimContextNamespace("rsc")` — claims exclusive ownership of `state.context.rsc`
- `addInterceptor("start", ...)` — wraps `start()` to load the ReactNode after route resolution
- `claim.write(state, node)` — writes the loader result to the state's context
- `claim.release()` — releases the namespace claim on teardown
- Plugin hook (`teardown`) — removes interceptor and releases claim

## Package Structure

```
rsc-server-plugin/
├── src/
│   ├── index.ts            — Public API + StateContext module augmentation (rsc, rscAction, ssrRscMode)
│   ├── factory.ts          — rscServerPluginFactory: thin adapter over createSsrLoaderPlugin
│   ├── actionFactory.ts    — rscActionPluginFactory: claims "rscAction" namespace, publishes Server Action result
│   ├── buildRscPayload.ts  — buildRscPayload(state, rootOverride?): wire-format helper for { root, returnValue, formState }
│   ├── invalidate.ts       — invalidate(router, "rsc"): typed wrapper over markStale
│   ├── getSsrRscMode.ts    — getSsrRscMode(state): runtime-guarded reader of state.context.ssrRscMode
│   ├── validation.ts       — validateLoaders = createLoadersValidator(ERROR_PREFIX, ALLOWED_RSC_MODES)
│   ├── types.ts            — RscLoaderFn, RscLoaderFnFactory, RscLoaderFactoryMap, RscActionResult, RscPayload
│   ├── errors.ts           — Re-export of LoaderRedirect / LoaderNotFound / LoaderTimeout / withTimeout (subpath: /errors)
│   ├── constants.ts        — ERROR_PREFIX, ALLOWED_RSC_MODES (single source of truth shared by factory/validation/getter)
│   └── shared-ssr/         — symlink → shared/ssr/ (factory, validator, stale registry, errors)
```

## Module Dependency Graph

```
index.ts
    ├── factory.ts
    │       ├── constants.ts (ERROR_PREFIX, ALLOWED_RSC_MODES)
    │       ├── validation.ts → shared-ssr/createLoadersValidator.ts
    │       │                  ↳ constants.ts (ALLOWED_RSC_MODES)
    │       ├── shared-ssr/createSsrLoaderPlugin.ts
    │       │       ├── shared-ssr/staleRegistry.ts (isStale + clearStale)
    │       │       └── shared-ssr/defer.ts (isDeferred — ssr-data-only path; no-op for rsc)
    │       └── types.ts
    ├── actionFactory.ts
    │       ├── constants.ts (ERROR_PREFIX)
    │       └── @real-router/core/api (getPluginApi)
    ├── buildRscPayload.ts → types.ts (RscActionResult, RscPayload)
    ├── invalidate.ts → shared-ssr/staleRegistry.ts (markStale)
    └── getSsrRscMode.ts → constants.ts (ALLOWED_RSC_MODES) + types.ts (RscSsrMode)

errors.ts → shared-ssr/errors.ts (LoaderRedirect, LoaderNotFound, LoaderTimeout, withTimeout)
```

External dependencies:

| Dependency                        | What it provides                                                              | Used in                                |
| --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| `@real-router/core/api`           | `getPluginApi`                                                                | `actionFactory.ts`, `shared-ssr/createSsrLoaderPlugin.ts` |
| `@real-router/core/validation`    | `getInternals` (read-only access to internals.hydrationState scratchpad)      | `shared-ssr/createSsrLoaderPlugin.ts`  |
| `@real-router/types`              | `StateContext` (module augmentation target), `Plugin`, `PluginFactory`, `State` | `index.ts`, all factories              |
| `react`                           | `ReactNode` type only (peer dep)                                              | `types.ts`, `index.ts`, `buildRscPayload.ts` |

**No** `react-server-dom-*`, **no** `@vitejs/plugin-rsc`, **no** `react-dom`.

## Shared SSR Scaffolding

The plugin's factory + validation logic lives in [`shared/ssr/`](../../shared/ssr/) and is consumed via a git-tracked symlink at `src/shared-ssr` (same pattern as `shared/browser-env/` for browser/hash/navigation-plugin and `shared/dom-utils/` for framework adapters).

The shared module exports:

- `createSsrLoaderPlugin<T, D>(loaders, { namespace, errorPrefix })` — generic factory implementing the validate-compile-loop + start-interceptor + claim/teardown pattern. For this plugin: `T = ReactNode`, `namespace = "rsc"`.
- `createLoadersValidator(errorPrefix)` — generic shape validator (non-null object → function values).

Sibling plugin `@real-router/ssr-data-plugin` consumes the same helpers with `namespace = "data"` and `T = unknown`. Because the shared logic is symlinked source (not a published package), bug fixes apply to both plugins automatically.

## Variant B Decision Record

The RSC integration RFC explicitly chose to publish `ReactNode` (Variant B) over a pre-rendered Flight `Uint8Array` (Variant A). Evidence:

1. **Streaming.** `renderToReadableStream` returns `ReadableStream<Uint8Array>` that can be piped in parallel with HTML SSR — Variant A would block the loader on Flight render
2. **Bundler-agnosticism.** `react-server-dom-{webpack,turbopack,parcel,esm}` have incompatible signatures; pushing the choice up to the caller eliminates an n-way DI matrix in the plugin
3. **Industry alignment.** RR7 `unstable_RSCStaticRouter` and TanStack Start `renderServerComponent` both store `ReactNode` and render Flight separately
4. **Transport.** `state.context.rsc` is intentionally non-JSON-serializable; transport via `serializeRouterState({ excludeContext: ["rsc"] })`

See `.claude/rfc-rsc-server-plugin.md` "Ключевое решение: Variant B" for the full evidence trail.

### Note for readers of `research-rsc-integration-ru.md`

The original R&D document (`.claude/research-rsc-integration-ru.md`, "Уровень 1") presented **two architectural options** without picking a winner:

| Option | What it stored in `state.context.rsc`                | Status |
| ------ | ---------------------------------------------------- | ------ |
| **A**  | Pre-rendered Flight bytes (`Uint8Array`/`ReadableStream`) | ❌ **Rejected** in this implementation |
| **B**  | `ReactNode` (Server Component element)               | ✅ **Adopted**                          |

**If you're migrating notes/code that referenced "Variant A":** the published API stores a `ReactNode`. The Flight render step is **the caller's responsibility** — it happens *outside* the plugin via the bundler-specific `renderToReadableStream`. The cost: `state.context.rsc` is non-JSON-serializable (functions/symbols inside React elements), which is why `serializeRouterState` gained the `excludeContext` option in `@real-router/core`. The benefit: streaming TTFB, bundler agnosticism, and zero `react-server-dom-*` peer dep.

## Factory Pattern

Same closure-based factory as `ssr-data-plugin` — no class, no mutable state beyond the immutable `claim` binding. The closure logic itself lives in [`shared/ssr/createSsrLoaderPlugin.ts`](../../shared/ssr/createSsrLoaderPlugin.ts); `rscServerPluginFactory` is a thin adapter:

```
rscServerPluginFactory(loaders)              ← factory.ts (~25 LOC incl. JSDoc)
        │
        │  1. validateLoaders(loaders)         ← validation.ts → createLoadersValidator(ERROR_PREFIX)
        │  2. createSsrLoaderPlugin<ReactNode, Dependencies>(loaders, { namespace: "rsc", errorPrefix })
        │
        └── createSsrLoaderPlugin returns PluginFactory (closure)
                │
                │  Called by router.usePlugin():
                │
                ├── api = getPluginApi(router)
                ├── claim = api.claimContextNamespace("rsc")
                ├── try: compile factories → compiledLoaders Map
                │       └── factory(router, getDependency) per entry
                │       └── typeof check on each returned loader
                │   catch: claim.release() + rethrow
                ├── api.addInterceptor("start", ...)
                │       └── claim.write(state, await loader(state.params))
                └── return { teardown }
                        └── removeStartInterceptor() + claim.release()
```

## Sibling: `rscActionPluginFactory` (Server Actions)

For RSC apps that ship Server Actions, a second plugin in this package
publishes the action result to `state.context.rscAction` using the same
claim-based pattern. It coexists with `rscServerPluginFactory` on the
same router (distinct namespaces — `"rsc"` vs `"rscAction"`).

```
rscActionPluginFactory(getResult)             ← actionFactory.ts (~80 LOC incl. JSDoc)
        │
        │  factory-time:
        │    1. typeof getResult === "function"  → else throw TypeError
        │
        └── PluginFactory closure
                │
                │  Called by router.usePlugin():
                │
                ├── api = getPluginApi(router)
                ├── claim = api.claimContextNamespace("rscAction")
                ├── api.addInterceptor("start", async (next, path) => {
                │       state = await next(path);
                │       result = getResult();
                │
                │       per-start runtime guard:
                │         result === undefined          → return state (skip-write)
                │         typeof result !== "object" |
                │           result === null |
                │           Array.isArray(result) |
                │           result.then === function    → throw TypeError
                │
                │       claim.write(state, result);
                │       return state;
                │   })
                └── return { teardown: removeStartInterceptor + claim.release }
```

**Why a separate factory?** Server Action results are produced *outside*
the loader pipeline (typically in the request fetch handler, before the
router exists for that request). They have no per-route mapping, so they
don't fit `RscLoaderFactoryMap`. Closing over a `let actionResult` in
the request handler is the natural API.

**Two layers of validation, mirroring `rscServerPluginFactory(loaders)`:**

- Factory-time: `getResult` is a function (eager fail before the namespace
  is claimed).
- Per-start runtime: the *return value* must be `undefined` or a
  plain object (not Promise/thenable, not array, not primitive). The
  most common consumer mistake is wiring an `async getResult` — the
  guard surfaces that as a typed error pointing back at the call site.

### `buildRscPayload(state, rootOverride?)` — wire-format helper

`buildRscPayload` reads `state.context.rsc` and `state.context.rscAction`
and returns a `RscPayload<TReturn, TFormState>` ready for the bundler's
Flight renderer. `returnValue` and `formState` are **omitted** (not set
to `undefined`) when their source is missing — the result type-checks
under `exactOptionalPropertyTypes: true` consumers without ceremony.
A strict `=== undefined` `rootOverride` check preserves an explicit
`null` override as "render nothing" instead of collapsing to the default.

## Data Flow

### start() interceptor

```
router.start(url)
        │
        ▼
  start interceptor
        │
        ├── state = await next(path)
        │     └── core resolves route: matchPath → forwardState → guards → State
        │
        ├── loader = compiledLoaders.get(state.name)
        │     found: rsc = await loader(state.params)
        │            claim.write(state, rsc)            ← state.context.rsc = ReactNode
        │     not found: skip
        │
        └── return state
              │
              ▼
       caller receives state with state.context.rsc populated
              │
              ▼
       const flight = renderToReadableStream(state.context.rsc)   ← caller's bundler
              │
              ▼
       pipe flight to HTTP response
```

The interceptor runs **after** route resolution. If guards block the navigation, `next()` rejects and the loader never runs.

### subscribeLeave handler — CSR revalidation

A second listener registered alongside the start interceptor consumes the per-router stale flag set by `invalidate(router, "rsc")`. Runs in the awaited LEAVE_APPROVE phase, so a fresh `ReactNode` lands on `nextRoute.context` *before* `TRANSITION_SUCCESS` fires.

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
        ├── isStale(router, "rsc")? no  → return (cheap WeakMap.get + Set.has)
        │
        ├── compiledLoaders.get(nextRoute.name)? none → return (flag preserved)
        │
        ├── modeClaim.write(nextRoute, mode)
        │
        ├── client-only / no-loader entry → return (flag preserved)
        │
        ├── rsc = await loader(nextRoute.params)
        │
        ├── signal.aborted? yes → return (flag preserved for the new nav)
        │
        ├── clearStale(router, "rsc")
        └── claim.write(nextRoute, rsc)   ← writes ReactNode to nextRoute.context.rsc
        │
        ▼
  activation guards → completeTransition → TRANSITION_SUCCESS
```

**Peek-then-clear-after-write**: the flag is cleared only on a successful, non-cancelled loader write. Every "non-refresh" outcome — no-entry hops, client-only mode, mode-only entries, cancellation by a newer navigation, loader rejections — leaves the flag set for the next attempt.

The flag itself lives in `shared/ssr/staleRegistry.ts` — a module-level `WeakMap<Router, Set<string>>` shared with `ssr-data-plugin`. Per-router and per-namespace isolation comes free from the WeakMap key + Set value pairing: `invalidate(router, "data")` and `invalidate(router, "rsc")` are independent, and `cloneRouter()` clones get their own flag set.

### Accessing the RSC payload

```typescript
const state = await router.start(url);
state.context.rsc; // ReactNode | undefined
```

The `ReactNode` lives directly on the state object's context. No separate retrieval method needed.

## SSR Usage Flow

```
// Server: per-request
const router = cloneRouter(baseRouter, deps);
router.usePlugin(rscServerPluginFactory(loaders));
                                                    ← factory validates loaders (once)
                                                    ← usePlugin claims "rsc" namespace + registers interceptor

const state = await router.start(url);
                                                    ← interceptor: next(url) → state resolved
                                                    ← loader runs → claim.write(state, ReactNode)

if (state.context.rsc) {
  const flight = renderToReadableStream(state.context.rsc);
                                                    ← caller's bundler renders Flight bytes
  // pipe `flight` to HTTP response
}

const ssrJson = serializeRouterState(state, { excludeContext: ["rsc"] });
                                                    ← client hydration JSON, "rsc" stripped

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
        │     └── releases "rsc" namespace
        │
        └── modeClaim.release()
              └── releases "ssrRscMode" namespace
```

All operations are synchronous and infallible. The stale flag in the per-router `WeakMap` is **not** cleared on teardown — markStale entries are GC'd along with the router.

## Validation

`validateLoaders(loaders)` runs at factory call time (before `PluginFactory` is returned):

| Check          | Rule                          |
| -------------- | ----------------------------- |
| Top-level type | Must be non-null object       |
| Values         | Each value must be a function |

Throws `TypeError` with `[@real-router/rsc-server-plugin]` prefix on violation.

Factory-time validation checks the `loaders` object. Plugin-registration-time validation (in the compilation loop) checks that each factory returns a function. Loader return values (any `ReactNode` — element, fragment, null, string, etc.) are written as-is to `state.context.rsc` via `claim.write()`.

## Design Decisions

### Claim-based API for `state.context.rsc`

- `api.claimContextNamespace("rsc")` ensures exclusive ownership — no other plugin can write to the same namespace
- `claim.write(state, node)` writes the ReactNode directly to `state.context.rsc`
- The ReactNode lives on the state object itself — no external store
- `claim.release()` on teardown frees the namespace
- Module augmentation on `@real-router/types` provides type safety: `state.context.rsc?: ReactNode`

### Sync return allowed

`RscLoaderFn = (params) => Promise<ReactNode> | ReactNode` — many Server Components are pure, synchronous functions. Forcing `async` would be ceremonial. `claim.write(state, await loader(...))` correctly handles both cases (`await` on a non-Promise resolves synchronously).

### Prototype safety via `Object.entries`

Same as `ssr-data-plugin`: `Object.entries(loaders)` at compilation time only iterates own enumerable properties. `compiledLoaders.get(state.name)` at runtime looks up only compiled entries. Inherited prototype keys (e.g. `toString`) cannot be triggered as loaders.

### Error-safe compilation

The compilation loop is wrapped in `try/catch`. If any loader factory throws, or if the returned value is not a function:

- `claim.release()` is called to free the `"rsc"` namespace
- The error is re-thrown to the `usePlugin()` caller
- No interceptor is registered (it runs after the loop)

This prevents permanently blocking the namespace when a factory has a bug.

### No bundler dependency

The plugin imports only:

- `@real-router/core/api` (peer)
- `@real-router/types` (regular dep — module augmentation target)
- `react` (peer, type-only `ReactNode` import)

The Flight renderer is **never** imported. The caller chooses
`@vitejs/plugin-rsc/rsc`, `react-server-dom-webpack/server.edge`,
`react-server-dom-turbopack/...`, `react-server-dom-parcel/...`, etc.

### DI access via `getDependency`

Loader factories follow the same DI pattern as `GuardFnFactory` / `LifecycleHookFactory` / `DataLoaderFnFactory`:

```typescript
const loaders: RscLoaderFactoryMap = {
  "users.profile": (router, getDependency) => async (params) => {
    const db = getDependency("db");
    const user = await db.users.findById(params.id);
    return <UserProfile user={user} />;
  },
};
```

Factory receives `(router, getDependency)` once at `usePlugin()` time. The returned loader is cached in a `Map` and reused on every `start()` call.

## Stress Test Coverage

Per-request isolation under concurrency: 500 parallel `cloneRouter` → `usePlugin` → `start(/users/{i})` → `state.context.rsc` → `dispose()` cycles. Each request must receive its own ReactNode — no cross-request leakage.

Additional stress suites cover error handling (failing/throwing loaders), slow loaders, and full lifecycle churn — symmetric copies of `ssr-data-plugin/tests/stress/*`.

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/CLAUDE.md](../core/CLAUDE.md) — Core architecture (Plugin API, addInterceptor)
- [ssr-data-plugin/ARCHITECTURE.md](../ssr-data-plugin/ARCHITECTURE.md) — Sibling plugin (plain JSON data)
- [.claude/rfc-rsc-server-plugin.md](../../.claude/rfc-rsc-server-plugin.md) — Full design RFC including Variant A vs B evidence
