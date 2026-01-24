# @real-router/logger

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Isomorphic logger for Real-Router with level filtering and custom callbacks. Works in browsers, Node.js, and any JavaScript runtime.

## Installation

```bash
npm install @real-router/logger
# or
pnpm add @real-router/logger
# or
yarn add @real-router/logger
# or
bun add @real-router/logger
```

## Quick Start

```typescript
import { logger } from "@real-router/logger";

// Basic logging
logger.log("App", "Application started");
logger.warn("Auth", "Token expires in 5 minutes");
logger.error("API", "Request failed", error);

// Configure log level
logger.configure({ level: "error-only" });
```

---

## API

### `logger.log(context: string, message: string, ...args: unknown[]): void`

Logs an informational message.\
`context: string` — source identifier (e.g., "Router", "Auth")\
`message: string` — log message\
`...args: unknown[]` — additional data to log

```typescript
logger.log("Router", "Navigation started");
logger.log("API", "Response received", { status: 200, data });
```

### `logger.warn(context: string, message: string, ...args: unknown[]): void`

Logs a warning message.\
`context: string` — source identifier\
`message: string` — warning message\
`...args: unknown[]` — additional data to log

```typescript
logger.warn("Router", "Deprecated route used", { route: "old-users" });
```

### `logger.error(context: string, message: string, ...args: unknown[]): void`

Logs an error message.\
`context: string` — source identifier\
`message: string` — error message\
`...args: unknown[]` — additional data to log

```typescript
logger.error("Router", "Navigation failed", error);
```

### `logger.configure(config: Partial<LoggerConfig>): void`

Updates logger configuration.\
`config: Partial<LoggerConfig>` — configuration options

```typescript
logger.configure({
  level: "warn-error",
  callback: (level, context, message, ...args) => {
    Sentry.captureMessage(`[${context}] ${message}`);
  },
});
```

### `logger.getConfig(): LoggerConfig`

Returns current logger configuration.

```typescript
const config = logger.getConfig();
console.log(config.level); // "all"
```

---

## Types

```typescript
import type {
  LogLevel,
  LogLevelConfig,
  LogCallback,
  LoggerConfig,
} from "@real-router/logger";

type LogLevel = "log" | "warn" | "error";
type LogLevelConfig = "all" | "warn-error" | "error-only" | "none";

type LogCallback = (
  level: LogLevel,
  context: string,
  message: string,
  ...args: unknown[]
) => void;

interface LoggerConfig {
  level: LogLevelConfig;
  callback?: LogCallback;
  callbackIgnoresLevel?: boolean;
}
```

---

## Log Levels

| Level          | Description                          |
| -------------- | ------------------------------------ |
| `"all"`        | Show all messages (log, warn, error) |
| `"warn-error"` | Show warnings and errors only        |
| `"error-only"` | Show errors only                     |
| `"none"`       | Disable console output               |

```typescript
// Development: show everything
logger.configure({ level: "all" });

// Production: errors only
logger.configure({ level: "error-only" });

// Silent mode with callback
logger.configure({
  level: "none",
  callbackIgnoresLevel: true,
  callback: (level, context, message) => {
    externalLogger.send({ level, context, message });
  },
});
```

---

## Usage Examples

### Error Tracking Integration

```typescript
import { logger } from "@real-router/logger";
import * as Sentry from "@sentry/browser";

logger.configure({
  level: "warn-error",
  callback: (level, context, message, ...args) => {
    if (level === "error") {
      Sentry.captureMessage(`[${context}] ${message}`, {
        level: "error",
        extra: { args },
      });
    }
  },
});
```

### Custom Console (React Native, Electron)

```typescript
logger.configure({
  level: "none",
  callbackIgnoresLevel: true,
  callback: (level, context, message, ...args) => {
    NativeModules.Logger[level](`[${context}] ${message}`, args);
  },
});
```

### Debug Library Integration

```typescript
import debug from "debug";

logger.configure({
  level: "none",
  callbackIgnoresLevel: true,
  callback: (level, context, message, ...args) => {
    debug(`app:${context}:${level}`)(message, ...args);
  },
});
```

### Metrics Collection

```typescript
const metrics = { log: 0, warn: 0, error: 0 };

logger.configure({
  level: "error-only", // Console shows errors only
  callbackIgnoresLevel: true, // Callback gets everything
  callback: (level) => {
    metrics[level]++;
  },
});
```

---

## Callback Behavior

The `callbackIgnoresLevel` option controls callback invocation:

| Setting           | Behavior                                           |
| ----------------- | -------------------------------------------------- |
| `false` (default) | Callback respects level filter                     |
| `true`            | Callback receives all messages regardless of level |

This enables scenarios like:

- Disabling console but keeping error tracking
- Collecting metrics for all logs while showing only errors
- Using alternative logging libraries

---

## Context Convention

Recommended context naming:

- `"Router"` — General router messages
- `"Router.Module"` — Module-specific (e.g., `"Router.Navigation"`)
- `"router.method"` — Method-specific (e.g., `"router.usePlugin"`)
- `"App"` — Application-level messages
- `"Auth"`, `"API"`, etc. — Feature-specific contexts

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
