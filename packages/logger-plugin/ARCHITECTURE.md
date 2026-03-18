# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/logger-plugin` is a **development logging plugin** for the router with transition tracking, parameter diffing, and Performance API integration. It implements the `PluginFactory` interface from `@real-router/core` and passively observes all router lifecycle events.

**Key role:** Zero-overhead in production (tree-shakeable), rich diagnostics in development — console groups, adaptive timing (ms/μs), params diff for same-route navigation, and browser DevTools performance marks/measures.

## Package Structure

```
logger-plugin/
├── src/
│   ├── factory.ts                     — loggerPluginFactory: validates options, merges defaults,
│   │                                    returns PluginFactory → new LoggerPlugin(config).getPlugin()
│   ├── plugin.ts                      — LoggerPlugin class: pre-computes flags in constructor,
│   │                                    getPlugin() returns Plugin with lifecycle hooks + teardown
│   ├── validation.ts                  — validateOptions: level, context, boolean flags (TypeError)
│   ├── types.ts                       — LoggerPluginConfig, LogLevel
│   ├── constants.ts                   — LOGGER_CONTEXT, ERROR_PREFIX, DEFAULT_CONFIG
│   ├── index.ts                       — Public API exports (loggerPluginFactory + types)
│   └── internal/
│       ├── console-groups.ts          — Console group manager (74 lines)
│       ├── formatting.ts             — Route name, timing, label formatting (56 lines)
│       ├── params-diff.ts            — Shallow params diff + logging (91 lines)
│       ├── performance-marks.ts      — Performance API wrapper (67 lines)
│       └── timing.ts                 — Monotonic time provider (52 lines)
```

## Dependencies

```mermaid
graph LR
    LP["@real-router/logger-plugin"] -->|dep| CORE["@real-router/core"]

    CORE -.->|provides| PF[PluginFactory]
    CORE -.->|provides| TYPES["State, Params, RouterError"]

    subgraph plugin [Plugin Instance]
        HOOKS["6 lifecycle hooks"] -->|use| INTERNAL[internal utilities]
    end
```

| Import source         | What it uses                     | Purpose                        |
| --------------------- | -------------------------------- | ------------------------------ |
| **@real-router/core** | `PluginFactory` type             | Plugin factory return type     |
| **@real-router/core** | `State`, `RouterError`, `Params` | Lifecycle hook parameter types |

## Core Data Structures

### Default Configuration (internal)

```typescript
const DEFAULT_CONFIG: Required<LoggerPluginConfig> = {
  level: "all",
  usePerformanceMarks: false,
  showParamsDiff: true,
  showTiming: true,
  context: "logger-plugin",
};
```

Not exported — used internally by `loggerPluginFactory` to merge with user options.

### Pre-Computed Flags

```typescript
// Computed once in LoggerPlugin constructor — no runtime condition checks
readonly #logLifecycle = config.level === "all";
readonly #logTransition = config.level !== "none" && config.level !== "errors";
readonly #logWarning = this.#logTransition;
readonly #logError = config.level !== "none";
readonly #shouldLogParams = this.#logTransition && config.showParamsDiff;
readonly #shouldShowTiming = config.showTiming;
readonly #prefix = `[${config.context}]`;
```

| Level           | logLifecycle | logTransition | logWarning | logError |
| --------------- | ------------ | ------------- | ---------- | -------- |
| `"all"`         | true         | true          | true       | true     |
| `"transitions"` | false        | true          | true       | true     |
| `"errors"`      | false        | false         | false      | true     |
| `"none"`        | false        | false         | false      | false    |

### Plugin Instance State

```typescript
// Private fields on LoggerPlugin — created per router instance
#transitionStartTime: number | null = null;
#transitionLabel = "";
#startMarkName = "";
```

### Internal Managers

```typescript
// Created in LoggerPlugin constructor
readonly #groups: GroupManager = createGroupManager(supportsConsoleGroups());
readonly #perf: PerformanceTracker = createPerformanceTracker(
  config.usePerformanceMarks,
  config.context,
);
```

Both use the **capability detection + no-op pattern**: if the environment lacks `console.group` or `performance.mark`, all calls become no-ops.

## Core Algorithm

### Lifecycle Hook Flow

```
router.usePlugin(loggerPluginFactory(options))
    │
    ├── validateOptions(options)
    ├── Config merge: { ...DEFAULT_CONFIG, ...options }
    └── Return factory → called per router instance
            │
            └── new LoggerPlugin(config).getPlugin()
                    │
                    ├── Constructor: create GroupManager + PerformanceTracker
                    └── getPlugin() returns plugin object with 6 hooks:

onStart()
    ├── perf.mark("router:start")
    └── if logLifecycle → console.log("[ctx] Router started")

onTransitionStart(toState, fromState?)
    ├── groups.open("Router transition")
    ├── transitionStartTime = now()
    ├── transitionLabel = "{from}→{to}"
    ├── perf.mark("router:transition-start:{label}")
    └── if logTransition:
            ├── console.log("[ctx] Transition: {from} → {to}", { from, to })
            └── if shouldLogParams && sameRoute → logParamsDiff

onTransitionSuccess(toState, fromState?)
    ├── perf.mark("router:transition-end:{label}")
    ├── perf.measure("router:transition:{label}", start, end)
    ├── if logTransition → console.log("[ctx] Transition success (Xms)", { to, from })
    └── resetTransitionState()

onTransitionCancel(toState, fromState?)
    ├── perf.mark("router:transition-cancel:{label}")
    ├── perf.measure("router:transition-cancelled:{label}", start, cancel)
    ├── if logWarning → console.warn("[ctx] Transition cancelled (Xms)", { to, from })
    └── resetTransitionState()

onTransitionError(toState?, fromState?, err)
    ├── perf.mark("router:transition-error:{label}")
    ├── perf.measure("router:transition-failed:{label}", start, error)
    ├── if logError → console.error("[ctx] Transition error: {code} (Xms)", { error, stack, to, from })
    └── resetTransitionState()

onStop()
    ├── groups.close()
    ├── perf.mark("router:stop")
    ├── perf.measure("router:lifetime", "router:start", "router:stop")
    └── if logLifecycle → console.log("[ctx] Router stopped")

teardown()
    └── resetTransitionState()
```

