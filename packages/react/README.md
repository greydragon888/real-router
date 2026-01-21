# @real-router/react

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)

React integration for [@real-router/core](https://github.com/greydragon888/real-router) - hooks, components, and context providers.

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

### Peer Dependencies

- `react` >= 18.0.0
- `@real-router/core` (core router)
- `@real-router/browser-plugin` (for browser history integration)

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, useRoute, Link } from "@real-router/react";
import { createRoot } from "react-dom/client";

// Define routes
const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
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

// Render with provider
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router}>
    <App />
  </RouterProvider>,
);
```

## API Reference

### Provider

#### RouterProvider

Provides router instance and state to all child components via React Context.

```tsx
import { RouterProvider } from "@real-router/react";

<RouterProvider router={router}>
  <App />
</RouterProvider>;
```

**Props:**

- `router` - Router instance created with `createRouter()`
- `children` - React children

### Hooks

#### useRouter

Returns the router instance from context.

```tsx
import { useRouter } from "@real-router/react";

function NavigateButton() {
  const router = useRouter();

  return <button onClick={() => router.navigate("home")}>Go Home</button>;
}
```

#### useRoute

Returns the current route state, previous route, and router instance. Re-renders on every route change.

```tsx
import { useRoute } from "@real-router/react";

function CurrentRoute() {
  const { router, route, previousRoute } = useRoute();

  return (
    <div>
      <p>Current: {route?.name}</p>
      <p>Previous: {previousRoute?.name}</p>
      <p>Params: {JSON.stringify(route?.params)}</p>
      <button onClick={() => router.navigate("home")}>Go Home</button>
    </div>
  );
}
```

**Returns:**

- `router` - Router instance
- `route` - Current route state (`State | undefined`)
- `previousRoute` - Previous route state (`State | undefined`)

#### useRouteNode

Optimized hook that only re-renders when the specified route node changes. Ideal for nested route structures.

```tsx
import { useRouteNode } from "@real-router/react";

function UsersSection() {
  // Only re-renders when routes starting with "users" change
  const { router, route, previousRoute } = useRouteNode("users");

  // route is undefined when current route is NOT under "users" node
  if (!route) {
    return null;
  }

  if (route.name === "users") {
    return <UsersList />;
  }

  if (route.name === "users.profile") {
    return <UserProfile id={route.params.id} />;
  }

  return null;
}
```

**Parameters:**

- `nodeName` - Route segment to observe (e.g., `"users"`, `"users.profile"`)

**Returns:**

- `router` - Router instance
- `route` - Current route state (`State | undefined`) - `undefined` when current route is not under the specified node
- `previousRoute` - Previous route state (`State | undefined`)

### Components

#### Link

Navigation link component with automatic active state detection.

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

**Props:**

| Prop                | Type                    | Default     | Description                         |
| ------------------- | ----------------------- | ----------- | ----------------------------------- |
| `routeName`         | `string`                | (required)  | Target route name                   |
| `routeParams`       | `Params`                | `{}`        | Route parameters                    |
| `routeOptions`      | `{ reload?, replace? }` | `{}`        | Navigation options                  |
| `activeClassName`   | `string`                | `"active"`  | Class applied when route is active  |
| `activeStrict`      | `boolean`               | `false`     | Strict matching (exact route only)  |
| `ignoreQueryParams` | `boolean`               | `true`      | Ignore query params in active check |
| `className`         | `string`                | `undefined` | Base CSS class                      |
| `onClick`           | `(event) => void`       | `undefined` | Click handler                       |
| `successCallback`   | `(state) => void`       | `undefined` | Called on successful navigation     |
| `errorCallback`     | `(error) => void`       | `undefined` | Called on navigation error          |
| `target`            | `string`                | `undefined` | Link target (e.g., `"_blank"`)      |

**Note:** The rendered `<a>` element also includes `data-route` and `data-active` attributes for CSS styling and event delegation.

#### ConnectedLink

Same as `Link`, but re-renders on every route change. Use when you need the link to update based on current route state.

```tsx
import { ConnectedLink } from "@real-router/react";

<ConnectedLink routeName="dashboard" activeClassName="nav-active">
  Dashboard
</ConnectedLink>;
```

#### BaseLink

Low-level link component that requires router instance as prop. Useful for custom implementations.

```tsx
import { BaseLink, useRouter } from "@real-router/react";

function CustomLink({ to, children }) {
  const router = useRouter();

  return (
    <BaseLink router={router} routeName={to}>
      {children}
    </BaseLink>
  );
}
```

### Context

For advanced use cases, you can access contexts directly:

```tsx
import { RouterContext, RouteContext } from "@real-router/react";
import { useContext } from "react";

