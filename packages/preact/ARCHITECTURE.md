# Architecture

> Preact bindings for Real-Router with optimal re-render strategies

## Package Dependencies

```
@real-router/preact
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, getTransitionSource, createDismissableError)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Entry Points (Subpath Exports)

Two entry points via `package.json` `exports`. No modern/legacy split (Preact has no equivalent of React's `<Activity>` API), but SSR-aware components/hooks live behind a `/ssr` subpath for type isolation and DX clarity — same split rationale as `@real-router/react/ssr`.

| Entry Point | Import Path | Description |
|---|---|---|
| Main | `@real-router/preact` | Client API: hooks, `RouterProvider`, `RouteView`, `Link`, `RouterErrorBoundary` |
| SSR | `@real-router/preact/ssr` | 8 SSR-feature exports: `<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `<HttpStatusCode>`, `<HttpStatusProvider>`, `useDeferred`, `createHttpStatusSink` |

```
@real-router/preact       →  src/index.ts  →  Client API (Preact 10+)
@real-router/preact/ssr   →  src/ssr.ts    →  SSR-feature surface (Preact 10+)
```

**Build output** (tsdown dual entry):

```
dist/
├── esm/
│   ├── index.mjs
│   ├── index.d.mts
│   ├── ssr.mjs
│   ├── ssr.d.mts
│   └── useRoute-*.mjs       # Shared chunk hoisted by tsdown
└── cjs/
    ├── index.js
    ├── index.d.ts
    ├── ssr.js
    └── ssr.d.ts
```

## Source Structure

