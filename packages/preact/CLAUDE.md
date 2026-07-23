# @real-router/preact

> Preact bindings with optimal re-render strategies

**Perf bench (CodSpeed):** this adapter's hot-path suite lives centrally, not in-package (the cross-cutting multi-framework harness needs one prebuild + one V8-flag-wrapped process — see `benchmarks/CLAUDE.md`): `benchmarks/adapter-bench/benches/preact.bench.mts` + `apps/preact.tsx` (three benches: navigate-param-swap / navigate-route-swap / back-forward). Run locally: `pnpm -C benchmarks run bench:adapter preact`. Design record: IMPLEMENTATION_NOTES "adapter-bench slot".

## Entry Points (Subpath Exports)

Two entry points via `package.json` `exports` — main + SSR subpath:

| Entry Point | Import Path               | Description                                                                                                                                                                   |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main        | `@real-router/preact`     | Full client API: hooks, `RouterProvider`, `RouteView`, `Link`, `RouterErrorBoundary`                                                                                          |
| SSR         | `@real-router/preact/ssr` | `<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `useDeferred`, `<HttpStatusCode>`, `<HttpStatusProvider>`, `createHttpStatusSink` — mirrors `@real-router/react/ssr` |

```tsx
// Client API
import {
  RouterProvider,
  useRouteNode,
  Link,
  RouteView,
} from "@real-router/preact";

