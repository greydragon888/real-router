# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/hash-plugin` synchronizes router state with the browser URL using hash-based routing (`#/path`). All routing information lives in the URL hash fragment — no server configuration needed.

**Core role:** A thin adapter between the browser hash and the platform-agnostic router core.
Contains no navigation business logic — only hash URL synchronization and browser event handling.

**Integration points with the core:**

- `addInterceptor("start", ...)` — makes `path` in `router.start()` optional
- `extendRouter()` — formally registers `buildUrl`, `matchUrl`, `replaceHistoryState` on the router instance with conflict detection and automatic cleanup
- `declare module "@real-router/core"` — adds compile-time types for the above methods to the `Router` interface
- Plugin hooks (`onStart`, `onStop`, `onTransitionSuccess`, `teardown`) — react to router events

## Package Structure

```
hash-plugin/
├── src/
│   ├── index.ts           — Public API + module augmentation
│   ├── factory.ts         — hashPluginFactory (validation, normalization, instance creation)
│   ├── plugin.ts          — HashPlugin class (runtime behavior)
│   ├── types.ts           — Types (HashPluginOptions)
│   ├── hash-utils.ts      — Hash URL utility functions (extractHashPath, hashUrlToPath, RegExpCache)
│   ├── validation.ts      — Options validation (delegates to browser-env)
│   └── constants.ts       — Constants (defaultOptions, source, LOGGER_CONTEXT)
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── plugin.ts
            │       ├── hash-utils.ts
            │       │       └── constants.ts
            │       └── browser-env (shared abstractions)
            ├── validation.ts
            │       └── constants.ts
            ├── constants.ts
            └── hash-utils.ts

types.ts  ← imported by factory.ts, plugin.ts, validation.ts
```

External dependencies:

| Dependency          | What it provides                                                        | Used in                                                     |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `@real-router/core` | `getPluginApi`, types (`Router`, `PluginApi`, `State`, etc.)            | `factory.ts`, `plugin.ts`, `index.ts`                       |
| `browser-env`       | Browser abstraction, popstate handling, validation, URL parsing helpers | `factory.ts`, `plugin.ts`, `validation.ts`, `hash-utils.ts` |
| `type-guards`       | `isStateStrict` (`history.state` validation)                            | `index.ts` (re-exported as `isState`)                       |

## Factory + Class Pattern

### Separation of Concerns

`hashPluginFactory()` in `factory.ts` and `HashPlugin` in `plugin.ts` are intentionally separate:

```
hashPluginFactory(opts?, browser?)   ← factory.ts
        │
        │  Runs once on call:
        │  - validateOptions()
        │  - base path normalization (normalizeBase from browser-env)
        │  - createRegExpCache() for hash prefix patterns
        │  - createSafeBrowser() if no browser provided
        │  - transitionOptions construction
        │  - SharedFactoryState creation
        │
        └── returns PluginFactory (closure)
                │
                │  Called by the router on router.usePlugin():
                │
                └── new HashPlugin(router, api, options, browser, regExpCache, ...)
                            │
                            │  Constructor:
                            │  - registers start interceptor (via browser-env)
                            │  - calls api.extendRouter({buildUrl, matchUrl, replaceHistoryState})
                            │  - creates popstate handler and lifecycle (via browser-env)
                            │
                            └── .getPlugin()  → Plugin { onStart, onStop, ... }
```

**Why this split instead of a single object?**

- `factory.ts` runs once — expensive operations (validation, cache creation, browser detection) don't repeat on every `usePlugin()` call
- `HashPlugin` wires together browser-env helpers with hash-specific URL logic — a class encapsulates the setup cleanly
- Testability: `HashPlugin` can be instantiated directly with mock `Browser` and `PluginApi` objects
- Lifecycle: the constructor registers the interceptor and extends the router via `api.extendRouter()`; `teardown` calls the returned unsubscribe to remove extensions

### Creation Flow

