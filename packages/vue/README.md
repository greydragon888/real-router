# @real-router/vue

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Vue 3 integration for [Real-Router](https://github.com/greydragon888/real-router) — composables, components, and context providers.

## Installation

```bash
npm install @real-router/vue @real-router/core @real-router/browser-plugin
```

**Peer dependency:** `vue` >= 3.3.0

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider, RouteView, Link } from "@real-router/vue";
import { defineComponent, h } from "vue";

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

const App = defineComponent({
  setup() {
    return () =>
      h(
        RouterProvider,
        { router },
        {
          default: () => [
            h("nav", [
              h(Link, { routeName: "home" }, { default: () => "Home" }),
              h(Link, { routeName: "users" }, { default: () => "Users" }),
            ]),
            h(
              RouteView,
              { nodeName: "" },
              {
                default: () => [
                  h(
                    RouteView.Match,
                    { segment: "home" },
                    { default: () => h(HomePage) },
                  ),
                  h(
                    RouteView.Match,
                    { segment: "users" },
                    { default: () => h(UsersPage) },
                  ),
                  h(RouteView.NotFound, null, {
                    default: () => h(NotFoundPage),
                  }),
                ],
              },
            ),
          ],
        },
      );
  },
});
```

Or with Vue SFC templates (the composables and components work in `.vue` files too):

```vue
<template>
  <RouterProvider :router="router">
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
</template>
```

## Plugin Installation (Alternative)

Use `createRouterPlugin` for the standard `app.use()` pattern instead of `<RouterProvider>`:

```typescript
import { createApp } from "vue";
import { createRouterPlugin } from "@real-router/vue";

const app = createApp(App);
app.use(createRouterPlugin(router));
```

All composables (`useRouter`, `useRoute`, etc.) and the `v-link` directive work identically — `app.provide()` resolves the same way as component-level `provide()`. `<RouterProvider>` remains available for advanced cases (multiple routers, scoped routing, testing).

## Composables

Route state composables return `ShallowRef` values. Read `.value` in script, or use them directly in templates where Vue auto-unwraps refs.

| Composable              | Returns                                                       | Reactive?                                |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `useRouter()`           | `Router`                                                      | Never                                    |
| `useNavigator()`        | `Navigator`                                                   | Never (stable ref, safe to use directly) |
| `useRoute()`            | `{ navigator, route: ShallowRef, previousRoute: ShallowRef }` | route/previousRoute on every navigation  |
| `useRouteNode(name)`    | `{ navigator, route: ShallowRef, previousRoute: ShallowRef }` | Only when node activates/deactivates     |
| `useRouteUtils()`       | `RouteUtils`                                                  | Never                                    |
| `useRouterTransition()` | `ShallowRef<RouterTransitionSnapshot>`                        | On transition start/end                  |

```typescript
// useRouteNode — updates only when "users.*" changes
const UsersLayout = defineComponent({
  setup() {
    const { route } = useRouteNode("users");

    return () => {
      if (!route.value) return null;

      switch (route.value.name) {
        case "users":
          return h(UsersList);
        case "users.profile":
          return h(UserProfile, { id: route.value.params.id });
        default:
          return null;
      }
    };
  },
});

// useNavigator — stable reference, never reactive
const BackButton = defineComponent({
  setup() {
    const navigator = useNavigator();
    return () =>
      h("button", { onClick: () => navigator.navigate("home") }, "Back");
  },
});

// useRouterTransition — progress bars, loading states
const GlobalProgress = defineComponent({
  setup() {
    const transition = useRouterTransition();
    return () =>
      transition.value.isTransitioning
        ? h("div", { class: "progress-bar" })
        : null;
  },
});
```

## Components

### `<Link>`

Navigation link with automatic active state detection. Uses `computed()` for href and class — only the DOM attributes update when active state changes.

```typescript
h(
  Link,
  {
    routeName: "users.profile",
    routeParams: { id: "123" },
    activeClassName: "active", // default: "active"
    activeStrict: false, // default: false (ancestor match)
    ignoreQueryParams: true, // default: true
    routeOptions: { replace: true },
  },
  { default: () => "View Profile" },
);
```

In a template:

```vue
<Link
  routeName="users.profile"
  :routeParams="{ id: '123' }"
  activeClassName="active"
  :activeStrict="false"
  :ignoreQueryParams="true"
  :routeOptions="{ replace: true }"
