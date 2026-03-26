# @real-router/core

## Architecture

### Namespace-Based Design

The router uses a **facade + namespaces** architecture:

```
Router.ts (facade)
    │
    ├── RoutesNamespace        — route tree, path operations, forwarding
    ├── StateNamespace         — state storage (current, previous)
    ├── NavigationNamespace    — navigate(), transition pipeline
    ├── OptionsNamespace       — router options
    ├── DependenciesNamespace  — dependency injection (plain store, not a class)
    ├── EventBusNamespace      — FSM + EventEmitter encapsulation, events, subscribe
    │       └── routerFSM      — FSM instance (lifecycle + navigation state)
    ├── PluginsNamespace       — plugin lifecycle
    ├── RouteLifecycleNamespace — canActivate/canDeactivate guards
    └── RouterLifecycleNamespace — start/stop

api/ (standalone functions — tree-shakeable)
    ├── getRoutesApi(router)      — route CRUD
    ├── getDependenciesApi(router) — dependency CRUD
    ├── getLifecycleApi(router)   — guard management
    ├── getPluginApi(router)      — plugin management
    └── cloneRouter(router, deps) — SSR cloning

utils/ (SSR helpers — separate subpath export)
    └── serializeState(data)      — XSS-safe JSON for embedding in HTML <script> tags
```

**RouterFSM states**: `IDLE → STARTING → READY ⇄ TRANSITIONING (+ NAVIGATE self-loop) → IDLE | DISPOSED`

All router events are consequences of FSM transitions (via `fsm.on(from, event, action)`), not manual calls. 
No boolean flags (`#started`, `#active`, `#navigating` removed).

### Validation Pattern

Validation has two tiers: **invariant protection** in core (structural guards + 2 invariant guards) and **DX validation** opt-in via @real-router/validation-plugin. The plugin installs a `RouterValidator` object into `RouterInternals.validator` at registration time.

**Facade methods** and **standalone API functions** call through the optional validator using optional chaining:

```typescript
// Router.ts (facade)
buildPath(route: string, params?: Params): string {
  const ctx = getInternals(this);
  ctx.validator?.routes.validateBuildPathArgs(route);      // no-op if plugin absent
  ctx.validator?.navigation.validateParams(params, "buildPath");
  return ctx.buildPath(route, params);  // via WeakMap — applies interceptor pipeline
}

// api/getRoutesApi.ts (standalone API)
add(routes) {
  ctx.validator?.routes.validateAddRouteArgs(routes);  // no-op if plugin not registered
  addRoutes(store, routes);
}
```

The `validator` object is namespaced by concern (`routes`, `navigation`, `state`, `lifecycle`, `dependencies`, `plugins`, `options`, `eventBus`). Each namespace maps to a group of validator functions.

**Plugin lifecycle:**
- `validationPlugin()` is registered before `router.start()` — throws `VALIDATION_PLUGIN_AFTER_START` otherwise
- On registration: installs validator + runs retrospective validation on existing routes/deps/options
- On teardown (`unsubscribe()`): sets `ctx.validator = null` — validation silently disabled

Structural guards remain in namespace folders (`OptionsNamespace/validators.ts`, `PluginsNamespace/validators.ts`). DX validators live in `@real-router/validation-plugin`, accessed via `RouterValidator` interface in `src/types/RouterValidator.ts`.

### Invariant Guards (always active, no plugin required)

Core contains two invariant guards that run regardless of whether validation-plugin is installed:

- **`subscribe(listener)`** — validates `typeof listener === "function"`. Prevents deferred crash (non-function stored in EventEmitter, crash on next navigation). Includes actionable hint: "For Observable pattern use @real-router/rx package".
- **`navigateToNotFound(path)`** — validates `typeof path === "string"` when path is provided. Prevents silent state corruption (`state.path = 42`).

**Criterion for adding invariant guards:** (a) silent corruption — invalid input doesn't crash but corrupts state, or (b) deferred crash in user-facing API — error stored, crash later with unrelated stack trace.

