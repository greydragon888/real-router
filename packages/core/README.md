# @real-router/core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Core router implementation for Real-Router.

## Installation

```bash
npm install @real-router/core
# or
pnpm add @real-router/core
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

const router = createRouter(routes);

await router.start("/");
await router.navigate("users.profile", { id: "123" });
```

---

## Router API

The Router class provides core lifecycle, navigation, state, and subscription methods. 
Domain-specific operations (routes, dependencies, guards, plugin infrastructure, cloning) are available through standalone API functions for tree-shaking.

### `createRouter(routes?, options?, dependencies?)`

Creates a new router instance. [Wiki](https://github.com/greydragon888/real-router/wiki/createRouter)

```typescript
const router = createRouter(
  routes, // Route[] - route definitions
  options, // Partial<Options> - router options
  dependencies, // object - dependency injection
);
```

---

### Lifecycle

#### `router.start(path): Promise<State>`

Starts the router with an initial path. Returns a Promise that resolves with the matched state. [Wiki](https://github.com/greydragon888/real-router/wiki/start)

```typescript
const state = await router.start("/users/123");
```

#### `router.stop(): this`

Stops the router. Cancels any in-progress transition. [Wiki](https://github.com/greydragon888/real-router/wiki/stop)

#### `router.dispose(): void`

Permanently terminates the router. Unlike `stop()`, it cannot be restarted. All mutating methods throw `RouterError(DISPOSED)` after disposal. Idempotent. [Wiki](https://github.com/greydragon888/real-router/wiki/dispose)

#### `router.isActive(): boolean`

Returns whether the router is active (not idle and not disposed). [Wiki](https://github.com/greydragon888/real-router/wiki/isActive)

---

### Navigation

All navigation methods return `Promise<State>`.

#### `router.navigate(name, params?, options?): Promise<State>`

Navigates to a route by name. [Wiki](https://github.com/greydragon888/real-router/wiki/navigate)

```typescript
const state = await router.navigate("users.profile", { id: "123" });

// With navigation options
await router.navigate("users", {}, { replace: true });

// Concurrent navigation cancels previous
router.navigate("slow-route");
router.navigate("fast-route"); // Previous rejects with TRANSITION_CANCELLED

// Cancel via AbortController
const controller = new AbortController();
router.navigate("route", {}, { signal: controller.signal });
controller.abort(); // rejects with TRANSITION_CANCELLED

// Timeout
router.navigate("route", {}, { signal: AbortSignal.timeout(5000) });

// Error handling
try {
  await router.navigate("admin");
} catch (err) {
  if (err instanceof RouterError) {
    // ROUTE_NOT_FOUND, CANNOT_ACTIVATE, CANNOT_DEACTIVATE,
    // TRANSITION_CANCELLED, SAME_STATES, ROUTER_DISPOSED
  }
}
```

**Fire-and-forget safe:** calling `router.navigate(...)` without `await` suppresses expected errors (`SAME_STATES`, `TRANSITION_CANCELLED`, `ROUTER_NOT_STARTED`, `ROUTE_NOT_FOUND`).

#### `router.navigateToDefault(options?): Promise<State>`

Navigates to the default route. [Wiki](https://github.com/greydragon888/real-router/wiki/navigateToDefault)

#### `router.canNavigateTo(name, params?): boolean`

Synchronously checks if navigation to a route would be allowed by guards. [Wiki](https://github.com/greydragon888/real-router/wiki/canNavigateTo)

---

### State

#### `router.getState(): State | undefined`

Returns the current router state. [Wiki](https://github.com/greydragon888/real-router/wiki/getState)

```typescript
const state = router.getState();
// { name: "users.profile", params: { id: "123" }, path: "/users/123" }
```

#### `router.getPreviousState(): State | undefined`

Returns the previous router state. [Wiki](https://github.com/greydragon888/real-router/wiki/getPreviousState)

#### `router.areStatesEqual(state1, state2, ignoreQueryParams?): boolean`

Compare two states for equality. Query params ignored by default. [Wiki](https://github.com/greydragon888/real-router/wiki/areStatesEqual)

#### `router.shouldUpdateNode(nodeName): (toState, fromState?) => boolean`

Create a predicate to check if a route node should update during transition. [Wiki](https://github.com/greydragon888/real-router/wiki/shouldUpdateNode)

---

### Path Operations

#### `router.buildPath(name, params?): string`

Build URL path from route name. [Wiki](https://github.com/greydragon888/real-router/wiki/buildPath)

```typescript
const path = router.buildPath("users.profile", { id: "123" });
// "/users/123"
```

#### `router.isActiveRoute(name, params?, strictEquality?, ignoreQueryParams?): boolean`

Check if route is currently active. [Wiki](https://github.com/greydragon888/real-router/wiki/isActiveRoute)

---

### Events

#### `router.subscribe(listener): Unsubscribe`

Subscribes to successful transitions. [Wiki](https://github.com/greydragon888/real-router/wiki/subscribe)

```typescript
const unsubscribe = router.subscribe(({ route, previousRoute }) => {
  console.log("Navigation:", previousRoute?.name, "->", route.name);
});
```

---

### Navigator

#### `getNavigator(router): Navigator`

Returns a frozen subset of router methods for passing to view layers (React, Vue, etc.). All methods are pre-bound — safe to destructure. [Wiki](https://github.com/greydragon888/real-router/wiki/getNavigator)

```typescript
import { getNavigator } from "@real-router/core";

const navigator = getNavigator(router);
// { navigate, getState, isActiveRoute, canNavigateTo, subscribe }
```

---

### Plugins

#### `router.usePlugin(...plugins): Unsubscribe`

Registers one or more plugins. Returns an unsubscribe function. [Wiki](https://github.com/greydragon888/real-router/wiki/usePlugin)

```typescript
import { browserPluginFactory } from "@real-router/browser-plugin";

const unsubscribe = router.usePlugin(browserPluginFactory());
```

---

## Standalone API

Standalone functions provide domain-specific operations. They are tree-shakeable — only imported functions are bundled.

### Routes — `getRoutesApi(router)`

Runtime route management. [Wiki](https://github.com/greydragon888/real-router/wiki/getRoutesApi)

```typescript
import { getRoutesApi } from "@real-router/core";

const routes = getRoutesApi(router);

// Add routes
routes.add({ name: "settings", path: "/settings" });
routes.add({ name: "profile", path: "/:id" }, { parent: "users" });

// Query
routes.has("users"); // true
routes.get("users"); // Route | undefined

// Modify
routes.update("users", { forwardTo: "users.list" });
routes.remove("settings");
routes.clear();

// Atomic replacement (HMR, feature flags)
routes.replace([
  { name: "home", path: "/" },
  { name: "dashboard", path: "/dashboard" },
]);
// Preserves state (if route exists), external guards, one tree rebuild
```

**Methods:** `add`, `remove`, `replace`, `update`, `clear`, `has`, `get`, `getConfig`

### Dependencies — `getDependenciesApi(router)`

Dependency injection container. [Wiki](https://github.com/greydragon888/real-router/wiki/getDependenciesApi)

```typescript
import { getDependenciesApi } from "@real-router/core";

const deps = getDependenciesApi(router);

deps.set("authService", authService);
deps.get("authService"); // authService
deps.has("authService"); // true
deps.getAll(); // { authService: ... }
deps.remove("authService");
deps.reset();
```

**Methods:** `get`, `getAll`, `set`, `setAll`, `remove`, `reset`, `has`

### Guards — `getLifecycleApi(router)`

Route activation/deactivation guards. [Wiki](https://github.com/greydragon888/real-router/wiki/getLifecycleApi)

```typescript
import { getLifecycleApi } from "@real-router/core";

const lifecycle = getLifecycleApi(router);

// Guard returns boolean or Promise<boolean> (true = allow, false = block)
lifecycle.addActivateGuard("admin", () => (toState, fromState) => {
  return isAuthenticated(); // sync
});

lifecycle.addDeactivateGuard("editor", () => async (toState, fromState) => {
  return !(await checkUnsavedChanges()); // async
});

// Guards receive AbortSignal for cooperative cancellation
lifecycle.addActivateGuard("dashboard", () => async (toState, fromState, signal) => {
  const res = await fetch("/api/auth", { signal }); // auto-cancelled on abort
  return res.ok;
});

// Remove guards
lifecycle.removeActivateGuard("admin");
lifecycle.removeDeactivateGuard("editor");
```

**Methods:** `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard`

### Plugin Infrastructure — `getPluginApi(router)`

Low-level API for plugin authors. Provides access to state building, path matching, event system, and navigation. [Wiki](https://github.com/greydragon888/real-router/wiki/getPluginApi)

```typescript
import { getPluginApi } from "@real-router/core";

const api = getPluginApi(router);

// State building
const state = api.matchPath("/users/123");
const builtState = api.makeState("users.profile", { id: "123" });

// Event system
const unsub = api.addEventListener(events.TRANSITION_START, (toState, fromState) => {
  console.log("Starting:", toState.name);
});

// Navigation with pre-built state
await api.navigateToState(toState, fromState, opts);

// Root path management
api.setRootPath("/app");
api.getRootPath(); // "/app"

// Forward state interception (used by persistent-params-plugin)
api.setForwardState((name, params) => ({ name, params: withPersistent(params) }));
```

**Methods:** `makeState`, `buildState`, `buildNavigationState`, `forwardState`, `matchPath`, `setRootPath`, `getRootPath`, `navigateToState`, `addEventListener`, `getOptions`, `getTree`, `getForwardState`, `setForwardState`

### SSR Cloning — `cloneRouter(router, deps?)`

Clone router for server-side rendering. [Wiki](https://github.com/greydragon888/real-router/wiki/cloneRouter)

```typescript
import { cloneRouter } from "@real-router/core";

// Server: clone router per request
const serverRouter = cloneRouter(router, { request: req });
await serverRouter.start(req.url);
```

Rebuilds route tree from definitions, copies mutable state (dependencies, options, plugins, guards). Each clone gets an independent tree.

---

## Configuration

```typescript
interface Options {
  defaultRoute: string | DefaultRouteCallback; // Default route name (default: "")
  defaultParams: Params | DefaultParamsCallback; // Default route params (default: {})
  trailingSlash: "strict" | "never" | "always" | "preserve"; // (default: "preserve")
  urlParamsEncoding: "default" | "uri" | "uriComponent" | "none"; // (default: "default")
  queryParamsMode: "default" | "strict" | "loose"; // (default: "loose")
  queryParams?: QueryParamsOptions; // Query parameter parsing options
  allowNotFound: boolean; // Allow navigation to unknown routes (default: true)
  rewritePathOnMatch: boolean; // Rewrite path on successful match (default: false)
  logger?: Partial<LoggerConfig>; // Logger configuration
  limits?: Partial<LimitsConfig>; // Resource limits (max plugins, listeners, etc.)
  noValidate?: boolean; // Skip argument validation in production (default: false)
}
```

See [RouterOptions](https://github.com/greydragon888/real-router/wiki/RouterOptions) for detailed documentation.

---

## Observable Support

> **Note**: Observable API has been moved to `@real-router/rx` package for zero bundle cost.
> See [@real-router/rx](../rx/README.md) for reactive stream APIs including `state$()`, `events$()`, operators, and TC39 Observable support.

---

## Error Handling

Navigation errors are instances of `RouterError`:

```typescript
import { RouterError, errorCodes } from "@real-router/core";

try {
  await router.navigate("users");
} catch (err) {
  if (err instanceof RouterError) {
    console.log(err.code, err.message);
  }
}
```

| Code                     | Description                       |
| ------------------------ | --------------------------------- |
| `ROUTE_NOT_FOUND`        | Route doesn't exist               |
| `CANNOT_ACTIVATE`        | Blocked by canActivate guard      |
| `CANNOT_DEACTIVATE`      | Blocked by canDeactivate guard    |
| `CANCELLED`              | Navigation was cancelled          |
| `SAME_STATES`            | Already at target route           |
| `NOT_STARTED`            | Router not started                |
| `NO_START_PATH_OR_STATE` | `start()` called without a path   |
| `ALREADY_STARTED`        | Router already started            |
| `TRANSITION_ERR`         | Generic transition error          |
| `DISPOSED`               | Router has been disposed          |

See [RouterError](https://github.com/greydragon888/real-router/wiki/RouterError) and [Error Codes](https://github.com/greydragon888/real-router/wiki/error-codes) for details.

---

## Migration from router5

See the [Migration Guide](https://github.com/greydragon888/real-router/wiki/migration-guide) for detailed guidance.

---

## Related Packages

- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history
- [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) — Debug logging
- [@real-router/persistent-params-plugin](https://www.npmjs.com/package/@real-router/persistent-params-plugin) — Persistent params
- [@real-router/helpers](https://www.npmjs.com/package/@real-router/helpers) — Utilities

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
