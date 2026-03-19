# Architecture

> Vue 3 bindings for Real-Router with proxy-based reactive refs

## Package Dependencies

```
@real-router/vue
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Single Entry Point

One entry point. Vue has native `<KeepAlive>`, so no modern/legacy split is needed.

```
@real-router/vue  →  src/index.ts  →  Full API (Vue 3.3+)
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
├── index.ts                    # Single entry point
├── RouterProvider.ts           # Context provider — wires router to Vue tree
├── context.ts                  # Three InjectionKeys (RouterKey, NavigatorKey, RouteKey)
├── types.ts                    # RouteState, RouteContext, LinkProps
├── constants.ts                # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── utils.ts                    # shouldNavigate() — click filtering
├── useRefFromSource.ts         # Ref bridge — converts RouterSource to ShallowRef
├── composables/
│   ├── useRouter.ts            # Router instance from inject (never reactive)
│   ├── useNavigator.ts         # Navigator from inject (never reactive)
│   ├── useRoute.ts             # Full route context from inject (every navigation)
│   ├── useRouteNode.ts         # Node-scoped subscription via useRefFromSource
│   ├── useIsActiveRoute.ts     # Active state subscription (internal — used by Link)
│   ├── useRouteUtils.ts        # RouteUtils from route tree (never reactive)
│   └── useRouterTransition.ts  # Transition lifecycle ShallowRef (isTransitioning, toRoute, fromRoute)
└── components/
    ├── Link.ts                 # defineComponent + h('a'), computed href/class, active state
    └── RouteView/              # Declarative route matching with native keepAlive support
        ├── index.ts            # Barrel re-exports
        ├── RouteView.ts        # RouteViewComponent + compound export (RouteView.Match, RouteView.NotFound)
        ├── types.ts            # RouteViewProps, MatchProps, NotFoundProps
        ├── components.ts       # Match, NotFound marker components (render: null)
        └── helpers.ts          # collectElements, buildRenderList, isSegmentMatch
```

## Key Differences from React, Preact, and Solid Adapters

| Aspect                      | React                              | Preact                                     | Solid                                                   | Vue                                                  |
| --------------------------- | ---------------------------------- | ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| Reactivity model            | Re-renders (virtual DOM diffing)   | Re-renders (virtual DOM diffing)           | Fine-grained signals (no re-renders)                    | Proxy-based refs (targeted DOM updates)              |
| External store subscription | `useSyncExternalStore` (native)    | Custom polyfill (`useState` + `useEffect`) | `createSignalFromSource` (`createSignal` + `onCleanup`) | `useRefFromSource` (`shallowRef` + `onScopeDispose`) |
| Hook/composable return      | Values (`RouteState`)              | Values (`RouteState`)                      | Accessors (`Accessor<RouteState>`)                      | `{ navigator, route: Ref, previousRoute: Ref }`      |
| `memo()`                    | Required for optimization          | Required for optimization                  | Not needed — components run once                        | Not needed — Vue tracks ref dependencies             |
| `useStableValue`            | JSON-based reference stabilization | JSON-based reference stabilization         | Not needed                                              | Not needed                                           |
| Active class on Link        | `className` string concat          | `className` string concat                  | `classList` object                                      | `class` string concat                                |
| `keepAlive` / Activity      | React 19.2+                        | Not available                              | Not available                                           | Vue native `<KeepAlive>` (all versions)              |
| Context mechanism           | `createContext` + Provider         | `createContext` + Provider                 | `createContext` + Provider                              | `provide` / `inject` + `InjectionKey`                |
| Context count               | 2 (React), 3 (Preact)              | 3                                          | 2                                                       | 3                                                    |
| Components                  | JSX (.tsx)                         | JSX (.tsx)                                 | JSX (.tsx)                                              | `defineComponent` + `h()` (.ts)                      |
| Build tool                  | tsup                               | tsup                                       | rollup + babel-preset-solid                             | tsup                                                 |
| Peer dependency             | `react` >= 19.0.0                  | `preact` >= 10.0.0                         | `solid-js` >= 1.7.0                                     | `vue` >= 3.3.0                                       |
| Children access             | `{children}` / slots               | `{children}` / slots                       | slots                                                   | `slots.default?.()`                                  |
| File extensions             | .tsx                               | .tsx                                       | .tsx                                                    | .ts                                                  |

### useRefFromSource

Vue has no `useSyncExternalStore`. The bridge in `src/useRefFromSource.ts` uses `shallowRef` + `onScopeDispose`:

1. `shallowRef(source.getSnapshot())` — initial value from store
2. `source.subscribe(callback)` — sets `ref.value = source.getSnapshot()` on store change
3. `onScopeDispose(unsub)` — cleans up when the reactive scope disposes

`shallowRef` is used instead of `ref` because route snapshots are frozen objects. Vue's deep reactivity proxy would be wasted on them, and `shallowRef` only tracks the reference itself.

This is the idiomatic Vue 3 pattern for bridging external subscriptions into the reactive graph. No tearing concerns — Vue has no concurrent rendering.

## Context Architecture

Three separate injection keys serve different update frequencies:

```
RouterProvider
├── provide(RouterKey, router)                              # Stable — never changes
├── provide(NavigatorKey, navigator)                        # Stable — derived from router
└── provide(RouteKey, { navigator, route, previousRoute }) # Reactive — ShallowRefs update on navigation
    └── {slots.default?.()}
