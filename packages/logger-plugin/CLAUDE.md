# @real-router/logger-plugin

> Development logging plugin — transition tracking, parameter diffing, Performance API integration

## Configuration

```typescript
loggerPluginFactory({
  level: "all",              // "all" | "transitions" | "errors" | "none" (default: "all")
  showTiming: true,          // adaptive ms/μs timing (default: true)
  showParamsDiff: true,      // shallow diff for same-route nav (default: true)
  usePerformanceMarks: false, // Performance API marks/measures (default: false)
  context: "logger-plugin",  // console prefix (default: "logger-plugin")
})
```

Validation runs at factory call time. Invalid `level`, non-boolean flags, or empty `context` throw `TypeError` with `[@real-router/logger-plugin]` prefix.

## Lifecycle Hook Flow

```
router.usePlugin(loggerPluginFactory(options))
    │
    ├── validateOptions(options)
    ├── Config merge: { ...DEFAULT_CONFIG, ...options }
    └── Return PluginFactory closure
            │
            └── new LoggerPlugin(config).getPlugin()
                    │
                    ├── Constructor: pre-compute flags, create GroupManager + PerformanceTracker
                    └── getPlugin(): return Plugin with 7 hooks + teardown

onStart()                  → perf.mark("router:start") + log if logLifecycle
onTransitionStart()        → groups.open + record timing + perf.mark + log + params+search diff (channel-labelled, RFC-4 M2) if same route
onTransitionLeaveApprove() → perf.mark("router:leave-approved:{label}") + log "Leave approved" if logTransition
onTransitionSuccess()      → perf.mark + perf.measure + log with timing + resetTransitionState
onTransitionCancel()       → perf.mark + perf.measure + warn + resetTransitionState
onTransitionError()        → perf.mark + perf.measure + error with code + resetTransitionState
onStop()                   → groups.close + perf.mark + perf.measure("router:lifetime") + log if logLifecycle
teardown()                 → resetTransitionState
```

## Gotchas

### `LoggerPlugin` class with `getPlugin()` pattern

Follows the same pattern as `BrowserPlugin` and `PersistentParamsPlugin`. The class holds private state (transition timing, labels, perf marks) and pre-computed flags. `getPlugin()` returns a plain `Plugin` object with closures over `this`. No `getPluginApi()`, no interceptors, no module augmentation.

### Pre-computed flags avoid runtime branching

All `config.level` checks are resolved once in the constructor into boolean flags (`#logLifecycle`, `#logTransition`, `#logError`). Hooks only check booleans, never compare strings at runtime. (The cancel branch's `console.warn` is gated by `#logTransition` — there is no separate `#logWarning` field.)

### `#resetTransitionState()` ordering

Called **after** timing is read — preserves `#transitionStartTime` until the log message is formatted. Clears: `#groups.close()`, `#transitionLabel = ""`, `#startMarkName = ""`, `#transitionStartTime = null`.

### Monotonic time fallback

`timing.ts` detects `performance.now()` at module load. If unavailable, falls back to `createMonotonicDateNow()` which uses module-level `lastTimestamp`/`timeOffset` to guarantee monotonicity even if system clock goes backward.

### GroupManager prevents duplicate groups

Closure-based `isOpened` flag prevents `console.group()` from being called twice without `groupEnd()`. Opens on `onTransitionStart`, closes on `#resetTransitionState`.

### Performance measure can fail silently

`createPerformanceTracker.measure()` wraps `performance.measure()` in try/catch. If start/end marks don't exist (e.g., interrupted lifecycle), it logs a warning and continues.

### Environment detection is one-shot

`supportsConsoleGroups()` and `supportsPerformanceAPI()` are called once (at manager creation), not per hook invocation. If the environment changes after creation, the managers won't adapt.

### `null as never` in validation

`validateOptions` checks `options === (null as never)` before the `typeof` check. This is a runtime defense: `typeof null === "object"` in JavaScript, so without this guard null would pass the type check and crash on property access. TypeScript excludes null from the parameter type, so `as never` satisfies `@typescript-eslint/no-unnecessary-condition`.

### Params diff runs on both channels independently (RFC-4 M2 / #1548)

`#logParamsIfNeeded` calls `getParamsDiff`/`logParamsDiff` twice per same-route transition — once for `state.params` (path), once for `state.search` (query) — each gated on its own `hasChanges` result. A transition can therefore print 0, 1, or 2 diff lines (`params …` / `search …`); a query-only change (e.g. `?page=2` → `?page=3`) now surfaces under `search` even though `params` is unchanged.

## Log Level Matrix

| Level          | logLifecycle | logTransition | logWarning | logError |
| -------------- | ------------ | ------------- | ---------- | -------- |
| `"all"`        | true         | true          | true       | true     |
| `"transitions"`| false        | true          | true       | true     |
| `"errors"`     | false        | false         | false      | true     |
| `"none"`       | false        | false         | false      | false    |

## Module Structure

```
src/
├── factory.ts              — loggerPluginFactory: validates options, merges defaults,
│                             returns PluginFactory → new LoggerPlugin(config).getPlugin()
├── plugin.ts               — LoggerPlugin class: pre-computes flags in constructor,
│                             getPlugin() returns Plugin with 7 lifecycle hooks + teardown
├── validation.ts           — validateOptions: level, context, boolean flags (TypeError)
├── constants.ts            — LOGGER_CONTEXT, ERROR_PREFIX, DEFAULT_CONFIG
├── types.ts                — LoggerPluginConfig, LogLevel
├── index.ts                — Public exports: loggerPluginFactory, types
└── internal/
    ├── console-groups.ts   — GroupManager (closure): open/close with duplicate guard
    ├── formatting.ts       — formatRouteName, formatTiming (adaptive μs/ms), createTransitionLabel
    ├── params-diff.ts      — getParamsDiff (shallow, channel-agnostic), logParamsDiff (channel-labelled: params/search)
    ├── performance-marks.ts — PerformanceTracker (closure): mark/measure with env detection
    └── timing.ts           — now() provider: performance.now() or monotonic Date.now() fallback
```

No module augmentation (`declare module`) — the plugin adds no methods to the router instance.
