# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/browser-plugin` synchronizes router state with the browser URL and handles back/forward navigation using the History API (`pushState`/`replaceState`).

**Core role:** A thin adapter between the browser environment and the platform-agnostic router core.
Contains no navigation business logic — only URL synchronization and browser event handling.

**Integration points with the core:**

- `addInterceptor("start", ...)` — makes `path` in `router.start()` optional
- `extendRouter()` — formally registers `buildUrl`, `matchUrl`, `replaceHistoryState` on the router instance with conflict detection and automatic cleanup
- `declare module "@real-router/core"` — adds compile-time types for the above methods to the `Router` interface
- Plugin hooks (`onStart`, `onStop`, `onTransitionSuccess`, `teardown`) — react to router events

## Package Structure

```
browser-plugin/
├── src/
│   ├── index.ts           — Public API + module augmentation
│   ├── factory.ts         — browserPluginFactory (validation, normalization, instance creation)
│   ├── plugin.ts          — BrowserPlugin class (runtime behavior)
│   ├── types.ts           — Types (BrowserPluginOptions)
│   ├── url-utils.ts       — Pure URL utility functions (extractPath, buildUrl, urlToPath)
│   ├── validation.ts      — Options validation (delegates to browser-env)
│   └── constants.ts       — Constants (defaultOptions, source, LOGGER_CONTEXT)
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── plugin.ts
            │       ├── url-utils.ts
            │       │       └── constants.ts
            │       └── browser-env (shared abstractions)
            ├── validation.ts
            │       └── constants.ts
            ├── constants.ts
            └── url-utils.ts

types.ts  ← imported by factory.ts, plugin.ts, validation.ts
```

External dependencies:

| Dependency          | What it provides                                                        | Used in                                                    |
| ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `@real-router/core` | `getPluginApi`, types (`Router`, `PluginApi`, `State`, etc.)            | `factory.ts`, `plugin.ts`, `index.ts`                      |
| `browser-env`       | Browser abstraction, popstate handling, validation, URL parsing helpers | `factory.ts`, `plugin.ts`, `validation.ts`, `url-utils.ts` |
| `type-guards`       | `isStateStrict` (`history.state` validation)                            | `index.ts` (re-exported as `isState`)                      |

## Factory + Class Pattern

### Separation of Concerns

`browserPluginFactory()` in `factory.ts` and `BrowserPlugin` in `plugin.ts` are intentionally separate:

```
browserPluginFactory(opts?, browser?)   ← factory.ts
        │
        │  Runs once on call:
        │  - validateOptions()
        │  - base path normalization (normalizeBase from browser-env)
        │  - createSafeBrowser() if no browser provided
        │  - transitionOptions construction
        │  - SharedFactoryState creation
        │
        └── returns PluginFactory (closure)
                │
                │  Called by the router on router.usePlugin():
                │
                └── new BrowserPlugin(router, api, options, browser, ...)
                            │
                            │  Constructor:
                            │  - registers start interceptor (via browser-env)
                            │  - calls api.extendRouter({buildUrl, matchUrl, replaceHistoryState})
                            │  - creates popstate handler and lifecycle (via browser-env)
                            │
                            └── .getPlugin()  → Plugin { onStart, onStop, ... }
```

**Why this split instead of a single object?**

- `factory.ts` runs once — expensive operations (validation, browser creation) don't repeat on every `usePlugin()` call
- `BrowserPlugin` wires together browser-env helpers with plugin-specific URL logic — a class encapsulates the setup cleanly
- Testability: `BrowserPlugin` can be instantiated directly with mock `Browser` and `PluginApi` objects
- Lifecycle: the constructor registers the interceptor and extends the router via `api.extendRouter()`; `teardown` calls the returned unsubscribe to remove extensions

### Creation Flow

```typescript
// factory.ts
export function browserPluginFactory(opts?, browser?): PluginFactory {
  validateOptions(opts);
  const options = { ...defaultOptions, ...opts };
  options.base = normalizeBase(options.base);

  const resolvedBrowser =
    browser ??
    createSafeBrowser(
      () =>
        safelyEncodePath(
          extractPath(globalThis.location.pathname, options.base),
        ) + globalThis.location.search,
      "browser-plugin",
    );

  const transitionOptions = { forceDeactivate, source, replace: true };
  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function browserPlugin(routerBase) {
    const plugin = new BrowserPlugin(
      routerBase,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}
```

