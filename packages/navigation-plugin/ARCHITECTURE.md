# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/navigation-plugin` synchronizes router state with the browser URL via the Navigation API (`globalThis.navigation`). It's a drop-in replacement for `browser-plugin` with the same options and compatible extensions, plus exclusive history-inspection extensions that the History API cannot provide.

**Core role:** A thin adapter between the Navigation API and the platform-agnostic router core.
Contains no navigation business logic — only URL synchronization and navigate event handling.

**Integration points with the core:**

- `addInterceptor("start", ...)` — makes `path` in `router.start()` optional
- `extendRouter()` — formally registers all 12 extensions on the router instance with conflict detection and automatic cleanup
- `claimContextNamespace("navigation")` — claims the `navigation` namespace on `state.context` for writing `NavigationMeta`
- `declare module "@real-router/types"` — augments `StateContext` with `navigation?: NavigationMeta`
- `declare module "@real-router/core"` — adds compile-time types for extension methods to the `Router` interface
- Plugin hooks (`onStart`, `onStop`, `onTransitionStart`, `onTransitionSuccess`, `onTransitionCancel`, `onTransitionError`, `teardown`) — react to router events

## Package Structure

```
navigation-plugin/
├── src/
│   ├── index.ts               — Public API + module augmentation
│   ├── factory.ts             — navigationPluginFactory (validation, normalization, instance creation)
│   ├── plugin.ts              — NavigationPlugin class (runtime behavior)
│   ├── types.ts               — Types (NavigationPluginOptions, NavigationBrowser, NavigationMeta, NavigationDirection, NavigationSharedState, SyncingFlag)
│   ├── history-extensions.ts  — Navigation API history extensions (peekBack, peekForward, hasVisited, etc.)
│   ├── navigate-handler.ts    — Navigate event handler (createNavigateHandler, recoverFromNavigateError, withRecovery)
│   ├── navigation-browser.ts  — NavigationBrowser implementation (createNavigationBrowser + wrapNavigationBrowserWithSyncing)
│   ├── ssr-fallback.ts        — createNavigationFallbackBrowser (no-op fallback for SSR)
│   ├── validation.ts          — Options validation (delegates to browser-env)
│   ├── constants.ts           — Constants (defaultOptions, source, LOGGER_CONTEXT)
│   └── browser-env/           — Symlink → shared/browser-env (extractPath, buildUrl, urlToPath, safeParseUrl, shouldReplaceHistory, createStartInterceptor, createReplaceHistoryState, createPluginBuildUrl, hash encoding helpers, etc.)
```

> **Note (2026-05-18):** `plugin-utils.ts` is **not** a local file — `createStartInterceptor`, `createReplaceHistoryState`, and `createPluginBuildUrl` live in `shared/browser-env/plugin-utils.ts` and are imported via the `./browser-env` symlink. Earlier revisions of this document listed it as local; that was wrong.

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── plugin.ts
            │       ├── history-extensions.ts
            │       │       └── browser-env (extractPath)
            │       ├── navigate-handler.ts
            │       │       └── browser-env (extractPath)
            │       ├── plugin-utils.ts
            │       ├── constants.ts
            │       └── browser-env (shouldReplaceHistory)
            ├── navigation-browser.ts
            │       └── browser-env (safelyEncodePath, extractPath)
            ├── ssr-fallback.ts
            │       └── browser-env (createWarnOnce)
            ├── validation.ts
            │       ├── constants.ts
            │       └── browser-env (createOptionsValidator, safeBaseRule)
            ├── constants.ts
            └── browser-env (isBrowserEnvironment, normalizeBase)

types.ts  ← imported by factory.ts, plugin.ts, navigate-handler.ts, navigation-browser.ts, plugin-utils.ts, ssr-fallback.ts
```

External dependencies:

| Dependency           | What it provides                                                                                                                                | Used in                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@real-router/core`  | `getPluginApi`, types (`Router`, `PluginApi`, `State`, `Plugin`, etc.)                                                                          | `factory.ts`, `plugin.ts`, `navigate-handler.ts`, `index.ts`                              |
| `@real-router/types` | `StateContext` interface (for module augmentation)                                                                                               | `index.ts`                                                                                |
| `browser-env`        | `normalizeBase`, `safelyEncodePath`, `safeParseUrl`, `shouldReplaceHistory`, `isBrowserEnvironment`, `createWarnOnce`, `createOptionsValidator`, `extractPath`, `buildUrl`, `urlToPath`, `extractPathFromAbsoluteUrl` | `factory.ts`, `plugin.ts`, `navigate-handler.ts`, `navigation-browser.ts`, `ssr-fallback.ts`, `validation.ts`, `history-extensions.ts` |

## Factory + Class Pattern

### Separation of Concerns

`navigationPluginFactory()` in `factory.ts` and `NavigationPlugin` in `plugin.ts` are intentionally separate:

```
navigationPluginFactory(opts?, browser?)   ← factory.ts
        │
        │  Runs once on call:
        │  - validateOptions()
        │  - base path normalization (normalizeBase from browser-env)
        │  - Navigation API availability check (throws if not supported)
        │  - createNavigationBrowser() or createNavigationFallbackBrowser()
        │  - transitionOptions construction
        │  - NavigationSharedState creation
        │
        └── returns PluginFactory (closure)
                │
                │  Called by the router on router.usePlugin():
                │
                └── new NavigationPlugin(router, api, options, browser, ...)
                            │
                            │  Constructor:
                            │  - registers start interceptor
                            │  - calls api.extendRouter({buildUrl, matchUrl, replaceHistoryState, ...9 exclusive})
                            │  - creates navigate event handler and lifecycle
                            │
                            └── .getPlugin()  → Plugin { onStart, onStop, ... }
```

**Why this split instead of a single object?**

- `factory.ts` runs once — expensive operations (validation, browser creation, API check) don't repeat on every `usePlugin()` call
- `NavigationPlugin` wires together NavigationBrowser with plugin-specific URL logic — a class encapsulates the setup cleanly
- Testability: `NavigationPlugin` can be instantiated directly with a mock `NavigationBrowser` and `PluginApi`
- Lifecycle: the constructor registers the interceptor and extends the router via `api.extendRouter()`; `teardown` calls the returned unsubscribe to remove extensions

### Creation Flow

```typescript
// factory.ts
export function navigationPluginFactory(opts?, browser?): PluginFactory {
  if (!browser && isBrowserEnvironment() && !("navigation" in globalThis)) {
    throw new Error(
      "[navigation-plugin] Navigation API is not supported. Use @real-router/browser-plugin instead.",
    );
  }

  validateOptions(opts);
  const options = { ...defaultOptions, ...opts };
  options.base = normalizeBase(options.base);

  const resolvedBrowser = browser ?? createBrowser(options.base);
  const transitionOptions = { forceDeactivate, source, replace: true as const };
  const shared: NavigationSharedState = { removeNavigateListener: undefined };

  return function navigationPlugin(routerBase) {
    const plugin = new NavigationPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    );

    return plugin.getPlugin();
  };
}

function createBrowser(base: string): NavigationBrowser {
  if ("navigation" in globalThis) {
    return createNavigationBrowser(base);
  }

  return createNavigationFallbackBrowser("navigation-plugin");
}
```

## Browser API Abstraction

The `NavigationBrowser` interface wraps `globalThis.navigation` and provides a testable seam:

```typescript
interface NavigationBrowser {
  getLocation: () => string;
  getHash: () => string;
  navigate: (
    url: string,
    options: { state: unknown; history: "push" | "replace" },
  ) => void;
  replaceState: (state: unknown, url: string) => void;
  updateCurrentEntry: (options: { state: unknown }) => void;
  traverseTo: (key: string) => void;
  addNavigateListener: (fn: (evt: NavigateEvent) => void) => () => void;
  entries: () => NavigationHistoryEntry[];
  currentEntry: NavigationHistoryEntry | null;
  /**
   * Type of the cross-document navigation that activated this document.
   * Reads `navigation.activation.navigationType`. Returns `undefined` when
   * unavailable (older browsers, SSR fallback). Consumed once by the plugin's
   * constructor to prime `#capturedMeta` for the first transition (#531).
   */
  getActivationType: () => NavigationMeta["navigationType"] | undefined;
}
```

`createNavigationBrowser(base)` in `navigation-browser.ts` creates the real implementation wrapping `globalThis.navigation`. Only called when `"navigation" in globalThis` is true.

`createNavigationFallbackBrowser(context)` in `ssr-fallback.ts` creates a no-op implementation for SSR. Each method logs a one-time warning via `createWarnOnce` from `browser-env`.

Tests pass a mock `NavigationBrowser` directly — no need to mock globals.

## Start Interceptor Integration

### The Problem

`router.start(path)` in the core requires `path` as a mandatory argument — the core is platform-agnostic and knows nothing about the browser.
The plugin needs to make `path` optional without changing the core's signature.

### Solution: addInterceptor

```typescript
// plugin-utils.ts
export function createStartInterceptor(
  api: PluginApi,
  browser: NavigationBrowser,
): () => void {
  return api.addInterceptor("start", (next, path) =>
    next(path ?? browser.getLocation()),
  );
}
```

If `path` is not provided, the interceptor substitutes the current browser URL via `browser.getLocation()`.
If provided, it passes it through as-is.

`#removeStartInterceptor` stores the unsubscribe function — called in `teardown`.

## Router Augmentation

### Three Layers

Router extension involves three layers:

1. **State Context types** — `declare module "@real-router/types"` in `index.ts` augments the `StateContext` interface so TypeScript knows about `state.context.navigation`.
2. **Router method types** — `declare module "@real-router/core"` in `index.ts` augments the `Router` interface so TypeScript knows about all 12 extension methods.
3. **Runtime registration** — `api.extendRouter({...})` in `plugin.ts` adds the extension methods; `api.claimContextNamespace("navigation")` claims the context namespace for writing `NavigationMeta`.

### Type Augmentation (index.ts)

```typescript
declare module "@real-router/types" {
  interface StateContext {
    navigation?: NavigationMeta;
  }
}

declare module "@real-router/core" {
  interface Router {
    buildUrl: (name: string, params?: Params) => string;
    matchUrl: (url: string) => State | undefined;
    replaceHistoryState: (name: string, params?: Params) => void;
    peekBack: () => State | undefined;
    peekForward: () => State | undefined;
    hasVisited: (routeName: string) => boolean;
    getVisitedRoutes: () => string[];
    getRouteVisitCount: (routeName: string) => number;
    traverseToLast: (routeName: string) => Promise<State>;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    canGoBackTo: (routeName: string) => boolean;
    start(path?: string): Promise<State>; // overload — makes path optional
  }
}
```

### Runtime Registration via extendRouter + claimContextNamespace (plugin.ts)

```typescript
// plugin.ts, constructor
this.#claim = api.claimContextNamespace("navigation");

this.#removeExtensions = api.extendRouter({
  buildUrl: pluginBuildUrl,
  matchUrl: (url: string) =>
    api.matchPath(urlToPath(url, options.base)) ?? undefined,
  replaceHistoryState: createReplaceHistoryState(
    api,
    router,
    browser,
    pluginBuildUrl,
    setSyncing,
  ),
  peekBack: () => peekBack(browser, api, options.base),
  peekForward: () => peekForward(browser, api, options.base),
  hasVisited: (routeName) => hasVisited(browser, api, options.base, routeName),
  getVisitedRoutes: () => getVisitedRoutes(browser, api, options.base),
  getRouteVisitCount: (routeName) =>
    getRouteVisitCount(browser, api, options.base, routeName),
  traverseToLast: (routeName) => this.traverseToLast(routeName),
  canGoBack: () => canGoBack(browser),
  canGoForward: () => canGoForward(browser),
  canGoBackTo: (routeName) =>
    canGoBackTo(browser, api, options.base, routeName),
});
```

`extendRouter()` validates that no property with the same name already exists on the router (throws `PLUGIN_CONFLICT` if it does), adds the properties, and returns an unsubscribe function that removes them.

`claimContextNamespace("navigation")` returns `{ write, release }` — the plugin calls `claim.write(state, meta)` to attach frozen `NavigationMeta` to `state.context.navigation`, and `claim.release()` in `teardown` to free the namespace.

## Plugin Lifecycle

```
router.usePlugin(navigationPluginFactory(opts))
        │
        ▼
  navigationPlugin(router)  ← called by the core
        │
        ├── new NavigationPlugin(...)
        │     ├── api.claimContextNamespace("navigation") → stores #claim
        │     ├── Registers start interceptor
        │     ├── browser.getActivationType() → if defined, primes #capturedMeta
        │     │     (cross-document load: F5/back-forward/typed URL — see C9)
        │     └── api.extendRouter({buildUrl, matchUrl, replaceHistoryState, ...9 exclusive})
        │           → stores returned unsubscribe as #removeExtensions
        │
        └── plugin.getPlugin() → { onStart, onStop, onTransitionStart, onTransitionSuccess, onTransitionCancel, onTransitionError, teardown }

router.start()
        │
        ▼
  Plugin.onStart()
        ├── Removes previous navigate listener (if any, via shared.removeNavigateListener)
        └── Registers new navigate listener

router.navigate() → transition starts
        │
        ▼
  Plugin.onTransitionStart(toState)
        └── If #capturedMeta exists: claim.write(toState, Object.freeze(#capturedMeta))
            (makes meta available in guards via toState.context.navigation)

router.navigate() → success
        │
        ▼
  Plugin.onTransitionSuccess()
        ├── claim.write(toState, Object.freeze(meta)) — final meta on state
        └── navigation.navigate() or navigation.updateCurrentEntry() or navigation.traverseTo()

router.navigate() → cancelled or error
        │
        ▼
  Plugin.onTransitionCancel() / Plugin.onTransitionError()
        └── Clears #capturedMeta and #pendingTraverseKey

router.stop()
        │
        ▼
  Plugin.onStop()
        └── Removes navigate listener

unsubscribe() or router.dispose()
        │
        ▼
  Plugin.teardown()
        ├── Removes navigate listener
        ├── Unregisters start interceptor (#removeStartInterceptor)
        ├── Removes router extensions (#removeExtensions)
        └── Releases context namespace claim (#claim.release())
```

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
        ├── Derive or use #capturedMeta (navigationType, userInitiated, info, direction, sourceElement)
        │     └── claim.write(toState, Object.freeze(meta)) → state.context.navigation
        │
        ├── Resolve hash via tri-state opts.hash (#532):
        │     prevHash = fromState ? fromState.context.url?.hash : getDecodedHash(browser)
        │     hash     = navOptions.hash !== undefined ? normalizeHashInput(navOptions.hash) : prevHash
        │     urlClaim.write(toState, { hash, hashChanged: navOptions.hashChange ?? (hash !== prevHash) })
        │
        ├── url      = router.buildUrl(toState.name, toState.params)
        │              └── router.buildPath() + buildUrl(path, base)
        ├── finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url
        │
        ├── historyState = { name, params, path }
        │
        ├── #isSyncingFromRouter = true
        │
        ├── #pendingTraverseKey set?
        │     YES: browser.traverseTo(key)
        │
        ├── toState.name === UNKNOWN_ROUTE?
        │     YES: browser.updateCurrentEntry({ state: historyState })
        │
        └── otherwise:
              shouldReplace = shouldReplaceHistory(navOptions, toState, fromState)
              browser.navigate(finalUrl, { state: historyState, history: replace ? "replace" : "push" })
              #isSyncingFromRouter = false
```

## Data Flow: Navigate Event

```
User clicks back/forward/link, or navigation.navigate() fires
        │
        ▼
  navigate event → handleNavigateEvent(event)
        │
        ├── event.canIntercept === false? → return (cross-origin, download, etc.)
        │
        ├── isSyncingFromRouter() === true? → return (plugin-initiated, skip)
        │
        ├── router.isActive() === false? → return
        │
        ├── Parse destination URL → path
        │
        ├── Set #capturedMeta BEFORE event.intercept()
        │     (written to toState.context.navigation in onTransitionStart, available in guards)
        │
        ├── matchedState = api.matchPath(path)
        │
        ├── matchedState found?
        │     YES: event.intercept({ handler: async () => {
        │           await router.navigate(matchedState.name, matchedState.params, { ...transitionOptions, signal: event.signal })
        │           catch RouterError → ignore (CANNOT_DEACTIVATE, etc.)
        │           catch other → recoverFromNavigateError()
        │         }})
        │
        ├── !matchedState && allowNotFound?
        │     YES: event.intercept({ handler: () => router.navigateToNotFound(path) })
        │
        └── !matchedState && !allowNotFound?
              event.intercept({ handler: async () => {
                const err = new RouterError(ROUTE_NOT_FOUND, { path })
                api.emitTransitionError(err)
                throw err  // Navigation API auto-rolls back URL on reject
              }})
              (no silent navigateToDefault — see #483)
```

### No Race Condition

The Navigation API serializes navigations via `event.intercept()`. Only one intercept handler runs at a time — the browser queues subsequent navigate events until the current handler resolves. No deferred event queue needed (unlike browser-plugin's popstate handling).

## URL Utilities

### browser-env URL helpers — pure functions

All URL helpers come from `shared/browser-env/url-utils.ts` (symlinked as
`src/browser-env/` into this package) and are pure (no side effects, no
direct access to globals).

**`extractPath(pathname, base)`**:

```
With base:
  pathname = "/app/users/123"
  base = "/app"
  → pathname.slice(base.length) = "/users/123"

Without base:
  → pathname as-is
```

Uses `String.startsWith()` + `String.slice()` — no regex needed for base path stripping.
The result is normalized to always start with `/`.

**`urlToPath(url, base)`**:

Delegates URL parsing to `safeParseUrl` from `browser-env`. The parser is
scheme-agnostic and total (never throws, never returns null). The `context`
parameter was removed in #496 (see
[IMPLEMENTATION_NOTES#safeParseUrl](../../IMPLEMENTATION_NOTES.md#safeparseurl--scheme-agnostic-parser-496)).
Preserves search params: the result is `extractPath(pathname, base) + search`.

**`buildUrl(path, base)`**:

Simple concatenation: `base + path`.

## NavigationMeta Storage (Claim-Based API)

Navigation metadata is delivered to `state.context.navigation` via the claim-based State Context API:

```
#claim = api.claimContextNamespace("navigation")
  — claim.write(state, meta) attaches frozen NavigationMeta to state.context.navigation
  — claim.release() frees the namespace (called in teardown)

#capturedMeta: NavigationMeta | undefined
  — Set before event.intercept() in navigate handler
  — Written to toState in onTransitionStart (available in guards)
  — Written again in onTransitionSuccess (final meta on state)
  — Cleared after writing, or on cancel/error
```

### capturedMeta Flow

```
Navigate event fires (browser-initiated)
  → setCapturedMeta({ navigationType, userInitiated, info, direction, sourceElement })  ← from event fields
  → event.intercept({ handler: async () => router.navigate(...) })
  → onTransitionStart(toState) → claim.write(toState, Object.freeze(#capturedMeta))
  → guards run → toState.context.navigation available
  → onTransitionSuccess → claim.write(toState, Object.freeze(#capturedMeta))
  → #capturedMeta = undefined
```

For router-initiated navigation (no navigate event):

```
router.navigate() called
  → onTransitionStart → #capturedMeta is undefined → no write
  → onTransitionSuccess
  → #capturedMeta is undefined → derive from navOptions:
      reload && same path → "reload"
      shouldReplaceHistory → "replace"
      otherwise → "push"
  → claim.write(toState, Object.freeze(derivedMeta))
```

## History Extensions

All history extensions in `history-extensions.ts` use `entryToState()` to convert `NavigationHistoryEntry` objects to `State`:

```typescript
function entryToState(entry, api, base): State | undefined {
  if (!entry?.url) return undefined;
  return api.matchPath(extractPathFromAbsoluteUrl(entry.url, base)) ?? undefined;
}
```

`extractPathFromAbsoluteUrl` delegates to `safeParseUrl` — never throws,
returns a string path for any input (malformed URL → best-effort path the
matcher will then fail to resolve).

Search params are **preserved** — `extractPathFromAbsoluteUrl` returns `pathname + search`, which is needed for strict `queryParamsMode` matching (#449). An entry like `/users?filter=active` is matched against routes declaring `?filter`; entries with undeclared search params fail the match.

**Why URL matching instead of `entry.getState()`?**

- Entries before plugin init have no state
- Entries after `router.replace(routes)` may have stale state
- Entries from other SPAs on the same origin have foreign state

**Why `safeParseUrl` instead of raw `new URL()`?** The Navigation API spec
guarantees absolute URLs, but (1) `new URL(url, globalThis.location.origin)`
throws `TypeError` on `file://` windows where `location.origin === "null"`
(the literal string), and (2) `new URL()` is 4–6× slower than a manual parser
on the hot path (`getVisitedRoutes` / `hasVisited` iterate every session-
history entry). `safeParseUrl` is scheme-agnostic and total — `entryToState`
composes cleanly without null-case branches. See
[IMPLEMENTATION_NOTES#safeParseUrl](../../IMPLEMENTATION_NOTES.md#safeparseurl--scheme-agnostic-parser-496).

URL matching is always authoritative — it reflects the current route config.

### traverseToLast

`traverseToLast(routeName)` finds the last history entry matching the route (excluding the current entry to avoid `SAME_STATES`), sets `#capturedMeta` and `#pendingTraverseKey`, then calls `router.navigate()`. On `onTransitionSuccess`, the plugin calls `browser.traverseTo(key)` instead of `browser.navigate()`.

## NavigationSharedState

```typescript
interface NavigationSharedState {
  removeNavigateListener: (() => void) | undefined;
}
```

Created once in `navigationPluginFactory()` and passed to the lifecycle helpers.

**Why is it needed?**

The factory may be called again — for example, during HMR or when reusing the factory with different routers. Each new plugin instance registers its own navigate listener in `onStart`. Without `shared`, the previous listener would remain in memory.

`shared` is intentionally mutable. It's the only shared state between instances of the same factory.

## replaceHistoryState and the Syncing Flag

`navigation.navigate({ history: "replace" })` fires a navigate event — unlike `history.replaceState()` which does not fire popstate. The plugin must suppress this event to prevent a full navigation cycle:

```typescript
// plugin-utils.ts
setSyncing(true);
browser.replaceState(historyState, url); // fires navigate event
setSyncing(false);
```

The navigate handler checks `isSyncingFromRouter()` at the top and returns early if true.

The same flag is set in `onTransitionSuccess` around all `browser.navigate()` / `browser.traverseTo()` / `browser.updateCurrentEntry()` calls.

## Performance

| Optimization                     | Location                | Effect                                                 |
| -------------------------------- | ----------------------- | ------------------------------------------------------ |
| `String.startsWith` + `slice`    | `url-utils.ts`          | No regex needed for base path stripping                |
| Navigation API serialization     | Browser (native)        | No deferred queue needed — browser handles concurrency |
| `state.context.navigation`       | `plugin.ts`             | Metadata lives on state — no separate storage needed   |
| `Object.freeze(meta)`           | `plugin.ts`             | Subscriber mutation protection without copies           |
| `entryToState` via URL matching  | `history-extensions.ts` | Always authoritative — no stale state issues           |
| `createNavigationBrowser()` once | `factory.ts`            | Environment check and browser wrapping don't repeat    |
| `isSyncingFromRouter` flag       | `plugin.ts`             | Blocks navigate event re-entry without a queue         |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [browser-plugin/ARCHITECTURE.md](../browser-plugin/ARCHITECTURE.md) — History API equivalent
- [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) — Shared browser abstractions
- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents
