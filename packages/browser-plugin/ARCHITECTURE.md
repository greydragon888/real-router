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
│   ├── index.ts           — Public API + module augmentation (StateContext.browser, NavigationOptions.source)
│   ├── factory.ts         — browserPluginFactory + internal createDefaultBrowser (cached getLocation) + createBrowserPlugin (extends router, wires popstate, onTransitionSuccess)
│   ├── types.ts           — Types (BrowserPluginOptions, BrowserContext, BrowserSource)
│   ├── browser-env/       — Symlink → shared/browser-env (extractPath, buildUrl, urlToPath, popstate, validation, createUpdateBrowserState, …)
│   ├── validation.ts      — Options validation (delegates to browser-env)
│   └── constants.ts       — Constants (defaultOptions, POPSTATE_SOURCE, LOGGER_CONTEXT)
```

## Module Dependency Graph

```
index.ts
    └── factory.ts
            ├── browser-env (shared abstractions: URL utils, popstate, validation, createUpdateBrowserState)
            ├── validation.ts
            │       └── constants.ts
            └── constants.ts

types.ts  ← imported by factory.ts, validation.ts, index.ts
```

External dependencies:

| Dependency          | What it provides                                                                                       | Used in                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `@real-router/core` | `getPluginApi`, types (`Router`, `PluginApi`, `State`, etc.)                                           | `factory.ts`, `index.ts`              |
| `browser-env`       | Browser abstraction, popstate handling, validation, URL parsing, URL utils, `createUpdateBrowserState` | `factory.ts`, `validation.ts`         |
| `type-guards`       | `isStateStrict` (`history.state` validation)                                                           | `index.ts` (re-exported as `isState`) |

## Factory Pattern

### Separation of Concerns

`browserPluginFactory()` is the only public entry. Two internal helpers in the same `factory.ts` file split the work:

```
browserPluginFactory(opts?, browser?)         ← public
        │
        │  Runs once per factory call:
        │  - validateOptions()
        │  - base path normalization (normalizeBase from browser-env)
        │  - createDefaultBrowser(base) if no browser provided
        │      └── memoized getLocation: caches extractPath + safelyEncodePath
        │          keyed by (location.pathname, location.search) — sentinel "\0"
        │          for first-call miss
        │  - transitionOptions construction
        │  - SharedFactoryState creation
        │
        └── returns PluginFactory (closure)
                │
                │  Called by the router on router.usePlugin():
                │
                └── createBrowserPlugin(router, api, options, browser, ...)   ← internal function
                            │
                            │  Per-plugin-instance setup:
                            │  - api.claimContextNamespace("browser")
                            │  - createUpdateBrowserState() — closure with reusable
                            │    mutable {name, params, search, path} buffer (browser
                            │    structured-clones synchronously, so reuse is safe)
                            │  - createStartInterceptor (via browser-env)
                            │  - api.extendRouter({buildUrl, matchUrl, replaceHistoryState})
                            │  - createPopstateHandler + createPopstateLifecycle
                            │
                            └── returns Plugin { onStart, onStop, teardown, onTransitionSuccess }
```

**Why no class?**

`createBrowserPlugin` was previously a `BrowserPlugin` class with private fields — but it was `@internal` and never exported. Inlining as a function eliminates one source file and one `export class` from the package surface. The state that lived in private fields (`#claim`, `#updateState`, `#browser`, `#base`) is now closure-captured by `onTransitionSuccess`.

### Creation Flow

```typescript
// factory.ts
export function browserPluginFactory(opts?, browser?): PluginFactory {
  validateOptions(opts);
  const options = { ...defaultOptions, ...opts };
  options.base = normalizeBase(options.base);

  const resolvedBrowser = browser ?? createDefaultBrowser(options.base);

  const transitionOptions = {
    forceDeactivate: options.forceDeactivate,
    source: POPSTATE_SOURCE,
    replace: true as const,
  };
  const shared: SharedFactoryState = {
    removePopStateListener: undefined,
    removeHashChangeListener: undefined,
  };

  return function browserPlugin(routerBase) {
    return createBrowserPlugin(
      routerBase as Router,
      getPluginApi(routerBase),
      options,
      resolvedBrowser,
      transitionOptions,
      shared,
    );
  };
}
```

## Browser API Abstraction

The `Browser` interface, `createSafeBrowser()`, `createHistoryFallbackBrowser()`, `safelyEncodePath()`, and all SSR fallback logic live in `shared/browser-env/` — symlinked into both `browser-plugin` and `hash-plugin` as `src/browser-env/`. Sources:

