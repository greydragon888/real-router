# router6

[![npm version](https://badge.fury.io/js/router6.svg)](https://www.npmjs.com/package/router6)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Core router implementation for Router6.

## Installation

```bash
npm install real-router
# or
pnpm add real-router
# or
yarn add real-router
# or
bun add real-router
```

## Quick Start

```typescript
import { createRouter } from "real-router";

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

#### `router.cancel()`

Cancels the current navigation.

```typescript
router.cancel();
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

Adds an event listener.

```typescript
router.addEventListener("TRANSITION_START", (toState, fromState) => {
  console.log("Starting:", toState.name);
});

router.addEventListener("TRANSITION_SUCCESS", (toState, fromState) => {
  console.log("Success:", toState.name);
});

router.addEventListener("TRANSITION_ERROR", (toState, fromState, error) => {
  console.error("Error:", error);
});
```

#### `router.removeEventListener(event, listener)`

Removes an event listener.

---

### Plugins

#### `router.usePlugin(plugin)`

Registers a plugin.

```typescript
import { browserPlugin } from "real-router-plugin-browser";

router.usePlugin(browserPlugin());
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

Sets a router option.

```typescript
router.setOption("defaultRoute", "home");
router.setOption("strictTrailingSlash", true);
```

---

### Dependencies

#### `router.getDependencies()`

Returns injected dependencies.

```typescript
const deps = router.getDependencies();
```

#### `router.setDependency(name, value)`

Sets a dependency.

```typescript
router.setDependency("api", apiClient);
```

---

## Options

```typescript
interface Options {
  defaultRoute?: string;           // Default route name
  defaultParams?: Params;          // Default route params
  strictTrailingSlash?: boolean;   // Strict trailing slash matching
  queryParamsMode?: "default" | "strict" | "loose";
  caseSensitive?: boolean;         // Case-sensitive matching
  allowNotFound?: boolean;         // Allow navigation to unknown routes
  autoCleanUp?: boolean;           // Auto cleanup on stop
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

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [createRouter](https://github.com/greydragon888/router6/wiki/createRouter) — factory function
- [start](https://github.com/greydragon888/router6/wiki/start) · [stop](https://github.com/greydragon888/router6/wiki/stop) — lifecycle
- [navigate](https://github.com/greydragon888/router6/wiki/navigate) — navigation
- [State](https://github.com/greydragon888/router6/wiki/State) — state type
- [Route](https://github.com/greydragon888/router6/wiki/Route) — route definition
- [Plugins](https://github.com/greydragon888/router6/wiki/Plugins) — plugin system
- [Middleware](https://github.com/greydragon888/router6/wiki/Middleware) — middleware system

## Related Packages

- [react-router6](https://www.npmjs.com/package/react-router6) — React integration
- [router6-plugin-browser](https://www.npmjs.com/package/router6-plugin-browser) — browser history
- [router6-plugin-logger](https://www.npmjs.com/package/router6-plugin-logger) — debug logging
- [router6-plugin-persistent-params](https://www.npmjs.com/package/router6-plugin-persistent-params) — persistent params
- [router6-helpers](https://www.npmjs.com/package/router6-helpers) — utilities

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
