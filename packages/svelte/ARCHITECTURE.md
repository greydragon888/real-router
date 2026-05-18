# Architecture

> Svelte 5 bindings for Real-Router with compiler-driven Runes reactivity

## Package Dependencies

```
@real-router/svelte
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, getTransitionSource, createDismissableError)
└── @real-router/route-utils  # Route tree queries (getRouteUtils, getChain, getSiblings)
```

## Two Entry Points

Two entry points via `package.json` `exports` — main + `/ssr` subpath (mirrors `@real-router/react/ssr`). Svelte has no equivalent of React's `<Activity>` API, so no modern/legacy split is needed.

```
@real-router/svelte        →  src/index.ts  →  Client API (Svelte 5.7+)
@real-router/svelte/ssr    →  src/ssr.ts    →  SSR-feature surface (8 exports)
```

**Build output** (`svelte-package` via `@sveltejs/package`):

```
dist/
├── index.js          # ESM (client API barrel)
├── index.d.ts        # Type declarations
├── ssr.js            # ESM (/ssr subpath barrel)
├── ssr.d.ts
├── components/
│   ├── Link.svelte
│   ├── RouteView.svelte
│   ├── Lazy.svelte
│   ├── RouterErrorBoundary.svelte
│   ├── ClientOnly.svelte          # /ssr
│   ├── ServerOnly.svelte          # /ssr
│   ├── Streamed.svelte            # /ssr
│   ├── Await.svelte               # /ssr
│   ├── HttpStatusCode.svelte      # /ssr
│   └── HttpStatusProvider.svelte  # /ssr
├── composables/
│   ├── useRouter.svelte.js
│   ├── useNavigator.svelte.js
│   ├── useRoute.svelte.js
│   ├── useRouteNode.svelte.js
│   ├── useRouteUtils.svelte.js
│   ├── useRouterTransition.svelte.js
│   ├── useIsActiveRoute.svelte.js
│   ├── useRouteExit.svelte.js
│   ├── useRouteEnter.svelte.js
│   └── useDeferred.svelte.js      # /ssr
├── utils/
│   └── createHttpStatusSink.js    # /ssr
└── RouterProvider.svelte
```

Unlike tsdown (which bundles into a single file), `svelte-package` outputs individual files. The consumer's bundler (Vite, Rollup, etc.) handles tree-shaking and final bundling.

## Source Structure

