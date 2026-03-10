# @real-router/react

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19.2+-61DAFB.svg)](https://react.dev/)

React integration for Real-Router — hooks, components, and context providers.

## Installation

```bash
npm install @real-router/react @real-router/core @real-router/browser-plugin
# or
pnpm add @real-router/react @real-router/core @real-router/browser-plugin
# or
yarn add @real-router/react @real-router/core @real-router/browser-plugin
# or
bun add @real-router/react @real-router/core @real-router/browser-plugin
```

**Peer Dependencies:** `react` >= 18.0.0

## Entry Points

The package provides two entry points via subpath exports:

| Import Path                 | React Version | Description                               |
| --------------------------- | ------------- | ----------------------------------------- |
| `@real-router/react`        | 19.2+         | Full API (default)                        |
| `@real-router/react/legacy` | 18+           | Same API minus React 19.2-only components |

```tsx
// React 19.2+ (default) — full API
import { RouterProvider, useRouteNode, Link } from "@real-router/react";

// React 18+ — without React 19.2-only components
import { RouterProvider, useRouteNode, Link } from "@real-router/react/legacy";
```

Both entry points share the same underlying code — `/legacy` is a re-export subset that excludes components requiring React 19.2+ APIs (e.g., `<Activity>`).

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, useRoute, Link } from "@real-router/react";
import { createRoot } from "react-dom/client";

// Define routes
const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

// Create and configure router
const router = createRouter(routes);
router.usePlugin(browserPluginFactory());
router.start();

// App component
function App() {
  const { route } = useRoute();

  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        <Link routeName="users">Users</Link>
      </nav>
      <main>
        <h1>Current route: {route?.name}</h1>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router}>
    <App />
  </RouterProvider>,
);
```

---

## API

### Provider

#### `<RouterProvider router={router}>`

Provides router instance to component tree via React Context.\
`router: Router` — router instance from `createRouter()`\
`children: ReactNode` — child components\
[Wiki](https://github.com/greydragon888/real-router/wiki/RouterProvider)

```tsx
<RouterProvider router={router}>
  <App />
</RouterProvider>
```

---

### Hooks

#### `useRouter(): Router`

Get router instance. **Never re-renders** on navigation.\
Returns: `Router` — router instance\
[Wiki](https://github.com/greydragon888/real-router/wiki/useRouter)

```tsx
import { useRouter } from "@real-router/react";

const NavigateButton = () => {
  const router = useRouter();

  return <button onClick={() => router.navigate("home")}>Go Home</button>;
};
```

#### `useRoute(): { router, route, previousRoute }`

Get current route state. **Re-renders on every navigation.**\
Returns: `{ router: Router, route: State | undefined, previousRoute: State | undefined }`\
[Wiki](https://github.com/greydragon888/real-router/wiki/useRoute)

```tsx
import { useRoute } from "@real-router/react";

const CurrentRoute = () => {
  const { router, route, previousRoute } = useRoute();

  return (
    <div>
      <p>Current: {route?.name}</p>
      <p>Previous: {previousRoute?.name}</p>
      <p>Params: {JSON.stringify(route?.params)}</p>
      <button onClick={() => router.navigate("home")}>Go Home</button>
    </div>
  );
};
```

#### `useRouteNode(nodeName: string): { router, route, previousRoute }`

Optimized hook for nested routes. **Re-renders only when specified node changes.**\
`nodeName: string` — route segment to observe (e.g., `"users"`)
Returns: `{ router: Router, route: State | undefined, previousRoute: State | undefined }`\
[Wiki](https://github.com/greydragon888/real-router/wiki/useRouteNode)

```tsx
import { useRouteNode } from "@real-router/react";

const UsersSection = () => {
  // Only re-renders when routes starting with "users" change
  const { router, route, previousRoute } = useRouteNode("users");

  // route is undefined when current route is NOT under "users" node
  if (!route) {
    return null;
  }

  switch (route.name) {
    case "users":
      return <UsersList />;
    case "users.profile":
      return <UserProfile id={route.params.id} />;
    default:
      return null;
  }
};
```

#### `useRouteUtils(): RouteUtils`

Get pre-computed route tree query utilities. **Never re-renders** on navigation.\
Returns: `RouteUtils` — cached instance with chain, sibling, and descendant lookups\
[Wiki](https://github.com/greydragon888/real-router/wiki/useRouteUtils)

```tsx
import { useRouteUtils } from "@real-router/react";

