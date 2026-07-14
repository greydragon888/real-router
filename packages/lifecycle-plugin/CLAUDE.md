# @real-router/lifecycle-plugin

> Route-level lifecycle hooks: onEnter, onStay, onLeave, onNavigate

## Exports

| Export                   | Kind     | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `lifecyclePluginFactory` | function | Plugin factory — pass to `router.usePlugin()`. No args            |
| `LifecycleHook`          | type     | Compiled hook signature: `(toState, fromState?) => void`          |
| `LifecycleHookFactory`   | type     | Factory signature: `(router, getDependency) => LifecycleHook`     |

## How It Works

1. `lifecyclePluginFactory()` returns a `PluginFactory` (no configuration)
2. On `router.usePlugin()`: gets `PluginApi` via `getPluginApi(router)`
3. On `onTransitionLeaveApprove`: if route changed → calls `onLeave` on the leaving route
4. On `onTransitionSuccess`: calls `onEnter` or `onStay` (depending on route name change) AND `onNavigate` — hooks are orthogonal, each fires independently based on its own condition

Hook lookup: `api.getRouteConfig(routeName)?.[hookName]` — reads hook factory from route definition, compiles it lazily via `factory(router, getDependency)`, and caches the compiled hook per `hookName:routeName`. Same DI pattern as `GuardFnFactory`. Config changes — including hot-swapping a hook via `getRoutesApi(router).update(name, { onNavigate })` (#797), `replace`, or `remove`+`add` — are picked up lazily (recompiles when the `factory` reference differs); removed routes are evicted eagerly via a `getRoutesApi(router).subscribeChanges()` subscription (drops `hookName:routeName` entries on `remove`/`replace`, clears all on `clear`) so they don't linger as dead memory. The subscription is removed in `teardown`.

## Hook Semantics

| Hook         | Fires when                                  | Event                        | Route checked    |
| ------------ | ------------------------------------------- | ---------------------------- | ---------------- |
| `onLeave`    | Navigating away from a route                | `onTransitionLeaveApprove`   | `fromState.name` |
| `onStay`     | Same route name (params may be unchanged: `reload:true` / revalidation) | `onTransitionSuccess` | `toState.name`   |
| `onEnter`    | Navigating to a new route                   | `onTransitionSuccess`        | `toState.name`   |
| `onNavigate` | Any successful navigation to the route      | `onTransitionSuccess`        | `toState.name`   |

Hooks fire only for the **leaf route** (the route matching `toState.name` / `fromState.name`), not for parent segments.

### onNavigate orthogonality

`onNavigate` fires independently of `onEnter` / `onStay` — if both are defined, both fire. Each hook is orthogonal: `onEnter` is entry-specific, `onStay` is stay-specific, `onNavigate` covers any successful navigation to the route. Mix them to compose shared logic (in `onNavigate`) with case-specific logic (in `onEnter` / `onStay`) — no priority, no fallback.

## Module Structure

```
src/
├── factory.ts  — lifecyclePluginFactory, compileHook (lazy compile + cache),
│                 onTransitionLeaveApprove + onTransitionSuccess handlers
├── types.ts    — LifecycleHook, LifecycleHookFactory types
└── index.ts    — Public exports + declare module augmentation (Route interface)
```

## Gotchas

### Hooks are fire-and-forget, with per-hook error isolation

Return values are ignored. Each hook is invoked with **per-hook exception isolation** (#798): a throwing hook is caught and re-thrown **asynchronously** via `queueMicrotask`, so it never aborts the handler before a later hook of the same transition runs (the `onNavigate` orthogonality invariant), and never blocks or cancels the transition. The error still surfaces to global error handlers as an async uncaught error — mirroring `BaseSource` / `createActiveNameSelector` in `@real-router/sources`. Note the observable change from the pre-#798 design: a throwing hook surfaces **asynchronously (uncaught)**, not synchronously through the router's EventEmitter "Error in listener" sink. **This covers a throwing hook FACTORY too** (a failing DI init at compile time): `compileHook` runs inside the same `try` (#1222), so a factory throw is isolated identically — same async channel, never swallows a sibling `onNavigate`. A failed compile is not cached, so the factory retries on every navigation.

### onLeave fires at leave-approve, not success

`onLeave` uses `onTransitionLeaveApprove` — it fires after deactivation guards pass but before activation guards run. This means `onLeave` fires even if the transition later fails at activation. `onEnter` and `onStay` only fire on `onTransitionSuccess`.

### Redirect from a hook

A **synchronous** `router.navigate()` from inside a hook (the intuitive "redirect on `onEnter`") is **banned**: the hook runs inside a transition-event dispatch, so a reentrant navigate throws `RouterError(REENTRANT_NAVIGATION)` (RFC navigation-cancellation-unification §4, #1035). The redirect does **not** happen, and the per-hook isolation (#798) re-throws that error on a microtask — surfacing it as an uncaught exception (process-fatal under Node's default handler). Defer instead: `queueMicrotask(() => router.navigate(...))` (or an `await`ed async flow) runs after the transition has settled (FSM `READY` again) and is allowed:

```typescript
onEnter: (router) => (toState) => {
  if (!isAuthed()) {
    // deferred — OK; a *synchronous* navigate here throws REENTRANT_NAVIGATION
    queueMicrotask(() => {
      void router.navigate("login");
    });
  }
},
```

### `onLeave` is not a guaranteed cleanup across tree mutations

`onLeave` fires on `onTransitionLeaveApprove`, emitted only by the guarded `navigate()` pipeline. Structural route-tree mutations that tear out the active route do **not** run that phase:

- `getRoutesApi(router).replace()` revalidation (#950/#1201) that **drops** the active route commits `UNKNOWN_ROUTE` via `navigateToNotFound()`, which emits only `TRANSITION_SUCCESS` — so the dropped route's `onLeave` is **skipped** (the "Cleanup on leave" `webSocket.disconnect()` silently does not run).
- `replace()` revalidation where the active route **survives** (same name) emits `TRANSITION_SUCCESS` with `revalidate: true`; the plugin does not inspect `navOptions`, so it fires `onStay` **and** `onNavigate` with **no navigation and no param change**.
- `clear()` is a silent reset (emits only `TREE_CHANGED`) — no lifecycle hook fires for the torn-out route.

Do **not** rely on `onLeave` as a guaranteed cleanup across `replace()` / `clear()` / `navigateToNotFound()`. For teardown that must survive tree mutations, tie cleanup to an external lifecycle (component unmount, `subscribeChanges`). Core root tracked in #1201.

### No configuration

The plugin has no options. Hook callbacks are the configuration — they live on route definitions.

### Module augmentation

`declare module "@real-router/core"` in `index.ts` extends the `Route` interface with typed `onEnter`, `onStay`, `onLeave`, `onNavigate` fields, and the `RouteConfigUpdate` interface with the same fields (each `| null` to remove) so the hooks are patchable via `getRoutesApi(router).update(name, patch)` (#797). Import the plugin package to get autocomplete for both route definitions and update patches.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Data flow and design decisions
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core package (PluginFactory, getRouteConfig)
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — How plugins integrate with the router
