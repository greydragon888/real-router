# @real-router/preact

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Preact integration for [Real-Router](https://github.com/greydragon888/real-router) — hooks, components, and context providers.

## Installation

```bash
npm install @real-router/preact @real-router/core @real-router/browser-plugin
```

**Peer dependency:** `preact` >= 10.0.0

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, RouteView, Link } from "@real-router/preact";

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

| Hook                    | Returns                                   | Re-renders                              |
| ----------------------- | ----------------------------------------- | --------------------------------------- |
| `useRouter()`           | `Router`                                  | Never                                   |
| `useNavigator()`        | `Navigator`                               | Never (stable ref, safe to destructure) |
| `useRoute()`            | `{ navigator, route, previousRoute }`     | Every navigation                        |
| `useRouteNode(name)`    | `{ navigator, route, previousRoute }`     | Only when node activates/deactivates    |
| `useRouteUtils()`       | `RouteUtils`                              | Never                                   |
| `useRouterTransition()` | `{ isTransitioning, toRoute, fromRoute }` | On transition start/end                 |

```tsx
// useRouteNode — re-renders only when "users.*" changes
function UsersLayout() {
  const { route } = useRouteNode("users");
  if (!route) return null;

  switch (route.name) {
    case "users":
      return <UsersList />;
    case "users.profile":
      return <UserProfile id={route.params.id} />;
    default:
      return null;
  }
}

// useNavigator — stable reference, never causes re-renders
function BackButton() {
  const navigator = useNavigator();
  return <button onClick={() => navigator.navigate("home")}>Back</button>;
}

// useRouterTransition — progress bars, loading states
function GlobalProgress() {
  const { isTransitioning } = useRouterTransition();
  if (!isTransitioning) return null;
  return <div className="progress-bar" />;
}
```

## Components

### `<Link>`

Navigation link with automatic active state detection. Re-renders only when its active status changes.

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

> **Note:** Unlike the React adapter, `keepAlive` is not supported. Preact has no equivalent of React's `<Activity>` API. Components unmount completely when navigating away.

#### `RouteView.Match` props

| Prop       | Type                | Description                                                                 |
| ---------- | ------------------- | --------------------------------------------------------------------------- |
| `segment`  | `string`            | Route segment to match                                                      |
| `fallback` | `ComponentChildren` | Shown while children suspend. Wraps children in `<Suspense>` when provided. |

#### Lazy loading with `fallback` (experimental)

Preact's `lazy` and `Suspense` come from `preact/compat`. Support is experimental — test before shipping to production.

```tsx
import { lazy } from "preact/compat";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" fallback={<Spinner />}>
    <LazyDashboard />
  </RouteView.Match>
</RouteView>;
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
