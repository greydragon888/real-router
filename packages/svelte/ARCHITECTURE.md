# Architecture

> Svelte 5 bindings for Real-Router with compiler-driven Runes reactivity

## Package Dependencies

```
@real-router/svelte
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, createErrorSource)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Single Entry Point

One entry point. Svelte has no equivalent of React's `<Activity>` API, so no modern/legacy split is needed.

```
@real-router/svelte  →  src/index.ts  →  Full API (Svelte 5.7+)
```

**Build output** (`svelte-package` via `@sveltejs/package`):

```
dist/
├── index.js          # ESM (consumer bundles)
├── index.d.ts        # Type declarations
├── components/
│   ├── Link.svelte
│   └── RouteView.svelte
├── composables/
│   ├── useRouter.svelte.js
│   ├── useNavigator.svelte.js
│   ├── useRoute.svelte.js
│   ├── useRouteNode.svelte.js
│   ├── useRouteUtils.svelte.js
│   ├── useRouterTransition.svelte.js
│   └── useIsActiveRoute.svelte.js
└── RouterProvider.svelte
```

Unlike tsup (which bundles into a single file), `svelte-package` outputs individual files. The consumer's bundler (Vite, Rollup, etc.) handles tree-shaking and final bundling.

## Source Structure

```
src/
├── index.ts                              # Single entry point
├── RouterProvider.svelte                 # Context provider — wires router to Svelte tree
├── context.ts                            # Three string context keys (ROUTER_KEY, NAVIGATOR_KEY, ROUTE_KEY)
├── createReactiveSource.svelte.ts        # Reactive bridge — createSubscriber from svelte/reactivity
├── types.ts                              # RouteContext, LinkProps
├── constants.ts                          # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── utils.ts                              # shouldNavigate() — click filtering
├── composables/
│   ├── useRouter.svelte.ts               # Router instance from getContext (never reactive)
│   ├── useNavigator.svelte.ts            # Navigator from getContext (never reactive)
│   ├── useRoute.svelte.ts                # Full route context from getContext (every navigation)
│   ├── useRouteNode.svelte.ts            # Node-scoped subscription via createReactiveSource
│   ├── useIsActiveRoute.svelte.ts        # Active state subscription (internal — used by Link)
│   ├── useRouteUtils.svelte.ts
│   ├── useRouterTransition.svelte.ts
│   └── useRouterError.svelte.ts        # Internal — error subscription (used by RouterErrorBoundary)
└── components/
    ├── Link.svelte                        # Navigation link with $derived href/class, active state
    ├── RouterErrorBoundary.svelte          # Declarative navigation error handling
    └── RouteView.svelte                   # Declarative route matching via named snippets
```

**File extension conventions:**

- `.svelte` — Svelte components (template + script)
- `.svelte.ts` — TypeScript files that use Runes (require Svelte compiler)
- `.ts` — Plain TypeScript (types, utils, constants)

## Key Differences from Other Adapters

| Aspect                      | React/Preact                      | Vue                                              | Solid                                               | Svelte                                    |
| --------------------------- | --------------------------------- | ------------------------------------------------ | --------------------------------------------------- | ----------------------------------------- |
| Reactivity model            | Re-renders (virtual DOM diffing)  | Proxy-based refs (targeted DOM updates)          | Fine-grained signals (no re-renders)                | Compiler-driven Runes (no virtual DOM)    |
| External store subscription | `useSyncExternalStore` / polyfill | `useRefFromSource` (shallowRef + onScopeDispose) | `createSignalFromSource` (createSignal + onCleanup) | `createReactiveSource` (createSubscriber) |
| Composable return types     | Values (`RouteState`)             | Values with ShallowRefs                          | Accessors (`Accessor<RouteState>`)                  | `{ current: T }` getter objects           |
| `memo()`                    | Required for optimization         | Not needed                                       | Not needed                                          | Not needed                                |
| `useStableValue`            | JSON-based stabilization          | Not needed                                       | Not needed                                          | Not needed                                |
| Active class on Link        | `className` string concat         | `class` string concat                            | `classList` object                                  | `class:` directive / string concat        |
| `keepAlive` / Activity      | React 19.2+                       | Vue native `<KeepAlive>`                         | Not available                                       | Not available                             |
| Context mechanism           | `createContext` + Provider        | `provide` / `inject` + `InjectionKey`            | `createContext` + Provider                          | `setContext` / `getContext` + string keys |
| Context count               | 2 (React), 3 (Preact)             | 3                                                | 2                                                   | 3                                         |
| Components                  | JSX (.tsx)                        | `defineComponent` + `h()` (.ts)                  | JSX (.tsx)                                          | `.svelte` SFC                             |
| Composable files            | .tsx                              | .ts                                              | .tsx                                                | `.svelte.ts`                              |
| Build tool                  | tsup                              | tsup                                             | rollup + babel-preset-solid                         | svelte-package                            |
| Peer dependency             | `react` >= 19.0.0                 | `vue` >= 3.3.0                                   | `solid-js` >= 1.7.0                                 | `svelte` >= 5.7.0                         |
| RouteView children          | Element type markers              | `vnode.type === Match`                           | Symbol `$$type` markers                             | Named snippets (rest `$props()`)          |

### createReactiveSource

Svelte 5 has no `useSyncExternalStore`. The bridge in `src/createReactiveSource.svelte.ts` uses `createSubscriber` from `svelte/reactivity`:

1. `createSubscriber(update => source.subscribe(() => update()))` — registers a subscription factory
2. The returned `subscribe()` function is lazy — it only subscribes when `.current` is read inside a reactive context (a template, `$derived`, or `$effect`)
3. When the source emits, `update()` notifies Svelte's scheduler, which re-evaluates any reactive expressions that read `.current`
4. Cleanup is automatic — `createSubscriber` handles unsubscription when the reactive scope disposes

```typescript
export function createReactiveSource<T>(source: RouterSource<T>): {
  readonly current: T;
} {
  const subscribe = createSubscriber((update) => {
    return source.subscribe(() => {
      update();
    });
  });

  return {
    get current(): T {
      subscribe(); // registers dependency when read in reactive context
      return source.getSnapshot();
    },
  };
}
```

This is the idiomatic Svelte 5 pattern for bridging external subscriptions into the Runes reactive graph. `createSubscriber` was added in Svelte 5.7.0, which is why that's the minimum peer dependency.

## Context Architecture

Three separate string keys serve different update frequencies:

```
RouterProvider
├── setContext(ROUTER_KEY, router)                              # Stable — never changes
├── setContext(NAVIGATOR_KEY, navigator)                        # Stable — derived from router
└── setContext(ROUTE_KEY, { navigator, route, previousRoute }) # Reactive — .current getters update on navigation
    └── {@render children()}