>
  View Profile
</Link>
```

### `<RouteView>`

Declarative route matching. Renders the first matching `<RouteView.Match>` child.

```typescript
h(
  RouteView,
  { nodeName: "" },
  {
    default: () => [
      h(RouteView.Match, { segment: "users" }, { default: () => h(UsersPage) }),
      h(
        RouteView.Match,
        { segment: "settings" },
        { default: () => h(SettingsPage) },
      ),
      h(RouteView.NotFound, null, { default: () => h(NotFoundPage) }),
    ],
  },
);
```

`RouteView.Match` accepts an optional `exact` prop for strict segment matching:

```typescript
h(
  RouteView.Match,
  { segment: "users", exact: true },
  { default: () => h(UsersIndex) },
);
// Only matches "users" exactly, not "users.profile"
```

**`keepAlive` prop:** Vue's native `<KeepAlive>` preserves component state across navigations. Each segment gets a dedicated wrapper component so `<KeepAlive>` can track them independently.

```typescript
h(
  RouteView,
  { nodeName: "", keepAlive: true },
  {
    default: () => [
      h(RouteView.Match, { segment: "users" }, { default: () => h(UsersPage) }),
      // UsersPage stays alive when navigating to settings and back
    ],
  },
);
```

**Lazy loading with `fallback`:** Pass a `fallback` prop (`VNode | (() => VNode)`) to wrap the matched content in Vue's `<Suspense>`. This lets you show a loading state while a `defineAsyncComponent` chunk is fetching. Works with both `keepAlive` and non-`keepAlive` modes.

```typescript
import { defineAsyncComponent, h } from "vue";

const LazyDashboard = defineAsyncComponent(() => import("./Dashboard.vue"));

h(
  RouteView,
  { nodeName: "" },
  {
    default: () => [
      h(
        RouteView.Match,
        { segment: "dashboard", fallback: h(Spinner) },
        { default: () => h(LazyDashboard) },
      ),
    ],
  },
);
```

In a template:

```vue
<script setup>
import { defineAsyncComponent } from "vue";
const LazyDashboard = defineAsyncComponent(() => import("./Dashboard.vue"));
</script>

<RouteView nodeName="">
  <RouteView.Match segment="dashboard" :fallback="SpinnerComponent">
    <LazyDashboard />
  </RouteView.Match>
</RouteView>
```

Without `fallback`, no `<Suspense>` boundary is added. The prop is optional.

### `<RouterErrorBoundary>`

Declarative error handling for navigation errors. Shows a fallback **alongside** children (not instead of) when a guard rejects or a route is not found.

```typescript
import { RouterErrorBoundary } from "@real-router/vue";

h(
  RouterErrorBoundary,
  {
    fallback: (error, resetError) =>
      h("div", { class: "toast" }, [
        error.code,
        h("button", { onClick: resetError }, "Dismiss"),
      ]),
    onError: (error) => analytics.track("nav_error", { code: error.code }),
  },
  {
    default: () =>
      h(Link, { routeName: "protected" }, { default: () => "Go to Protected" }),
  },
);
```

In a template:

```vue
<RouterErrorBoundary
  :fallback="
    (error, resetError) =>
      h('div', { class: 'toast' }, [
        error.code,
        h('button', { onClick: resetError }, 'Dismiss'),
      ])
  "
  :onError="(error) => analytics.track('nav_error', { code: error.code })"
>
  <Link routeName="protected">Go to Protected</Link>
</RouterErrorBoundary>
```

Auto-resets on next successful navigation. Works with both `<Link>` and imperative `router.navigate()`.

## Directives

### `v-link`

Low-level directive for adding navigation to any element. Automatically handles click events, keyboard navigation (Enter key), and cursor styling.

In templates the directive is bound the usual way:

```vue
<a v-link="{ name: 'users.profile', params: { id: '123' } }">
  User Profile
</a>
```

In render functions, Vue's `h()` does NOT accept directives as raw `"v-link"` props. Use `withDirectives` to attach the directive to a VNode:

```typescript
import { defineComponent, h, withDirectives } from "vue";
import { vLink } from "@real-router/vue";

const Profile = defineComponent({
  setup: () => () =>
    withDirectives(
      h("a", null, "User Profile"),
      [[vLink, { name: "users.profile", params: { id: "123" } }]],
    ),
});
```

Or register globally on the app and use the directive name in compiled templates:

```typescript
import { createApp } from "vue";
import { vLink } from "@real-router/vue";

const app = createApp(App);
app.directive("link", vLink);
// In templates: <a v-link="{ name: 'home' }">Home</a>
```

In a template:

```vue
<a v-link="{ name: 'users.profile', params: { id: '123' } }">
  User Profile
</a>

<button v-link="{ name: 'home' }">
  Go Home
</button>

<div v-link="{ name: 'settings' }" role="link" tabindex="0">
  Settings
</div>
```

**Value:**

| Property  | Type     | Default | Description                        |
| --------- | -------- | ------- | ---------------------------------- |
| `name`    | `string` | —       | Target route name                  |
| `params`  | `Params` | `{}`    | Route parameters                   |
| `options` | `object` | `{}`    | Navigation options (replace, etc.) |

The directive automatically sets `cursor: pointer` and adds `role="link"` + `tabindex="0"` to non-interactive elements for accessibility.

## Vue-Specific Patterns

### Refs, Not Plain Values

Unlike the React and Preact adapters, `useRoute()` and `useRouteNode()` return `ShallowRef` values. Read `.value` in script:

```typescript
// React/Preact
const { route } = useRoute();
console.log(route?.name);

// Vue
const { route } = useRoute();
console.log(route.value?.name); // .value in script

// In template — Vue auto-unwraps
// <div>{{ route?.name }}</div>
```

### Watching Route Changes

Use Vue's `watch` to react to route changes in script:

```typescript
const { route } = useRouteNode("users");

watch(route, (newRoute) => {
  if (newRoute) {
    document.title = `Users — ${newRoute.params.id ?? "list"}`;
  }
});
```

### No .vue SFC Required

All components are plain `.ts` files using `defineComponent` + `h()`. You can use them in `.vue` SFC templates or in render functions — both work.

## Accessibility

Enable screen reader announcements for route changes:

```typescript
h(
  RouterProvider,
  { router, announceNavigation: true },
  {
    default: () => [
      /* Your app */
    ],
  },
);
```

Or in a template:

```vue
<RouterProvider :router="router" :announceNavigation="true">
  <!-- Your app -->
</RouterProvider>
```

When enabled, a visually hidden `aria-live` region announces each navigation. Focus moves to the first `<h1>` on the new page. See [Accessibility guide](https://github.com/greydragon888/real-router/wiki/Accessibility) for details.

## Scroll Restoration

Opt-in preservation of scroll position across navigations:

```vue
<RouterProvider :router="router" :scroll-restoration="{ mode: 'restore' }">
  <!-- Your app -->
</RouterProvider>
```

Or via `h()`:

```typescript
h(
  RouterProvider,
  { router, scrollRestoration: { mode: "restore" } },
  { default: () => [/* Your app */] },
);
```

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"manual"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Prop is reactive — toggling mode at runtime reconfigures the utility (watched by primitive fields, so inline objects with the same fields do not thrash). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for details.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition)

## Examples

14 runnable examples — each is a standalone Vite app. Run: `cd examples/vue/basic && pnpm dev`

[basic](../../examples/vue/basic) · [nested-routes](../../examples/vue/nested-routes) · [auth-guards](../../examples/vue/auth-guards) · [data-loading](../../examples/vue/data-loading) · [lazy-loading](../../examples/vue/lazy-loading) · [async-guards](../../examples/vue/async-guards) · [hash-routing](../../examples/vue/hash-routing) · [persistent-params](../../examples/vue/persistent-params) · [error-handling](../../examples/vue/error-handling) · [dynamic-routes](../../examples/vue/dynamic-routes) · [plugin-installation](../../examples/vue/plugin-installation) · [v-link-directive](../../examples/vue/v-link-directive) · [keep-alive](../../examples/vue/keep-alive) · [combined](../../examples/vue/combined)

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
