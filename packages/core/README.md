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
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
];

const router = createRouter(routes);

router.start();
router.navigate("users.profile", { id: "123" });
```

---

## Essential API

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

#### `router.start(startPath?, done?)`

Starts the router. [Wiki](https://github.com/greydragon888/real-router/wiki/start)

```typescript
router.start();
router.start("/users/123");
router.start("/users/123", (err, state) => {
  if (err) console.error(err);
});
```

#### `router.stop()`

Stops the router. [Wiki](https://github.com/greydragon888/real-router/wiki/stop)

#### `router.isActive()`

Returns whether the router is active (started and has current state). [Wiki](https://github.com/greydragon888/real-router/wiki/isActive)

---

### Navigation

#### `router.navigate(name, params?, options?, done?)`

Navigates to a route by name. Returns a cancel function. [Wiki](https://github.com/greydragon888/real-router/wiki/navigate)

```typescript
router.navigate("users");
router.navigate("users.profile", { id: "123" });
router.navigate("users.profile", { id: "123" }, { replace: true });

// With callback
router.navigate("users", {}, {}, (err, state) => {
  if (err) console.error(err);
});

// Cancellation
const cancel = router.navigate("users.profile", { id: "123" });
cancel(); // abort navigation
```

#### `router.getState()`

Returns the current router state. [Wiki](https://github.com/greydragon888/real-router/wiki/getState)

```typescript
const state = router.getState();
// { name: "users.profile", params: { id: "123" }, path: "/users/123" }
```

#### `router.navigateToDefault(options?, done?)`

Navigates to the default route. [Wiki](https://github.com/greydragon888/real-router/wiki/navigateToDefault)

---

### Guards

#### `router.addActivateGuard(name, guardFactory)`

Registers a guard for route activation. [Wiki](https://github.com/greydragon888/real-router/wiki/canActivate)

```typescript
router.addActivateGuard("admin", () => (toState, fromState, done) => {
  if (!isAuthenticated()) {
    done({ redirect: { name: "login" } });
  } else {
    done();
  }
});
```

#### `router.addDeactivateGuard(name, guardFactory)`

Registers a guard for route deactivation. [Wiki](https://github.com/greydragon888/real-router/wiki/canDeactivate)

```typescript
router.addDeactivateGuard("editor", () => (toState, fromState, done) => {
  if (hasUnsavedChanges()) {
    done({ error: new Error("Unsaved changes") });
  } else {
    done();
  }
});
```

---

### Events

#### `router.subscribe(listener)`

Subscribes to successful transitions. [Wiki](https://github.com/greydragon888/real-router/wiki/subscribe)

```typescript
const unsubscribe = router.subscribe(({ route, previousRoute }) => {
  console.log("Navigation:", previousRoute?.name, "→", route.name);
});
```

#### `router.addEventListener(event, listener)`

Adds an event listener. Returns an unsubscribe function. [Wiki](https://github.com/greydragon888/real-router/wiki/addEventListener)

```typescript
import { events } from "@real-router/core";

const unsubscribe = router.addEventListener(
  events.TRANSITION_START,
  (toState, fromState) => {
    console.log("Starting:", toState.name);
  },
);

// To remove listener, call the returned unsubscribe function
unsubscribe();

// Available events:
// ROUTER_START, ROUTER_STOP
// TRANSITION_START, TRANSITION_SUCCESS, TRANSITION_ERROR, TRANSITION_CANCEL
```

---

### Plugins

#### `router.usePlugin(pluginFactory)`

Registers a plugin. Returns an unsubscribe function. [Wiki](https://github.com/greydragon888/real-router/wiki/usePlugin)

```typescript
import { browserPluginFactory } from "@real-router/browser-plugin";

const unsubscribe = router.usePlugin(browserPluginFactory());
```

---

### Middleware

#### `router.useMiddleware(middlewareFactory)`

Registers middleware for the navigation pipeline. [Wiki](https://github.com/greydragon888/real-router/wiki/useMiddleware)

```typescript
router.useMiddleware((router) => (toState, fromState, done) => {
  console.log("Navigating:", toState.name);
  done();
});
```

#### `router.clearMiddleware()`

Clear all middleware.\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/clearMiddleware)

---

## Advanced API

### Routes

#### `router.addRoute(route: Route): void`

Add a route definition at runtime.\
`route: Route` — route configuration object\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/addRoute)

#### `router.removeRoute(name: string): void`

Remove a route by name.\
`name: string` — route name to remove\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/removeRoute)

#### `router.getRoute(name: string): Route | undefined`

Get route definition by name.\
`name: string` — route name\
Returns: `Route | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/getRoute)