// SSR-feature components/hooks
import {
  ClientOnly,
  ServerOnly,
  Await,
  Streamed,
  useDeferred,
} from "@real-router/preact/ssr";
```

**Peer dependency:** `preact` ">=10.28.0 || ^11.0.0-0" — compatible with Preact 10.28+ and Preact 11 (beta and stable). Floor sits at 10.28 because the adapter pulls `HTMLAttributes` / `TargetedMouseEvent` from the top-level `preact` namespace (introduced in 10.28; `dom.d.ts`), which is the only import shape that survives Preact 11's JSX-namespace restructure.

**Architecture:** Flat structure. All code lives in `src/`. Two entry points (main + `/ssr`) — no legacy/modern split. `RouteView` included but without `keepAlive` (Preact has no Activity API).

**RouterProvider Props:**

| Prop                 | Type                               | Default     | Description                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router`             | `Router`                           | —           | Router instance (required)                                                                                                                                                                                                                                                                |
| `announceNavigation` | `boolean \| RouteAnnouncerOptions` | `false`     | Enable WCAG-compliant screen reader announcements on route change via `aria-live` region. Pass `{ prefix?, getAnnouncementText? }` to customize the announcement text — the callback falls back to the default `h1 → title → route-name` chain when it returns an empty string or throws. |
| `scrollRestoration`  | `ScrollRestorationOptions`         | `undefined` | Opt into scroll capture + restoration. Keyed by `(name, canonicalJson(params))` — duplicate history entries share one bucket.                                                                                                                                                             |
| `scrollSpy`          | `ScrollSpyOptions`                 | `undefined` | Opt into router-coordinated `IntersectionObserver`-driven URL hash spy (#575). `{ selector, rootMargin?, scrollContainer? }`. Empty `selector` / `undefined` = off. Requires `browser-plugin` or `navigation-plugin`; under hash-plugin / memory-plugin → warn-once + NOOP.               |
| `viewTransitions`    | `boolean`                          | `false`     | Opt into View Transitions API integration via `createViewTransitions` utility. No-op on SSR and browsers without `document.startViewTransition`. CSS customization via `::view-transition-*` pseudo-elements                                                                              |

### Source Structure

```
src/
├── hooks/
│   ├── useRouter.tsx           # Router instance from context (never re-renders)
│   ├── useRoute.tsx            # Full route state from context (every navigation)
│   ├── useNavigator.tsx        # Navigator from context (never re-renders)
│   ├── useRouteNode.tsx        # Node-scoped subscription (cached createRouteNodeSource from sources)
│   ├── useIsActiveRoute.tsx    # Delegates to shared createActiveSource builder (#1427): default opts + non-empty name → createActiveNameSelector fast path (#1249), else cached createActiveRouteSource; useMemo-wrapped
│   ├── useRouteUtils.tsx       # RouteUtils from route tree (never re-renders)
│   ├── useRouterTransition.tsx # Transition lifecycle (cached getTransitionSource)
│   ├── useRouteExit.tsx        # Wraps subscribeLeave with abort + same-route guards + handler ref
│   ├── useRouteEnter.tsx       # Fires on nav-driven mount via useRoute() snapshot + transition.from
│   └── useDeferred.tsx         # /ssr — reads state.context.ssrDataDeferred[key] (ssr-data-plugin)
├── components/
│   ├── Link.tsx
│   ├── RouterErrorBoundary.tsx # Declarative error handling — uses createDismissableError
│   ├── ClientOnly.tsx          # /ssr — server fallback → client children swap after mount
│   ├── ServerOnly.tsx          # /ssr — symmetric inverse of ClientOnly
│   ├── Streamed.tsx            # /ssr — cross-adapter <Suspense> alias (preact/compat)
│   ├── Await.tsx               # /ssr — <Await name="key">{(v) => …}</Await> via Suspense-thenable convention
│   ├── HttpStatusCode.tsx      # /ssr — render-time HTTP status (sink write)
│   ├── HttpStatusProvider.tsx  # /ssr — provides HttpStatusSink via Preact context
│   └── RouteView/             # Declarative route matching (no keepAlive)
│       ├── index.ts
│       ├── RouteView.tsx
│       ├── types.ts
│       ├── components.tsx
│       └── helpers.tsx
├── dom-utils/                  # Symlink → shared/dom-utils/ (files shipped to ALL framework adapters; not all are consumed by Preact)
│   ├── index.ts
│   ├── link-utils.ts           # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName, applyLinkA11y, shallowEqual — Preact-Link uses shouldNavigate / buildHref / navigateWithHash / buildActiveClassName / shallowEqual; applyLinkA11y is not invoked by Preact-Link (renders <a> natively, no need for role=link wrapper)
│   ├── route-announcer.ts      # createRouteAnnouncer — WCAG aria-live announcements (used by RouterProvider when announceNavigation=true)
│   ├── scroll-restore.ts       # createScrollRestoration — opt-in scroll capture + restore
│   ├── scroll-spy.ts           # createScrollSpy — IntersectionObserver → URL hash (#575)
│   ├── view-transitions.ts     # createViewTransitions — subscribeLeave-based VT integration
│   └── direction-tracker.ts    # createDirectionTracker — back/forward annotation; NOT consumed by the Preact RouterProvider, available via the symlink barrel for consumers who want to install it manually before usePlugin(browserPlugin)
├── utils/
│   └── createHttpStatusSink.ts # /ssr — fresh { code: undefined } sink per request
├── RouterProvider.tsx
├── context.ts                  # RouterContext, RouteContext, NavigatorContext + createUseContextOrThrow factory
├── useSyncExternalStore.ts     # Polyfill (Preact has no native implementation)
├── index.ts                    # Main entry — client API
├── ssr.ts                      # SSR-feature subpath — 8 exports mirroring @real-router/react/ssr
├── types.ts
└── constants.ts
```

### `MatchProps`

`RouteView.Match` accepts these props:

| Prop       | Type                | Required | Description                                                                                                                                         |
| ---------- | ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segment`  | `string`            | Yes      | Route segment to match                                                                                                                              |
| `exact`    | `boolean`           | No       | When `true`, matches only the exact route (not descendants). Default: `false`                                                                       |
| `fallback` | `ComponentChildren` | No       | Shown while children suspend. Wraps children in `<Suspense>` when provided. **Experimental** — requires `lazy` and `Suspense` from `preact/compat`. |

### Build (tsdown)

Dual-entry config (`index` + `ssr`), one chunk per entry, plus shared chunks:

```
dist/
├── esm/
│   ├── index.mjs
│   ├── index.d.mts
│   ├── ssr.mjs
│   ├── ssr.d.mts
│   └── useRoute-*.mjs        # Shared chunk (hoisted by tsdown)
└── cjs/
    ├── index.js
    ├── index.d.ts
    ├── ssr.js
    └── ssr.d.ts
```

## Architecture

**Triple Context Pattern:**

- `RouterContext` - Raw router instance (imperative calls)
- `NavigatorContext` - Navigator (stable ref, derived from router)
- `RouteContext` - Navigator + current route + previous route (reactive): `{ navigator: Navigator } & RouteState`

**Subscription Layer:** Hooks use `@real-router/sources` (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`, `createTransitionSource`, `createErrorSource`) via a custom `useSyncExternalStore` polyfill (useState + useEffect). `RouterErrorBoundary` consumes `createDismissableError`, which composes `createErrorSource` with dismissal state.

