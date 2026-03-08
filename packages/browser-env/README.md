# browser-env

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> Shared browser API abstractions for Real-Router plugins.

**⚠️ Internal Use Only:** This package is designed for use within the Real-Router monorepo. External users should use `@real-router/browser-plugin` or `@real-router/hash-plugin` directly.

## Overview

`browser-env` provides shared browser abstractions consumed by `browser-plugin` and `hash-plugin`:

- **Browser interface** — unified API for History API operations (`pushState`, `replaceState`, `popstate`)
- **SSR safety** — automatic no-op fallback with one-time warning in non-browser environments
- **Popstate handling** — event → router navigation with deferred queue and critical error recovery
- **Plugin lifecycle** — `onStart`/`onStop`/`teardown` hooks for popstate listener management
- **Options validation** — runtime type checking for plugin configuration
- **URL utilities** — base path normalization, safe encoding, URL parsing with protocol validation

## API

### `createSafeBrowser(getLocation, context)`

Creates a `Browser` instance. Returns real History API wrappers in browser, SSR fallback otherwise.

```typescript
import { createSafeBrowser } from "browser-env";

const browser = createSafeBrowser(
  () => window.location.pathname,
  "browser-plugin",
);

browser.pushState(state, "/users/123");
browser.replaceState(state, "/users/456");
browser.getLocation(); // "/users/456"
browser.getHash(); // "#section"

const unsub = browser.addPopstateListener((evt) => {
  console.log("Back/forward:", evt.state);
});
unsub(); // remove listener
```

---

### `createPopstateHandler(deps)`

Creates a popstate event handler that navigates the router. Handles transition queueing (only the last deferred event is kept) and critical error recovery via `replaceState`.

```typescript
import { createPopstateHandler } from "browser-env";

const handler = createPopstateHandler({
  router,
  api,
  browser,
  allowNotFound: api.getOptions().allowNotFound,
  transitionOptions: { source: "popstate", replace: true },
  loggerContext: "browser-plugin",
  buildUrl: (name, params) => router.buildUrl(name, params),
});
```

**Flow:**

```
popstate event
  ├── transition in progress? → defer event (keep only last)
  ├── valid history.state? → router.navigate(name, params)
  ├── no state? → match URL:
  │     ├── route found → router.navigate()
  │     ├── allowNotFound? → router.navigateToNotFound(browser.getLocation())
  │     └── else → router.navigateToDefault()
  ├── RouterError? → ignore (expected: CANNOT_DEACTIVATE, etc.)
  └── other error? → replaceState to current route (recovery)
```

---

### `createPopstateLifecycle(deps)`

Creates `onStart`, `onStop`, and `teardown` hooks for popstate listener management. Handles cleanup of previous listeners when the factory is reused.

```typescript
import { createPopstateLifecycle } from "browser-env";

const lifecycle = createPopstateLifecycle({
  browser,
  shared, // SharedFactoryState — mutable state across instances
  handler, // popstate handler from createPopstateHandler
  cleanup, // teardown callback (e.g. unsubscribe from router events)
});

// lifecycle.onStart  — attaches popstate listener
// lifecycle.onStop   — detaches popstate listener
// lifecycle.teardown — detaches + calls cleanup
```

---

### `createStartInterceptor(api, browser)`

Interceptor that injects the current browser location when `router.start()` is called without a path argument.

```typescript
import { createStartInterceptor } from "browser-env";

const removeInterceptor = createStartInterceptor(api, browser);
// router.start()     → starts with browser.getLocation()
// router.start(path) → starts with provided path
```

---

### `createReplaceHistoryState(api, router, browser, buildUrl)`

Creates a function to replace browser URL without triggering navigation.

```typescript
import { createReplaceHistoryState } from "browser-env";

const replaceHistoryState = createReplaceHistoryState(
  api,
  router,
  browser,
  buildUrl,
);

replaceHistoryState("users.profile", { id: "456" });
// URL changes, no transition
```

---

### `shouldReplaceHistory(navOptions, toState, fromState, router)`

Determines whether to use `replaceState` or `pushState` for a transition.

```typescript
import { shouldReplaceHistory } from "browser-env";

const replace = shouldReplaceHistory(navOptions, toState, fromState, router);
// true when: navOptions.replace, or first navigation, or reload to same state
```

---

### `getRouteFromEvent(evt, api, browser)`

Extracts route name and params from a popstate event. Falls back to URL matching if `history.state` is invalid.

```typescript
import { getRouteFromEvent } from "browser-env";

const route = getRouteFromEvent(evt, api, browser);
// → { name: "users.profile", params: { id: "123" } }
// → undefined (no matching route)
```