## Browser API Abstraction

The `Browser` interface, `createSafeBrowser()`, `createFallbackBrowser()`, `safelyEncodePath()`, and all SSR fallback logic live in the private `browser-env` package — shared between `browser-plugin` and `hash-plugin`.

See [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) for details on the Browser interface and its two implementations.

**Key points for browser-plugin:**

- `browserPluginFactory(opts, browser)` accepts an optional `browser` argument for DI / testing
- If not provided, `createSafeBrowser()` from `browser-env` is called once during factory creation
- The `getLocation` callback passed to `createSafeBrowser` uses `extractPath(pathname, base)` + `safelyEncodePath()` — plugin-specific URL logic
- Tests pass a mock `Browser` object directly — no need to mock globals

## Start Interceptor Integration

### The Problem

`router.start(path)` in the core requires `path` as a mandatory argument — the core is platform-agnostic and knows nothing about the browser.
The plugin needs to make `path` optional without changing the core's signature.

### Solution: addInterceptor

```typescript
// plugin.ts constructor
this.#removeStartInterceptor = createStartInterceptor(api, browser);
```

`createStartInterceptor` from `browser-env` registers an interceptor that intercepts calls to `router.start(path?)`.
If `path` is not provided, it substitutes the current browser URL via `browser.getLocation()`.
If provided, it passes it through as-is.

**Why not monkey-patching?**

- `addInterceptor` is an official core API designed for plugins
- Interceptors execute in FIFO order; multiple plugins can intercept the same method
- `#removeStartInterceptor` stores the unsubscribe function — called in `teardown`

## Router Augmentation

### Two layers

Router extension involves two layers:

1. **Compile-time types** — `declare module "@real-router/core"` in `index.ts` augments the `Router` interface so TypeScript knows about the new methods.
2. **Runtime registration** — `api.extendRouter({...})` in `plugin.ts` adds the actual methods to the router instance with conflict detection and automatic cleanup.

### Type Augmentation (index.ts)

TypeScript allows extending existing interfaces via `declare module`. The plugin adds methods to the `Router` interface from the core:

```typescript
// index.ts, lines 20-46
declare module "@real-router/core" {
  interface Router {
    buildUrl: (name: string, params?: Params) => string;
    matchUrl: (url: string) => State | undefined;
    replaceHistoryState: (
      name: string,
      params?: Params,
      title?: string,
    ) => void;
    start(path?: string): Promise<State>; // overload — makes path optional
  }
}
```

### Runtime Registration via extendRouter (plugin.ts)

TypeScript augmentation is type-level only. The actual methods are registered in the `BrowserPlugin` constructor via `api.extendRouter()`:

```typescript
// plugin.ts, constructor
this.#removeExtensions = api.extendRouter({
  buildUrl: pluginBuildUrl, // buildPath() + buildUrl(path, base)
  matchUrl: (url: string) => {
    const path = urlToPath(url, options.base);
    return path ? api.matchPath(path) : undefined;
  },
  replaceHistoryState: createReplaceHistoryState(
    api,
    router,
    browser,
    pluginBuildUrl,
  ),
});
```

`createReplaceHistoryState` from `browser-env` creates the `replaceHistoryState` method — it builds state via `api.buildState`/`api.makeState` and calls `browser.replaceState`.

`extendRouter()` validates that no property with the same name already exists on the router (throws `PLUGIN_CONFLICT` if it does), adds the properties, and returns an unsubscribe function that removes them.

### Cleanup on teardown

Lifecycle hooks (`onStart`, `onStop`, `teardown`) are created by `createPopstateLifecycle` from `browser-env`:

```typescript
// plugin.ts, constructor
this.#lifecycle = createPopstateLifecycle({
  browser,
  shared,
  handler,
  cleanup: () => {
    this.#removeStartInterceptor();
    this.#removeExtensions(); // ← removes buildUrl, matchUrl, replaceHistoryState
  },
});
```

`teardown` removes the popstate listener, then calls the `cleanup` callback which unregisters the start interceptor and router extensions.