## Hooks

| Hook                               | Purpose                                                                                                                                                         | Re-renders                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useRouter()`                      | Get router instance                                                                                                                                             | Never                                                                                                      |
| `useNavigator()`                   | Get Navigator (stable ref) — exposes navigate, subscribe, subscribeLeave, isLeaveApproved, and more                                                             | Never                                                                                                      |
| `useRoute()`                       | Get `RouteContext` (`navigator` + non-nullable `route` + optional `previousRoute`), not raw `RouteState`                                                        | Every navigation                                                                                           |
| `useRouteNode(name)`               | Subscribe to specific node                                                                                                                                      | Only when node active/inactive                                                                             |
| `useRouteUtils()`                  | Get RouteUtils instance                                                                                                                                         | Never                                                                                                      |
| `useRouterTransition()`            | Track transition lifecycle — `{ isTransitioning, isLeaveApproved, toRoute, fromRoute }`                                                                         | On transition start/end                                                                                    |
| `useRouteExit(handler, options?)`  | Subscribe to `router.subscribeLeave` with `signal.aborted` pre-check, same-route skip and stable handler-ref. Returns `void`.                                   | Never (subscription stable across renders)                                                                 |
| `useRouteEnter(handler, options?)` | Fire `handler` once when component mounts as a result of a navigation; uses `useRoute()` snapshot + `route.transition.from` for skip-initial / skip-same-route. | Every navigation (host component reads `useRoute()`); handler ref + subscription are stable across renders |

## Differences from React Adapter

| Aspect                  | React                                                 | Preact                                     |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------ |
| `useSyncExternalStore`  | Native (React 18+)                                    | Custom polyfill (`useState` + `useEffect`) |
| Context provider        | `<Context value={...}>` (React 19)                    | `<Context.Provider value={...}>`           |
| `memo()`                | `react`                                               | `preact/compat`                            |
| `Children.toArray`      | `react`                                               | `toChildArray` from `preact`               |
| `keepAlive` / Activity  | React 19.2+                                           | Not available                              |
| `fallback` / `Suspense` | `react`                                               | `preact/compat` (experimental)             |
| Entry points            | Main + Legacy + `/ssr` + `/legacy/ssr` + `/ink` + RSC | Main + `/ssr`                              |

## Promise-Based Navigation

Link uses fire-and-forget navigation via `navigateWithHash` (from `dom-utils/link-utils`),
which adds same-route different-hash detection on top of `router.navigate`:

```typescript
navigateWithHash(router, routeName, stableParams, hash, stableOptions).catch(
  () => {},
);
```

The `.catch(() => {})` swallows rejected transitions (guards returning false, redirects,
not-found) so they do not surface as unhandled promise rejections in the browser console
— consumers handle navigation errors via `<RouterErrorBoundary>` or `useRouterTransition`
instead. When `hash` is set and differs from the current `state.context.url.hash` on the
same route+params, `navigateWithHash` auto-adds `{ force: true, hashChange: true }` so the
navigation bypasses core's `SAME_STATES` short-circuit (see "`<Link hash>` Prop" gotcha).

## SSR-feature surface — `@real-router/preact/ssr`

All SSR-aware components/hooks live at the `/ssr` subpath. Eight exports total — symmetric with `@real-router/react/ssr`:

| Export                                        | Kind      | Purpose                                                                                                                                                                    |
| --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ClientOnly fallback={…}>`                   | component | Server emits `fallback` (default `null`); a single `useEffect` post-hydration swaps in `children`.                                                                         |
| `<ServerOnly fallback={…}>`                   | component | Symmetric inverse: server emits `children`; client swaps to `fallback` after mount.                                                                                        |
| `<Streamed fallback={…}>`                     | component | Cross-adapter alias for Preact `Suspense` boundaries.                                                                                                                      |
| `<Await<T> name="key">{(value) => …}</Await>` | component | Reads a deferred promise published by `defer({ deferred: { <name>: Promise } })`. Throws-then-renders pattern via Preact `Suspense`.                                       |
| `<HttpStatusCode code={N}/>`                  | component | Render-time HTTP status declaration. Writes `code` to the nearest `<HttpStatusProvider>`'s sink during render and returns `null`. Last write wins. No-op without provider. |
| `<HttpStatusProvider sink={...}>`             | component | Provides an `HttpStatusSink` to descendant `<HttpStatusCode />` instances via Preact context.                                                                              |
| `useDeferred<T>(key)`                         | hook      | Reads `state.context.ssrDataDeferred[key]`.                                                                                                                                |
| `createHttpStatusSink()`                      | utility   | Returns a fresh `HttpStatusSink` (`{ code: number \| undefined }`) — construct one per request, read `sink.code` after `renderToString` to apply to the response.          |

