# @real-router/core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Core router implementation for Real-Router.

## Installation

```bash
npm install @real-router/core
# or
pnpm add @real-router/core
# or
yarn add @real-router/core
# or
bun add @real-router/core
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
];

const router = createRouter(routes);

router.start();
router.navigate("users.profile", { id: "123" });
```

## API Reference

### `createRouter(routes?, options?, dependencies?)`

Creates a new router instance.

```typescript
const router = createRouter(
  routes,       // Route[] - route definitions
  options,      // Partial<Options> - router options
  dependencies  // object - dependency injection
);
```

---

## Router Methods

### Lifecycle

#### `router.start(startPath?)`

Starts the router. Optionally accepts an initial path.

```typescript
router.start();
router.start("/users/123");
router.start("/users/123", (err, state) => {
  if (err) console.error(err);
});
```

#### `router.stop()`

Stops the router.

```typescript
router.stop();
```

#### `router.isStarted()`

Returns whether the router is started.

```typescript
if (router.isStarted()) {
  router.navigate("home");
}
```

---

### Navigation

#### `router.navigate(name, params?, options?, done?)`

Navigates to a route by name.

```typescript
router.navigate("users");
router.navigate("users.profile", { id: "123" });
router.navigate("users.profile", { id: "123" }, { replace: true });
router.navigate("users.profile", { id: "123" }, { replace: true }, (err, state) => {
  if (err) console.error(err);
});
```

#### `router.navigateToDefault(options?, done?)`

Navigates to the default route.

```typescript
router.navigateToDefault();
```

#### `router.isNavigating()`

Returns whether a navigation is in progress.

```typescript
if (!router.isNavigating()) {
  router.navigate("home");
}
```

#### Cancelling Navigation

The `navigate()` method returns a cancel function that can be used to abort the navigation.

```typescript
const cancel = router.navigate("users.profile", { id: "123" });

// Later, if you need to cancel:
cancel();
```

---

### State

#### `router.getState()`

Returns the current router state.

```typescript
const state = router.getState();
// { name: "users.profile", params: { id: "123" }, path: "/users/123" }
```

#### `router.getPreviousState()`

Returns the previous router state.

```typescript
const prev = router.getPreviousState();
```

#### `router.setState(state)`

Sets the router state directly (without navigation).

```typescript
router.setState({ name: "home", params: {}, path: "/" });
```

#### `router.areStatesEqual(state1, state2, ignoreQueryParams?)`

Compares two states for equality.

```typescript
router.areStatesEqual(stateA, stateB);
router.areStatesEqual(stateA, stateB, true); // ignore query params
```

---

### Routes

#### `router.addRoute(route)`

Adds a route definition.

```typescript
router.addRoute({ name: "settings", path: "/settings" });
router.addRoute({ name: "settings.profile", path: "/profile" });
```

#### `router.removeRoute(name)`

Removes a route by name.

```typescript
router.removeRoute("settings");
```

#### `router.getRoute(name)`

Gets a route definition by name.

```typescript
const route = router.getRoute("users");
```

#### `router.hasRoute(name)`

Checks if a route exists.

```typescript
if (router.hasRoute("users")) {
  router.navigate("users");
}
```

#### `router.clearRoutes()`

Removes all routes from the router.

```typescript
router.clearRoutes().addRoute([
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
]);
```

#### `router.updateRoute(name, updates)`

Updates configuration of an existing route.

```typescript
router.updateRoute("users", {
  defaultParams: { page: 1 },
  canActivate: authGuard,
});

// Remove configuration by setting to null
router.updateRoute("oldRoute", { forwardTo: null });
```

---

### Path Building & Matching

#### `router.buildPath(name, params?)`

Builds a URL path from route name and params.

```typescript
const path = router.buildPath("users.profile", { id: "123" });
// "/users/123"
```

#### `router.buildState(name, params?)`

Builds a state object from route name and params.