- `shared/browser-env/types.ts` — `Browser`, `HistoryBrowser`, `SharedFactoryState`
- `shared/browser-env/safe-browser.ts` — `createSafeBrowser` (real History API binding)
- `shared/browser-env/ssr-fallback.ts` — `createHistoryFallbackBrowser` (no-op fallback for SSR/Node)
- `shared/browser-env/detect.ts` — `isBrowserEnvironment()`
- `shared/browser-env/history-api.ts` — `pushState`, `replaceState`, `addPopstateListener`, `getHash`, `getState` (`getState` reads `history.state` so `onTransitionSuccess` can skip a no-op popstate `replaceState`, #1353)

**Key points for browser-plugin:**

- `browserPluginFactory(opts, browser)` accepts an optional `browser` argument for DI / testing
- If not provided, `createDefaultBrowser(base)` (in `factory.ts`) wraps `createSafeBrowser()` with a memoized `getLocation` callback (caches `extractPath + safelyEncodePath` keyed by `pathname + search`)
- `createSafeBrowser` checks `typeof globalThis.window !== "undefined" && !!globalThis.history` once at construction and returns either the real `Browser` or the SSR fallback. Subsequent calls do not repeat the environment check
- Tests pass a mock `Browser` object directly — no need to mock globals

## Start Interceptor Integration

### The Problem

`router.start(path)` in the core requires `path` as a mandatory argument — the core is platform-agnostic and knows nothing about the browser.
The plugin needs to make `path` optional without changing the core's signature.

### Solution: addInterceptor

```typescript
// factory.ts — createBrowserPlugin
const removeStartInterceptor = createStartInterceptor(api, browser);
```

`createStartInterceptor` from `browser-env` registers an interceptor that intercepts calls to `router.start(path?)`.
If `path` is not provided, it substitutes the current browser URL via `browser.getLocation()`.
If provided, it passes it through as-is.

**Why not monkey-patching?**

- `addInterceptor` is an official core API designed for plugins
- Interceptors execute in LIFO order (last-registered wraps first); multiple plugins can intercept the same method
- `removeStartInterceptor` is closure-captured and invoked in `cleanup` (called by `teardown`)

## Router Augmentation

### Two layers

Router extension involves two layers:

1. **Compile-time types** — `declare module "@real-router/core"` in `index.ts` augments the `Router` interface so TypeScript knows about the new methods.
2. **Runtime registration** — `api.extendRouter({...})` in `factory.ts` (inside `createBrowserPlugin`) adds the actual methods to the router instance with conflict detection and automatic cleanup.

### Type Augmentation (index.ts)

TypeScript allows extending existing interfaces via `declare module`. The plugin adds methods to the `Router` interface from the core:

```typescript
// index.ts, lines 35-57
declare module "@real-router/core" {
  interface Router {
    buildUrl: (name: string, params?: Params) => string;
    matchUrl: (url: string) => State | undefined;
    replaceHistoryState: (name: string, params?: Params) => void;
    start(path?: string): Promise<State>; // overload — makes path optional
  }
}
```

### Runtime Registration via extendRouter (factory.ts)

TypeScript augmentation is type-level only. The actual methods are registered inside `createBrowserPlugin` via `api.extendRouter()`:

```typescript
// factory.ts — createBrowserPlugin
const removeExtensions = api.extendRouter({
  buildUrl: pluginBuildUrl, // buildPath() + buildUrl(path, base)
  matchUrl: (url: string) =>
    api.matchPath(urlToPath(url, options.base)) ?? undefined,
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
// factory.ts — createBrowserPlugin
const lifecycle = createPopstateLifecycle({
  browser,
  shared,
  handler,
  cleanup: () => {
    removeStartInterceptor();
    removeExtensions(); // ← removes buildUrl, matchUrl, replaceHistoryState
    claim.release();
    urlClaim.release(); // ← releases the shared "url" hash namespace (#532)
  },
});
```

`teardown` removes the popstate listener (and the `hashchange` listener it owns, #759), then calls the `cleanup` callback which unregisters the start interceptor, router extensions, and both context-namespace claims.

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

Pure URL functions (`extractPath`, `buildUrl`, `urlToPath`) live in `browser-env/url-utils.ts` (symlink). They accept `base: string` directly rather than the full options object — the calling code in `factory.ts` already works with validated `Required<BrowserPluginOptions>` and passes the specific values needed.

Types shared between browser-plugin and hash-plugin (`Browser`, `SharedFactoryState`, etc.) live in `browser-env`.

## SharedFactoryState

`SharedFactoryState` is defined in `browser-env` and shared between browser-plugin and hash-plugin:

```typescript
interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
  removeHashChangeListener: (() => void) | undefined;
}
```

The `shared` object is created once in `browserPluginFactory()` and passed to `createPopstateLifecycle` from `browser-env`.

**Why is it needed?**

The factory may be called again — for example, during hot module replacement (HMR) or when reusing the factory with different routers.
Each new plugin instance registers its own popstate listener in `onStart`. Without `shared`, the previous listener would remain in memory.

`shared` is intentionally mutable. It's the only shared state between instances of the same factory.

**Factory pool — last-wins (concurrent-live caveat, #758).** Because the single `removePopStateListener` slot is shared, each `onStart` removes the previous instance's listener before installing its own. The pattern is built for a pool where routers are created/destroyed **sequentially** (one live router at a time). If two routers from the same factory are live **at the same time** on one window, only the **last-started** one tracks `popstate` — the earlier one silently desyncs from the URL. There is a single `popstate` stream and a single URL, so this mutual exclusivity is inherent (who owns the URL with two live routers?). For genuinely concurrent routers, give each its own factory instance. Locked by `tests/stress/factory-instance-cleanup.stress.ts` (B7.5).

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
        ├── shouldReplaceHistory(navOptions, toState, fromState)
        │     (from browser-env: replace ?? !fromState || reload && path match)
        │
        ├── url = buildUrl(toState.path, options.base)
        │         (toState.path is already final — no re-buildPath in onTransitionSuccess)
        │
        ├── Resolve hash (tri-state, #532): opts.hash===undefined → cached `currentHash`;
        │     ""→clear; "value"→set. finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url
        │
        ├── urlClaim.write(toState, { hash, hashChanged })   ← shared "url" namespace (#532)
        │
        └── updateState(toState, finalUrl, shouldReplace, browser)   ← createUpdateBrowserState() closure
                  │
                   ├── Reuse mutable buffer { name, params, search, path } (overwritten in place)
                   └── browser.pushState() or browser.replaceState()  (browser structured-clones)
```

## Data Flow: popstate (back/forward buttons)

Popstate handling is fully delegated to `browser-env` via `createPopstateHandler` + `createPopstateLifecycle`. The flow is identical for browser-plugin and hash-plugin:

```
User clicks back or forward
        │
        ▼
  browser.addPopstateListener → handler(evt)  (from createPopstateHandler)
        │
        ├── location = browser.getLocation()   (snapshot at fire time, #757)
        │
        ├── isTransitioning === true?
        │     YES: deferred = { evt, location }  (last-write-wins)
        │          return
        │
        ├── isTransitioning = true
        │
        ├── getRouteFromEvent(evt, api, location)
        │     │
        │     ├── isState(evt.state)?
        │     │     YES: { name: evt.state.name, params: evt.state.params }
        │     │
        │     └── NO: api.matchPath(location)
        │               └── URL matching as fallback
        │
        ├── route found?
        │     YES: await router.navigate(route.name, route.params, transitionOptions)
        │     NO + allowNotFound: router.navigateToNotFound(location)
        │     NO + !allowNotFound: api.emitTransitionError(ROUTE_NOT_FOUND) + rollbackUrlToCurrentState()
        │                          (no silent navigateToDefault — see #483)
        │
        ├── catch (error):
        │     error instanceof RouterError? → rollbackUrlToCurrentState() (URL↔state resync)
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
New events are written to the single-slot `deferred = { evt, location }` queue — each one overwrites the previous (last-write-wins).
The `location` is snapshotted when the event fires, not when it is replayed: the in-flight navigation's `onTransitionSuccess → replaceState` overwrites the live location before `processDeferredEvent()` runs, so re-reading it then would resolve the wrong target (#757).
After the current transition completes, `processDeferredEvent()` processes the last deferred event against its snapshotted location.

```
Click 1 → onPopState → isTransitioning=true → navigate("page1")...
Click 2 → onPopState → isTransitioning=true → deferred = evt2
Click 3 → onPopState → isTransitioning=true → deferred = evt3  (evt2 discarded)
navigate("page1") done → processDeferredEvent → navigate("page3")
```

The intermediate `page2` state is skipped — this is expected behavior.

See `shared/browser-env/popstate-handler.ts` (`createPopstateHandler`) for the implementation — `isTransitioning` flag, `deferredEvent` slot, `processDeferredEvent` continuation in `onSettle`.

## URL Utilities

### browser-env/url-utils.ts — pure functions

All functions in `browser-env/url-utils.ts` (symlink → `shared/browser-env/`) are pure (no side effects, no direct access to globals).

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
The result is normalized to always start with `/` (e.g. base `"/app"` with pathname `"/app"` → `"/"` not `""`).

**`urlToPath(url, base)`**:

Delegates URL parsing to `safeParseUrl` from `browser-env`. The parser is
scheme-agnostic (works with `http(s)://`, `app://`, `tauri://`, `file://`,
etc.) and total — never throws, never returns null. No protocol whitelist,
no `context` parameter. See
[IMPLEMENTATION_NOTES#safeParseUrl](../../IMPLEMENTATION_NOTES.md#safeparseurl--scheme-agnostic-parser-496).
Preserves search params: the result is `extractPath(pathname, base) + search`.

**`buildUrl(path, base)`**:

Simple concatenation: `base + path`.

## Popstate Utilities, Error Recovery

Popstate event handling, critical error recovery, and deferred event processing live in `shared/browser-env/`:

- `shared/browser-env/popstate-utils.ts` — `getRouteFromEvent` (validates `history.state` via `isStateStrict`, falls back to `api.matchPath(browser.getLocation())` when invalid), `updateBrowserState` (legacy), `createUpdateBrowserState` (mutable-buffer factory used by browser-plugin on the hot path)
- `shared/browser-env/popstate-handler.ts` — `createPopstateHandler` (deferred-queue, last-write-wins, `RouterError` vs critical-error split), `createPopstateLifecycle` (popstate listener add/remove + `cleanup` callback)
- `historyState` is a subset of `State`: only `{ name, params, search, path }` are stored in `history.state` — `transition`, `context`, etc. are not persisted across reloads
- Error categorization in `popstate-handler.ts`: `RouterError` instances are routed through `rollbackUrlToCurrentState()` (sync URL with current router state); anything else triggers `recoverFromCriticalError()` (warns + `replaceState` to last good URL)

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
        └── createBrowserPlugin(router, api, options, browser, ...)   ← internal function
              ├── Claims context namespace ("browser")
              ├── Creates updateState = createUpdateBrowserState() (per-instance buffer)
              ├── Registers start interceptor (closure-captured removeStartInterceptor)
              ├── api.extendRouter({buildUrl, matchUrl, replaceHistoryState})
              │     → closure-captured removeExtensions
              └── Returns Plugin { onStart, onStop, onTransitionSuccess, teardown }

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
        ├── shouldReplaceHistory(navOptions, toState, fromState)
        ├── hash = navOptions.hash === undefined ? cached `currentHash` : normalizeHashInput(navOptions.hash)  (#532)
        ├── urlClaim.write(toState, { hash, hashChanged: navOptions.hashChange ?? hash !== publishedPrevHash })
        ├── url = buildUrl(toState.path, base); finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url
        ├── updateState(toState, finalUrl, replaceHistory, browser)  ← reuses buffer (skipped when canSkipPopstateHistoryWrite, #1353)
        └── claim.write(toState, FROZEN_POPSTATE | FROZEN_NAVIGATE)

router.stop()
        │
        ▼
  Plugin.onStop()
        ├── Removes popstate listener (lifecycle.onStop)
        └── Removes the hashchange listener if still owned (#758 / #759)

unsubscribe() or router.dispose()
        │
        ▼
  Plugin.teardown()
        ├── Removes the hashchange listener if still owned (#758 / #759)
        ├── Removes popstate listener (lifecycle.teardown)
        └── cleanup() — removeStartInterceptor(), removeExtensions(), claim.release(), urlClaim.release()
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

### Hash Fragment Support (#532)

URL fragments are first-class state via the `state.context.url` namespace, written by the plugin in `onTransitionSuccess` with tri-state semantics:

```typescript
// factory.ts — onTransitionSuccess
// "preserve" reads the cached `currentHash` (kept fresh by a hashchange listener
// + the plugin's own nav-writes), NOT a per-nav location.hash read (#1019).
const browserHash = currentHash;
const publishedPrevHash =
  (fromState?.context as { url?: { hash?: string } } | undefined)?.url?.hash ??
  "";

const hash =
  navOptions.hash === undefined
    ? browserHash
    : normalizeHashInput(navOptions.hash);

currentHash = hash; // keep the cache in sync with the fragment we are committing

urlClaim.write(
  toState,
  Object.freeze({
    hash,
    // hashChanged compares the chosen hash against the PUBLISHED previous hash
    hashChanged: navOptions.hashChange ?? hash !== publishedPrevHash,
  }),
);

const url = buildUrl(toState.path, options.base);
const finalUrl = hash ? `${url}#${encodeHashFragment(hash)}` : url;
```

- `opts.hash === undefined` (default): preserves the current fragment via the cached `currentHash` — seeded in `onStart` from `getDecodedHash(browser)` (F5 / cold-load), then kept fresh by the plugin's own nav-writes and the `hashchange` listener (external anchor clicks / `location.hash =`).
- `opts.hash === ""`: clears the hash explicitly.
- `opts.hash === "value"`: sets the hash; encoded via `encodeURI(s).replace(/#/g, "%23")` to preserve RFC-3986 sub-delims.

`hashChange: true` is set by the popstate handler on browser-driven hash-only navigation (paired with `force: true` to bypass `SAME_STATES`); otherwise `hashChanged` falls back to `hash !== publishedPrevHash`, so it is `true` for **any** committed hash change (including programmatic `navigate({ hash })`). Recovery paths (`syncUrlToRouterState`, `rollbackUrlToCurrentState`) read `currentState.context.url.hash` to preserve the fragment after guard rejection. See [Wiki › Hash](https://github.com/greydragon888/real-router/wiki/Hash) for the full surface.

## Performance

| Optimization                                               | Location                        | Effect                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `String.startsWith` + `slice`                              | `browser-env/url-utils.ts`      | No regex needed for base path stripping                                                                                                                               |
| `isTransitioning` flag                                     | `browser-env`                   | Blocks concurrent popstate processing without a queue                                                                                                                 |
| Last-write-wins for deferred events                        | `browser-env`                   | Intermediate states are skipped without accumulation                                                                                                                  |
| `historyState` as a subset of `State`                      | `browser-env`                   | Less data stored in `history.state`                                                                                                                                   |
| `createSafeBrowser()` called once                          | `factory.ts`                    | Environment check doesn't repeat                                                                                                                                      |
| `FROZEN_POPSTATE` / `FROZEN_NAVIGATE` constants            | `factory.ts:32-33`              | Pre-frozen `BrowserContext` literals — no `Object.freeze()` allocation per `onTransitionSuccess`                                                                      |
| Mutable `historyState` buffer (`createUpdateBrowserState`) | `browser-env/popstate-utils.ts` | Per-instance closure reuses one `{ name, params, search, path }` object across `pushState`/`replaceState` (browser structured-clones synchronously, so reuse is safe) |
| Memoized `getLocation` (`createDefaultBrowser`)            | `factory.ts:79-97`              | Skips `extractPath + safelyEncodePath` when `(pathname, search)` is unchanged since the last call (popstate-storm benefit)                                            |
| `buildUrl(toState.path, base)` instead of `buildPath`      | `factory.ts:170`                | Skips re-running `buildPath()` in `onTransitionSuccess` — `toState.path` is already final                                                                             |

## Stress Test Coverage

Stress tests in `tests/stress/` validate behavior under extreme conditions:

| Category  | Tests                                                              | What they verify                                                                              |
| --------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Popstate  | popstate-storm, popstate-navigate-interleave                       | Rapid back/forward, popstate during navigation                                                |
| Guards    | cannot-deactivate-storm, mixed-guards                              | canDeactivate guard blocking under rapid back/forward; mixed sync/async timing                |
| State     | corrupted-state-storm, history-state-accumulation, exotic-state    | Corrupted `history.state` recovery, history entry growth, non-cloneable state values          |
| Lifecycle | plugin-lifecycle-churn, teardown-mid-nav, factory-instance-cleanup | Rapid plugin register/unregister, teardown during in-flight navigation, factory pool disposal |
| Memory    | history-state-accumulation (10K + heap snapshot)                   | Heap stability across long-running session                                                    |
| Race      | replace-vs-navigate                                                | `replaceHistoryState` racing concurrent `navigate()` calls                                    |

## Related Documents

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System architecture of the monorepo
- [core/ARCHITECTURE.md](../core/ARCHITECTURE.md) — Core architecture (Plugin API, addInterceptor)
- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents
