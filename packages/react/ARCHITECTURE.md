# Architecture

> React bindings for Real-Router with optimal re-render strategies

## Package Dependencies

```
@real-router/react
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, getTransitionSource, createDismissableError)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Entry Points

Six entry points via `package.json` subpath exports — five named subpaths plus a `react-server` condition layered on the root and `/ssr`. Single codebase, no duplicated logic.

```
@real-router/react              →  src/index.ts                  →  Client API (React 19.2+)
@real-router/react/ssr          →  src/ssr.ts                    →  SSR-aware components/hooks (React 19.2+)
@real-router/react/legacy       →  src/legacy.ts                 →  Client API for React 18+
@real-router/react/legacy/ssr   →  src/legacy.ssr.ts             →  SSR subset for React 18+ (no <Await>)
@real-router/react/ink          →  src/ink.ts                    →  Terminal target (Ink 7+, React 19.2+)

# Under the `react-server` bundler condition (Vite/Webpack RSC, Turbopack, Parcel):
@real-router/react              →  src/index.react-server.ts    →  Type-only re-exports
@real-router/react/ssr          →  src/ssr.react-server.ts      →  Type-only SSR prop types
```

All client entries are thin re-export files — no duplicated logic. The `/legacy` entries exclude React 19.2-only primitives (`<Activity>` for `RouteView keepAlive`, `use(promise)` for `<Await>`). The `/ssr` split keeps server-only prop types out of the client TypeScript context for apps that don't touch SSR (bundle cost ≈ 0 thanks to `"sideEffects": false`).

**Build output** (tsdown multi-entry with shared chunks):

```
dist/
├── esm/
│   ├── index.mjs              # Main entry (React 19.2+)
│   ├── index.d.mts
│   ├── ssr.mjs                # SSR-feature subpath
│   ├── ssr.d.mts
│   ├── legacy.mjs             # Legacy entry (React 18+)
│   ├── legacy.d.mts
│   ├── legacy.ssr.mjs         # Legacy SSR subset
│   ├── legacy.ssr.d.mts
│   ├── ink.mjs                # Ink entry (Ink 7+)
│   ├── ink.d.mts
│   └── chunk-*.mjs            # Shared code (auto-extracted)
└── cjs/                       # Mirror of esm/ for CJS consumers
```

## Source Structure

```
src/
├── index.ts                       # Main entry: client API (React 19.2+)
├── ssr.ts                         # SSR-feature subpath (React 19.2+)
├── legacy.ts                      # Legacy entry: client API (React 18+)
├── legacy.ssr.ts                  # Legacy SSR subset (React 18+, no <Await>)
├── ink.ts                         # Ink entry: terminal UI runtime
├── index.react-server.ts          # RSC type-only entry (root, react-server condition)
├── ssr.react-server.ts            # RSC type-only entry (/ssr, react-server condition)
├── RouterProvider.tsx             # Context provider — announcer / scroll / VT effects
├── context.ts                     # createContext<T | null>(null) for Router/Route/Navigator
├── types.ts                       # RouteContext, LinkProps (DOM)
├── ink-types.ts                   # InkLinkProps, InkRouterProviderProps (terminal)
├── constants.ts                   # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── dom-utils/                     # Shared DOM helpers (symlink → shared/dom-utils/)
│   ├── link-utils.ts              # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName, applyLinkA11y, shallowEqual
│   ├── route-announcer.ts         # createRouteAnnouncer (WCAG aria-live, double-rAF state machine)
│   ├── scroll-restore.ts          # createScrollRestoration (opt-in scroll capture + restore)
│   ├── view-transitions.ts        # createViewTransitions (subscribeLeave-based VT integration)
│   ├── direction-tracker.ts       # createDirectionTracker (back/forward annotation)
│   └── index.ts
├── hooks/
│   ├── useRouter.tsx              # Router instance from context (never re-renders)
│   ├── useRoute.tsx               # Full route state — RouteHookResult<P> with non-nullable route (throws if undefined)
│   ├── useNavigator.tsx           # Navigator from context (never re-renders)
│   ├── useRouteNode.tsx           # Node-scoped subscription (cached createRouteNodeSource)
│   ├── useIsActiveRoute.tsx       # Active state subscription (useMemo-wrapped createActiveRouteSource)
│   ├── useRouteUtils.tsx          # RouteUtils from route tree (never re-renders)
│   ├── useRouterTransition.tsx    # Transition lifecycle (cached getTransitionSource)
│   ├── useRouteExit.tsx           # Wrap subscribeLeave with reentrant abort + same-route skip + latest-handler ref + StrictMode dedupe
│   ├── useRouteEnter.tsx          # Fire on nav-driven mount via useRoute() snapshot + route.transition.from
│   └── useDeferred.tsx            # /ssr — reads state.context.ssrDataDeferred[key] (ssr-data-plugin)
├── components/
│   ├── Link.tsx                   # memo'd link with custom areLinkPropsEqual + active state; inline onClick (no useCallback)
│   ├── InkLink.tsx                # /ink — focusable text link via useFocus + useInput
│   ├── InkRouterProvider.tsx      # /ink — wrapper that omits announceNavigation
│   ├── RouterErrorBoundary.tsx    # Declarative navigation error handling (useLayoutEffect for onErrorRef, useMemo'd source)
│   ├── ClientOnly.tsx             # /ssr — server fallback → client children swap after mount
│   ├── ServerOnly.tsx             # /ssr — symmetric inverse of ClientOnly
│   ├── Streamed.tsx               # /ssr — cross-adapter <Suspense> alias
│   ├── Await.tsx                  # /ssr — React 19.2+ render-prop wrapper for deferred data (use(promise))
│   ├── HttpStatusCode.tsx         # /ssr — render-time HTTP status (writes to sink in context)
│   ├── HttpStatusProvider.tsx     # /ssr — provides HttpStatusSink via React context
│   └── modern/
│       └── RouteView/             # React 19.2-only — declarative route matching with keepAlive
│           ├── index.ts           # Barrel re-exports
│           ├── RouteView.tsx      # RouteViewRoot + compound export (.Match, .Self, .NotFound)
│           ├── types.ts           # RouteViewProps, MatchProps, SelfProps, NotFoundProps
│           ├── components.tsx     # Match, Self, NotFound marker components
│           └── helpers.tsx        # collectElements (Children.forEach), buildRenderList, processMatch, isSegmentMatch
└── utils/
    └── createHttpStatusSink.ts    # /ssr — fresh { code: undefined } sink per request