```typescript
const state = router.buildState("users.profile", { id: "123" });
// { name: "users.profile", params: { id: "123" }, path: "/users/123", meta: {...} }
```

#### `router.matchPath(path)`

Matches a URL path to a state.

```typescript
const state = router.matchPath("/users/123");
// { name: "users.profile", params: { id: "123" }, ... }
```

#### `router.isActiveRoute(name, params?, strictEquality?, ignoreQueryParams?)`

Checks if a route is currently active.

```typescript
router.isActiveRoute("users"); // true if current route starts with "users"
router.isActiveRoute("users", { id: "123" }); // true if params match
router.isActiveRoute("users", { id: "123" }, true); // strict equality
```

#### `router.forward(fromRoute, toRoute)`

Sets up route forwarding (redirect).

```typescript
router.forward("old-page", "new-page");
// Navigating to "old-page" will redirect to "new-page"
```

---

### Guards

#### `router.canActivate(name, canActivateFn)`

Registers a guard for route activation.

```typescript
router.canActivate("admin", (toState, fromState, done) => {
  if (!isAuthenticated()) {
    done({ redirect: { name: "login" } });
  } else {
    done();
  }
});
```

#### `router.canDeactivate(name, canDeactivateFn)`

Registers a guard for route deactivation.

```typescript
router.canDeactivate("editor", (toState, fromState, done) => {
  if (hasUnsavedChanges()) {
    done({ error: new Error("Unsaved changes") });
  } else {
    done();
  }
});
```

#### `router.clearCanActivate(name)`

Clears activation guard for a route.

#### `router.clearCanDeactivate(name)`

Clears deactivation guard for a route.

---

### Events & Subscriptions

#### `router.subscribe(listener)`

Subscribes to state changes.

```typescript
const unsubscribe = router.subscribe(({ route, previousRoute }) => {
  console.log("Navigation:", previousRoute?.name, "→", route.name);
});

// Later: unsubscribe()
```

#### `router.addEventListener(event, listener)`

Adds an event listener. Returns an unsubscribe function.

```typescript
import { events } from "@real-router/core";

const unsubscribe = router.addEventListener(events.TRANSITION_START, (toState, fromState) => {
  console.log("Starting:", toState.name);
});

router.addEventListener(events.TRANSITION_SUCCESS, (toState, fromState) => {
  console.log("Success:", toState.name);
});

router.addEventListener(events.TRANSITION_ERROR, (toState, fromState, error) => {
  console.error("Error:", error);
});

// Available events:
// events.ROUTER_START, events.ROUTER_STOP
// events.TRANSITION_START, events.TRANSITION_SUCCESS
// events.TRANSITION_ERROR, events.TRANSITION_CANCEL
```

#### `router.removeEventListener(event, listener)`

Removes an event listener.

---

### Plugins

#### `router.usePlugin(plugin)`

Registers a plugin. Returns an unsubscribe function.

```typescript
import { browserPluginFactory } from "@real-router/browser-plugin";

const unsubscribe = router.usePlugin(browserPluginFactory());

// Later, to remove the plugin:
unsubscribe();
```

---

### Middleware

#### `router.useMiddleware(middleware)`

Registers middleware.

```typescript
router.useMiddleware((router) => (toState, fromState, done) => {
  console.log("Navigating:", toState.name);
  done();
});
```

#### `router.clearMiddleware()`

Clears all middleware.

---

### Options

#### `router.getOptions()`

Returns router options.

```typescript
const options = router.getOptions();
```

#### `router.setOption(name, value)`

Sets a router option. Can only be used before `router.start()`.

```typescript
router.setOption("defaultRoute", "home");
router.setOption("trailingSlash", "never");
```

---

### Dependencies

#### `router.getDependencies()`

Returns a shallow copy of all injected dependencies.

```typescript
const deps = router.getDependencies();
```

#### `router.getDependency(name)`

Returns a specific dependency.

```typescript
const api = router.getDependency("api");
```

