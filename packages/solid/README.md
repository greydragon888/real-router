# @real-router/solid

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Solid.js integration for [Real-Router](https://github.com/greydragon888/real-router) — hooks, components, and context providers.

## Installation

```bash
npm install @real-router/solid @real-router/core @real-router/browser-plugin
```

**Peer dependency:** `solid-js` >= 1.7.0

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, RouteView, Link } from "@real-router/solid";

const router = createRouter([
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
]);

router.usePlugin(browserPluginFactory());
router.start();

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <Link routeName="home">Home</Link>
        <Link routeName="users">Users</Link>
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <HomePage />
        </RouteView.Match>
        <RouteView.Match segment="users">
          <UsersPage />
        </RouteView.Match>
        <RouteView.NotFound>
          <NotFoundPage />
        </RouteView.NotFound>
      </RouteView>
    </RouterProvider>
  );
}
```

## Hooks

All hooks that subscribe to route state return `Accessor<T>` — call the accessor inside a reactive context to read the current value.

| Hook                      | Returns                              | Reactive?                            |
| ------------------------- | ------------------------------------ | ------------------------------------ |
| `useRouter()`             | `Router`                             | Never                                |
| `useNavigator()`          | `Navigator`                          | Never                                |
| `useRoute()`              | `Accessor<RouteState>`               | Every navigation                     |
| `useRouteNode(name)`      | `Accessor<RouteState>`               | Only when node activates/deactivates |
| `useRouteUtils()`         | `RouteUtils`                         | Never                                |
| `useRouterTransition()`   | `Accessor<RouterTransitionSnapshot>` | On transition start/end              |
| `useRouteStore()`         | `RouteState` (store)                 | Granular — per-property              |
| `useRouteNodeStore(name)` | `RouteState` (store)                 | Granular — per-property, node-scoped |
| `useRouteExit(handler, options?)`  | `void` — wraps `subscribeLeave` with abort + same-route guards            | Never (handler captured at hook call) |
| `useRouteEnter(handler, options?)` | `void` — fires once on nav-driven mount via `useRoute()` + `transition.from` | Never (handler captured at hook call) |

### Store-Based Hooks (Granular Reactivity)

`useRouteStore()` and `useRouteNodeStore()` use `createStore` + `reconcile` for property-level reactivity. A component reading `state.route?.params.id` won't re-run when `state.route?.params.page` changes:

```tsx
import { useRouteStore } from "@real-router/solid";
import { createEffect } from "solid-js";

function UserProfile() {
  const state = useRouteStore();

  createEffect(() => {
    console.log(state.route?.params.id);
  });

  return <h1>User: {state.route?.params.id}</h1>;
}
```

Signal-based hooks (`useRoute`, `useRouteNode`) remain available for simpler use cases.

### Primitives

Two low-level bridges convert `@real-router/sources` `RouterSource<T>` instances into Solid reactive primitives. Use them when you build custom hooks on top of `@real-router/sources`:

| Primitive                | Returns            | Description                                                   |
| ------------------------ | ------------------ | ------------------------------------------------------------- |
| `createSignalFromSource` | `Accessor<T>`      | Bridges a source to a Solid signal. Calls `onCleanup`.        |
| `createStoreFromSource`  | `T` (Solid store)  | Bridges a source to a Solid store via `createStore + reconcile`. |

Both must be called inside a reactive owner (component body or `createRoot`).

### Contexts (Advanced)

Two Solid contexts are exported for building custom hooks or deeply nested integrations that need direct access to router internals without prop drilling:

| Context        | Value type                                                       | Description                                                              |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `RouterContext` | `RouterContextValue \| null` — `{ router, navigator, routeSelector }` | Stable references. `routeSelector(name)` is the O(1) `createSelector`-backed active check used by `<Link>`. |
| `RouteContext`  | `Accessor<RouteState> \| null`                                   | Reactive signal. Updates on every navigation. Consumed by `useRoute()`. |

```tsx
import { RouterContext, RouteContext } from "@real-router/solid";
import { useContext } from "solid-js";

function MyCustomHook() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("Must be used inside <RouterProvider>");
  return ctx.router;
}
```

For most use cases the existing hooks (`useRouter`, `useRoute`, `useNavigator`) are sufficient — reach for raw contexts only when building custom primitives.

```tsx
// useRouteNode — updates only when "users.*" changes
function UsersLayout() {
  const routeState = useRouteNode("users");

  return (
    <Show when={routeState().route}>
      {(route) => {
        switch (route().name) {
          case "users":
            return <UsersList />;
          case "users.profile":
            return <UserProfile id={route().params.id} />;
          default:
            return null;
        }
      }}
    </Show>
  );
}

