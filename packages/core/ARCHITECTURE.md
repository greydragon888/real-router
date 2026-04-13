# Architecture

> Detailed core package architecture for contributors. See [root ARCHITECTURE.md](../../ARCHITECTURE.md) for system-level overview.

## Overview

`@real-router/core` is the **main package** — a facade over 9 namespaces with FSM-driven lifecycle, plugin system, and tree-shakeable standalone API functions. All state transitions go through a finite state machine; all events flow through a typed event emitter.

**Key role:** Router.ts is a thin facade that validates inputs and delegates to namespaces. No business logic in the facade. Standalone API functions (`getRoutesApi`, `getPluginApi`, etc.) access internals via a `WeakMap` registry — enabling tree-shaking without exposing private state.

## Package Structure

```
core/
├── src/
│   ├── Router.ts                    — Facade class
│   ├── createRouter.ts              — Factory function
│   ├── getNavigator.ts              — Navigator factory (WeakMap-cached)
│   ├── RouterError.ts               — Typed error class
│   ├── constants.ts                 — Error codes, events, limits
│   ├── internals.ts                 — WeakMap registry for API functions
│   ├── transitionPath.ts            — Transition path calculation
│   ├── helpers.ts                   — Utility functions
│   ├── typeGuards.ts                — Runtime type guards
│   ├── types.ts                     — Router-dependent types
│   │
│   ├── fsm/
│   │   └── routerFSM.ts            — FSM config (states, events, payloads)
│   │
│   ├── namespaces/
│   │   ├── RoutesNamespace/         — Route tree, path operations, forwarding
│   │   ├── StateNamespace/          — State storage (current, previous)
│   │   ├── NavigationNamespace/     — navigate(), navigateToNotFound(), transition pipeline
│   │   ├── EventBusNamespace/       — FSM + EventEmitter, subscribe
│   │   ├── PluginsNamespace/        — Plugin lifecycle
│   │   ├── RouteLifecycleNamespace/ — canActivate/canDeactivate guards
│   │   ├── RouterLifecycleNamespace/— start/stop
│   │   ├── OptionsNamespace/        — Router options (immutable)
│   │   └── DependenciesNamespace/   — DI store
│   │
│   ├── wiring/
│   │   ├── RouterWiringBuilder.ts   — Builder: namespace cross-references
│   │   └── wireRouter.ts           — Director: correct wiring order
│   │
│   ├── api/
│   │   ├── getRoutesApi.ts          — Route CRUD (add/remove/update/replace/clear)
│   │   ├── getDependenciesApi.ts    — Dependency CRUD
│   │   ├── getLifecycleApi.ts       — Guard management
│   │   ├── getPluginApi.ts          — Plugin management
│   │   └── cloneRouter.ts           — SSR cloning
│   │
│   └── utils/
│       └── serializeState.ts        — XSS-safe JSON serialization for SSR
```

## Dependencies

```mermaid
graph TD
    CORE["core"] -->|dep| FSM["fsm"]
    CORE -->|dep| RT["route-tree"]
    CORE -->|dep| EE["event-emitter"]
    CORE -->|dep| TG["type-guards"]
    CORE -->|dep| LOG["logger"]
    CORE -->|dep| TYPES["core-types"]

    RT -->|dep| PM["path-matcher"]
    RT -->|dep| SP["search-params"]
```

| Dependency        | What it provides            | Used by                                  |
| ----------------- | --------------------------- | ---------------------------------------- |
| **fsm**           | `FSM` class                 | `EventBusNamespace` (router lifecycle)   |
| **route-tree**    | `createMatcher()`, tree ops | `RoutesNamespace` (path matching, build) |
| **event-emitter** | `EventEmitter` class        | `EventBusNamespace` (event dispatch)     |
| **type-guards**   | `validateRouteName()`       | Facade validation methods                |
| **logger**        | `logger` singleton          | Warning/error logging across namespaces  |
| **core-types**    | Shared type definitions     | All modules                              |

## Facade + Namespaces Pattern

```
Router.ts (facade — validates and delegates)
    │
    ├── OptionsNamespace          — immutable options store
    ├── DependenciesStore         — DI container (plain data interface)
    ├── StateNamespace            — current/previous state, makeState(), deep freeze
    ├── RoutesNamespace           — route tree, matchPath(), buildPath(), forwarding
    ├── RouteLifecycleNamespace   — canActivate/canDeactivate guard registry
    ├── PluginsNamespace          — plugin lifecycle (factory → instance → hooks)
    ├── NavigationNamespace       — navigate(), navigateToNotFound(), transition pipeline
    ├── EventBusNamespace         — FSM + EventEmitter encapsulation
    └── RouterLifecycleNamespace  — start(), stop()
```

