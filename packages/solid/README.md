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
```

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

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"manual"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Options are read once on mount — changing the prop at runtime does not reconfigure the utility (Solid `onMount` is non-reactive). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for details.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition)

## Examples

14 runnable examples — each is a standalone Vite app. Run: `cd examples/web/solid/basic && pnpm dev`

[basic](../../examples/web/solid/basic) · [nested-routes](../../examples/web/solid/nested-routes) · [auth-guards](../../examples/web/solid/auth-guards) · [data-loading](../../examples/web/solid/data-loading) · [lazy-loading](../../examples/web/solid/lazy-loading) · [async-guards](../../examples/web/solid/async-guards) · [hash-routing](../../examples/web/solid/hash-routing) · [persistent-params](../../examples/web/solid/persistent-params) · [error-handling](../../examples/web/solid/error-handling) · [dynamic-routes](../../examples/web/solid/dynamic-routes) · [store-based-state](../../examples/web/solid/store-based-state) · [use-link-directive](../../examples/web/solid/use-link-directive) · [signal-primitives](../../examples/web/solid/signal-primitives) · [combined](../../examples/web/solid/combined)

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