// useNavigator — stable reference, never reactive
function BackButton() {
  const navigator = useNavigator();
  return <button onClick={() => navigator.navigate("home")}>Back</button>;
}

// useRouterTransition — progress bars, loading states
function GlobalProgress() {
  const transition = useRouterTransition();
  return (
    <Show when={transition().isTransitioning}>
      <div class="progress-bar" />
    </Show>
  );
}

// useRouteExit — exit animations, draft autosave, AbortSignal-aware cleanup
function FadeOut() {
  let ref: HTMLDivElement | undefined;
  useRouteExit(async ({ signal }) => {
    if (!ref) return;
    ref.classList.add("fade-out");
    const cleanup = () => ref!.classList.remove("fade-out");
    signal.addEventListener("abort", cleanup, { once: true });
    ref.getBoundingClientRect(); // style flush
    await Promise.allSettled(ref.getAnimations().map((a) => a.finished));
    cleanup();
  });
  return <div ref={ref}>...</div>;
}

// useRouteEnter — page-enter analytics, focus management, entry animations
function PageEnterAnalytics() {
  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
  return null;
}
```

> **Solid handler-reactivity:** components run once, so `handler` is captured at
> hook-call time. To vary behavior over time, read signals **inside** the
> handler body. See [CLAUDE.md](./CLAUDE.md) → "useRouteExit / useRouteEnter
> Handler Is Captured At Init".

## Components

### `<Link>`

Navigation link with automatic active state detection. Uses `classList` for active class toggling — only the DOM attribute updates, not the whole component.

```tsx
<Link
  routeName="users.profile"
  routeParams={{ id: "123" }}
  activeClassName="active" // default: "active"
  activeStrict={false} // default: false (ancestor match)
  ignoreQueryParams={true} // default: true
  routeOptions={{ replace: true }}
>
  View Profile
</Link>
```

#### `hash` prop — URL fragment / tab-style UIs

```tsx
<Link routeName="settings" hash="profile">Profile</Link>
<Link routeName="settings" hash="account">Account</Link>
```

Tri-state: `undefined` preserves the current hash, `""` clears it, a value sets it. Active class is hash-aware — only the matching tab lights up. Setting `hash` forces the slow path (the fast-path `routeSelector` is hash-agnostic). Live demo: [`examples/web/react/link-hash/`](../../examples/web/react/link-hash/) — behavior is identical across adapters, only template syntax differs. See the [Hash Fragment Support](https://github.com/greydragon888/real-router/wiki/Hash) wiki page for the full surface.

### `<RouteView>`

Declarative route matching. Renders the first matching `<RouteView.Match>` child.

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users">
    <UsersPage />
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage />
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

`RouteView.Match` accepts an optional `exact` prop for strict segment matching:

```tsx
<RouteView.Match segment="users" exact>
  {/* Only matches "users" exactly, not "users.profile" */}
  <UsersIndex />
</RouteView.Match>
```

**Lazy loading with `fallback`:** Pass a `fallback` prop (`JSX.Element`) to wrap the matched content in Solid's `<Suspense>`. This lets you show a loading state while a `lazy()` component's chunk is fetching.

```tsx
import { lazy } from "solid-js";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" fallback={<Spinner />}>
    <LazyDashboard />
  </RouteView.Match>
</RouteView>;
```

Without `fallback`, no `<Suspense>` boundary is added. The prop is optional.

#### `<RouteView.Self>` — render the parent node itself

`RouteView` shows `<Match>` children when a **descendant** route is active. To render content when the active route's name equals the parent's `nodeName` **exactly**, use `<RouteView.Self>`:

```tsx
<RouteView nodeName="users">
  <RouteView.Self>
    <UsersIndex /> {/* active route === "users" exactly */}
  </RouteView.Self>
  <RouteView.Match segment="profile">
    <UserProfile /> {/* active route is "users.profile" or a descendant */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

`<RouteView.Self>` accepts an optional `fallback` prop (`JSX.Element`) — when provided, the children are wrapped in `<Suspense>` with that fallback, parallel to `<Match fallback>`.

**Precedence rules:**

1. `<Match>` first-wins — if any `<Match>` activates, `<Self>` and `<NotFound>` are suppressed.
2. `<Self>` first-wins — only the first `<RouteView.Self>` contributes; later instances are ignored.
3. `<Self>` wins over `<NotFound>` if no `<Match>` activates (rare — applies only when `nodeName === UNKNOWN_ROUTE`).

| Element | Fires when | Render position |
|---|---|---|
| `<RouteView.Match>` | Active route segment matches `segment` (or descendant if `exact={false}`) | Inline at source position |
| `<RouteView.Self>` | Active route name **exactly equals** parent's `nodeName` | Appended after Match elements |
| `<RouteView.NotFound>` | Active route is `UNKNOWN_ROUTE` AND no Match activated | Appended after Match elements |

> **Note:** `keepAlive` is not supported. Solid has no equivalent of React's `<Activity>` API. Components dispose completely when navigating away.

### `<RouterErrorBoundary>`

Declarative error handling for navigation errors. Shows a fallback **alongside** children (not instead of) when a guard rejects or a route is not found.

```tsx
import { RouterErrorBoundary } from "@real-router/solid";

<RouterErrorBoundary
  fallback={(error, resetError) => (
    <div class="toast">
      {error.code} <button onClick={resetError}>Dismiss</button>
    </div>
  )}
  onError={(error) => analytics.track("nav_error", { code: error.code })}
>
  <Link routeName="protected">Go to Protected</Link>
</RouterErrorBoundary>;
```

Auto-resets on next successful navigation. Works with both `<Link>` and imperative `router.navigate()`.

### `<ClientOnly>` / `<ServerOnly>`

Paired SSR-aware boundaries. `<ClientOnly>` renders `fallback` on the server (and on the client first paint, to match SSR HTML), then swaps in `children` after mount. `<ServerOnly>` is the symmetric inverse.

```tsx
import { ClientOnly, ServerOnly } from "@real-router/solid/ssr";

<ClientOnly fallback={<Skeleton />}>
  <BrowserApiWidget />
</ClientOnly>

<ServerOnly>
  <SeoMetaStrip />
</ServerOnly>;
```

All SSR-aware exports (`ClientOnly`, `ServerOnly`, `Streamed`, `Await`, `useDeferred`, `HttpStatusCode`, `HttpStatusProvider`, `createHttpStatusSink`) live at the `/ssr` subpath — the main entry stays client-only.

Implementation: `createSignal(false)` + `onMount(() => setMounted(true))` + `<Show>`. `onMount` is SSR-safe per Solid's runtime contract — it never fires during `renderToString`/`renderToStream`. End-to-end dogfooding lives in [`examples/web/solid/ssr-examples/ssr/`](../../examples/web/solid/ssr-examples/ssr/) (see `e2e/ssr-boundaries.spec.ts`).

## Directives

### `use:link`

Low-level directive for adding navigation to any element. Automatically handles click events, keyboard navigation (Enter key), and active state styling.

```tsx
import { link } from "@real-router/solid";

<a use:link={() => ({ routeName: "users.profile", routeParams: { id: "123" }, activeClassName: "active" })}>
  User Profile
</a>

<button use:link={() => ({ routeName: "home" })}>
  Go Home
</button>

<div
  use:link={() => ({
    routeName: "settings",
    activeClassName: "active",
    activeStrict: false,
    ignoreQueryParams: true,
  })}
  role="link"
  tabindex="0"
>
  Settings
</div>
```

**Options:**

| Option              | Type      | Default | Description                             |
| ------------------- | --------- | ------- | --------------------------------------- |
| `routeName`         | `string`  | —       | Target route name                       |
| `routeParams`       | `Params`  | `{}`    | Route parameters                        |
| `routeOptions`      | `object`  | `{}`    | Navigation options (replace, etc.)      |
| `activeClassName`   | `string`  | —       | Class added when route is active        |
| `activeStrict`      | `boolean` | `false` | Exact match only (no ancestor matching) |
| `ignoreQueryParams` | `boolean` | `true`  | Query params don't affect active state  |

The directive automatically sets `href` on `<a>` elements and adds `role="link"` + `tabindex="0"` to non-interactive elements for accessibility.

**Accessor or object literal — both work.** The directive expects an accessor (`() => options`), and that's the form that gives you static-analysis friendliness across editors. Solid's `babel-preset-solid` also auto-wraps an object literal at compile time, so `use:link={{ routeName: "home" }}` is accepted too:

```tsx
// Accessor form (recommended — explicit, plays well with reactive values)
<a use:link={() => ({ routeName: "home" })}>Home</a>

// Object-literal form (accepted — babel-preset-solid wraps it for you)
<a use:link={{ routeName: "home" }}>Home</a>
```

Either way the directive captures the options **once** at init (see CLAUDE.md "use:link Options Are Captured Once"). For reactive route switching, use the `<Link>` component instead.

## Solid-Specific Patterns

### Accessors, Not Values

Unlike the React and Preact adapters, hooks that subscribe to route state return `Accessor<T>`. Read the value by calling the accessor:

```tsx
// React/Preact
const { route } = useRoute();

// Solid
const routeState = useRoute();
const { route } = routeState(); // call it
```

Inside JSX, call the accessor directly in reactive positions:

```tsx
function CurrentRoute() {
  const routeState = useRoute();
  return <div>{routeState().route?.name}</div>;
}
```

### Never Destructure Props

Solid props are reactive getters. Destructuring them breaks the reactive graph:

```tsx
// WRONG — loses reactivity
function MyLink({ routeName, routeParams }) {
  return <Link routeName={routeName} routeParams={routeParams} />;
}

// CORRECT — pass props through
function MyLink(props) {
  return <Link routeName={props.routeName} routeParams={props.routeParams} />;
}
```

## Accessibility

Enable screen reader announcements for route changes:

```tsx
<RouterProvider router={router} announceNavigation>
  {/* Your app */}
</RouterProvider>
```

When enabled, a visually hidden `aria-live` region announces each navigation. Focus moves to the first `<h1>` on the new page. See [Accessibility guide](https://github.com/greydragon888/real-router/wiki/Accessibility) for details.

## Scroll Restoration

Opt-in preservation of scroll position across navigations:

```tsx
<RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
  {/* Your app */}
</RouterProvider>
```

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"native"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Options are read once on mount — changing the prop at runtime does not reconfigure the utility (Solid `onMount` is non-reactive). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for details.

## View Transitions

Opt-in animated route transitions via the browser's [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API):

```tsx
<RouterProvider router={router} viewTransitions>
  {/* Your app */}
</RouterProvider>
```

No-op on unsupported browsers (Firefox as of 2026-04, SSR). Prop is read once on mount (Solid `onMount` is non-reactive) — if you need toggle, unmount/remount the provider. Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name` for hero morphs. See [View Transitions guide](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) · [View Transitions](https://github.com/greydragon888/real-router/wiki/View-Transitions)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition) · [useRouteExit](https://github.com/greydragon888/real-router/wiki/useRouteExit) · [useRouteEnter](https://github.com/greydragon888/real-router/wiki/useRouteEnter)
- Solid-specific store variants: [useRouteStore / useRouteNodeStore](https://github.com/greydragon888/real-router/wiki/Solid-Integration#store-based-granular-route-state) — `createStore` + `reconcile`, property-level reactivity

## Examples

17 runnable examples — each is a standalone Vite app. Run: `cd examples/web/solid/basic && pnpm dev`

[basic](../../examples/web/solid/basic) · [nested-routes](../../examples/web/solid/nested-routes) · [auth-guards](../../examples/web/solid/auth-guards) · [data-loading](../../examples/web/solid/data-loading) · [lazy-loading](../../examples/web/solid/lazy-loading) · [async-guards](../../examples/web/solid/async-guards) · [hash-routing](../../examples/web/solid/hash-routing) · [persistent-params](../../examples/web/solid/persistent-params) · [error-handling](../../examples/web/solid/error-handling) · [dynamic-routes](../../examples/web/solid/dynamic-routes) · [store-based-state](../../examples/web/solid/store-based-state) · [use-link-directive](../../examples/web/solid/use-link-directive) · [signal-primitives](../../examples/web/solid/signal-primitives) · [combined](../../examples/web/solid/combined) · [animation-examples](../../examples/web/solid/animation-examples) · [search-schema](../../examples/web/solid/search-schema)

Server-side rendering: [ssr](../../examples/web/solid/ssr-examples/ssr) · [ssr-streaming](../../examples/web/solid/ssr-examples/ssr-streaming) · [ssg](../../examples/web/solid/ssr-examples/ssg)

## Related Packages

| Package                                                                                  | Description                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required dependency)    |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration      |
| [@real-router/sources](https://www.npmjs.com/package/@real-router/sources)               | Subscription layer (used internally) |
| [@real-router/route-utils](https://www.npmjs.com/package/@real-router/route-utils)       | Route tree queries (`useRouteUtils`) |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
