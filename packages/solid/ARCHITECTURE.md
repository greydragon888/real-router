# Architecture

> Solid.js bindings for Real-Router with fine-grained signal-based reactivity

## Package Dependencies

```
@real-router/solid
├── @real-router/core         # Router instance, Navigator, State types
├── @real-router/sources      # Subscription layer (createRouteSource, createRouteNodeSource, createActiveRouteSource, getTransitionSource, createDismissableError)
└── @real-router/route-utils  # Route tree queries: `getRouteUtils(router)` returns a `RouteUtils` instance whose methods (`getChain`, `getSiblings`, …) walk the route tree
```

## Entry Points

Two subpath exports — the main client-only entry plus a dedicated `/ssr` subpath that bundles the server-render boundary components and deferred-data helpers. No modern/legacy split (Solid has no equivalent of React's `<Activity>` API).

```
@real-router/solid       →  src/index.tsx  →  Client API (RouterProvider, Link, RouteView, hooks…)
@real-router/solid/ssr   →  src/ssr.tsx    →  SSR-feature surface: ClientOnly/ServerOnly/Streamed/Await,
                                              useDeferred, HttpStatusCode/HttpStatusProvider,
                                              createHttpStatusSink
```

**Why split `/ssr`?** Type isolation — server-only prop types stay out of the client TS context for apps that don't render on the server. DX clarity — `from "@real-router/solid/ssr"` self-documents SSR intent. Bundle cost is ≈ 0 (`"sideEffects": false` + tree-shaking).

**Build output** (rollup + babel-preset-solid, dual-entry):

```
dist/
├── esm/
│   ├── index.mjs
│   ├── index.d.mts
│   ├── ssr.mjs
│   └── ssr.d.mts
└── cjs/
    ├── index.js
    ├── index.d.ts
    ├── ssr.js
    └── ssr.d.ts
```

## Source Structure

```
src/
├── index.tsx                   # Main entry — client API
├── ssr.tsx                     # /ssr subpath — server-render boundary components, deferred-data hooks, HTTP status sink
├── RouterProvider.tsx          # Context provider — wires router to Solid tree
├── context.ts                  # Two Solid contexts (RouterContext, RouteContext)
├── types.ts                    # RouteState, LinkProps
├── constants.ts                # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── dom-utils/                  # Symlink → shared/dom-utils/ (see root CLAUDE.md)
│   ├── link-utils.ts           # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName, applyLinkA11y, shallowEqual
│   ├── route-announcer.ts      # createRouteAnnouncer (a11y aria-live region)
│   ├── scroll-restore.ts       # createScrollRestoration (opt-in scroll capture + restore)
│   ├── view-transitions.ts     # createViewTransitions (opt-in View Transitions API integration)
│   ├── direction-tracker.ts    # createDirectionTracker (back/forward annotation)
│   └── index.ts                # barrel
├── utils/
│   ├── createHttpStatusSink.ts # /ssr — fresh { code: undefined } sink per request
│   └── createMountedSignal.ts  # createSignal(false) + onMount(true) — drives ClientOnly/ServerOnly
├── createSignalFromSource.ts   # Signal bridge — converts RouterSource to Solid Accessor
├── createStoreFromSource.ts    # Store bridge — converts RouterSource to Solid store (reconcile)
├── directives/
│   └── link.tsx                # use:link directive + JSX.Directives augmentation (shipped to consumers, #976)
├── hooks/
│   ├── useRouter.tsx           # Router + Navigator from context (never reactive)
│   ├── useNavigator.tsx        # Navigator from context (never reactive)
│   ├── useRoute.tsx            # Full route state Accessor from context (every navigation)
│   ├── useRouteNode.tsx        # Node-scoped subscription (cached createRouteNodeSource from sources)
│   ├── useRouteNodeStore.tsx   # Same cached node source, store-based
│   ├── useRouteStore.tsx       # Full route state as store (reconcile)
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never reactive)
│   ├── useRouterTransition.tsx # Transition lifecycle (cached getTransitionSource)
│   ├── useRouteExit.tsx        # Wrap subscribeLeave with abort + same-route guards (handler captured at hook call)
│   ├── useRouteEnter.tsx       # Fire on nav-driven mount via useRoute() accessor + route.transition.from
│   └── useDeferred.tsx         # /ssr — reads state.context.ssrDataDeferred[key] (ssr-data-plugin)
└── components/
    ├── Link.tsx                # Reactive link with classList-based active state
    ├── RouterErrorBoundary.tsx # Declarative navigation error handling
    ├── ClientOnly.tsx          # /ssr — createSignal(false) + onMount + <Show>; server emits fallback, client swaps to children after mount
    ├── ServerOnly.tsx          # /ssr — symmetric inverse of ClientOnly
    ├── Streamed.tsx            # /ssr — cross-adapter <Suspense> alias
    ├── Await.tsx               # /ssr — createResource over a deferred promise (pairs with defer() from ssr-data-plugin)
    ├── HttpStatusCode.tsx      # /ssr — writes code into the nearest sink during render
    ├── HttpStatusProvider.tsx  # /ssr — provides HttpStatusSink via Solid context
    └── RouteView/              # Declarative route matching (no keepAlive)
        ├── index.ts            # Barrel re-exports
        ├── RouteView.tsx       # RouteViewRoot + compound export (RouteView.Match, RouteView.Self, RouteView.NotFound)
        ├── types.ts            # RouteViewProps, MatchProps, SelfProps, NotFoundProps
        ├── components.tsx      # Match, Self, NotFound marker objects with Symbol-based type system
        └── helpers.tsx         # collectElements, buildRenderList (Match first-wins, Self/NotFound appended), isSegmentMatch
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
| Params stabilization        | `canonicalJson` in sources         | `canonicalJson` in sources                 | `canonicalJson` in sources                              |
| Active class on Link        | `className` string concat          | `className` string concat                  | `classList` object                                      |
| `keepAlive` / Activity      | React 19.2+                        | Not available                              | Not available                                           |
| Entry points                | Main + Legacy + /ssr (+ /ink, RSC) | Single                                     | Main + /ssr                                             |
| Build tool                  | tsdown                             | tsdown                                     | rollup + babel-preset-solid                             |
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
├── RouterContext.Provider     value={{ router, navigator, routeSelector }}  # Stable — never changes
│   └── RouteContext.Provider  value={routeSignal}                           # Reactive Accessor — updates on navigation
│       └── {children}
```

**Why two contexts, not three:**

Solid's fine-grained reactivity makes a separate `NavigatorContext` unnecessary. The navigator is a stable value derived from the router at provider initialization — it doesn't need its own context because reading it never triggers reactive tracking. Both `router` and `navigator` live together in `RouterContext` as a plain object, along with `routeSelector` — a `createSelector`-backed predicate that powers Link's fast-path (O(1) active-route detection).

| Context         | Value                                                                                | Reactive?                                                                                       | Consumers                                                                               |
| --------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `RouterContext` | `{ router: Router, navigator: Navigator, routeSelector: (name: string) => boolean }` | No — stable object reference; `routeSelector` internally tracks reactively via `createSelector` | `useRouter`, `useNavigator`, `useRouteUtils`, `useRouterTransition`, `Link` (fast path) |
| `RouteContext`  | `Accessor<RouteState>`                                                               | Yes — signal updates on navigation                                                              | `useRoute`                                                                              |

## Subscription Patterns

### Context-Based (via `useContext()`)

```
useRoute()      — reads RouteContext → returns Accessor<RouteState>, reactive on every navigation
useRouter()     — reads RouterContext → returns Router, never reactive
useNavigator()  — reads RouterContext → returns Navigator, never reactive
```

### Signal-Based (via createSignalFromSource)

```
useRouteNode(name)            — cached createRouteNodeSource(router, name)   → Accessor<RouteState>
useRouteNodeStore(name)       — cached createRouteNodeSource(router, name)   → Store<RouteState>
useRouterTransition()         — cached getTransitionSource(router)           → Accessor<RouterTransitionSnapshot>
RouterErrorBoundary           — cached createDismissableError(router)        → Accessor<DismissableErrorSnapshot>
Link (slow path, internal)    — cached createActiveRouteSource(router, ...)  → Accessor<boolean>
RouterProvider                — createRouteSource(router)                    → Accessor<RouteState>
```

### Per-Router Source Cache (in @real-router/sources)

All caches live inside `@real-router/sources` — no local WeakMaps in this adapter. N consumers of `useRouteNode("users")` on the same router share ONE source — one router subscription, not N.

| Hook / Component          | Source factory                                         | Cache key                                                        |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `useRoute()`              | `createRouteSource(router)`                            | `(router)` — shared root snapshot                                |
| `useRouteStore()`         | `createRouteSource(router)`                            | `(router)` — same shared root, wrapped via store bridge          |
| `useRouteNode(name)`      | `createRouteNodeSource(router, nodeName)`              | `(router, nodeName)`                                             |
| `useRouteNodeStore(name)` | `createRouteNodeSource(router, nodeName)`              | `(router, nodeName)`                                             |
| `useRouterTransition()`   | `getTransitionSource(router)`                          | `(router)`                                                       |
| `RouterErrorBoundary`     | `createDismissableError(router)`                       | `(router)` — integrated dismissal state                          |
| Link (slow path)          | `createActiveRouteSource(router, name, params, search, opts)`  | `(router, name, canonicalJson(params), canonicalJson(search), strict, ignoreQueryParams)` — key-order-insensitive |

Routers are WeakMap keys, so per-router state is released automatically when the router is GC'd — no explicit teardown needed. Lazy sources disconnect from the router when their last listener unsubscribes; upon re-subscription, they reconcile their snapshot so signals never observe stale values (enforced by `createSignalFromSource` re-reading `getSnapshot()` after subscribe).

## Component Architecture

```
Link (no memo — Solid components run once)
├── useRouter() — router + navigator from context
├── createSignalFromSource(createActiveRouteSource(...)) — reactive active state
├── createMemo(() => router.buildUrl() || router.buildPath()) — reactive href
├── createMemo(() => ...) — reactive class via classList pattern
└── onClick → router.navigate(...).catch(() => {})

RouterErrorBoundary
├── createSignalFromSource(createDismissableError(router)) — shared per-router source
│     (integrated dismissedVersion + resetError — no local state)
├── onErrorRef — for callback stability (avoids closure churn)
└── Renders: children + fallback(error, resetError) via Fragment
```

**No `memo()` needed:** Solid components are functions that run exactly once. The reactive graph tracks signal dependencies automatically. `createMemo` is used for derived values (href, class), not for preventing re-renders.

**`classList` for active state:** Solid's `classList` prop accepts `{ [className]: boolean }` and updates the DOM attribute directly without string concatenation.

**RouteView.Match with `fallback`:** When `fallback` prop is provided, `Match` wraps its children in a `<Suspense>` boundary (from `solid-js`) with that fallback. Use this with `lazy()` from `solid-js` to code-split route components. `RouteView.Self` accepts the same optional `fallback` prop with identical Suspense semantics.

**RouteView marker objects:** `Match`, `Self`, and `NotFound` are not real JSX elements — they return plain objects with a `$$type` Symbol property. `RouteView` uses `children()` from `solid-js` to resolve the child accessor, then `collectElements` walks the result and checks `$$type` to identify markers. This avoids React-style element type checking (`element.type === Match`) which doesn't work in Solid.

**Precedence inside `buildRenderList`:** `<Match>` first-wins (duplicate segments short-circuit via `processMatch.alreadyActive`). `<Self>` fires only when the active route name equals the parent's `nodeName` **exactly** and no `<Match>` activated; only the first `<Self>` contributes. `<NotFound>` fires only when the active route is `UNKNOWN_ROUTE` and no `<Match>` activated; `<Self>` wins over `<NotFound>` in the narrow edge case where both would fire (`nodeName === UNKNOWN_ROUTE`).

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

| Optimization              | React/Preact                                  | Solid                                                          |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Prevent re-renders        | `memo()` + comparators                        | Not needed — components run once                               |
| Stable object references  | `canonicalJson` in sources (params)           | Same — in `@real-router/sources`                               |
| Stable callbacks          | `useCallback`                                 | Not needed — closures are stable                               |
| Node-scoped subscriptions | `shouldUpdateNode()` filter                   | Same — in `@real-router/sources`                               |
| Shared source cache       | Cached factories (per-router)                 | Same — in `@real-router/sources`                               |
| Frozen singletons         | `EMPTY_PARAMS`, `EMPTY_OPTIONS`               | Same — avoids allocation for default props                     |

The main performance primitive is `createSignalFromSource`: it creates a signal that only updates when the underlying source emits, and Solid's scheduler batches DOM updates automatically.

### O(1) Active Route Detection

`RouterProvider` creates a `createSelector` based on the current route name with prefix-based matching. `Link` components use this shared selector instead of per-link subscriptions. On navigation, `createSelector` notifies only the previously-active and newly-active links (2 updates instead of n).

Links with `activeStrict: true`, custom `routeParams`, a `routeSearch` value, a `to` descriptor, or `ignoreQueryParams: false` fall back to per-link `createActiveRouteSource` subscriptions since the selector only handles the default case (non-strict prefix matching, no params/search comparison).

### Store-Based Granular Route State

`useRouteStore()` and `useRouteNodeStore()` use `createStore` + `reconcile` from `solid-js/store` instead of `createSignal`. This enables property-level reactivity — a component reading `state.route?.params.id` won't re-run when `state.route?.search.page` changes (granularity holds across the path/query channels, not just within one).

```tsx
const state = useRouteStore();

createEffect(() => {
  // Only re-runs when params.id changes, ignores search.page/route.name/etc.
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

34 stress-test files in `tests/stress/` (excluding `helpers.tsx`) validate behavior under extreme conditions. The 13 categories below describe the original coverage; subsequent audit rounds (2026-05-16 + 2026-05-17 P0→Sprint A) added the following single-purpose files — refer to `ls packages/solid/tests/stress/` for the live set, or to the descriptions below:

- `link-hash-rapid` — 200 hash-only clicks + 150 setSignal-driven flips + 100 `<Show keyed>` flips
- `link-modifier-keys` — 100 links × 6 modifier types × 100 clicks
- `link-slow-path` — 150 navs with reactive parent routeName on slow path + 200 links × 1000 navs
- `link-force-clicks` — 300 same-route force clicks + 200 cross-route force clicks
- `lazy-switching` — N switches between lazy() components; **8.3** (Sprint A.4 add) 50 rapid switches with pending chunks
- `lazy-source-reconnect` — 150 mount→unmount→remount on cached lazy source (G1)
- `route-enter-exit` — 150 cross-route enter/exit + 100 same-route skip + 100 mount/unmount
- `view-transitions-stop` — 100 mount + nav + stop cycles with stubbed VT; **V1.2** (Sprint A) 100 rapid VT burst (subscribeLeave count stable)
- `should-update-cache` — 200 unique useRouteNode + 100 same nodeName + 2 routers isolation
- `remove-route-mid-session` — 200 traverse-style navs to removed route (#4)
- `replace-history-during-transition` — 11.1/11.2 + **11.3** (Sprint A) 100 replaceHistoryState burst during pending transition
- `error-boundary-auto-reset` — 100 error→success cycles + 50 zombie-effect protection
- `create-root-ownership` — 1000 createRoot/dispose cycles with signal+store bridge
- `announcer-double-raf` — 1000 navs + 500 sync-rAF navs (a11y under rAF backlog)
- `announcer-rapid` — 200 navs inside Safari-ready 100ms window (queue overwrite)
- `async-guards-race` — fast vs slow guard + 20 concurrent; **10.3** (Sprint A) real wall-clock timers (1ms/100ms/500ms)
- `multiple-providers` — 2 sibling providers on 1 router (G18)
- `use-route-throws` — 100 cycles render-after-stop
- `use-deferred-race` — navigate ↔ Await resolve race (50 cycles + stale resolves)
- `memory-mount-unmount` — useRouterTransition × 1000 + useRouteNode × 100 × 10 × 50 navs
- `mount-unmount-lifecycle` — R10 (50 start/stop cycles) + **R10b** (Sprint A.4) 200 start/stop cycles with per-half drift baseline
- `subscription-fanout` — 30/50 useRouteNode + 100 navs
- `transition-hook-stress` — 50 navs with async guard + 50 concurrent
- `scroll-restoration-rapid` — 200 rapid navs + S2 documented leak; **S3** (Sprint A.4) 50 rapid alternating popstate-like navs
- `navigate-during-teardown` — T1 + **T1.2** (Sprint A) 100 mount + nav + unmount cycles
- `navigate-long-lived-subscription` — 10000 navs on stable subscribers (L1)
- `navigate-memory-leak` — 10000 Link mount/unmount cycles (M1, slow path)
- `factory-reuse` — 100 router instances + 1000 cache-only cycles (F1)
- `hmr-router-swap` (P1 add) — 200 router prop swaps via `<Show keyed>` + 50 swaps with active navigation

| Category                 | Tests (file count) | Test count | What they verify                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount/unmount lifecycle  | 1 file             | 8 tests    | useRouteNode/useRoute/Link/useRouterTransition × 200 mount/unmount cycles — bounded heap; 50 components remount + re-subscribe; conditional toggle × 100 with onCleanup tracking; router stop/restart; **R10 — 50 start/stop cycles without navigations — subscriptions released (S1)** |
| Subscription fanout      | 1 file             | 5 tests    | 30 useRouteNode on different nodes — signals track correctly; 20 useRoute + 30 useRouteNode('') — all update; 50 useRouteNode('users') — granular scoping; concurrent mount/unmount; cleanup on unmount (50 onCleanup calls)                                                            |
| Link mass rendering      | 1 file             | 5 tests    | 200 Links mount — no render loops; active class toggle; 50 round-robin navigations; deep routeParams; 50 rapid clicks; dynamic routeName × 100                                                                                                                                          |
| Link directive           | 1 file             | 3 tests    | 100 use:link elements — a11y attributes (role, tabindex); mount/unmount × 50 cycles — bounded heap + onCleanup fires; activeClassName toggle; click navigation; 50 rapid clicks; `<a>` href + no a11y override                                                                          |
| Store granularity        | 1 file             | 5 tests    | useRouteStore — route.name effect fires only on name changes; route.params.id — only on id changes; useRouteNodeStore — scoped + granular; 20 consumers tracking different properties; 10 nodes × 50 navs — isolated                                                                    |
| Deep tree context        | 1 file             | 4 tests    | 30-deep useRouteNode — only relevant nodes re-render; useRouter — 0 re-renders; wide tree 25 leaves — all re-render; nested RouterProviders — isolated                                                                                                                                  |
| Transition hook          | 1 file             | 4 tests    | 50 async guard cycles — isTransitioning true→false; 50 concurrent — last wins; 20 consumers — consistent; navigate + cancel × 50 — never stuck                                                                                                                                          |
| Combined SPA             | 1 file             | 4 tests    | Full app with RouteView + Links + useRouteNode + 200 navs; transition progress; remount after unmount; RouteView match correctness × 100                                                                                                                                                |
| Cache growth             | 1 file             | 4 tests    | 200 unique `useRouteNode(name)` — all fire effects, no crash; same nodeName × 100 components — cache hit, consistent signal state; router stop + GC → new router works; 2 routers × 50 nodeNames — isolated caches, no cross-talk                                                       |
| Navigate during teardown | 1 file             | 1 test     | **T1 (S2)** — navigate fires during component unmount — no zombie setState warnings                                                                                                                                                                                                     |
| Navigate memory leak     | 1 file             | 1 test     | **M1 (S3)** — 10000 mount/unmount Link cycles (slow path) — bounded heap (< 100 MB growth)                                                                                                                                                                                              |
| Factory reuse            | 1 file             | 1 test     | **F1 (S4)** — 100 router instances × mount → unmount → stop — heap stable (< 50 MB growth, WeakMap cache entries GC-collected)                                                                                                                                                          |
| Long-lived subscription  | 1 file             | 1 test     | **L1** — 10000 `router.navigate()` on a single mounted `useRoute`/`useRouteNode` pair — every root effect fires, `users` node stays silent, bounded heap (< 50 MB) — probes that router-internal listener arrays don't grow per-navigation                                              |

## See Also

- [CLAUDE.md](CLAUDE.md) — Quick reference for AI agents (hooks table, gotchas, Solid-specific patterns)
- [Root ARCHITECTURE.md](../../ARCHITECTURE.md) — Monorepo-level architecture