```

**Why string keys, not typed InjectionKeys:**

Svelte's `setContext`/`getContext` uses arbitrary string (or symbol) keys. There's no equivalent of Vue's typed `InjectionKey<T>`. The keys are namespaced strings (`"real-router:router"`, etc.) to avoid collisions.

**Why three keys, not two:**

Separating `ROUTER_KEY` and `NAVIGATOR_KEY` keeps each context value focused. `ROUTE_KEY` carries the reactive `{ current }` getter objects alongside the stable `navigator` reference for convenience — composables that need both don't have to call `getContext` twice.

| Key             | Value                                                           | Reactive?                                          | Consumers                                                           |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `ROUTER_KEY`    | `Router` instance                                               | No — stable object reference                       | `useRouter`, `useRouteUtils`, `useRouterTransition`, `useRouteNode` |
| `NAVIGATOR_KEY` | `Navigator`                                                     | No — stable object reference                       | `useNavigator`                                                      |
| `ROUTE_KEY`     | `{ navigator, route: { current }, previousRoute: { current } }` | Yes — `.current` getters read from reactive source | `useRoute`                                                          |

## Subscription Patterns

### Context-Based (via `getContext()`)

```
useRoute()      — reads ROUTE_KEY → returns { navigator, route: { current }, previousRoute: { current } }
useRouter()     — reads ROUTER_KEY → returns Router, never reactive
useNavigator()  — reads NAVIGATOR_KEY → returns Navigator, never reactive
```

### Reactive Source-Based (via createReactiveSource)

```
useRouteNode(name)      — createRouteNodeSource(router, name)     → { navigator, route: { current }, previousRoute: { current } }
useRouterTransition()   — createTransitionSource(router)          → { current: RouterTransitionSnapshot }
useIsActiveRoute(...)   — createActiveRouteSource(router, ...)    → { current: boolean }
useRouterError()  [internal]  — createErrorSource(router) with WeakMap cache
RouterProvider          — createRouteSource(router)               → updates route/previousRoute .current getters
```

## Component Architecture

```
Link (.svelte)
├── useRouter() — router instance from getContext (never reactive)
├── useIsActiveRoute(...) — { current: boolean } for active CSS
├── $derived(router.buildUrl() || router.buildPath()) — reactive href
├── $derived(...) — reactive class string concat
└── onclick (lowercase) → router.navigate(...).catch(() => {})
    └── {@render children?.()}