```

**Why three keys, not two:**

Vue's `provide`/`inject` system doesn't have the same re-render coupling as React context. Separating `RouterKey` and `NavigatorKey` keeps each injection point focused and avoids bundling stable values with reactive ones. `RouteKey` carries the reactive `ShallowRef` values alongside the stable `navigator` reference for convenience.

| Key            | Value                                                         | Reactive?                       | Consumers                                                           |
| -------------- | ------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| `RouterKey`    | `Router` instance                                             | No — stable object reference    | `useRouter`, `useRouteUtils`, `useRouterTransition`, `useRouteNode` |
| `NavigatorKey` | `Navigator`                                                   | No — stable object reference    | `useNavigator`                                                      |
| `RouteKey`     | `{ navigator, route: ShallowRef, previousRoute: ShallowRef }` | Yes — refs update on navigation | `useRoute`                                                          |

## Subscription Patterns

### Context-Based (via `inject()`)

```
useRoute()      — reads RouteKey → returns { navigator, route: ShallowRef, previousRoute: ShallowRef }
useRouter()     — reads RouterKey → returns Router, never reactive
useNavigator()  — reads NavigatorKey → returns Navigator, never reactive
```

### Ref-Based (via useRefFromSource)

```
useRouteNode(name)      — createRouteNodeSource(router, name)     → { navigator, route: ShallowRef, previousRoute: ShallowRef }
useRouterTransition()   — createTransitionSource(router)          → ShallowRef<RouterTransitionSnapshot>
useIsActiveRoute(...)   — createActiveRouteSource(router, ...)    → ShallowRef<boolean>
RouterProvider          — createRouteSource(router)               → updates route/previousRoute ShallowRefs
```

## Component Architecture

```
Link (defineComponent + h('a'))
├── useRouter() — router instance from inject (never reactive)
├── useIsActiveRoute(...) — ShallowRef<boolean> for active CSS
├── computed(() => router.buildUrl() || router.buildPath()) — reactive href
├── computed(() => ...) — reactive class string concat
└── onClick → router.navigate(...).catch(() => {})
```

**No `memo()` needed:** Vue's reactivity system tracks which refs a computed or template expression reads. Only the parts that depend on changed refs re-evaluate. No component-level re-render optimization is required.

**`class` string concat for active state:** Vue's `class` binding accepts a string. The `finalClassName` computed concatenates `props.class` and `props.activeClassName` when `isActive.value` is true.

**RouteView.Match with `fallback`:** When `fallback` prop is provided, `Match` wraps its children in Vue's `<Suspense>` boundary with that fallback. Use this with `defineAsyncComponent` to code-split route components. Works with both `keepAlive` and non-`keepAlive` modes — the `<Suspense>` boundary is preserved inside the `<KeepAlive>` wrapper.

**RouteView marker components:** `Match` and `NotFound` are real `defineComponent` instances with `render: null`. `RouteView` reads `slots.default?.()` to get VNodes, then `collectElements` walks them checking `vnode.type === Match` or `vnode.type === NotFound`. This is standard Vue VNode type checking.

```
RouteView (defineComponent)
├── useRouteNode(nodeName) — { route: ShallowRef, ... }
├── slots.default?.() — resolves child VNodes each render
├── collectElements(vnodes, result) — walks children, collects Match/NotFound by vnode.type
├── buildRenderList(elements, routeName, nodeName) — finds first matching segment
└── keepAlive branch:
    ├── getOrCreateWrapper(cache, segment) — markRaw wrapper component per segment
    └── h(KeepAlive, null, { default: () => h(WrapperComponent, ...) })