```
src/
├── index.ts                              # Main entry — client API
├── ssr.ts                                # /ssr subpath — 8 SSR-feature exports
├── RouterProvider.svelte                 # Context provider — wires router to Svelte tree
├── context.ts                            # Four string context keys (ROUTER_KEY, NAVIGATOR_KEY, ROUTE_KEY, HTTP_STATUS_KEY — last is internal)
├── constants.ts                          # EMPTY_PARAMS, EMPTY_OPTIONS, EMPTY_ACTIVE_OPTIONS, NOOP (frozen singletons)
├── createReactiveSource.svelte.ts        # Reactive bridge — createSubscriber from svelte/reactivity
├── createRouteContext.svelte.ts          # Helper — builds RouteContext from a reactive source (RouterProvider + useRouteNode)
├── types.ts                              # RouteContext, LinkProps + 6 useRouteExit/Enter types
├── dom-utils/                            # Symlink → ../../shared/dom-utils
│                                         # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName,
│                                         # applyLinkA11y, shallowEqual, createRouteAnnouncer,
│                                         # createScrollRestoration, createViewTransitions, createDirectionTracker
├── utils/
│   └── createHttpStatusSink.ts           # /ssr — fresh { code: undefined } sink per request
├── composables/
│   ├── useRouter.svelte.ts               # Router instance from getContext (never reactive)
│   ├── useNavigator.svelte.ts            # Navigator from getContext (never reactive)
│   ├── useRoute.svelte.ts                # Full route context from getContext (every navigation, throws if no active state)
│   ├── useRouteNode.svelte.ts            # Node-scoped subscription via createReactiveSource
│   ├── useIsActiveRoute.svelte.ts        # Active state subscription (internal — used by Link)
│   ├── useRouteUtils.svelte.ts
│   ├── useRouterTransition.svelte.ts
│   ├── useRouteExit.svelte.ts            # Wrap subscribeLeave with abort + same-route guards (handler captured at init)
│   ├── useRouteEnter.svelte.ts           # Fire on nav-driven mount via $effect + route.transition.from
│   └── useDeferred.svelte.ts             # /ssr — reads state.context.ssrDataDeferred[key]
├── actions/
│   └── link.svelte.ts                    # createLinkAction factory (use:link directive)
└── components/                           # 10 total (4 client + 6 SSR)
    ├── Link.svelte                       # Navigation link with $derived href/class, active state
    ├── RouteView.svelte                  # Declarative route matching via named snippets
    ├── Lazy.svelte                       # Lazy-loaded route content with fallback
    ├── RouterErrorBoundary.svelte        # Declarative navigation error handling
    ├── ClientOnly.svelte                 # /ssr — server fallback → client children swap
    ├── ServerOnly.svelte                 # /ssr — symmetric inverse of ClientOnly
    ├── Streamed.svelte                   # /ssr — alias for {#await} block
    ├── Await.svelte                      # /ssr — reads useDeferred(name) via {#await}
    ├── HttpStatusCode.svelte             # /ssr — writes sink.code at component init
    └── HttpStatusProvider.svelte         # /ssr — provides HttpStatusSink via setContext
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
| Params stabilization        | `canonicalJson` in sources        | `canonicalJson` in sources                       | `canonicalJson` in sources                          | `canonicalJson` in sources                |
| Active class on Link        | `className` string concat         | `class` string concat                            | `classList` object                                  | `class:` directive / string concat        |
| `keepAlive` / Activity      | React 19.2+                       | Vue native `<KeepAlive>`                         | Not available                                       | Not available                             |
| Context mechanism           | `createContext` + Provider        | `provide` / `inject` + `InjectionKey`            | `createContext` + Provider                          | `setContext` / `getContext` + string keys |
| Context count               | 2 (React), 3 (Preact)             | 3                                                | 2                                                   | 3                                         |
| Components                  | JSX (.tsx)                        | `defineComponent` + `h()` (.ts)                  | JSX (.tsx)                                          | `.svelte` SFC                             |
| Composable files            | .tsx                              | .ts                                              | .tsx                                                | `.svelte.ts`                              |
| Build tool                  | tsdown                            | tsdown                                           | rollup + babel-preset-solid                         | svelte-package                            |
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
useRouteNode(name)      — cached createRouteNodeSource(router, name)     → { navigator, route: { current }, previousRoute: { current } }
useRouterTransition()   — cached getTransitionSource(router)             → { current: RouterTransitionSnapshot }
useIsActiveRoute(...)   — cached createActiveRouteSource(router, ...)    → { current: boolean }
RouterErrorBoundary     — cached createDismissableError(router)          → { current: DismissableErrorSnapshot }
RouterProvider          — createRouteSource(router)                      → updates route/previousRoute .current getters
```

All source caches live in `@real-router/sources` — no local WeakMaps in this adapter.

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
├── createReactiveSource(createDismissableError(router)) — shared per-router source
│     (integrated dismissedVersion + resetError — no local state)
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

| Optimization              | React/Preact                              | Svelte                                                                   |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Prevent re-renders        | `memo()` + comparators                    | Not needed — Svelte compiles to fine-grained DOM updates                 |
| Stable object references  | `canonicalJson` in sources                | Same — in `@real-router/sources`                                         |
| Stable callbacks          | `useCallback`                             | Not needed — no re-renders                                               |
| Node-scoped subscriptions | Cached `createRouteNodeSource`            | Same — in `@real-router/sources`                                         |
| Shared eager sources      | `getTransitionSource` / `createDismissableError` | Same — in `@real-router/sources`                                  |
| Frozen singletons         | `EMPTY_PARAMS`, `EMPTY_OPTIONS`           | Same — avoids allocation for default props                               |

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

77 stress tests across 24 files in `tests/stress/` validate behavior under extreme conditions:

| Category                | Tests (file count) | Test count | What they verify                                                                                                                                                                                |
| ----------------------- | ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle | 1 file             | 3 tests    | useRouteNode/useRoute/Link/createLinkAction × 100 mount/unmount cycles — bounded heap (createSubscriber cleanup); 30 components remount + re-subscribe                                          |
| Subscription fanout     | 1 file             | 4 tests    | 30 useRouteNode on different nodes — $effect fires only when node active; 15 useRoute + 15 useRouteNode('') — all update; 30 useRouteNode('users') — granular scoping; concurrent mount/unmount |
| Link mass rendering     | 1 file             | 4 tests    | 100 Links mount — correct DOM; active class toggle; 50 round-robin navigations; active state after sequential navigations                                                                       |
| Link action             | 1 file             | 4 tests    | 50 createLinkAction elements — a11y attributes (role, tabindex); mount/unmount × 50 cycles — bounded heap (destroy cleanup); click navigation after mass mount; repeated action creation        |
| Deep tree context       | 1 file             | 3 tests    | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; nested RouterProviders — isolated                                                                               |
| Transition hook         | 1 file             | 4 tests    | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; 20 consumers — consistent; navigate + cancel × 50 — never stuck                                                  |
| shouldUpdateCache       | 1 file             | 4 tests    | 200 unique node names — cache scales; 100 same-node — cache hit; router stop + GC + new router; 2 routers × 50 nodes — isolated                                                                 |
| Combined SPA            | 1 file             | 3 tests    | 30 Links + 10 useRouteNode consumers + 100 navs; 50 Links + correct final active state; mount/unmount/remount with root consumer                                                                |
| Lazy loading            | 1 file             | 3 tests    | 30 Lazy components mount + immediate unmount before loader resolves — discarded results, no setState-after-unmount; 100 mount/unmount cycles — bounded heap; many concurrent loads all reach `ready` |
| RouterErrorBoundary     | 1 file             | 3 tests    | 50 trigger→recover cycles with throwing onError — boundary stays alive, every throw caught and logged via console.error; 200 mount/unmount cycles — bounded heap; throwing onError doesn't break later reactivity |
| Teardown race           | 1 file             | 2 tests    | Click 100 Links and immediately unmount — no unhandled promise rejections; 50 mount→click→unmount iterations — `.catch(noop)` keeps the loop clean                                              |
| Long-run leak           | 1 file             | 3 tests    | 5K navigations with 20 consumers — bounded heap after warmup; 10K-with-checkpoints (5K + 10K) — linear marginal growth (no super-linear accumulator); 10K createReactiveSource read cycles — listener count stays zero (lazy contract) |
| Start/stop churn        | 1 file             | 3+ tests   | 1000 mount/unmount cycles for RouterProvider without leaks — covers leave-listener leak audit (#1)                                                                                              |
| Memory mount/unmount    | 1 file             | 2 tests    | Dedicated heap-stability matrix — bounded heap after N cycles for each public composable                                                                                                        |
| Concurrent guards race  | 1 file             | 5+ tests   | Async guards of varying durations fired concurrently — last-wins semantics, no orphan effects                                                                                                   |
| Route removed mid-session | 1 file           | 2 tests    | Single + 100-cycle: removing the active route during a session does not leave dangling subscriptions                                                                                            |
| replaceHistoryState during transition | 1 file | 3 tests    | `replaceHistoryState` called mid-transition — state coherent, no listener desync                                                                                                                |
| Router switch           | 1 file             | 2 tests    | 200 router instance swaps via RouterProvider remount — context cache rebuilds correctly                                                                                                         |
| Announce navigation     | 1 file             | 2+ tests   | aria-live route announcer under rapid navigation — single announcer DOM node, no orphaned attributes                                                                                            |
| Concurrent force-clicks | 1 file             | 4 tests    | 100 same-Link force-clicks — last-wins; 50 mount/click/unmount cycles; 30 alternating between Links; **100 concurrent clicks to 100 different Links** — FSM cancels 99 pending, no stuck transitions |
| Scroll restoration rapid | 1 file            | 3 tests    | 100 rapid navs with mode="restore" — bounded heap, history.scrollRestoration stable; 50 mount/unmount cycles; sessionStorage stays bounded under 100 distinct routes                            |
| Scroll restoration history-nav | 1 file      | 2 tests    | **50 history.back/forward cycles** — bounded heap, history.scrollRestoration stays "manual" (popstate path); 20-burst back/forward bursts without settle — RouterProvider stays stable          |
| useRouteEnter/useRouteExit | 1 file          | 2+ tests   | Unmount during guard execution — abort signal fires, no callback after unmount                                                                                                                  |
| View transitions stop   | 1 file             | 2+ tests   | `createViewTransitions` cleanup on router stop — no leftover listeners, mode flips back to default                                                                                              |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (composables table, gotchas, Svelte-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