#### `router.setDependency(name, value)`

Sets a single dependency.

```typescript
router.setDependency("api", apiClient);
```

#### `router.setDependencies(deps)`

Sets multiple dependencies at once.

```typescript
router.setDependencies({
  api: apiClient,
  logger: console,
  cache: cacheService,
});
```

#### `router.hasDependency(name)`

Checks if a dependency exists.

```typescript
if (router.hasDependency("api")) {
  const api = router.getDependency("api");
}
```

#### `router.removeDependency(name)`

Removes a dependency.

```typescript
router.removeDependency("tempService");
```

#### `router.resetDependencies()`

Removes all dependencies.

```typescript
router.resetDependencies();
```

---

### Cloning

#### `router.clone(dependencies?)`

Creates a clone of the router with the same configuration.

```typescript
// Basic cloning
const clonedRouter = router.clone();

// SSR: Clone with request-specific dependencies
app.get("*", (req, res) => {
  const ssrRouter = router.clone({ request: req });
  ssrRouter.start(req.url, (err, state) => {
    // Render with state...
  });
});
```

---

## Options

```typescript
interface Options {
  defaultRoute: string;            // Default route name (default: "")
  defaultParams: Params;           // Default route params (default: {})
  trailingSlash: "strict" | "never" | "always" | "preserve";  // (default: "preserve")
  caseSensitive: boolean;          // Case-sensitive matching (default: false)
  urlParamsEncoding: "default" | "uri" | "uriComponent" | "none";  // (default: "default")
  queryParamsMode: "default" | "strict" | "loose";  // (default: "loose")
  queryParams?: QueryParamsOptions; // Query parameter parsing options
  allowNotFound: boolean;          // Allow navigation to unknown routes (default: true)
  rewritePathOnMatch: boolean;     // Rewrite path on successful match (default: false)
  logger?: Partial<LoggerConfig>;  // Logger configuration
}
```

## Observable Support

The router implements the Observable interface:

```typescript
import { from } from "rxjs";

from(router).subscribe(({ route, previousRoute }) => {
  console.log("Route changed:", route.name);
});
```

### RouterError

Navigation errors are instances of `RouterError`:

```typescript
import { RouterError, errorCodes } from "@real-router/core";

router.navigate("users", {}, {}, (err, state) => {
  if (err instanceof RouterError) {
    switch (err.code) {
      case errorCodes.ROUTE_NOT_FOUND:
        console.log("Route not found");
        break;
      case errorCodes.CANNOT_ACTIVATE:
        console.log("Activation blocked by guard");
        break;
      case errorCodes.CANNOT_DEACTIVATE:
        console.log("Deactivation blocked by guard");
        break;
      case errorCodes.TRANSITION_CANCELLED:
        console.log("Navigation was cancelled");
        break;
    }
  }
});
```

### Error Codes

```typescript
errorCodes.ROUTER_NOT_STARTED    // "NOT_STARTED"
errorCodes.ROUTER_ALREADY_STARTED // "ALREADY_STARTED"
errorCodes.NO_START_PATH_OR_STATE // "NO_START_PATH_OR_STATE"
errorCodes.ROUTE_NOT_FOUND       // "ROUTE_NOT_FOUND"
errorCodes.SAME_STATES           // "SAME_STATES"
errorCodes.CANNOT_DEACTIVATE     // "CANNOT_DEACTIVATE"
errorCodes.CANNOT_ACTIVATE       // "CANNOT_ACTIVATE"
errorCodes.TRANSITION_ERR        // "TRANSITION_ERR"
errorCodes.TRANSITION_CANCELLED  // "CANCELLED"
```

## Related Packages

- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history
- [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) — Debug logging
- [@real-router/persistent-params-plugin](https://www.npmjs.com/package/@real-router/persistent-params-plugin) — Persistent params
- [@real-router/helpers](https://www.npmjs.com/package/@real-router/helpers) — Utilities

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
