# @real-router/logger-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A plugin for logging router events to the console. Provides transition timing display, parameter diff tracking, Performance API integration, and log grouping.

## Installation

```bash
npm install @real-router/logger-plugin
# or
pnpm add @real-router/logger-plugin
# or
yarn add @real-router/logger-plugin
# or
bun add @real-router/logger-plugin
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { loggerPlugin } from "@real-router/logger-plugin";

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
import { loggerPlugin } from "@real-router/logger-plugin";

router.usePlugin(loggerPlugin);
```

### `loggerPluginFactory()`

Factory for creating a new plugin instance.

```typescript
import { loggerPluginFactory } from "@real-router/logger-plugin";

router.usePlugin(loggerPluginFactory());
```

## Default Configuration

The plugin uses the following default configuration:

```typescript
interface LoggerPluginConfig {
  level: "all" | "transitions" | "errors" | "none";  // default: "all"
  showTiming: boolean;           // default: true
  showParamsDiff: boolean;       // default: true
  usePerformanceMarks: boolean;  // default: false
  context: string;               // default: "real-router-logger-plugin"
}
```

### `level`

Event logging level.

- `'all'` **(default)** - logs all events (router start/stop + transitions)
- `'transitions'` - only transition events (start/success/cancel/error)
- `'errors'` - only transition errors
- `'none'` - disables all logs

### `showTiming`

Display transition execution time with adaptive units.

- `true` **(default)** - show timing (μs for fast transitions <0.1ms, ms otherwise)
- `false` - hide timing

**Output examples:**

```
Transition success (15ms)      // normal timing
Transition success (27.29μs)   // fast transitions
```

### `showParamsDiff`

Show differences in route parameters when navigating within the same route.

- `true` **(default)** - show changed, added, and removed parameters
- `false` - don't show parameter changes

**Example output:**

```
▼ Router transition
  Transition: users.view → users.view
  Changed: { id: "123" → "456" }, Added: {"sort":"name"}
  Transition success (2.15ms)
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

- **Default:** `'logger-plugin'`

**Example output:**

```
[logger-plugin] Transition: dashboard → users
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

## TypeScript

The plugin is fully typed:

```typescript
import {
  loggerPlugin,
  loggerPluginFactory,
  type LoggerPluginConfig,
  type LogLevel,
} from "@real-router/logger-plugin";
```

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
