# RouterLogger (`core/src/foundation/logger`)

> [!NOTE]
> **Dissolved into `@real-router/core` (#724).** The standalone `@real-router/logger`
> npm package is gone — this code now lives inside core at `core/src/foundation/logger/`.
> Any badges / `npm install @real-router/logger` phrasing below is historical: there is
> nothing to install separately. The former process-global **singleton** is replaced by a
> **per-router `RouterLogger` instance** built from `createRouter(routes, { logger })` and
> stored on `RouterInternals.logger`.

Structured, per-router logger for [Real-Router](https://github.com/greydragon888/real-router):
level filtering, custom callbacks, isomorphic. Owned by `@real-router/core`.

## Quick Start

Configure a router's logger through `createRouter` options (there is no global instance):

```typescript
import { createRouter } from "@real-router/core";

const router = createRouter(routes, {
  logger: {
    level: "error-only",
    callback: (level, context, message, ...args) => {
      // forward to your telemetry sink
    },
  },
});
```

Internally each router builds its own `RouterLogger` and reaches it via
`getInternals(router).logger` (`log` / `warn` / `error`, each `(context, message, ...args)`).

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

> **Note:** The `callback` may safely call `logger.*`. A re-entrancy guard turns the nested call into a no-op (the message is still written to the console once), so it never recurses.

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
  RouterLogger,      // { log, warn, error } — the per-router logging surface
} from "@real-router/core";
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