```

### Shared DOM Utilities (`dom-utils/`)

The `dom-utils/` directory is a symlink to `shared/dom-utils/` — identical helpers used by all framework adapters:

- **`shouldNavigate(evt)`** — click filtering (button 0, no modifier keys)
- **`buildHref(router, routeName, routeParams)`** — URL generation with buildUrl/buildPath fallback
- **`buildActiveClassName(isActive, activeClassName, baseClassName)`** — class string composition
- **`applyLinkA11y(element)`** — adds `role="link"` + `tabindex="0"` to non-interactive elements. Not used by React's `<Link>` (always renders `<a>`), but used by Svelte/Solid/Vue/Angular directive-based navigation. Exported for consumers building custom navigation components on non-anchor elements.
- **`createRouteAnnouncer(router, options?)`** — WCAG screen reader announcements via `aria-live` region
- **`createScrollRestoration(router, options?)`** — opt-in scroll capture on transition, restore on back/pagehide. DOM-concern isolated from router-core. Lifecycle: `useEffect` on `RouterProvider` creates the utility when `scrollRestoration` prop is set; cleanup destroys it. Primitive-field deps (`mode`, `anchorScrolling`) guard against inline-object thrash; `scrollContainer` is read lazily, excluded from deps.
- **`createViewTransitions(router)`** — opt-in View Transitions API integration. Wires `subscribeLeave` (open VT snapshot of old DOM, returns immediately so router isn't blocked) + `subscribe` (resolve deferred → `requestAnimationFrame` → VT snapshots new DOM → animates). No-op when `document.startViewTransition` is unavailable (SSR, Firefox as of 2026-04). Lifecycle: `useEffect` on `RouterProvider` creates the utility when `viewTransitions` prop is truthy; cleanup calls `destroy()` which skips any in-flight VT via `skipTransition()`.

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
useRouterTransition()           — getTransitionSource(router)
useIsActiveRoute(name, params)  — createActiveRouteSource(router, name, params, opts)  [internal]
RouterErrorBoundary             — createDismissableError(router) with integrated resetError
RouterProvider                  — createRouteSource(router)
```

These subscribe to `@real-router/sources` stores. The source creates a `{ subscribe, getSnapshot }` object. `useSyncExternalStore` handles subscription lifecycle — Strict Mode safe, no `useEffect` cleanup needed.

