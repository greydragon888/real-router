# Architecture

> Solid.js bindings for Real-Router with fine-grained signal-based reactivity

## Package Dependencies

```
@real-router/solid
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Single Entry Point

One entry point. Solid has no equivalent of React's `<Activity>` API, so no modern/legacy split is needed.

```
@real-router/solid  →  src/index.tsx  →  Full API (Solid.js 1.7+)
```

**Build output** (rollup + babel-preset-solid):

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
├── index.tsx                   # Single entry point
├── RouterProvider.tsx          # Context provider — wires router to Solid tree
├── context.ts                  # Two Solid contexts (RouterContext, RouteContext)
├── types.ts                    # RouteState, LinkProps
├── constants.ts                # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── utils.ts                    # shouldNavigate() — click filtering
├── createSignalFromSource.ts   # Signal bridge — converts RouterSource to Solid Accessor
├── hooks/
│   ├── useRouter.tsx           # Router + Navigator from context (never reactive)
│   ├── useNavigator.tsx        # Navigator from context (never reactive)
│   ├── useRoute.tsx            # Full route state Accessor from context (every navigation)
│   ├── useRouteNode.tsx        # Node-scoped subscription via createSignalFromSource
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never reactive)
│   └── useRouterTransition.tsx # Transition lifecycle Accessor (isTransitioning, toRoute, fromRoute)
└── components/
    ├── Link.tsx                # Reactive link with classList-based active state
    └── RouteView/              # Declarative route matching (no keepAlive)
        ├── index.ts            # Barrel re-exports
        ├── RouteView.tsx       # RouteViewRoot + compound export (RouteView.Match, RouteView.NotFound)
        ├── types.ts            # RouteViewProps, MatchProps, NotFoundProps
        ├── components.tsx      # Match, NotFound marker objects with Symbol-based type system
        └── helpers.tsx         # collectElements, buildRenderList, isSegmentMatch
```

## Key Differences from React and Preact Adapters

| Aspect                      | React                              | Preact                                     | Solid                                                   |
| --------------------------- | ---------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Reactivity model            | Re-renders (virtual DOM diffing)   | Re-renders (virtual DOM diffing)           | Fine-grained signals (no re-renders)                    |
| External store subscription | `useSyncExternalStore` (native)    | Custom polyfill (`useState` + `useEffect`) | `createSignalFromSource` (`createSignal` + `onCleanup`) |
| Hook return types           | Values (`RouteState`)              | Values (`RouteState`)                      | Accessors (`Accessor<RouteState>`)                      |
| Props access                | Destructure freely                 | Destructure freely                         | Never destructure — use getters                         |
| `memo()`                    | Required for optimization          | Required for optimization                  | Not needed — components run once                        |
| `useCallback`               | Required for stable refs           | Required for stable refs                   | Not needed — no re-renders                              |
| `useStableValue`            | JSON-based reference stabilization | JSON-based reference stabilization         | Not needed — signals track dependencies                 |
| Active class on Link        | `className` string concat          | `className` string concat                  | `classList` object                                      |
| `keepAlive` / Activity      | React 19.2+                        | Not available                              | Not available                                           |
| Entry points                | Main + Legacy                      | Single                                     | Single                                                  |
| Build tool                  | tsup                               | tsup                                       | rollup + babel-preset-solid                             |
| Peer dependency             | `react` >= 19.0.0                  | `preact` >= 10.0.0                         | `solid-js` >= 1.7.0                                     |
| RouteView child detection   | React element type checking        | `toChildArray` + element type checking     | Symbol-based marker objects (`$$type`)                  |

### createSignalFromSource

Solid has no `useSyncExternalStore`. The bridge in `src/createSignalFromSource.ts` uses `createSignal` + `onCleanup`:

1. `createSignal(source.getSnapshot())` — initial value from store
2. `source.subscribe(callback)` — calls `setValue(() => source.getSnapshot())` on store change
3. `onCleanup(unsubscribe)` — cleans up when the reactive owner disposes

This is the idiomatic Solid pattern for bridging external subscriptions into the reactive graph. No tearing concerns — Solid has no concurrent rendering.