### Namespace Folder Structure

Each namespace has its own folder with separated concerns:

```
namespaces/RoutesNamespace/
├── RoutesNamespace.ts     — class with instance methods
├── routesStore.ts         — plain data store (RoutesStore interface + factory)
├── forwardToValidation.ts — extracted validation logic
├── constants.ts           — namespace-specific constants
├── helpers.ts             — pure helper functions (no state)
├── validators.ts          — standalone validator functions
├── types.ts               — namespace-specific types/interfaces
└── index.ts               — exports

namespaces/DependenciesNamespace/
├── dependenciesStore.ts   — plain data store (DependenciesStore interface + factory)
├── validators.ts          — standalone validator functions
└── index.ts               — exports
```

**Store pattern:** `RoutesStore` and `DependenciesStore` are plain data interfaces (not classes). CRUD logic lives in the corresponding standalone API function (`getRoutesApi.ts`, `getDependenciesApi.ts`).

### Dependency Injection

Namespaces receive cross-references via setter injection during wiring (after construction):

```typescript
// RouterWiringBuilder (called by wireRouter)
this.routeLifecycle.setRouter(this.router);
this.routes.setLifecycleNamespace(this.routeLifecycle);
this.plugins.setRouter(this.router);
```

This allows namespaces to be constructed independently, then wired together by `RouterWiringBuilder`.

### Plugin Interception Points

Plugins intercept router methods via a universal `addInterceptor()` API on `PluginApi`:

```typescript
const api = getPluginApi(router);

// Wrap forwardState to inject persistent params
api.addInterceptor("forwardState", (next, routeName, routeParams) => {
  const result = next(routeName, routeParams);
  return { ...result, params: withPersistentParams(result.params) };
});

// Wrap start to make path optional (browser-plugin)
api.addInterceptor("start", (next, path) => next(path ?? browser.getLocation()));
```

**`InterceptableMethodMap`** defines interceptable methods: `start`, `buildPath`, `forwardState`. Consumers: `browser-plugin` (start), `persistent-params-plugin` (buildPath, forwardState), `ssr-data-plugin` (start).

Multiple interceptors per method execute in LIFO (reverse registration) order — the last-registered interceptor wraps the first, forming an onion-layer chain. Each receives `next` (original or previously-wrapped function) plus the method's arguments. Returns unsubscribe function.

Internally, `createInterceptable()` in `internals.ts` wraps methods at wiring time via `RouterInternals` WeakMap, ensuring all call paths (facade, wiring, plugins) are intercepted.

### Router Extension via `extendRouter()`

Plugins can formally extend the router instance with new properties via `extendRouter()`:

```typescript
const api = getPluginApi(router);

const removeExtensions = api.extendRouter({
  buildUrl: (name, params) => buildUrlImpl(name, params),
  matchUrl: (url) => matchUrlImpl(url),
});

// Extensions are assigned directly to the router instance
router.buildUrl("users", { id: "1" }); // works (via declare module augmentation)

// Cleanup: removes extensions from router
removeExtensions();
```

**Conflict detection:** Throws `RouterError(PLUGIN_CONFLICT)` if any key already exists on the router instance. Validation is atomic — all keys are checked before any are assigned.

**Automatic cleanup:** Extensions are tracked in `RouterInternals.routerExtensions` and removed on unsubscribe. `Router.dispose()` includes a safety-net that cleans up any remaining extensions after plugin teardown.

---

## Key Concepts

### State is Immutable

States are **deeply frozen** via `Object.freeze()`. Never mutate, always create new.

### Router Lifecycle: dispose()

`dispose()` permanently terminates the router. Unlike `stop()`, it cannot be restarted.

```typescript
router.dispose(); // Idempotent — safe to call multiple times
```

