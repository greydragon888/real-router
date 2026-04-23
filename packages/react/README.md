# @real-router/react

[![npm](https://img.shields.io/npm/v/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/react&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/react&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> React integration for [Real-Router](https://github.com/greydragon888/real-router) — hooks, components, and context providers.

## Installation

```bash
npm install @real-router/react @real-router/core @real-router/browser-plugin
```

**Peer dependency:** main entry requires `react` >= 19.2.0 (uses `<Activity>`); `@real-router/react/legacy` works with `react` >= 18.0.0; `@real-router/react/ink` requires `react` >= 19.2 **and** `ink` >= 7.0.0 (Ink v7 itself pins React 19.2+).

## Entry Points

| Import Path                 | React Version | Runtime           | Includes                                               |
| --------------------------- | ------------- | ----------------- | ------------------------------------------------------ |
| `@real-router/react`        | 19.2+         | DOM               | Full API (hooks, `Link`, `RouteView` with `keepAlive`) |
| `@real-router/react/legacy` | 18+           | DOM               | All hooks and `Link`, no `RouteView`                   |
| `@real-router/react/ink`    | 19.2+         | Terminal (Ink 7+) | Hooks, `InkRouterProvider`, `InkLink`, no `RouteView`  |

All entries share the same underlying hook code. `/legacy` excludes React 19.2 `<Activity>`; `/ink` excludes DOM-bound primitives (`<a>`-based `Link`, `announceNavigation`) and replaces them with keyboard-driven terminal equivalents.

## Quick Start

```tsx
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, RouteView, Link } from "@real-router/react";

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

| Hook                    | Returns                                                    | Re-renders                              |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `useRouter()`           | `Router`                                                   | Never                                   |
| `useNavigator()`        | `Navigator`                                                | Never (stable ref, safe to destructure) |
| `useRoute()`            | `{ navigator, route, previousRoute }`                      | Every navigation                        |
| `useRouteNode(name)`    | `{ navigator, route, previousRoute }`                      | Only when node activates/deactivates    |
| `useRouteUtils()`       | `RouteUtils`                                               | Never                                   |
| `useRouterTransition()` | `{ isTransitioning, isLeaveApproved, toRoute, fromRoute }` | On transition start/end                 |

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

### `<RouteView>` (React 19.2+)

Declarative route matching with optional `keepAlive` — preserves component state via React's `<Activity>` API.

```tsx
<RouteView nodeName="">
  <RouteView.Match segment="users" keepAlive>
    <UsersPage /> {/* State preserved when navigating away */}
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage /> {/* Unmounts normally */}
  </RouteView.Match>
  <RouteView.NotFound>
    <NotFoundPage />
  </RouteView.NotFound>
</RouteView>
```

#### `RouteView.Match` props

| Prop        | Type        | Description                                                                 |
| ----------- | ----------- | --------------------------------------------------------------------------- |
| `segment`   | `string`    | Route segment to match                                                      |
| `exact`     | `boolean`   | Exact match only — no descendants. Defaults to `false`.                     |
| `keepAlive` | `boolean`   | Preserve state via React `<Activity>` (React 19.2+)                         |
| `fallback`  | `ReactNode` | Shown while children suspend. Wraps children in `<Suspense>` when provided. |

#### Lazy loading with `fallback`

Pass `fallback` to code-split a route component. `RouteView.Match` wraps children in `<Suspense>` automatically:

```tsx
import { lazy } from "react";

const LazyDashboard = lazy(() => import("./Dashboard"));

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" fallback={<Spinner />}>
    <LazyDashboard />
  </RouteView.Match>
</RouteView>;
```

`fallback` and `keepAlive` work together — `<Activity>` wraps the whole match including the `<Suspense>` boundary.

### `<RouterErrorBoundary>`

Declarative error handling for navigation errors. Shows a fallback **alongside** children (not instead of) when a guard rejects or a route is not found.

```tsx
<RouterErrorBoundary
  fallback={(error, resetError) => (
    <div className="toast">
      {error.code} <button onClick={resetError}>Dismiss</button>
    </div>
  )}
  onError={(error) => analytics.track("nav_error", { code: error.code })}
>
  <Link routeName="protected">Go to Protected</Link>
</RouterErrorBoundary>
```

Auto-resets on next successful navigation. Works with both `<Link>` and imperative `router.navigate()`.

Available from both `@real-router/react` and `@real-router/react/legacy`.

## React 18 Migration

One import path change — all hooks and `Link` work identically:

```diff
- import { useRouteNode, Link } from '@real-router/react';
+ import { useRouteNode, Link } from '@real-router/react/legacy';
```

`RouteView` is not available from `/legacy`. Use `useRouteNode` with a switch/case pattern instead.

## Ink (Terminal UI)

`@real-router/react/ink` lets you build terminal apps with the same hooks you use in the browser.

> The official Ink routing recipe ([vadimdemedes/ink#874](https://github.com/vadimdemedes/ink/pull/874), merged Feb 2026) recommends React Router's `MemoryRouter` plus hand-rolled `useInput` / `useNavigate` per menu item — there's no Link-equivalent because RR's `<Link>` renders HTML anchors, which terminals can't handle. **We ship that packaged**: `<InkLink>` is focus-aware out of the box (joins Ink's focus ring, Enter navigates, `activeColor`/`focusColor` props), and `@real-router/memory-plugin` replaces `MemoryRouter`. No boilerplate per menu entry.

Ships three entry-specific pieces alongside the shared hooks:

- `InkRouterProvider` — drop-in provider, no DOM, no aria-live.
- `InkLink` — focusable text link. Joins Ink's focus ring via `useFocus`; Enter navigates.
- Hooks re-exported unchanged.

```tsx
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import { InkLink, InkRouterProvider, useRouteNode } from "@real-router/react/ink";
import { Box, Text, render } from "ink";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
]);

