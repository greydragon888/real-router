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
| `onStay`     | Same route, params changed                  | `onTransitionSuccess`        | `toState.name`   |
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

### Hooks are fire-and-forget

Return values are ignored. Errors propagate to the EventEmitter (logged to stderr) but do not block or cancel the transition.

### onLeave fires at leave-approve, not success

`onLeave` uses `onTransitionLeaveApprove` — it fires after deactivation guards pass but before activation guards run. This means `onLeave` fires even if the transition later fails at activation. `onEnter` and `onStay` only fire on `onTransitionSuccess`.

### No configuration

The plugin has no options. Hook callbacks are the configuration — they live on route definitions.

### Module augmentation

`declare module "@real-router/core"` in `index.ts` extends the `Route` interface with typed `onEnter`, `onStay`, `onLeave`, `onNavigate` fields, and the `RouteConfigUpdate` interface with the same fields (each `| null` to remove) so the hooks are patchable via `getRoutesApi(router).update(name, patch)` (#797). Import the plugin package to get autocomplete for both route definitions and update patches.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Data flow and design decisions
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core package (PluginFactory, getRouteConfig)
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — How plugins integrate with the router