---

### `updateBrowserState(state, url, replace, browser)`

Updates browser history with a subset of router state (`meta`, `name`, `params`, `path`).

```typescript
import { updateBrowserState } from "browser-env";

updateBrowserState(state, "/users/123", false, browser); // pushState
updateBrowserState(state, "/users/123", true, browser); // replaceState
```

---

### `createOptionsValidator(defaults, context)`

Creates a runtime type validator for plugin options. Compares `typeof value` against `typeof defaultOptions[key]`.

```typescript
import { createOptionsValidator } from "browser-env";

const validate = createOptionsValidator(
  { base: "", forceDeactivate: true },
  "browser-plugin",
);

validate({ base: "/app" }); // OK
validate({ base: 123 }); // throws Error
validate(undefined); // OK (no options)
```

---

### `normalizeBase(base)`

Ensures leading slash, removes trailing slash.

```typescript
import { normalizeBase } from "browser-env";

normalizeBase("app"); // "/app"
normalizeBase("/app/"); // "/app"
normalizeBase(""); // ""
```

---

### `safelyEncodePath(path)`

Safely encodes a URI path. Returns original path on encoding failure.

```typescript
import { safelyEncodePath } from "browser-env";

safelyEncodePath("/users/héllo"); // "/users/h%C3%A9llo"
safelyEncodePath("/already%20ok"); // "/already%20ok"
```

---

### `safeParseUrl(url, context)`

Parses a URL with protocol validation. Returns `null` for invalid URLs or non-HTTP protocols.

```typescript
import { safeParseUrl } from "browser-env";

safeParseUrl("/users/123", "browser-plugin");
// → URL { pathname: "/users/123", ... }

safeParseUrl("javascript:alert(1)", "browser-plugin");
// → null (warns, rejects non-HTTP protocol)
```

---

### `isBrowserEnvironment()`

Detects browser environment by checking for `globalThis.window` and `globalThis.history`.

```typescript
import { isBrowserEnvironment } from "browser-env";

isBrowserEnvironment(); // true in browser, false in Node.js/SSR
```

---

### Low-level History API

Direct wrappers around `globalThis.history` and `globalThis.addEventListener`. Used internally by `createSafeBrowser`.

```typescript
import {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "browser-env";
```

## Types

```typescript
import type {
  // Browser abstraction
  HistoryBrowser, // { pushState, replaceState, addPopstateListener, getHash }
  Browser, // HistoryBrowser + { getLocation }
  SharedFactoryState, // { removePopStateListener: (() => void) | undefined }

  // Dependency interfaces
  PopstateHandlerDeps, // deps for createPopstateHandler
  PopstateLifecycleDeps, // deps for createPopstateLifecycle
} from "browser-env";
```

### Type Definitions

```typescript
interface HistoryBrowser {
  pushState: (state: State, path: string) => void;
  replaceState: (state: State, path: string) => void;
  addPopstateListener: (fn: (evt: PopStateEvent) => void) => () => void;
  getHash: () => string;
}

interface Browser extends HistoryBrowser {
  getLocation: () => string;
}

interface SharedFactoryState {
  removePopStateListener: (() => void) | undefined;
}
```

## Architecture

### SSR Fallback Strategy

```
createSafeBrowser(getLocation, context)
  ├── isBrowserEnvironment()? → real History API wrappers
  └── not browser? → createHistoryFallbackBrowser(context)
                      └── all methods no-op, warn once per context
```

### Popstate Event Flow

```
Browser back/forward
  → popstate event
    → handler (createPopstateHandler)
      ├── isTransitioning? → defer (keep only last)
      └── not transitioning:
            ├── getRouteFromEvent() → route found → router.navigate()
            ├── no route + allowNotFound → router.navigateToNotFound(browser.getLocation())
            ├── no route + !allowNotFound → router.navigateToDefault()
            ├── RouterError → ignore (expected)
            └── other error → recoverFromCriticalError() → replaceState
          finally:
            isTransitioning = false
            processDeferredEvent()
```

### History State Shape

Only a subset of router `State` is stored in `history.state`:

```typescript
{
  meta: state.meta,
  name: state.name,
  params: state.params,
  path: state.path,
}
```

## Dependencies

- `@real-router/core` — router types (`State`, `Router`, `PluginApi`, `Plugin`, `RouterError`)
- `type-guards` — `isStateStrict` for history.state validation

## Related Packages

- [@real-router/browser-plugin](../browser-plugin) — History API routing (uses browser-env)
- [@real-router/hash-plugin](../hash-plugin) — hash-based routing (uses browser-env)
- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — core router

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