## Context Architecture

Two contexts serve different purposes:

```
RouterProvider
├── RouterContext.Provider     value={{ router, navigator }}   # Stable — never changes
│   └── RouteContext.Provider  value={routeSignal}             # Reactive Accessor — updates on navigation
│       └── {children}
```

**Why two contexts, not three:**

Solid's fine-grained reactivity makes a separate `NavigatorContext` unnecessary. The navigator is a stable value derived from the router at provider initialization — it doesn't need its own context because reading it never triggers reactive tracking. Both `router` and `navigator` live together in `RouterContext` as a plain object.

| Context         | Value                                      | Reactive?                          | Consumers                                                           |
| --------------- | ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------- |
| `RouterContext` | `{ router: Router, navigator: Navigator }` | No — stable object reference       | `useRouter`, `useNavigator`, `useRouteUtils`, `useRouterTransition` |
| `RouteContext`  | `Accessor<RouteState>`                     | Yes — signal updates on navigation | `useRoute`                                                          |

## Subscription Patterns

### Context-Based (via `useContext()`)

```
useRoute()      — reads RouteContext → returns Accessor<RouteState>, reactive on every navigation
useRouter()     — reads RouterContext → returns Router, never reactive
useNavigator()  — reads RouterContext → returns Navigator, never reactive
```

### Signal-Based (via createSignalFromSource)

```
useRouteNode(name)      — createRouteNodeSource(router, name)     → Accessor<RouteState>
useRouterTransition()   — createTransitionSource(router)          → Accessor<RouterTransitionSnapshot>
Link (internal)         — createActiveRouteSource(router, ...)    → Accessor<boolean>
RouterProvider          — createRouteSource(router)               → Accessor<RouteState>
```

## Component Architecture

```
Link (no memo — Solid components run once)
├── useRouter() — router + navigator from context
├── createSignalFromSource(createActiveRouteSource(...)) — reactive active state
├── createMemo(() => router.buildUrl() || router.buildPath()) — reactive href
├── createMemo(() => ...) — reactive class via classList pattern
└── onClick → router.navigate(...).catch(() => {})
```

**No `memo()` needed:** Solid components are functions that run exactly once. The reactive graph tracks signal dependencies automatically. `createMemo` is used for derived values (href, class), not for preventing re-renders.

**`classList` for active state:** Solid's `classList` prop accepts `{ [className]: boolean }` and updates the DOM attribute directly without string concatenation.

**RouteView.Match with `fallback`:** When `fallback` prop is provided, `Match` wraps its children in a `<Suspense>` boundary (from `solid-js`) with that fallback. Use this with `lazy()` from `solid-js` to code-split route components.

**RouteView marker objects:** `Match` and `NotFound` are not real JSX elements — they return plain objects with a `$$type` Symbol property. `RouteView` uses `children()` from `solid-js` to resolve the child accessor, then `collectElements` walks the result and checks `$$type` to identify markers. This avoids React-style element type checking (`element.type === Match`) which doesn't work in Solid.

```
RouteView
├── useRouteNode(nodeName) — Accessor<RouteState>
├── resolveChildren(() => props.children) — Solid children helper
├── createMemo(() => ...) — reactive render list
│   ├── collectElements(resolved(), elements) — walks children, collects markers by $$type
│   └── buildRenderList(elements, routeName, nodeName) — finds first matching segment
└── result() — returns reactive JSX
```

## Performance

Solid's fine-grained reactivity eliminates most of the optimization work needed in React/Preact:

| Optimization              | React/Preact                        | Solid                                                          |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Prevent re-renders        | `memo()` + comparators              | Not needed — components run once                               |
| Stable object references  | `useStableValue` (JSON memoization) | Not needed — signals track dependencies, not object identity   |
| Stable callbacks          | `useCallback`                       | Not needed — closures are stable                               |
| Node-scoped subscriptions | `shouldUpdateNode()` filter         | `shouldUpdateNode()` filter (same — in `@real-router/sources`) |
| Frozen singletons         | `EMPTY_PARAMS`, `EMPTY_OPTIONS`     | Same — avoids allocation for default props                     |
| WeakMap caching           | Per-router selector functions       | Same — in `@real-router/sources`                               |

