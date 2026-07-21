# RouterLogger (`core/src/utils/logger`)

> [!NOTE]
> **Dissolved into `@real-router/core` (#724).** The standalone `@real-router/logger`
> package is gone — its code now lives here at `core/src/utils/logger/`. The former
> process-global **singleton** is replaced by a **per-router `RouterLogger` instance**,
> built from `options.logger` in the `Router` constructor and stored on
> `RouterInternals.logger` (the `ctx`); each router owns its own logger, so `configure()`
> no longer leaks across routers. Reached via `getInternals(router).logger`; namespaces get
> it through their deps, plugins/validators via `ctx.logger`. This doc is co-located
> as-is pending full integration — treat "published package" / "singleton" phrasing below
> as historical.

`RouterLogger` provides configurable-level, callback-capable logging for a single router
instance.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `RouterLogger` | Class | Per-router logger — `new RouterLogger(config?)` (no singleton); `index.ts` exports only this |
| `LOG_LEVELS` | Constant (`constants.ts`) | Numeric severity mapping: `{ log: 0, warn: 1, error: 2 }` |
| `LEVEL_CONFIGS` | Constant (`constants.ts`) | Threshold mapping: `{ all: 0, "warn-error": 1, "error-only": 2, none: 3 }` |
| `LogLevel` / `LogLevelConfig` / `LogCallback` / `LoggerConfig` | Types (`@real-router/types`) | The logger contract now lives in core-types, re-exported by `@real-router/core` |

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
core/src/utils/logger/
├── RouterLogger.ts  -- RouterLogger class (per-router instance; NO singleton)
├── constants.ts     -- LOG_LEVELS, LEVEL_CONFIGS numeric mappings
└── index.ts         -- exports { RouterLogger }
```

(The `LogLevel` / `LogLevelConfig` / `LogCallback` / `LoggerConfig` types moved to
`@real-router/types` — the former `types.ts` is gone.)

## Gotchas

- **Per-router instance (no singleton)** -- each router builds its own `RouterLogger` from `options.logger` in the constructor and stores it on `RouterInternals.logger`; `configure()` affects only that instance, so config never leaks across routers (#724). Reached via `getInternals(router).logger`
- **Callback errors are swallowed — synchronous throws AND async rejections** -- a synchronous `throw` is caught and reported as `[Logger] Error in callback:`; an async callback (a `(...) => Promise<void>` is assignable to the `void`-typed `LogCallback`) whose returned Promise rejects is isolated too (`[Logger] Error in async callback:`), so it is **not** leaked as a Node `unhandledRejection` — process-fatal under `--unhandled-rejections=strict`, Node 22+ default (#1161). Both report via `console.error` directly (avoids recursive logger calls), mirroring core's `subscribe` isolation (#944)
- **Re-entrant callbacks are a safe no-op** -- if `callback` calls `logger.*`, an `#inCallback` re-entrancy guard skips the nested callback invocation (the nested message still reaches the console once). Without it the call would recurse ~5.9k deep to a swallowed `RangeError` (#791)
- **`callbackIgnoresLevel`** -- when true, callback receives ALL messages even if console output is filtered; when false (default), callback follows the same threshold as console
- **Level `"none"` early exit** -- when level is `"none"` and `callbackIgnoresLevel` is false, `#writeLog` returns immediately without any processing
- **Console safety** -- `#writeToConsole` checks `typeof console !== "undefined"` and `typeof console[level] === "function"` before calling
- **Context formatting** -- empty context produces plain message; non-empty context produces `[context] message`
- **Invalid level throws** -- `configure()` throws `Error` for invalid level strings. Validation uses `Object.hasOwn(LEVEL_CONFIGS, level)`, not `level in LEVEL_CONFIGS`, so inherited `Object.prototype` keys like `"toString"`/`"valueOf"` are rejected instead of being accepted as a level (#895) — same own-property discipline as the `callback` check below
- **`configure` merges own properties only** -- the `callback` key is detected with `Object.hasOwn(config, "callback")`, so a config whose `callback` lives on the prototype (e.g. `Object.create({ callback })`) is ignored, not installed (#792). Mirrors the own-property discipline used in `search-params`/`type-guards`
- **Exported constants are frozen** -- `LEVEL_CONFIGS` and `LOG_LEVELS` are `Object.freeze`d (#897). They back each instance's cached threshold (`#currentThreshold = LEVEL_CONFIGS[level]`), so an otherwise-legal `LEVEL_CONFIGS["error-only"] = …` or `delete LEVEL_CONFIGS.none` from any code in the process would silently corrupt filtering everywhere (including core's logs). Freezing makes the runtime match the `Record`/readonly intent — same immutability discipline as the `callback`/`level` input checks above
- **Property-based tests** -- `tests/property/` covers callback invocation, level filtering, and error handling with fast-check
- **No stress tests (intentional, not a gap)** -- a `RouterLogger` instance has a fixed field set (level, one `callback` ref, `callbackIgnoresLevel`, the cached threshold, `#inCallback`) — no growing collections, subscriptions, timers, or create/destroy lifecycle. There is no memory/concurrency/perf-sensitive path a stress test could discriminate: a "stable heap over N logs" test would be GC-masking theatre (per-call `...args` are never retained), and the hot path is simple and allocation-free — its correctness locked by functional + property tests. The only stateful-under-load behaviors — the re-entrancy guard and throwing-callback recovery — are locked by functional + property tests, not by load. Do not add `tests/stress/` here
