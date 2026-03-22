# @real-router/svelte

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Svelte 5 integration for [Real-Router](https://github.com/greydragon888/real-router) — composables, components, and context providers.

## Installation

```bash
npm install @real-router/svelte @real-router/core @real-router/browser-plugin
```

**Peer dependency:** `svelte` >= 5.7.0

## Quick Start

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { createRouter } from "@real-router/core";
  import { browserPluginFactory } from "@real-router/browser-plugin";
  import { RouterProvider, RouteView, Link } from "@real-router/svelte";
  import HomePage from "./HomePage.svelte";
  import UsersPage from "./UsersPage.svelte";
  import NotFoundPage from "./NotFoundPage.svelte";

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
</script>

<RouterProvider {router}>
  <nav>
    <Link routeName="home">Home</Link>
    <Link routeName="users">Users</Link>
  </nav>

  <RouteView nodeName="">
    {#snippet home()}
      <HomePage />
    {/snippet}
    {#snippet users()}
      <UsersPage />
    {/snippet}
    {#snippet notFound()}
      <NotFoundPage />
    {/snippet}
  </RouteView>
</RouterProvider>
```

## Composables

All composables must be called during component initialization (not inside `$effect` or event handlers). Reactive composables return `{ current: T }` getter objects — read `.current` inside a template or `$derived` to register a reactive dependency.

| Composable              | Returns                                                         | Reactive?                                  |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `useRouter()`           | `Router`                                                        | Never                                      |
| `useNavigator()`        | `Navigator`                                                     | Never (stable ref, safe to use directly)   |
| `useRoute()`            | `{ navigator, route: { current }, previousRoute: { current } }` | `.current` on every navigation             |
| `useRouteNode(name)`    | `{ navigator, route: { current }, previousRoute: { current } }` | `.current` when node activates/deactivates |
| `useRouteUtils()`       | `RouteUtils`                                                    | Never                                      |
| `useRouterTransition()` | `{ current: RouterTransitionSnapshot }`                         | `.current` on transition start/end         |

```svelte
<!-- useRouteNode — updates only when "users.*" changes -->
<script lang="ts">
  import { useRouteNode } from "@real-router/svelte";

  const { route } = useRouteNode("users");
</script>

{#if route.current}
  {#if route.current.name === "users"}
    <UsersList />
  {:else if route.current.name === "users.profile"}
    <UserProfile id={route.current.params.id} />
  {/if}
{/if}
```

```svelte
<!-- useNavigator — stable reference, never reactive -->
<script lang="ts">
  import { useNavigator } from "@real-router/svelte";

  const navigator = useNavigator();
</script>

<button onclick={() => navigator.navigate("home")}>Back</button>
```

```svelte
<!-- useRouterTransition — progress bars, loading states -->
<script lang="ts">
  import { useRouterTransition } from "@real-router/svelte";

  const transition = useRouterTransition();
</script>

{#if transition.current.isTransitioning}
  <div class="progress-bar"></div>
{/if}
```

## Components

### `<Link>`

Navigation link with automatic active state detection. Uses `$derived` for href and class — only the DOM attributes update when active state changes.

```svelte
<Link
  routeName="users.profile"
  routeParams={{ id: "123" }}
  activeClassName="active"
  activeStrict={false}
  ignoreQueryParams={true}
  routeOptions={{ replace: true }}
>
  View Profile
</Link>
```

**Props:**

| Prop                | Type                | Default     | Description                             |
| ------------------- | ------------------- | ----------- | --------------------------------------- |
| `routeName`         | `string`            | required    | Target route name                       |
| `routeParams`       | `Params`            | `{}`        | Route parameters                        |
| `routeOptions`      | `NavigationOptions` | `{}`        | Navigation options (replace, etc.)      |
| `class`             | `string`            | `undefined` | CSS class                               |
| `activeClassName`   | `string`            | `"active"`  | Class added when route is active        |
| `activeStrict`      | `boolean`           | `false`     | Exact match only (no ancestor matching) |
| `ignoreQueryParams` | `boolean`           | `true`      | Query params don't affect active state  |
| `target`            | `string`            | `undefined` | Link target (`_blank`, etc.)            |

All other props are spread onto the `<a>` element.

### `<Lazy>`

Lazy-load route content with a fallback component while loading. Useful for code-splitting and dynamic imports.

```svelte
<RouteView nodeName="">
  {#snippet dashboard()}
    <Lazy loader={() => import('./Dashboard.svelte')} fallback={Spinner} />
  {/snippet}
</RouteView>
```

**Props:**

| Prop       | Type                                    | Default     | Description                               |
| ---------- | --------------------------------------- | ----------- | ----------------------------------------- |
| `loader`   | `() => Promise<{ default: Component }>` | required    | Async function that imports the component |
| `fallback` | `Component`                             | `undefined` | Component to render while loading         |

The `loader` function should return a dynamic import promise. The `fallback` component is rendered while the import is pending. If an error occurs during loading, an error message is displayed.

### `<RouteView>`

Declarative route matching. Renders the snippet whose name matches the active route segment.

```svelte
<RouteView nodeName="">
  {#snippet users()}
    <UsersPage />
  {/snippet}
  {#snippet settings()}
    <SettingsPage />
  {/snippet}
  {#snippet notFound()}
    <NotFoundPage />
  {/snippet}
</RouteView>
```

**Props:**

| Prop        | Type      | Description                                 |
| ----------- | --------- | ------------------------------------------- |
| `nodeName`  | `string`  | Route node to match against. `""` for root. |
| `notFound`  | `Snippet` | Rendered when route is `UNKNOWN_ROUTE`      |
| `[segment]` | `Snippet` | Named snippet matching a route segment      |

Snippet names must be valid JavaScript identifiers and match the first segment of the active route after `nodeName`. For a route `users.profile` with `nodeName=""`, the snippet named `users` matches.

> **Note:** `keepAlive` is not supported. Svelte has no equivalent of React's `<Activity>` API or Vue's `<KeepAlive>`. Components are destroyed when navigating away.

## Actions

### `createLinkAction`

Factory function that creates a low-level action for adding navigation to any element. Must be called during component initialization to capture the router context.

```svelte
<script lang="ts">
  import { createLinkAction } from "@real-router/svelte";

  const link = createLinkAction();
</script>

<a use:link={{ name: "users.profile", params: { id: "123" } }}>
  User Profile
</a>

<button use:link={{ name: "home" }}>
  Go Home
</button>

<div use:link={{ name: "settings", params: {}, options: { replace: true } }} role="link" tabindex="0">
  Settings
</div>
```

**Parameters:**

| Property  | Type     | Default | Description                        |
| --------- | -------- | ------- | ---------------------------------- |
| `name`    | `string` | —       | Target route name                  |
| `params`  | `Params` | `{}`    | Route parameters                   |
| `options` | `object` | `{}`    | Navigation options (replace, etc.) |

The action automatically adds `role="link"` + `tabindex="0"` to non-interactive elements for accessibility. It handles click events and Enter key navigation.

## Reactive Primitives

### `createReactiveSource`

Public building block that bridges any `RouterSource<T>` to Svelte's reactivity system. Returns a `{ current: T }` getter object that lazily subscribes via `createSubscriber`.

```svelte
<script lang="ts">
  import { createReactiveSource, useRouter } from "@real-router/svelte";
  import { createActiveRouteSource } from "@real-router/sources";

  const router = useRouter();
  const isActive = createReactiveSource(
    createActiveRouteSource(router, "users.profile", {})
  );
</script>

{#if isActive.current}
  <span class="badge">Active</span>
{/if}
```

Use cases: custom active route indicators, domain-specific composables, integration with other reactive primitives.

## Svelte-Specific Patterns

### Reading .current in Reactive Contexts

Unlike Vue (ShallowRefs) or Solid (Accessors), Svelte composables return `{ current: T }` getter objects. Read `.current` inside a template or `$derived` to register a reactive dependency:

```svelte
<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  const { route } = useRoute();

  // CORRECT — $derived registers a reactive dependency
  const routeName = $derived(route.current?.name);

  // WRONG — read outside reactive context, no subscription
  console.log(route.current?.name);
</script>

<!-- CORRECT — template is a reactive context -->
<p>{route.current?.name}</p>
```

### Reacting to Route Changes

Use `$effect` to run side effects when the route changes:

```svelte
<script lang="ts">
  import { useRouteNode } from "@real-router/svelte";

  const { route } = useRouteNode("users");

  $effect(() => {
    if (route.current) {
      document.title = `Users — ${route.current.params.id ?? "list"}`;
    }
  });
</script>
```

### Nested RouteView

For nested routes, use `RouteView` at each level with the appropriate `nodeName`:

```svelte
<!-- Top-level: matches "users", "settings", etc. -->
<RouteView nodeName="">
  {#snippet users()}
    <!-- Nested: matches "users.list", "users.profile", etc. -->
    <RouteView nodeName="users">
      {#snippet list()}
        <UsersList />
      {/snippet}
      {#snippet profile()}
        <UserProfile />
      {/snippet}
    </RouteView>
  {/snippet}
</RouteView>
```

## Accessibility

Enable screen reader announcements for route changes:

```svelte
<RouterProvider {router} announceNavigation>
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
