# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/browser-plugin` synchronizes router state with the browser URL and handles back/forward navigation.
The plugin supports two modes: History API (`pushState`/`replaceState`) and hash routing (`#/path`).

**Core role:** A thin adapter between the browser environment and the platform-agnostic router core.
Contains no navigation business logic — only URL synchronization and browser event handling.

**Integration points with the core:**

- `addInterceptor("start", ...)` — makes `path` in `router.start()` optional
- `declare module "@real-router/core"` — adds `buildUrl`, `matchUrl`, `replaceHistoryState` methods to the `Router` interface
- Plugin hooks (`onStart`, `onStop`, `onTransitionSuccess`, `teardown`) — react to router events

## Package Structure

```
browser-plugin/
├── src/
│   ├── index.ts           — Public API + module augmentation
│   ├── factory.ts         — browserPluginFactory (validation, normalization, instance creation)
│   ├── plugin.ts          — BrowserPlugin class (runtime behavior)
│   ├── browser.ts         — Browser API abstraction (createSafeBrowser, createFallbackBrowser)
│   ├── types.ts           — Types (BrowserPluginOptions, Browser, SharedFactoryState, URLParseOptions)
│   ├── url-utils.ts       — Pure URL utility functions (extractPath, buildUrl, RegExpCache)
│   ├── popstate-utils.ts  — Pure popstate utility functions (getRouteFromEvent, updateBrowserState)
│   ├── validation.ts      — Options validation (validateOptions, validateOptionType)
│   └── constants.ts       — Constants (defaultOptions, source, LOGGER_CONTEXT)
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── plugin.ts
            │       ├── popstate-utils.ts
            │       │       └── types.ts
            │       ├── url-utils.ts
            │       │       └── constants.ts
            │       └── constants.ts
            ├── browser.ts
            │       └── url-utils.ts
            ├── validation.ts
            │       └── constants.ts
            ├── constants.ts
            └── url-utils.ts

types.ts  ← imported by all modules
```

External dependencies:

| Dependency            | What it provides                             | Used in                               |
| --------------------- | -------------------------------------------- | ------------------------------------- |
| `@real-router/core`   | `RouterError`, `getPluginApi`, types         | `factory.ts`, `plugin.ts`, `index.ts` |
| `@real-router/logger` | `logger` singleton                           | `browser.ts`                          |
| `type-guards`         | `isStateStrict` (`history.state` validation) | `popstate-utils.ts`, `index.ts`       |

## Factory + Class Pattern

### Separation of Concerns

`browserPluginFactory()` in `factory.ts` and `BrowserPlugin` in `plugin.ts` are intentionally separate:

```
browserPluginFactory(opts?, browser?)   ← factory.ts
        │
        │  Runs once on call:
        │  - validateOptions()
        │  - base path normalization
        │  - createRegExpCache()
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
                            │  - registers start interceptor
                            │  - calls #augmentRouter()
                            │
                            └── .getPlugin()  → Plugin { onStart, onStop, ... }
```

**Why this split instead of a single object?**

- `factory.ts` runs once — expensive operations (validation, cache creation) don't repeat on every `usePlugin()` call
- `BrowserPlugin` holds mutable state (`#isTransitioning`, `#deferredPopstateEvent`) — a class with private fields fits better than a closure
- Testability: `BrowserPlugin` can be instantiated directly with mock `Browser` and `PluginApi` objects
- Lifecycle: the constructor registers the interceptor and augments the router immediately; `teardown` rolls back the changes

### Creation Flow

```typescript
// factory.ts, lines 33-88
export function browserPluginFactory(opts?, browser = createSafeBrowser()): PluginFactory {
  const hasInvalidTypes = validateOptions(opts, defaultOptions);
  let options = { ...defaultOptions, ...opts } as BrowserPluginOptions;
  // ... normalization ...
  const regExpCache = createRegExpCache();
  const transitionOptions = { source, replace: true, forceDeactivate? };
  const shared: SharedFactoryState = { removePopStateListener: undefined };

  return function browserPlugin(routerBase) {
    const plugin = new BrowserPlugin(
      routerBase,
      getPluginApi(routerBase),
      options,
      browser,
      regExpCache,
      transitionOptions,
      shared
    );

    return plugin.getPlugin();
  };
}
```

## Browser API Abstraction