**Lifecycle**: IDLE → DISPOSED (always via IDLE, even if READY or TRANSITIONING)
**Cleanup order**: abort navigation → cancel transition → stop (if ready/transitioning) → FSM DISPOSE → clearAll (events) → plugins → router extensions (safety net) → routes → lifecycle → state → deps → markDisposed
**After dispose**: All mutating methods throw `RouterError(ROUTER_DISPOSED)`
**Idempotency**: Second call is a no-op (FSM state check)

### Enhanced State Object: TransitionMeta

After every successful navigation, `router.getState()` includes a `transition` field:

```typescript
const state = await router.navigate("users.profile", { id: "123" });
state.transition; // TransitionMeta
// {
//   reload: true,             // true after navigate(..., { reload: true }) (optional)
//   redirected: true,         // true if navigation was redirected via forwardTo (optional)
//   phase: "activating",      // last phase reached: "deactivating" | "activating"
//   from: "home",             // previous route name (undefined on first navigation)
//   reason: "success",        // always "success" for resolved navigations
//   blocker: undefined,       // guard name that blocked (reserved, not yet populated by core)
//   segments: {
//     deactivated: ["home"],  // route segments deactivated (frozen array)
//     activated: ["users", "users.profile"], // route segments activated (frozen array)
//     intersection: "",       // common ancestor segment
//   }
// }
```

Transition timing is available via `@real-router/logger-plugin`.

`TransitionMeta` and its nested objects are deeply frozen.

### Transition Pipeline

All navigation methods return `Promise<State>`. The pipeline uses **optimistic sync execution** — guards run synchronously until one returns a Promise, then switches to async.

```
router.navigate(name, params, opts)
  │
  ├── Build target state (buildNavigateState)
  ├── Same-state check (areStatesEqual)
  ├── FSM forceState(TRANSITIONING) + emitTransitionStart()
  │
  ├── Guard pipeline (executeGuardPipeline)
  │   ├── Deactivation guards (innermost → outermost)
  │   └── Activation guards (outermost → innermost)
  │   Returns: undefined (all sync) | Promise<void> (async detected)
  │
  ├── SYNC PATH (no async guards):
  │   └── completeTransition() → setState + FSM forceState(READY)
  │       → emitTransitionSuccess → return Promise.resolve(state)
  │
  └── ASYNC PATH (async guard detected):
      └── #finishAsyncNavigation(guardCompletion, ...)
          ├── AbortController setup (deferred — only on async path)
          ├── await guardCompletion
          └── completeTransition() → same as sync
```

**Key optimization:** When no guards return Promises (common case), the entire navigation runs synchronously — no AbortController, no async/await, no microtask delay.

On error at any step: `emitTransitionError()` → `Plugin.onTransitionError()` → Promise rejects with `RouterError`.

**Cached error fast paths:** Common rejections (SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND) return pre-allocated `Promise.reject()` instances from `constants.ts` — zero allocation per rejection.

**`navigateToNotFound()` bypasses this pipeline entirely.** It sets state directly and emits only `TRANSITION_SUCCESS` (no `TRANSITION_START`, no guards, no FSM transition, no AbortController). Always passes `{ replace: true }` as opts.

**Fire-and-forget safety:** `navigate()` internally suppresses unhandled rejections for expected errors (`SAME_STATES`, `TRANSITION_CANCELLED`, `ROUTER_NOT_STARTED`, `ROUTE_NOT_FOUND`), so calling `router.navigate(...)` without `await` is safe.

### NavigationNamespace File Structure

```
namespaces/NavigationNamespace/
├── NavigationNamespace.ts     — navigate(), #finishAsyncNavigation()
├── constants.ts               — cached error instances (CACHED_*_REJECTION)
├── types.ts                   — NavigationContext, NavigationDependencies
├── validators.ts              — argument validation
└── transition/
    ├── guardPhase.ts          — executeGuardPipeline(), runGuards(), resolveRemainingGuards()
    ├── completeTransition.ts  — completeTransition(), buildTransitionMeta()
    └── errorHandling.ts       — handleGuardError(), routeTransitionError()
```

