# router6-plugin-logger

[![npm version](https://badge.fury.io/js/router6-plugin-logger.svg)](https://www.npmjs.com/package/router6-plugin-logger)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A plugin for logging router events to the console. Provides flexible logging level configuration, transition timing display, parameter diff tracking, and log grouping.

## Installation

```bash
# npm
npm install real-router-plugin-logger

# yarn
yarn add real-router-plugin-logger

# pnpm
pnpm add real-router-plugin-logger

# bun
bun add real-router-plugin-logger
```

## Quick Start

```typescript
import { createRouter } from "real-router";
import { loggerPlugin } from "real-router-plugin-logger";

const router = createRouter(routes);

// Use with default settings
router.usePlugin(loggerPlugin);

router.start();
```

**Console output:**

```
Router started
▼ Router transition
  Transition: home → users (1.23ms)
  Transition success (1.23ms)
```

**Fast transitions (<0.1ms) display in microseconds:**

```
Transition success (27.29μs)
```

## API

### `loggerPlugin`

Ready-to-use plugin instance with default settings.

```typescript
router.usePlugin(loggerPlugin);
```

### `loggerPluginFactory(config?)`

Factory for creating a plugin with custom configuration.

```typescript
import { loggerPluginFactory } from "real-router-plugin-logger";

router.usePlugin(
  loggerPluginFactory({
    level: "errors",
    showTiming: false,
    showParamsDiff: true,
    context: "my-app",
  }),
);
```

## Configuration

```typescript
interface LoggerPluginConfig {
  level?: "all" | "transitions" | "errors" | "none";
  showTiming?: boolean;
  showParamsDiff?: boolean;
  context?: string;
}
```

### `level`

Event logging level.

- `'all'` **(default)** - logs all events
- `'transitions'` - only transition events (start/success/cancel/error)
- `'errors'` - only transition errors
- `'none'` - disables all logs

**Example:**

```typescript
// Production: errors only
router.usePlugin(
  loggerPluginFactory({
    level: "errors",
  }),
);
```

### `showTiming`

Display transition execution time with adaptive units.

- `true` **(default)** - show timing (μs for fast transitions <0.1ms, ms otherwise)
- `false` - hide timing

**Example:**

```typescript
router.usePlugin(
  loggerPluginFactory({
    showTiming: false,
  }),
);

// Output: "Transition success" instead of "Transition success (15ms)"
```

### `showParamsDiff` ✨

Show differences in route parameters when navigating within the same route.

- `false` **(default)** - don't show parameter changes
- `true` - show changed, added, and removed parameters

**Example:**

```typescript
router.usePlugin(
  loggerPluginFactory({
    showParamsDiff: true,
  }),
);

// Navigate within same route
router.navigate("users.view", { id: "123", tab: "profile" });
router.navigate("users.view", { id: "456", tab: "profile", sort: "name" });

// Output:
// ▼ Router transition
//   Transition: users.view → users.view
//   Changed: { id: "123" → "456" }, Added: {"sort":"name"}
//   Transition success (2.15ms)
```

**Diff types displayed:**

- **Changed** - parameters with different values
- **Added** - new parameters in target state
- **Removed** - parameters present in source but not in target

**When diff is shown:**

- ✅ Only when navigating within the same route (e.g., `users.view` → `users.view`)
- ✅ Only when parameters actually changed
- ❌ Not shown when navigating between different routes
- ❌ Not shown when parameters are identical

### `context`

Context name for logs. Useful when working with multiple routers.

- **Default:** `'router6-plugin-logger'`

**Example:**

```typescript
const adminRouter = createRouter(adminRoutes);
adminRouter.usePlugin(
  loggerPluginFactory({
    context: "admin-router",
  }),
);

const appRouter = createRouter(appRoutes);
appRouter.usePlugin(
  loggerPluginFactory({
    context: "app-router",
  }),
);

// Output:
// [admin-router] Transition: dashboard → users
// [app-router] Transition: home → profile
```

## Logged Events

### Router Lifecycle

**`onStart`** - called when router starts

```
Router started
```

**`onStop`** - called when router stops

```
Router stopped
```

### Transition Events

**`onTransitionStart`** - transition begins

```
▼ Router transition
  Transition: home → users
```

**`onTransitionSuccess`** - transition completed successfully

```
  Transition success (24ms)
```

**`onTransitionCancel`** - transition cancelled

```
  Transition cancelled (12ms)
```

**`onTransitionError`** - transition error

```
  Transition error: ROUTE_NOT_FOUND (8ms)
```

## Log Grouping

Transition events are automatically grouped in the console for better readability:

```
▼ Router transition
  Transition: users → users.view
  [middleware logs...]
  [guard logs...]
  Transition success (45ms)
```

This helps organize logs when working with complex transitions, middleware, and guards.

## Usage Examples

### Development Mode

Full logging with timing and parameter tracking:

```typescript
router.usePlugin(
  loggerPluginFactory({
    level: "all",
    showTiming: true,
    showParamsDiff: true,
  }),
);
```

### Production Mode

Critical errors only:

```typescript
router.usePlugin(
  loggerPluginFactory({
    level: "errors",
    showTiming: false,
  }),
);
```

### Debugging Parameter Changes

Track parameter changes during navigation:

```typescript
router.usePlugin(
  loggerPluginFactory({
    level: "transitions",
    showParamsDiff: true,
  }),
);

// Navigate with different parameters
router.navigate("search", { q: "react", page: 1 });
router.navigate("search", { q: "vue", page: 1, sort: "date" });

// Output:
// Changed: { q: "react" → "vue" }, Added: {"sort":"date"}
```

### Debugging Transitions

Transition logs without router start/stop:

```typescript
router.usePlugin(
  loggerPluginFactory({
    level: "transitions",
  }),
);
```

### Complete Disable

```typescript
router.usePlugin(
  loggerPluginFactory({
    level: "none",
  }),
);
```

### Advanced Debugging Setup

Combine all features for comprehensive debugging:

```typescript
router.usePlugin(
  loggerPluginFactory({
    level: "all",
    showTiming: true,
    showParamsDiff: true,
    context: "main-app",
  }),
);
```

### Transitions with Parameters

The plugin logs route parameters:

```typescript
router.navigate("users.view", { id: "123" });

// Output:
// Transition: users → users.view
// {
//   from: { name: 'users', params: {}, path: '/users' },
//   to: { name: 'users.view', params: { id: '123' }, path: '/users/123' }
// }
```

## Disabling in Tests

```typescript
import { describe, it, beforeEach } from "vitest";
import { createRouter } from "real-router";
import { loggerPluginFactory } from "real-router-plugin-logger";

describe("Router tests", () => {
  let router;

  beforeEach(() => {
    router = createRouter(routes);

    // Disable logs in tests
    router.usePlugin(
      loggerPluginFactory({
        level: "none",
      }),
    );
  });
});
```

## TypeScript

The plugin is fully typed:

```typescript
import type { LoggerPluginConfig, LogLevel } from "real-router-plugin-logger";

const config: LoggerPluginConfig = {
  level: "transitions",
  showTiming: true,
  showParamsDiff: true,
  context: "my-router",
};

router.usePlugin(loggerPluginFactory(config));
```

## Server-Side Rendering

For high-precision timing in Node.js, polyfill `performance` globally:

```typescript
// server.ts (Node.js entry point)
import { performance } from "perf_hooks";

if (typeof globalThis.performance === "undefined") {
  globalThis.performance = performance;
}
```

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [loggerPlugin](https://github.com/greydragon888/router6/wiki/loggerPlugin) — plugin usage and configuration
- [usePlugin](https://github.com/greydragon888/router6/wiki/usePlugin) — registering plugins with router
- [Plugins](https://github.com/greydragon888/router6/wiki/Plugins) — plugin architecture overview

## Related Packages

- [router6](https://www.npmjs.com/package/router6) — core router
- [react-router6](https://www.npmjs.com/package/react-router6) — React integration

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
