# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Completeness

| #   | Invariant                                        | Description                                                                                                                                                         |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Transition start is always logged at level:all   | Every `navigate()` call with `level: "all"` produces at least one log entry containing `"Transition:"`. The plugin never silently drops transition events.          |
| 2   | Transition success is always logged at level:all | Every successful navigation produces a log entry containing `"Transition success"`. Both the start and the completion of a transition are always recorded together. |
| 3   | No output at level:none                          | With `level: "none"`, no calls to `console.log`, `console.warn`, or `console.error` are made for any navigation. The plugin is completely silent.                   |

## No-Throw

| #   | Invariant                       | Description                                                                                                                                                      |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Navigation always resolves      | `navigate()` resolves successfully for any valid config combination. The plugin never causes a navigation to fail or throw.                                      |
| 2   | Router state remains consistent | After `navigate()` with any config, `router.getState()` returns a defined state whose `name` matches the target route. The plugin does not corrupt router state. |
| 3   | Start and stop never throw      | `router.start()` and `router.stop()` complete without errors for any valid config. The plugin lifecycle is safe regardless of configuration.                     |

## Format

| #   | Invariant                                                    | Description                                                                                                                                                                        |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All transition log entries use the configured context prefix | Every log message containing `"Transition"` starts with `[context]`. The prefix is derived from the `context` option and is applied consistently to all transition-related output. |
| 2   | Router start log uses the configured context prefix          | The `"Router started"` message produced by `onStart` starts with `[context]`. The prefix is consistent across all lifecycle events.                                                |
| 3   | Router stop log uses the configured context prefix           | The `"Router stopped"` message produced by `onStop` starts with `[context]`. Symmetric with the start prefix invariant.                                                            |

## Level Filtering

| #   | Invariant                                                       | Description                                                                                                                                                                                   |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `level:"transitions"` suppresses lifecycle, retains transitions | With `level: "transitions"`, no `"Router started"` or `"Router stopped"` messages appear, but `"Transition"` messages are still logged. Lifecycle output is gated by the `logLifecycle` flag. |
| 2   | `level:"errors"` suppresses transition logs                     | With `level: "errors"`, no `console.log` or `console.warn` calls occur during navigation. Only error-level output remains enabled.                                                            |

## Params Diff

| #   | Invariant                                              | Description                                                                                                                                                        |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `showParamsDiff:true` logs param changes on same route | When navigating to the same route with different params and `showParamsDiff: true`, a `"Changed:"` log entry appears containing both the old and new param values. |
| 2   | `showParamsDiff:false` suppresses param diff output    | When navigating to the same route with different params and `showParamsDiff: false`, no `"Changed:"` log entry appears. The diff computation is skipped entirely.  |

## Test Files

| File                                        | Invariants | Category                                                     |
| ------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `tests/property/loggerPlugin.properties.ts` | 13         | Completeness, No-Throw, Format, Level Filtering, Params Diff |