**Guard pipeline** (`guardPhase.ts`): `executeGuardPipeline()` orchestrates deactivation → activation phases. `runGuards()` iterates guards synchronously, returns `Promise<void>` on first async guard. `resolveRemainingGuards()` continues the async tail as a flat for-loop (no `.slice()` allocations).

**`NavigationContext`** (`types.ts`): Shared interface passed from `navigate()` through async path to `completeTransition()`. Avoids constructing intermediate objects on the hot path.

### Guards vs Plugins

|                     | Guards              | Plugins            |
| ------------------- | ------------------- | ------------------ |
| When                | Before state change | After state change |
| Can block           | Yes                 | No                 |
| Can redirect        | No                  | No                 |
| Can transform state | No                  | No                 |
| Scope               | Per-route           | Global             |

**`navigateToNotFound()` bypasses both:** no guards run, plugins only see `onTransitionSuccess` (no `onTransitionStart`).

### Force Replace from UNKNOWN_ROUTE

When navigating FROM `UNKNOWN_ROUTE` state, `navigate()` auto-forces `replace: true` to prevent browser history pollution with 404 entries. This is handled by `forceReplaceFromUnknown()` in `NavigationNamespace`.

### Atomic Route Replacement: replace()

`getRoutesApi(router).replace(routes)` atomically replaces all routes in one operation.

**Semantics** (6-step pipeline):
1. **Blocking** — `throwIfDisposed()`, silent no-op during active navigation
2. **Validation** — fail-fast, tree unchanged on error (atomicity)
3. **Clear route data** — `clearRouteData()` (without tree rebuild)
4. **Clear definition guards** — `clearDefinitionGuards()` preserves external guards
5. **Register new routes** — sanitize + `registerAllRouteHandlers()`
6. **Single tree rebuild + state revalidation** — `commitTreeChanges()` + `matchPath(currentPath)`

**Guard origin tracking**: `RouteLifecycleNamespace` tracks guard origins via `isFromDefinition` parameter on `addCanActivate()`/`addCanDeactivate()` with two tracking Sets (`#definitionActivateGuardNames`, `#definitionDeactivateGuardNames`). `clearDefinitionGuards()` clears only definition-sourced guards; external guards survive `replace()`.

**Key files**: `getRoutesApi.ts` (`replaceRoutes` helper), `RouteLifecycleNamespace.ts` (guard tracking), `routesStore.ts` (`clearRouteData()`).

### Plugin System

```typescript
const myPlugin: PluginFactory = (router, getDependency) => ({
  onStart() {
    /* router started */
  },
  onStop() {
    /* router stopped */
  },
  onTransitionStart(toState, fromState) {
    /* navigation began */
  },
  onTransitionSuccess(toState, fromState, opts) {
    /* navigation completed */
  },
  onTransitionError(toState, fromState, err) {
    /* navigation failed */
  },
  onTransitionCancel(toState, fromState) {
    /* navigation cancelled */
  },
  teardown() {
    /* cleanup on unsubscribe */
  },
});

const unsubscribe = router.usePlugin(myPlugin);
```

**Key:** Plugins are **observers** - they react to events but cannot modify the transition.

**Conditional registration:** `usePlugin()` silently skips falsy values (`undefined`, `null`, `false`), enabling inline conditionals:

```typescript
router.usePlugin(
  browserPluginFactory(),
  __DEV__ && validationPlugin(),   // false when __DEV__ is false — skipped
);
```

Plugins can extend the router instance with new methods via `extendRouter()`:

```typescript
const myPlugin: PluginFactory = (router, getDependency) => {
  const api = getPluginApi(router);
  const removeExtensions = api.extendRouter({
    customMethod: () => { /* ... */ },
  });

  return {
    teardown() {
      removeExtensions(); // auto-cleanup on unsubscribe
    },
  };
};
```

## Gotchas

### Guards Cannot Redirect

All guards use `GuardFn` (`boolean | Promise<boolean>`) — **no State return**.

Both route config (`canActivate`/`canDeactivate`) and `addActivateGuard`/`addDeactivateGuard` accept `GuardFnFactory` which returns `GuardFn`.