**Facade pattern flow:**

1. Facade method validates inputs via `ctx.validator?.ns.fn()` (opt-in plugin pattern)
2. Delegates to namespace instance method via `getInternals(this)` (WeakMap)
3. Returns result to caller

```typescript
// Router.ts — facade
buildPath(route: string, params?: Params): string {
  const ctx = getInternals(this);
  ctx.validator?.routes.validateBuildPathArgs(route);      // no-op if plugin absent
  ctx.validator?.navigation.validateParams(params, "buildPath");
  return ctx.buildPath(route, params);
}
```

### WeakMap Internals Registry

Standalone API functions need access to router internals without exposing them publicly:

```typescript
// internals.ts
const internals = new WeakMap<object, RouterInternals>();

// Router constructor registers ~24 fields
registerInternals(this, {
  makeState: ...,
  matchPath: ...,
  forwardState: createInterceptable("forwardState", ..., interceptorsMap),
  buildPath: createInterceptable("buildPath", ..., interceptorsMap),
  start: createInterceptable("start", ..., interceptorsMap),
  interceptors: interceptorsMap,  // shared ref — plugins push/splice via getPluginApi
  // ... ~24 fields total
});

// api/getRoutesApi.ts
export function getRoutesApi(router: Router): RoutesApi {
  const ctx = getInternals(router);  // access via WeakMap
  return { add: ..., remove: ..., replace: ... };
}
```

**Why WeakMap?** No public exposure of private state. GC-safe. Tree-shakeable.

### Wiring System (Builder + Director)

Namespaces have linear dependencies. Constructed independently, then wired via **setter injection** in a fixed order:

```typescript
// wireRouter.ts — Director
function wireRouter(builder: RouterWiringBuilder) {
  builder.wireLimits(); // 1. All namespaces get limits first
  builder.wireRouteLifecycleDeps(); // 2. Guard registry gets router + getDependency
  builder.wireRoutesDeps(); // 3. Routes gets guards + state (registers pending handlers)
  builder.wirePluginsDeps(); // 4. Plugins get addEventListener + canNavigate
  builder.wireNavigationDeps(); // 5. Navigation gets state, routes, eventBus + canNavigate
  builder.wireLifecycleDeps(); // 6. RouterLifecycle gets navigate, navigateToNotFound, matchPath
  builder.wireStateDeps(); // 7. State gets defaultParams, buildPath, getUrlParams
}
```

**Order matters:**

- `wireRouteLifecycleDeps()` BEFORE `wireRoutesDeps()` — route registration triggers guard registration which requires `RouteLifecycleNamespace` to be ready
- `wireNavigationDeps()` BEFORE `wireLifecycleDeps()` — lifecycle deps reference `NavigationNamespace.navigate()` which requires navigation deps to be set

## FSM → Event Bridge

FSM actions trigger event emission. Registered in `EventBusNamespace.#setupFSMActions()`:

```typescript
fsm.on("STARTING", "STARTED", () => emitter.emit("$start"));
fsm.on("READY", "STOP", () => emitter.emit("$stop"));
fsm.on("READY", "NAVIGATE", (p) =>
  emitter.emit("$$start", p.toState, p.fromState),
);
fsm.on("TRANSITION_STARTED", "LEAVE_APPROVE", (p) =>
  emitter.emit("$$leaveApprove", p.toState, p.fromState),
);
fsm.on("LEAVE_APPROVED", "COMPLETE", (p) =>
  emitter.emit("$$success", p.state, p.fromState, p.opts),
);
fsm.on("TRANSITION_STARTED", "CANCEL", (p) =>
  emitter.emit("$$cancel", p.toState, p.fromState),
);
// FAIL actions on STARTING, READY, TRANSITION_STARTED → emitter.emit("$$error", ...)
```

**`send*` vs `emit*` naming convention** in `EventBusNamespace`:

- `send*` — routes through FSM (triggers FSM transition, FSM action emits event)
- `emit*` — emits directly to EventEmitter (bypasses FSM)

## Navigation Pipeline

### navigate() Flow

