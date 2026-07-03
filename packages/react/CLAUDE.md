# @real-router/react

> React bindings with optimal re-render strategies

## Entry Points (Subpath Exports)

Six entry points via `package.json` `exports` — five named subpaths plus a `react-server` condition on the root and `/ssr` exports:

| Entry Point | Import Path                                           | React Version        | Runtime         | Description                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------- | -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main        | `@real-router/react`                                  | React 19.2+          | DOM             | Full client API including `RouteView` with `keepAlive` (React Activity). **No SSR-feature components** — those live at `/ssr`                                                                                |
| SSR         | `@real-router/react/ssr`                              | React 19.2+          | DOM (SSR-aware) | `<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `useDeferred`, `<HttpStatusCode>`, `<HttpStatusProvider>`, `createHttpStatusSink` — all components/hooks/utils that participate in the SSR pipeline |
| Legacy      | `@real-router/react/legacy`                           | React 18+            | DOM             | Client API for React 18 (no `RouteView`, no SSR helpers)                                                                                                                                                     |
| Legacy SSR  | `@real-router/react/legacy/ssr`                       | React 18+            | DOM (SSR-aware) | SSR-feature subset for React 18 — same as `/ssr` minus `<Await>` (which depends on React 19's `use(promise)`); includes `<HttpStatusCode>` + `<HttpStatusProvider>` + `createHttpStatusSink`                 |
| Ink         | `@real-router/react/ink`                              | React 19.2+ & Ink 7+ | Terminal        | Hooks + `InkRouterProvider` + `InkLink`; no `Link`, no `RouteView`, no `announceNavigation`                                                                                                                  |
| RSC         | `@real-router/react` (under `react-server` condition) | React 19+            | RSC bundler     | **Type-only re-exports** — no client runtime in Server Component bundles. The `/ssr` subpath also resolves to a type-only entry under the same condition                                                     |

```tsx
// React 19.2+ (default — client API)
import { RouterProvider, useRouteNode, Link } from "@real-router/react";

// React 19.2+ — SSR-feature components/hooks
import {
  ClientOnly,
  ServerOnly,
  Await,
  Streamed,
  useDeferred,
} from "@real-router/react/ssr";

// React 18+ — client API
import { RouterProvider, useRouteNode, Link } from "@real-router/react/legacy";

// React 18+ — SSR-feature subset (no <Await>)
import {
  ClientOnly,
  ServerOnly,
  Streamed,
  useDeferred,
} from "@real-router/react/legacy/ssr";

// Terminal UIs via Ink v7+
import {
  InkRouterProvider,
  useRouteNode,
  InkLink,
} from "@real-router/react/ink";

