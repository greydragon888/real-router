# @real-router/solid

> Solid.js bindings with fine-grained signal-based reactivity

**Perf bench (CodSpeed):** this adapter's hot-path suite lives centrally, not in-package (the cross-cutting multi-framework harness needs one prebuild + one V8-flag-wrapped process — see `benchmarks/CLAUDE.md`): `benchmarks/adapter-bench/benches/solid.bench.mts` + `apps/solid.tsx` (three benches: navigate-param-swap / navigate-route-swap / back-forward — Solid needs no commit wrapper, signals propagate synchronously). Run locally: `pnpm -C benchmarks run bench:adapter solid`. Design record: IMPLEMENTATION_NOTES "adapter-bench slot".

## Entry Points

```tsx
// Main entry — client API (router, components, hooks, directive)
import {
  RouterProvider,
  useRouteNode,
  Link,
  RouteView,
} from "@real-router/solid";

// SSR-feature subpath — server/boundary components, deferred-data hooks, HTTP status sink
import {
  ClientOnly,
  ServerOnly,
  HttpStatusCode,
  useDeferred,
} from "@real-router/solid/ssr";
```

**Peer dependency:** `solid-js` >= 1.7.0

**Architecture:** Flat structure. All code lives in `src/`. Two entry points — main (`.`) and `/ssr` (full SSR-feature surface mirrored from `@real-router/react/ssr`); no legacy/modern split inside either entry. RouteView included but without `keepAlive` (Solid has no Activity API).

**RouterProvider Props:**