As a safety net, `router.dispose()` also cleans up any extensions that plugins failed to remove in their `teardown`.

**Why not Proxy?**

`Router` uses private fields (`#state`, `#routes`, etc.) — they're inaccessible through a `Proxy`.
Adding methods directly to the instance is the only way to give them access to the plugin's closure.

## Type System

### BrowserPluginOptions

```typescript
// types.ts
interface BrowserPluginOptions {
  forceDeactivate?: boolean;
  base?: string;
}
```

Options are validated at runtime via `validateOptions()` in `validation.ts`, which delegates to `createOptionsValidator` from `browser-env`.

Pure functions in `url-utils.ts` accept `base: string` directly rather than the full options object — the calling code in `plugin.ts` already works with validated `Required<BrowserPluginOptions>` and passes the specific values needed.

Types shared between browser-plugin and hash-plugin (`Browser`, `SharedFactoryState`, etc.) live in `browser-env`.

## SharedFactoryState

`SharedFactoryState` is defined in `browser-env` and shared between browser-plugin and hash-plugin:

```typescript
interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
```

The `shared` object is created once in `browserPluginFactory()` and passed to `createPopstateLifecycle` from `browser-env`.

**Why is it needed?**

The factory may be called again — for example, during hot module replacement (HMR) or when reusing the factory with different routers.
Each new plugin instance registers its own popstate listener in `onStart`. Without `shared`, the previous listener would remain in memory.

`shared` is intentionally mutable. It's the only shared state between instances of the same factory.

## Data Flow: Navigation

```
router.navigate(name, params, opts)
        │
        ▼
  Transition completed successfully
        │
        ▼
  Plugin.onTransitionSuccess(toState, fromState, navOptions)
        │
        ├── shouldReplaceHistory(navOptions, toState, fromState, router)
        │     (from browser-env: replace ?? !fromState || reload && statesEqual)
        │
        ├── url = router.buildUrl(toState.name, toState.params)
        │         └── router.buildPath() + buildUrl(path, base)
        │
        ├── If paths match (hash preservation):
        │     finalUrl = url + browser.getHash()
        │
        └── updateBrowserState(toState, finalUrl, shouldReplace, browser)
                  │
                  ├── Create historyState = { meta, name, params, path }
                  └── browser.pushState() or browser.replaceState()
```

## Data Flow: popstate (back/forward buttons)

Popstate handling is fully delegated to `browser-env` via `createPopstateHandler` + `createPopstateLifecycle`. The flow is identical for browser-plugin and hash-plugin:

```
User clicks back or forward
        │
        ▼
  browser.addPopstateListener → handler(evt)  (from createPopstateHandler)
        │
        ├── isTransitioning === true?
        │     YES: deferredPopstateEvent = evt  (last-write-wins)
        │          return
        │
        ├── isTransitioning = true
        │
        ├── getRouteFromEvent(evt, api, browser)
        │     │
        │     ├── isState(evt.state)?
        │     │     YES: { name: evt.state.name, params: evt.state.params }
        │     │
        │     └── NO: api.matchPath(browser.getLocation())
        │               └── URL matching as fallback
        │
        ├── route found?
        │     YES: await router.navigate(route.name, route.params, transitionOptions)
        │     NO:  await router.navigateToDefault({ ...transitionOptions, reload: true, replace: true })
        │
        ├── catch (error):
        │     error instanceof RouterError? → ignore (CANNOT_DEACTIVATE, etc.)
        │     otherwise: recoverFromCriticalError(error)
        │               └── browser.replaceState(currentState, buildUrl(...))
        │
        └── finally:
              isTransitioning = false
              processDeferredEvent()
```

### Deferred popstate Handling

Rapid back/forward clicks generate multiple popstate events in quick succession. Processing each one is pointless — only the final state matters.

The `isTransitioning` flag blocks concurrent processing.
New events are written to `deferredPopstateEvent` — each one overwrites the previous (last-write-wins).
After the current transition completes, `processDeferredEvent()` processes the last deferred event.

```
Click 1 → onPopState → isTransitioning=true → navigate("page1")...
Click 2 → onPopState → isTransitioning=true → deferred = evt2
Click 3 → onPopState → isTransitioning=true → deferred = evt3  (evt2 discarded)
navigate("page1") done → processDeferredEvent → navigate("page3")
```

The intermediate `page2` state is skipped — this is expected behavior.

See [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) for implementation details.

## URL Utilities

### url-utils.ts — pure functions

All functions in `url-utils.ts` are pure (no side effects, no direct access to globals).

**`extractPath(pathname, base)`**:

```
With base:
  pathname = "/app/users/123"
  base = "/app"
  → pathname.slice(base.length) = "/users/123"

Without base:
  → pathname as-is
```

Uses `String.startsWith()` + `String.slice()` — no regex needed for history mode base stripping.

**`urlToPath(url, base)`**:

Delegates URL parsing to `safeParseUrl` from `browser-env` (validates protocol, handles errors).
Returns `null` for invalid URLs — calling code handles `null` explicitly.

**`buildUrl(path, base)`**:

Simple concatenation: `base + path`.

## Popstate Utilities, Error Recovery

Popstate event handling (`getRouteFromEvent`, `updateBrowserState`), critical error recovery, and deferred event processing all live in `browser-env` — shared between browser-plugin and hash-plugin.

See [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) for details on:

- Route extraction from popstate events (history.state validation → URL matching fallback)
- `historyState` as a subset of `State` (only `meta`, `name`, `params`, `path` stored in `history.state`)
- Error categorization (RouterError = expected, anything else = critical recovery via `replaceState`)

## Options Validation

`validation.ts` delegates to `createOptionsValidator` from `browser-env`. The validator iterates over the keys of the provided options, compares `typeof value` against `typeof defaultOptions[key]`.
On mismatch — throws a plain `Error` with a descriptive message (e.g., `[browser-plugin] Invalid type for 'base': expected string, got number`).

## Plugin Lifecycle

```
router.usePlugin(browserPluginFactory(opts))
        │
        ▼
  browserPlugin(router)  ← called by the core
        │
        ├── new BrowserPlugin(...)
        │     ├── Registers start interceptor
        │     └── api.extendRouter({buildUrl, matchUrl, replaceHistoryState})
        │           → stores returned unsubscribe as #removeExtensions
        │
        └── plugin.getPlugin() → { onStart, onStop, onTransitionSuccess, teardown }

router.start()
        │
        ▼
  Plugin.onStart()
        ├── Removes previous popstate listener (if any)
        └── Registers new popstate listener

router.navigate() → success
        │
        ▼
  Plugin.onTransitionSuccess()
        └── pushState / replaceState

router.stop()
        │
        ▼
  Plugin.onStop()
        └── Removes popstate listener

unsubscribe() or router.dispose()
        │
        ▼
  Plugin.teardown()
        ├── Removes popstate listener
        ├── Unregisters start interceptor (#removeStartInterceptor)
        └── Removes router extensions (#removeExtensions)
```

## History Mode

```
URL: https://example.com/app/users/123

base = "/app"

buildUrl("users.profile", { id: "123" })
  → buildPath() = "/users/123"
  → buildUrl("/users/123", "/app") = "/app/users/123"

extractPath("/app/users/123", { base: "/app" })
  → "/users/123"
```

Requires a server-side fallback (all paths → `index.html`).

### Hash Fragment Preservation

```typescript
// plugin.ts
const shouldPreserveHash = !fromState || fromState.path === toState.path;

const finalUrl = shouldPreserveHash ? url + this.#browser.getHash() : url;
```

The hash fragment (`#section`) is always preserved when navigating to the same path (or on first navigation). On a route change, the hash is cleared.

## Performance

| Optimization                        | Location       | Effect                                                |
| ----------------------------------- | -------------- | ----------------------------------------------------- |
| `String.startsWith` + `slice`       | `url-utils.ts` | No regex needed for base path stripping               |
| `isTransitioning` flag              | `browser-env`  | Blocks concurrent popstate processing without a queue |
| Last-write-wins for deferred events | `browser-env`  | Intermediate states are skipped without accumulation  |
| `historyState` as a subset of State | `browser-env`  | Less data stored in `history.state`                   |
| `createSafeBrowser()` called once   | `factory.ts`   | Environment check doesn't repeat                      |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents
