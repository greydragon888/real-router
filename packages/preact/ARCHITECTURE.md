# Architecture

> Preact bindings for Real-Router with optimal re-render strategies

## Package Dependencies

```
@real-router/preact
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Single Entry Point

One entry point — Preact has no equivalent of React's `<Activity>` API, so no modern/legacy split is needed.

```
@real-router/preact  →  src/index.ts  →  Full API (Preact 10+)
```

**Build output** (tsup single entry):

```
dist/
├── esm/
│   ├── index.mjs
│   └── index.d.mts
└── cjs/
    ├── index.js
    └── index.d.ts
```

## Source Structure

```
src/
├── index.ts                    # Single entry point (Preact 10+)
├── RouterProvider.tsx           # Context provider — wires router to Preact tree
├── context.ts                  # Three Preact contexts (RouterContext, RouteContext, NavigatorContext)
├── types.ts                    # RouteState, RouteContext, LinkProps
├── constants.ts                # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── utils.ts                    # shouldNavigate() — click filtering
├── useSyncExternalStore.ts     # Polyfill — Preact has no native useSyncExternalStore
├── hooks/
│   ├── useRouter.tsx           # Router instance from context (never re-renders)
│   ├── useRoute.tsx            # Full route state from context (every navigation)
│   ├── useNavigator.tsx        # Navigator from context (never re-renders)
│   ├── useRouteNode.tsx        # Node-scoped subscription via useSyncExternalStore polyfill
│   ├── useIsActiveRoute.tsx    # Active state subscription (internal — used by Link)
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never re-renders)
│   ├── useRouterTransition.tsx # Transition lifecycle (isTransitioning, toRoute, fromRoute)
│   └── useStableValue.tsx      # JSON-based reference stabilization
└── components/
    ├── Link.tsx                # memo'd link with custom areLinkPropsEqual + active state
    └── RouteView/              # Declarative route matching (no keepAlive)
        ├── index.ts            # Barrel re-exports
        ├── RouteView.tsx       # RouteViewRoot + compound export (RouteView.Match, RouteView.NotFound)
        ├── types.ts            # RouteViewProps, MatchProps, NotFoundProps
        ├── components.tsx      # Match, NotFound marker components
        └── helpers.tsx         # collectElements, buildRenderList, isSegmentMatch
