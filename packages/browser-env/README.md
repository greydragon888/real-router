# browser-env

> Shared browser API abstractions for Real-Router plugins.

**Internal package** — consumed by `browser-plugin` and `hash-plugin`. Not published to npm.

## Purpose

Extracts all browser-specific logic shared between the two URL plugins: History API wrappers, SSR detection, popstate handling with deferred queue and error recovery, plugin lifecycle management, options validation, and URL utilities.

## Consumers

- `@real-router/browser-plugin` — History API routing
- `@real-router/hash-plugin` — hash-based routing

## Public API

### Browser Abstraction

| Function | Description |
|----------|-------------|
| `createSafeBrowser(getLocation, context)` | Create `Browser` instance — real API in browser, no-op fallback in SSR |
| `isBrowserEnvironment()` | Detect browser via `globalThis.window` + `globalThis.history` |

### Popstate Handling

| Function | Description |
|----------|-------------|
| `createPopstateHandler(deps)` | Create popstate event handler with deferred queue and error recovery |
| `createPopstateLifecycle(deps)` | Create `onStart`/`onStop`/`teardown` hooks for listener management |
| `getRouteFromEvent(evt, api, browser)` | Extract route from popstate event, fallback to URL matching |

### Router Extensions

| Function | Description |
|----------|-------------|
| `createStartInterceptor(api, browser)` | Inject browser location when `router.start()` called without path |
| `createReplaceHistoryState(api, router, browser, buildUrl)` | Replace URL without triggering navigation |

### History Utilities

| Function | Description |
|----------|-------------|
| `shouldReplaceHistory(navOptions, toState, fromState, router)` | Decide `pushState` vs `replaceState` |
| `updateBrowserState(state, url, replace, browser)` | Update `history.state` with state subset |

### URL Utilities

| Function | Description |
|----------|-------------|
| `normalizeBase(base)` | Ensure leading slash, remove trailing slash |
| `safelyEncodePath(path)` | Encode URI path, return original on failure |
| `safeParseUrl(url, context)` | Parse URL with protocol validation (`null` for non-HTTP) |

### Validation

| Function | Description |
|----------|-------------|
| `createOptionsValidator(defaults, context)` | Runtime type validator comparing `typeof` against defaults |

## Popstate Flow

```
popstate event
  ├── transition in progress? → defer (keep only last)
  └── not transitioning:
        ├── valid history.state? → router.navigate(name, params)
        ├── no state, match URL → router.navigate()
        ├── no match + allowNotFound → router.navigateToNotFound()
        ├── no match → router.navigateToDefault()
        ├── RouterError → ignore (expected: CANNOT_DEACTIVATE, etc.)
        └── other error → replaceState to current route (recovery)
      finally: processDeferredEvent()
```

## Key Design Decisions

- **SSR fallback** — `createSafeBrowser` returns no-op implementation with one-time warning per context
- **Deferred queue** — only the **last** deferred popstate event is kept (intermediate states skipped)
- **Critical error recovery** — when guard blocks navigation but browser already changed URL, `replaceState` restores the previous URL
- **History state subset** — only `meta`, `name`, `params`, `path` stored in `history.state` (not the full `State`)
- **State validation** — `isStateStrict` from `type-guards` validates `history.state` (can be corrupted by external code)

## Dependencies

- `@real-router/core` — `State`, `Router`, `PluginApi`, `RouterError` types
- `type-guards` — `isStateStrict` for history state validation

## License

[MIT](../../LICENSE)