**`GuardFnFactory` signature: `(router, getDependency) => GuardFn`** — same as `PluginFactory`.

```typescript
import { getLifecycleApi } from "@real-router/core/api";

const lifecycle = getLifecycleApi(router);

// WRONG - GuardFn can only return boolean
lifecycle.addActivateGuard("admin", (router, getDep) => (toState, fromState) => {
  return router.makeState("login"); // TypeError! GuardFn returns boolean only
});

// CORRECT - return boolean, use getDependency for DI
lifecycle.addActivateGuard("admin", (router, getDep) => (toState) => {
  return getDep("isAuthenticated") === true; // false blocks navigation
});

// CORRECT - ignore factory params if not needed
lifecycle.addActivateGuard("admin", () => (toState) => {
  return isAuthenticated(); // false blocks navigation
});
```

### areStatesEqual Ignores Query Params by Default

```typescript
router.areStatesEqual(state1, state2); // Ignores query params
router.areStatesEqual(state1, state2, false); // Compares all params
```

### Hook Execution Order

For `users.profile` → `admin.dashboard`:

1. deactivate guard `'users.profile'` - innermost first
2. deactivate guard `'users'`
3. activate guard `'admin'`
4. activate guard `'admin.dashboard'` - innermost last

### Navigation Cancels Previous

```typescript
const p1 = router.navigate("users");
const p2 = router.navigate("admin");
// p1's internal AbortController is aborted, p1 rejects with TRANSITION_CANCELLED
```

### Plugins After start() Miss onStart

```typescript
await router.start("/home");
router.usePlugin(myPlugin); // onStart won't be called!
// Register plugins BEFORE start()
```

## Performance Notes

### Navigate hot path (#307)
- **Optimistic sync execution** — guards run synchronously, async path deferred. No AbortController/Promise on sync path
- **FSM `forceState()`** — bypasses `send()` dispatch (no Map lookups, no action calls) for NAVIGATE/COMPLETE
- **EventEmitter explicit params** — `emit(name, a?, b?, c?, d?)` instead of `...args` to avoid V8 rest-param array allocation
- **Cached error rejections** — pre-allocated `Promise.reject()` for SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND (zero alloc per rejection)
- **`getFunctions()` cached tuple** — `RouteLifecycleNamespace` returns pre-allocated `[deactivate, activate]` array (no alloc per navigate)
- **Segment array reuse** — `toActivate`/`toDeactivate` reuse arrays from `getTransitionPath()`
- **`buildNavigateState()`** — single-pass state construction (merged forwardState + buildPath + makeState)
- **Single-pass freeze** — `freezeStateInPlace` consolidated into one recursive traversal

### General
- States cached to avoid repeated freezing
- URL params cached per route name
- Lifecycle functions pre-compiled at registration
- Event listeners lazily created
- `nameToIDs()` has fast paths for 1-4 segments
- Route tree is immutable (Object.freeze) — cloneRouter() rebuilds from definitions (not shared)
- Router options are immutable — deep-frozen at construction (`OptionsNamespace`), safe to return directly
- `static #onSuppressedError` — cached callback, one allocation per class (not per navigate)
- Segment cleanup uses `Array.includes()` instead of `new Set()` (1-5 elements — linear faster)
- `createInterceptable()` — empty-array fast path skips iteration when no interceptors registered
- FSM `canSend()` — O(1) via cached `#currentTransitions`
- `getNavigator()` — WeakMap cache keyed by router, one frozen navigator per router instance
- `buildPath` options cached per router instance (`#cachedBuildPathOpts`)

## Code Conventions

### Adding New Methods

**Facade methods** (on Router class):
1. Add **validator** to `namespaces/XxxNamespace/validators.ts` (if new validation needed)
2. Add **instance method** to namespace (business logic)
3. Add **facade method** to Router.ts (`ctx.validator?.ns.fn()` → delegate)
4. Bind method in Router constructor if it accesses private fields

