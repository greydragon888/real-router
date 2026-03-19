# Architecture

> React bindings for Real-Router with optimal re-render strategies

## Package Dependencies

```
@real-router/react
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Dual Entry Points

Two entry points via `package.json` subpath exports. Single codebase, no duplicated logic.

```
@real-router/react          →  src/index.ts    →  Full API (React 19.2+)
@real-router/react/legacy   →  src/legacy.ts   →  Same API minus React 19.2-only components (React 18+)
```

Both files are pure re-exports. The difference: `index.ts` includes `components/modern/*` exports (e.g. `RouteView` with `keepAlive` support via React Activity), `legacy.ts` does not.

**Build output** (tsup multi-entry with shared chunks):

```
dist/
├── esm/
│   ├── index.mjs         # Main entry
│   ├── index.d.mts
│   ├── legacy.mjs        # Legacy entry
│   ├── legacy.d.mts
│   └── chunk-*.mjs       # Shared code (auto-extracted by tsup)
└── cjs/
    ├── index.js
    ├── index.d.ts
    ├── legacy.js
    └── legacy.d.ts
```

## Source Structure

```
src/
├── index.ts                    # Main entry point (React 19.2+)
├── legacy.ts                   # Legacy entry point (React 18+)
├── RouterProvider.tsx           # Context provider — wires router to React tree
├── context.ts                  # Three React contexts (RouterContext, RouteContext, NavigatorContext)
├── types.ts                    # RouteState, RouteContext, LinkProps
├── constants.ts                # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── utils.ts                    # shouldNavigate() — click filtering
├── hooks/
│   ├── useRouter.tsx           # Router instance from context (never re-renders)
│   ├── useRoute.tsx            # Full route state from context (every navigation)
│   ├── useNavigator.tsx        # Navigator from context (never re-renders)
│   ├── useRouteNode.tsx        # Node-scoped subscription via useSyncExternalStore
│   ├── useIsActiveRoute.tsx    # Active state subscription (internal — used by Link)
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never re-renders)
│   ├── useRouterTransition.tsx # Transition lifecycle (isTransitioning, toRoute, fromRoute)
│   └── useStableValue.tsx      # JSON-based reference stabilization
└── components/
    ├── Link.tsx                # memo'd link with custom areLinkPropsEqual + active state
    └── modern/
        └── RouteView/          # React 19.2-only — declarative route matching with keepAlive
            ├── index.ts        # Barrel re-exports
            ├── RouteView.tsx   # RouteViewRoot + compound export (RouteView.Match, RouteView.NotFound)
            ├── types.ts        # RouteViewProps, MatchProps, NotFoundProps
            ├── components.tsx  # Match, NotFound marker components
            └── helpers.tsx     # collectElements, buildRenderList, isSegmentMatch
```

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

If merged into one context, every `useRouter()` call would re-render on every navigation. Splitting eliminates unnecessary re-renders for imperative-only consumers.

## Subscription Patterns

### Context-Based (via `useContext()`)

```
useRoute()      — reads RouteContext → re-renders every navigation
useRouter()     — reads RouterContext → never re-renders
useNavigator()  — reads NavigatorContext → never re-renders
```

These three hooks use `useContext()` — works in both React 18 and 19. (`use()` and `useContext()` are functionally identical for unconditional context reads.)

### External Store (via `useSyncExternalStore`)

```
useRouteNode(name)              — createRouteNodeSource(router, name)
useRouterTransition()           — createTransitionSource(router)
useIsActiveRoute(name, params)  — createActiveRouteSource(router, name, params, opts)  [internal]
RouterProvider                  — createRouteSource(router)
```

These subscribe to `@real-router/sources` stores. The source creates a `{ subscribe, getSnapshot }` object. `useSyncExternalStore` handles subscription lifecycle — Strict Mode safe, no `useEffect` cleanup needed.

**`useRouteNode` is the primary hook for components.** It subscribes to a specific route segment and only re-renders when that segment's active/inactive state changes. This is the core optimization — in a tree of 100 routes, navigating from `users.list` to `users.profile` only re-renders the `useRouteNode("users")` consumer, not all route-aware components.

## Component Architecture

```
Link (memo + areLinkPropsEqual)
├── useRouter() — router instance from context (never re-renders)
├── useStableValue() — stabilizes routeParams/routeOptions objects
├── useIsActiveRoute() — subscription for active/inactive CSS (internal hook)
├── href = router.buildUrl() || router.buildPath()
└── onClick → void router.navigate(...)   # fire-and-forget
```

**Custom comparator (`areLinkPropsEqual`):** Explicitly compares all Link-specific props — `JSON.stringify` for `routeParams` and `routeOptions` (objects), strict equality (`===`) for primitives (`routeName`, `className`, `activeClassName`, `activeStrict`, `ignoreQueryParams`, `onClick`, `target`, `children`). Prevents re-renders from inline object literals `<Link routeParams={{ id: 123 }} />`.

**RouteView.Match with `fallback`:** When `fallback` prop is provided, `Match` wraps its children in a `<Suspense>` boundary with that fallback. Use this with `React.lazy()` to code-split route components. Works seamlessly with `keepAlive` — the `<Activity>` wrapper preserves the entire `<Suspense>` boundary including the fallback state.

**Navigation:** Fire-and-forget `void router.navigate(...)`. No success/error callbacks — users should call `router.navigate()` directly with `await` for per-navigation result handling.

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
    │       └──► useSyncExternalStore triggers RouterProvider re-render
    │               └──► RouteContext.Provider value changes
    │                       └──► useRoute() consumers re-render
    │
    ├──► createRouteNodeSource.subscribe callback → shouldUpdateNode() filter
    │       └──► if node relevant: new snapshot → useSyncExternalStore triggers re-render
    │               └──► useRouteNode("users") consumers re-render
    │
    └──► createActiveRouteSource.subscribe callback → boolean snapshot
            └──► if changed: useSyncExternalStore triggers re-render
                    └──► Link active CSS updates (via internal useIsActiveRoute)
```

## Testing Strategy

```
tests/
├── functional/           # Unit tests per hook/component
│   ├── legacy-entry.test.tsx   # Smoke test for legacy entry point
│   └── ...
├── integration/          # Multi-hook interaction tests
├── performance/          # Re-render count verification via vitest-react-profiler
├── helpers/              # createTestRouter, wrapper factories
└── setup.ts              # JSDOM + @testing-library/jest-dom matchers
```

**Legacy entry:** One smoke test — verifies all exports exist and basic render + navigation works. Full test suite runs against main entry only. Both entries re-export the same code, so duplicating tests is unnecessary.

**Coverage:** 100% required (enforced in vitest.config).

### Performance Tests

6 performance test suites in `tests/performance/` verify render budgets via `vitest-react-profiler`:

| Component / Hook        | What is verified                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RouterProvider**      | 1 mount per init; 1 re-render per navigation; memo'd children without context skip re-renders; RouterContext consumers skip re-renders (stable ref); RouteContext consumers re-render on navigation                                                                  |
| **Link**                | 1 mount; memo skips parent re-renders; 100 links meet budget (100 mounts, 0 updates); active class toggles exactly 1 re-render; unrelated navigations skip re-render; `useStableValue` prevents re-render on identical inline objects                                |
| **RouteView**           | Sibling isolation (navigation doesn't re-render siblings); only matched child renders; keepAlive lazy activation (never-visited children have 0 renders); hidden keepAlive children don't re-render on sibling navigation; hide/show cycle meets ≤2 re-render budget |
| **useRoute**            | Re-renders on every navigation (no filtering); linear render count (N navigations = N re-renders); stable navigator ref across re-renders                                                                                                                            |
| **useRouteNode**        | Re-renders only when node activates/deactivates; skips unrelated navigations (0 re-renders); skips sibling node navigations; root node re-renders on all changes                                                                                                     |
| **useRouterTransition** | Sync navigation: 0 extra re-renders (no TRANSITION_START); async navigation: exactly 2 re-renders per transition (start + end); N async transitions = 2N re-renders (linear scaling); `navigateToNotFound()` causes 0 re-renders                                     |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, performance)
- [RFC-react-18-19-split.md](.claude/RFC-react-18-19-split.md) — Design document for dual entry points
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
