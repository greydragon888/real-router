# @real-router/preload-plugin

> Trigger data preloading on navigation intent (hover, touch)

## Exports

| Export                   | Kind     | Description                                                  |
| ------------------------ | -------- | ------------------------------------------------------------ |
| `preloadPluginFactory`   | function | Plugin factory — pass to `router.usePlugin()`                |
| `PreloadPluginOptions`   | type     | Configuration options (`delay`, `networkAware`)              |
| `PreloadFn`              | type     | Compiled preload signature: `({ params, search }) => Promise<unknown>` (RFC-4 M2 / #1548) |
| `PreloadTarget`          | type     | `{ params, search }` — the two destination channels handed to a preload fn |
| `PreloadFnFactory`       | type     | Factory signature: `(router, getDependency) => PreloadFn`    |

## How It Works

1. Listens on `document` in capture phase for `mouseover`, `touchstart`, `touchmove`
2. On `mouseover`: finds the closest `<a href>` ancestor, debounces by `delay` ms
3. On `touchstart`: finds the anchor, starts a `TOUCH_PRELOAD_DELAY` (100ms) timer
4. On `touchmove`: cancels the touch timer if vertical scroll > `TOUCH_SCROLL_THRESHOLD` (10px)
5. On timer fire: calls `router.matchUrl?.(anchor.href)` → `api.getRouteConfig(name)?.preload`
6. Calls `preload({ params, search })` as fire-and-forget; errors silently caught (async rejection, synchronous throw, or non-Promise return)

Ghost mouse event suppression: touch devices fire a synthetic `mouseover` after `touchstart`. The plugin records the last touch target/timestamp and suppresses any `mouseover` from the same target within 2500ms.

## Options

| Option         | Type      | Default | Description                                                  |
| -------------- | --------- | ------- | ------------------------------------------------------------ |
| `delay`        | `number`  | `65`    | Hover debounce delay in ms before triggering preload         |
| `networkAware` | `boolean` | `true`  | Skip preload when `navigator.connection.saveData` or 2g/slow-2g |

## Module Structure

```
src/
├── types.ts      — PreloadPluginOptions interface
├── constants.ts  — defaultOptions, GHOST_EVENT_THRESHOLD, TOUCH_SCROLL_THRESHOLD, TOUCH_PRELOAD_DELAY
├── network.ts    — isSlowConnection() utility
├── plugin.ts     — PreloadPlugin class (event handlers, timer management, resolvePreload)
├── factory.ts    — preloadPluginFactory (SSR guard, options merge, instantiation)
└── index.ts      — Public exports + Route/Router module augmentation
```

## Gotchas

### Pre-resolved State cache + `router.getPreloadedState(href)` (#562)

When hover/touch resolves an anchor's URL, the resulting `State` is cached by `href` in a small bounded `Map` (limit 32, insertion-order eviction). Consumers can read it via `router.getPreloadedState(href)` with **single-use** (delete-on-read) semantics — once consumed, re-hover repopulates.

Intended consumer pattern: a custom `<FastLink>` wrapper reads the cached State on click and commits it via `getPluginApi(router).navigateToState(state, { replace: false })`, skipping the `forwardState` + `buildPath` round-trip in `buildNavigateState`. Snapshot semantics (matches `memory-plugin` post-#561 and URL plugins post-#525): activation guards still run; `buildPath` interceptors do not.

The cache is also populated when a hovered route has no `preload` factory — the State is still useful for fast navigation. The 32-entry bound covers viewport-visible link counts; oldest evicted on overflow, re-hovering same `href` refreshes recency.

Cache cleared on `onStop` and `teardown` (via `#cleanup`), and also on **any structural tree mutation** (`add`/`update`/`remove`/`replace`/`clear` via the `TREE_CHANGED` subscription) — otherwise `getPreloadedState(href)` could hand a consumer a `State` built with stale resolution: a removed route that no longer exists, an `update` that changed `forwardTo`/`defaultParams`, or an `add` that intercepts an already-cached href. `navigateToState` would then commit the stale snapshot. The cache is href-keyed (not name-keyed) and has no lazy revalidation path (it is read externally), so it is cleared wholesale on any structural mutation and repopulates on the next hover (#805). The extension is removed in `teardown`.

### Fire-and-forget

`preload({ params, search })` is called without awaiting, through `#runPreload`. Return values and errors are discarded — and "errors" means all three escape modes: a rejected promise, a **synchronous throw** before the promise is created, and a **non-Promise return** (`#runPreload` guards the sync call with `try/catch` and normalizes the return via `Promise.resolve` before `.catch`). Without this, a misbehaving user `preload` fn would surface as an `uncaughtException` from the `setTimeout` callback with no user code in the stack (#806). The plugin is a transport layer only — it does not cache, deduplicate, or track preload status.

### Event delegation

All three listeners attach to `document` with `{ capture: true, passive: true }`. No per-anchor DOM manipulation required.

### browser-plugin dependency is duck-typed

`router.matchUrl` is added by `@real-router/browser-plugin`. The preload plugin uses optional chaining (`router.matchUrl?.()`) so it degrades gracefully without the browser plugin — preloads simply never fire.

### SSR safety

The factory function checks `typeof document === "undefined"` before instantiating `PreloadPlugin`. Returns `{}` (empty plugin) on the server, so `router.usePlugin(preloadPluginFactory())` is safe in SSR contexts.

### Preload function caching

`#compiledPreloads` caches compiled preload functions by `state.name`. The `PreloadFnFactory(router, getDependency)` call happens at most once per route name for the lifetime of the plugin instance. **Config-change invalidation is lazy:** on the next hover/touch, `#resolvePreload` re-reads `getRouteConfig` and recompiles when the `factory` reference differs (so `update`/`replace` that swap the factory are picked up automatically). If the factory throws, the result is not cached and the factory is retried on next hover/touch.

**Removed-route cleanup (TREE_CHANGED):** the plugin subscribes to `getRoutesApi(router).subscribeChanges()` and deletes `#compiledPreloads` entries for routes removed via `remove`/`replace`, and clears the whole map on `clear`. Without this, those entries would be unreachable dead memory until teardown (`matchUrl` never resolves a removed route, so the lazy path can't reclaim them). `add`/`update` need no `#compiledPreloads` handling — lazy revalidation covers them. (The href-keyed `#stateCache` is different: it has no lazy path, so the same `TREE_CHANGED` handler clears it wholesale on **every** structural op — see the State-cache gotcha above, #805.)

### Module augmentation

`Route.preload`, `RouteConfigUpdate.preload` (`| null`), `Router.getPreloadSettings`, and `Router.getPreloadedState` are declared in `index.ts`. The `RouteConfigUpdate` augmentation makes `preload` patchable via `getRoutesApi(router).update(name, { preload })` (#797) — picked up lazily on the next hover/touch. Import the package to get autocomplete for route definitions, update patches, and both router methods. `getPreloadedState` is typed as optional — it is only present while the plugin is active.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [packages/browser-plugin/CLAUDE.md](../browser-plugin/CLAUDE.md) — Provides `router.matchUrl`
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — How plugins integrate with the router
