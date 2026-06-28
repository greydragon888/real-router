# @real-router/vue

> Vue 3 bindings with proxy-based reactive refs

## Single Entry Point

```typescript
import { RouterProvider, useRouteNode, Link, RouteView } from '@real-router/vue';
```

**Peer dependency:** `vue` >= 3.3.0

**Architecture:** Flat structure. All code lives in `src/`. Single entry point — no legacy/modern split. RouteView included with native `keepAlive` support via Vue's `<KeepAlive>`.

**RouterProvider Props:**

| Prop                  | Type      | Default | Description                                                                                    |
| --------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------- |
| `router`              | `Router`  | —       | Router instance (required)                                                                     |
| `announceNavigation`  | `boolean` | `false` | Enable WCAG-compliant screen reader announcements on route change via `aria-live` region       |
| `scrollRestoration`   | `ScrollRestorationOptions` | `undefined` | Opt into scroll capture + restoration. Reactive — toggling via ref creates/destroys the utility. Shape: `{ mode?: "restore"\|"top"\|"native", anchorScrolling?: boolean, behavior?: ScrollBehavior, storageKey?: string, scrollContainer?: () => HTMLElement\|null }` |
| `scrollSpy`           | `ScrollSpyOptions` | `undefined` | Opt into router-coordinated `IntersectionObserver`-driven URL hash spy (#575). Shape: `{ selector: string, rootMargin?: string, scrollContainer?: () => HTMLElement\|null }`. Reactive — toggling via ref creates/destroys the utility (watched by primitive fields, so inline objects with the same `selector`/`rootMargin` don't thrash). Empty `selector` / `undefined` = off. Requires `browser-plugin` or `navigation-plugin`; under hash-plugin / memory-plugin → warn-once + NOOP. |
| `viewTransitions`     | `boolean` | `false` | Opt into View Transitions API integration via `createViewTransitions` utility. Reactive — toggling creates/destroys the utility. No-op on SSR and browsers without `document.startViewTransition`. CSS customization via `::view-transition-*` pseudo-elements |

### Source Structure

```
src/
├── composables/                # All composables
│   ├── useRouter.ts
│   ├── useNavigator.ts
│   ├── useRoute.ts
│   ├── useRouteNode.ts           # Uses cached createRouteNodeSource from @real-router/sources
│   ├── useIsActiveRoute.ts       # Internal — used by Link (cached createActiveRouteSource)
│   ├── useRouteUtils.ts
│   ├── useRouterTransition.ts    # Uses cached getTransitionSource
│   ├── useRouteExit.ts           # Wraps subscribeLeave with abort + same-route guards
│   ├── useRouteEnter.ts          # Fires on nav-driven mount via watch(route) + transition.from
│   └── useDeferred.ts            # /ssr — reads state.context.ssrDataDeferred[key]
├── components/                 # Components
│   ├── Link.ts
│   ├── RouterErrorBoundary.ts  # Declarative error handling — uses createDismissableError
│   ├── ClientOnly.ts           # /ssr — ref(false) + onMounted swap
│   ├── ServerOnly.ts           # /ssr — symmetric inverse of ClientOnly
│   ├── Streamed.ts             # /ssr — cross-adapter <Suspense> alias
│   ├── Await.ts                # /ssr — async setup() over deferred[key]
│   ├── HttpStatusCode.ts       # /ssr — writes sink.code via inject(HTTP_STATUS_KEY)
│   └── HttpStatusProvider.ts   # /ssr — provides HttpStatusSink via InjectionKey
│   └── RouteView/              # Declarative route matching (with keepAlive)
│       ├── index.ts
│       ├── RouteView.ts
│       ├── types.ts
│       ├── components.ts       # Match, Self, NotFound marker components (render: null)
│       └── helpers.ts          # collectElements, buildRenderList, evaluateMatch, isSegmentMatch
├── directives/                 # Directives
│   └── vLink.ts                # v-link directive (router stack for nested providers)
├── dom-utils/                  # Symlink → shared/dom-utils/ (cross-adapter DOM helpers)
│   ├── index.ts                # barrel
│   ├── link-utils.ts           # shouldNavigate, buildHref, navigateWithHash, buildActiveClassName, shallowEqual, applyLinkA11y
│   ├── route-announcer.ts      # createRouteAnnouncer — WCAG aria-live announcements
│   ├── scroll-restore.ts       # createScrollRestoration — opt-in scroll capture + restore
│   ├── scroll-spy.ts           # createScrollSpy — IntersectionObserver → URL hash (#575)
│   └── view-transitions.ts     # createViewTransitions — subscribeLeave-based VT integration
├── utils/
│   └── createHttpStatusSink.ts # /ssr — fresh { code: undefined } sink per request
├── RouterProvider.ts
├── context.ts                  # Four InjectionKeys — three public (RouterKey, NavigatorKey, RouteKey) + one @internal (HTTP_STATUS_KEY for /ssr)
├── useRefFromSource.ts         # Ref bridge (shallowRef + onScopeDispose)
├── setupRouteProvision.ts      # Internal — shared route subscription setup (RouterProvider + createRouterPlugin)
├── index.ts                    # Main entry — client API
├── ssr.ts                      # /ssr — SSR-feature subpath (8 exports)
├── types.ts
├── constants.ts
└── createRouterPlugin.ts       # Vue Plugin factory (for app.use())
```

### Build (tsdown)

Single-entry config:

```
dist/
├── esm/
│   ├── index.mjs
│   └── index.d.mts
└── cjs/
    ├── index.js
    └── index.d.ts
```

## Architecture

**Triple Injection Key Pattern (public):**

- `RouterKey` — Router instance (stable, never reactive)
- `NavigatorKey` — Navigator (stable, derived from router)
- `RouteKey` — `RouteContext<P>` from `types.ts` — `{ navigator, route: Readonly<Ref<State<P> | undefined>>, previousRoute: Readonly<Ref<State | undefined>> }`. The underlying ref is created via `shallowRef` (RouterProvider/createRouterPlugin) or `computed` (useRouteNode); consumers only need `.value` read access.

A fourth `@internal` key — `HTTP_STATUS_KEY` (provider/inject pair behind `<HttpStatusProvider>` / `<HttpStatusCode>`) — lives in the same module but is not exported from `index.ts`; it is consumed exclusively by the `/ssr` subpath.

**Subscription Layer:** Composables use `@real-router/sources` (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`, `getTransitionSource`, `createDismissableError`) via `useRefFromSource` (shallowRef + onScopeDispose).

## Composables

| Composable              | Returns                                                              | Reactive?                      |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `useRouter()`           | `Router`                                                             | Never                          |
| `useNavigator()`        | `Navigator` — exposes navigate, subscribe, subscribeLeave, isLeaveApproved, and more | Never                          |
| `useRoute()`            | `{ navigator, route: Readonly<Ref<State>>, previousRoute: Readonly<Ref<State \| undefined>> }` — backed by `shallowRef` | route/previousRoute on every navigation |
| `useRouteNode(name)`    | `{ navigator, route: Readonly<Ref<State \| undefined>>, previousRoute: Readonly<Ref<State \| undefined>> }` — backed by `computed` over a shared `shallowRef` snapshot | Only when node active/inactive |
| `useRouteUtils()`       | `RouteUtils`                                                         | Never                          |
| `useRouterTransition()` | `ShallowRef<RouterTransitionSnapshot>` — includes `isLeaveApproved` field | On transition start/end        |
| `useIsActiveRoute()`    | `ShallowRef<boolean>`                                                | **INTERNAL ONLY**              |
| `useRouteExit(handler, options?)`  | `void` — wraps `router.subscribeLeave` with abort + same-route guards (handler captured in `setup()`) | Never (subscription is stable) |
| `useRouteEnter(handler, options?)` | `void` — fires once on nav-driven mount via `useRoute()` + `watch(route)` (handler captured in `setup()`) | Never (watcher is owned by setup scope) |

## Exports

| Export                       | Type      | Description                                                       |
| ---------------------------- | --------- | ----------------------------------------------------------------- |
| `RouterProvider`             | Component | Context provider for router instance                              |
| `Link`                       | Component | Navigation link with active state detection                       |
| `RouteView`                  | Component | Declarative route matching                                        |
| `RouterErrorBoundary`        | Component | Declarative navigation error handling                             |
| `useRouter()`                | Composable| Get router instance                                               |
| `useNavigator()`             | Composable| Get navigator instance                                            |
| `useRoute()`                 | Composable| Subscribe to all route changes                                    |
| `useRouteNode(name)`         | Composable| Subscribe to specific node changes                                |
| `useRouteUtils()`            | Composable| Get route tree utilities                                          |
| `useRouterTransition()`      | Composable| Subscribe to transition state                                     |
| `vLink`                      | Directive | Low-level navigation directive (`v-link`)                         |
| `createRouterPlugin`         | Factory   | Vue Plugin for `app.use()` installation                           |
| `RouterKey`/`NavigatorKey`/`RouteKey` | InjectionKey | Vue `provide`/`inject` keys for advanced integration  |
| `LinkProps`                  | Type      | Props for `<Link>`                                                |
| `LinkDirectiveValue`         | Type      | Value type for `v-link` directive                                 |
| `RouteViewProps` / `RouteViewMatchProps` / `RouteViewSelfProps` / `RouteViewNotFoundProps` | Type | RouteView component props |
| `RouteContext<P>`            | Type      | Shape of `RouteKey` inject value — `{ navigator, route, previousRoute }` |
| `RouterErrorBoundaryProps`   | Type      | Props for `<RouterErrorBoundary>`                                 |

## Differences from React, Preact, and Solid Adapters

| Aspect | React/Preact | Solid | Vue |
|--------|--------------|-------|-----|
| Composable return types | Values | Accessors (`Accessor<T>`) | `Readonly<Ref<T>>` (shallowRef / computed under the hood; `useRouterTransition` exposes `ShallowRef` directly) |
| External store bridge | `useSyncExternalStore` / polyfill | `createSignalFromSource` | `useRefFromSource` |
| `memo()` | Required | Not needed | Not needed |
| Params stabilization | `canonicalJson` in `@real-router/sources` | Same | Same |
| Active class on Link | `className` string concat | `classList` object | `class` string concat |
| Context count | 3 (Preact) / 2 (React) | 2 | 3 |
| `keepAlive` / Activity | React 19.2+ only | Not available | Vue native `<KeepAlive>` |
| Entry points | Main + Legacy (React) / Single (Preact) | Single | Single |
| Build tool | tsdown | rollup + babel-preset-solid | tsdown |
| Components | JSX (.tsx) | JSX (.tsx) | `defineComponent` + `h()` (.ts) |
| RouteView child detection | Element type checking | Symbol-based `$$type` markers | `vnode.type === Match` |

## Promise-Based Navigation

Link uses `.catch(() => {})` to suppress unhandled rejection warnings:

```typescript
router.navigate(routeName, routeParams, routeOptions).catch(() => {});
```

## SSR-feature surface — `@real-router/vue/ssr`

All SSR-aware components/composables live at the `/ssr` subpath. Eight exports total — symmetric with `@real-router/react/ssr`:

| Export | Kind | Purpose |
|---|---|---|
| `<ClientOnly>` | component | `ref(false)` + `onMounted` + slots `default`/`fallback` — server emits fallback, post-mount swap reveals children. |
| `<ServerOnly>` | component | Symmetric inverse. |
| `<Streamed>` | component | Cross-adapter alias for Vue's native `<Suspense>` boundary. |
| `<Await name="key">` | component | `async setup()` — awaits the deferred promise, hands the resolved value to the `default` scoped slot. |
| `<HttpStatusCode :code="N"/>` | component | Render-time HTTP status declaration. Writes `code` to the nearest `<HttpStatusProvider>`'s sink in `setup()`. Last write wins. No-op without provider. |
| `<HttpStatusProvider :sink="...">` | component | Provides an `HttpStatusSink` to descendants via `provide()` + `InjectionKey`. |
| `useDeferred<T>(key)` | composable | Returns the deferred Promise from `state.context.ssrDataDeferred[key]`. |
| `createHttpStatusSink()` | utility | Returns a fresh `HttpStatusSink` (`{ code: number \| undefined }`) — construct one per request, read `sink.code` after `renderToString`/`renderToWebStream` to apply to the response. |

```vue-html
<HttpStatusProvider :sink="sink">
  <RouterProvider :router="router">
    <App />
  </RouterProvider>
</HttpStatusProvider>

<!-- inside NotFound.vue -->
<HttpStatusCode :code="404" />
```

Or with the render function:

```ts
import { h } from "vue";
import {
  ClientOnly,
  HttpStatusCode,
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/vue/ssr";

const sink = createHttpStatusSink();
h(HttpStatusProvider, { sink }, {
  default: () => h(HttpStatusCode, { code: 404 }),
});
```

Server flow:

```ts
const sink = createHttpStatusSink();
const html = await renderToString(createSSRApp(App));
response.status(sink.code ?? 200).send(html);
```

Implementation: `<ClientOnly>`/`<ServerOnly>` use `ref(false)` + `onMounted(() => mounted.value = true)`. `<HttpStatusCode>` reads `inject(HTTP_STATUS_KEY, null)` and writes `sink.code = props.code` in `setup()` — render returns `null`, no DOM, no hydration mismatch.

## Gotchas

### `useRouteExit` / `useRouteEnter` Handler Is Captured At Init

Vue composables run **once** during `setup()` — the `handler` argument is
captured in closure at the call site and is **not reactive**. Replacing the
handler reference between renders has no effect (there are no renders). To
vary behavior over time, read refs/computeds **inside** the handler body:

```ts
const draft = ref<Draft | null>(null);

useRouteExit(async ({ signal }) => {
  if (draft.value) await api.save(draft.value, { signal });
});
```

Same applies to `useRouteEnter`. This contrasts with React/Preact, where
`useRouteExit` keeps a `handlerRef` that's updated on every render.

### useRoute Returns Refs, Not Plain Values

```typescript
const { route, previousRoute, navigator } = useRoute();

// In script — access .value
const routeName = route.value?.name;

// In template — Vue auto-unwraps refs
// <div>{{ route?.name }}</div>
```

### useRouteNode Returns the Same Shape

```typescript
const { route, previousRoute, navigator } = useRouteNode("users");

// route and previousRoute are Readonly<Ref<State | undefined>> — same shape
// as useRoute(), but implemented via `computed` over a shared `shallowRef`
// snapshot (preserves identity when the underlying source emits the same
// reference, so consumers don't see a re-render on out-of-node navigations).
watch(route, (newRoute) => {
  console.log(newRoute?.name);
});
```

### shallowRef Under the Hood (not plain `ref`)

Route snapshots are frozen objects. `useRefFromSource` (`useRoute` path) and `setupRouteProvision` use `shallowRef` so Vue tracks only the reference — it won't try to proxy a frozen target. The composable's public return type is `Readonly<Ref<…>>` (a supertype of both `ShallowRef` and `ComputedRef`); consumers should not assume `shallowRef` semantics beyond identity tracking.

Don't swap `shallowRef` for `ref` in `useRefFromSource` — the deep proxy would fail on frozen route snapshots at runtime.

### Storing the Router in `reactive()` / Pinia — wrap it in `markRaw`

Core identifies a router by **object identity** in an internal `WeakMap`
(`getInternals` / `getPluginApi`). Putting the router into a Vue `reactive()`
store — **including Pinia state** — wraps it in a reactive `Proxy`, and that
proxy is a *different* object than the WeakMap key. Any code that goes through
the WeakMap API (`RouterErrorBoundary`, `useRouteUtils`, `useRouterTransition`,
plugin internals) then throws:

```
TypeError: [real-router] Invalid router instance — not found in internals registry
```

The failure is **point-wise and confusing**: bound facade methods
(`router.navigate`, `router.buildPath`, …) keep working because they captured
`this` at construction, so only the WeakMap-backed surfaces break — you get a
half-working router rather than a clean crash.

```ts
import { markRaw, reactive } from "vue";

// WRONG — the reactive proxy breaks getInternals / getPluginApi
const store = reactive({ router });

// CORRECT — markRaw keeps the original instance out of the proxy
const store = reactive({ router: markRaw(router) });
// Pinia: return markRaw(router) from the store's state factory.
```

`markRaw` is the Vue canon for non-proxyable instances. Passing the router as a
plain `<RouterProvider :router="router">` prop is safe (Vue does not deep-proxy
prop *values*) — the breakage is specifically about making the instance itself
reactive. A defensive `toRaw(props.router)` inside `RouterProvider` /
`createRouterPlugin` would also harden the rare case where a parent has already
wrapped it.

### onScopeDispose for Cleanup

`useRefFromSource` calls `onScopeDispose` — it must be called inside a Vue reactive scope (component `setup()`, `effectScope()`, etc.). Don't call it at module level.

### useRouter vs useRoute

```typescript
const router = useRouter();           // Stable — never reactive
const { route } = useRoute();         // Readonly<Ref<State>> (shallowRef under the hood) — reactive, read .value
const routeName = route.value?.name;  // Read in script
```

### useRoute throws when route is undefined

`useRoute()` returns `{ navigator, route: Readonly<Ref<State<P>>>, previousRoute: Readonly<Ref<State|undefined>> }` —
`route.value` is **non-nullable** at the time `useRoute()` is called (and remains so
unless the router is stopped/disposed mid-session, which the composable does
not observe reactively). The composable throws when the router has no active
state. `useRouteNode(name)` keeps its nullable `Ref<State|undefined>` — node
inactivity is a legitimate business state.

```ts
// Before:
const { route } = useRoute<{ id: string }>();
if (!route.value) return;
const id = route.value?.params.id;

// After:
const { route } = useRoute<{ id: string }>();
const id = route.value.params.id;
```

### Typed route params via generic

`useRoute<P>()` accepts an optional generic so `route.value.params` is typed without `as` casts. `RouteContext<P>` is likewise generic. Runtime is unchanged — the cast happens once inside the composable.

```typescript
type SearchParams = { q: string; sort: string } & Params;

const { route } = useRoute<SearchParams>();
const q = route.value.params.q; // typed as string
```

### useRouteNode Semantics

```typescript
useRouteNode("");       // Root — ALL route changes
useRouteNode("users"); // Only "users" and "users.*" routes
```

### previousRoute is Global

```typescript
// Navigation: users.list → items → users.view
const { previousRoute } = useRouteNode("users");
previousRoute.value; // = items (not users.list!)
```

### Empty `segment=""` Never Matches

`RouteView.Match`'s `segment` prop is fed to `startsWithSegment(routeName, fullSegmentName)` from `@real-router/route-utils`, which returns **`false` for any empty `fullSegmentName`** (defensive guard). Practical consequence:

```typescript
// nodeName = "" + segment = ""  →  fullSegmentName = "" → never active
h(RouteView, { nodeName: "" }, {
  default: () => [
    h(RouteView.Match, { segment: "" }, { default: () => h(Home) }),
  ],
});
```

Use `<RouteView.Self>` (the dedicated marker for "this exact node") or set `segment` to the actual route name. The `Match` element with `segment=""` silently never renders — there is no warning at runtime.

### Async-Wrapped `Match` Is Not Detected

`RouteView` walks `slots.default?.()` and checks `vnode.type === Match`. Wrapping `RouteView.Match` in an async component (`defineAsyncComponent(...)`) or rendering it as the child of a custom component breaks the marker check — `vnode.type` then points at the async wrapper, not at `Match`. The wrapped `Match` will not match, no fallback fires, and `<RouteView.NotFound>` may light up unexpectedly.

`Match`/`Self`/`NotFound` must appear as **direct children** of `RouteView` (Fragments are unwrapped, but components and `<Suspense>` are not).

### RouteView Marker Components

`Match` and `NotFound` are real `defineComponent` instances with `render: null`. `RouteView` reads `slots.default?.()` and checks `vnode.type === Match` to identify them. Don't render them outside `RouteView`.

```typescript
// WRONG — Match renders null on its own
const el = h(RouteView.Match, { segment: "users" }, () => h(UsersPage));
// el renders nothing — it's a marker

// CORRECT — use inside RouteView only
h(RouteView, { nodeName: "" }, {
  default: () => [
    h(RouteView.Match, { segment: "users" }, { default: () => h(UsersPage) }),
  ],
})
```

### keepAlive Wrapper Components

When `keepAlive` is enabled (on `<RouteView>` or on an individual `<RouteView.Match>`), `RouteView` creates one wrapper component per segment using `defineComponent` + `markRaw`. The `markRaw` call prevents Vue from proxying the component definition. These wrappers are cached in a `Map<string, Component>` per `RouteView` instance — they're created once and reused.

```typescript
// keepAlive: false (default) — component unmounts on navigation
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage /> <!-- Unmounts when navigating away -->
  </RouteView.Match>
</RouteView>

// keepAlive: true on RouteView — ALL matches are kept alive
<RouteView nodeName="" keepAlive>
  <RouteView.Match segment="users">
    <UsersPage /> <!-- Stays alive, scroll position preserved -->
  </RouteView.Match>
</RouteView>

// Per-Match keepAlive — only UsersPage is kept alive
<RouteView nodeName="">
  <RouteView.Match segment="users" keepAlive>
    <UsersPage /> <!-- Stays alive -->
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage /> <!-- Always remounts -->
  </RouteView.Match>
</RouteView>
```

`RouteView.Match.keepAlive` takes precedence over the parent `<RouteView keepAlive>` — use it for fine-grained control when only some routes need state preservation.

### `<KeepAlive>` deactivated subtrees stay fresh — immune to #765

Vue is the **only** adapter where a sleeping (deactivated) subtree is *outside*
the reconnect-staleness window. `useRefFromSource` bridges via `shallowRef` +
`onScopeDispose`; under native `<KeepAlive>` a deactivated component keeps its
**effect scope alive** (Vue disposes scopes on `unmount`, not on deactivate). The
bridge subscription therefore stays connected to the router while the subtree
sleeps — a navigation during deactivation is applied to the `shallowRef` as
usual, and re-activating shows the **fresh** state with no dependence on source
reconcile.

Contrast: React `<Activity>` detaches effects on hide and so *opens* the stale
window ([#765](https://github.com/greydragon888/real-router/issues/765)); Solid
and Svelte have no keepAlive analogue. This is a real, guaranteed advantage of
the Vue adapter — with one cost worth knowing: subscriptions of sleeping subtrees
keep firing (bounded by the number of `<KeepAlive>`d nodes), so kept-alive
components are not "paused" with respect to router updates.

### Match `fallback` Prop (Suspense)

`RouteView.Match` accepts an optional `fallback` prop (`VNode | (() => VNode)`). When provided, the matched content is wrapped in Vue's `<Suspense>` with that node as the fallback. Use this with `defineAsyncComponent` to show a loading state while the component chunk loads.

```typescript
import { defineAsyncComponent, h } from 'vue';

const LazyDashboard = defineAsyncComponent(() => import('./Dashboard.vue'));

h(RouteView, { nodeName: "" }, {
  default: () => [
    h(
      RouteView.Match,
      { segment: "dashboard", fallback: h(Spinner) },
      { default: () => h(LazyDashboard) },
    ),
  ],
});
```

In a template:

```vue
<script setup>
import { defineAsyncComponent } from 'vue';
const LazyDashboard = defineAsyncComponent(() => import('./Dashboard.vue'));
</script>

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" :fallback="SpinnerComponent">
    <LazyDashboard />
  </RouteView.Match>
</RouteView>
```

Works with both `keepAlive` and non-`keepAlive` modes. Without `fallback`, no `<Suspense>` boundary is added. The prop is optional.

### activeStrict Meaning

```typescript
// Current route: users.edit
<Link routeName="users" :activeStrict="false" /> // Active (ancestor)
<Link routeName="users" :activeStrict="true" />  // NOT active (not exact)
```

### ignoreQueryParams Default

```typescript
// Default: query params don't affect active state
<Link routeName="users" /> // Active even if ?page=2 differs
```

### Object Params and Memoization

`<Link>` stabilizes `routeParams` by **content** (`shallowEqual` — `Object.is`
per key, key-order-insensitive), so an inline `:routeParams="{ id: 1 }"` literal
that a parent re-creates on every render does **not** re-run `buildHref` or
re-subscribe the active source. This is the hot path on Link-heavy pages and the
same contract as the React adapter's `Link` `memo`.

Caveat: nested object/array param **values** are compared by reference, not deep:

```typescript
// flat params — stable across re-renders, recomputes only on real change
<Link routeName="items.item" :routeParams="{ id: 1 }" /> // {id:1} ≡ {id:1}

// nested value — fresh ref each render → href/active recompute every render
<Link routeName="search" :routeParams="{ filters: [1, 2] }" />

// stabilize nested params with a ref/computed if it matters:
const params = computed(() => ({ filters: [1, 2] }));
<Link routeName="search" :routeParams="params" />
```

### `<Link hash>` Prop (#532)

`hash?: string` — URL fragment (decoded, no leading `#`). Tri-state:

- `undefined` (default) — preserves the current `state.context.url.hash` on click.
- `""` — clears the hash.
- `"value"` — sets the hash; click routes through `navigateWithHash`, which auto-adds `force: true, hashChange: true` when the requested hash differs from `state.context.url.hash` on the same route+params (bypasses core's `SAME_STATES`).

```vue
<Link routeName="settings" hash="profile">Profile</Link>
<Link routeName="settings" hash="account">Account</Link>
```

`hash` is tracked by `computed`, so reactive sources (`ref`, `computed`) are picked up. Active state is hash-aware: when `hash` is set, the Link is active iff route matches AND `state.context.url.hash` equals expected — sibling tab Links light up independently. Hash-plugin runtime always returns `false` for hash-aware active checks.

### No .vue SFC Files

All components use `defineComponent` + `h()` in plain `.ts` files. There are no `.vue` single-file components and no JSX. This keeps the build simple (tsdown, no Vue-specific transform) and avoids the SFC compiler dependency.

### Reactive `announceNavigation`

`announceNavigation` is reactive — toggling the prop at runtime creates or destroys the announcer. Implementation uses `watch([router, announceNavigation], ...)`, so changing either re-runs the setup with cleanup.

### Nested RouterProviders — v-link Router Stack

Multiple `RouterProvider`s nest like DI scopes. The `v-link` directive resolves
to the **innermost** router via a LIFO stack. When the inner provider unmounts,
the directive falls back to the outer router automatically. Out-of-order
unmounts (e.g., parent torn down while child is still mounted) are handled by
identity-based pop — each `RouterProvider` removes its OWN router from the
stack regardless of position.

```typescript
<RouterProvider :router="outer">
  <RouterProvider :router="inner">
    <a v-link="{ name: 'home' }">Home</a> <!-- navigates via `inner` -->
  </RouterProvider>
</RouterProvider>
```

### v-link Defensive Validation

`v-link` validates `binding.value` on mount and update. Passing `null`/`undefined`/`{name: undefined}` logs `console.error` and skips handler attachment instead of throwing inside a click handler. Use this if your binding is computed and may be unset transiently.

### v-link Requires a RouterProvider Ancestor

The `v-link` directive uses a module-level router stack maintained by `RouterProvider`. `RouterProvider` pushes its router on mount and pops it on unmount, so the directive resolves to the innermost provider's router automatically:

```typescript
// CORRECT — RouterProvider manages the stack
<RouterProvider :router="router">
  <a v-link="{ name: 'home' }">Home</a>
</RouterProvider>

// WRONG — outside RouterProvider, directive throws
<a v-link="{ name: 'home' }">Home</a>
```

For the rare case of using `v-link` outside any `RouterProvider`, the package keeps an `@internal` `setDirectiveRouter(router)` (not exported from `@real-router/vue` — import it directly from `src/directives/vLink` only in tests / app-glue code that owns the lifecycle):

```typescript
// @internal — not part of the public API
import { setDirectiveRouter } from "@real-router/vue/src/directives/vLink";

setDirectiveRouter(router);
```

## SSR

SSR-friendly without a separate entry. The same `RouterProvider`, `Link`, `RouteView`, and composables work under `vue/server-renderer` (`renderToString` / `renderToWebStream`) — no SSR-specific imports, no `if (typeof window !== "undefined")` shims, no platform branches in hot paths.

Verified end-to-end across three example apps:

- [`examples/web/vue/ssr-examples/ssr/`](../../examples/web/vue/ssr-examples/ssr) — classical `renderToString` + cookie-based DI + canActivate guards + query params + nested loaders (25 e2e scenarios)
- [`examples/web/vue/ssr-examples/ssr-streaming/`](../../examples/web/vue/ssr-examples/ssr-streaming) — `renderToWebStream` + `<Suspense>` + `async setup()` + `onErrorCaptured` boundary (14 e2e scenarios, incl. chunked-transfer streaming proof)
- [`examples/web/vue/ssr-examples/ssg/`](../../examples/web/vue/ssr-examples/ssg) — `getStaticPaths` + per-route meta tags + 404.html + sitemap.xml (16 e2e scenarios)

### Verified Patterns

- **Per-request `createSSRApp(...)`** — never reuse a Vue app across requests. `RouterProvider`'s `provide()` is scoped to the app instance, and the router clone is per-request anyway. Pair with `cloneRouter(baseRouter, deps)` for full request isolation; `dispose()` the router after the response is sent.
- **Refs read with `.value` on the server too** — composables return `Readonly<Ref<…>>` (a shallowRef or computed) under SSR identical to the client. Read `route.value.context.data`, not `route.context.data`. Vue's template auto-unwrapping also works server-side, so `{{ route.name }}` in a template stays valid in either environment.
- **`<Suspense>` is blocking in SSR** — Vue 3 (stable) emits no out-of-order placeholders. Render of content placed *after* a `<Suspense>` boundary waits for every `async setup()` inside it before more HTML is emitted. `renderToWebStream` still helps TTFB on the shell that precedes the boundary, but you don't get React's "fallback now, real content later" model. Use `onErrorCaptured` (returning `false` to halt propagation) as the SSR-safe error boundary — it triggers symmetrically on the server-rendered tree and on hydration-time async failures.
- **SSG dual-mode mount** — when the same client entry serves both pre-rendered SSG output and dev mode (no SSR content), branch the factory: `rootElement.firstElementChild ? createSSRApp(...) : createApp(...)`. Both share the exact same `RouterProvider` setup. In either case, `await hydrateRouter(router, ssrState)` must complete *before* `mount("#root")` — otherwise the first render reads an unstarted router and Vue logs hydration mismatches.
- **`previousRoute` is `undefined` on the server** — first render has no prior navigation, so `useRoute().previousRoute.value === undefined` server-side; design SSR-rendered components accordingly.
- **No `browser-plugin` on the server** — register it only in `entry-client.ts`. The server uses bare `cloneRouter(...).start(url)` with the explicit URL string; `browser-plugin` exists for client-side `popstate` + `pushState` and would touch `globalThis.history`/`window.location` during SSR.

See also: [Vue Integration — Server-Side Rendering](https://github.com/greydragon888/real-router/wiki/Vue-Integration#server-side-rendering) for full server + client entry shapes, and [Streaming SSR — Vue Counterpart](https://github.com/greydragon888/real-router/wiki/Streaming-SSR#vue-counterpart) for the React/Vue comparison.

## Performance

- `useRouteNode` uses cached `createRouteNodeSource` from `@real-router/sources` — N consumers of the same `nodeName` share one router subscription
- `useRouterTransition` uses `getTransitionSource` — shared eager source per router
- `RouterErrorBoundary` uses `createDismissableError` — shared error source with integrated dismissal state (no local `useRouterError` composable)
- `useIsActiveRoute` uses cached `createActiveRouteSource` — params hashed via `canonicalJson` (key-order-insensitive)
- No `memo()` needed — Vue tracks ref dependencies automatically
- `Link` content-stabilizes `routeParams` with `shallowEqual` (Object.is per key, order-insensitive — the same contract as the React adapter's `Link` `memo`), so an inline `:routeParams="{ id }"` literal from a re-rendering parent does **not** re-run `buildHref` or `canonicalJson` every navigation; `href` and active-class are `computed()` off the stabilized params + `useIsActiveRoute`. Same-shape navigations skip both derivations entirely (~18% faster on the Link-heavy `vs-tanstack` Vue bench)
- All WeakMap caches live in `@real-router/sources` — auto-evicted on router GC, no local caches in this adapter
- `EMPTY_PARAMS` and `EMPTY_OPTIONS` frozen singletons avoid allocation for default props
- keepAlive wrapper components cached with `markRaw` to prevent Vue from proxying them
- `RouteView` runs a single O(n) pass through slot elements per render — `buildRenderList` returns `hasPerMatchKA` as a side-channel so the previous identity-cache on slot output is no longer needed (one walk, not two)
- `Link` builds forwarded attrs via spread + `delete` (one allocation + one property removal) instead of a per-key copy loop — hot-path optimisation for Link-heavy pages
- `RouterProvider` extracts a single `watchToggleableUtility(deps, factory)` helper for the four reactive utilities (announcer / scroll-restorer / scroll-spy / view-transitions) so the per-utility cleanup contract lives in one place
