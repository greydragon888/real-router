# Architecture

> Preact bindings for Real-Router with optimal re-render strategies

## Package Dependencies

```
@real-router/preact
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, getTransitionSource, createDismissableError)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Single Entry Point

One entry point — Preact has no equivalent of React's `<Activity>` API, so no modern/legacy split is needed.

```
@real-router/preact  →  src/index.ts  →  Full API (Preact 10+)
```

**Build output** (tsdown single entry):

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
├── useSyncExternalStore.ts     # Polyfill — Preact has no native useSyncExternalStore
├── dom-utils/                  # Symlink → shared/dom-utils/ (shared across all framework adapters)
│   ├── index.ts                # Barrel re-exports
│   ├── link-utils.ts           # shouldNavigate, buildHref, buildActiveClassName, applyLinkA11y
│   ├── route-announcer.ts      # createRouteAnnouncer — WCAG aria-live announcements
│   └── scroll-restore.ts       # createScrollRestoration — opt-in scroll capture + restore
├── hooks/
│   ├── useRouter.tsx           # Router instance from context (never re-renders)
│   ├── useRoute.tsx            # Full route state from context (every navigation)
│   ├── useNavigator.tsx        # Navigator from context (never re-renders)
│   ├── useRouteNode.tsx        # Node-scoped subscription (cached createRouteNodeSource from sources)
│   ├── useIsActiveRoute.tsx    # Active state subscription (cached createActiveRouteSource)
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never re-renders)
│   └── useRouterTransition.tsx # Transition lifecycle (cached getTransitionSource)
└── components/
    ├── Link.tsx                # memo'd link with custom areLinkPropsEqual + active state
    ├── RouterErrorBoundary.tsx  # Declarative navigation error handling
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
useRouteNode(name)              — cached createRouteNodeSource(router, name)
useRouterTransition()           — cached getTransitionSource(router)
useIsActiveRoute(name, params)  — cached createActiveRouteSource(router, name, params, opts) [internal]
RouterErrorBoundary             — cached createDismissableError(router) with integrated resetError
RouterProvider                  — createRouteSource(router) (per-provider instance)
```

## Component Architecture

```
Link (memo + areLinkPropsEqual)
├── useRouter() — router instance from context (never re-renders)
├── useIsActiveRoute() — subscription for active/inactive CSS (internal, cached source)
├── href = router.buildUrl() || router.buildPath()
└── onClick → void router.navigate(...)   # fire-and-forget

RouterErrorBoundary
├── useSyncExternalStore polyfill over createDismissableError(router) — shared per-router source
│     (integrated dismissedVersion + resetError — no local state)
├── onErrorRef — useRef for callback stability (avoids closure churn)
└── Renders: children + fallback(error, resetError) via Fragment
```

**Custom comparator (`areLinkPropsEqual`):** `shallowEqual` (Object.is per key, order-insensitive) for `routeParams` and `routeOptions`, strict equality for primitives. Prevents re-renders from inline object literals.

**RouteView (no keepAlive):** Renders only the first matching `<RouteView.Match>`. On navigation, the previous match unmounts completely — no state preservation. `<RouteView.NotFound>` renders on `UNKNOWN_ROUTE`.

**RouteView.Match with `fallback`:** When `fallback` prop is provided, `Match` wraps its children in a `<Suspense>` boundary (from `preact/compat`) with that fallback. Use this with `lazy()` from `preact/compat` to code-split route components. **Note:** Suspense support in Preact is experimental — test thoroughly before shipping to production.

## Performance Optimizations

| Optimization                     | Location                                 | Mechanism                                                                                   |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Node-scoped subscriptions        | `useRouteNode`                           | Cached `createRouteNodeSource(router, nodeName)` — N consumers share one router subscription |
| Canonical params cache           | `useIsActiveRoute`                       | `createActiveRouteSource` hashes params via `canonicalJson` — key-order-insensitive          |
| Shared transition/error sources  | `useRouterTransition`, `RouterErrorBoundary` | `getTransitionSource` / `createDismissableError` — one eager router subscription per router |
| Custom memo comparator           | `Link`                                   | `areLinkPropsEqual`: `shallowEqual` for params/options, `===` for primitives                 |
| Frozen singletons                | `constants.ts`                           | `EMPTY_PARAMS`, `EMPTY_OPTIONS` avoid allocation for default props                           |
| WeakMap caching (sources level)  | `@real-router/sources`                   | Per-router caches auto-evicted on router GC                                                  |
| Memoized navigator               | `RouterProvider`                         | `getNavigator(router)` via `useMemo` — stable reference                                      |

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

## Stress Test Coverage

34 stress tests across 7 files in `tests/stress/` validate behavior under extreme conditions:

| Category                | Tests (file count) | Test count | What they verify                                                                                                                                                                                        |
| ----------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle | 1 file             | 8 tests    | useRouteNode/useRoute/Link/useRouterTransition × 200 mount/unmount cycles — bounded heap; 50 components remount + re-subscribe; conditional toggle × 100; router stop/restart; dynamic nodeName changes |
| Subscription fanout     | 1 file             | 5 tests    | 50 useRouteNode on different nodes — only relevant re-render; 20 useRoute + 30 useRouteNode('') — all update; 50 useRouteNode('users') — granular scoping; concurrent mount/unmount; cleanup on unmount |
| Link mass rendering     | 1 file             | 6 tests    | 200 Links mount — no render loops; active class toggle; 50 round-robin navigations; deep routeParams; 50 rapid clicks — 0 unhandled rejections; dynamic routeName × 100                                 |
| Deep tree context       | 1 file             | 4 tests    | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; wide tree 25 leaves — all re-render; nested RouterProviders — isolated                                                  |
| shouldUpdateCache       | 1 file             | 4 tests    | 200 unique node names — cache scales; 100 same-node — cache hit; router stop + GC + new router; 2 routers × 50 nodes — isolated                                                                         |
| Transition hook         | 1 file             | 4 tests    | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; 20 consumers — consistent; navigate + cancel × 50 — never stuck                                                          |
| Combined SPA            | 1 file             | 3 tests    | Full app with RouteView + Links + useRouteNode + 200 navs; transition progress; tab layout; remount after unmount                                                                                       |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, performance)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