Implementation: `useState(false)` + `useEffect(() => setMounted(true), [])` from `preact/hooks` for boundary components. `<HttpStatusCode>` reads `useContext` and writes during render — no DOM, no hydration mismatch. Same SSR/hydration contract as the React adapter.

```tsx
import {
  ClientOnly,
  ServerOnly,
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/preact/ssr";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

// Render-time HTTP status decision
<HttpStatusCode code={404} />

// entry-server.tsx
const sink = createHttpStatusSink();
const html = renderToString(
  <HttpStatusProvider sink={sink}>
    <App />
  </HttpStatusProvider>,
);
response.status(sink.code ?? 200).send(html);
```

## Gotchas

### useRouter vs useRoute

```typescript
const router = useRouter(); // No re-renders on navigation
const { navigator, route } = useRoute(); // Re-renders on every navigation
```

### useRoute throws when route is undefined

`useRoute()` returns `{ navigator, route: State<P>, previousRoute?: State }` —
`route` is **non-nullable**. The hook throws if the router has no active state
(unstarted, stopped, disposed). `useRouteNode(name)` stays nullable — node
inactivity is a legitimate business state, not a lifecycle error.

```tsx
// Before:
const { route } = useRoute<{ id: string }>();
if (!route) return null;
const id = route?.params.id;

// After:
const { route } = useRoute<{ id: string }>();
const id = route.params.id;
```

### Typed route params via generic