**`useRouteNode` is the primary hook for components.** It subscribes to a specific route segment and only re-renders when that segment's active/inactive state changes. This is the core optimization — in a tree of 100 routes, navigating from `users.list` to `users.profile` only re-renders the `useRouteNode("users")` consumer, not all route-aware components.

## Component Architecture

```
Link (memo + areLinkPropsEqual)
├── useRouter() — router instance from context (never re-renders)
├── useIsActiveRoute() — subscription for active/inactive CSS (internal hook, cached source)
├── href = router.buildUrl() || router.buildPath()
└── onClick → void router.navigate(...)   # fire-and-forget

RouterErrorBoundary
├── useSyncExternalStore over createDismissableError(router) — shared per-router source
│     (integrated dismissedVersion + resetError — no local state)
├── onErrorRef — useRef for callback stability (avoids closure churn)
└── Renders: children + fallback(error, resetError) via Fragment
```

**Custom comparator (`areLinkPropsEqual`):** Explicitly compares all Link-specific props — `shallowEqual` (`Object.is` per key, order-insensitive) for `routeParams` and `routeOptions`, strict equality (`===`) for primitives (`routeName`, `className`, `activeClassName`, `activeStrict`, `ignoreQueryParams`, `onClick`, `target`, `style`, `children`). Prevents re-renders from inline object literals `<Link routeParams={{ id: 123 }} />`. Nested objects in params aren't deep-compared — consumers stabilize with `useMemo` if needed.

**RouteView.Match with `fallback`:** When `fallback` prop is provided, `Match` wraps its children in a `<Suspense>` boundary with that fallback. Use this with `React.lazy()` to code-split route components. Works seamlessly with `keepAlive` — the `<Activity>` wrapper preserves the entire `<Suspense>` boundary including the fallback state.

**Navigation:** Fire-and-forget `void router.navigate(...)`. No success/error callbacks — users should call `router.navigate()` directly with `await` for per-navigation result handling.

## Performance Optimizations

| Optimization                      | Location                | Mechanism                                                                                          |
| --------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Node-scoped subscriptions         | `useRouteNode`          | Cached `createRouteNodeSource(router, nodeName)` — N consumers share one router subscription       |
| Canonical params cache            | `useIsActiveRoute`      | `createActiveRouteSource` hashes params via `canonicalJson` — `{a:1,b:2}` ≡ `{b:2,a:1}`             |
| Shared transition/error sources   | `useRouterTransition`, `RouterErrorBoundary` | `getTransitionSource` / `createDismissableError` — one eager router subscription per router |
| Custom memo comparator            | `Link`                  | `areLinkPropsEqual`: `shallowEqual` (Object.is per key) for params/options, `===` for primitives   |
| Frozen singletons                 | `constants.ts`          | `EMPTY_PARAMS`, `EMPTY_OPTIONS` avoid allocation for default props                                 |
| WeakMap caching (sources level)   | `@real-router/sources`  | Per-router caches auto-evicted on router GC                                                        |
| Memoized navigator                | `RouterProvider`        | `getNavigator(router)` via `useMemo` — stable reference                                            |

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
    ├──► createActiveRouteSource.subscribe callback → boolean snapshot
    │       └──► if changed: useSyncExternalStore triggers re-render
    │               └──► Link active CSS updates (via internal useIsActiveRoute)
    │
    └──► createDismissableError.subscribe callback → { error, toRoute, fromRoute, version, resetError }
            └──► useSyncExternalStore triggers RouterErrorBoundary re-render
                    └──► if snapshot.error: render fallback(error, snapshot.resetError) alongside children
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

11 performance test suites in `tests/performance/` verify render budgets via `vitest-react-profiler`:

| Component / Hook        | What is verified                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RouterProvider**      | 1 mount per init; 1 re-render per navigation; memo'd children without context skip re-renders; RouterContext consumers skip re-renders (stable ref); RouteContext consumers re-render on navigation                                                                  |
| **Link**                | 1 mount; memo skips parent re-renders; 100 links meet budget (100 mounts, 0 updates); active class toggles exactly 1 re-render; unrelated navigations skip re-render; shared cached `createActiveRouteSource` prevents re-renders on identical param shapes |
| **RouteView**           | Sibling isolation (navigation doesn't re-render siblings); only matched child renders; keepAlive lazy activation (never-visited children have 0 renders); hidden keepAlive children don't re-render on sibling navigation; hide/show cycle meets ≤2 re-render budget |
| **useRoute**            | Re-renders on every navigation (no filtering); linear render count (N navigations = N re-renders); stable navigator ref across re-renders                                                                                                                            |
| **useRouteNode**        | Re-renders only when node activates/deactivates; skips unrelated navigations (0 re-renders); skips sibling node navigations; root node re-renders on all changes                                                                                                     |
| **useRouterTransition** | Sync navigation: 0 extra re-renders (no TRANSITION_START); async navigation: exactly 2 re-renders per transition (start + end); N async transitions = 2N re-renders (linear scaling); `navigateToNotFound()` causes 0 re-renders; subscription lifecycle has no listener leak across mount/unmount cycles (H12 regression)                                     |
| **useRouter / useNavigator / useRouteUtils** | Contract: 0 re-renders on any navigation (gotcha-locked tests); identity stable across rerenders; navigator method references stable; `useRouteUtils` returns same `RouteUtils` instance across renders (WeakMap cache inside `@real-router/route-utils`, keyed on the route tree) |
| **useIsActiveRoute**    | Reuses cached source for canonical-equal `routeParams` (key-order insensitive via `canonicalJson`); re-renders only on active-state transition |
| **structuralSharing**   | `BaseSource.getSnapshot()` returns same reference for path-stable navigations (no tearing) |

## Stress Test Coverage

62 stress tests across 11 files in `tests/stress/` validate behavior under extreme conditions:

| Category                | Tests (file count) | Test count | What they verify                                                                                                                                                                                        |
| ----------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle | 1 file             | 14 tests   | useRouteNode/useRoute/Link/useRouterTransition × 200 mount/unmount cycles — bounded heap; 50 components remount + re-subscribe; conditional toggle × 100; router stop/restart; dynamic nodeName changes; 10000 navigate cycles heap-bounded; 200 router instances disposed — full WeakMap cache cleanup (createDismissableError/getTransitionSource/`@real-router/route-utils`/shouldUpdateCache); navigate-during-teardown × 50 with concurrent races — no unhandled rejections, heap bounded |
| Subscription fanout     | 1 file             | 5 tests    | 50 useRouteNode on different nodes — only relevant re-render; 20 useRoute + 30 useRouteNode('') — all update; 50 useRouteNode('users') — granular scoping; concurrent mount/unmount; cleanup on unmount |
| Link mass rendering     | 1 file             | 7 tests    | 200 Links mount — no render loops; active class toggle; 50 round-robin navigations; deep routeParams; 50 rapid clicks — 0 unhandled rejections; dynamic routeName × 100                                 |
| Deep tree context       | 1 file             | 4 tests    | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; wide tree 25 leaves — all re-render; nested RouterProviders — isolated                                                  |
| shouldUpdateCache       | 1 file             | 4 tests    | 200 unique node names — cache scales; 100 same-node — cache hit; router stop + GC + new router; 2 routers × 50 nodes — isolated                                                                         |
| Transition hook         | 1 file             | 6 tests    | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; 20 consumers — consistent; navigate + cancel × 50 — never stuck; router.stop() mid-transition — no unhandled rejections; concurrent guards w/ mixed durations — last-write-wins, no zombie isTransitioning |
| RouteView keepAlive     | 1 file             | 6 tests    | 5 Activity segments × 200 navs — state preserved; non-keepAlive unmount; mixed modes; DOM stability                                                                                                     |
| Dynamic routes          | 1 file             | 4 tests    | `addRoute`/`removeRoute`/`clearRoutes` mid-session; useRouteNode on mutated tree; Link href updates after route mutation                                                                                  |
| Suspense transition     | 1 file             | 3 tests    | Suspense fallback during pending lazy load; keepAlive + Suspense × 20 round-trips; nested Suspense                                                                                                        |
| RouterErrorBoundary     | 1 file             | 4 tests    | 100 rapid guard rejections — heap bounded, all errors reach onError; resetError × 100 — boundary re-arms cleanly; mount/unmount × 100 with interleaved errors — no unhandled rejections; 3 concurrent boundaries share snapshot (global event) — linear render scaling |
| Combined SPA            | 1 file             | 4 tests    | Full app with RouteView + Links + useRouteNode + 200 navs; transition progress; keepAlive tabs; remount; RouteView match correctness × 100                                                              |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, performance)
- [RFC-react-18-19-split.md](.claude/RFC-react-18-19-split.md) — Design document for dual entry points
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
