# react-router6

[![npm version](https://badge.fury.io/js/react-router6.svg)](https://www.npmjs.com/package/react-router6)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)

React integration for [router6](https://github.com/greydragon888/router6) - hooks, components, and context providers.

## Installation

```bash
npm install react-router6 router6 router6-plugin-browser
# or
pnpm add react-router6 router6 router6-plugin-browser
# or
yarn add react-router6 router6 router6-plugin-browser
# or
bun add react-router6 router6 router6-plugin-browser
```

### Peer Dependencies

- `react` >= 18.0.0
- `router6` (core router)
- `router6-plugin-browser` (for browser history integration)

## Quick Start

```tsx
import { createRouter } from "router6";
import { browserPlugin } from "router6-plugin-browser";
import { RouterProvider, useRoute, Link } from "react-router6";
import { createRoot } from "react-dom/client";

// Define routes
const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
];

// Create and configure router
const router = createRouter(routes);
router.usePlugin(browserPlugin());
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
import { RouterProvider } from "react-router6";

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
import { useRouter } from "react-router6";

function NavigateButton() {
  const router = useRouter();

  return <button onClick={() => router.navigate("home")}>Go Home</button>;
}
```

#### useRoute

Returns the current route state and previous route. Re-renders on every route change.

```tsx
import { useRoute } from "react-router6";

function CurrentRoute() {
  const { route, previousRoute } = useRoute();

  return (
    <div>
      <p>Current: {route?.name}</p>
      <p>Previous: {previousRoute?.name}</p>
      <p>Params: {JSON.stringify(route?.params)}</p>
    </div>
  );
}
```

**Returns:**

- `route` - Current route state (`State | undefined`)
- `previousRoute` - Previous route state (`State | undefined`)

#### useRouteNode

Optimized hook that only re-renders when the specified route node changes. Ideal for nested route structures.

```tsx
import { useRouteNode } from "react-router6";

function UsersSection() {
  // Only re-renders when routes starting with "users" change
  const { route } = useRouteNode("users");

  if (route?.name === "users") {
    return <UsersList />;
  }

  if (route?.name === "users.profile") {
    return <UserProfile id={route.params.id} />;
  }

  return null;
}
```

**Parameters:**

- `nodeName` - Route segment to observe (e.g., `"users"`, `"users.profile"`)

### Components

#### Link

Navigation link component with automatic active state detection.

```tsx
import { Link } from "react-router6";

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

| Prop                | Type                    | Description                         |
| ------------------- | ----------------------- | ----------------------------------- |
| `routeName`         | `string`                | Target route name                   |
| `routeParams`       | `Params`                | Route parameters                    |
| `routeOptions`      | `{ reload?, replace? }` | Navigation options                  |
| `activeClassName`   | `string`                | Class applied when route is active  |
| `activeStrict`      | `boolean`               | Strict matching (exact route only)  |
| `ignoreQueryParams` | `boolean`               | Ignore query params in active check |
| `className`         | `string`                | Base CSS class                      |
| `onClick`           | `(event) => void`       | Click handler                       |
| `successCallback`   | `(state) => void`       | Called on successful navigation     |
| `errorCallback`     | `(error) => void`       | Called on navigation error          |
| `target`            | `string`                | Link target (e.g., `"_blank"`)      |

#### ConnectedLink

Same as `Link`, but re-renders on every route change. Use when you need the link to update based on current route state.

```tsx
import { ConnectedLink } from "react-router6";

<ConnectedLink routeName="dashboard" activeClassName="nav-active">
  Dashboard
</ConnectedLink>;
```

#### BaseLink

Low-level link component that requires router instance as prop. Useful for custom implementations.

```tsx
import { BaseLink, useRouter } from "react-router6";

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
import { RouterContext, RouteContext } from "react-router6";
import { useContext } from "react";

function CustomComponent() {
  const router = useContext(RouterContext);
  const routeState = useContext(RouteContext);

  // ...
}
```

## TypeScript

Full TypeScript support with generics for route parameters:

```tsx
import type { Params } from "router6";

interface UserParams extends Params {
  id: string;
}

function UserProfile() {
  const { route } = useRoute<UserParams>();

  // route.params.id is typed as string
  return <h1>User: {route?.params.id}</h1>;
}
```

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [RouterProvider](https://github.com/greydragon888/router6/wiki/RouterProvider)
- [useRouter](https://github.com/greydragon888/router6/wiki/useRouter)
- [useRoute](https://github.com/greydragon888/router6/wiki/useRoute)
- [useRouteNode](https://github.com/greydragon888/router6/wiki/useRouteNode)
- [Link](https://github.com/greydragon888/router6/wiki/Link)
- [BaseLink](https://github.com/greydragon888/router6/wiki/BaseLink)
- [ConnectedLink](https://github.com/greydragon888/router6/wiki/ConnectedLink)

## Migration from react-router5

### Import Changes

```diff
- import { RouterProvider, Link, useRoute, useRouter, useRouteNode } from 'react-router5';
+ import { RouterProvider, Link, useRoute, useRouter, useRouteNode } from 'react-router6';
```

### Removed: Higher-Order Components (HOCs)

HOCs have been removed in favor of hooks:

```diff
- import { withRouter, withRoute, routeNode } from 'react-router5';
+ import { useRouter, useRoute, useRouteNode } from 'react-router6';

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
+ import { useRouter, useRoute, useRouteNode } from 'react-router6';

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

| API | react-router5 | react-router6 |
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
+ import { createRouter } from 'router6';
+ import { browserPluginFactory } from 'router6-plugin-browser';
+ import { RouterProvider, useRoute, Link } from 'react-router6';

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