```
 router.navigate(name, params, opts)
           │
           ▼
┌──────────────────────┐
│  Validate arguments  │  validateNavigateArgs() + validateNavigationOptions()
│  (skipped if         │
│   noValidate=true)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Check canNavigate() │  FSM canSend("NAVIGATE") → false = ROUTER_NOT_STARTED
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Build target state  │  buildStateWithSegments() (internally calls forwardState())
│  + force replace     │  forceReplaceFromUnknown(opts, fromState)
│  + SAME_STATES check │  fromState.path === toState.path — canonical path comparison
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Cancel in-flight    │  if TRANSITION_STARTED: abort prev controller, send CANCEL
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  AbortController     │  new AbortController() + link external opts.signal
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  FSM send(NAVIGATE)  │  → TRANSITION_STARTED → emitTransitionStart(toState, fromState)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Deactivation guards │  for each segment in toDeactivate (innermost → outermost):
│                      │    guardFn(toState, fromState, signal)
│                      │    false → RouterError(CANNOT_DEACTIVATE)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  LEAVE_APPROVED      │  FSM send(LEAVE_APPROVE) → emit $$leaveApprove
│                      │    → subscribeLeave() callbacks fire (sync or async)
│                      │    listeners receive { route, nextRoute, signal: AbortSignal }
│                      │    async listeners block pipeline (Promise.allSettled)
│                      │    route state has NOT changed yet
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Activation guards   │  for each segment in toActivate (outermost → innermost):
│                      │    guardFn(toState, fromState, signal)
│                      │    false → RouterError(CANNOT_ACTIVATE)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Cleanup deactivated │  clearCanDeactivate() for inactive segments
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Build TransitionMeta│  { reload?, redirected?, phase, from, reason, segments }
│  + deep freeze       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  setState()          │  state.set(finalState)
│  FSM send(COMPLETE)  │  → READY → emitTransitionSuccess(state, fromState, opts)
└──────────┬───────────┘
           │
           ▼
  Promise resolves with finalState
```

### Error Routing

Errors during navigation are routed through two different paths depending on FSM state:

| Path            | Method                  | When                                                       | Effect                                   |
| --------------- | ----------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| **Via FSM**     | `sendFail()` → FSM FAIL | FSM is in READY or TRANSITION_STARTED                      | FSM transitions → action emits `$$error` |
| **Direct emit** | `emitTransitionError()` | Error before FSM transition (ROUTE_NOT_FOUND, SAME_STATES) | Emits directly, FSM state unchanged      |

The branching logic lives in `RouterWiringBuilder` (wiring layer). When an error occurs before `startTransition()`, the wiring checks `isReady()`: if READY — routes through FSM; if TRANSITION_STARTED — emits directly to avoid disturbing the ongoing transition.

### navigateToNotFound() — Pipeline Bypass

`navigateToNotFound(path?)` is **synchronous**. Bypasses the entire navigate() pipeline:

1. Check `isActive()` → throw ROUTER_NOT_STARTED if false
2. Resolve path → `path ?? currentState.path`
3. Build UNKNOWN_ROUTE state + deep freeze
4. `setState()` directly (no FSM transition)
5. `emitTransitionSuccess(state, fromState, { replace: true })`
6. Return State synchronously

**No guards, no FSM transition, no AbortController.** Only `TRANSITION_SUCCESS` is emitted (no `TRANSITION_START`). Plugin authors must not assume every `onTransitionSuccess` is preceded by `onTransitionStart`.

### Transition Path Calculation

`getTransitionPath(toState, fromState)` determines which route segments to deactivate and activate:

```typescript
// users.profile → admin.dashboard
{ intersection: "", toDeactivate: ["users.profile", "users"], toActivate: ["admin", "admin.dashboard"] }

// users.list → users.profile
{ intersection: "users", toDeactivate: ["users.list"], toActivate: ["users.profile"] }
```

**`nameToIDs()` fast paths:** Optimized for 0-4 segments via `indexOf()`-based scanning (avoids `split()`). 5+ segments use general path.

**Single-entry cache:** `getTransitionPath()` caches the last result by reference equality — eliminates N-1 redundant computations when `shouldUpdateNode()` calls it N times per navigation.

### Cancellation

```
User signal (opts.signal)  ──┐
Concurrent navigation  ──────┤──→  internal AbortController.abort()
router.stop()  ──────────────┤      │
router.dispose()  ───────────┘      ▼
                               Guard receives signal as 3rd param
                               AbortError auto-converted to TRANSITION_CANCELLED
```