function CustomComponent() {
  // RouterContext provides: Router | null
  const router = useContext(RouterContext);

  // RouteContext provides: { router, route, previousRoute } | null
  const routeContext = useContext(RouteContext);

  if (!router || !routeContext) {
    throw new Error("Must be used within RouterProvider");
  }

  // Access route state
  const { route, previousRoute } = routeContext;

  // ...
}
```

**Note:** Prefer using hooks (`useRouter`, `useRoute`, `useRouteNode`) over direct context access, as hooks provide better error handling and TypeScript support.

## TypeScript

Full TypeScript support with exported types:

```tsx
import {
  RouterProvider,
  Link,
  ConnectedLink,
  BaseLink,
  useRouter,
  useRoute,
  useRouteNode,
  RouterContext,
  RouteContext,
  type BaseLinkProps,
} from "@real-router/react";
```

### Typed Route Parameters

You can type route parameters by using type assertions:

```tsx
import type { Params, State } from "@real-router/core";

interface UserParams extends Params {
  id: string;
}

function UserProfile() {
  const { route } = useRoute();

  // Type assertion for params
  const params = route?.params as UserParams | undefined;

  return <h1>User: {params?.id}</h1>;
}
```

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history integration

## Migration from react-router5

### Import Changes

```diff
- import { RouterProvider, Link, useRoute, useRouter, useRouteNode } from 'react-router5';
+ import { RouterProvider, Link, useRoute, useRouter, useRouteNode } from '@real-router/react';
```

### Removed: Higher-Order Components (HOCs)

HOCs have been removed in favor of hooks:

```diff
- import { withRouter, withRoute, routeNode } from 'react-router5';
+ import { useRouter, useRoute, useRouteNode } from '@real-router/react';

- const MyComponent = withRouter(({ router }) => {
-   return <button onClick={() => router.navigate('home')}>Home</button>;
- });
+ function MyComponent() {
+   const router = useRouter();
+   return <button onClick={() => router.navigate('home')}>Home</button>;
+ }

- const MyRoute = withRoute(({ route }) => {
-   return <div>Current: {route.name}</div>;
- });
+ function MyRoute() {
+   const { route } = useRoute();
+   return <div>Current: {route?.name}</div>;
+ }

- const UsersNode = routeNode('users')(({ route }) => {
-   return <div>{route.name}</div>;
- });
+ function UsersNode() {
+   const { route } = useRouteNode('users');
+   return <div>{route?.name}</div>;
+ }
```

### Removed: Render Props

Render prop components have been removed in favor of hooks:

```diff
- import { Router, Route, RouteNode } from 'react-router5';
+ import { useRouter, useRoute, useRouteNode } from '@real-router/react';

- <Router>
-   {({ router }) => <button onClick={() => router.navigate('home')}>Home</button>}
- </Router>
+ function MyComponent() {
+   const router = useRouter();
+   return <button onClick={() => router.navigate('home')}>Home</button>;
+ }

- <Route>
-   {({ route }) => <div>Current: {route.name}</div>}
- </Route>
+ function MyRoute() {
+   const { route } = useRoute();
+   return <div>Current: {route?.name}</div>;
+ }

- <RouteNode nodeName="users">
-   {({ route }) => <div>{route.name}</div>}
- </RouteNode>
+ function UsersNode() {
+   const { route } = useRouteNode('users');
+   return <div>{route?.name}</div>;
+ }
```

### Available APIs

| API | react-router5 | @real-router/react |
|-----|---------------|---------------|
| `RouterProvider` | ✓ | ✓ |
| `Link` | ✓ | ✓ |
| `ConnectedLink` | ✓ | ✓ |
| `BaseLink` | ✓ | ✓ |
| `useRouter` | ✓ | ✓ |
| `useRoute` | ✓ | ✓ |
| `useRouteNode` | ✓ | ✓ |
| `withRouter` | ✓ | ❌ removed |
| `withRoute` | ✓ | ❌ removed |
| `routeNode` | ✓ | ❌ removed |
| `Router` (render prop) | ✓ | ❌ removed |
| `Route` (render prop) | ✓ | ❌ removed |
| `RouteNode` (render prop) | ✓ | ❌ removed |

### Full Migration Example

```diff
- import { createRouter } from 'router5';
- import browserPlugin from 'router5-plugin-browser';
- import { RouterProvider, withRoute, Link } from 'react-router5';
+ import { createRouter } from '@real-router/core';
+ import { browserPluginFactory } from '@real-router/browser-plugin';
+ import { RouterProvider, useRoute, Link } from '@real-router/react';

  const router = createRouter(routes);
- router.usePlugin(browserPlugin());
+ router.usePlugin(browserPluginFactory());

- const CurrentRoute = withRoute(({ route }) => (
-   <span>{route.name}</span>
- ));
+ function CurrentRoute() {
+   const { route } = useRoute();
+   return <span>{route?.name}</span>;
+ }

  function App() {
    return (
      <RouterProvider router={router}>
        <nav>
          <Link routeName="home">Home</Link>
        </nav>
        <CurrentRoute />
      </RouterProvider>
    );
  }
```

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