`useRoute<P>()` accepts an optional generic to type `route.params` — the path channel (RFC-4 M2 / #1548) — without `as` casts at the call site. The cast happens inside the hook once, not at every call site. The generic types `route.params` only; `route.search` (the query channel) has no dedicated generic slot on this hook today and stays typed as the base `SearchParams`. `RouteContext<P>` is likewise generic.

```typescript
type RouteParams = { id: string } & Params;

const { route } = useRoute<RouteParams>();

route.params.id; // typed as string
```

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

Link's custom comparator (`areLinkPropsEqual`) uses `shallowEqual` (Object.is per key, order-insensitive) for `routeParams` and `routeOptions`. 99 % of Links pass `routeParams=undefined` and hit the `Object.is(undefined, undefined)` fast path; inline objects with primitive values are compared per-key in ~40 ns.

```typescript
// Inline object with primitives — shallowEqual handles it
<Link routeParams={{ id: 123 }} />

// Nested objects / arrays — shallowEqual sees different refs → re-render.
// Stabilize via useMemo (standard React/Preact pattern):
const params = useMemo(() => ({ filters: [1, 2] }), [...]);
<Link routeParams={params} />
```

Params stabilization is handled by `createActiveRouteSource` in `@real-router/sources` — it hashes params via `canonicalJson` and returns the same cached source for canonical-equal shapes. No `useStableValue` wrapper needed.

The comparator covers all explicit `LinkProps` (`routeName`, `className`, `activeClassName`,
`activeStrict`, `ignoreQueryParams`, `hash`, `onClick`, `target`, `style`, `children`) plus
`routeParams`/`routeSearch`/`routeOptions` via `shallowEqual`. Anchor-spread props (`data-*`, `aria-*`, `id`,
etc.) are NOT compared — they don't affect Link's hooks.

### `<Link hash>` Prop (#532)

`hash?: string` — URL fragment (decoded, no leading `#`). Tri-state:

- `undefined` (default) — preserves the current `state.context.url.hash` on click.
- `""` — clears the hash.
- `"value"` — sets the hash; click routes through `navigateWithHash`, which auto-adds `force: true, hashChange: true` when the requested hash differs from `state.context.url.hash` on the same route+params (bypasses core's `SAME_STATES`).

`hash` is a regular Link prop included in `areLinkPropsEqual`. Active state is hash-aware: when `hash` is set, the Link is active iff route matches AND `state.context.url.hash` equals expected. Hash-plugin runtime always returns `false` for hash-aware active checks (consistent with the documented hash-plugin limitation).

### No keepAlive

RouteView renders only the active match. On navigation, the previous component unmounts completely — state is lost:

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage /> {/* Unmounts when navigating away */}
  </RouteView.Match>
</RouteView>
```

### fallback is Experimental

`fallback` wraps children in `<Suspense>` from `preact/compat`. Preact's lazy loading support is experimental — test thoroughly before shipping:

```tsx
import { lazy, Suspense } from "preact/compat";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView.Match segment="dashboard" fallback={<Spinner />}>
  <LazyDashboard />
</RouteView.Match>;
```

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
```

### `routeSearch` Prop (#1548)

`routeSearch?: SearchParams` — the query (search) channel of the path/query split
(RFC-4 M2), parallel to `routeParams`. Feeds the URL query string on click and in
`href` (passed to `buildUrl` / `buildPath` at position 3), and — paired with
`ignoreQueryParams={false}` — the active-state check.

```tsx
// Pagination link with an explicit query channel; active only on ?page=2
<Link routeName="users" routeSearch={{ page: "2" }} ignoreQueryParams={false} />
```

A route's query still works when passed inside `routeParams` (the pre-split path);
`routeSearch` is the explicit, type-clean channel.

### `to` Descriptor Prop (#1548)

`<Link>` accepts two **mutually-exclusive** forms — the channel props above
(`routeName` + `routeParams` + `routeSearch`) OR a single `to={NavigationTarget}`
descriptor (`{ name, params?, search? }`). `LinkProps` is a discriminated union
(`to?: never` in the channel branch, `routeName?: never` in the descriptor
branch), so mixing them is a **compile error**. At runtime the shared
`resolveLinkTarget` helper is the backstop — `to` wins and a `console.warn` fires
if channel props leak in via a JS consumer or a spread.

```tsx
// Channel form
<Link routeName="users.view" routeParams={{ id: "7" }} routeSearch={{ tab: "posts" }} />

// Descriptor form — equivalent, one object
<Link to={{ name: "users.view", params: { id: "7" }, search: { tab: "posts" } }} />
```

`routeOptions` / `hash` are separate props under BOTH forms (hash is not part of
`NavigationTarget` — #532). react/preact/solid enforce the exclusion in the type;
svelte/vue/angular enforce it at runtime only (their prop systems preclude a
strict never-union).

### `RouteView.Match` Identity Check — Wrapping Silently Hides It

`collectElements` matches children by `child.type === Match` (raw reference
equality). Wrapping `<RouteView.Match>` in `memo()`, `forwardRef`, or any
custom component changes `child.type` to the wrapper — the reference check
fails and the wrapped element is **silently skipped** (no match, no render,
no console warning). `<RouteView.NotFound>` does NOT activate either, because
the route is valid (not `UNKNOWN_ROUTE`) — there's just no recognised Match
slot for it.

```tsx
import { memo } from "preact/compat";

// WRONG — MemoMatch.type !== Match, invisible to collectElements
const MemoMatch = memo(RouteView.Match);
<RouteView nodeName="">
  <MemoMatch segment="users">
    {" "}
    {/* silently skipped */}
    <UsersPage />
  </MemoMatch>
</RouteView>;

// WRONG — wrapper function changes type identity (same footgun)
function MyMatch({ segment, children }: Props) {
  return <RouteView.Match segment={segment}>{children}</RouteView.Match>;
}

// OK — const alias preserves identity (Alias === RouteView.Match)
const Alias = RouteView.Match;
<RouteView nodeName="">
  <Alias segment="users">
    <UsersPage />
  </Alias>{" "}
  {/* detected */}
</RouteView>;
```

Lock: `RouteView.test.tsx` "consumer footgun: RouteView.Match wrapped in memo()"
suite (3 tests — memo-wrapped negative, function-wrapper negative,
identity-preserving alias positive).

### Multiple `<RouteView.NotFound>` — First Wins

When more than one `<RouteView.NotFound>` is declared in the same `RouteView`,
**the first one renders** — symmetric with `<Match>` and `<Self>` (all three
first-wins, #1439, mirroring the React adapter's #1220). `assignFallbackSlot`
guards NotFound with a `notFoundFound` flag (the twin of `selfFound`), so
subsequent NotFound elements are ignored. Prefer a single
`<RouteView.NotFound>` per RouteView anyway.

```tsx
<RouteView nodeName="">
  <RouteView.NotFound>
    <div data-testid="first-nf">First</div> {/* renders on UNKNOWN_ROUTE */}
  </RouteView.NotFound>
  <RouteView.Match segment="users">
    <UsersPage />
  </RouteView.Match>
  <RouteView.NotFound>
    <div data-testid="last-nf">Last</div> {/* ignored (first-wins) */}
  </RouteView.NotFound>
</RouteView>
```

Lock: `RouteView.test.tsx` "should use the FIRST NotFound when multiple are present".

### `RouteView.Match` `segment` Rejects URL-Special Characters

`segment` is a dot-delimited route **name** (the one declared in the route
tree), never a URL path. The matching path goes through
`startsWithSegment(routeName, fullSegmentName)` from `@real-router/route-utils`,
which throws `"Segment contains invalid characters"` on any char outside
`[a-zA-Z0-9._-]`. The throw propagates synchronously from render — there is
no Preact ErrorBoundary catch around it.

```tsx
// All four throw at render time:
<RouteView.Match segment="users/">  {/* trailing slash */}
<RouteView.Match segment="users?id=1"> {/* query separator */}
<RouteView.Match segment="users#section"> {/* hash separator */}
<RouteView.Match segment="/users">  {/* leading slash */}

// Correct — dot-delimited route name from your route tree
<RouteView.Match segment="users">
<RouteView.Match segment="users.profile">
<RouteView.Match segment="users-list">  // dash + underscore allowed
```

Lock: `RouteView.test.tsx` "should reject segments containing URL special
characters" — parametrised over 4 inputs, asserts `toThrow(/Segment contains
invalid characters/)` and `console.error` was NOT called (synchronous render
throw, not Preact's async error-logging path).

### `shallowEqual` Treats Explicit `undefined` as a Present Key

The comparator from `shared/dom-utils/link-utils.ts` uses `Object.keys`
(includes own-properties whose value is `undefined`), so `{a:1, b:undefined}`
has length 2, not 1. Two records that differ only in whether an optional key
is absent vs. explicitly-`undefined` compare as **not equal**. Surfaces as
unwanted `<Link>` re-renders when a consumer toggles a controlled/uncontrolled
optional field.

```tsx
shallowEqual({ a: 1, b: undefined }, { a: 1 }); // false
shallowEqual({ a: 1 }, { a: 1, b: undefined }); // false (symmetric)

// Practical example — these two routeParams break Link memo bail-out:
<Link routeParams={controlled ? { id, draft } : { id }} />;
//                                ↑ first render: { id, draft: undefined }
//                                  second render: { id }
//                                  → shallowEqual = false → Link re-renders
```

Stable pattern: omit the key when it's optional, or normalize via a helper
that strips `undefined` values before passing to `<Link>`.

Lock: `shallowEqual.properties.ts` Inv 10 + reified single-example test for
the documented case pair.

### `buildHref` Graceful Fallback on Plugin Error

`shared/dom-utils/link-utils.ts:buildHref` wraps the call to
`router.buildUrl?.()` + `router.buildPath()` in a `try/catch`: when either
throws (typically `Route "…" is not defined` from a typo in `routeName`),
the helper logs `[real-router] Route "<name>" is not defined. The element
will render without an href attribute.` to `console.error` and returns
`undefined`. `<Link>` then renders `<a>` **without** an `href` attribute —
the page stays alive instead of crashing the render tree.

```tsx
// Typo in routeName → buildPath throws → buildHref returns undefined
<Link routeName="usres">Users</Link>
// Renders: <a class="..." onClick=...>Users</a>
// Console:  [real-router] Route "usres" is not defined. The element will render without an href attribute.
```

The click handler still fires, but `router.navigate("usres", …)` will reject
the navigation downstream. Use `<RouterErrorBoundary>` to catch the rejection
and surface a user-visible toast; rely on the console message during dev to
locate typos quickly.

Lock: `Link.test.tsx` "should render href-less <a> when buildHref throws"
(verifies `<a>` rendered, no `href` attribute, `console.error` called once).

## SSR

SSR-aware components and hooks ship from `@real-router/preact/ssr` — see the
"SSR-feature surface" section above for the eight exports. Server-side
integration contract:

- Create router per request (don't share across requests)
- Initialize with matched URL before `renderToString`
- `previousRoute` will be `undefined` on the server (first render of the request)
- Wrap the tree in `<HttpStatusProvider sink={createHttpStatusSink()}>` when
  any route may call `<HttpStatusCode>` — read `sink.code` after `renderToString`

## Performance

- `useRouteNode` uses cached `createRouteNodeSource` from `@real-router/sources` — consumers of the same `nodeName` share one router subscription
- `useRouterTransition` uses `getTransitionSource` — shared eager source per router
- `RouterErrorBoundary` uses `createDismissableError` — shared error source with integrated dismissal state (no local `useRouterError` hook)
- `useIsActiveRoute` delegates to the shared `createActiveSource` builder from `@real-router/sources` (#1427) — the fast/slow decision, and the `routeName !== ""` guard that keeps `useIsActiveRoute("")` in sync with `router.isActiveRoute("") === false`, live in one place for every adapter. Default options + a **non-empty** name resolve through the shared per-router `createActiveNameSelector` — one `router.subscribe` for any number of distinct-`routeName` Links (#1249); custom params / strict / `ignoreQueryParams: false` / hash / empty name fall to cached `createActiveRouteSource` (params hashed via `canonicalJson`, key-order-insensitive)
- `Link` uses `memo()` with custom `areLinkPropsEqual` comparator: `Object.is` for primitives + `style` + `children`, `shallowEqual` (from `dom-utils`) for `routeParams`/`routeOptions`. Nested objects in params are not deep-compared — consumers stabilize via `useMemo` if needed
- WeakMap caches in `@real-router/sources` are per-router, auto-evicted on router GC