**Fire-and-forget safety:** `navigate()` internally attaches `.catch()` to suppress expected errors (`SAME_STATES`, `TRANSITION_CANCELLED`, `ROUTER_NOT_STARTED`, `ROUTE_NOT_FOUND`).

**Atomicity:** **State change is atomic** — `router.getState()` updates in one step via `completeTransition`. Either the full pipeline completes or nothing changes. However, the transition pipeline now has an observable intermediate phase: after deactivation guards pass and before activation guards run, the FSM enters `LEAVE_APPROVED`. This is the moment for safe side-effects — scroll preservation, fetch abort, analytics. Route state has not yet changed.

## Plugin System

Plugin hooks are bound to router events via `addEventListener()`:

| Plugin method              | Router event     | When                                          |
| -------------------------- | ---------------- | --------------------------------------------- |
| `onStart`                  | `$start`         | `router.start()` succeeds                     |
| `onStop`                   | `$stop`          | `router.stop()` called                        |
| `onTransitionStart`        | `$$start`        | Navigation begins                             |
| `onTransitionLeaveApprove` | `$$leaveApprove` | Deactivation guards passed, before activation |
| `onTransitionSuccess`      | `$$success`      | Navigation completes                          |
| `onTransitionError`        | `$$error`        | Navigation fails                              |
| `onTransitionCancel`       | `$$cancel`       | Navigation cancelled                          |

**Note:** `onTransitionSuccess` can fire without a preceding `onTransitionStart` — via `navigateToNotFound()`.

### Interception

Plugins intercept router methods via `addInterceptor()` on `PluginApi`:

| Interceptable method | Used by                  |
| -------------------- | ------------------------ |
| `start`              | browser-plugin           |
| `buildPath`          | persistent-params-plugin |
| `forwardState`       | persistent-params-plugin |

Multiple interceptors per method execute in **LIFO** order (last-registered wraps first). Each receives `next` plus the method's arguments. Chains stored in `RouterInternals.interceptors` (`Map<string, InterceptorFn[]>`).

### Router Extension

`extendRouter(extensions)` on `PluginApi` assigns properties directly to the router instance. Conflict detection is atomic — all keys checked before any assigned. Throws `RouterError(PLUGIN_CONFLICT)` on collision. Extensions tracked in `RouterInternals.routerExtensions` for cleanup on unsubscribe or `dispose()`.

## Guards

### Guard Origin Tracking

`RouteLifecycleNamespace` tracks guard origins via two `Set<string>` collections:

- **Definition guards** — from route config (`canActivate`/`canDeactivate` in route definition), tracked in `#definitionActivateGuardNames`
- **External guards** — registered via `getLifecycleApi().addActivateGuard()`

`replace()` clears only definition guards; external guards survive route replacement.

### Segment Cleanup After Deactivation

After successful navigation, deactivated segments with `canDeactivate` guards are automatically cleaned up. Only clears guards for segments that are fully deactivated (not re-activated). Uses `Array.includes()` instead of `Set` — faster for 1-5 elements.

## Dispose Lifecycle

`router.dispose()` — idempotent, safe to call multiple times. Cleanup order:

1. Abort current navigation
2. Cancel transition if running
3. Stop router (if READY or TRANSITION_STARTED)
4. FSM → DISPOSED (terminal state)
5. Clear event listeners
6. Dispose plugins (remove listeners + call `teardown()`)
7. Clean up remaining router extensions (safety net)
8. Clear routes + lifecycle guards
9. Reset state
10. Clear dependencies
11. Replace mutating methods with `throwDisposed()`

## Clone Router (SSR)

`cloneRouter(router, deps?)` creates an isolated instance for server-side rendering:

| What              | How cloned                                         |
| ----------------- | -------------------------------------------------- |
| Route definitions | Extracted via `routeTreeToDefinitions()`, re-built |
| Route config      | Shallow-copied (`Object.assign` for each map)      |
| Options           | Shallow-copied via spread                          |
| Dependencies      | Shallow-copied, then merged with user overrides    |
| All guards        | Re-registered (both definition and external)       |
| Plugins           | Re-instantiated (factories re-run)                 |
| State             | Fresh (no state — must call `start()`)             |

Route tree is re-built from definitions (not shared) — each clone has independent tree.

## Boundaries

### Namespace Rules

