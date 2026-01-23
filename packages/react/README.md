# @real-router/react

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)

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
}
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
}
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
}
```

---

### Components

#### `<Link routeName={string} routeParams={object} ...props>`
Navigation link with automatic active state detection.\
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
</Link>
```

#### `<ConnectedLink ...props>`
Same as `Link`, but re-renders on every route change.\
Props: same as `Link`\
[Wiki](https://github.com/greydragon888/real-router/wiki/ConnectedLink)

#### `<BaseLink router={router} ...props>`
Low-level link component. Requires router instance as prop.\
`router: Router` — router instance\
Props: same as `Link`\
[Wiki](https://github.com/greydragon888/real-router/wiki/BaseLink)

---

## Migration from react-router5

| API                                           | react-router5 | @real-router/react |
| --------------------------------------------- | ------------- | ------------------ |
| `RouterProvider`                              | ✓             | ✓                  |
| `Link`, `ConnectedLink`, `BaseLink`           | ✓             | ✓                  |
| `useRouter`, `useRoute`, `useRouteNode`       | ✓             | ✓                  |
| `withRouter`, `withRoute`, `routeNode`        | ✓             | ❌ Use hooks       |
| `Router`, `Route`, `RouteNode` (render props) | ✓             | ❌ Use hooks       |

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