```

**keepAlive implementation:** Vue's `<KeepAlive>` requires a single child with a stable identity. Each `Match` segment gets a dedicated wrapper component created with `defineComponent` and cached in a `Map<string, Component>`. Wrappers are wrapped with `markRaw` to prevent Vue from proxying them. The `key` prop on the wrapper drives `<KeepAlive>`'s include/exclude logic.

## Performance

Vue's proxy-based reactivity eliminates most of the optimization work needed in React/Preact:

| Optimization              | React/Preact                        | Vue                                                            |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Prevent re-renders        | `memo()` + comparators              | Not needed — Vue tracks ref dependencies automatically         |
| Stable object references  | `useStableValue` (JSON memoization) | Not needed — `shallowRef` tracks reference, not deep equality  |
| Stable callbacks          | `useCallback`                       | Not needed — closures are stable in setup()                    |
| Node-scoped subscriptions | `shouldUpdateNode()` filter         | `shouldUpdateNode()` filter (same — in `@real-router/sources`) |
| Frozen singletons         | `EMPTY_PARAMS`, `EMPTY_OPTIONS`     | Same — avoids allocation for default props                     |
| WeakMap caching           | Per-router selector functions       | Same — in `@real-router/sources`                               |
| keepAlive wrapper cache   | N/A                                 | `Map<string, Component>` per RouteView instance, `markRaw`     |

The main performance primitive is `useRefFromSource`: it creates a `shallowRef` that only updates when the underlying source emits, and Vue's scheduler batches DOM updates automatically.

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
    │       └──► RouterProvider updates route.value / previousRoute.value (ShallowRefs)
    │               └──► useRoute() consumers re-evaluate (template expressions tracking refs)
    │
    ├──► createRouteNodeSource.subscribe callback → shouldUpdateNode() filter
    │       └──► if node relevant: useRefFromSource updates snapshot ShallowRef
    │               └──► useRouteNode("users") watch(snapshot) splits into route/previousRoute refs
    │                       └──► template expressions tracking those refs re-evaluate
    │
    └──► createActiveRouteSource.subscribe callback → boolean snapshot
            └──► if changed: useRefFromSource updates isActive ShallowRef
                    └──► Link computed(finalClassName) re-evaluates → DOM class updates
```

## Testing Strategy

```
tests/
├── functional/           # Unit tests per composable/component
├── integration/          # Multi-composable interaction tests
├── helpers/              # createTestRouter, wrapper factories
└── setup.ts              # JSDOM + @testing-library/jest-dom matchers
```

**Coverage:** 100% required (enforced in vitest.config).

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (composables table, gotchas, Vue-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
