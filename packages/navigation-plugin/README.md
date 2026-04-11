# @real-router/navigation-plugin

[![npm](https://img.shields.io/npm/v/@real-router/navigation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/navigation-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/navigation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/navigation-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/navigation-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/navigation-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Navigation API integration for [Real-Router](https://github.com/greydragon888/real-router). Drop-in replacement for browser-plugin with route-level history access.

## Installation

```bash
npm install @real-router/navigation-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { navigationPluginFactory } from "@real-router/navigation-plugin";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users/:id" },
]);

router.usePlugin(navigationPluginFactory());
await router.start(); // path inferred from browser location
```

## Why Navigation API?

The [Navigation API](https://caniuse.com/mdn-api_navigation) (~89% browser support) gives you access to the full session history as structured data. Unlike the History API, you can inspect every entry, check what routes the user has visited, and traverse directly to a specific past entry.

```typescript
// Not possible with browser-plugin:
router.peekBack(); // what's one step back?
router.hasVisited("checkout"); // did the user visit checkout?
router.getVisitedRoutes(); // all routes in this session
router.traverseToLast("users.list"); // jump back to the last users list
```

## Options

```typescript
router.usePlugin(
  navigationPluginFactory({
    base: "/app", // Base path prefix for all routes
    forceDeactivate: true, // Bypass canDeactivate guards on back/forward
  }),
);
```

| Option            | Type      | Default | Description                                                            |
| ----------------- | --------- | ------- | ---------------------------------------------------------------------- |
| `base`            | `string`  | `""`    | Base path for all routes (e.g., `"/app"` → URLs start with `/app/...`) |
| `forceDeactivate` | `boolean` | `true`  | Bypass `canDeactivate` guards on browser back/forward                  |

## Router Extensions

### Compatible extensions (same as browser-plugin)

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

### Exclusive extensions (Navigation API only)

| Method                          | Returns                       | Description                                     |
| ------------------------------- | ----------------------------- | ----------------------------------------------- |
| `peekBack()`                    | `State \| undefined`          | State of the previous history entry             |
| `peekForward()`                 | `State \| undefined`          | State of the next history entry                 |
| `hasVisited(routeName)`         | `boolean`                     | Whether any history entry matches the route     |
| `getVisitedRoutes()`            | `string[]`                    | Unique route names across all history entries   |
| `getRouteVisitCount(routeName)` | `number`                      | How many history entries match the route        |
| `traverseToLast(routeName)`     | `Promise<State>`              | Navigate to the last history entry for a route  |
| `canGoBack()`                   | `boolean`                     | Whether there's a previous history entry        |
| `canGoForward()`                | `boolean`                     | Whether there's a next history entry            |
| `canGoBackTo(routeName)`        | `boolean`                     | Whether any previous entry matches the route    |

#### `peekBack` / `peekForward`

```typescript
// Show a preview of where back/forward would take the user
const prev = router.peekBack();
if (prev) {
  console.log(`Back goes to: ${prev.name}`);
}

const next = router.peekForward();
if (next) {
  console.log(`Forward goes to: ${next.name}`);
}
```

#### `hasVisited` / `getVisitedRoutes` / `getRouteVisitCount`

```typescript
// Check if the user has been to a route in this session
if (router.hasVisited("checkout")) {
  showResumeCheckoutBanner();
}

// Get all routes visited in this session
const visited = router.getVisitedRoutes();
// => ["home", "users.list", "users.view", "checkout"]

// How many times did the user visit the product page?
const count = router.getRouteVisitCount("products.view");
```

#### `traverseToLast`

```typescript
// Jump directly to the last time the user was on users.list
// (skips intermediate entries — no back/forward stepping)
await router.traverseToLast("users.list");
```

#### `canGoBack` / `canGoForward` / `canGoBackTo`

```typescript
// Disable back button when there's nowhere to go
const backDisabled = !router.canGoBack();
const forwardDisabled = !router.canGoForward();

// Show "back to list" only if the user actually came from the list
if (router.canGoBackTo("users.list")) {
  showBackToListButton();
}
```

## Navigation Metadata

Navigation metadata is available on `state.context.navigation` after each transition. The plugin writes it via the claim-based State Context API, and it is frozen (`Object.freeze`) for mutation protection.

```typescript
// In subscribe callbacks
router.subscribe((state) => {
  const meta = state.context.navigation;
  console.log(meta?.navigationType); // "push" | "replace" | "traverse" | "reload"
  console.log(meta?.userInitiated);  // true if user clicked back/forward/link
  console.log(meta?.direction);      // "forward" | "back" | "unknown"
  console.log(meta?.sourceElement);  // the DOM element that initiated the nav, or null
  console.log(meta?.info);           // data passed via navigation.navigate({ info })
});
```

In guards during browser-initiated navigation, meta is available on `toState.context.navigation` (written in `onTransitionStart`):

```typescript
import { getLifecycleApi } from "@real-router/core/api";

const lifecycle = getLifecycleApi(router);
lifecycle.addActivateGuard("checkout", () => (toState) => {
  const meta = toState.context.navigation;
  if (meta?.userInitiated) {
    // user clicked back/forward or a link
  }
  return true;
});
```

In framework components, access via the route's context:

```typescript
// React example
const { route } = useRoute();
const meta = route.context.navigation;
```

### NavigationMeta

| Field             | Type                                               | Description                                            |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `navigationType`  | `"push" \| "replace" \| "traverse" \| "reload"`   | Type of navigation                                     |
| `userInitiated`   | `boolean`                                          | Whether the user clicked back/forward/link              |
| `direction`       | `"forward" \| "back" \| "unknown"`                 | Direction in the history stack                          |
| `sourceElement`   | `Element \| null`                                  | DOM element that initiated the navigation, or null      |
| `info`            | `unknown`                                          | Ephemeral data from `navigation.navigate({ info })`    |

### NavigationDirection

```typescript
type NavigationDirection = "forward" | "back" | "unknown";
```

Exported from the package for use in type annotations.

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

## Feature Detection

Use `navigationPluginFactory` when the Navigation API is available, fall back to `browserPluginFactory` otherwise:

```typescript
import { browserPluginFactory } from "@real-router/browser-plugin";
import { navigationPluginFactory } from "@real-router/navigation-plugin";

const plugin =
  "navigation" in globalThis
    ? navigationPluginFactory({ base })
    : browserPluginFactory({ base });

router.usePlugin(plugin);
```

## Form Protection

Set `forceDeactivate: false` to respect `canDeactivate` guards on back/forward:

```typescript
router.usePlugin(navigationPluginFactory({ forceDeactivate: false }));

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

The plugin is SSR-safe. In a non-browser environment it falls back to no-ops via `createNavigationFallbackBrowser`:

```typescript
// Server-side — no errors, methods return safe defaults
router.usePlugin(navigationPluginFactory());
router.buildUrl("home"); // returns path without base
router.matchUrl("/path"); // returns undefined
```

## Documentation

Full documentation: [Wiki — navigation-plugin](https://github.com/greydragon888/real-router/wiki/navigation-plugin)

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/navigation-plugin#3-configuration-options)
- [Lifecycle Hooks](https://github.com/greydragon888/real-router/wiki/navigation-plugin#4-lifecycle-hooks)
- [History Extensions](https://github.com/greydragon888/real-router/wiki/navigation-plugin#5-history-extensions)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/navigation-plugin#8-behavior)

## Related Packages

| Package                                                                                  | Description                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required peer dependency)         |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | History API fallback (broader browser support) |
| [@real-router/hash-plugin](https://www.npmjs.com/package/@real-router/hash-plugin)       | Hash-based routing (`#/path`)                  |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                   | React integration                              |
| [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin)   | Development logging                            |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