### Browser Interface

```typescript
// types.ts, lines 140-173
interface Browser {
  pushState: (state: State, path: string) => void;
  replaceState: (state: State, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  getLocation: (opts: BrowserPluginOptions) => string;
  getHash: () => string;
}
```

### Two Implementations

```
createSafeBrowser()                         createFallbackBrowser()
        │                                            │
        │  Checks the environment:                   │  SSR / non-browser:
        │  typeof globalThis.window !== "undefined"  │  - all methods are no-ops
        │  && !!globalThis.history                   │  - warn-once on first call
        │                                            │  - addPopstateListener → NOOP
        ▼                                            ▼
  Real functions:                           Safe stubs:
  - history.pushState()                     - pushState: () => {}
  - history.replaceState()                  - replaceState: () => {}
  - addEventListener("popstate", ...)       - getLocation: () => ""
  - extractPath() + safelyEncodePath()      - getHash: () => ""
```

**Why the abstraction?**

- **SSR safety:** `window`, `history`, and `location` are unavailable on the server. Without the abstraction, any import of the plugin would break SSR.
- **Testability:** tests pass a mock `Browser` object directly to `BrowserPlugin` — no need to mock globals.
- **Dependency injection:** `browserPluginFactory(opts, browser)` accepts `browser` as a second argument — a standard DI pattern.

`createSafeBrowser()` is called once when `browserPluginFactory()` is invoked (line 35 in `factory.ts`).
The result is passed into the closure and then into `BrowserPlugin`.

### safelyEncodePath

`browser.ts`, line 38. Normalizes URL encoding via `encodeURI(decodeURI(path))`.
If the path is already partially encoded, double-encoding won't occur. Parse errors are caught and the original path is returned.

## Start Interceptor Integration

### The Problem

`router.start(path)` in the core requires `path` as a mandatory argument — the core is platform-agnostic and knows nothing about the browser.
The plugin needs to make `path` optional without changing the core's signature.

### Solution: addInterceptor

```typescript
// plugin.ts, lines 65-68
this.#removeStartInterceptor = this.#api.addInterceptor("start", (next, path) =>
  next(path ?? this.#browser.getLocation(this.#options)),
);
```

The interceptor intercepts calls to `router.start(path?)`.
If `path` is not provided, it substitutes the current browser URL via `browser.getLocation()`.
If provided, it passes it through as-is.

**Why not monkey-patching?**

- `addInterceptor` is an official core API designed for plugins
- Interceptors execute in FIFO order; multiple plugins can intercept the same method
- `#removeStartInterceptor` stores the unsubscribe function — called in `#cleanupAugmentation()` on `teardown`

## Router Augmentation via declare module

### Mechanism

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

### Runtime Method Addition

TypeScript augmentation is type-level only. The actual methods are added in the `BrowserPlugin` constructor:

```typescript
// plugin.ts, lines 128-173
#augmentRouter(): void {
  const router = this.#router;

  router.buildUrl = (route, params) => {
    const path = router.buildPath(route, params);
    return buildUrl(path, (this.#options as URLParseOptions).base, this.#prefix);
  };

  router.matchUrl = (url) => {
    const path = urlToPath(url, this.#options as URLParseOptions, this.#regExpCache);
    return path ? this.#api.matchPath(path) : undefined;
  };

  router.replaceHistoryState = (name, params = {}) => {
    // ... buildState + makeState + updateBrowserState
  };
}
```

### Cleanup on teardown

```typescript
// plugin.ts, lines 175-187
#cleanupAugmentation(): void {
  if (this.#shared.removePopStateListener) {
    this.#shared.removePopStateListener();
    this.#shared.removePopStateListener = undefined;
  }

  this.#removeStartInterceptor();

  delete (this.#router as Partial<Router>).buildUrl;
  delete (this.#router as Partial<Router>).matchUrl;
  delete (this.#router as Partial<Router>).replaceHistoryState;
}
```

**Why `delete` instead of assigning `undefined`?**

`delete` fully removes the property from the object — after `teardown`, accessing `router.buildUrl` throws a `TypeError` (property doesn't exist) rather than returning `undefined`.
That's an explicit error, not a silent failure.

**Why not Proxy?**

`Router` uses private fields (`#state`, `#routes`, etc.) — they're inaccessible through a `Proxy`.
Adding methods directly to the instance is the only way to give them access to the plugin's closure.

## Type System: Discriminated Union

### The Problem of Mutually Exclusive Options

`hashPrefix` only makes sense in hash mode. `preserveHash` only makes sense in history mode. Their combined use needs to be forbidden at the type level.

### Solution: discriminated union with never

```typescript
// types.ts, lines 39-98
interface HashModeOptions extends BaseBrowserPluginOptions {
  useHash: true;
  hashPrefix?: string;
  preserveHash?: never; // ← forbidden in hash mode
}

interface HistoryModeOptions extends BaseBrowserPluginOptions {
  useHash?: false;
  preserveHash?: boolean;
  hashPrefix?: never; // ← forbidden in history mode
}

type BrowserPluginOptions = HashModeOptions | HistoryModeOptions;
```

The discriminant is the `useHash` field. TypeScript narrows the type through it:

```typescript
// ❌ Compile error:
const opts: BrowserPluginOptions = { useHash: true, preserveHash: true };
// ✅ Valid:
const opts: BrowserPluginOptions = { useHash: true, hashPrefix: "!" };
```

### DefaultBrowserPluginOptions — flat type for defaults

```typescript
// constants.ts, lines 28-42
interface DefaultBrowserPluginOptions {
  forceDeactivate: boolean;
  useHash: boolean;
  base: string;
  preserveHash: boolean;
  hashPrefix: string;
}
```

You can't create an object of type `BrowserPluginOptions` that contains both `hashPrefix` and `preserveHash` — one of them is always `never`.
That's why a separate flat type `DefaultBrowserPluginOptions` is used to store default values for all options.

It also serves as a schema for validation: `validateOptions()` iterates over the keys of `defaultOptions` and checks types via `typeof defaultOptions[key]`.

### URLParseOptions — flat type for pure functions

```typescript
// types.ts, lines 181-185
interface URLParseOptions {
  readonly useHash: boolean;
  readonly base: string;
  readonly hashPrefix: string;
}
```

Pure functions in `url-utils.ts` and `popstate-utils.ts` accept `URLParseOptions` rather than `BrowserPluginOptions`.
The reason: calling code in `plugin.ts` already works with validated options and passes correct values.
The flat type is simpler to use inside pure functions — no need to handle discriminated union branches.

## SharedFactoryState

```typescript
// types.ts, lines 195-197
interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
```

The `shared` object is created once in `browserPluginFactory()` and passed to all `BrowserPlugin` instances created by that factory.

**Why is it needed?**

The factory may be called again — for example, during hot module replacement (HMR) or when reusing the factory with different routers.
Each new `BrowserPlugin` registers its own popstate listener in `onStart`. Without `shared`, the previous listener would remain in memory.

```typescript
// plugin.ts, lines 75-89
onStart: () => {
  if (this.#shared.removePopStateListener) {
    this.#shared.removePopStateListener();  // ← remove the previous instance's listener
  }

  this.#shared.removePopStateListener = this.#browser.addPopstateListener(
    (evt: PopStateEvent) => void this.#onPopState(evt),
  );
},
```

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
        ├── Compute shouldReplaceHistory:
        │     navOptions.replace ?? !fromState
        │     || (reload && areStatesEqual(to, from))
        │
        ├── url = router.buildUrl(toState.name, toState.params)
        │         └── router.buildPath() + buildUrl(path, base, prefix)
        │
        ├── If preserveHash && paths match:
        │     finalUrl = url + browser.getHash()
        │
        └── updateBrowserState(toState, finalUrl, shouldReplace, browser)
                  │
                  ├── Create historyState = { meta, name, params, path }
                  └── browser.pushState() or browser.replaceState()
```

## Data Flow: popstate (back/forward buttons)

```
User clicks back or forward
        │
        ▼
  browser.addPopstateListener → #onPopState(evt)
        │
        ├── #isTransitioning === true?
        │     YES: #deferredPopstateEvent = evt  (last-write-wins)
        │          return
        │
        ├── #isTransitioning = true
        │
        ├── getRouteFromEvent(evt, api, browser, options)
        │     │
        │     ├── isState(evt.state)?
        │     │     YES: { name: evt.state.name, params: evt.state.params }
        │     │
        │     └── NO: api.matchPath(browser.getLocation(options))
        │               └── URL matching as fallback
        │
        ├── route found?
        │     YES: await router.navigate(route.name, route.params, transitionOptions)
        │     NO:  await router.navigateToDefault({ ...transitionOptions, reload: true, replace: true })
        │
        ├── catch (error):
        │     error instanceof RouterError? → ignore (CANNOT_DEACTIVATE, etc.)
        │     otherwise: #recoverFromCriticalError(error)
        │               └── browser.replaceState(currentState, buildUrl(...))
        │
        └── finally:
              #isTransitioning = false
              #processDeferredEvent()
                    └── if #deferredPopstateEvent !== null:
                          event = #deferredPopstateEvent
                          #deferredPopstateEvent = null
                          void #onPopState(event)
```

### Deferred popstate Handling

Rapid back/forward clicks generate multiple popstate events in quick succession. Processing each one is pointless — only the final state matters.

The `#isTransitioning` flag blocks concurrent processing.
New events are written to `#deferredPopstateEvent` — each one overwrites the previous (last-write-wins).
After the current transition completes, `#processDeferredEvent()` processes the last deferred event.

```
Click 1 → onPopState → isTransitioning=true → navigate("page1")...
Click 2 → onPopState → isTransitioning=true → deferred = evt2
Click 3 → onPopState → isTransitioning=true → deferred = evt3  (evt2 discarded)
navigate("page1") done → processDeferredEvent → navigate("page3")
```

The intermediate `page2` state is skipped — this is expected behavior.

## URL Utilities

### url-utils.ts — pure functions

All functions in `url-utils.ts` are pure (no side effects, no direct access to globals).

**`extractPath(pathname, hash, options, regExpCache)`** — lines 23-46:

```
Hash mode (options.useHash = true):
  hash = "#!/users/123"
  hashPrefix = "!"
  → escapeRegExp("!") = "\\!"
  → hash.replace(/^#\\!/, "") = "/users/123"

History mode with base:
  pathname = "/app/users/123"
  base = "/app"
  → pathname.replace(/^\/app/, "") = "/users/123"

History mode without base:
  → pathname as-is
```

**`urlToPath(url, options, regExpCache)`** — lines 48-71:

Parses a full URL via `new URL()`. Checks the protocol (`http:` or `https:`).
Returns `null` for an invalid URL — calling code handles `null` explicitly.

**`buildUrl(path, base, prefix)`** — line 73:

Simple concatenation: `base + prefix + path`.
The prefix is computed once in the `BrowserPlugin` constructor (line 63): `options.useHash ? "#" + hashPrefix : ""`.

### RegExp Caching

```typescript
// url-utils.ts, lines 7-21 and 77-95
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

1. `escapeRegExpCache` — module-level singleton, caches `escapeRegExp()` results. Base path and hashPrefix strings are escaped once for the lifetime of the module.
2. `RegExpCache` — per-factory instance, created in `browserPluginFactory()` (line 64). Caches compiled `RegExp` objects by pattern. One `RegExp` per pattern — not recreated on every `extractPath()` call.

**Why two caches?** `escapeRegExpCache` is global because string escaping doesn't depend on plugin configuration.
`RegExpCache` is per-factory because patterns depend on the `base` and `hashPrefix` of a specific instance.

## Popstate Utilities

### popstate-utils.ts — pure functions

**`getRouteFromEvent(evt, api, browser, options)`** — lines 19-32:

A two-level strategy for getting a route from a popstate event:

1. **From `history.state`:** `isStateStrict(evt.state)` checks the object structure (presence of `name`, `params`, `path`, `meta`). If valid, `name` and `params` are taken directly. This is the fast path — no URL parsing needed.
2. **From the URL:** if `history.state` is invalid (external code wrote something to history, or the user opened the URL directly) — `api.matchPath(browser.getLocation(options))` matches the current URL against the route tree.

**`updateBrowserState(state, url, replace, browser)`** — lines 42-60:

Creates `historyState` as a subset of `State` (only `meta`, `name`, `params`, `path`) and calls `pushState` or `replaceState`. The full `State` object is not stored in `history.state` — only the fields needed to restore the route.

## Critical Error Recovery

```typescript
// plugin.ts, lines 243-264
#recoverFromCriticalError(error: unknown): void {
  console.error(`[${LOGGER_CONTEXT}] Critical error in onPopState`, error);

  try {
    const currentState = this.#router.getState();
    if (currentState) {
      const url = this.#router.buildUrl(currentState.name, currentState.params);
      this.#browser.replaceState(currentState, url);
    }
  } catch (recoveryError) {
    console.error(`[${LOGGER_CONTEXT}] Failed to recover from critical error`, recoveryError);
  }
}
```

In `#onPopState`, errors fall into two categories:

- `RouterError` (e.g., `CANNOT_DEACTIVATE`, `SAME_STATES`) — expected router errors, ignored. The browser has already changed the URL but the router stayed on the previous route — this is normal.
- Any other error — critical. The plugin attempts to restore the browser URL to the last known state via `replaceState`. This prevents the URL and router state from going out of sync.

## Options Validation

`validation.ts` performs two kinds of checks:

**Type checking** (`validateOptionType`): iterates over the keys of the provided options, compares `typeof value` against `typeof defaultOptions[key]`.
On mismatch — a console warning, `hasInvalidTypes = true`.

**Mode conflict checking:**

- `useHash: true` + `preserveHash` → warning (option is ignored)
- `useHash: false` + non-empty `hashPrefix` → warning (option is ignored)

If `hasInvalidTypes === true`, `factory.ts` falls back to `defaultOptions` entirely (lines 41-46). This guards against accidentally passing wrong types — the plugin continues working with safe defaults.

## Plugin Lifecycle

```
router.usePlugin(browserPluginFactory(opts))
        │
        ▼
  browserPlugin(router)  ← called by the core
        │
        ├── new BrowserPlugin(...)
        │     ├── Registers start interceptor
        │     └── #augmentRouter() → adds buildUrl, matchUrl, replaceHistoryState
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
        └── #cleanupAugmentation()
              ├── Removes popstate listener
              ├── Unregisters start interceptor
              └── delete router.buildUrl, matchUrl, replaceHistoryState
```