// Server Component (types only — same import path under `react-server` condition)
import type { Navigator, LinkProps } from "@real-router/react";
import type { AwaitProps, StreamedProps } from "@real-router/react/ssr";
```

### Why split `/ssr`?

Trigger reached at #610 (defer + Await + Streamed + useDeferred = 5 SSR-feature exports, ≥3 was the threshold from `.claude/SSR_FEATURE_GAPS_RU.md` §8). Benefits:

- **Type isolation** — server-only prop types don't leak into the client TypeScript context for app code that doesn't touch SSR
- **DX clarity** — `import {…} from '@real-router/react/ssr'` self-documents SSR intent
- **`react-server` condition composition** — `/ssr` has its own type-only RSC entry, so Server Components can import the prop types without pulling client runtime
- **Future-proofing** — when adapter-specific server-render utilities or `<HttpStatusCode>` ship, they slot into `/ssr` without re-shaping the main entry

Bundle cost is ≈ 0 thanks to `"sideEffects": false` + tree-shaking — the split is about API surface design, not bytes.

### `react-server` condition entry — what's exposed

Server Components can import **types only** from `@real-router/react`. Hooks, components, and `RouterProvider` are client-only and intentionally excluded from the `react-server` resolution. Re-exported types:

- DOM types: `LinkProps`
- Hook option/handler types: `UseRouteExitOptions` / `RouteExitContext` / `RouteExitHandler`, `UseRouteEnterOptions` / `RouteEnterContext` / `RouteEnterHandler`
- Component prop types: `RouteViewProps` / `RouteViewMatchProps` / `RouteViewSelfProps` / `RouteViewNotFoundProps`, `RouterErrorBoundaryProps`
- Re-exported from peers: `Navigator` (from `@real-router/core`), `RouterTransitionSnapshot` (from `@real-router/sources`)

Implemented in `src/index.react-server.ts`. Mirrors the thin re-export pattern from [TanStack Router PR #7183](https://github.com/TanStack/router/pull/7183) and `react-router@7.x`. Future server-safe utilities (pure functions without React state) can be added here without breaking the contract. Runtime behavior on Server Component import: empty module — bundler can tree-shake the import statement entirely. **Per-request data fetching uses `@real-router/rsc-server-plugin`** (Variant B `state.context.rsc: ReactNode`), not this entry. See [RSC Integration wiki guide](https://github.com/greydragon888/real-router/wiki/RSC-Integration).

**Architecture:** Flat structure. All shared code lives in `src/`. The `modern/` subfolder holds React 19.2-only components using `<Activity>` API. Entry points are pure re-export files — no duplicated logic.

**Current state:** Hooks use `useContext` and RouterProvider uses `<Context.Provider value>` — React 18-compatible APIs. Both entry points share hooks and `Link`; `/legacy` excludes `RouteView` (which uses React 19.2's `<Activity>` for `keepAlive`).

### Source Structure

```
src/
├── hooks/                          # Shared hooks (main + /legacy)
│   ├── useRouter.tsx
│   ├── useRoute.tsx                # Returns RouteHookResult<P> — route is non-nullable
│   ├── useNavigator.tsx
│   ├── useRouteNode.tsx            # Uses cached createRouteNodeSource from @real-router/sources
│   ├── useIsActiveRoute.tsx        # Uses cached createActiveRouteSource, useMemo-wrapped
│   ├── useRouteUtils.tsx
│   ├── useRouterTransition.tsx     # Uses cached getTransitionSource
│   ├── useRouteEnter.tsx           # Mount-side window: reentrant abort, same-route skip, latest-ref, StrictMode dedupe
│   ├── useRouteExit.tsx            # subscribeLeave wrapper: same guards, handler may return Promise
│   └── useDeferred.tsx             # /ssr — reads state.context.ssrDataDeferred[key] (ssr-data-plugin)
├── components/                     # Shared components
│   ├── Link.tsx                    # memo + areLinkPropsEqual; inline onClick (no useCallback)
│   ├── InkLink.tsx                 # /ink — focusable text link via useFocus + useInput
│   ├── InkRouterProvider.tsx       # /ink — composes RouterProviderCore only (DOM-free, #800)
│   ├── RouterErrorBoundary.tsx     # Declarative navigation error handling
│   ├── ClientOnly.tsx              # /ssr — server fallback → client children swap after mount
│   ├── ServerOnly.tsx              # /ssr — symmetric inverse of ClientOnly
│   ├── Streamed.tsx                # /ssr — cross-adapter <Suspense> alias
│   ├── Await.tsx                   # /ssr — React 19.2+ <Await name="key">{(v) => …}</Await>
│   ├── HttpStatusCode.tsx          # /ssr — render-time HTTP status (sink write)
│   ├── HttpStatusProvider.tsx      # /ssr — provides HttpStatusSink via React context
│   └── modern/
│       └── RouteView/              # React 19.2-only, RouteView + keepAlive via Activity
│           ├── index.ts            # Barrel re-exports
│           ├── RouteView.tsx       # RouteViewRoot + compound export (.Match, .Self, .NotFound)
│           ├── types.ts            # RouteViewProps, MatchProps, SelfProps, NotFoundProps
│           ├── components.tsx      # Match, Self, NotFound marker components
│           └── helpers.tsx         # collectElements (Children.forEach), buildRenderList, isSegmentMatch, processMatch
├── dom-utils/                      # Shared DOM helpers (symlink → shared/dom-utils/)
│   ├── link-utils.ts               # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName, applyLinkA11y, shallowEqual
│   ├── route-announcer.ts          # createRouteAnnouncer (WCAG aria-live, double-rAF state machine)
│   ├── scroll-restore.ts           # createScrollRestoration (opt-in scroll capture + restore)
│   ├── scroll-spy.ts               # createScrollSpy (IntersectionObserver → URL hash, #575)
│   ├── view-transitions.ts         # createViewTransitions (subscribeLeave-based VT integration)
│   ├── direction-tracker.ts        # createDirectionTracker (back/forward annotation)
│   └── index.ts
├── utils/
│   └── createHttpStatusSink.ts     # /ssr — fresh { code: undefined } sink per request
├── RouterProviderCore.tsx          # DOM-free core: contexts + useSyncExternalStore wiring (#800)
├── RouterProvider.tsx              # DOM-aware wrapper over the core (announcer / scroll / VT effects)
├── context.ts                      # RouterContext, RouteContext, NavigatorContext (createContext<T | null>)
├── types.ts                        # RouteState, RouteContext, LinkProps (DOM)
├── ink-types.ts                    # InkLinkProps, InkRouterProviderProps (terminal)
├── constants.ts                    # EMPTY_PARAMS, EMPTY_OPTIONS (frozen singletons)
├── index.ts                        # Main entry: client API (React 19.2+)
├── ssr.ts                          # SSR-feature subpath (React 19.2+) — splits from main entry
├── legacy.ts                       # Legacy entry: client API for React 18+
├── legacy.ssr.ts                   # Legacy SSR subpath (React 18+, no <Await>)
├── ink.ts                          # Ink entry: hooks + InkRouterProvider + InkLink
├── index.react-server.ts           # RSC type-only entry (root, react-server condition)
└── ssr.react-server.ts             # RSC type-only entry (/ssr, react-server condition)
```

### `MatchProps`

`RouteView.Match` accepts these props:

| Prop        | Type        | Required | Description                                                                 |
| ----------- | ----------- | -------- | --------------------------------------------------------------------------- |
| `segment`   | `string`    | Yes      | Route segment to match                                                      |
| `exact`     | `boolean`   | No       | Exact match only — no descendants. Defaults to `false`.                     |
| `keepAlive` | `boolean`   | No       | Preserve state via React `<Activity>`                                       |
| `fallback`  | `ReactNode` | No       | Shown while children suspend. Wraps children in `<Suspense>` when provided. |

When `fallback` is set, `RouteView.Match` wraps its children in a `<Suspense>` boundary with that fallback. Use this with `React.lazy()` to code-split route components:

```tsx
const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView.Match segment="dashboard" fallback={<Spinner />}>
  <LazyDashboard />
