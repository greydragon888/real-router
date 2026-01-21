# logger

Internal logging utility for Real-Router packages. Provides centralized logging with configurable output levels and custom handlers.

**⚠️ Internal Use Only:** This package is designed for use within the Real-Router monorepo.

## Features

- **Level filtering**: Control which messages are output (`all`, `warn-error`, `error-only`, `none`)
- **Custom callbacks**: Route logs to external services or replace console
- **Flexible callback control**: Option to bypass level filtering for monitoring
- **TypeScript**: Full type safety

## API

### Exports

```typescript
// Singleton logger instance
import { logger } from "logger";

// Constants (for advanced use cases)
import { LOG_LEVELS, LEVEL_CONFIGS } from "logger";

// Types
import type {
  LogLevel,
  LogLevelConfig,
  LogCallback,
  LoggerConfig,
} from "logger";
```

### Methods

```typescript
logger.log(context: string, message: string, ...args: unknown[]): void
logger.warn(context: string, message: string, ...args: unknown[]): void
logger.error(context: string, message: string, ...args: unknown[]): void
logger.configure(config: Partial<LoggerConfig>): void
logger.getConfig(): LoggerConfig
```

### Types

```typescript
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
  callbackIgnoresLevel?: boolean; // When true, callback bypasses level filter
}
```

### Constants

```typescript
// Numeric mapping for log severity levels (log: 0, warn: 1, error: 2)
const LOG_LEVELS: Record<LogLevel, number>;

// Numeric thresholds for config levels (all: 0, warn-error: 1, error-only: 2, none: 3)
const LEVEL_CONFIGS: Record<LogLevelConfig, number>;
```

## Callback Behavior

The `callbackIgnoresLevel` option controls when your callback is invoked:

- `callbackIgnoresLevel: false` (default): Callback respects level filter
- `callbackIgnoresLevel: true`: Callback receives all messages regardless of level

This allows scenarios like:

- Disabling console but keeping error tracking
- Collecting metrics for all logs while showing only errors
- Using alternative logging libraries

## Usage in Router

### Basic Logging

```typescript
logger.log("Router", "Navigation started");
logger.warn("router.usePlugin", "51 plugins registered!");
logger.error("Router.Navigation", "Failed to navigate", error);
```

### Context Convention

- `'Router'` - General router messages
- `'Router.Module'` - Module-specific (e.g., `'Router.Navigation'`)
- `'router.method'` - Method-specific (e.g., `'router.usePlugin'`)

## User Configuration

Router users can configure logging through router options:

### Basic Level Control

```typescript
const router = createRouter(routes, {
  logger: {
    level: "error-only", // Only show errors in production
  },
});
```

### Error Tracking Integration

```typescript
const router = createRouter(routes, {
  logger: {
    level: "warn-error",
    callback: (level, context, message, ...args) => {
      if (level === "error") {
        Sentry.captureMessage(`[${context}] ${message}`, "error");
      }
    },
  },
});
```

### Custom Console Implementation

Replace standard console in environments without it or when using alternative logging:

```typescript
// Using debug library
const debug = require("debug");
const router = createRouter(routes, {
  logger: {
    level: "none", // Disable standard console
    callbackIgnoresLevel: true, // Always call callback
    callback: (level, context, message, ...args) => {
      const formatted = context ? `[${context}] ${message}` : message;
      debug(`router:${level}`)(formatted, ...args);
    },
  },
});
```

```typescript
// Platform-specific logging (React Native, Electron)
const router = createRouter(routes, {
  logger: {
    level: "none",
    callbackIgnoresLevel: true,
    callback: (level, context, message, ...args) => {
      NativeModules.Logger[level](`[${context}] ${message}`, args);
    },
  },
});
```

### Advanced: Monitoring + Filtering

```typescript
const router = createRouter(routes, {
  logger: {
    level: "all", // Show all in console
    callbackIgnoresLevel: true, // But callback gets everything
    callback: (level, context, message, ...args) => {
      // Always collect metrics
      metrics[level]++;

      // Only send errors to monitoring
      if (level === "error") {
        errorTracker.capture({ context, message, args });
      }

      // Filter out known non-critical warnings
      if (context === "Router.Deprecated" && level === "warn") {
        return; // Don't track deprecation warnings
      }
    },
  },
});
```

## Development

```bash
pnpm test        # Run tests
pnpm run build   # Build package
```
