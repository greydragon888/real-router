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
│   ├── index.ts               — Public API + module augmentation; exports PLUGIN_SYNC_INFO sentinel
│   ├── factory.ts             — navigationPluginFactory (validation, normalization, instance creation)
│   ├── plugin.ts              — NavigationPlugin class (runtime behavior); same-URL guard in onTransitionSuccess (#580)
│   ├── types.ts               — Types (NavigationPluginOptions, NavigationBrowser, NavigationMeta, NavigationDirection, NavigationSharedState)
│   ├── history-extensions.ts  — Navigation API history extensions (peekBack, peekForward, hasVisited, etc.)
│   ├── navigate-handler.ts    — Navigate event handler (createNavigateHandler, recoverFromNavigateError, withRecovery); plugin-event detection via `event.info === PLUGIN_SYNC_INFO`
│   ├── navigation-browser.ts  — NavigationBrowser implementation (createNavigationBrowser tags every router-driven nav.navigate / nav.traverseTo call with `info: PLUGIN_SYNC_INFO`); exports the sentinel constant
│   ├── href-utils.ts          — isSameHref(target, currentHref) pure helper for the same-URL guard (#580); URL-canonical equality predicate
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

| Dependency           | What it provides                                                                                                                                                                                                      | Used in                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@real-router/core`  | `getPluginApi`, types (`Router`, `PluginApi`, `State`, `Plugin`, etc.)                                                                                                                                                | `factory.ts`, `plugin.ts`, `navigate-handler.ts`, `index.ts`                                                                           |
| `@real-router/types` | `StateContext` interface (for module augmentation)                                                                                                                                                                    | `index.ts`                                                                                                                             |
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
    buildUrl: (
      name: string,
      params?: Params,
      search?: SearchParams,
      options?: { hash?: string },
    ) => string;
    matchUrl: (url: string) => State | undefined;
    replaceHistoryState: (
      name: string,
      params?: Params,
      search?: SearchParams,
      options?: { hash?: string },
    ) => void;
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
        ├── historyState = { name, params, search, path }
        │
        ├── #pendingTraverseKey set?
        │     YES: browser.traverseTo(key)
        │          (createNavigationBrowser tags the call with info: PLUGIN_SYNC_INFO)
        │
        ├── toState.name === UNKNOWN_ROUTE
        │   ── OR ── isSameHref(finalUrl, browser.currentEntry?.url) === true (#580)
        │     YES: browser.updateCurrentEntry({ state: historyState })
        │          (no navigate event fires; URL stays as-is)
        │
        └── otherwise:
              replace = frozenMeta.navigationType !== "push" || isInitialTransition
              browser.navigate(finalUrl, { state: historyState, history: replace ? "replace" : "push" })
              (createNavigationBrowser tags the call with info: PLUGIN_SYNC_INFO so the
               re-entrant navigate event is short-circuited by the handler)
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
        ├── router.isActive() === false? → return
        │
        ├── event.info === PLUGIN_SYNC_INFO?
        │     YES: event.intercept({ handler: async () => {} }) — noop, no router call
        │          (plugin-initiated event; identity-based check, timing-independent — #580)
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
        │           await router.navigate(matchedState.name, matchedState.params, undefined, { ...transitionOptions, signal: event.signal })
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
  return (
    api.matchPath(extractPathFromAbsoluteUrl(entry.url, base)) ?? undefined
  );
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

**Factory pool — last-wins (concurrent-live caveat, #758).** Because the single `removeNavigateListener` slot is shared — and there is a single global `window.navigation` — each `onStart` removes the previous instance's navigate listener before installing its own. The pattern is built for a pool where routers are created/destroyed **sequentially** (one live router at a time). If two routers from the same factory are live **at the same time**, only the **last-started** one receives `navigate` events; the earlier one silently desyncs. This mutual exclusivity is inherent to the single global Navigation API. For genuinely concurrent routers, give each its own factory instance. Locked by `tests/stress/listener-leak.stress.ts` (N12.3).

## Plugin-event detection (PLUGIN_SYNC_INFO sentinel, #518 + #580)

`navigation.navigate({ history: "replace" })` fires a navigate event — unlike `history.replaceState()` which does not fire popstate. The plugin must mark its own events so the handler short-circuits them, otherwise the event loops back through `router.navigate()`.

The mechanism is identity-based: `createNavigationBrowser` tags every router-driven `nav.navigate` and `nav.traverseTo` call with `info: PLUGIN_SYNC_INFO` (a stable string sentinel exported from `navigation-browser.ts` and re-exported from the package barrel). The navigate-event handler checks `event.info === PLUGIN_SYNC_INFO` at entry and intercepts with a noop handler:

```typescript
// navigation-browser.ts (createNavigationBrowser)
navigate: (url, options) => {
  nav.navigate(url, { ...options, info: PLUGIN_SYNC_INFO });
},

// navigate-handler.ts (createNavigateHandler)
if (event.info === PLUGIN_SYNC_INFO) {
  event.intercept({ handler: async () => {} });
  return;
}
```

The bare `return` is not enough — per Navigation API spec, a same-origin `canIntercept` event left un-intercepted triggers Chromium's cross-document fallback (full reload). The noop intercept cancels that fallback without running router logic.

**Why identity, not a flag**: the previous design used a per-instance `SyncingFlag` raised before each call and lowered in a synchronous `finally`. It assumed `navigate` events fire synchronously inside `nav.navigate(...)` (Chromium behaviour). Safari 26.2 WKWebView delivers them on a subsequent task — by then the flag was already cleared, the handler treated the plugin's own write as user-initiated, and the cycle became a render-loop on macOS 26.2 Tauri releases (#580). `event.info` travels with the event, so detection is timing-independent.

`updateCurrentEntry` is **not** tagged: it dispatches `currententrychange`, not `navigate`, so there is no event to short-circuit.

## Same-URL guard in onTransitionSuccess (#580)

When the destination URL of a transition is canonically equal to the browser's current URL, the plugin writes router state via `browser.updateCurrentEntry({ state })` instead of `browser.navigate(url, { history: "replace" })`. Both leave a single history entry with the new state, but `updateCurrentEntry` does not fire a navigate event — and crucially does not trigger Safari WKWebView's cross-document fallback for custom-protocol same-URL replaces (the actual root cause of #580).

```typescript
if (
  toState.name === UNKNOWN_ROUTE ||
  isSameHref(finalUrl, this.#browser.currentEntry?.url)
) {
  this.#browser.updateCurrentEntry({ state: historyState });
} else {
  this.#browser.navigate(finalUrl, {
    state: historyState,
    history: replace ? "replace" : "push",
  });
}
```

`isSameHref(target, currentHref)` lives in `href-utils.ts` as a pure helper. It returns `true` when `new URL(target, currentHref).href === new URL(currentHref).href` — URL-canonical equality, so `scheme://host` and `scheme://host/` (special-scheme trailing-slash canonicalisation) compare equal. Returns `false` when `currentHref` is null/empty or either URL construction throws. The function is total over `string × (string | null | undefined)` and never throws. Property-tested in `tests/property/href-utils.properties.ts` (K1–K9 in INVARIANTS.md).

**Behavioural consequence**: same-URL transitions (initial transition to a route whose path equals the bootstrap URL; `router.navigate(name, params, undefined, { reload: true })` to current state; `forwardTo` redirects that don't change the path) no longer fire navigate events. `state.context.navigation.navigationType` still reports `"reload"` / `"replace"` for downstream consumers.

## Performance

| Optimization                      | Location                      | Effect                                                                         |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `String.startsWith` + `slice`     | `url-utils.ts`                | No regex needed for base path stripping                                        |
| Navigation API serialization      | Browser (native)              | No deferred queue needed — browser handles concurrency                         |
| `state.context.navigation`        | `plugin.ts`                   | Metadata lives on state — no separate storage needed                           |
| `Object.freeze(meta)`             | `plugin.ts`                   | Subscriber mutation protection without copies                                  |
| `entryToState` via URL matching   | `history-extensions.ts`       | Always authoritative — no stale state issues                                   |
| `createNavigationBrowser()` once  | `factory.ts`                  | Environment check and browser wrapping don't repeat                            |
| `PLUGIN_SYNC_INFO` identity check | `navigate-handler.ts`         | Constant-time, timing-independent detection of plugin-originated events (#580) |
| Same-URL guard (`isSameHref`)     | `plugin.ts` + `href-utils.ts` | Same-URL transitions skip nav.navigate entirely → no event to short-circuit    |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [browser-plugin/ARCHITECTURE.md](../browser-plugin/ARCHITECTURE.md) — History API equivalent
- [browser-env/ARCHITECTURE.md](../browser-env/ARCHITECTURE.md) — Shared browser abstractions
- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents
