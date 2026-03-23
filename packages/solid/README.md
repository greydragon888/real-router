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

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [Link](https://github.com/greydragon888/real-router/wiki/Link)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition)

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