RouterErrorBoundary (.svelte)
├── useRouterError() — error subscription via createErrorSource (internal, cached)
├── dismissedVersion state — tracks manually dismissed errors (version-based)
├── fallback snippet — {#snippet fallback(error, resetError)} passed by caller
└── Renders: {@render children?.()} + {@render fallback?.(error, resetError)}
```

**No `memo()` needed:** Svelte's compiler tracks which reactive values a template expression reads. Only the expressions that depend on changed values re-evaluate. No component-level re-render optimization is required.

**`$derived` for active state:** `Link` uses `$derived` for `href` and `finalClassName`. The `activeState.current` getter is read inside `$derived`, so Svelte tracks it as a dependency automatically.

**`onclick` (lowercase):** Svelte 5 uses lowercase event attributes (`onclick`, not `on:click`). This is a breaking change from Svelte 4.

**`{@render children?.()}` for children:** Svelte 5 snippets replace slots. Children are passed as a `Snippet` prop and rendered with `{@render children?.()}`.

**Lazy loading with `Lazy.svelte`:** Since Svelte has no `<Suspense>` component, a dedicated `Lazy.svelte` component exists for code-splitting route content. It accepts `loader` (async import function) and `fallback` (component to show while loading) props. Use this inside `RouteView` snippets to lazy-load route components.

```
RouteView (.svelte)
├── useRouteNode(nodeName) — { route: { current }, ... }
├── rest $props() — all non-nodeName/notFound props are treated as named snippets
├── getActiveSegment(routeName, nodeName, snippets) — finds first matching segment key
└── {#if segment && segmentSnippets[segment]}
    │   {@render (segmentSnippets[segment])()}
    {:else if route.name === UNKNOWN_ROUTE && notFound}
        {@render notFound()}
```

**Named snippets for RouteView:** Unlike React/Preact (element type markers) or Solid (Symbol `$$type` markers), Svelte's `RouteView` uses named snippets passed as rest props. The snippet name must match the route segment name. `notFound` is a reserved prop name for the fallback snippet.

```svelte
<RouteView nodeName="">
  {#snippet users()}
    <UsersPage />
  {/snippet}
  {#snippet settings()}
    <SettingsPage />
  {/snippet}
  {#snippet notFound()}
    <NotFoundPage />
  {/snippet}
</RouteView>
```

## Performance

Svelte's compiler-driven reactivity eliminates most of the optimization work needed in React/Preact:

| Optimization              | React/Preact                        | Svelte                                                                   |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Prevent re-renders        | `memo()` + comparators              | Not needed — Svelte compiles to fine-grained DOM updates                 |
| Stable object references  | `useStableValue` (JSON memoization) | Not needed — `createSubscriber` tracks dependencies, not object identity |
| Stable callbacks          | `useCallback`                       | Not needed — no re-renders                                               |
| Node-scoped subscriptions | `shouldUpdateNode()` filter         | `shouldUpdateNode()` filter (same — in `@real-router/sources`)           |
| Frozen singletons         | `EMPTY_PARAMS`, `EMPTY_OPTIONS`     | Same — avoids allocation for default props                               |
| WeakMap caching           | Per-router selector functions       | Same — in `@real-router/sources`                                         |

The main performance primitive is `createReactiveSource`: it creates a lazy `{ current }` getter that only subscribes when read in a reactive context, and Svelte's scheduler batches DOM updates automatically.

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
    ├──► createRouteSource.subscribe callback → update() notifies Svelte scheduler
    │       └──► RouterProvider reactive.current re-evaluates
    │               └──► ROUTE_KEY context .current getters return new snapshot
    │                       └──► useRoute() consumers re-evaluate (template expressions tracking .current)
    │
    ├──► createRouteNodeSource.subscribe callback → shouldUpdateNode() filter
    │       └──► if node relevant: update() notifies Svelte scheduler
    │               └──► useRouteNode("users") reactive.current re-evaluates
    │                       └──► template expressions tracking route.current re-evaluate
    │
    └──► createActiveRouteSource.subscribe callback → boolean snapshot
            └──► if changed: update() notifies Svelte scheduler
                    └──► Link $derived(finalClassName) re-evaluates → DOM class updates
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

## Stress Test Coverage

29 stress tests across 8 files in `tests/stress/` validate behavior under extreme conditions:

| Category                | Tests (file count) | Test count | What they verify                                                                                                                                                                                |
| ----------------------- | ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle | 1 file             | 3 tests    | useRouteNode/useRoute/Link/createLinkAction × 100 mount/unmount cycles — bounded heap (createSubscriber cleanup); 30 components remount + re-subscribe                                          |
| Subscription fanout     | 1 file             | 4 tests    | 30 useRouteNode on different nodes — $effect fires only when node active; 15 useRoute + 15 useRouteNode('') — all update; 30 useRouteNode('users') — granular scoping; concurrent mount/unmount |
| Link mass rendering     | 1 file             | 4 tests    | 100 Links mount — correct DOM; active class toggle; 50 round-robin navigations; active state after sequential navigations                                                                       |
| Link action             | 1 file             | 4 tests    | 50 createLinkAction elements — a11y attributes (role, tabindex); mount/unmount × 50 cycles — bounded heap (destroy cleanup); click navigation after mass mount; repeated action creation        |
| Deep tree context       | 1 file             | 3 tests    | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; wide tree 25 leaves — all re-render; nested RouterProviders — isolated                                          |
| Transition hook         | 1 file             | 4 tests    | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; 20 consumers — consistent; navigate + cancel × 50 — never stuck                                                  |
| shouldUpdateCache       | 1 file             | 4 tests    | 200 unique node names — cache scales; 100 same-node — cache hit; router stop + GC + new router; 2 routers × 50 nodes — isolated                                                                 |
| Combined SPA            | 1 file             | 3 tests    | 30 Links + 10 useRouteNode consumers + 100 navs; 50 Links + correct final active state; mount/unmount/remount with root consumer                                                                |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (composables table, gotchas, Svelte-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