const Breadcrumbs = () => {
  const utils = useRouteUtils();
  const chain = utils.getChain("users.profile");
  // → ["users", "users.profile"]

  return (
    <nav>
      {chain?.map((segment) => (
        <span key={segment}>{segment}</span>
      ))}
    </nav>
  );
};
```

#### `useRouterTransition(): RouterTransitionSnapshot`

Track router transition lifecycle (start/success/error/cancel). **Re-renders on transition start and end.**\
Returns: `RouterTransitionSnapshot` — `{ isTransitioning: boolean, toRoute: State | null, fromRoute: State | null }`

```tsx
import { useRouterTransition } from "@real-router/react";

const GlobalProgress = () => {
  const { isTransitioning, toRoute, fromRoute } = useRouterTransition();

  if (!isTransitioning) return null;

  return (
    <div className="progress-bar">
      Navigating from {fromRoute?.name} to {toRoute?.name}…
    </div>
  );
};
```

Useful for progress bars, loading overlays, and disabling UI during async navigation guards. Returns `{ isTransitioning: false, toRoute: null, fromRoute: null }` when idle.

---

### Components

#### `<Link routeName={string} routeParams={object} ...props>`

Navigation link with automatic active state detection. Re-renders only when its own active status changes.\
`routeName: string` — target route name\
`routeParams?: Params` — route parameters\
`routeOptions?: { reload?, replace? }` — navigation options\
`activeClassName?: string` — class when active (default: `"active"`)
`activeStrict?: boolean` — exact match only (default: `false`)
`ignoreQueryParams?: boolean` — ignore query params in active check (default: `true`)\
[Wiki](https://github.com/greydragon888/real-router/wiki/Link)

```tsx
import { Link } from "@real-router/react";

<Link
  routeName="users.profile"
  routeParams={{ id: "123" }}
  activeClassName="active"
  activeStrict={false}
>
  View Profile
</Link>;
```

#### `<RouteView nodeName={string}>`

Declarative route matching component. Subscribes to a route node and renders the first matched segment.\
`nodeName: string` — route node to subscribe to (`""` for root)\
[Wiki](https://github.com/greydragon888/real-router/wiki/RouteView)

> **Note:** `RouteView` is only available from the main entry point (`@real-router/react`). It requires React 19.2+ for `keepAlive` support via `<Activity>`.

```tsx
import { RouteView } from "@real-router/react";

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
</RouteView>;
```

##### `keepAlive`

`<RouteView.Match>` accepts an optional `keepAlive` prop. When enabled, the matched component's state and DOM are preserved when navigating away, using React 19.2's `<Activity>` API.

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users" keepAlive>
    <UsersPage /> {/* State preserved when navigating away */}
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage /> {/* Unmounts normally */}
  </RouteView.Match>
</RouteView>
```

When the user navigates away from a `keepAlive` match, the component is hidden (via `<Activity mode="hidden">`) rather than unmounted. Navigating back restores the previous state instantly without re-mounting.

---

## Migration from React 18

If your app uses React 18 (or < 19.2), use the legacy entry point:

```diff
- import { useRouteNode, Link } from '@real-router/react';
+ import { useRouteNode, Link } from '@real-router/react/legacy';
```

One import path change. All hooks and `Link` work identically. The only difference: `RouteView` (which uses React 19.2's `<Activity>` for `keepAlive`) is not available from `/legacy`. Use `useRouteNode` with a switch/case pattern instead.

---

## Migration from react-router5

| API                                           | react-router5 | @real-router/react |
| --------------------------------------------- | ------------- | ------------------ |
| `RouterProvider`                              | ✓             | ✓                  |
| `Link`                                        | ✓             | ✓                  |
| `useRouter`, `useRoute`, `useRouteNode`       | ✓             | ✓                  |
| `withRouter`, `withRoute`, `routeNode`        | ✓             | ❌ Use hooks       |
| `Router`, `Route`, `RouteNode` (render props) | ✓             | ❌ Use hooks       |

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