</RouteView.Match>;
```

### `RouteView.Self` and `RouteView.NotFound`

Three fallback slots compose with `<RouteView.Match>` inside a `<RouteView nodeName="…">`:

| Element                | Fires when                                                                             | Props                                                       | Render position               |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `<RouteView.Match>`    | Active route segment matches `segment` (or descendant if `exact={false}`)              | `segment` / `exact` / `keepAlive` / `fallback` / `children` | Inline at source position     |
| `<RouteView.Self>`     | Active route name **exactly equals** parent's `nodeName`                               | `fallback` / `children`                                     | Appended after Match elements |
| `<RouteView.NotFound>` | Active route name is `UNKNOWN_ROUTE` (`@@router/UNKNOWN_ROUTE`) AND no Match activated | `children`                                                  | Appended after Match elements |

**Precedence rules** (`buildRenderList` + `appendFallback`):

1. `<Match>` first-wins — duplicate segments short-circuit via `processMatch.alreadyActive`. Subsequent `<Match>` with the same segment are not rendered.
2. `<Self>` first-wins — only the first `<RouteView.Self>` contributes; subsequent ones are ignored (symmetric with `<NotFound>`).
3. An activating `<Match>` suppresses both `<Self>` and `<NotFound>` from the render output.
4. When no `<Match>` activates: `<Self>` wins over `<NotFound>` if both would fire (occurs only when `nodeName === UNKNOWN_ROUTE`, narrow edge case).

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersIndex /> {/* route name === "users" → renders */}
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile /> {/* "users.profile" and descendants → renders */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage /> {/* UNKNOWN_ROUTE → renders */}
  </RouteView.NotFound>
</RouteView>
```