```
src/
├── index.ts                    # Main entry — client API (Preact 10+)
├── ssr.ts                      # SSR-feature subpath — 8 exports mirroring @real-router/react/ssr
├── RouterProvider.tsx           # Context provider — wires router to Preact tree
├── context.ts                  # Three Preact contexts + createUseContextOrThrow factory
├── types.ts                    # RouteState, RouteContext, LinkProps
├── constants.ts                # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── useSyncExternalStore.ts     # Polyfill — Preact has no native useSyncExternalStore
├── dom-utils/                  # Symlink → shared/dom-utils/ (shared across all framework adapters)
│   ├── index.ts                # Barrel re-exports
│   ├── link-utils.ts           # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName, applyLinkA11y, shallowEqual
│   ├── route-announcer.ts      # createRouteAnnouncer — WCAG aria-live announcements
│   ├── scroll-restore.ts       # createScrollRestoration — opt-in scroll capture + restore
│   ├── view-transitions.ts     # createViewTransitions — opt-in View Transitions API integration
│   └── direction-tracker.ts    # createDirectionTracker — back/forward annotation. Available through the symlink barrel but NOT consumed by the Preact RouterProvider; consumers opt in manually (install before usePlugin(browserPlugin)).
├── utils/
│   └── createHttpStatusSink.ts # /ssr — fresh { code: undefined } sink per request
├── hooks/
│   ├── useRouter.tsx           # Router instance from context (never re-renders)
│   ├── useRoute.tsx            # Full route state from context (every navigation)
│   ├── useNavigator.tsx        # Navigator from context (never re-renders)
│   ├── useRouteNode.tsx        # Node-scoped subscription (cached createRouteNodeSource from sources)
│   ├── useIsActiveRoute.tsx    # Active state subscription — delegates to shared createActiveSource (#1427); useMemo-wrapped
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never re-renders)
│   ├── useRouterTransition.tsx # Transition lifecycle (cached getTransitionSource)
│   ├── useRouteExit.tsx        # Wrap subscribeLeave with abort + same-route + latest-handler guards
│   ├── useRouteEnter.tsx       # Fire on nav-driven mount via useRoute() snapshot + route.transition.from
│   └── useDeferred.tsx         # /ssr — reads state.context.ssrDataDeferred[key] (ssr-data-plugin)
└── components/
    ├── Link.tsx                # memo'd link with custom areLinkPropsEqual + active state
    ├── RouterErrorBoundary.tsx  # Declarative navigation error handling
    ├── ClientOnly.tsx          # /ssr — server fallback → client children swap after mount
    ├── ServerOnly.tsx          # /ssr — symmetric inverse of ClientOnly
    ├── Streamed.tsx            # /ssr — cross-adapter <Suspense> alias (preact/compat)
    ├── Await.tsx               # /ssr — <Await name="key">{(v) => …}</Await> via Suspense-thenable convention
    ├── HttpStatusCode.tsx      # /ssr — render-time HTTP status (sink write)
    ├── HttpStatusProvider.tsx  # /ssr — provides HttpStatusSink via Preact context
    └── RouteView/              # Declarative route matching (no keepAlive)
        ├── index.ts            # Barrel re-exports
        ├── RouteView.tsx       # RouteViewRoot + compound export (RouteView.Match, RouteView.Self, RouteView.NotFound)
        ├── types.ts            # RouteViewProps, MatchProps, SelfProps, NotFoundProps
        ├── components.tsx      # Match, Self, NotFound marker components
        └── helpers.tsx         # collectElements, buildRenderList, isSegmentMatch, processMatch, isFallbackKind, assignFallbackSlot, appendFallback
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
| `fallback` / `Suspense`     | `react`                            | `preact/compat` (experimental)                      |
| Entry points                | Main + Legacy + `/ssr` + `/legacy/ssr` + `/ink` + RSC | Main + `/ssr`                            |

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

20 stress files in `tests/stress/` validate behavior under extreme conditions across
core hook fan-out, Link mass-rendering, deep trees, scope/cache isolation, transition
lifecycle, SSR streaming, route deletion mid-session, view-transitions interruption,
hash navigation, lazy-loaded RouteView, polyfill race conditions, and the announcer.

| Category                      | File(s)                                                                  | What they verify                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle       | `mount-unmount-lifecycle.stress.tsx`, `memory-mount-unmount.stress.tsx`, `error-boundary-mount-unmount.stress.tsx` | useRouteNode/useRoute/Link/useRouterTransition × 200 mount/unmount cycles — bounded heap; conditional toggle × 100; router stop/restart; dynamic nodeName changes; RouterErrorBoundary remount cycles  |
| Subscription fanout           | `subscription-fanout.stress.tsx`, `route-hooks-stress.stress.tsx`, `factory-reuse.stress.tsx` | 50 useRouteNode on different nodes — only relevant re-render; 20 useRoute + 30 useRouteNode('') — all update; granular scoping; cleanup on unmount; one factory → 100 router instances |
| Link mass rendering           | `link-mass-rendering.stress.tsx`, `link-hash-stress.stress.tsx`          | 200 Links mount — no render loops; active class toggle; 50 round-robin navs; deep routeParams; 50 rapid clicks — 0 unhandled rejections; hash-aware active state under churn                            |
| Deep tree context             | `deep-tree-context.stress.tsx`                                           | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; wide tree 25 leaves — all re-render; nested RouterProviders — isolated                                                  |
| Cache isolation               | `should-update-cache.stress.tsx`                                         | 200 unique node names — cache scales; 100 same-node — cache hit; router stop + GC + new router; 2 routers × 50 nodes — isolated                                                                         |
| Transition lifecycle          | `transition-hook-stress.stress.tsx`, `replace-history-during-transition.stress.tsx` | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; replaceHistoryState during active transition (single + burst of 10)                                                      |
| Route deletion / traversal    | `route-deletion-midsession.stress.tsx`                                   | navigate() to a route removed mid-session, re-add of same route name, traversal patterns                                                                                                                |
| View Transitions interruption | `view-transitions-stop.stress.tsx`                                       | stop() mid-VT, 30 rapid pairs, double-destroy, defensive try/catch around startViewTransition                                                                                                            |
| SSR streaming                 | `http-status-streaming.stress.tsx`                                       | 50 concurrent renders, 100 sequential, last-write-wins on 20 sibling HttpStatusCode instances                                                                                                            |
| Combined SPA                  | `combined-spa.stress.tsx`                                                | Full app with RouteView + Links + useRouteNode + 200 navs; transition progress; tab layout; remount after unmount                                                                                       |
| Suspense + lazy RouteView     | `suspense-lazy-routeview.stress.tsx`                                     | RouteView.Match with `fallback` + `lazy()` under rapid navigation churn                                                                                                                                 |
| useSyncExternalStore race     | `use-sync-external-store-race.stress.tsx`                                | Polyfill race between `useState(getSnapshot)` render and `useEffect` commit phase across 50+ concurrent mounts                                                                                          |
| Route announcer rapid nav     | `announce-navigation-rapid.stress.tsx`                                   | 30 navs across Safari-ready window, repeat-dedup, double rAF + pendingText buffering                                                                                                                    |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, performance)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