- Namespaces **never** call each other directly at construction time — all cross-references are wired via setter injection in `wireRouter()`
- `NavigationNamespace` is the **only** namespace that orchestrates multi-namespace operations (state + routes + eventBus + lifecycle)
- `EventBusNamespace` is the **only** namespace that holds the FSM instance and EventEmitter
- `DependenciesStore` is a plain data interface — no class, no methods that call other namespaces
- Structural guards remain in namespace folders (`OptionsNamespace`, `PluginsNamespace`). DX validators live in `@real-router/validation-plugin`, accessed via `ctx.validator?.`

### Facade Rules

- Facade **never** contains business logic — only validation + delegation
- Facade validation uses `ctx.validator?.ns.fn()` — optional chaining means zero overhead when plugin is absent
- All facade methods access internals via `getInternals(this)` — never via direct namespace field access

### API Function Rules

- API functions access internals **only** via `getInternals(router)` WeakMap
- API functions **never** import namespace classes directly
- Each API function returns a frozen or plain object — never exposes `RouterInternals`

## Performance Characteristics

| Optimization                            | Purpose                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `nameToIDs()` fast paths (0-4 segments) | Avoids `split()` for most common route depths                           |
| Single-entry transition path cache      | N-1 redundant computations eliminated per navigation                    |
| validation-plugin opt-in                | DX validation via `@real-router/validation-plugin` (skip in production) |
| `static #onSuppressedError` callback    | One allocation per class, not per `navigate()` call                     |
| Deep freeze with WeakSet cache          | Avoids re-freezing already frozen state objects                         |
| `Array.includes()` for segment cleanup  | Faster than `new Set()` for 1-5 elements                                |
| FSM `canSend()` — O(1)                  | Cached `#currentTransitions` lookup                                     |
| `createInterceptable()` fast path       | Empty-array check skips iteration when no interceptors                  |
| Lazy event listeners                    | No allocation until first subscription                                  |
| Cached error rejections                 | Pre-allocated `Promise.reject()` for common errors                      |
| Async leave: no-abort on sync path      | AbortController.abort() skipped when all leave listeners are sync       |
| Async leave: deferred NavigationContext | `{nav}` object created only in async branch, not on every navigate      |
| Async leave: `isCurrentNav` scoped      | Closure moved to guards block — not allocated on no-guards path         |

## Stress Test Coverage

103 stress tests across 25 files in `tests/stress/` validate behavior under extreme conditions:

| Category              | Tests (file count) | Test count | What they verify                                                            |
| --------------------- | ------------------ | ---------- | --------------------------------------------------------------------------- |
| Memory & leaks        | 4 files            | 19 tests   | Heap stable across thousands of navigations; dispose releases all resources |
| Concurrent navigation | 3 files            | 14 tests   | Fire-and-forget storm, AbortController churn, mixed concurrent operations   |
| Guards under load     | 3 files            | 12 tests   | Guard execution under load, removal mid-execution, 1000+ error cycles       |
| Route CRUD            | 3 files            | 12 tests   | Add/remove/replace under load, atomic replace, 1000+ route trees            |
| Lifecycle             | 2 files            | 10 tests   | Rapid start/stop cycles, FSM transition correctness under churn             |
| Edge cases            | 4 files            | 14 tests   | Deep forwarding chains, unknown route handling, utility function stress     |
| FSM & Events          | 3 files            | 13 tests   | Event depth limits, listener cleanup, FSM state correctness                 |
| Utilities & Helpers   | 4 files            | 9 tests    | Hot path utilities, navigator caching, state equality, active route checks  |

## See Also

- [root ARCHITECTURE.md](../../ARCHITECTURE.md) — system-level overview, FSM state diagram, package dependencies
- [INVARIANTS.md](INVARIANTS.md) — property-based test invariants (120+ invariants verified via fast-check)
- [../fsm/ARCHITECTURE.md](../fsm/ARCHITECTURE.md) — FSM engine
- [../event-emitter/ARCHITECTURE.md](../event-emitter/ARCHITECTURE.md) — event emitter
- [../route-tree/ARCHITECTURE.md](../route-tree/ARCHITECTURE.md) — route tree and matcher
- [../path-matcher/ARCHITECTURE.md](../path-matcher/ARCHITECTURE.md) — Segment Trie URL matching
- [../search-params/ARCHITECTURE.md](../search-params/ARCHITECTURE.md) — query string handling
