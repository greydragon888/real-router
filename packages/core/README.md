# @real-router/core

[![npm](https://img.shields.io/npm/v/@real-router/core.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/core)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/core.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/core)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/core&treeshake=[{createRouter}]&badge=detailed)](https://bundlejs.com/?q=@real-router/core&treeshake=[{createRouter}])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Simple, powerful, view-agnostic, modular and extensible router for JavaScript applications.

This is the core package of the [Real-Router](https://github.com/greydragon888/real-router) monorepo. It provides the router implementation, lifecycle management, navigation pipeline, and tree-shakeable standalone API modules.

## Installation

```bash
npm install @real-router/core
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

const router = createRouter(routes);
router.usePlugin(browserPluginFactory());

await router.start("/");
await router.navigate("users.profile", { id: "123" });
```

## Router API

### Lifecycle

| Method        | Returns          | Description                                    |
| ------------- | ---------------- | ---------------------------------------------- |
| `start(path)` | `Promise<State>` | Start the router with an initial path          |
| `stop()`      | `this`           | Stop the router, cancel in-progress transition |
| `dispose()`   | `void`           | Permanently terminate (cannot restart)         |
| `isActive()`  | `boolean`        | Whether the router is started                  |

### Navigation

| Method                              | Returns          | Description                               |
| ----------------------------------- | ---------------- | ----------------------------------------- |
| `navigate(name, params?, options?)` | `Promise<State>` | Navigate to a route. Fire-and-forget safe |
| `navigateToDefault(options?)`       | `Promise<State>` | Navigate to the default route             |
| `navigateToNotFound(path?)`         | `State`          | Synchronously set UNKNOWN_ROUTE state     |
| `canNavigateTo(name, params?)`      | `boolean`        | Check if guards allow navigation          |

```typescript
await router.navigate("users.profile", { id: "123" });
await router.navigate("dashboard", {}, { replace: true });

// Cancellable navigation
const controller = new AbortController();
router.navigate("users", {}, { signal: controller.signal });
controller.abort();
```

### State

| Method                                             | Returns              | Description                          |
| -------------------------------------------------- | -------------------- | ------------------------------------ |
| `getState()`                                       | `State \| undefined` | Current router state (deeply frozen) |
| `getPreviousState()`                               | `State \| undefined` | Previous router state                |
| `areStatesEqual(s1, s2, ignoreQP?)`                | `boolean`            | Compare two states                   |
| `isActiveRoute(name, params?, strict?, ignoreQP?)` | `boolean`            | Check if route is active             |
| `buildPath(name, params?)`                         | `string`             | Build URL path from route name       |
| `isLeaveApproved()`                                | `boolean`            | True when deactivation guards pass   |

### Events & Plugins

| Method                     | Returns       | Description                                                                                                                                                   |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribe(listener)`      | `Unsubscribe` | Listen to successful transitions                                                                                                                              |
| `subscribeLeave(listener)` | `Unsubscribe` | Subscribe to confirmed route departures. Listener may return `Promise<void>` to block the pipeline (exit animations). Receives `AbortSignal` for cancellation |
| `usePlugin(...plugins)`    | `Unsubscribe` | Register plugin factories                                                                                                                                     |

```typescript
const unsub = router.subscribe(({ route, previousRoute }) => {
  console.log(previousRoute?.name, "->", route.name);
});

// Save scroll position when leaving a route (fires ONLY when departure is confirmed)
const unsubLeave = router.subscribeLeave(({ route }) => {
  if (route.name === "products") {
    sessionStorage.setItem("products:scroll", String(window.scrollY));
  }
});

// Async leave: exit animation blocks navigation until complete
router.subscribeLeave(async ({ signal }) => {
  await animateOut(document.querySelector(".page"), { signal });
});
```

## Standalone API

Tree-shakeable functions imported from `@real-router/core/api`. Only imported functions are bundled.

```typescript
import {
  getRoutesApi,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  cloneRouter,
} from "@real-router/core/api";
```

| Function                     | Purpose               | Key methods                                                                  |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `getRoutesApi(router)`       | Dynamic route CRUD    | `add`, `remove`, `update`, `replace`, `has`, `get`                           |
| `getDependenciesApi(router)` | Dependency injection  | `get`, `set`, `setAll`, `remove`, `has`                                      |
| `getLifecycleApi(router)`    | Guard registration    | `addActivateGuard`, `addDeactivateGuard`, `remove*`                          |
| `getPluginApi(router)`       | Plugin infrastructure | `makeState`, `matchPath`, `addInterceptor`, `extendRouter`, `getRouteConfig` |
| `cloneRouter(router, deps?)` | SSR cloning           | Shares route definitions, independent state                                  |

## Utilities

SSR/SSG helpers imported from `@real-router/core/utils`.

```typescript
import { getStaticPaths, serializeState } from "@real-router/core/utils";

// SSR: XSS-safe data embedding
const json = serializeState({ name: "home", path: "/" });
const html = `<script>window.__STATE__=${json}</script>`;

// SSG: enumerate all URLs for pre-rendering
const paths = await getStaticPaths(router, {
  "users.profile": async () => [{ id: "1" }, { id: "2" }],
});
// → ["/", "/users", "/users/1", "/users/2"]
```

| Function                           | Purpose                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `serializeState(data)`             | XSS-safe JSON serialization for embedding in HTML `<script>` tags                           |
| `getStaticPaths(router, entries?)` | Enumerate leaf routes and build URLs for SSG pre-rendering                                  |
| `StaticPathEntries` (type)         | Type for the `entries` parameter: `Record<string, () => Promise<Record<string, string>[]>>` |

### `getNavigator(router)` (main entry)

Frozen read-only subset of router methods for view layers. Pre-bound, safe to destructure. Imported from `@real-router/core`, not `/api`.

```typescript
import { getNavigator } from "@real-router/core";
```

```typescript
// Dynamic route management
const routes = getRoutesApi(router);
routes.add({ name: "settings", path: "/settings" });
routes.replace(newRoutes); // atomic HMR-safe replacement

// Dependency injection for guards and plugins
const deps = getDependenciesApi(router);
deps.set("authService", authService);

// Global lifecycle guards
const lifecycle = getLifecycleApi(router);
lifecycle.addActivateGuard("admin", (router, getDep) => (toState) => {
  return getDep("authService").isAuthenticated();
});

// SSR — clone with request-scoped deps
const requestRouter = cloneRouter(router, { store: requestStore });
await requestRouter.start(req.url);
```

## Route Configuration

```typescript
import type { Route } from "@real-router/core";

const routes: Route[] = [
  {
    name: "admin",
    path: "/admin",
    canActivate: (router, getDep) => (toState, fromState, signal) => {
      return getDep("authService").isAdmin();
    },
    children: [
      {
        name: "dashboard",
        path: "/dashboard",
        defaultParams: { tab: "overview" },
      },
    ],
  },
  {
    name: "legacy",
    path: "/old-path",
    forwardTo: "home", // URL alias — guards on source are NOT executed
  },
  {
    name: "product",
    path: "/product/:id",
    encodeParams: ({ id }) => ({ id: String(id) }),
    decodeParams: ({ id }) => ({ id: Number(id) }),
  },
];
```

## Error Handling

Navigation errors are instances of `RouterError` with typed error codes:

```typescript
import { RouterError, errorCodes } from "@real-router/core";

try {
  await router.navigate("admin");
} catch (err) {
  if (err instanceof RouterError) {
    // err.code: ROUTE_NOT_FOUND | CANNOT_ACTIVATE | CANNOT_DEACTIVATE
    //           | TRANSITION_CANCELLED | SAME_STATES | DISPOSED | ...
  }
}
```

See [RouterError](https://github.com/greydragon888/real-router/wiki/RouterError) and [Error Codes](https://github.com/greydragon888/real-router/wiki/error-codes) for the full reference.

## Validation

Runtime argument validation is available via [@real-router/validation-plugin](https://www.npmjs.com/package/@real-router/validation-plugin):

```typescript
import { validationPlugin } from "@real-router/validation-plugin";

router.usePlugin(validationPlugin()); // register before start()
await router.start("/");
```

The plugin adds descriptive error messages for every public API call. Register it in development, skip in production.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [Core Concepts](https://github.com/greydragon888/real-router/wiki/core-concepts) — overview and mental model
- [Defining Routes](https://github.com/greydragon888/real-router/wiki/Route) — nesting, path syntax, guards
- [Navigation Lifecycle](https://github.com/greydragon888/real-router/wiki/navigation-lifecycle) — transitions, guards, hooks
- [RouterOptions](https://github.com/greydragon888/real-router/wiki/RouterOptions) — `defaultRoute`, `trailingSlash`, `allowNotFound`, and more
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — interception, extension, events
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/migration-guide)

## Related Packages

| Package                                                                                                      | Description                                                      |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                                       | React integration (`RouterProvider`, hooks, `Link`, `RouteView`) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin)                     | Browser History API and URL synchronization                      |
| [@real-router/hash-plugin](https://www.npmjs.com/package/@real-router/hash-plugin)                           | Hash-based routing                                               |
| [@real-router/rx](https://www.npmjs.com/package/@real-router/rx)                                             | Observable API (`state$`, `events$`, TC39 Observable)            |
| [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin)                       | Development logging                                              |
| [@real-router/persistent-params-plugin](https://www.npmjs.com/package/@real-router/persistent-params-plugin) | Parameter persistence                                            |
| [@real-router/route-utils](https://www.npmjs.com/package/@real-router/route-utils)                           | Route tree queries and segment testing                           |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
