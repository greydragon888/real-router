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

utils/ (SSR/SSG/hydration helpers — separate subpath export)
    ├── serializeState(data)              — XSS-safe JSON for embedding in HTML <script> tags
    ├── serializeRouterState(state, opts) — XSS-safe State serializer (strips `transition`, keeps `context`); `excludeContext` filters non-JSON namespaces (#572); `serialize` plugs custom serializer (devalue/superjson) for non-JSON types like Date/Map/Set/RegExp/BigInt (#606)
    ├── hydrateRouter(router, source, opts?) — drives `router.start(parsed.path)` with a one-shot hydration scratchpad on `RouterInternals` so SSR loader plugins skip the post-hydration re-run (#596); `deserialize` matches the custom `serialize` choice (#606)
    └── getStaticPaths(router, entries?)  — enumerate leaf routes and build URLs for SSG pre-rendering
```

**Hydration scratchpad (#596)**: `RouterInternals.hydrationState` is `null` outside `hydrateRouter`. Inside, the parsed `SerializedRouterState` is briefly assigned, then cleared in `finally`. SSR loader plugins (`ssr-data-plugin`, `rsc-server-plugin`) read `getInternals(router).hydrationState` from inside their `start` interceptor — when the namespace value is already present in the parsed context for the same route name, they reuse it instead of invoking the loader. Single-shot semantics: only the first `start()` consumes the scratchpad. Plugin-internal mechanism — no public API surface beyond `hydrateRouter` itself.

**RouterFSM states**: `IDLE → STARTING → READY ⇄ TRANSITION_STARTED → LEAVE_APPROVED → READY | DISPOSED`

`DISPOSE` is wired from every non-DISPOSED state so the FSM always settles at `DISPOSED` when `router.dispose()` runs. For healthy flows the facade routes through `IDLE` first (`STOP → IDLE → DISPOSE`); the direct transitions are a safety net for cases where the FSM cannot be returned to `IDLE` (e.g. `dispose()` mid-`STARTING` when the start pipeline threw before `STARTED`/`FAIL`). See `routerFSM.ts` transition table.

All router events are consequences of FSM transitions (via `fsm.on(from, event, action)`), not manual calls. 
No boolean flags (`#started`, `#active`, `#navigating` removed).

### Validation Pattern

Validation has two tiers: **invariant protection** in core (structural guards + 3 invariant guards) and **DX validation** opt-in via @real-router/validation-plugin. The plugin installs a `RouterValidator` object into `RouterInternals.validator` at registration time.

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

Core contains three invariant guards that run regardless of whether validation-plugin is installed:

- **`subscribe(listener)`** — validates `typeof listener === "function"`. Prevents deferred crash (non-function stored in EventEmitter, crash on next navigation). Includes actionable hint: "For Observable pattern use observable(router) from @real-router/rx". (`subscribeLeave` validates the same way but **without** the rx hint — `@real-router/rx` exposes the Observable pattern for success transitions (`observable(router)`, `state$`, `events$`), not for leave events.)
- **`navigateToNotFound(path)`** — validates `typeof path === "string"` when path is provided. Prevents silent state corruption (`state.path = 42`).
- **`claimContextNamespace(namespace)`** (on `PluginApi`, `getPluginApi.ts`) — throws `CONTEXT_NAMESPACE_ALREADY_CLAIMED` when a namespace is already claimed by another plugin. Prevents silent corruption: without it two plugins writing the same `state.context.<namespace>` would clobber each other's data.

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

**Store pattern:** `RoutesStore` and `DependenciesStore` are data-holder interfaces (not classes). Besides the tree/config/matcher data, `RoutesStore` deliberately carries internal cross-namespace references — `lifecycleNamespace` and `depsStore`, set after construction during wiring — so the standalone CRUD helpers can reach the lifecycle namespace (for `addCanActivate` / `clearDefinitionGuards` / `clearAll`) via `store.lifecycleNamespace` instead of threading a parameter through every helper. The store is the api/ layer's deliberate transport channel, not pure inert data. CRUD logic lives in the corresponding standalone API function (`getRoutesApi.ts`, `getDependenciesApi.ts`).

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

**Validation runs on the RAW argument, before interceptors.** `Router.start()` calls `validator?.navigation.validateStartArgs(startPath)` (and `sendStart()`) *before* `getInternals(this).start(path)` dispatches the interceptor chain. So `validateStartArgs` sees the **caller's** `startPath`, not the value a browser-plugin interceptor substitutes (`path ?? browser.getLocation()`) — the validator deliberately permits `undefined` for exactly this reason (browser-plugin fills it in downstream). A plugin that needs to validate the *post-override* path must do so inside its own interceptor.

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

**Lifecycle**: healthy flows route through IDLE (`STOP → IDLE → DISPOSE`). The FSM also accepts `DISPOSE` directly from `STARTING`, `READY`, `TRANSITION_STARTED`, and `LEAVE_APPROVED` as a safety net (#660) — required when the orchestrated path cannot reach `IDLE`, e.g. `dispose()` called mid-`STARTING` after a start-pipeline throw left the FSM stuck.
**Cleanup order**: abort navigation → cancel transition → stop (if ready/transitioning) → FSM DISPOSE → clearAll (events) → plugins → router extensions (safety net) → routes → lifecycle → state → deps → markDisposed
**After dispose**: All mutating methods throw `RouterError(ROUTER_DISPOSED)`
**Idempotency**: Second call is a no-op (FSM state check)

### Cloning Semantics (SSR)

`cloneRouter(router, deps?)` (standalone API, `api/cloneRouter.ts`) builds an independent router for **SSR per-request isolation** — one base router per process, one clone per request. The clone is always constructed fresh (FSM `IDLE`, no committed state) regardless of the source's lifecycle state; cloning a disposed router throws `ROUTER_DISPOSED`.

| Subsystem | Clone behavior |
| --- | --- |
| Route tree | **Rebuilt** from serialized definitions (`routeTreeToDefinitions` → constructor) — not shared |
| Options | Shallow spread; deep-frozen, so ref-sharing is safe |
| Dependencies | **Shallow merge** `{ ...sourceDeps, ...deps }` — top-level keys fresh, **values shared by reference** |
| Config (decoders / encoders / forwardMap / `defaultParams` / custom fields) | `Object.assign` shallow — per-route objects **shared by reference** |
| Lifecycle guards | Re-registered **preserving origin** (definition stays definition, external stays external — #676) |
| Plugins | Factories re-run on the clone — **fresh instances**, fresh `state.context` claims |
| State / FSM / EventEmitter / interceptors / `hydrationState` / `contextClaimRecords` | **Reset** (fresh per clone) |

**Shared-by-reference is intentional (#664).** A `Map`, `Set`, class instance, or nested object in `base.dependencies` (or a per-route `defaultParams` / custom-field object) is the **same instance** in every clone — mutating it from one clone is visible in the base and all siblings. `structuredClone` is deliberately not applied (it breaks class instances, functions, singleton pools, circular refs). Rule: **singletons / shared services → `base.dependencies`; per-request mutable state → the `deps` override** (or `createRequestScope`), which is applied last and wins over base keys. Cross-request leaks happen only when per-request state is wrongly placed in the base.

**Guard origin round-trips (#676).** Cloned definition guards are re-registered with `isFromDefinition=true`, so the clone's `replace()` strips them via `clearDefinitionGuards()` exactly as on the source. Caveat: guard-factory **closures are shared** — do not capture per-request state in guards registered on the base router (register such guards on the clone).

**Not re-applied on the clone:** `extendRouter` / `addInterceptor` called **outside** a plugin factory (directly via `getPluginApi(base)`) — only plugin-factory extensions/interceptors re-run. Full reference: `wiki/clone.md`.

### Enhanced State Object: TransitionMeta

After every successful navigation, `router.getState()` includes a `transition` field:

```typescript
const state = await router.navigate("users.profile", { id: "123" });
state.transition; // TransitionMeta
// {
//   reload: true,             // true after navigate(..., { reload: true }) (optional)
//   replace: true,            // true after navigate(..., { replace: true }) — also set on navigateToNotFound and auto-force from UNKNOWN_ROUTE (optional)
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

#### Core vs plugin signals: `transition.replace` vs `state.context.navigation.navigationType`

The two fields **complement** each other — they measure different things from different sources, so they coexist (no deprecation):

| Layer  | Field                                                   | Source                                                                                                                                              | Availability                                          |
| ------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Core   | `state.transition.{replace, reload, redirected}`        | `NavigationOptions` passed to `router.navigate(...)` (or auto-modified by `forceReplaceFromUnknown` / `navigateToNotFound`)                          | Always, under any URL plugin (or no plugin)           |
| Plugin | `state.context.navigation.navigationType`               | Platform Navigation API event (`event.navigationType`) or History-stack derivation — how the **browser** classified the navigation                  | Only under `@real-router/navigation-plugin`           |

Semantic coverage at a glance:

| Question                                | Core portable signal                                | Plugin signal (navigation-plugin only)              |
| --------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Was this a replace transition?          | `state.transition.replace === true`                 | `state.context.navigation.navigationType === "replace"` |
| Was this a reload transition?           | `state.transition.reload === true`                  | `state.context.navigation.navigationType === "reload"`  |
| Was this a redirect transition?         | `state.transition.redirected === true`              | (no plugin signal — core-level concept)             |
| Was this a traverse (browser back/fwd)? | **Not covered** — traverse has no `opts.replace`/`reload` | `state.context.navigation.navigationType === "traverse"` |
| Was this a push?                        | By elimination — none of the above flags            | `state.context.navigation.navigationType === "push"`    |

Rule of thumb: read `transition.replace` (and `reload`/`redirected`) when you want to know **what the caller asked for** (or what core auto-modified) — portable across URL plugins. Read `state.context.navigation.navigationType` when you need to know **how the Navigation API classified** the transition, including browser-driven `traverse`/`reload` events that don't flow through `router.navigate` options.

Concrete consumer of both: `shared/dom-utils/scroll-restore.ts` reads `route.transition.reload || nav?.navigationType === "reload"`. The core arm covers programmatic reload (`router.navigate({reload:true})`); the plugin arm covers F5/cross-document under navigation-plugin (#531 priming via `getActivationType()` sets `nav.navigationType === "reload"` while leaving `opts.reload` undefined on the initial transition). Dropping either side silently regresses one of the cases.

### Transition Pipeline

All navigation methods return `Promise<State>`. The pipeline uses **optimistic sync execution** — guards run synchronously until one returns a Promise, then switches to async.

```
router.navigate(name, params, opts)
  │
  ├── Build target state (buildNavigateState)
  ├── Same-state check (path comparison)
  ├── FSM forceState(TRANSITION_STARTED) + emitTransitionStart()
  │
  ├── Guard pipeline (executeGuardPipeline)
  │   ├── Deactivation guards (innermost → outermost)
  │   ├── LEAVE_APPROVE phase: FSM forceState(LEAVE_APPROVED) + emitTransitionLeaveApprove()
  │   │   └── subscribeLeave() callbacks fire here (confirmed departure, before activation)
  │   └── Activation guards (outermost → innermost)
  │   Returns: undefined (all sync) | Promise<void> (async detected)
  │
  ├── SYNC PATH (no async guards):
  │   └── completeTransition() → setState + FSM forceState(READY)
  │       → emitTransitionSuccess → return Promise.resolve(state)
  │
  └── ASYNC PATH (async guard detected):
      └── #finishAsyncNavigation(guardCompletion, ...)
          ├── receives AbortController (set up upfront when guards/leave-listeners present)
          ├── await guardCompletion
          └── completeTransition() → same as sync
```

**Key optimization:** On the pure hot path (no guards, no `subscribeLeave` listeners) the navigation runs fully synchronously — no AbortController, no async/await, no microtask delay. Sync guards/listeners still complete inline (no await) but allocate an AbortController that is released unaborted on success.

On error at any step: `emitTransitionError()` → `Plugin.onTransitionError()` → Promise rejects with `RouterError`.

**Cached error fast paths:** Common rejections (SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND) return pre-allocated `Promise.reject()` instances from `constants.ts` — zero allocation per rejection.

**`navigateToNotFound()` bypasses this pipeline entirely.** It sets state directly and emits only `TRANSITION_SUCCESS` (no `TRANSITION_START`, no guards, no FSM transition, no AbortController). Always passes `{ replace: true }` as opts.

**Fire-and-forget safety:** `navigate()`, `navigateToDefault()`, and the `navigateToState()` plugin primitive internally suppress unhandled rejections for expected errors (`SAME_STATES`, `TRANSITION_CANCELLED`, `ROUTER_NOT_STARTED`, `ROUTE_NOT_FOUND`, `CANNOT_ACTIVATE`, `CANNOT_DEACTIVATE`), so calling them without `await` is safe (#721). A guard block (or a plugin's guard-blocked `back()`/`forward()`) is an expected outcome, not an internal error — the safety net stays silent; `await` the call or use an `onTransitionError` plugin to observe a guard rejection.

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

|                     | Guards              | Plugins            | subscribeLeave          |
| ------------------- | ------------------- | ------------------ | ----------------------- |
| When                | Before state change | After state change | Between deactivation and activation guards (LEAVE_APPROVED phase) |
| Can block           | Yes                 | No                 | No                      |
| Can redirect        | No                  | No                 | No                      |
| Can transform state | No                  | No                 | No                      |
| Scope               | Per-route           | Global             | Global                  |

**`subscribeLeave(listener)`** — subscribe to approved route departures. Fires after all deactivation guards pass (**departure is approved, not yet committed**) but before activation guards run — an activation guard can still reject, leaving state unchanged, so treat the leave as tentative (verify the outcome for non-idempotent side-effects). Returns an unsubscribe function.

**Listener signature:** `(payload: LeaveState) => void | Promise<void>` where `LeaveState = { route: fromState, nextRoute: toState, signal: AbortSignal }`.

**Async semantics (important):** `subscribeLeave` listeners are **awaited** — the activation phase does not start until all listeners' returned Promises settle (`Promise.allSettled`). This is the only subscription in the router that blocks the navigation pipeline. Use it for:
- Animation hooks that must snapshot DOM before commit (e.g., `document.startViewTransition`)
- Async cleanup that must complete before activation
- Data prefetch coordinated with leave event

Sync listeners run inline; a sync throw rejects `navigate()` with that **original error** and emits `TRANSITION_ERROR` — it is **not** converted to `TRANSITION_CANCELLED`. The first sync throw wins, and a sync throw takes priority over any async listener rejection. The `signal` in the payload aborts when the navigation is **cancelled** — superseded by a newer `navigate()`, `stop()`, `dispose()`, or an external `opts.signal` abort — **or fails** (a sync leave throw, a rejecting activation guard), and **never** on successful completion. This holds identically on the guard and no-guards pipeline paths: the same controller backs the signal, and core releases it without aborting on success (`#cleanupController(controller, /* cancelled */ false)`), so a listener that captured the signal still observes `aborted === false` after the navigation commits (#722).

**`subscribe(listener)`** — subscribe to `TRANSITION_SUCCESS` (post-commit). In contrast to `subscribeLeave`:

- **Fire-and-forget:** listeners are invoked synchronously from `EventEmitter.emit`; returned Promises are **not awaited** — `router.navigate()`'s returned Promise resolves before an async listener's body completes. **A rejected Promise from an async listener is NOT caught by core and surfaces as a Node `unhandledRejection`** (which can terminate the process under `--unhandled-rejections=strict`, the Node 22+ default). Always `.catch()` inside an async `subscribe` listener. (Unlike `subscribeLeave`, which awaits listeners via `Promise.allSettled` and isolates their rejections.)
- **Listener signature:** `(payload: { route: State, previousRoute?: State }) => void` — no `signal` (no cancellation, the transition already committed).
- **Invocation order:** `router.subscribe` listeners fire in registration order, all before `navigate()` resolves. Do not rely on other subscribers having run their async tails when your listener executes.

**`navigateToNotFound()` bypasses both:** no guards run, plugins only see `onTransitionSuccess` (no `onTransitionStart`).

### When `navigate()`'s Promise resolves vs subscribers

```
navigate()
  ├── deactivation guards (sync/async)
  ├── LEAVE_APPROVED: subscribeLeave listeners  ← awaited (blocks pipeline)
  ├── activation guards (sync/async)
  ├── completeTransition():
  │    ├── setState(finalState)
  │    └── emit(TRANSITION_SUCCESS) → subscribe listeners fire synchronously
  │        (returned Promises ignored)
  └── return Promise.resolve(finalState)   ← resolves here
```

Consequence: `await router.navigate(...)` guarantees that `subscribeLeave` fully awaited and `subscribe` listeners were invoked synchronously — but **not** that any `async` work inside a subscribe listener has finished. It also does **not** guarantee that framework adapters have committed the DOM (adapters translate the `TRANSITION_SUCCESS` emission into their own scheduled re-render; see `@real-router/sources` + `useSyncExternalStore`/signal-based equivalents).

**To block navigation on post-commit work**, put it in a `subscribeLeave` listener instead — or subscribe to a later lifecycle event via a plugin (`onTransitionSuccess`, but this still doesn't await either).

### Force Replace from UNKNOWN_ROUTE

When navigating FROM `UNKNOWN_ROUTE` state, `navigate()` auto-forces `replace: true` to prevent browser history pollution with 404 entries. This is handled by `forceReplaceFromUnknown()` in `NavigationNamespace`.

### Atomic Route Replacement: replace()

`getRoutesApi(router).replace(routes)` atomically replaces all routes in one operation.

**Semantics** (prepare-then-commit / build-then-swap, #698):
1. **Blocking** — `throwIfDisposed()`; logged no-op during active navigation (`validateClearRoutes` → `logger.error`, returns `false`)
2. **Validation** — fail-fast structural guards, tree unchanged on error (atomicity)
3. **Build artifacts into locals** — `buildReplaceArtifacts()` builds the whole new `definitions`/`config`/`tree`/`matcher`/`forwardMap` in temporary structures; a circular/async `forwardTo` or invalid path **throws here**, before the store is touched — so atomicity holds even without validation-plugin
4. **Clear definition guards** — `clearDefinitionGuards()` preserves external guards
5. **Atomic swap** — `adoptRouteArtifacts()` assigns the prepared artifacts into the store in one pass (pure assignment, never throws) and registers the collected guards
6. **State revalidation** — `matchPath(currentPath)` → `setState()` (path still matches) or `clearState()` (no match). Revalidation writes state **without emitting** a transition event, so `subscribe`/`useSyncExternalStore` adapters are not notified of this state change (open design question — see audit `route-crud-atomicity-root-cause-2026-06-04.md`).

**Guard origin tracking**: `RouteLifecycleNamespace` tracks guard origins with four Maps split by origin (`#definitionActivateFactories` / `#externalActivateFactories` / `#definitionDeactivateFactories` / `#externalDeactivateFactories`), populated via the `isFromDefinition` parameter on `addCanActivate()`/`addCanDeactivate()`. `clearDefinitionGuards()` clears only the two definition Maps; external guards survive `replace()`.

**Key files**: `getRoutesApi.ts` (`replaceRoutes` helper), `routesStore.ts` (`buildReplaceArtifacts()` / `adoptRouteArtifacts()`), `RouteLifecycleNamespace.ts` (guard tracking).

### Route CRUD during active navigation

The five mutating route-CRUD ops react differently to an in-flight navigation (`isTransitioning()`):

| Op        | During navigation                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `add`     | no check — proceeds silently                                                                          |
| `update`  | `logger.error` warning, then **proceeds** (an in-flight navigate may read the new config)             |
| `remove`  | non-active route: `logger.warn`, proceeds; active route: `logger.warn`, **no-op** (always blocked)   |
| `clear`   | `logger.error`, **no-op** (blocked)                                                                   |
| `replace` | `logger.error`, **no-op** (blocked — shares `validateClearRoutes`)                                    |

The asymmetry is intentional: `clear`/`replace` are destructive whole-tree swaps (blocked mid-navigation), while `add`/`update` are incremental and benign (the in-flight transition already resolved its target). `add` has no guard at all — the contract "add is allowed during navigation" is verified benign (no corruption of the in-flight nav).

### `update()` does not revalidate the active state

`getRoutesApi(router).update(name, ...)` mutates config in place and **does not rebuild the tree or recompute the current state** (NO_TREE_REBUILD). So when you update the **currently-active** route's `encodeParams` / `decodeParams` / `defaultParams` / `forwardTo`, the committed `getState().path` keeps the value built by the *old* config — it can disagree with a fresh `buildPath(name, params)` until the next navigation. This is by-design (update is O(1), not a re-navigation); call `router.navigate(name, params, { reload: true })` if you need the active path rebuilt with the new config.

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
  onTransitionLeaveApprove(toState, fromState) {
    /* deactivation guards passed, activation guards pending (LEAVE_APPROVED phase) */
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

### Routes Mutation Events (`subscribeChanges`)

`getRoutesApi(router).subscribeChanges(handler)` is the single entry point for observing **structural** route-tree mutations. It is the route-tree counterpart to `router.subscribe` (transitions) — a separate axis, deliberately not a `router.*` facade method.

```typescript
const routes = getRoutesApi(router);
const unsubscribe = routes.subscribeChanges((event) => {
  switch (event.op) {
    case "add":     event.added.forEach(register); break;          // FLAT, full dotted names
    case "remove":  event.removedSubtree.forEach(drop); break;     // route + descendants, FLAT
    case "update":  if (event.patch.defaultParams) revalidate(event.name); break;
    case "replace": reconcile(event.removed, event.added); break;  // FLAT diff by name
    case "clear":   clearAll(); break;
  }
});
```

| Property | Behavior |
| --- | --- |
| **Payload** | `TreeChangedEvent` discriminated union (from `@real-router/types`), keyed by `op`. Routes are FLAT (full dotted `name`, descendants included), frozen per node. |
| **Immutability is shallow** | The payload route object (and `update`'s `patch` envelope) is `Object.freeze`d, but **nested config is by reference and aliases the live store** — `event.added[0].defaultParams` is the same object the router reads on every navigation (same aliasing as `get()`), and it is NOT frozen. **Treat payloads as read-only**: mutating a nested field (`event.added[0].defaultParams.x = …`, a `patch.defaultParams`, an `encodeParams`/guard closure) corrupts router config. Core does not deep-freeze (that would freeze the caller's own input, see H-1) or deep-clone (circular refs / class instances). |
| **Timing** | Post-commit — the handler sees the new tree via `get()`/`has()`. For `replace`, fires after the tree swap but before state revalidation (new tree, still-old state). |
| **`update` filter** | Emits only when the patch has a structural field (`forwardTo` / `defaultParams` / `encodeParams` / `decodeParams`). Guard-only and empty patches are silent. |
| **Fire-and-forget** | The handler cannot cancel the mutation; returned promises are ignored. |
| **Errors** | A throwing handler is isolated via `onListenerError`; other handlers still run and the CRUD caller does not see a re-throw — **except** `RecursionDepthError` (re-entrant CRUD past `maxEventDepth = 5`), which propagates to the caller. Import it from `@real-router/core` for `instanceof` checks. |
| **Duplicates** | Lenient (mirrors `router.subscribe`) — each call is an independent subscription with its own unsubscribe. |
| **Clone isolation** | A cloned router has an independent emitter; mutations never cross the clone boundary. |
| **Scope** | Internal-only channel: `TREE_CHANGED` is not in the public `EventName` union / `events.*` registry / `Plugin` interface. There is no `router.subscribeTree()` and no `addEventListener` path — by design (tree mutations are infrastructural, not app-level). |

`dispose()` releases all `subscribeChanges` listeners (cleanup step 4) before the route teardown, so no event fires during disposal.

### Recommended pattern: declarative reactive cache invalidation

When a plugin (or infrastructure consumer) maintains a cache derived from route tree state, **subscribe declaratively to TREE_CHANGED via `getRoutesApi(router).subscribeChanges()`** and own the invalidation policy in one place — the consumer's constructor or factory.

This is the **recommended approach** for any cache whose contents are keyed by route name or depend on tree shape. It replaces three legacy patterns that solved partial overlapping problems before TREE_CHANGED existed:

| Legacy pattern | Problem |
|---|---|
| **Imperative-on-read** (lazy revalidation on access) | Reasoning is global — to predict cache state you must trace every access site |
| **Per-op interceptor** (e.g., `addInterceptor("addRoutes")`) | Asymmetric coverage — catches `add` only, silent on `update`/`remove`/`replace`/`clear` |
| **Init snapshot** (capture tree state at plugin init, never sync) | Diverges from live tree silently — invariants only hold at startup |

#### Recommended (declarative reactive)

```typescript
class SearchSchemaPlugin {
  #validated = new Map<string, ValidatedSchema>();

  constructor(router: Router) {
    getRoutesApi(router).subscribeChanges((event) => {
      switch (event.op) {
        case "add":
          event.added.forEach((r) => this.#validate(r));
          break;
        case "update":
          if (event.patch.searchSchema) this.#revalidate(event.name);
          break;
        case "remove":
          this.#validated.delete(event.name);
          break;
        case "replace":
        case "clear":
          this.#validated.clear();
          break;
      }
    });
  }
}
```

#### Why this is the right pattern

1. **Self-contained module** — Cache owner has zero coupling to call sites. Adding new CRUD callers does not require updating cache logic.
2. **Symmetric coverage** — The `switch (event.op)` handles all five operations in one place. No "covered for add but missed for update" gaps.
3. **Local reasoning** — Given any sequence of CRUD calls, cache state is predictable by reading a single `subscribeChanges` handler.
4. **Testable in isolation** — Each branch tests independently: `routes.remove("foo")` ⇒ assert `cache.has("foo") === false`.

#### When to break the rule

- **Pure functions** that derive from tree on every call — no cache, no subscription needed.
- **Read-mostly state** where invalidation is acceptable on next access — imperative-on-read may be simpler (preload-plugin uses this for compiled functions whose factory identity is the implicit cache key).
- **Core-internal caches co-located with the rebuilt artifact** — when a core namespace caches data derived 1:1 from the matcher/tree (e.g. `RoutesStore.urlParamsCache`, the path-param-name cache behind `areStatesEqual` / `isActiveRoute`), clear it at the matcher-rebuild choke point itself (`rebuildTreeInPlace` / `adoptRouteArtifacts`), **not** via a `subscribeChanges` listener. A permanent internal `TREE_CHANGED` subscriber would keep `listenerCount > 0` forever, forcing the listener-gated O(N) `replace`/`add` diff (subscribeChanges invariant 8) to run on every mutation even when no application listener exists. Clearing a `Map` at the rebuild is O(1) and never touches the event path (#723).

#### Anti-pattern: centralized CacheManager

Do NOT build a `CacheManager` that registers caches and dispatches invalidation. Each cache owns its own subscription in its own constructor. Centralizing this:

- Creates a knowledge-leak (caches become aware of CacheManager)
- Forces a unified invalidation model that doesn't fit per-cache strategies
- Adds an indirection layer with no ownership benefit

This is the same lesson MobX's API documents: `observe()` is a low-level utility for building derived sources, not for application-level cache coordination. Use it directly per cache; do not build framework-on-framework.

### Navigator (`getNavigator`)

`getNavigator(router)` returns a frozen read-only subset of router methods for view layers. Pre-bound, safe to destructure. Cached per router instance via WeakMap.

```typescript
import { getNavigator } from "@real-router/core";
const nav = getNavigator(router);
```

| Method              | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `navigate`          | Navigate to a route                                          |
| `getState`          | Get current router state                                     |
| `isActiveRoute`     | Check if a route is active                                   |
| `canNavigateTo`     | Check if guards allow navigation                             |
| `subscribe`         | Subscribe to successful transitions. Fire-and-forget: returned Promises ignored, `navigate()` does not wait for async listener bodies. Throws `TypeError` when `listener` is not a function |
| `subscribeLeave`    | Subscribe to confirmed route departures (LEAVE_APPROVED phase). Listener receives `{ route: fromState, nextRoute: toState, signal: AbortSignal }`. Async listeners are awaited — the activation phase blocks until all Promises settle. Throws `TypeError` when `listener` is not a function |
| `isLeaveApproved`   | Returns `true` when FSM is in LEAVE_APPROVED state (deactivation done, activation pending) |

**Transition-in-flight signal.** `isLeaveApproved()` (public, on router and navigator) returns `true` only in the LEAVE_APPROVED phase (deactivation done, activation pending). There is **no public `isTransitioning()` method on the Router class today** — `isTransitioning()` exists only internally (`RouterInternals`, spanning TRANSITION_STARTED + LEAVE_APPROVED) for cross-namespace plumbing. Whether to promote it to the public surface is an open research question (ROI vs. `isLeaveApproved()` + `getState()` already covering the observable cases) — see issue #924.

**`isActive()` spans the whole live lifecycle.** `isActive()` returns `true` throughout `STARTING`, `READY`, `TRANSITION_STARTED`, and `LEAVE_APPROVED` (`fsmState !== IDLE && fsmState !== DISPOSED`) — i.e. from the moment `start()` begins the start lifecycle, not only after it resolves. In particular it is `true` during `STARTING` while `getState()` is still `undefined` (two-phase start). The removed `isStarted()` boolean had the narrower "after successful start" meaning — `isActive()` is **not** its synonym.

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

### `trailingSlash: "preserve"` + `rewritePathOnMatch: true`

Both options default to on. `matchPath()` rebuilds `state.path` via `buildPath()` (applying `forwardTo`, encoders, `defaultParams`) — then re-attaches the source path's trailing-slash choice via `matchSourceTrailingSlash()` in `RoutesNamespace/helpers.ts`. This honours `"preserve"` semantics without disabling the rest of the rewrite pipeline. The reverse case (matcher adds trailing, source had none) is unreachable with the current matcher's `undefined` trailing-slash mode.

## Performance Notes

### Navigate hot path (#307)
- **Optimistic sync execution** — guards run synchronously, async path deferred. No AbortController/Promise on sync path
- **FSM `forceState()`** — bypasses `send()` dispatch (no Map lookups, no action calls) for NAVIGATE/COMPLETE/LEAVE_APPROVE. `sendLeaveApprove()` is the third hot-path transition alongside NAVIGATE and COMPLETE — O(1) overhead
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

### Async subscribeLeave overhead
- **0 listeners (hot path):** on the no-guards path `#handleNoGuardsLeave` runs only `sendLeaveApprove` + a `hasLeaveListeners()` check + a `navigationId` check — no `{nav}` context, no `LeaveState`, no `AbortController` (all allocated only when listeners exist)
- **N sync listeners:** AbortController created + released (not aborted on success, #722; ~5µs total with cleanup), frozen `LeaveState` object, N try/catch (V8 zero-cost on happy path), N×2 thenable checks
- **Lazy closures:** `isCurrentNav` / `emitLeaveApproveCallback` closures and the `{nav}` context are created inside the `if (hasGuards)` branch (or the async tail) only — not on the no-guards hot path
- **Benchmarks:** `tests/benchmarks/navigation/leave-listeners.bench.ts` — run via `pnpm bench`

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

### Mutation testing (Stryker)

Mutation score sits at ~90 % (`/mutation-score` skill; full record in `.claude/mutation-audit-2026-06-22.md`). **Do NOT chase 100 % by silencing survivors** — the honest ceiling is ~90–92 %. The remainder is structurally not worth disabling:

- **Entangled** — the same mutator has a *killed* AND a *survived* variant on one line (`CE→true` killed, `CE→false` survived). `// Stryker disable <Mutator>` would drop the kill. Un-silenceable by design.
- **Equivalents** — no test can kill them: cache short-circuit (recompute is identical), `>0→>=0` on an empty collection, `++→--` on identity-only ids, `{once}` listener redundancy, defensive-redundancy cancel-checks.
- **Validator-opt-in** — `ctx.validator?.…` branches are dead in core (validator is `null`), covered in `@real-router/validation-plugin`. Left documented (the comment says where they're tested), not disabled.

Rules:

- **`survived ≠ equivalent`.** Disable ONLY after proving equivalence empirically (manual mutation + full suite green). Multiple survivors here *looked* equivalent but were killable — the `finally` controller-cleanup, cache *conditions* (a stale-hit returns the wrong cached value), the `isActive` fast-path. Silencing an unproven survivor hides a real coverage gap — the exact anti-pattern mutation testing exists to catch.
- A **killable** survivor → close it with a **test** (that strengthens the suite), never a `disable`.
- A **proven** equivalent → `// Stryker disable next-line <Mutator>: reason`, listing only mutators with no killed sibling on that line. If un-targetable — entangled, or a `finally` body whose catch-`}` and `finally-{` share one line — document with a plain comment and leave it survived.
- Score is a proxy for test strength, not a target. Inflating it by silencing is net-negative.

### Promise-Based Navigation API

All navigation methods (`navigate`, `navigateToDefault`, `start`) return `Promise<State>`. Exception: `navigateToNotFound(path?)` is **synchronous** and returns `State` directly.

**`navigateToDefault()` Promise contract:** the method is not `async`. Synchronous throws from `deps.resolveDefault()` — a `DefaultRouteCallback` that throws, or a validator hook that rejects the callback's return value — are caught and converted to `Promise.reject`. Callers can rely on `.catch()` / `await` uniformly for both resolution and callback errors.

**`start(path)` requires a path string.** Core is platform-agnostic — the caller always provides the path. Browser-plugin overrides `start(path?)` to make path optional (injects browser location). When `allowNotFound: true` and path doesn't match, `start()` calls `navigateToNotFound(path)` (returns synchronous `State` wrapped in resolved Promise).

**`start()` rejection vs. committed state (#763).** `start()` commits via `navigateToState` *inside* the interceptable `start` chain (`RouterLifecycleNamespace.start`), and plugin `start` interceptors (`ssr-data-plugin`, `rsc-server-plugin`) run their loader **after** `await next(path)` — i.e. after the commit emitted `TRANSITION_SUCCESS`. The facade's `.catch` therefore distinguishes two failure shapes by whether a state was committed (`this.#state.get()`):
- **Pre-commit failure** (route not found, an activation guard blocked the start navigation, a sync interceptor throw before `next()`): no `TRANSITION_SUCCESS` was emitted, so the half-started FSM unwinds back to IDLE (two-phase start) — `getState()` is `undefined`, `isActive()` is `false`.
- **Post-commit interceptor failure** (a loader throws after `next()` committed): subscribers already observed `TRANSITION_SUCCESS`, so core does **not** roll back — the committed state stands, `isActive()` stays `true`, and the loader error surfaces **only** via the rejected `start()` promise. Rolling back here would retract an observed success ("phantom success"). Plugins must not swallow the loader error (that violates "Loader errors propagate"); core owns the state-consistency half by keeping the commit.

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
