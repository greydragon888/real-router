# Architecture

> Detailed architecture for AI agents and contributors

## Overview

`@real-router/lifecycle-plugin` is a **route-level lifecycle hooks plugin** for the router. It adds `onEnter`, `onStay`, `onLeave` callbacks to route definitions — declarative side-effects that fire on navigation events.

**Key role:** Bridges the gap between global plugin hooks (fire for every transition) and route guards (control flow). Lifecycle hooks are per-route side-effects — analytics, data prefetch, cleanup — without `subscribe()` boilerplate.

## Package Structure

```
lifecycle-plugin/
├── src/
│   ├── factory.ts    — createInvokeHook, createPlugin, lifecyclePluginFactory (47 lines)
│   ├── types.ts      — LifecycleHook type (10 lines)
│   └── index.ts      — Public exports + Route module augmentation (20 lines)
```

## Dependencies

```mermaid
graph LR
    LP["@real-router/lifecycle-plugin"] -->|dep| CORE["@real-router/core"]

    CORE -.->|provides| PF[PluginFactory]
    CORE -.->|provides| PA[PluginApi]
    CORE -.->|provides| TYPES["State"]

    subgraph plugin [Plugin Instance]
        LH["onTransitionLeaveApprove"] --> IH[invokeHook]
        SH["onTransitionSuccess"] --> IH
        IH --> GRC["api.getRouteConfig()"]
    end
```

| Import source              | What it uses                    | Purpose                    |
| -------------------------- | ------------------------------- | -------------------------- |
| **@real-router/core**      | `PluginFactory`, `State` types  | Plugin factory return type |
| **@real-router/core/api**  | `getPluginApi`, `PluginApi`     | Access route custom fields |

## Core Algorithm

### Hook Resolution

```
Navigation: home → users.view

onTransitionLeaveApprove(toState, fromState)
    │
    ├── toState.name !== fromState.name?
    │   ├── YES → getRouteConfig("home")?.onLeave → call if function
    │   └── NO  → skip (same route = onStay, handled later)
    │
    ▼
onTransitionSuccess(toState, fromState)
    │
    ├── toState.name === fromState.name?
    │   ├── YES → getRouteConfig("users.view")?.onStay → call if function
    │   └── NO  → getRouteConfig("users.view")?.onEnter → call if function
```

### Partial Application Pattern

```typescript
createInvokeHook(api: PluginApi)
    └── returns (hookName, routeName, toState, fromState) => void
         │
         ├── api.getRouteConfig(routeName)?.[hookName]
         ├── typeof check (skip non-functions)
         └── call hook(toState, fromState)
```

`api` is captured once via closure in `createPlugin`. Each hook invocation passes only the variable parts.

### Route Custom Fields

Custom fields are extracted automatically by core's `registerSingleRouteHandlers` in `routesStore.ts`. Standard fields (`name`, `path`, `children`, `canActivate`, `canDeactivate`, `forwardTo`, `encodeParams`, `decodeParams`, `defaultParams`) are excluded. Everything else — including `onEnter`, `onStay`, `onLeave` — lands in `routeCustomFields[routeName]`.

## Design Decisions

### Why two hooks, not one

Using both `onTransitionLeaveApprove` and `onTransitionSuccess` instead of just `onTransitionSuccess`:

- `onLeave` semantically belongs to the **leaving** phase — it fires when deactivation guards pass
- `onEnter`/`onStay` belong to the **success** phase — they confirm the transition completed
- This matches the mental model: "cleanup before enter"

### Why leaf route only

Hooks fire only for `toState.name` / `fromState.name`, not for all segments in `transition.segments.activated` / `deactivated`. Reasons:

- Simpler mental model — one route, one hook call
- No loops, no Set allocations — just a property lookup
- Parent route hooks would fire on every child navigation, which is rarely desired

### Why no configuration

The plugin is stateless and has no options. The hooks themselves (defined on routes) are the configuration. Adding options like "fire for parent segments" would complicate both API and implementation for marginal benefit.

### Why no try/catch

Errors from user-defined hooks propagate to the EventEmitter, which logs them to stderr. Swallowing errors with `console.warn` would hide bugs from developers. The router continues operating regardless — the EventEmitter's error handling is robust.

## See Also

- [core CLAUDE.md](../core/CLAUDE.md) — Core package architecture (PluginFactory, getRouteConfig)
- [core routesStore.ts](../core/src/namespaces/RoutesNamespace/routesStore.ts) — Custom fields extraction (line 205-222)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — System-level architecture