router.usePlugin(memoryPluginFactory());
await router.start("/");

const App = () => {
  const { route } = useRouteNode("");

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box columnGap={2}>
        <InkLink routeName="home" focusColor="cyan" activeColor="green" autoFocus>
          [ Home ]
        </InkLink>
        <InkLink routeName="users" focusColor="cyan" activeColor="green">
          [ Users ]
        </InkLink>
      </Box>
      <Text>Current: {route?.name}</Text>
    </Box>
  );
};

render(
  <InkRouterProvider router={router}>
    <App />
  </InkRouterProvider>,
);
```

**Navigation contract:** Tab moves focus between `InkLink`s, Enter calls `router.navigate(...)`. `RouteView` and the DOM `Link` are intentionally absent from this entry — compose routes with `useRouteNode("")` and a switch.

**Install:**

```bash
npm install @real-router/react @real-router/core @real-router/memory-plugin ink
```

`ink` is an optional peer dependency — only install it if you use `/ink`.

## Migration from react-router5

| API                                                    | react-router5 | @real-router/react |
| ------------------------------------------------------ | ------------- | ------------------ |
| `RouterProvider`, `Link`                               | Yes           | Yes                |
| `useRouter`, `useRoute`, `useRouteNode`                | Yes           | Yes                |
| `RouteView` with `keepAlive`                           | No            | Yes (React 19.2+)  |
| `useNavigator`, `useRouteUtils`, `useRouterTransition` | No            | Yes                |
| `RouterErrorBoundary` (declarative error handling)     | No            | Yes                |
| `withRouter`, `withRoute`, `routeNode` (HOCs)          | Yes           | No — use hooks     |
| `Router`, `Route`, `RouteNode` (render props)          | Yes           | No — use hooks     |

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

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"manual"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Lifecycle tied to the provider — created on mount, destroyed on unmount. See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for details.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition)

## Examples

14 runnable examples — each is a standalone Vite app. Run: `cd examples/web/react/basic && pnpm dev`

[basic](../../examples/web/react/basic) · [nested-routes](../../examples/web/react/nested-routes) · [auth-guards](../../examples/web/react/auth-guards) · [data-loading](../../examples/web/react/data-loading) · [lazy-loading](../../examples/web/react/lazy-loading) · [async-guards](../../examples/web/react/async-guards) · [hash-routing](../../examples/web/react/hash-routing) · [persistent-params](../../examples/web/react/persistent-params) · [error-handling](../../examples/web/react/error-handling) · [dynamic-routes](../../examples/web/react/dynamic-routes) · [keep-alive](../../examples/web/react/keep-alive) · [legacy-entry](../../examples/web/react/legacy-entry) · [hmr](../../examples/web/react/hmr) · [combined](../../examples/web/react/combined)

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