#### `router.hasRoute(name: string): boolean`

Check if a route exists.\
`name: string` — route name\
Returns: `boolean`\
[Wiki](https://github.com/greydragon888/real-router/wiki/hasRoute)

#### `router.clearRoutes(): void`

Remove all routes.
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/clearRoutes)

#### `router.updateRoute(name: string, updates: Partial<Route>): void`

Update route configuration.\
`name: string` — route name\
`updates: Partial<Route>` — properties to update\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/updateRoute)

**Note:** To set up route forwarding (redirect), use the `forwardTo` option in route configuration:

```typescript
router.addRoute({ name: "old-url", path: "/old", forwardTo: "new-url" });
// Or update existing route
router.updateRoute("old-url", { forwardTo: "new-url" });
```

---

### State Utilities

#### `router.getPreviousState(): State | undefined`

Get previous router state.\
Returns: `State | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/getPreviousState)

#### `router.shouldUpdateNode(nodeName: string): (toState, fromState?) => boolean`

Create a predicate to check if a route node should update during transition.\
`nodeName: string` — route node name\
Returns: predicate function\
[Wiki](https://github.com/greydragon888/real-router/wiki/shouldUpdateNode)

#### `router.areStatesEqual(state1: State, state2: State, ignoreQueryParams?: boolean): boolean`

Compare two states for equality.\
`state1: State` — first state\
`state2: State` — second state\
`ignoreQueryParams?: boolean` — ignore query params (default: true)\
Returns: `boolean`\
[Wiki](https://github.com/greydragon888/real-router/wiki/areStatesEqual)

---

### Path Operations

#### `router.buildPath(name: string, params?: Params): string`

Build URL path from route name.\
`name: string` — route name\
`params?: Params` — route parameters\
Returns: `string`\
[Wiki](https://github.com/greydragon888/real-router/wiki/buildPath)

#### `router.buildUrl(name: string, params?: Params, options?: object): string`

Build full URL from route name (includes base path and query string).\
`name: string` — route name\
`params?: Params` — route parameters\
`options?: object` — URL building options\
Returns: `string`\
[Wiki](https://github.com/greydragon888/real-router/wiki/buildUrl)

#### `router.isActiveRoute(name: string, params?: Params, strictEquality?: boolean, ignoreQueryParams?: boolean): boolean`

Check if route is currently active.\
`name: string` — route name\
`params?: Params` — route parameters\
`strictEquality?: boolean` — exact match (default: false)\
`ignoreQueryParams?: boolean` — ignore query params (default: true)\
Returns: `boolean`\
[Wiki](https://github.com/greydragon888/real-router/wiki/isActiveRoute)

---

### Dependencies

#### `router.getDependency(name: string): unknown`

Get a dependency by name.\
`name: string` — dependency name\
Returns: `unknown`\
[Wiki](https://github.com/greydragon888/real-router/wiki/getDependency)

#### `router.getDependencies(): Dependencies`

Get all dependencies.\
Returns: `Dependencies`\
[Wiki](https://github.com/greydragon888/real-router/wiki/getDependencies)

#### `router.setDependency(name: string, value: unknown): void`

Set a dependency.\
`name: string` — dependency name\
`value: unknown` — dependency value\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/setDependency)

#### `router.setDependencies(deps: Dependencies): void`

Set multiple dependencies.\
`deps: Dependencies` — dependencies object\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/setDependencies)

#### `router.hasDependency(name: string): boolean`

Check if dependency exists.\
`name: string` — dependency name\
Returns: `boolean`\
[Wiki](https://github.com/greydragon888/real-router/wiki/hasDependency)

#### `router.removeDependency(name: string): void`

Remove a dependency.\
`name: string` — dependency name\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/removeDependency)

#### `router.resetDependencies(): void`

Remove all dependencies.\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/resetDependencies)

---

### Options

#### `router.getOptions(): Options`

Get all router options.\
Returns: `Options`\
[Wiki](https://github.com/greydragon888/real-router/wiki/getOptions)

---

### Other

#### `router.clone(dependencies?: Dependencies): Router`

Clone router for SSR.\
`dependencies?: Dependencies` — override dependencies\
Returns: `Router`\
[Wiki](https://github.com/greydragon888/real-router/wiki/clone)

#### `router.cancel(): void`

Cancel the current navigation in progress.\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/cancel)

---

## Plugin Development API

The following methods are designed for **plugin authors**. They provide low-level access for advanced use cases like browser history integration, persistent parameters, and custom navigation sources.

These methods are stable but intended for plugin development, not application code.

#### `router.matchPath(path: string, source?: string): State | undefined`

Match URL path to route state.\
`path: string` — URL path to match\
`source?: string` — navigation source identifier\
Returns: `State | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/matchPath)