### #resetTransitionState()

```typescript
#resetTransitionState(): void {
  this.#groups.close();
  this.#transitionLabel = "";
  this.#startMarkName = "";
  this.#transitionStartTime = null;
}
```

Called **after** timing is read — preserves `transitionStartTime` until log message is formatted.

## Internal Utilities

### timing.ts — Monotonic Time Provider

```
Module load
    │
    ├── performance.now available?
    │   ├── YES → nowFn = () => performance.now()
    │   └── NO  → nowFn = createMonotonicDateNow()
    │
    └── export now = () => nowFn()
```

**Monotonic fallback** (`createMonotonicDateNow`): tracks `lastTimestamp` and `timeOffset` at module level. If `Date.now()` goes backward (clock skew), adds offset to maintain monotonicity.

### formatting.ts — Adaptive Timing

```
formatTiming(startTime, now)
    ├── startTime === null → ""
    ├── durationMs is NaN/Infinity/negative → " (?)"
    ├── durationMs < 0.1 → " (X.XXμs)"
    └── durationMs ≥ 0.1 → " (X.XXms)"
```

Always 2 decimal places via `.toFixed(2)`.

### params-diff.ts — Shallow Diff

```
getParamsDiff(fromParams, toParams)
    ├── Iterate fromParams: detect changed + removed keys
    ├── Iterate toParams: detect added keys
    ├── hasChanges flag (perf: avoids Object.keys().length × 3)
    └── return { changed, added, removed } | null
```

Only triggered for **same-route navigation** (`toState.name === fromState.name`).

### console-groups.ts — Group Manager

Closure-based `isOpened` flag prevents duplicate `console.group()` calls. Opens on `onTransitionStart`, closes on `resetTransitionState` (success/cancel/error/stop/teardown).

### performance-marks.ts — Performance Tracker

```
createPerformanceTracker(enabled, context)
    ├── isSupported = enabled && supportsPerformanceAPI()
    ├── mark(name) → performance.mark(name) if supported
    └── measure(name, start, end) → try { performance.measure } catch → console.warn
```

## Performance API Marks

When `usePerformanceMarks: true`:

| Event              | Mark name                              | Measure name                              |
| ------------------ | -------------------------------------- | ----------------------------------------- |
| Router start       | `router:start`                         | —                                         |
| Transition start   | `router:transition-start:{from}→{to}`  | —                                         |
| Transition success | `router:transition-end:{from}→{to}`    | `router:transition:{from}→{to}`           |
| Transition cancel  | `router:transition-cancel:{from}→{to}` | `router:transition-cancelled:{from}→{to}` |
| Transition error   | `router:transition-error:{from}→{to}`  | `router:transition-failed:{from}→{to}`    |
| Router stop        | `router:stop`                          | `router:lifetime`                         |

All marks/measures are visible in browser DevTools Performance tab.

## Console Output

| Hook                  | Method          | Guard             | Format                                  |
| --------------------- | --------------- | ----------------- | --------------------------------------- |
| `onStart`             | `console.log`   | `logLifecycle`    | `[ctx] Router started`                  |
| `onStop`              | `console.log`   | `logLifecycle`    | `[ctx] Router stopped`                  |
| `onTransitionStart`   | `console.log`   | `logTransition`   | `[ctx] Transition: {from} → {to}`       |
| `onTransitionSuccess` | `console.log`   | `logTransition`   | `[ctx] Transition success (Xms)`        |
| `onTransitionCancel`  | `console.warn`  | `logWarning`      | `[ctx] Transition cancelled (Xms)`      |
| `onTransitionError`   | `console.error` | `logError`        | `[ctx] Transition error: {code} (Xms)`  |
| params diff           | `console.log`   | `shouldLogParams` | `[ctx]  Changed: { ... }, Added: {...}` |

## Environment Detection

| API                | Check                                                                   | Fallback                        |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------- |
| `console.group`    | `typeof console !== "undefined"` + `group` + `groupEnd` are functions   | Groups disabled (no-op)         |
| `performance.mark` | `typeof performance !== "undefined"` + `mark` + `measure` are functions | Marks/measures disabled (no-op) |
| `performance.now`  | `typeof performance !== "undefined"` + `now` is a function              | Monotonic `Date.now()` wrapper  |

All checks happen once (at manager/provider creation), not per call.

## See Also

- [core CLAUDE.md](../core/CLAUDE.md) — Core package architecture (PluginFactory interface)
- [event-emitter ARCHITECTURE.md](../event-emitter/ARCHITECTURE.md) — Event emitter (delivers lifecycle events to plugins)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System-level architecture
- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
