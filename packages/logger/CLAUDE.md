# @real-router/logger

Public package (`@real-router/logger`, published to npm) providing a singleton logger with configurable levels and callbacks for Real-Router.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `logger` | Singleton | Main logger instance (application-wide) |
| `LOG_LEVELS` | Constant | Numeric severity mapping: `{ log: 0, warn: 1, error: 2 }` |
| `LEVEL_CONFIGS` | Constant | Threshold mapping: `{ all: 0, "warn-error": 1, "error-only": 2, none: 3 }` |
| `LogLevel` | Type | `"log" \| "warn" \| "error"` |
| `LogLevelConfig` | Type | `"all" \| "warn-error" \| "error-only" \| "none"` |
| `LogCallback` | Type | `(level, context, message, ...args) => void` |
| `LoggerConfig` | Type | `{ level, callback?, callbackIgnoresLevel? }` |

## Logger API

| Method | Description |
|--------|-------------|
| `configure(config)` | Merge partial config (level, callback, callbackIgnoresLevel) |
| `getConfig()` | Returns current config snapshot (new object each call) |
| `log(context, message, ...args)` | Log at "log" level |
| `warn(context, message, ...args)` | Log at "warn" level |
| `error(context, message, ...args)` | Log at "error" level |

## Module Structure

```
src/
├── Logger.ts     -- Logger class + singleton `logger` export
├── constants.ts  -- LOG_LEVELS, LEVEL_CONFIGS numeric mappings
├── types.ts      -- LogLevel, LogLevelConfig, LogCallback, LoggerConfig
└── index.ts      -- re-exports
```

## Gotchas

- **Singleton** -- `logger` is a module-level instance; all imports share the same config state
- **Callback errors are swallowed** -- if `callback` throws, the error is caught and reported via `console.error` directly (avoids recursive logger calls)
- **Re-entrant callbacks are a safe no-op** -- if `callback` calls `logger.*`, an `#inCallback` re-entrancy guard skips the nested callback invocation (the nested message still reaches the console once). Without it the call would recurse ~5.9k deep to a swallowed `RangeError` (#791)
- **`callbackIgnoresLevel`** -- when true, callback receives ALL messages even if console output is filtered; when false (default), callback follows the same threshold as console
- **Level `"none"` early exit** -- when level is `"none"` and `callbackIgnoresLevel` is false, `#writeLog` returns immediately without any processing
- **Console safety** -- `#writeToConsole` checks `typeof console !== "undefined"` and `typeof console[level] === "function"` before calling
- **Context formatting** -- empty context produces plain message; non-empty context produces `[context] message`
- **Invalid level throws** -- `configure()` throws `Error` for invalid level strings (validates against `LEVEL_CONFIGS` keys)
- **`configure` merges own properties only** -- the `callback` key is detected with `Object.hasOwn(config, "callback")`, so a config whose `callback` lives on the prototype (e.g. `Object.create({ callback })`) is ignored, not installed (#792). Mirrors the own-property discipline used in `search-params`/`type-guards`
- **Property-based tests** -- `tests/property/` covers callback invocation, level filtering, and error handling with fast-check
