# @real-router/validation-plugin

[![npm](https://img.shields.io/npm/v/@real-router/validation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/validation-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/validation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/validation-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/validation-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/validation-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Runtime validation plugin for [Real-Router](https://github.com/greydragon888/real-router). Activates descriptive type errors and argument checks across all router operations.

## Installation

```bash
npm install @real-router/validation-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { validationPlugin } from "@real-router/validation-plugin";

const router = createRouter(routes);

// Register before start()
router.usePlugin(validationPlugin());

await router.start();
```

That's it. From this point on, every router call validates its arguments and throws a descriptive `TypeError` or `RouterError` on bad input.

## What It Does

Without this plugin, core has structural guards (constructor, plugin registration, dispose) and two invariant guards (subscribe — deferred crash hint, navigateToNotFound — silent corruption prevention). No argument validation for navigation methods. With this plugin, you get the full DX layer:

- Descriptive error messages with method names and received values
- Argument shape checks for every public API call
- `forwardTo` target existence, param compatibility, and cycle detection
- Decoder/encoder async detection (sync required for `matchPath`/`buildPath`)
- Dependency store structure validation
- Limits consistency checks
- Cross-field `Options` diagnostics: `warnListeners > maxListeners`, `callbackIgnoresLevel` without `callback`, `defaultRoute` pointing to a missing route (static at registration, callbacks at first use)

The plugin also runs a **retrospective pass** at registration time, validating routes and dependencies that were added before `usePlugin()` was called.

## Note on Crash Guards

Core's crash guards always run, regardless of whether this plugin is installed. They prevent the router from crashing on null or completely wrong types. This plugin adds the descriptive error layer on top. You don't need this plugin for crash prevention in production.

## API Reference

### `validationPlugin()`

```typescript
function validationPlugin(): PluginFactory;
```

Returns a `PluginFactory` to pass to `router.usePlugin()`. Takes no arguments.

Throws `RouterError("VALIDATION_PLUGIN_AFTER_START")` if the router is already active. Always register before `router.start()`.

```typescript
// Correct
router.usePlugin(validationPlugin());
await router.start();

// Throws VALIDATION_PLUGIN_AFTER_START
await router.start();
router.usePlugin(validationPlugin()); // too late
```

### `RouterValidator` type

```typescript
import type { RouterValidator } from "@real-router/validation-plugin";
```

The full validator interface that core calls into. Re-exported from `@real-router/core/validation`. Useful if you're building a custom validator or testing validator functions directly.

## Retrospective Validation

When you register the plugin, it immediately validates the current state of the router before `start()` runs. This catches problems in routes or dependencies that were added before `usePlugin()`:

```typescript
const router = createRouter([
  { name: "home", path: "/" },
  { name: "home", path: "/duplicate" }, // duplicate name — caught retrospectively
]);

router.usePlugin(validationPlugin()); // throws here
```

If the retrospective pass fails, the plugin rolls back cleanly. The router is left without validation active, and the error propagates to your code.

## What Gets Validated

| Namespace     | Validated operations                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes        | `buildPath`, `matchPath`, `isActiveRoute`, `shouldUpdateNode`, `addRoute`, `removeRoute`, `updateRoute`, `forwardTo` targets and cycles                                                      |
| Options       | `limits` object shape, individual limit values; cross-field `warnListeners ≤ maxListeners`; `logger.callbackIgnoresLevel` requires `logger.callback`; `defaultRoute` callback return value   |
| Dependencies  | `setDependency` args, dependency name format, full store structure                                                                                                                           |
| Plugins       | Plugin count vs `maxPlugins` limit, `addInterceptor` args (method enum + function type)                                                                                                      |
| Lifecycle     | Guard/hook handler type, count vs `maxLifecycleHandlers`                                                                                                                                     |
| Navigation    | `navigate` args, `navigateToDefault` args, `NavigationOptions` shape, `params` validation (navigate, buildPath, canNavigateTo), `start` path validation                                      |
| State         | `makeState` args, `areStatesEqual` args                                                                                                                                                      |
| Event bus     | Event name format, listener args                                                                                                                                                             |
| Retrospective | Existing route tree integrity, `forwardTo` consistency, decoder/encoder types, dependency store structure, limits consistency, static `defaultRoute` resolves to a registered route         |

## Error Messages

All errors from this plugin use a `[router.METHOD]` prefix so you can immediately tell which call failed.

```
[router.navigate] Invalid route name: expected string, got number
[router.navigate] params must be a plain object, got string
[router.start] path must start with "/", got "users/profile"
[router.addInterceptor] Invalid method: "intercept". Must be one of: start, buildPath, forwardState
[router.usePlugin] Plugin limit exceeded (50). Current: 50, Attempting to add: 1.
```

**Error types:**

- `TypeError` — wrong argument type or shape (`navigate(42)`, `addInterceptor("x", "notAFn")`)
- `ReferenceError` — resource not found (`getDependency("missing")`, `updateRoute("nonexistent", ...)`)
- `RangeError` — limit exceeded (`usePlugin()` past `maxPlugins`, `addActivateGuard()` past `maxLifecycleHandlers`)

Retrospective validation errors use `[validation-plugin]` prefix instead, since no specific method was called:

```
[validation-plugin] validateExistingRoutes: duplicate route name "home"
```

## Related Packages

| Package                                                                                  | Description                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required peer dependency)       |
| [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin)   | Development logging with transition tracking |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration              |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