## Routing Modes

### History Mode (default)

```
URL: https://example.com/app/users/123

base = "/app"
prefix = ""

buildUrl("users.profile", { id: "123" })
  → buildPath() = "/users/123"
  → buildUrl("/users/123", "/app", "") = "/app/users/123"

extractPath("/app/users/123", "", { useHash: false, base: "/app" })
  → "/users/123"
```

Requires a server-side fallback (all paths → `index.html`).

### Hash Mode

```
URL: https://example.com/#!/users/123

useHash = true
hashPrefix = "!"
prefix = "#!"

buildUrl("users.profile", { id: "123" })
  → buildPath() = "/users/123"
  → buildUrl("/users/123", "", "#!") = "#!/users/123"

extractPath("/", "#!/users/123", { useHash: true, hashPrefix: "!" })
  → hash.replace(/^#\\!/, "") = "/users/123"
```

No server configuration needed — all routing lives in the hash.

### preserveHash (History Mode only)

```typescript
// plugin.ts, lines 106-118
const shouldPreserveHash =
  !!this.#options.preserveHash &&
  (!fromState || fromState.path === toState.path);

const finalUrl = shouldPreserveHash ? url + this.#browser.getHash() : url;
```

The hash fragment (`#section`) is preserved only when navigating to the same path. On a route change, the hash is cleared.

## Performance

| Optimization                           | Location                         | Effect                                                |
| -------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| `escapeRegExpCache` (module-level Map) | `url-utils.ts`, line 7           | String escaping happens once per module lifetime      |
| `RegExpCache` (per-factory Map)        | `url-utils.ts`, lines 77-95      | RegExp compilation happens once per pattern           |
| `#prefix` computed in constructor      | `plugin.ts`, line 63             | `"#" + hashPrefix` concatenation doesn't repeat       |
| `#isTransitioning` flag                | `plugin.ts`, lines 36, 200-207   | Blocks concurrent popstate processing without a queue |
| Last-write-wins for deferred events    | `plugin.ts`, lines 37, 204       | Intermediate states are skipped without accumulation  |
| `historyState` as a subset of State    | `popstate-utils.ts`, lines 48-53 | Less data stored in `history.state`                   |
| `createSafeBrowser()` called once      | `factory.ts`, line 35            | Environment check doesn't repeat                      |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents
