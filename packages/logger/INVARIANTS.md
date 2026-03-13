# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Configuration

| #   | Invariant                                                | Description                                                                                                                                                       |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Configuration idempotence                                | Calling `configure()` twice with the same arguments produces identical config state. The logger has no hidden side effects that accumulate across repeated calls. |
| 2   | Partial updates preserve other fields                    | Updating only `level` leaves `callback` and `callbackIgnoresLevel` unchanged. Each field is independent and partial updates are non-destructive.                  |
| 3   | Partial callback update preserves level                  | Updating only `callback` leaves `level` unchanged. The merge is always additive, never a full replacement.                                                        |
| 4   | getConfig always returns a valid level                   | After any `configure()` call, `getConfig().level` is always one of the known valid level strings. Invalid levels are rejected before they can be stored.          |
| 5   | getConfig always returns callbackIgnoresLevel as boolean | The `callbackIgnoresLevel` field is always a boolean, never coerced to another type.                                                                              |
| 6   | getConfig returns a new object on each call              | Each `getConfig()` call returns a fresh object. Mutating the returned config does not affect the logger's internal state.                                         |
| 7   | Setting callback to undefined clears it                  | After `configure({ callback: undefined })`, `getConfig().callback` is `undefined` and the previously set level is preserved.                                      |
| 8   | Invalid levels throw                                     | Passing an unrecognized string as `level` throws an error matching `/Invalid log level/`. The logger never silently accepts unknown levels.                       |
| 9   | Level switching works correctly                          | Switching level multiple times in sequence always results in the last configured level being active. There is no stale state from previous configurations.        |
| 10  | callbackIgnoresLevel is preserved during partial updates | Updating `level` or `callback` independently does not reset `callbackIgnoresLevel`. The flag persists until explicitly changed.                                   |

## Level Filtering

| #   | Invariant                                | Description                                                                                                                                                                               |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Filtering is deterministic               | The same `(configLevel, messageLevel)` pair always produces the same filtering outcome. The decision is purely a function of the two levels, with no external state.                      |
| 2   | level:none filters all messages          | With `level: "none"`, no call to `console.log`, `console.warn`, or `console.error` is made for any message level.                                                                         |
| 3   | level:all passes all messages            | With `level: "all"`, every message reaches the corresponding console method exactly once.                                                                                                 |
| 4   | Filtering matches the specification      | The actual filtering behavior matches the documented level matrix: `error` passes on all levels except `none`; `warn` is filtered on `error-only` and `none`; `log` passes only on `all`. |
| 5   | Messages are formatted with context      | Every message that passes the level filter is sent to the console as `[context] message`. The context prefix is always present and correctly formatted.                                   |
| 6   | Additional arguments are passed through  | Extra arguments passed to `logger.log/warn/error()` are forwarded to the console method unchanged, after the formatted message string.                                                    |
| 7   | error passes on all levels except none   | `logger.error()` always reaches `console.error` unless `level` is `"none"`. Errors are never silently dropped by a non-silent level.                                                      |
| 8   | warn is filtered on error-only and none  | `logger.warn()` is suppressed when `level` is `"error-only"` or `"none"`, and passes through on `"all"` and `"warn-error"`.                                                               |
| 9   | log is filtered on all levels except all | `logger.log()` only reaches `console.log` when `level` is `"all"`. All other levels suppress it.                                                                                          |
| 10  | Level switching takes effect immediately | After `configure({ level })`, the very next log call uses the new level. There is no buffering or deferred application.                                                                   |

## Callback

| #   | Invariant                                                              | Description                                                                                                                                                     |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Callback receives correct arguments                                    | When a callback is set and a message passes the filter, the callback is called with `(level, context, message, ...args)` in that exact order.                   |
| 2   | Callback respects level filtering when callbackIgnoresLevel is false   | With `callbackIgnoresLevel: false`, the callback is invoked only when the message would also reach the console. The callback and console are always in sync.    |
| 3   | Callback receives all messages when callbackIgnoresLevel is true       | With `callbackIgnoresLevel: true`, the callback is called for every message regardless of `level`. It bypasses the filter entirely.                             |
| 4   | Callback receives messages even with level:none                        | With `level: "none"` and `callbackIgnoresLevel: true`, the callback is still invoked while the console remains silent. This enables silent-mode integrations.   |
| 5   | Throwing callback does not stop logging                                | If the callback throws, the main log call does not throw and the console method is still called. The callback error is reported separately via `console.error`. |
| 6   | Callback and console are consistent when callbackIgnoresLevel is false | The number of times the callback is called equals the number of times the corresponding console method is called. They are never out of sync.                   |
| 7   | Callback invocation is deterministic                                   | The same `(configLevel, messageLevel, callbackIgnoresLevel)` combination always produces the same callback invocation count.                                    |
| 8   | Changing callbackIgnoresLevel takes effect immediately                 | Switching `callbackIgnoresLevel` from `false` to `true` causes the very next log call to invoke the callback, even if the message would otherwise be filtered.  |

## Test Files

| File                                    | Invariants | Category        |
| --------------------------------------- | ---------- | --------------- |
| `tests/property/config.properties.ts`   | 10         | Configuration   |
| `tests/property/level.properties.ts`    | 10         | Level Filtering |
| `tests/property/callback.properties.ts` | 8          | Callback        |
