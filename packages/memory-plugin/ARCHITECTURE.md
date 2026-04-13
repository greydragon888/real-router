# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/memory-plugin` is an **in-memory history stack plugin** for the router. It maintains a `HistoryEntry[]` array and a current index, then exposes `back()`, `forward()`, `go(delta)`, `canGoBack()`, and `canGoForward()` as router extensions.

**Key role:** Provides browser-like history navigation without any dependency on `window.history`. Designed for React Native, testing environments, SSR navigation simulation, and any context where the browser History API is unavailable.

## Package Structure

```
memory-plugin/
├── src/
│   ├── factory.ts  — memoryPluginFactory: validates maxHistoryLength, freezes options, returns PluginFactory
│   ├── plugin.ts   — MemoryPlugin class: history array + index management, extendRouter, getPlugin()
│   ├── types.ts    — MemoryPluginOptions, HistoryEntry interfaces
│   └── index.ts    — Public exports + Router module augmentation
```

## Dependencies

```mermaid
graph LR
    MP["@real-router/memory-plugin"] -->|dep| CORE["@real-router/core"]

    CORE -.->|provides| PF[PluginFactory]
    CORE -.->|provides| PA[PluginApi]
    CORE -.->|provides| TYPES["State, NavigationOptions"]

    subgraph plugin [Plugin Instance]
        OTS["onTransitionSuccess"] --> PUSH[push / replace entry]
        OS["onStop"] --> CLEAR[clear entries]
        TD["teardown"] --> RM[removeExtensions + clear]
        GO["#go(delta)"] --> NAV["router.navigate()"]
        NAV --> THEN[".then() → update #index"]
        NAV --> CATCH[".catch() → index unchanged"]
        NAV --> FIN[".finally() → reset flag"]
    end
```

| Import source             | What it uses                                                      | Purpose                          |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| **@real-router/core**     | `PluginFactory`, `Plugin`, `Router`, `State`, `NavigationOptions` | Plugin types and router contract |
| **@real-router/core/api** | `getPluginApi`, `PluginApi`                                       | `extendRouter()` to add methods  |

## Core Algorithm

### History Management

```
Forward navigation: navigate("users", { id: "1" })
    │
    onTransitionSuccess(toState, fromState, opts)
    │
    ├── #navigatingFromHistory === true?
    │   └── YES → return (skip recording — this is a back/forward replay)
    │
    ├── opts.replace === true AND #index >= 0?
    │   └── YES → #entries[#index] = entry  (overwrite current)
    │
    └── NO → splice(#index + 1)             (discard forward history)
             push(entry)
             #index = #entries.length - 1
             │
             └── maxHistory > 0 AND length > maxHistory?
                 └── YES → splice(0, overflow), adjust #index
```

### Navigation Flow: `#go(delta)`

```
back() / forward() / go(delta)
    │
    └── #go(delta)
        │
        ├── delta === 0? → return (no-op)
        │
        ├── targetIndex = #index + delta
        ├── targetIndex out of bounds? → return (no-op)
        │
        ├── #navigatingFromHistory = true
        │
        └── router.navigate(entry.name, entry.params, { replace: true })
            ├── .then()    → #index = targetIndex
            ├── .catch()   → (guard blocked — index stays unchanged)
            └── .finally() → #navigatingFromHistory = false
```

The `navigatingFromHistory` flag prevents `onTransitionSuccess` from recording the replayed navigation as a new history entry.

## Data Flow

### Forward navigation

```
router.navigate("page", params)
    │
    [transition pipeline]
    │
    onTransitionSuccess(toState, _, opts)
    │
    ├── navigatingFromHistory? NO
    ├── opts.replace? NO
    └── splice(#index + 1) → push entry → #index++
```

### Back / Forward

```
router.back()
    │
    #go(-1)
    │
    #navigatingFromHistory = true
    │
    router.navigate(entry.name, entry.params, { replace: true })
    │
    ├── SUCCESS → .then() → #index = targetIndex
    └── BLOCKED → .catch() → #index unchanged
                  .finally() → #navigatingFromHistory = false
```

### Guard blocks back navigation

```
router.back()
    │
    #go(-1)
    │
    router.navigate(...)
    │
    CANNOT_ACTIVATE (guard returns false)
    │
    .catch() → index stays at current position
    .finally() → #navigatingFromHistory = false

canGoBack() still returns true — position unchanged
```

## Design Decisions

### Why `void` not `Promise` for `back()`/`forward()`/`go()`

Plugin extensions registered via `extendRouter()` must be synchronous per the core contract — the router's type system expects `void` return values for these methods. The underlying `router.navigate()` call is async, but the result is discarded with `void`. Callers who need completion signals should subscribe to state changes before calling.

### Why `replace: true` in `#go()`

Navigating back or forward replays an existing history entry. Using `replace: true` prevents `onTransitionSuccess` from pushing a duplicate entry (even with the `navigatingFromHistory` guard in place, this is the correct semantic: the history position changes, not the history length).

### Why `#index` updates in `.then()` not synchronously

Guards can block navigation. If `#index` updated synchronously before the navigate promise settled, a blocked navigation would leave the index pointing at the wrong entry. Updating in `.then()` ensures `canGoBack()`/`canGoForward()` always reflect the actual committed router state.

### Why `go(0)` is a no-op

Delta zero means "navigate to the current entry." This would trigger a full transition to the same state, which core rejects with `SAME_STATES`. The early return avoids the unnecessary navigate call and the resulting error.

### Why `HistoryEntry` is not exported

`HistoryEntry` is an internal implementation detail. Callers interact with history through the five router extension methods (`back`, `forward`, `go`, `canGoBack`, `canGoForward`). Exporting the type would imply a public API surface that doesn't exist.

## Plugin Lifecycle

```
router.usePlugin(memoryPluginFactory(options))
    │
    memoryPluginFactory(options)
    ├── validate maxHistoryLength (throws TypeError if negative)
    └── freeze options
        │
        return PluginFactory
            │
            (router) => Plugin
                │
                getPluginApi(router)
                new MemoryPlugin(router, api, options)
                    └── api.extendRouter({ back, forward, go, canGoBack, canGoForward })
                        └── returns removeExtensions()
                │
                return plugin.getPlugin()
                    └── { onTransitionSuccess, onStop, teardown }

router.stop()
    └── onStop → #clear() (entries + index reset, extensions remain)

router.usePlugin() unsubscribe / teardown
    └── teardown → #removeExtensions() + #clear()
```

## See Also

- [CLAUDE.md](CLAUDE.md) — Exports, gotchas, module structure
- [core CLAUDE.md](../core/CLAUDE.md) — Core package architecture (PluginFactory, extendRouter)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System-level architecture