The main performance primitive is `createSignalFromSource`: it creates a signal that only updates when the underlying source emits, and Solid's scheduler batches DOM updates automatically.

### O(1) Active Route Detection

`RouterProvider` creates a `createSelector` based on the current route name with prefix-based matching. `Link` components use this shared selector instead of per-link subscriptions. On navigation, `createSelector` notifies only the previously-active and newly-active links (2 updates instead of n).

Links with `activeStrict: true`, custom `routeParams`, or `ignoreQueryParams: false` fall back to per-link `createActiveRouteSource` subscriptions since the selector only handles the default case (non-strict prefix matching, no params comparison).

### Store-Based Granular Route State

`useRouteStore()` and `useRouteNodeStore()` use `createStore` + `reconcile` from `solid-js/store` instead of `createSignal`. This enables property-level reactivity — a component reading `state.route?.params.id` won't re-run when `state.route?.params.page` changes.

```tsx
const state = useRouteStore();

createEffect(() => {
  // Only re-runs when params.id changes, ignores params.page/route.name/etc.
  console.log(state.route?.params.id);
});
```

`reconcile` performs a deep diff on each snapshot update, only patching changed properties. The existing signal-based hooks (`useRoute`, `useRouteNode`) remain available for simpler use cases.

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
    │       └──► setValue() updates RouteContext signal
    │               └──► useRoute() Accessor consumers re-evaluate (fine-grained)
    │
    ├──► createRouteNodeSource.subscribe callback → shouldUpdateNode() filter
    │       └──► if node relevant: setValue() updates signal
    │               └──► useRouteNode("users") Accessor consumers re-evaluate
    │
    └──► createActiveRouteSource.subscribe callback → boolean snapshot
            └──► if changed: setValue() updates signal
                    └──► Link classList updates (via internal createSignalFromSource)
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

41 stress tests across 9 files in `tests/stress/` validate behavior under extreme conditions:

| Category                | Tests (file count) | Test count | What they verify                                                                                                                                                                                                             |
| ----------------------- | ------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle | 1 file             | 7 tests    | useRouteNode/useRoute/Link/useRouterTransition × 200 mount/unmount cycles — bounded heap; 50 components remount + re-subscribe; conditional toggle × 100 with onCleanup tracking; router stop/restart                        |
| Subscription fanout     | 1 file             | 5 tests    | 30 useRouteNode on different nodes — signals track correctly; 20 useRoute + 30 useRouteNode('') — all update; 50 useRouteNode('users') — granular scoping; concurrent mount/unmount; cleanup on unmount (50 onCleanup calls) |
| Link mass rendering     | 1 file             | 5 tests    | 200 Links mount — no render loops; active class toggle; 50 round-robin navigations; deep routeParams; 50 rapid clicks; dynamic routeName × 100                                                                               |
| Link directive          | 1 file             | 3 tests    | 100 use:link elements — a11y attributes (role, tabindex); mount/unmount × 50 cycles — bounded heap + onCleanup fires; activeClassName toggle; click navigation; 50 rapid clicks; `<a>` href + no a11y override               |
| Store granularity       | 1 file             | 5 tests    | useRouteStore — route.name effect fires only on name changes; route.params.id — only on id changes; useRouteNodeStore — scoped + granular; 20 consumers tracking different properties; 10 nodes × 50 navs — isolated         |
| Deep tree context       | 1 file             | 4 tests    | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; wide tree 25 leaves — all re-render; nested RouterProviders — isolated                                                                       |
| Transition hook         | 1 file             | 4 tests    | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; 20 consumers — consistent; navigate + cancel × 50 — never stuck                                                                               |
| Combined SPA            | 1 file             | 4 tests    | Full app with RouteView + Links + useRouteNode + 200 navs; transition progress; remount after unmount; RouteView match correctness × 100                                                                                     |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, Solid-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