| Prop                 | Type                               | Default     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `router`             | `Router`                           | —           | Router instance (required)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `announceNavigation` | `boolean \| RouteAnnouncerOptions` | `false`     | Enable WCAG-compliant screen reader announcements on route change via `aria-live` region. Pass `{ prefix?, getAnnouncementText? }` to customize the announcement text — the callback falls back to the default `h1 → title → route-name` chain when it returns an empty string or throws.                                                                                                                                                                                      |
| `scrollRestoration`  | `ScrollRestorationOptions`         | `undefined` | Opt into scroll capture + restoration. Keyed by `(name, canonicalJson(params))`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `scrollSpy`          | `ScrollSpyOptions`                 | `undefined` | Opt into router-coordinated `IntersectionObserver`-driven URL hash spy (#575). `{ selector, rootMargin?, scrollContainer? }`. Empty `selector` / `undefined` = off. Wired through a dedicated `onMount` block (not `mountFeature` helper) so the `selector === ""` opt-out branches before the spy factory runs. Read once on mount (Solid `onMount` is non-reactive). Requires `browser-plugin` or `navigation-plugin`; under hash-plugin / memory-plugin → warn-once + NOOP. |
| `viewTransitions`    | `boolean`                          | `false`     | Opt into View Transitions API integration via `createViewTransitions` utility. Read once on `onMount` — non-reactive. No-op on SSR and browsers without `document.startViewTransition`. CSS customization via `::view-transition-*` pseudo-elements                                                                                                                                                                                                                            |

**Announcer internals:** `announceNavigation` enables the shared `createRouteAnnouncer` helper from `shared/dom-utils/route-announcer.ts`. The helper supports `prefix` (default `"Navigated to "`) and `getAnnouncementText(route)` customization options; pass a `RouteAnnouncerOptions` object as `announceNavigation` (`announceNavigation={{ getAnnouncementText }}`) to override them — `mountFeature` forwards the object to `createRouteAnnouncer`. With `announceNavigation` set to `true` the announcer speaks the default `"Navigated to <route.name>"`. A Safari-ready window of `100ms` queues early announcements (regression test: `RouterProvider.a11y.test.tsx` — `"rapid navigation before Safari-ready delay..."`); announcements are cleared after `7000ms`.

### Source Structure

```
src/
├── hooks/                      # All hooks (main + /ssr)
│   ├── useRouter.tsx
│   ├── useNavigator.tsx
│   ├── useRoute.tsx
│   ├── useRouteNode.tsx          # Uses cached createRouteNodeSource from @real-router/sources
│   ├── useRouteNodeStore.tsx
│   ├── useRouteStore.tsx
│   ├── useRouteUtils.tsx
│   ├── useRouterTransition.tsx   # Uses cached getTransitionSource
│   ├── useRouteExit.tsx          # Wraps subscribeLeave with abort + same-route guards
│   ├── useRouteEnter.tsx         # Fires on nav-driven mount via createEffect + transition.from
│   └── useDeferred.tsx           # /ssr — reads state.context.ssrDataDeferred[key] (ssr-data-plugin)
├── components/                 # Components (main + /ssr)
│   ├── Link.tsx
│   ├── RouterErrorBoundary.tsx # Declarative error handling via createDismissableError
│   ├── RouteView/              # Declarative route matching (no keepAlive)
│   │   ├── index.ts
│   │   ├── RouteView.tsx
│   │   ├── types.ts
│   │   ├── components.tsx      # Marker objects with Symbol-based $$type (Match, Self, NotFound)
│   │   └── helpers.tsx
│   ├── ClientOnly.tsx          # /ssr — createSignal(false) + onMount + <Show>
│   ├── ServerOnly.tsx          # /ssr — symmetric inverse of ClientOnly
│   ├── Streamed.tsx            # /ssr — cross-adapter <Suspense> alias
│   ├── Await.tsx               # /ssr — createResource over a deferred promise
│   ├── HttpStatusCode.tsx      # /ssr — writes code into the nearest sink during render
│   └── HttpStatusProvider.tsx  # /ssr — provides HttpStatusSink via Solid context
├── directives/                 # Directives
│   └── link.tsx                # use:link directive + JSX.Directives augmentation (shipped to consumers, #976)
├── utils/
│   ├── createHttpStatusSink.ts # /ssr — fresh { code: undefined } sink per request
│   └── createMountedSignal.ts  # createSignal(false) + onMount(true) — drives ClientOnly/ServerOnly
├── dom-utils/                  # Symlink → shared/dom-utils/ (see root CLAUDE.md)
│   ├── link-utils.ts           # shouldNavigate, buildHref, buildActiveClassName, applyLinkA11y, shallowEqual, navigateWithHash
│   ├── route-announcer.ts      # createRouteAnnouncer (a11y aria-live region)
│   ├── scroll-restore.ts       # createScrollRestoration (opt-in capture + restore)
│   ├── scroll-spy.ts           # createScrollSpy (IntersectionObserver → URL hash, #575)
│   ├── view-transitions.ts     # createViewTransitions (subscribeLeave-based VT integration)
│   ├── direction-tracker.ts    # createDirectionTracker (back/forward annotation)
│   └── index.ts                # barrel
├── RouterProvider.tsx
├── context.ts
├── createSignalFromSource.ts   # Signal bridge (createSignal + onCleanup)
├── createStoreFromSource.ts    # Store bridge (createStore + reconcile)
├── index.tsx                   # Main entry — client API
├── ssr.tsx                     # SSR-feature subpath — client/server boundary components, deferred-data hooks, HTTP status sink
├── types.ts
└── constants.ts
```

### Build (rollup + babel-preset-solid)

Dual-entry config — main + `/ssr` produce isomorphic ESM/CJS bundles:

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

## Architecture

**Dual Context Pattern:**

- `RouterContext` - `{ router, navigator, routeSelector }` (all stable, never reactive). `routeSelector(routeName)` is the `createSelector`-backed O(1) active-route test consumed by Link's fast path.
- `RouteContext` - `Accessor<RouteState>` (reactive signal, updates on every navigation)

**Subscription Layer:** Hooks use `@real-router/sources` (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`, `getTransitionSource`, `createDismissableError`) via `createSignalFromSource` (createSignal + onCleanup) or `createStoreFromSource` (createStore + reconcile).

## Hooks

| Hook                               | Returns                                                                                                                     | Reactive?                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `useRouter()`                      | `Router`                                                                                                                    | Never                                |
| `useNavigator()`                   | `Navigator` — exposes navigate, subscribe, subscribeLeave, isLeaveApproved, and more                                        | Never                                |
| `useRoute()`                       | `Accessor<RouteState>`                                                                                                      | Every navigation                     |
| `useRouteNode(name)`               | `Accessor<RouteState>`                                                                                                      | Only when node active/inactive       |
| `useRouteUtils()`                  | `RouteUtils`                                                                                                                | Never                                |
| `useRouterTransition()`            | `Accessor<RouterTransitionSnapshot>` — includes `isLeaveApproved` field                                                     | On transition start/end              |
| `useRouteStore()`                  | `RouteState` (store)                                                                                                        | Granular — per-property              |
| `useRouteNodeStore(name)`          | `RouteState` (store)                                                                                                        | Granular — per-property, node-scoped |
| `useRouteExit(handler, options?)`  | `void` — wraps `router.subscribeLeave` with abort + same-route guards (handler captured at hook call)                       | Never (subscription is stable)       |
| `useRouteEnter(handler, options?)` | `void` — fires once on nav-driven mount via `useRoute()` accessor + `route.transition.from` (handler captured at hook call) | Never (effect is fine-grained)       |

## Exports

| Export                             | Type      | Description                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RouterProvider`                   | Component | Context provider for router instance                                                                                                                                                                                                                                     |
| `Link`                             | Component | Navigation link with active state detection                                                                                                                                                                                                                              |
| `RouteView`                        | Component | Declarative route matching                                                                                                                                                                                                                                               |
| `RouterErrorBoundary`              | Component | Declarative navigation error UI (auto-resets on next successful navigation)                                                                                                                                                                                              |
| `useRouter()`                      | Hook      | Get router instance                                                                                                                                                                                                                                                      |
| `useNavigator()`                   | Hook      | Get navigator instance                                                                                                                                                                                                                                                   |
| `useRoute()`                       | Hook      | Subscribe to all route changes                                                                                                                                                                                                                                           |
| `useRouteNode(name)`               | Hook      | Subscribe to specific node changes                                                                                                                                                                                                                                       |
| `useRouteUtils()`                  | Hook      | Get route tree utilities                                                                                                                                                                                                                                                 |
| `useRouterTransition()`            | Hook      | Subscribe to transition state                                                                                                                                                                                                                                            |
| `useRouteStore()`                  | Hook      | Store-based granular route state                                                                                                                                                                                                                                         |
| `useRouteNodeStore(name)`          | Hook      | Store-based granular node-scoped state                                                                                                                                                                                                                                   |
| `useRouteEnter(handler, options?)` | Hook      | Fires once on nav-driven mount via `createEffect` + `transition.from`                                                                                                                                                                                                    |
| `useRouteExit(handler, options?)`  | Hook      | Wraps `router.subscribeLeave` with abort + same-route guards                                                                                                                                                                                                             |
| `createSignalFromSource`           | Primitive | Bridge `RouterSource<T>` → Solid accessor                                                                                                                                                                                                                                |
| `createStoreFromSource`            | Primitive | Bridge `RouterSource<T>` → Solid store                                                                                                                                                                                                                                   |
| `link`                             | Directive | Low-level navigation directive (`use:link`)                                                                                                                                                                                                                              |
| `RouterContext`                    | Context   | Solid context carrying `RouterContextValue` (`{ router, navigator, routeSelector }`). Prefer `useRouter` / `useNavigator` for read-only access — consume `RouterContext` directly only for advanced composition (custom hook bridges, testing, multi-provider wrappers). |
| `RouteContext`                     | Context   | Solid context carrying `Accessor<RouteState>` — the reactive route snapshot. Prefer `useRoute` for normal use; consume directly when building custom hooks that need to layer effects on the existing accessor.                                                          |
| `RouterContextValue`               | Type      | Shape of `RouterContext` — `{ router, navigator, routeSelector }`. Re-exported for type-only consumers writing their own provider wrappers.                                                                                                                              |

## Differences from React and Preact Adapters

| Aspect                    | React/Preact                            | Solid                            |
| ------------------------- | --------------------------------------- | -------------------------------- |
| Hook return types         | Values                                  | Accessors (`Accessor<T>`)        |
| `useSyncExternalStore`    | Native or polyfill                      | `createSignalFromSource`         |
| `memo()`                  | Required                                | Not needed — components run once |
| `useCallback`             | Required for stable refs                | Not needed                       |
| Params stabilization      | `canonicalJson` in sources              | `canonicalJson` in sources       |
| Active class on Link      | `className` string concat               | `classList` object               |
| Context count             | 3 (Router, Navigator, Route)            | 2 (Router+Navigator, Route)      |
| `keepAlive` / Activity    | React 19.2+ only                        | Not available                    |
| Entry points              | Main + Legacy (React) / Single (Preact) | Single                           |
| Build tool                | tsdown                                  | rollup + babel-preset-solid      |
| RouteView child detection | Element type checking                   | Symbol-based `$$type` markers    |

## Promise-Based Navigation

Link uses `.catch(() => {})` to suppress unhandled rejection warnings:

```typescript
router.navigate(routeName, routeParams, routeOptions).catch(() => {});
```

## SSR-feature surface — `@real-router/solid/ssr`

All SSR-aware components/hooks live at the `/ssr` subpath. Eight exports total — symmetric with `@real-router/react/ssr`:

| Export                                        | Kind      | Purpose                                                                                                                                                                                                                                                         |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ClientOnly fallback={…}>`                   | component | `createSignal(false)` + `onMount` + `<Show>` — SSR emits `fallback`, post-mount swap reveals `children`.                                                                                                                                                        |
| `<ServerOnly fallback={…}>`                   | component | Symmetric inverse.                                                                                                                                                                                                                                              |
| `<Streamed fallback={…}>`                     | component | Cross-adapter alias for Solid `<Suspense fallback={…}>`.                                                                                                                                                                                                        |
| `<Await<T> name="key">{(value) => …}</Await>` | component | Reads a deferred promise via `createResource` — pairs with `defer()` from `ssr-data-plugin`. **Falsy values reach the render-prop:** the gate is `resource.state === "ready"` (not truthiness), so `0`, `false`, `null`, and `""` still call `children(value)`. |
| `<HttpStatusCode code={N}/>`                  | component | Render-time HTTP status declaration. Writes `code` to the nearest `<HttpStatusProvider>`'s sink during render and returns `null`. Last write wins. No-op without provider.                                                                                      |
| `<HttpStatusProvider sink={...}>`             | component | Provides an `HttpStatusSink` to descendant `<HttpStatusCode />` instances via Solid context.                                                                                                                                                                    |
| `useDeferred<T>(key)`                         | hook      | Returns the deferred Promise accessor. **Missing key → forever-pending promise** (`NEVER_PROMISE` sentinel): surfaces loader/consumer key drift as a visible `<Suspense>` fallback rather than a silent runtime error. Use a key the loader actually declared.  |
| `createHttpStatusSink()`                      | utility   | Returns a fresh `HttpStatusSink` (`{ code: number \| undefined }`) — construct one per request, read `sink.code` after `renderToString`/`renderToStream` to apply to the response.                                                                              |

Built on `onMount` + `<Show>` for the boundary components (Solid runtime guarantees `onMount` never fires during `renderToString`/`renderToStream`, so the initial render emits the SSR-side branch). `<HttpStatusCode>` reads `useContext` and writes during render — no DOM, no hydration mismatch.

```tsx
import {
  ClientOnly,
  ServerOnly,
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/solid/ssr";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

// Render-time HTTP status decision
<HttpStatusCode code={404} />

// entry-server.tsx
const sink = createHttpStatusSink();
const html = renderToString(() => (
  <HttpStatusProvider sink={sink}>
    <App />
  </HttpStatusProvider>
));
response.status(sink.code ?? 200).send(html);
```

## Gotchas

### `useRouteExit` / `useRouteEnter` Handler Is Captured At Init

Solid components run **once** at mount — the `handler` argument is captured in
closure at the call site and is **not reactive**. Replacing the handler
reference between renders has no effect (there are no renders). If you need
behavior that varies over time, derive it from a signal **inside** the handler
body:

```tsx
const [draft, setDraft] = createSignal<Draft | null>(null);

useRouteExit(async ({ signal }) => {
  const current = draft(); // read signal inside handler
  if (current) await api.save(current, { signal });
});
```

Same applies to `useRouteEnter`. This contrasts with React/Preact, where
`useRouteExit` keeps a `handlerRef` that's updated on every render.

### Synchronous `router.navigate()` inside a `useRouteExit` handler throws `REENTRANT_NAVIGATION`

A `useRouteExit` exit handler runs as a transition-event listener — it is
forwarded into `router.subscribeLeave` with no isolation. Core bans a
**synchronous** `router.navigate()` (and `navigateToDefault` / `navigateToState`
/ `navigateToNotFound`) called from inside such a listener: it throws
`RouterError(REENTRANT_NAVIGATION)` at the facade (#1030–#1035), so a redirect
written straight into the handler body tears the exit down instead of navigating.
**Defer it** out of the listener call stack — wrap in `queueMicrotask(...)`, or
`await` anything first (any `await` / `.then` moves the call off the listener
stack, where navigation is allowed):

```tsx
useRouteExit(({ nextRoute }) => {
  if (nextRoute.name === "checkout" && !isAuthed()) {
    // WRONG — throws REENTRANT_NAVIGATION (synchronous, inside the listener):
    //   router.navigate("login");
    queueMicrotask(() => router.navigate("login")); // CORRECT — deferred
  }
});
```

The same ban applies to `useRouteEnter` handlers.

### Hooks Return Accessors, Not Values

```typescript
const routeState = useRoute(); // Accessor<RouteState>
const { route } = routeState(); // Call it to read the value

const nodeState = useRouteNode("users");
const { route } = nodeState(); // Same pattern
```

### Never Destructure Props

Solid props are getters. Destructuring breaks reactivity:

```typescript
// WRONG — loses reactivity
function MyComponent({ routeName, routeParams }) { ... }

// CORRECT — access via props
function MyComponent(props) {
  const href = createMemo(() => router.buildPath(props.routeName, props.routeParams));
}
```

### useRouter vs useRoute

```typescript
const router = useRouter(); // Stable — never reactive
const routeState = useRoute(); // Accessor — call to read, reactive
const { route } = routeState(); // Read inside reactive context
```

### useRoute throws when route is undefined

`useRoute()` returns `Accessor<{ route: State<P>; previousRoute?: State }>` —
`route` is **non-nullable**. The hook throws if the router has no active state
(unstarted, stopped, disposed) at the point of subscription.
`useRouteNode(name)` and `useRouteStore()` stay nullable — node inactivity is
a legitimate business state, not a lifecycle error.

```tsx
// Before:
const state = useRoute();
return <Show when={state().route}>{(r) => <p>{r().name}</p>}</Show>;

// After (route is guaranteed):
const state = useRoute();
return <p>{state().route.name}</p>;
```

### Typed route params via generic

`useRoute<P>()` accepts an optional generic so `route.params` is typed without `as` casts at the call site. The cast happens once inside the hook; no runtime change.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const routeState = useRoute<SearchParams>();
const q = routeState().route.params.q; // typed as string
```

### useRouteNode Semantics

```typescript
useRouteNode(""); // Root — ALL route changes
useRouteNode("users"); // Only "users" and "users.*" routes
```

### previousRoute is Global

```typescript
// Navigation: users.list → items → users.view
useRouteNode("users")().previousRoute; // = items (not users.list!)
```

### createSignalFromSource Ownership

`createSignalFromSource` calls `onCleanup` — it must be called inside a reactive owner (component, `createRoot`, etc.). Don't call it at module level.

### RouteView Marker Objects

`Match`, `Self`, and `NotFound` return plain objects, not JSX elements. They carry a `$$type` Symbol property that `RouteView` uses to identify them. Don't try to render them directly or check their type with `instanceof`.

```tsx
// WRONG — Match is not a real component in the JSX sense
const el = (
  <RouteView.Match segment="users">
    <UsersPage />
  </RouteView.Match>
);
el.type === RouteView.Match; // false — this is a marker object

// CORRECT — use inside RouteView only
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage />
  </RouteView.Match>
</RouteView>;
```

### `RouteView.Self` — render parent node exactly

`<RouteView.Self>` fires when the active route name **equals** the parent's `nodeName` (exact match, not descendant). Use it for the "index" rendering at a node:

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersIndex /> {/* active route name === "users" exactly */}
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile /> {/* "users.profile" or any descendant */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

**Precedence inside one RouteView (see `helpers.tsx` `buildRenderList`):**

1. `<Match>` first-wins — if any `<Match>` activates, both `<Self>` and `<NotFound>` are suppressed
2. `<Self>` first-wins — only the first `<RouteView.Self>` contributes; later instances are ignored
3. `<NotFound>` first-wins — only the first `<RouteView.NotFound>` contributes; later instances are ignored (#1439, symmetric with `<Self>`)
4. `<Self>` wins over `<NotFound>` if no `<Match>` activates (rare edge — applies only when `nodeName === UNKNOWN_ROUTE`)

Accepts an optional `fallback` prop (`JSX.Element`) — symmetric with `<Match fallback>`, wraps children in `<Suspense>`. Use with `lazy()` to defer the index chunk.

### Match `fallback` Prop (Suspense)

`Match` accepts an optional `fallback` prop (`JSX.Element`). When provided, the matched content is wrapped in Solid's `<Suspense>` with that element as the fallback. Use this with `lazy()` to show a loading state while the component chunk loads.

```tsx
import { lazy } from "solid-js";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" fallback={<Spinner />}>
    <LazyDashboard />
  </RouteView.Match>
</RouteView>;
```

Without `fallback`, no `<Suspense>` boundary is added — the prop is entirely optional.

### No keepAlive

RouteView renders only the active match. On navigation, the previous component disposes completely — state is lost:

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage /> {/* Disposes when navigating away */}
  </RouteView.Match>
</RouteView>
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

### Empty `routeName` Link is inactive in every router state (#1427)

`<Link routeName="">` is a misuse pattern (an empty name matches no route). The
canonical answer is `router.isActiveRoute("") === false`, and the Link honors it
in **every** state. The `useFastPath` predicate (`components/Link.tsx`) guards
`routeName !== ""`, so an empty name skips the `routeSelector` fast path — whose
unstarted sentinel (`routeSignal().route?.name ?? ""`) would otherwise make
`isRouteActive("", "") === true` and light the Link up before `router.start()` —
and falls to the slow `createActiveRouteSource`, which reads
`router.isActiveRoute("") === false` whether the router is unstarted, stopped, or
on a real route.

```tsx
// A misused empty-name Link is never active (tracks router.isActiveRoute("")):
<Link routeName="" activeClassName="active">Home</Link>  // never "active"

// CORRECT — pass a real route name.
<Link routeName="home" activeClassName="active">Home</Link>
```

The `isRouteActive` helper itself is **unchanged** — `isRouteActive("", "")` still
returns `true` (its edge cases stay property-locked in
`tests/property/routerProvider.properties.ts`, whose Invariant 7 pins only the
non-empty arms). The guard lives at the Link level (`useFastPath`), routing the
misuse to the canonical slow path. Locked by `tests/functional/Link.test.tsx`
(unstarted empty-name inactive) + `tests/integration/Link.test.tsx` (inactive
before **and** after start).

### Link Props Are Captured at Init (Slow Path)

Solid components run once. Link's slow-path `isActive` subscription (`createActiveRouteSource`) captures `routeName`, `routeParams`, `activeStrict`, `ignoreQueryParams` at init time — they are **not reactive**. If the parent dynamically changes these props, the active class won't update.

The fast path (`createSelector`) IS reactive for `routeName` because `local.routeName` is read inside the accessor each time.

**Slow path is used when:** `activeStrict=true`, `ignoreQueryParams=false`, custom `routeParams`, or `hash !== undefined` (#532).

The `useFastPath` decision itself is also captured at init — changing `activeStrict`/`ignoreQueryParams`/`routeParams`/`hash` mid-session does NOT switch fast↔slow path. The Link stays on whichever path it chose on first render. In particular, if `hash` flips from `undefined` to a value (or vice versa) mid-session, the path decision does not flip — workaround: force remount via `<Show keyed when={...}>` (see example below).

**Workaround:** Use static props on Link. For dynamic route switching, force a fresh Link instance per route via `<Show keyed>` — Solid mounts a new subtree every time the `when` accessor's value changes by reference, which gives the slow path a fresh init capture.

**Root cause:** `createActiveRouteSource` API accepts values, not getters. Fixing this requires Sources API changes.

```tsx
// CORRECT — static props, works fine
<Link routeName="users" activeStrict />

// CAUTION — dynamic routeName on slow path, active class won't react
<Link routeName={dynamicRoute()} activeStrict />

// WORKAROUND — Show keyed forces remount when the route changes
//
// Solid has no React-style `key` prop that triggers remount; passing
// `key={...}` to Link is silently ignored. The idiomatic remount lever is
// `<Show keyed>` (or `<Index>` / `<For>` for lists), which throws away the
// inner subtree and creates a fresh one whenever the keyed value changes.
<Show keyed when={dynamicRoute()}>
  {(routeName) => <Link routeName={routeName} activeStrict />}
</Show>
```

### `<Link hash>` Prop (#532)

`hash?: string` — URL fragment (decoded, no leading `#`). Tri-state:

- `undefined` (default) — preserves the current `state.context.url.hash` on click.
- `""` — clears the hash.
- `"value"` — sets the hash; click routes through `navigateWithHash`, which auto-adds `force: true, hashChange: true` when the requested hash differs from `state.context.url.hash` on the same route+params (bypasses core's `SAME_STATES`).

`hash` participates in the cached `createActiveRouteSource` key on the slow path. Active state is hash-aware: when `hash` is set, the Link is active iff route matches AND `state.context.url.hash` equals expected. The fast-path `routeSelector` is hash-agnostic — passing `hash` forces the slow path (see "Link Props Are Captured at Init (Slow Path)" above for the init-capture caveat). Hash-plugin runtime always returns `false` for hash-aware active checks.

### use:link Options Are Captured Once

The `use:link` directive calls `accessor()` once at init. If the accessor returns reactive values, subsequent changes are **not tracked** — href, active class, and click target remain initial values.

**Root cause:** Same as Link slow path — `createActiveRouteSource` accepts values, not getters.

For reactive navigation links, use the `<Link>` component instead.

> **Testing note (audit-4 LOW recommendation #3 — corrected 2026-06-26):**
> The signal-reactivity gotcha IS unit-tested. `link-directive.test.tsx` →
> `"should NOT track Solid signal changes"` mounts `<a use:link={{ routeName: signal() }}>`,
> flips the signal, and asserts `href` stays at its captured-once value. This works because
> `vitest.config.mts` runs `vite-plugin-solid` — the **same** `babel-preset-solid` pipeline
> as production — so the JSX compiles for real (the earlier claim that "vitest does not
> provide a Solid JSX compile pipeline in isolation" was wrong; the plugin is in the config).
> The test uses the object-literal form `{ routeName: signal() }` with the signal read inside —
> the only valid `use:link` form (see "use:link Takes the OBJECT Form" below; #976).
> `examples/web/solid/use-link-directive` remains as an additional end-to-end pin (full Vite
> build + browser), no longer the only one.

### use:link Requires useRouter Context

The `link` directive calls `useRouter()` internally, so it must be used inside a component that has access to the router context (i.e., inside `<RouterProvider>`):

```tsx
// CORRECT — inside RouterProvider
<RouterProvider router={router}>
  <a use:link={{ routeName: "home" }}>Home</a>
</RouterProvider>

// WRONG — outside RouterProvider, useRouter() throws
<a use:link={{ routeName: "home" }}>Home</a>
```

### use:link Takes the OBJECT Form, Not an Accessor (#976)

Pass the options **object** directly. Solid's compiler wraps a directive value
into an accessor at compile time (`use:link={X}` → `link(el, () => X)`), so the
value you write IS the options object the directive reads:

```tsx
// CORRECT — object form (canonical). babel wraps it into the accessor.
<a use:link={{ routeName: "users", routeParams: { id: "123" } }}>User</a>

// WRONG — accessor form double-wraps into `() => (() => options)`, so the
// directive receives a FUNCTION instead of the options. The <a> never gets an
// href and clicks navigate nowhere. TypeScript rejects this with TS2322.
<a use:link={() => ({ routeName: "users", routeParams: { id: "123" } })}>User</a>
```

The `JSX.Directives.link` augmentation (in `src/directives/link.tsx`) types the
value as `LinkDirectiveOptions | undefined` and is shipped in the published
declarations, so consumers get the same TS2322 on the accessor form that the
package's own tests do — the form is rejected uniformly everywhere.

The directive captures the options **once** at init (see "use:link Options Are
Captured Once" above) — reactive values inside the object are NOT tracked. For
reactive route switching, use the `<Link>` component instead.

### Hook Caching via `@real-router/sources`

All source caches live inside `@real-router/sources` — no local WeakMaps in this adapter. N components calling `useRouteNode("users")` against the same router share ONE source — one router subscription, one `shouldUpdate` call per navigation, not N.

| Hook / Component          | Source factory                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRoute()`              | **non-cached** `createRouteSource(router)` — `RouterProvider` builds ONE instance and shares it via `RouteContext`; every `useRoute()` reads that same signal (shared per-Provider through context, **not** via the sources cache) |
| `useRouteStore()`         | **non-cached** `createRouteSource(router)` — a **fresh** source per call: each consumer gets its own router subscription + reconcile pass (NOT shared — see the note below)                                                        |
| `useRouteNode(name)`      | cached `createRouteNodeSource(router, nodeName)`                                                                                                                                                                                   |
| `useRouteNodeStore(name)` | cached `createRouteNodeSource(router, nodeName)`                                                                                                                                                                                   |
| `useRouterTransition()`   | cached `getTransitionSource(router)`                                                                                                                                                                                               |
| `RouterErrorBoundary`     | cached `createDismissableError(router)` — shared error source with integrated dismissal state                                                                                                                                      |
| Link (slow path)          | cached `createActiveRouteSource(router, name, params, opts)` — params hashed via `canonicalJson` (key-order-insensitive)                                                                                                           |

> **`useRoute()` vs `useRouteStore()` sharing.** `useRoute()` is shared
> per-`RouterProvider`: the Provider builds one `createRouteSource` and hands the
> same accessor to every `useRoute()` consumer through `RouteContext` — one
> router subscription for the whole tree. `useRouteStore()` is **not** shared:
> it calls `createRouteSource(router)` itself on every invocation (the factory
> is non-cached by design), so N store consumers create **N** sources → N router
> subscriptions and N reconcile passes per navigation. The lifecycle is still
> correct (each bridge's `onCleanup` removes its own subscription — no leak), but
> for a single shared store call `useRouteStore()` once high in the tree and pass
> the store down through your own context.

Routers are WeakMap keys in sources, so per-router state is automatically released when the router is GC'd — no explicit teardown needed. Lazy sources disconnect from the router when their last listener unsubscribes. On re-subscription **both lazy sources reconcile** their snapshot — `createRouteNodeSource` **and** `createRouteSource`, since sources 0.9.0 ([#765](https://github.com/greydragon888/real-router/issues/765)) — so signals never observe stale values: a lifted `createRouteSource` bridged through `createSignalFromSource` and re-subscribed after a disconnect (e.g. the only reader behind a `<Show>` toggled off → navigate → on) catches up the missed navigation in `onFirstSubscribe` (`stabilizeState` against the current router state) and reads the **current** route, not the stale pre-disconnect snapshot. Pinned by `tests/functional/reactive-lifecycle.test.tsx:32` (P1: "a lifted createRouteSource bridged inside `<Show>` is fresh after off → navigate → on"). No workaround needed — the sole reader may be gated behind `<Show>`.

## SSR

SSR-friendly without a separate entry. The same `RouterProvider`, `Link`, and composables work under `solid-js/web` (`renderToString` / `renderToStream`) — no SSR-specific imports, no `if (typeof window !== "undefined")` shims, no platform branches in hot paths.

Verified end-to-end across three example apps:

- [`examples/web/solid/ssr-examples/ssr/`](../../examples/web/solid/ssr-examples/ssr) — classical `renderToString` + `generateHydrationScript()` + cookie-based DI + `canActivate` guards + query params + nested loaders (~27 e2e scenarios)
- [`examples/web/solid/ssr-examples/ssr-streaming/`](../../examples/web/solid/ssr-examples/ssr-streaming) — `renderToStream` + `<Suspense>` + `createResource` + `<ErrorBoundary>` (true OOO Suspense placeholders + selective hydration, ~15 e2e scenarios incl. `<template id="...">` chunk proof)
- [`examples/web/solid/ssr-examples/ssg/`](../../examples/web/solid/ssr-examples/ssg) — `getStaticPaths` + per-route meta tags + dual-mode mount (`hydrate` vs `render` ternary) + 404.html + sitemap.xml (~17 e2e scenarios)

### Verified Patterns

- **`generateHydrationScript()` is mandatory** — Solid's only adapter-level constraint that differs from React/Vue. The function returns the inline `<script>` that bootstraps `window._$HY`, the runtime that Solid's hydration markers (`data-hk`) and OOO splice scripts (`$df(...)`) require. The server returns it as a separate `RenderResult` field; the Express layer injects it via a `<!--ssr-hydration-script-->` placeholder ahead of the body
- **`vite-plugin-solid({ ssr: true })` is mandatory** — flips `hydratable: true` for both client and server bundles and `generate: 'ssr'` for the server. Without it, the client bundle has no hydration markers and the first render mismatches
- **Resolve `@real-router/internal-source` via `ssr.resolve.conditions`** — Solid adapter ships compiled DOM output in `dist/` (uses `solid-js/web.template()` at module init). The SSR build crashes with "Client-only API called on the server side" if the dist bundle is loaded. Setting both `resolve.conditions` and `ssr.resolve.conditions` to `["@real-router/internal-source", "development"]` plus `ssr.noExternal: ["@real-router/solid"]` routes the SSR build to the source `.tsx` so `vite-plugin-solid` recompiles it for the SSR codegen
- **`hydrate` and `render` are different functions** — both live in `solid-js/web`. `render(fn, node)` mounts fresh; `hydrate(fn, node)` claims existing DOM. Mixing them silently produces flicker. SSG dual-mode mount: `const factory = rootElement.firstElementChild ? hydrate : render; factory(() => <RouterProvider>…</RouterProvider>, root)`
- **`onMount` is SSR-safe** — Solid guarantees that `onMount` callbacks never fire during `renderToString`/`renderToStream`. The adapter's `RouterProvider` uses `onMount` for `announceNavigation` / `scrollRestoration` / `scrollSpy` / `viewTransitions` setup; all are correctly client-only by Solid runtime contract, no manual `isServer` branching needed
- **Top-level `<Show>` for UNKNOWN_ROUTE**, not `<RouteView.NotFound>` — `<RouteView.NotFound>` as a sibling to multiple `<RouteView.Match>` blocks triggers a hydration mismatch in vite-plugin-solid 2.11.x ("Hydration Mismatch. Unable to find DOM nodes for hydration key"). The server allocates hk only for the rendered branch, the client allocates hk for every Match marker — counters drift and the first paint dies. App-level `<Show when={routeState().route.name !== UNKNOWN_ROUTE} fallback={<NotFound />}>` keeps RouteView free of conditional siblings and matches the React/Vue pattern. Issue scope: example-side workaround; root-cause investigation in vite-plugin-solid is tracked separately
- **No `browser-plugin` on the server** — register it only in `entry-client.tsx`. The server uses bare `cloneRouter(...).start(url)` with the explicit URL string; `browser-plugin` exists for client-side `popstate` + `pushState` and would touch `globalThis.history`/`window.location` during SSR

See also: [Solid Integration — Server-Side Rendering](https://github.com/greydragon888/real-router/wiki/Solid-Integration#server-side-rendering) for full server + client entry shapes, and [Streaming SSR — Solid Counterpart](https://github.com/greydragon888/real-router/wiki/Streaming-SSR#solid-counterpart) for the React/Vue/Solid comparison.

## Performance

- `useRouteNode` uses cached `createRouteNodeSource` from `@real-router/sources` — one router subscription per `(router, nodeName)` shared across all consumers
- No `memo()` needed — Solid components run once, signals handle granular updates
- No params stabilization needed — `createActiveRouteSource` hashes params via `canonicalJson` (key-order-insensitive)
- `Link` uses `createSelector` from `RouterProvider` for O(1) active route detection (only 2 links update per navigation instead of n). Falls back to cached per-(router, key) `createActiveRouteSource` when `activeStrict`, custom `routeParams`, or `ignoreQueryParams: false` are used.
- All WeakMap caches live in `@real-router/sources` — auto-evicted on router GC, no local caches in this adapter
- `EMPTY_PARAMS` and `EMPTY_OPTIONS` frozen singletons avoid allocation for default props