```

## Key Differences from React Adapter

| Aspect                      | React                              | Preact                                              |
| --------------------------- | ---------------------------------- | --------------------------------------------------- |
| External store subscription | `useSyncExternalStore` (native)    | Custom polyfill via `useState` + `useEffect`        |
| Hooks import                | `react`                            | `preact/hooks`                                      |
| Context provider syntax     | `<Context value={...}>` (React 19) | `<Context.Provider value={...}>`                    |
| `memo()`                    | `react`                            | `preact/compat`                                     |
| `Children.toArray`          | `react`                            | `toChildArray` from `preact`                        |
| `Activity` API / keepAlive  | React 19.2+                        | Not available — RouteView renders active match only |
| Entry points                | Main + Legacy                      | Single                                              |

### useSyncExternalStore Polyfill

Preact has no native `useSyncExternalStore`. The polyfill in `src/useSyncExternalStore.ts` uses `useState` + `useEffect`:

1. `useState(getSnapshot)` — initial value from store
2. `useEffect` — synchronizes value before subscribing (handles race condition between render and commit phase)
3. Subscribe callback calls `setValue(getSnapshot())` on store change

This does not handle tearing (concurrent rendering), but Preact has no concurrent mode, so this is correct.

## Context Architecture

Three separate contexts serve different update frequencies:

```
RouterProvider
├── RouterContext.Provider     value={router}             # Stable — never changes
│   ├── NavigatorContext.Provider  value={navigator}      # Stable — derived from router via useMemo
│   │   └── RouteContext.Provider  value={routeContextValue}  # Reactive — changes every navigation
│   │       └── {children}
```

**Why three contexts, not one:**

| Context            | Value                                 | Changes                      | Consumers                                           |
| ------------------ | ------------------------------------- | ---------------------------- | --------------------------------------------------- |
| `RouterContext`    | `Router` instance                     | Never (same reference)       | `useRouter`, `useRouteUtils`, `useRouterTransition` |
| `NavigatorContext` | `Navigator`                           | Never (memoized from router) | `useNavigator`                                      |
| `RouteContext`     | `{ navigator, route, previousRoute }` | Every navigation             | `useRoute`                                          |

## Subscription Patterns

### Context-Based (via `useContext()`)

```
useRoute()      — reads RouteContext → re-renders every navigation
useRouter()     — reads RouterContext → never re-renders
useNavigator()  — reads NavigatorContext → never re-renders
```

### External Store (via useSyncExternalStore polyfill)

```
useRouteNode(name)              — createRouteNodeSource(router, name)
useRouterTransition()           — createTransitionSource(router)
useIsActiveRoute(name, params)  — createActiveRouteSource(router, name, params, opts)  [internal]
RouterProvider                  — createRouteSource(router)
```

## Component Architecture

```
Link (memo + areLinkPropsEqual)
├── useRouter() — router instance from context (never re-renders)
├── useStableValue() — stabilizes routeParams/routeOptions objects
├── useIsActiveRoute() — subscription for active/inactive CSS (internal hook)
├── href = router.buildUrl() || router.buildPath()
└── onClick → void router.navigate(...)   # fire-and-forget
```

**Custom comparator (`areLinkPropsEqual`):** `JSON.stringify` for `routeParams` and `routeOptions`, strict equality for primitives. Prevents re-renders from inline object literals.

**RouteView (no keepAlive):** Renders only the first matching `<RouteView.Match>`. On navigation, the previous match unmounts completely — no state preservation. `<RouteView.NotFound>` renders on `UNKNOWN_ROUTE`.

## Performance Optimizations

| Optimization                 | Location               | Mechanism                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Node-scoped subscriptions    | `useRouteNode`         | `shouldUpdateNode()` from `@real-router/sources` filters irrelevant changes |
| JSON reference stabilization | `useStableValue`       | `JSON.stringify` memoization prevents new-object-per-render dependencies    |
| Custom memo comparator       | `Link`                 | `areLinkPropsEqual`: JSON for params/options, `===` for primitives          |
| Frozen singletons            | `constants.ts`         | `EMPTY_PARAMS`, `EMPTY_OPTIONS` avoid allocation for default props          |
| WeakMap caching              | `@real-router/sources` | Per-router selector functions cached, auto-evicted on GC                    |
| Memoized navigator           | `RouterProvider`       | `getNavigator(router)` via `useMemo` — stable reference                     |

## Data Flow

```
router.navigate("users.profile", { id: "123" })
    │
    ▼
@real-router/core (transition pipeline, guards, state update)
    │
    ▼
router emits TRANSITION_SUCCESS
    │
    ├──► createRouteSource.subscribe callback → new snapshot { route, previousRoute }
    │       └──► useSyncExternalStore polyfill triggers RouterProvider re-render
    │               └──► RouteContext.Provider value changes
    │                       └──► useRoute() consumers re-render
    │
    ├──► createRouteNodeSource.subscribe callback → shouldUpdateNode() filter
    │       └──► if node relevant: new snapshot → polyfill triggers re-render
    │               └──► useRouteNode("users") consumers re-render
    │
    └──► createActiveRouteSource.subscribe callback → boolean snapshot
            └──► if changed: polyfill triggers re-render
                    └──► Link active CSS updates (via internal useIsActiveRoute)
```

## Testing Strategy

```
tests/
├── functional/           # Unit tests per hook/component
├── integration/          # Multi-hook interaction tests
├── helpers/              # createTestRouter, wrapper factories
└── setup.ts              # JSDOM + @testing-library/jest-dom matchers
```

**Coverage:** 100% required (enforced in vitest.config).

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, performance)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