**Standalone API methods** (on `get*Api()` return objects):
1. Add **validator** to `namespaces/XxxNamespace/validators.ts`
2. Add **CRUD logic** as module-private function in `api/get*Api.ts`
3. Add **method** to the returned API object (`ctx.validator?.ns.fn()` → CRUD)
4. Access internals via `getInternals(router)` WeakMap

**Adding validation to a new method:**
- Call `ctx.validator?.ns.validateXxxArgs(...)` — optional chaining means no-op when plugin is absent
- Add the corresponding method to `RouterValidator` in `src/types/RouterValidator.ts`
- Implement the validator function in `namespaces/XxxNamespace/validators.ts`
- Wire it up in `validationPlugin.ts` (in the `@real-router/validation-plugin` package)

### Modifying Existing Methods

- **Validation changes** → update validator in namespace (`validators.ts`)
- **Logic changes** → update instance method in namespace or module-private function in `api/`
- Router.ts facade only **calls** validators, never implements validation logic itself

### Type Locations

| Type Kind                | Location                           |
| ------------------------ | ---------------------------------- |
| Public API types         | `@real-router/types`               |
| Router-dependent types   | `src/types.ts`                     |
| Namespace-internal types | `namespaces/XxxNamespace/types.ts` |

### Test Coverage

100% coverage required. Use `/* v8 ignore next N -- @preserve: reason */` sparingly for:

- V8 tool limitations (async generator branches, ternary expressions in certain contexts)
- Race condition guards in async operators (tested but V8 can't track timing)
- Security guards (Object.prototype pollution checks)
- Transpiler artifacts (__awaiter detection)

**`@preserve` annotation convention:**
- Means "intentionally kept after v8 ignore audit — do not remove without re-auditing"
- Do NOT use for defensive guards against TypeScript-enforced invariants
- All `@preserve` blocks must have clear explanatory comments

### Promise-Based Navigation API

All navigation methods (`navigate`, `navigateToDefault`, `start`) return `Promise<State>`. Exception: `navigateToNotFound(path?)` is **synchronous** and returns `State` directly.

**`start(path)` requires a path string.** Core is platform-agnostic — the caller always provides the path. Browser-plugin overrides `start(path?)` to make path optional (injects browser location). When `allowNotFound: true` and path doesn't match, `start()` calls `navigateToNotFound(path)` (returns synchronous `State` wrapped in resolved Promise).

**UNKNOWN_ROUTE state shape:** `{ name: UNKNOWN_ROUTE, params: {}, path: "/the/url", transition: TransitionMeta }` — note: `params` is always `{}` (path is in `state.path`, not `state.params.path`).

**`UNKNOWN_ROUTE` export:** Available as standalone `import { UNKNOWN_ROUTE } from "@real-router/core"` and via `constants.UNKNOWN_ROUTE`.

Key types:
- **`GuardFn`**: `(toState, fromState, signal?) => boolean | Promise<boolean>` — guard type (boolean only, receives AbortSignal)
- **Removed types**: `ActivationFn`, `DoneFn`, `CancelFn`, `StrictDoneFn`, `MiddlewareFn`
- **Removed functions**: `safeCallback`, `parseNavigateArgs`, `parseNavigateToDefaultArgs`, `getStartRouterArguments`
- **Removed constants**: `CACHED_NO_START_PATH_ERROR`

Cancellation: Pass `{ signal }` via `NavigationOptions` for external `AbortController` cancellation. `router.stop()`, `router.dispose()`, and concurrent navigation abort the internal controller automatically. 
Guards receive `signal` as optional 3rd parameter for cooperative cancellation (e.g., `fetch(url, { signal })`). 
`AbortError` thrown in guards is auto-converted to `TRANSITION_CANCELLED`.

## See Also

- [packages/validation-plugin/CLAUDE.md](../validation-plugin/CLAUDE.md) — Validation plugin architecture and validator namespaces
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System design and package structure
- [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) — Infrastructure decisions