Property-based tests for the pipeline live in `tests/property/routeView.pipeline.properties.ts` (issue #626) — 8 invariants covering source-order preservation, first-match-wins, Self priority, activeMatchFound suppression, and keepAlive sticky activation.

### Build (tsdown)

Multi-entry config produces shared chunks for code common to both entries:

```
dist/
├── esm/
│   ├── index.mjs           # Main (React 19.2+)
│   ├── index.d.mts
│   ├── legacy.mjs          # Legacy (React 18+)
│   ├── legacy.d.mts
│   └── chunk-*.mjs         # Shared code
└── cjs/
    ├── index.js
    ├── index.d.ts
    ├── legacy.js
    └── legacy.d.ts
```

## Architecture

**Dual Context Pattern:**

- `RouterContext` - Raw router instance (imperative calls)
- `RouteContext` - Navigator + current route + previous route (reactive): `{ navigator: Navigator } & RouteState`

**Subscription Layer:** Hooks use `@real-router/sources` (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`, `createTransitionSource`, `createErrorSource`) for reactive state subscriptions via `useSyncExternalStore` (React 18+).

**DOM commit timing (important for user-code listeners):** `useSyncExternalStore`'s `onStoreChange` is invoked synchronously from `router.subscribe` → `source.updateSnapshot`, but the React rerender + DOM commit are **scheduled** by React's scheduler, not performed synchronously. A `router.subscribe` callback registered alongside `RouterProvider` sees the new router state but the **old DOM**. See `@real-router/sources` CLAUDE.md, section "Notification flow and framework commit timing" for details. For View Transitions or other post-commit work, use `subscribeLeave` (awaited) to capture DOM before commit, not `subscribe`.

## RouterProvider Props

| Prop                 | Type                               | Default     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router`             | `Router`                           | —           | Router instance (required)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `children`           | `ReactNode`                        | —           | Subtree that consumes router context (required — provider would be useless without descendants)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `announceNavigation` | `boolean \| RouteAnnouncerOptions` | `false`     | Enable WCAG-compliant screen reader announcements on route change via `aria-live` region. `true` = defaults; pass `{ prefix?, getAnnouncementText? }` to customize the announced text (falls back to the default h1 → title → route-name chain when the callback returns empty or throws)                                                                                                                                                                                                                                                                                                       |
| `scrollRestoration`  | `ScrollRestorationOptions`         | `undefined` | Opt into scroll capture + restoration. `undefined` = off. See [Scroll Restoration](../../real-router.wiki/Scroll-Restoration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `scrollSpy`          | `ScrollSpyOptions`                 | `undefined` | Opt into router-coordinated `IntersectionObserver`-driven URL hash spy (#575). Tracks the topmost visible anchor inside the configured scroll container and emits `router.navigate(name, params, { hash, replace: true, force: true, hashChange: true })`. Required: `{ selector: string }` (CSS selector for anchors). Optional `rootMargin`, `scrollContainer`. `undefined` / empty `selector` = off. Requires `browser-plugin` or `navigation-plugin` (hash-plugin / memory-plugin → warn-once + NOOP). See [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) |
| `viewTransitions`    | `boolean`                          | `false`     | Opt into View Transitions API integration via `createViewTransitions` utility. No-op on SSR and browsers without `document.startViewTransition`. CSS customization via `::view-transition-*` pseudo-elements                                                                                                                                                                                                                                                                                                                                                                                    |

## Hooks

| Hook                               | Purpose                                                                                                                                                                | Re-renders                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `useRouter()`                      | Get router instance                                                                                                                                                    | Never                          |
| `useNavigator()`                   | Get Navigator (stable ref) — exposes navigate, subscribe, subscribeLeave, isLeaveApproved, and more                                                                    | Never                          |
| `useRoute()`                       | Get route state                                                                                                                                                        | Every navigation               |
| `useRouteNode(name)`               | Subscribe to specific node                                                                                                                                             | Only when node active/inactive |
| `useRouteUtils()`                  | Get RouteUtils instance                                                                                                                                                | Never                          |
| `useRouterTransition()`            | Track transition lifecycle — `{ isTransitioning, isLeaveApproved, toRoute, fromRoute }`                                                                                | On transition start/end        |
| `useRouteExit(handler, options?)`  | Wrap `router.subscribeLeave` with reentrant abort pre-check, same-route skip, latest-handler ref. Handler can return `Promise` — router blocks on it. Returns `void`.  | Never                          |
| `useRouteEnter(handler, options?)` | Fire `handler` once on nav-driven mount with `{ route, previousRoute }`. Skip-initial / skip-same-route / StrictMode-immune via `lastHandledRouteRef`. Returns `void`. | Never                          |

> **`/legacy` entry exports 6 hooks** (omits `useRouteExit` and `useRouteEnter`) — those depend on React 19 concurrent-mode scheduling. Use `router.subscribeLeave()` / `useEffect` directly on React 18.

## Promise-Based Navigation

Link uses fire-and-forget navigation:

```typescript
void router.navigate(routeName, stableParams, stableOptions);
```

For per-navigation result handling, call `router.navigate()` in an `onClick` handler:

```typescript
const handleClick = async () => {
  try {
    await router.navigate("checkout");
  } catch (err) {
    console.error(err);
  }
};
```

## Error Handling

`RouterErrorBoundary` provides declarative error handling for navigation errors.
Shows fallback alongside children (Fragment). Auto-resets on `TRANSITION_SUCCESS`.

- `fallback: (error: RouterError, resetError: () => void) => ReactNode` — required
- `onError?: (error, toRoute, fromRoute) => void` — side-effects (logging)
- Subscribes to `createDismissableError(router)` from `@real-router/sources` via `useSyncExternalStore` — shared dismissal source, no local hook
- Source cached via `WeakMap<Router, RouterSource>` — shared across multiple boundaries
- `resetError` uses `version` counter (not reference equality) — safe with cached error singletons

**Scope:** All boundaries see the same error (global router events, no per-Link scoping).

## SSR-feature surface — `@real-router/react/ssr`

All SSR-aware components and hooks live at the `/ssr` subpath. Eight exports total:

| Export                                        | Kind      | Purpose                                                                                                                                                                                                                                      |
| --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ClientOnly fallback={…}>`                   | component | Server emits `fallback` (default `null`); a single `useEffect` post-hydration swaps in `children`. For browser-API consumers (`window`/`document`), ad slots, dynamic widgets.                                                               |
| `<ServerOnly fallback={…}>`                   | component | Symmetric inverse: server emits `children`; client swaps to `fallback` after mount. For SEO-only meta strips, zero-JS sections inside an otherwise-hydrated page.                                                                            |
| `<Streamed fallback={…}>`                     | component | Cross-adapter alias for `<Suspense fallback={…}>` — symmetric naming with SvelteKit `{#await}` / Solid `<Await/>` boundaries.                                                                                                                |
| `<Await<T> name="key">{(value) => …}</Await>` | component | Reads a deferred promise published by `defer({ deferred: { <name>: Promise } })` and hands the resolved value to the render-prop. Wraps `use(useDeferred(name))`. **Main entry only** — depends on React 19's `use(promise)`.                |
| `<HttpStatusCode code={N}/>`                  | component | Render-time HTTP status declaration. Writes `code` to the nearest `<HttpStatusProvider>`'s sink during render and returns `null`. Last write wins. No-op without provider.                                                                   |
| `<HttpStatusProvider sink={...}>`             | component | Provides an `HttpStatusSink` to any descendant `<HttpStatusCode />` via React context.                                                                                                                                                       |
| `useDeferred<T>(key)`                         | hook      | Reads `state.context.ssrDataDeferred[key]` published by `ssr-data-plugin`'s `defer()` API. Returns the deferred Promise; combine with `use(promise)` or `<Await>`.                                                                           |
| `createHttpStatusSink()`                      | utility   | Returns a fresh `HttpStatusSink` (`{ code: number \| undefined }`). Construct one per request on the server, pass to `<HttpStatusProvider>`, read `sink.code` after `renderToString`/`renderToReadableStream` to apply to the HTTP response. |

```tsx
import {
  ClientOnly,
  ServerOnly,
  Streamed,
  Await,
  useDeferred,
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/react/ssr";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

<ServerOnly>
  <SeoMetaStrip />
</ServerOnly>

// Either form — pick one
<Streamed fallback={<Spinner />}>
  <Await<Review[]> name="reviews">
    {(reviews) => <ReviewList items={reviews} />}
  </Await>
</Streamed>

// or:
<Suspense fallback={<Spinner />}>
  <Reviews />
</Suspense>
function Reviews() {
  const reviews = use(useDeferred<Review[]>("reviews"));
  return <ReviewList items={reviews} />;
}

// Render-time HTTP status decision (NotFound page on a glob `*` route)
function NotFound() {
  return (
    <>
      <HttpStatusCode code={404} />
      <h1>Page not found</h1>
    </>
  );
}

// entry-server.tsx
const sink = createHttpStatusSink();
const html = renderToString(
  <HttpStatusProvider sink={sink}>
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  </HttpStatusProvider>,
);
response.status(sink.code ?? 200).send(html);
```

**Implementation notes:**

- `<ClientOnly>`/`<ServerOnly>`: `useState(false)` + `useEffect(() => setMounted(true), [])` — the intentional post-hydration re-render is what keeps server HTML identical to client first paint.
- `<Streamed>`: thin `<Suspense>` wrapper — pick `<Streamed>` when you want cross-framework naming alignment, plain `<Suspense>` otherwise. Both produce identical DOM.
- `<Await>` + `useDeferred`: pair with `defer()` from `@real-router/ssr-data-plugin` and `injectDeferredScripts` from `@real-router/ssr-data-plugin/server`. See [packages/ssr-data-plugin/CLAUDE.md](../ssr-data-plugin/CLAUDE.md) for the wire format and the React `ssr-streaming/` example end-to-end.
- `<HttpStatusCode>` writes to `sink.code` during render via `useContext` — last write wins when multiple instances mount. With no `<HttpStatusProvider>` mounted (typical client-side case) it is a silent no-op, so the same component tree hydrates without DOM touches or warnings. Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; this component covers render-time decisions only.
- React 18 (`/legacy/ssr`): omits `<Await>` (uses React 19's `use()`). Compose manually with `<Suspense>` + a Suspense-aware data library if you need it on React 18.

**`react-server` condition:** `@real-router/react/ssr` resolves to a type-only entry under the RSC bundler's `react-server` condition (`AwaitProps`, `StreamedProps`, `ClientOnlyProps`, `ServerOnlyProps`, `HttpStatusCodeProps`, `HttpStatusProviderProps`, `HttpStatusSink`). Server Components cannot consume the runtime — these components hold client-only state (`useState`/`useEffect`/`useContext`).

## Gotchas

### useRouter vs useRoute

```typescript
const router = useRouter(); // No re-renders on navigation
const { navigator, route } = useRoute(); // Re-renders on every navigation
```

### useRouteExit / useRouteEnter

Two hooks that wrap the `subscribeLeave` / mount-side route windows with the universal guards baked in (reentrant abort pre-check, same-route skip default, latest-handler ref, StrictMode-dedupe). Both ship in the main entry; both consume `useRoute()` for the route snapshot, so they inherit the post-commit timing guarantee.

```tsx
useRouteExit(async ({ signal }) => {
  await api.saveDraft(formState, { signal });
});

useRouteEnter(({ route, previousRoute }) => {
  analytics.track("page_enter", {
    route: route.name,
    from: previousRoute.name,
  });
});
```

`useRouteExit`'s handler can return a `Promise` — the router awaits it before committing the new state. Returning a long-running animation Promise gives router-coordinated exit timing. `useRouteEnter` is fire-and-forget (`void`) and fires after the new component mounts. Both default to `skipSameRoute: true` so query-only navigations (sort/filter) don't trigger.

### useRoute throws when route is undefined

`useRoute()` returns `{ navigator, route: State<P>, previousRoute?: State }` —
`route` is **non-nullable**. The hook throws when the router has no active state
(unstarted, stopped, or disposed) so consumers no longer have to defend against
`undefined` on every access:

```tsx
// Before (defensive):
const { route } = useRoute<{ id: string }>();
if (!route) return null;
const id = route?.params.id ?? "fallback";

// After (route is guaranteed):
const { route } = useRoute<{ id: string }>();
const id = route.params.id;
```

Throws with `"useRoute called with no active route. Did you forget to await
router.start() before rendering, or is the router stopped/disposed?"` if
mounted before `await router.start()` resolves. `useRouteNode(name)` keeps the
nullable shape — `route === undefined` there means "node inactive", a
legitimate business state, not lifecycle misuse.

### Typed route params via generic

`useRoute<P>()` accepts an optional generic to type `route.params` without `as` casts at the call site. The generic is erased at compile time — no runtime change. The cast moves from user code into the hook body, in one place.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const { route } = useRoute<SearchParams>();

route.params.q; // typed as string
route.params.sort; // typed as string
```

`RouteContext<P>` also accepts a generic, so consumers can propagate typed params across helpers.

### useRouteNode Semantics

```typescript
useRouteNode(""); // Root - ALL route changes
useRouteNode("users"); // Only "users" and "users.*" routes
```

### previousRoute is Global

```typescript
// Navigation: users.list → items → users.view
useRouteNode("users").previousRoute; // = items (not users.list!)
```

### Object Params and Memoization

Link's custom comparator (`areLinkPropsEqual`) uses `shallowEqual` for `routeParams`
and `routeOptions` — `Object.is` per key, no JSON serialization. Key-order insensitive
(iterates one side's keys, looks up in the other). 99 % of Links pass `routeParams=undefined`
and hit the `Object.is(undefined, undefined)` fast path.

```typescript
// Stable reference → Object.is → bail out
const params = useMemo(() => ({ id: 123 }), []);
<Link routeParams={params} />

// Inline object → different ref each render → shallow compare (~40 ns)
// Re-renders only when primitive values actually change
<Link routeParams={{ id: 123 }} />

// BigInt / Symbol / Date / Map values compared via Object.is per key — correct
<Link routeParams={{ id: 1n }} /> // {id: 1n} ≡ {id: 1n} → bail out

// NESTED objects in routeParams — shallowEqual sees different refs → re-render.
// If this matters, stabilize via useMemo (standard React pattern):
const params = useMemo(() => ({ filters: [1, 2] }), [...]);
<Link routeParams={params} />
```

The comparator covers all explicit `LinkProps` (`routeName`, `className`, `activeClassName`,
`activeStrict`, `ignoreQueryParams`, `hash`, `onClick`, `target`, `style`, `children`) plus
`routeParams`/`routeOptions` via `shallowEqual`. Anchor-spread props (`data-*`, `aria-*`, `id`,
etc.) are NOT compared — they don't affect Link's hooks.

### `<Link hash>` Prop (#532)

`hash?: string` — URL fragment (decoded, no leading `#`). Tri-state:

- `undefined` (default) — preserves the current `state.context.url.hash` on click.
- `""` — clears the hash.
- `"value"` — sets the hash; click routes through `navigateWithHash`, which auto-adds `force: true, hashChange: true` when the requested hash differs from `state.context.url.hash` on the same route+params (bypasses core's `SAME_STATES`).

Active state is hash-aware: when `hash` is set, the Link is active iff route matches AND `state.context.url.hash` equals expected — sibling tab Links (same `routeName`, different `hash`) light up independently. Hash-plugin runtime always returns `false` for hash-aware active checks (consistent with the documented hash-plugin limitation).

### activeStrict Meaning

```typescript
// Current route: users.edit
<Link routeName="users" activeStrict={false} /> // Active (ancestor)
<Link routeName="users" activeStrict={true} />  // NOT active (not exact)
```

### ignoreQueryParams Default

```typescript
// Default: query params don't affect active state
<Link routeName="users" /> // Active even if ?page=2 differs

// For pagination links:
<Link routeName="users" ignoreQueryParams={false} />
```

### fallback and keepAlive Together

`fallback` and `keepAlive` can be combined. The `<Suspense>` boundary wraps the children; `<Activity>` wraps the whole match including the boundary:

```tsx
const LazyUsers = lazy(() => import("./UsersPage"));

<RouteView.Match segment="users" keepAlive fallback={<Spinner />}>
  <LazyUsers />
</RouteView.Match>;
```

### Keep `RouterProvider` above any `<Activity>` / keepAlive boundary

`RouterProvider` subscribes to the router via `useSyncExternalStore`
(subscribe-on-first-listener, unsubscribe-on-last). React 19's `<Activity>` —
the same API behind `RouteView`'s `keepAlive` — **detaches the effects of a
hidden subtree**, which drops that subscription. If the Provider itself sits
_under_ an `<Activity>` (or keepAlive) boundary, a `hide → router.navigate(...)
→ show` sequence renders the **stale** previous route: the navigation lands
while the source is disconnected, and on re-show `createRouteSource` replays its
last snapshot until the next navigation. `useMemo(() => createRouteSource(router),
[router])` survives the hide/show, so the source is never recreated to pick up
what it missed.

```tsx
// WRONG — Provider under Activity: hide → navigate → show shows the stale route
<Activity mode={mode}>
  <RouterProvider router={router}>
    <App />
  </RouterProvider>
</Activity>

// CORRECT — Provider above the boundary (the typical app already mounts it at
// the root). keepAlive on an individual RouteView.Match stays fine — the
// Provider remains mounted and subscribed the whole time.
<RouterProvider router={router}>
  <Activity mode={mode}>
    <App />
  </Activity>
</RouterProvider>
```

Most apps mount `RouterProvider` at the root, so the real exposure is
non-standard compositions and `keepAlive`-wrapped app-in-app layouts. The root
cause is in `@real-router/sources` — `createRouteSource` does not reconcile its
snapshot on re-subscribe ([#765](https://github.com/greydragon888/real-router/issues/765));
once that lands, the window closes and this caveat can be softened.
`useIsActiveRoute` / `Link` are **immune** — their source is eager and keeps its
snapshot live even with zero subscribers.

### Ink entry constraints

`@real-router/react/ink` is a **different runtime target** from main/legacy, not a different React version. Constraints:

- **Ink v7+ pins React 19.2+** — the `/ink` entry is paired with the main entry's React version, not `/legacy`. Ink v7 cannot run on React 18.
- **No `<Link>`** — DOM-only, uses `<a>` + `MouseEvent<HTMLAnchorElement>`. Use `InkLink` which keys off `useFocus` + `useInput`.
- **No `RouteView`** — `<Activity>` in terminal UIs is untested. Compose routes via `useRouteNode("")` and a switch/case on `route.name`.
- **No `announceNavigation`** — `InkRouterProvider` composes `RouterProviderCore` (contexts + `useSyncExternalStore` wiring), **not** the DOM-aware `RouterProvider`, so it never forwards this prop; `createRouteAnnouncer` is unreachable from `/ink`. The DOM announcer uses `document.querySelector`/`requestAnimationFrame` and cannot run in Ink.
- **Chunk isolation (#800)** — because the announcer / scroll-restore / scroll-spy / view-transitions factories are imported and _called_ only in `RouterProvider.tsx`, and `InkRouterProvider` reaches only `RouterProviderCore.tsx` (which imports none of them), the chunk behind `dist/esm/ink.mjs` carries **zero** dom-utils implementation — no `IntersectionObserver` / `startViewTransition` / `aria-live` / scroll code lands in the terminal bundle. Guarded by `tests/functional/ink-chunk-isolation.test.ts`, which walks the static module graph from `src/ink.ts` (a re-export barrel is tree-shakeable; only a live value import counts).
- **`ink` is an optional peer** (`peerDependenciesMeta.ink.optional = true`) — DOM consumers won't be prompted to install it.
- **Navigation contract:** Tab moves focus across `InkLink`s (Ink's focus ring), Enter triggers `router.navigate(...)`. `ignoreQueryParams` defaults to `true` like DOM `Link`; `activeClassName` is replaced by `activeColor`/`activeInverse`, `onClick` by `onSelect`.
- **`onSelect` is throw-isolated:** a throwing `onSelect` is caught + logged via `console.error`, then navigation proceeds. An uncaught throw inside `useInput` would otherwise escape into ink's stdin handler as an `uncaughtException` (no browser event-listener safety net) **and** swallow the navigation — mirrors `route-announcer`'s consumer-callback isolation (#799).
- **Tests:** Ink tests live alongside other functional tests and use `ink-testing-library`. Forces colors via `FORCE_COLOR=3` in `tests/setup.ts` so ANSI assertions on `lastFrame()` work in the non-TTY vitest stdout.

## SSR

No built-in SSR support. For SSR:

- Create router per request (don't share)
- Initialize with matched URL
- `previousRoute` will be undefined on server

## Performance

- `useRouteNode` uses cached `createRouteNodeSource` from `@real-router/sources` — `N` consumers of the same `nodeName` share one router subscription
- `useRouterTransition` uses `getTransitionSource` — shared eager source per router
- `RouterErrorBoundary` uses `createDismissableError` — shared error source with integrated dismissal state (no local `useRouterError` hook)
- `useIsActiveRoute` uses cached `createActiveRouteSource` — params are hashed with `canonicalJson` (key-order-insensitive), so `{a:1, b:2}` and `{b:2, a:1}` hit the same cache entry. No `useStableValue` wrapper needed
- `Link` uses `memo()` with custom `areLinkPropsEqual` comparator: `Object.is` for primitives + `style` + `children`, `shallowEqual` (Object.is per key, order-insensitive) for `routeParams`/`routeOptions`. Nested objects in params are not deep-compared — consumers stabilize via `useMemo` if needed
