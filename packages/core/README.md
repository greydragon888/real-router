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
Domain-specific operations (routes, dependencies, guards, plugin infrastructure, cloning) are available through [standalone API functions](#standalone-api) for tree-shaking.

### `createRouter(routes?, options?, dependencies?)`

Creates a new router instance. [Wiki](https://github.com/greydragon888/real-router/wiki/createRouter)

```typescript
const router = createRouter(routes, options, dependencies);
```

---

### Lifecycle

#### `router.start(path): Promise<State>`

Starts the router with an initial path. [Wiki](https://github.com/greydragon888/real-router/wiki/start)

#### `router.stop(): this`

Stops the router. Cancels any in-progress transition. [Wiki](https://github.com/greydragon888/real-router/wiki/stop)

#### `router.dispose(): void`

Permanently terminates the router. Cannot be restarted. [Wiki](https://github.com/greydragon888/real-router/wiki/dispose)

#### `router.isActive(): boolean`

Returns whether the router is active. [Wiki](https://github.com/greydragon888/real-router/wiki/isActive)

---

### Navigation

#### `router.navigate(name, params?, options?): Promise<State>`

Navigates to a route by name. Supports AbortController cancellation. Fire-and-forget safe. [Wiki](https://github.com/greydragon888/real-router/wiki/navigate)

```typescript
await router.navigate("users.profile", { id: "123" });
await router.navigate("users", {}, { replace: true });
```

#### `router.navigateToDefault(options?): Promise<State>`

Navigates to the default route. [Wiki](https://github.com/greydragon888/real-router/wiki/navigateToDefault)

#### `router.navigateToNotFound(path?): State`

Synchronously sets the router to UNKNOWN_ROUTE state. Bypasses the transition pipeline. [Wiki](https://github.com/greydragon888/real-router/wiki/navigateToNotFound)

#### `router.canNavigateTo(name, params?): boolean`

Checks if navigation would be allowed by guards. [Wiki](https://github.com/greydragon888/real-router/wiki/canNavigateTo)

---

### State

#### `router.getState(): State | undefined`

Returns the current router state. [Wiki](https://github.com/greydragon888/real-router/wiki/getState)

#### `router.getPreviousState(): State | undefined`

Returns the previous router state. [Wiki](https://github.com/greydragon888/real-router/wiki/getPreviousState)

#### `router.areStatesEqual(state1, state2, ignoreQueryParams?): boolean`

Compare two states for equality. [Wiki](https://github.com/greydragon888/real-router/wiki/areStatesEqual)

#### `router.shouldUpdateNode(nodeName): (toState, fromState?) => boolean`

Create a predicate to check if a route node should update. [Wiki](https://github.com/greydragon888/real-router/wiki/shouldUpdateNode)

---

### Path Operations

#### `router.buildPath(name, params?): string`

Build URL path from route name. [Wiki](https://github.com/greydragon888/real-router/wiki/buildPath)

#### `router.isActiveRoute(name, params?, strictEquality?, ignoreQueryParams?): boolean`

Check if route is currently active. [Wiki](https://github.com/greydragon888/real-router/wiki/isActiveRoute)

---

### Events

#### `router.subscribe(listener): Unsubscribe`

Subscribes to successful transitions. [Wiki](https://github.com/greydragon888/real-router/wiki/subscribe)

```typescript
const unsub = router.subscribe(({ route, previousRoute }) => {
  console.log(previousRoute?.name, "→", route.name);
});
```

---

### Plugins

#### `router.usePlugin(...plugins): Unsubscribe`

Registers one or more plugins. [Wiki](https://github.com/greydragon888/real-router/wiki/usePlugin)

```typescript
import { browserPluginFactory } from "@real-router/browser-plugin";

router.usePlugin(browserPluginFactory());
```

---

## Standalone API

Tree-shakeable functions for domain-specific operations.

### `getRoutesApi(router)` — Route Management

Add, remove, replace, and query routes at runtime. [Wiki](https://github.com/greydragon888/real-router/wiki/getRoutesApi)

**Methods:** `add`, `remove`, `replace`, `update`, `clear`, `has`, `get`, `getConfig`

### `getDependenciesApi(router)` — Dependencies

Dependency injection container. [Wiki](https://github.com/greydragon888/real-router/wiki/getDependenciesApi)

**Methods:** `get`, `getAll`, `set`, `setAll`, `remove`, `reset`, `has`

### `getLifecycleApi(router)` — Guards

Route activation/deactivation guards. [Wiki](https://github.com/greydragon888/real-router/wiki/getLifecycleApi)

**Methods:** `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard`

### `getPluginApi(router)` — Plugin Infrastructure

Low-level API for plugin authors. State building, path matching, event system, method interception, router extension. [Wiki](https://github.com/greydragon888/real-router/wiki/getPluginApi)

**Methods:** `makeState`, `buildState`, `buildNavigationState`, `forwardState`, `matchPath`, `setRootPath`, `getRootPath`, `addEventListener`, `getOptions`, `getTree`, `addInterceptor`, `extendRouter`

### `getNavigator(router)` — Navigator

Frozen subset of router methods for view layers. Pre-bound, safe to destructure. [Wiki](https://github.com/greydragon888/real-router/wiki/getNavigator)

### `cloneRouter(router, deps?)` — SSR Cloning

Clone router for server-side rendering. [Wiki](https://github.com/greydragon888/real-router/wiki/cloneRouter)

---

## Configuration

See [RouterOptions](https://github.com/greydragon888/real-router/wiki/RouterOptions) for all available options.

---

## Error Handling

Navigation errors are instances of `RouterError`. See [RouterError](https://github.com/greydragon888/real-router/wiki/RouterError) and [Error Codes](https://github.com/greydragon888/real-router/wiki/error-codes) for details.

---

## Observable Support

> Observable API has been moved to `@real-router/rx` package for zero bundle cost.
> See [@real-router/rx](../rx/README.md) for reactive stream APIs.

---

## Documentation

Full documentation available on the [Wiki](https://github.com/greydragon888/real-router/wiki):

- [Creating a Router](https://github.com/greydragon888/real-router/wiki/createRouter)
- [Navigation](https://github.com/greydragon888/real-router/wiki/navigate)
- [State](https://github.com/greydragon888/real-router/wiki/getState)
- [Guards](https://github.com/greydragon888/real-router/wiki/getLifecycleApi)
- [Plugins](https://github.com/greydragon888/real-router/wiki/usePlugin)
- [Error Codes](https://github.com/greydragon888/real-router/wiki/error-codes)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/migration-guide)

---

## Related Packages

- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history
- [@real-router/hash-plugin](https://www.npmjs.com/package/@real-router/hash-plugin) — Hash-based routing
- [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) — Debug logging
- [@real-router/persistent-params-plugin](https://www.npmjs.com/package/@real-router/persistent-params-plugin) — Persistent params
- [@real-router/route-utils](https://www.npmjs.com/package/@real-router/route-utils) — Route tree queries and segment testing utilities

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