```typescript
// factory.ts
export function hashPluginFactory(opts?, browser?): PluginFactory {
  validateOptions(opts);
  const options = { ...defaultOptions, ...opts };
  options.base = normalizeBase(options.base);

  const regExpCache = createRegExpCache();
  const resolvedBrowser =
    browser ??
    createSafeBrowser(
      () =>
        safelyEncodePath(
          extractHashPath(
            globalThis.location.hash,
            options.hashPrefix,
            regExpCache,
          ),
        ) + globalThis.location.search,
      "hash-plugin",
    );

  const transitionOptions = { forceDeactivate, source, replace: true };
  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function hashPlugin(routerBase) {
    const plugin = new HashPlugin(
      routerBase,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      regExpCache,
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

**Key points for hash-plugin:**

- `hashPluginFactory(opts, browser)` accepts an optional `browser` argument for DI / testing
- If not provided, `createSafeBrowser()` from `browser-env` is called once during factory creation
- The `getLocation` callback passed to `createSafeBrowser` uses `extractHashPath(hash, hashPrefix, regExpCache)` + `safelyEncodePath()` — plugin-specific hash URL logic
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
// index.ts
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

TypeScript augmentation is type-level only. The actual methods are registered in the `HashPlugin` constructor via `api.extendRouter()`:

```typescript
// plugin.ts, constructor
this.#removeExtensions = api.extendRouter({
  buildUrl: pluginBuildUrl, // buildPath() + base + "#" + hashPrefix + path
  matchUrl: (url: string) => {
    const path = hashUrlToPath(url, options.hashPrefix, regExpCache);
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

### HashPluginOptions

```typescript
// types.ts
interface HashPluginOptions {
  hashPrefix?: string;
  base?: string;
  forceDeactivate?: boolean;
}
```

Options are validated at runtime via `validateOptions()` in `validation.ts`, which delegates to `createOptionsValidator` from `browser-env`.

Types shared between browser-plugin and hash-plugin (`Browser`, `SharedFactoryState`, etc.) live in `browser-env`.

## SharedFactoryState

`SharedFactoryState` is defined in `browser-env` and shared between browser-plugin and hash-plugin:

```typescript
interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
```

The `shared` object is created once in `hashPluginFactory()` and passed to `createPopstateLifecycle` from `browser-env`.

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
        │         └── router.buildPath() + base + "#" + hashPrefix + path
        │
        └── updateBrowserState(toState, url, shouldReplace, browser)
                  │
                  ├── Create historyState = { meta, name, params, path }
                  └── browser.pushState() or browser.replaceState()
```

**Note:** Unlike browser-plugin, hash-plugin does NOT preserve hash fragments (the hash IS the route).

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
        │               └── Hash URL matching as fallback
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

See [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) for implementation details.

## Hash Utilities

### hash-utils.ts

Hash-specific URL functions. Unlike browser-plugin (which uses simple `String.slice`), hash-plugin needs regex for prefix stripping.

**`extractHashPath(hash, hashPrefix, regExpCache)`**:

```
Hash without prefix:
  hash = "#/users/123"
  hashPrefix = ""
  → hash.slice(1) = "/users/123"

Hash with prefix:
  hash = "#!/users/123"
  hashPrefix = "!"
  → escapeRegExp("!") = "\\!"
  → hash.replace(/^#\\!/, "") = "/users/123"

Empty hash:
  → "/"
```

**`hashUrlToPath(url, hashPrefix, regExpCache)`**:

Delegates URL parsing to `safeParseUrl` from `browser-env` (validates protocol, handles errors).
Returns `null` for invalid URLs — calling code handles `null` explicitly.

**`escapeRegExp(str)`**:

Escapes regex-special characters in `hashPrefix`. Results are cached in a module-level `Map`.

### RegExp Caching

```typescript
// hash-utils.ts
const escapeRegExpCache = new Map<string, string>(); // module-level singleton

export function createRegExpCache(): RegExpCache {
  const cache = new Map<string, RegExp>();
  return {
    get(pattern: string): RegExp {
      // lazy RegExp creation by pattern
    },
  };
}
```

Two levels of caching:

1. `escapeRegExpCache` — module-level singleton, caches `escapeRegExp()` results. Hash prefix strings are escaped once for the lifetime of the module.
2. `RegExpCache` — per-factory instance, created in `hashPluginFactory()`. Caches compiled `RegExp` objects by pattern. One `RegExp` per pattern — not recreated on every `extractHashPath()` call.

**Why two caches?** `escapeRegExpCache` is global because string escaping doesn't depend on plugin configuration.
`RegExpCache` is per-factory because patterns depend on the `hashPrefix` of a specific instance.

## Popstate Utilities, Error Recovery

Popstate event handling (`getRouteFromEvent`, `updateBrowserState`), critical error recovery, and deferred event processing all live in `browser-env` — shared between browser-plugin and hash-plugin.

See [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) for details on:

- Route extraction from popstate events (history.state validation → URL matching fallback)
- `historyState` as a subset of `State` (only `meta`, `name`, `params`, `path` stored in `history.state`)
- Error categorization (RouterError = expected, anything else = critical recovery via `replaceState`)

## Options Validation

`validation.ts` delegates to `createOptionsValidator` from `browser-env`. The validator iterates over the keys of the provided options, compares `typeof value` against `typeof defaultOptions[key]`.
On mismatch — throws `Error` with a descriptive message (`[hash-plugin] Invalid type for '${key}': expected ${expected}, got ${actual}`).

## Plugin Lifecycle

```
router.usePlugin(hashPluginFactory(opts))
        │
        ▼
  hashPlugin(router)  ← called by the core
        │
        ├── new HashPlugin(...)
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

## Hash Mode

```
URL: https://example.com/#!/users/123

hashPrefix = "!"
base = ""

buildUrl("users.profile", { id: "123" })
  → buildPath() = "/users/123"
  → base + "#" + hashPrefix + path = "#!/users/123"

extractHashPath("#!/users/123", "!", regExpCache)
  → hash.replace(/^#\\!/, "") = "/users/123"
```

No server configuration needed — all routing lives in the hash.

### With base path

```
URL: https://example.com/app#!/users/123

hashPrefix = "!"
base = "/app"

buildUrl("users.profile", { id: "123" })
  → "/app#!/users/123"
```

`base` is prepended before the hash fragment. Useful when the app is served from a subpath.

## Performance

| Optimization                           | Location        | Effect                                                |
| -------------------------------------- | --------------- | ----------------------------------------------------- |
| `escapeRegExpCache` (module-level Map) | `hash-utils.ts` | String escaping happens once per module lifetime      |
| `RegExpCache` (per-factory Map)        | `hash-utils.ts` | RegExp compilation happens once per pattern           |
| `isTransitioning` flag                 | `browser-env`   | Blocks concurrent popstate processing without a queue |
| Last-write-wins for deferred events    | `browser-env`   | Intermediate states are skipped without accumulation  |
| `historyState` as a subset of State    | `browser-env`   | Less data stored in `history.state`                   |
| `createSafeBrowser()` called once      | `factory.ts`    | Environment check doesn't repeat                      |

## Differences from browser-plugin

| Aspect             | browser-plugin                             | hash-plugin                             |
| ------------------ | ------------------------------------------ | --------------------------------------- |
| URL format         | `/app/users/123`                           | `#!/users/123`                          |
| Path extraction    | `String.startsWith` + `slice`              | RegExp with cached `escapeRegExp`       |
| Hash preservation  | Preserves hash when paths match            | N/A — hash IS the route                 |
| RegExpCache        | Not needed                                 | Per-factory, caches compiled patterns   |
| Server config      | Requires fallback (all paths → index.html) | No server config needed                 |
| `buildUrl` formula | `base + path`                              | `base + "#" + hashPrefix + path`        |
| Options            | `forceDeactivate`, `base`                  | `forceDeactivate`, `base`, `hashPrefix` |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) — Shared browser abstractions
- [browser-plugin/ARCHITECTURE.md](../browser-plugin/ARCHITECTURE.md) — History API plugin (sibling)
- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents
