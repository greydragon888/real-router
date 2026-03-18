# @real-router/logger

[![npm](https://img.shields.io/npm/v/@real-router/logger.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/logger.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/logger&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/logger&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Isomorphic structured logger for the [Real-Router](https://github.com/greydragon888/real-router) ecosystem. Level filtering, custom callbacks, works in any JavaScript runtime.

Zero dependencies. Used internally by `@real-router/core` and plugins.

## Installation

```bash
npm install @real-router/logger
```

## Quick Start

```typescript
import { logger } from "@real-router/logger";

logger.log("App", "Application started");
logger.warn("Auth", "Token expires in 5 minutes");
logger.error("API", "Request failed", error);

logger.configure({ level: "error-only" });
```

## API

| Method | Description |
|--------|-------------|
| `logger.log(context, message, ...args)` | Informational message |
| `logger.warn(context, message, ...args)` | Warning message |
| `logger.error(context, message, ...args)` | Error message |
| `logger.configure(config)` | Update logger configuration |
| `logger.getConfig()` | Return current configuration |

## Log Levels

| Level | log | warn | error |
|-------|:---:|:----:|:-----:|
| `"all"` | Yes | Yes | Yes |
| `"warn-error"` | — | Yes | Yes |
| `"error-only"` | — | — | Yes |
| `"none"` | — | — | — |

## Configuration

```typescript
logger.configure({
  level: "warn-error",
  callback: (level, context, message, ...args) => {
    Sentry.captureMessage(`[${context}] ${message}`);
  },
  callbackIgnoresLevel: false, // default: false
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | `LogLevelConfig` | `"all"` | Which messages to show in console |
| `callback` | `LogCallback` | — | Custom handler for log messages |
| `callbackIgnoresLevel` | `boolean` | `false` | When `true`, callback receives all messages regardless of level |

### `callbackIgnoresLevel`

Decouples console output from callback — useful for error tracking, metrics, or external logging:

```typescript
// Console: silent. Callback: everything.
logger.configure({
  level: "none",
  callbackIgnoresLevel: true,
  callback: (level, context, message) => {
    externalLogger.send({ level, context, message });
  },
});
```

## Use Cases

### Error Tracking (Sentry)

```typescript
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

## Types

```typescript
import type {
  LogLevel,          // "log" | "warn" | "error"
  LogLevelConfig,    // "all" | "warn-error" | "error-only" | "none"
  LogCallback,       // (level, context, message, ...args) => void
  LoggerConfig,      // { level, callback?, callbackIgnoresLevel? }
} from "@real-router/logger";
```

## Related Packages

| Package | Description |
|---------|-------------|
| [@real-router/core](https://www.npmjs.com/package/@real-router/core) | Core router (uses logger internally) |
| [@real-router/logger-plugin](https://www.npmjs.com/package/@real-router/logger-plugin) | Transition logging plugin (uses logger internally) |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
