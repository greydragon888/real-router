# @real-router/browser-plugin

[![npm](https://img.shields.io/npm/v/@real-router/browser-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/browser-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/browser-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/browser-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/browser-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/browser-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Browser History API integration for [Real-Router](https://github.com/greydragon888/real-router). Synchronizes router state with browser URL and handles back/forward navigation.

## Installation

```bash
npm install @real-router/browser-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users/:id" },
]);

router.usePlugin(browserPluginFactory());
await router.start(); // path inferred from browser location
```

## Options

```typescript
router.usePlugin(
  browserPluginFactory({
    base: "/app", // Base path prefix for all routes
    forceDeactivate: true, // Bypass canDeactivate guards on back/forward
  }),
);
```

| Option            | Type      | Default | Description                                                            |
| ----------------- | --------- | ------- | ---------------------------------------------------------------------- |
| `base`            | `string`  | `""`    | Base path for all routes (e.g., `"/app"` → URLs start with `/app/...`) |
| `forceDeactivate` | `boolean` | `true`  | Bypass `canDeactivate` guards on browser back/forward                  |

> **Hash routing?** Use [`@real-router/hash-plugin`](https://www.npmjs.com/package/@real-router/hash-plugin) instead.

## Router Extensions

The plugin extends the router instance with three methods via [`extendRouter()`](https://github.com/greydragon888/real-router/wiki/plugin-architecture):

| Method                                       | Returns              | Description                                      |
| -------------------------------------------- | -------------------- | ------------------------------------------------ |
| `buildUrl(name, params?)`                    | `string`             | Build full URL with base path                    |
| `matchUrl(url)`                              | `State \| undefined` | Parse URL to router state                        |
| `replaceHistoryState(name, params?, title?)` | `void`               | Update browser URL without triggering navigation |

```typescript
router.buildUrl("users", { id: "123" });
// => "/app/users/123" (with base "/app")

router.matchUrl("/app/users/123");
// => { name: "users", params: { id: "123" }, path: "/users/123" }

// Update URL silently (no transition, no guards)
router.replaceHistoryState("users", { id: "456" });
```

### `buildUrl` vs `buildPath`

```typescript
router.buildPath("users", { id: 1 }); // "/users/1"       — core, no base
router.buildUrl("users", { id: 1 }); // "/app/users/1"   — plugin, with base
```

### `replaceHistoryState` vs `navigate({ replace: true })`

```typescript
router.replaceHistoryState(name, params); // URL only, no transition
router.navigate(name, params, { replace: true }); // Full transition + URL update
```

## Form Protection

Set `forceDeactivate: false` to respect `canDeactivate` guards on back/forward:

```typescript
router.usePlugin(browserPluginFactory({ forceDeactivate: false }));

import { getLifecycleApi } from "@real-router/core/api";

const lifecycle = getLifecycleApi(router);
lifecycle.addDeactivateGuard(
  "checkout",
  (router, getDep) => (toState, fromState) => {
    return !hasUnsavedChanges(); // false blocks back/forward
  },
);
```

## SSR Support

The plugin is SSR-safe — automatically detects the environment and falls back to no-ops:

```typescript
// Server-side — no errors, methods return safe defaults
router.usePlugin(browserPluginFactory());
router.buildUrl("home"); // returns path without base
router.matchUrl("/path"); // returns undefined
```

## Documentation

Full documentation: [Wiki — browser-plugin](https://github.com/greydragon888/real-router/wiki/browser-plugin)

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/browser-plugin#3-configuration-options)
- [Lifecycle Hooks](https://github.com/greydragon888/real-router/wiki/browser-plugin#4-lifecycle-hooks)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/browser-plugin#8-behavior)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/browser-plugin#11-migration-from-router5)

## Related Packages

| Package                                                                                | Description                            |
| -------------------------------------------------------------------------------------- | -------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                   | Core router (required peer dependency) |
| [@real-router/hash-plugin](https://www.npmjs.com/package/@real-router/hash-plugin)     | Hash-based routing (`#/path`)          |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                 | React integration                      |
| [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) | Development logging                    |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
