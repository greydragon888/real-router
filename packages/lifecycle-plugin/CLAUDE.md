# @real-router/lifecycle-plugin

> Route-level lifecycle hooks: onEnter, onStay, onLeave, onNavigate

## Exports

| Export                   | Kind     | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `lifecyclePluginFactory` | function | Plugin factory — pass to `router.usePlugin()`. No args            |
| `LifecycleHook`          | type     | Compiled hook signature: `(toState, fromState, signal) => void`   |
| `LifecycleHookFactory`   | type     | Factory signature: `(router, getDependency) => LifecycleHook`     |

## How It Works

1. `lifecyclePluginFactory()` returns a `PluginFactory` (no configuration)
2. On `router.usePlugin()`: gets `PluginApi` via `getPluginApi(router)`
3. On `onTransitionSuccess` — the commit, the only transition event the plugin listens to: the previous commit's signal aborts first. If the route name changed → the left route's `onEnter` signal aborts, then `onLeave` on the route being left, then `onEnter` on the target; otherwise `onStay`. Then `onNavigate` — hooks are orthogonal, each fires independently based on its own condition
4. On `onStop` and `teardown`: every live signal aborts

Hook lookup: `api.getRouteConfig(routeName)?.[hookName]` — reads hook factory from route definition, compiles it lazily via `factory(router, getDependency)`, and caches the compiled hook per `hookName:routeName`. Same DI pattern as `GuardFnFactory`. Config changes — including hot-swapping a hook via `getRoutesApi(router).update(name, { onNavigate })` (#797), `replace`, or `remove`+`add` — are picked up lazily (recompiles when the `factory` reference differs); removed routes are evicted eagerly via a `getRoutesApi(router).subscribeChanges()` subscription (drops `hookName:routeName` entries on `remove`/`replace`, clears all on `clear`) so they don't linger as dead memory. The subscription is removed in `teardown`.

## Hook Semantics

| Hook         | Fires when                                  | Event                        | Route checked    | `signal` aborts when        |
| ------------ | ------------------------------------------- | ---------------------------- | ---------------- | --------------------------- |
| `onLeave`    | A navigation away from the route commits    | `onTransitionSuccess`, before `onEnter` | `fromState.name` | the next navigation commits |
| `onStay`     | Same route name (params may be unchanged: `reload:true` / revalidation) | `onTransitionSuccess` | `toState.name`   | the next navigation commits |
| `onEnter`    | Navigating to a new route                   | `onTransitionSuccess`        | `toState.name`   | the route is left           |
| `onNavigate` | Any successful navigation to the route      | `onTransitionSuccess`        | `toState.name`   | the next navigation commits |

Every signal also aborts on `stop()`, `dispose()` and plugin teardown; a navigation that does not commit aborts none.

Hooks fire only for the **navigation target** and the **route being left** (`toState.name` / `fromState.name`), not for their parent segments (#2693). A route with children gets hooks when it is one of the two: a navigation to `users` runs the hooks of `users`, and one from `users` to `users.view` runs `onLeave` of `users`.

### onNavigate orthogonality

`onNavigate` fires independently of `onEnter` / `onStay` — if both are defined, both fire. Each hook is orthogonal: `onEnter` is entry-specific, `onStay` is stay-specific, `onNavigate` covers any successful navigation to the route. Mix them to compose shared logic (in `onNavigate`) with case-specific logic (in `onEnter` / `onStay`) — no priority, no fallback.

## Module Structure

```
src/
├── factory.ts  — lifecyclePluginFactory, compileHook (lazy compile + cache),
│                 the two signal controllers, onTransitionSuccess / onStop handlers
├── types.ts    — LifecycleHook, LifecycleHookFactory types
└── index.ts    — Public exports + declare module augmentation (Route interface)
```

## Gotchas

### Hooks are fire-and-forget, with per-hook error isolation

Return values are ignored. Each hook is invoked with **per-hook exception isolation** (#798): a throwing hook is caught and re-thrown **asynchronously** via `queueMicrotask`, so it never aborts the handler before a later hook of the same transition runs (the `onNavigate` orthogonality invariant), and never blocks or cancels the transition. The error still surfaces to global error handlers as an async uncaught error — mirroring `BaseSource` / `createActiveNameSelector` in `@real-router/sources` — and not through the router's EventEmitter "Error in listener" sink. **This covers a throwing hook FACTORY too** (a failing DI init at compile time): `compileHook` runs inside the same `try` (#1222), so a factory throw is isolated identically — same async channel, never swallows a sibling `onNavigate`. A failed compile is not cached, so the factory retries on every navigation.

### onLeave runs on the commit, not at leave-approve

`onLeave` runs from `onTransitionSuccess`, before the target's `onEnter` / `onNavigate` (#2691). Leave-approve is tentative, and a navigation that does not commit leaves the user on the route — refused by `canActivate`, failed by a throwing guard or `subscribeLeave` listener, failed because its target was removed, or cancelled by its `signal`, a newer navigation or `stop()`. Such a navigation runs no hook at all; `tests/functional/lifecycle.test.ts` › "onLeave runs only for a navigation that commits" holds the arcs.

- `router.getState()` inside `onLeave` already returns the target; the route being left is the hook's `fromState`.
- `TRANSITION_SUCCESS` listeners run in registration order, so a `router.subscribe` listener or a plugin registered before this one sees the commit before `onLeave` runs.
- `onLeave` cannot cancel its navigation: `stop()`, `dispose()` or aborting the navigation's `signal` from inside it acts on a router that has already committed.
- Work that must happen before the commit, or be undone when the navigation does not commit, belongs in `router.subscribeLeave`: its listeners, awaited ones included, run before `onLeave`, and their `signal` aborts when the navigation does not commit.

### Each hook gets an `AbortSignal`, with one of two lifetimes

`onEnter`'s signal aborts when its route is left; `onStay`'s, `onNavigate`'s and `onLeave`'s when the next navigation commits — those three share one controller per commit. `stop()`, `dispose()` and teardown abort them all; a navigation that does not commit aborts none. `tests/functional/lifecycle.test.ts` › "hooks receive an AbortSignal (#2692)" holds the cells, and `tests/property/lifecycle.properties.ts` › "signals: each aborts exactly when its lifetime ends" holds the class.

- A commit aborts the previous signals before any of its hooks runs: when `onLeave` runs, the left route's `onEnter` signal is already aborted.
- A controller is opened only by a hook handed its signal, so a commit that runs no hook opens none.
- `stop()` or teardown from inside a hook, or from an abort listener, does not stop the rest of that commit's hooks: they run, and the controller they open is born aborted (the `ended` flag).
- The reason is a fresh `AbortError` `DOMException` per abort — `controller.abort()` without an argument. Not a shared one, whose `stack` Node's `fetch` rewrites on every abort, and not a frozen one, which makes Node's `fetch` reject with a `TypeError` instead.

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

`onLeave` is read from the route's definition when the commit reaches the plugin, and runs on every commit that leaves a route still carrying it — a `navigateToNotFound()` commit included. A tree mutation that tears the route out takes the hook with it; `tests/functional/lifecycle.test.ts` › "onLeave runs only for a navigation that commits" holds the `replace()` and listener cells:

- `getRoutesApi(router).replace()` revalidation (#950/#1201) that **drops** the active route commits whatever its old path matches now — another route, or `UNKNOWN_ROUTE` — and the dropped route has no definition left to read `onLeave` from, so its `onLeave` is **skipped** (the "Cleanup on leave" `webSocket.disconnect()` silently does not run).
- `replace()` revalidation that gives the active route a new path while another route takes the old one commits a departure, and the old route's `onLeave` runs, read from its new definition.
- A commit listener registered before this plugin — a `router.subscribe` listener or another plugin — that removes the route just left runs first, so the plugin finds no definition and `onLeave` is skipped.
- `replace()` revalidation where the active route **survives** (same name) emits `TRANSITION_SUCCESS` with `revalidate: true`; the plugin does not inspect `navOptions`, so it fires `onStay` **and** `onNavigate` with **no navigation and no param change**.
- `clear()` refuses with `ROUTER_NOT_STOPPED` while a state is committed, so it never tears out the route a running router is on; where it does run it emits only `TREE_CHANGED` and fires no lifecycle hook.

Do **not** rely on `onLeave` as a guaranteed cleanup across tree mutations. `onEnter`'s signal is one: the commit that leaves the route aborts it whatever became of the route's definition — the `replace()` cell of "hooks receive an AbortSignal (#2692)" holds it — and `clear()` needs a stopped router, whose `stop()` already aborted it. Core root tracked in #1201.

### No configuration

The plugin has no options. Hook callbacks are the configuration — they live on route definitions.

### Module augmentation

`declare module "@real-router/core"` in `index.ts` extends the `Route` interface with typed `onEnter`, `onStay`, `onLeave`, `onNavigate` fields, and the `RouteConfigUpdate` interface with the same fields (each `| null` to remove) so the hooks are patchable via `getRoutesApi(router).update(name, patch)` (#797). Import the plugin package to get autocomplete for both route definitions and update patches.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Data flow and design decisions
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core package (PluginFactory, getRouteConfig)
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) — How plugins integrate with the router