#### `router.makeState(name, params?, path?, meta?, forceId?): State`

Create State with custom `meta.id` for history restoration.\
`name: string` — route name\
`params?: Params` — route parameters\
`path?: string` — URL path\
`meta?: object` — metadata\
`forceId?: number` — force specific `meta.id` value\
Returns: `State`\
[Wiki](https://github.com/greydragon888/real-router/wiki/makeState)

#### `router.buildState(name: string, params?: Params): State | undefined`

Validate route and build state with segment metadata.\
`name: string` — route name\
`params?: Params` — route parameters\
Returns: `State | undefined`\
[Wiki](https://github.com/greydragon888/real-router/wiki/buildState)

#### `router.forwardState(name: string, params: Params): { name: string; params: Params }`

Resolve route forwarding and merge default params.\
`name: string` — route name\
`params: Params` — route parameters\
Returns: `{ name, params }` — resolved route name and merged params\
[Wiki](https://github.com/greydragon888/real-router/wiki/forwardState)

#### `router.navigateToState(toState, fromState, opts, done, emitSuccess): CancelFn`

Navigate with pre-built State object.\
`toState: State` — target state\
`fromState: State | undefined` — current state\
`opts: NavigationOptions` — navigation options\
`done: DoneFn` — callback\
`emitSuccess: boolean` — whether to emit TRANSITION_SUCCESS\
Returns: `CancelFn`\
[Wiki](https://github.com/greydragon888/real-router/wiki/navigateToState)

#### `router.setRootPath(rootPath: string): void`

Dynamically modify router base path.\
`rootPath: string` — new root path prefix\
Returns: `void`\
[Wiki](https://github.com/greydragon888/real-router/wiki/setRootPath)

#### `router.getRootPath(): string`

Read current base path.\
Returns: `string`\
[Wiki](https://github.com/greydragon888/real-router/wiki/getRootPath)

---

## Configuration

```typescript
interface Options {
  defaultRoute: string; // Default route name (default: "")
  defaultParams: Params; // Default route params (default: {})
  trailingSlash: "strict" | "never" | "always" | "preserve"; // (default: "preserve")
  urlParamsEncoding: "default" | "uri" | "uriComponent" | "none"; // (default: "default")
  queryParamsMode: "default" | "strict" | "loose"; // (default: "loose")
  queryParams?: QueryParamsOptions; // Query parameter parsing options
  allowNotFound: boolean; // Allow navigation to unknown routes (default: true)
  rewritePathOnMatch: boolean; // Rewrite path on successful match (default: false)
  logger?: Partial<LoggerConfig>; // Logger configuration
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

router.navigate("users", {}, {}, (err, state) => {
  if (err instanceof RouterError) {
    console.log(err.code, err.message);
  }
});
```

| Code                | Description                    |
| ------------------- | ------------------------------ |
| `ROUTE_NOT_FOUND`   | Route doesn't exist            |
| `CANNOT_ACTIVATE`   | Blocked by canActivate guard   |
| `CANNOT_DEACTIVATE` | Blocked by canDeactivate guard |
| `CANCELLED`         | Navigation was cancelled       |
| `SAME_STATES`       | Already at target route        |
| `NOT_STARTED`       | Router not started             |
| `ALREADY_STARTED`   | Router already started         |

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
