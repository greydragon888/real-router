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

Route state composables return `Readonly<Ref>` values — `useRoute` mirrors a `shallowRef`, `useRouteNode` derives a `computed`, and `useRouterTransition` returns a `ShallowRef` directly. Consumers only need `.value` read access; in templates Vue auto-unwraps refs.

| Composable                         | Returns                                                                                                                               | Reactive?                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `useRouter()`                      | `Router`                                                                                                                              | Never                                    |
| `useNavigator()`                   | `Navigator`                                                                                                                           | Never (stable ref, safe to use directly) |
| `useRoute()`                       | `{ navigator, route: Readonly<Ref<State>>, previousRoute: Readonly<Ref<State \| undefined>> }`                                        | route/previousRoute on every navigation  |
| `useRouteNode(name)`               | `{ navigator, route: Readonly<Ref<State \| undefined>>, previousRoute: Readonly<Ref<State \| undefined>> }` (computed under the hood) | Only when node activates/deactivates     |
| `useRouteUtils()`                  | `RouteUtils`                                                                                                                          | Never                                    |
| `useRouterTransition()`            | `ShallowRef<RouterTransitionSnapshot>`                                                                                                | On transition start/end                  |
| `useRouteExit(handler, options?)`  | `void` — wraps `subscribeLeave` with abort + same-route guards                                                                        | Never (handler captured in `setup()`)    |
| `useRouteEnter(handler, options?)` | `void` — fires once on nav-driven mount via `watch(route)` + `transition.from`                                                        | Never (handler captured in `setup()`)    |

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

// useRouteExit — exit animations, draft autosave, AbortSignal-aware cleanup
const FadeOut = defineComponent({
  setup() {
    const box = useTemplateRef<HTMLDivElement>("box");
    useRouteExit(async ({ signal }) => {
      const el = box.value;
      if (!el) return;
      el.classList.add("fade-out");
      const cleanup = () => el.classList.remove("fade-out");
      signal.addEventListener("abort", cleanup, { once: true });
      el.getBoundingClientRect(); // style flush
      await Promise.allSettled(el.getAnimations().map((a) => a.finished));
      cleanup();
    });
    return () => h("div", { ref: "box" });
  },
});

// useRouteEnter — page-enter analytics, focus management, entry animations
const PageEnterAnalytics = defineComponent({
  setup() {
    useRouteEnter(({ route, previousRoute }) => {
      analytics.track("page_enter", {
        route: route.name,
        from: previousRoute.name,
      });
    });
    return () => null;
  },
});
```

> **Vue handler-reactivity:** composables run once in `setup()`, so `handler`
> is captured at hook-call time. To vary behavior over time, read
> refs/computeds **inside** the handler body. See [CLAUDE.md](./CLAUDE.md) →
> "useRouteExit / useRouteEnter Handler Is Captured At Init".

## Components

### `<Link>`

Navigation link with automatic active state detection. Uses `computed()` for href and class — only the DOM attributes update when active state changes.

```typescript
h(
  Link,
  {
    routeName: "users.profile",
    routeParams: { id: "123" }, // path channel
    routeSearch: { tab: "posts" }, // query channel (RFC-4 M2) — parallel to routeParams
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
  :routeSearch="{ tab: 'posts' }"
  activeClassName="active"
  :activeStrict="false"
  :ignoreQueryParams="true"
  :routeOptions="{ replace: true }"
>
  View Profile
</Link>
```

`routeSearch` is the query (search) channel of the path/query split — parallel
to `routeParams`, the path channel. A route's query still works when passed
inside `routeParams` (the pre-split form); `routeSearch` is the explicit,
type-clean channel. `<Link>` also accepts a single `to={{ name, params?, search?
}}` descriptor as an alternative to the `routeName`/`routeParams`/`routeSearch`
channel props — see [CLAUDE.md](./CLAUDE.md) → "`routeSearch` Prop" / "`to`
Descriptor Prop" for the full breakdown.

#### `hash` prop — URL fragment / tab-style UIs

```vue
<Link routeName="settings" hash="profile">Profile</Link>
<Link routeName="settings" hash="account">Account</Link>
```

Tri-state: `undefined` preserves the current hash, `""` clears it, a value sets it. Active class is hash-aware — only the matching tab lights up. Live demo (React adapter, same API): [`examples/web/react/hash-examples/link-hash/`](../../examples/web/react/hash-examples/link-hash/) — template syntax differs, behavior is identical. See the [Hash Fragment Support](https://github.com/greydragon888/real-router/wiki/Hash) wiki page for the full surface.

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

**`<RouteView.Self>`** — renders when the active route name **exactly equals** the parent `<RouteView>`'s `nodeName`. Use for leaf pages where the parent route itself is the destination. Self outranks `<NotFound>` and yields to any activating `<Match>`. First-`<Self>`-wins if multiple are provided.

```typescript
h(
  RouteView,
  { nodeName: "users" },
  {
    default: () => [
      // Active when route.name === "users" — the "directory index" of the node
      h(RouteView.Self, null, { default: () => h(UsersIndex) }),
      // Active when route.name === "users.profile"
      h(
        RouteView.Match,
        { segment: "users.profile" },
        { default: () => h(UserProfile) },
      ),
      h(RouteView.NotFound, null, { default: () => h(NotFoundPage) }),
    ],
  },
);
```

`RouteView.Self` also accepts an optional `fallback` prop (same semantics as `RouteView.Match.fallback`) for Suspense integration with `defineAsyncComponent`.

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

**Per-Match `keepAlive`:** `RouteView.Match` also accepts its own `keepAlive` prop for fine-grained control. This lets you keep only specific routes alive without enabling `keepAlive` on the parent `<RouteView>`.

```typescript
h(
  RouteView,
  { nodeName: "" },
  {
    default: () => [
      // Only UsersPage is kept alive; SettingsPage always remounts
      h(
        RouteView.Match,
        { segment: "users", keepAlive: true },
        { default: () => h(UsersPage) },
      ),
      h(
        RouteView.Match,
        { segment: "settings" },
        { default: () => h(SettingsPage) },
      ),
    ],
  },
);
```

In a template:

```vue
<RouteView nodeName="">
  <RouteView.Match segment="users" keepAlive>
    <UsersPage />
  </RouteView.Match>
  <RouteView.Match segment="settings">
    <SettingsPage />
  </RouteView.Match>
</RouteView>
```

Per-Match `keepAlive` is checked first; if any `Match` child has `keepAlive: true`, the `<KeepAlive>` wrapper is created for that segment even if the parent `<RouteView>` prop is not set.

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

### `<ClientOnly>` / `<ServerOnly>`

Paired SSR-aware boundaries. `<ClientOnly>` renders the `fallback` slot on the server (and on the client first paint, to match SSR HTML), then swaps in the `default` slot after mount. `<ServerOnly>` is the symmetric inverse.

```vue
<script setup lang="ts">
import { ClientOnly, ServerOnly } from "@real-router/vue";
</script>

<template>
  <ClientOnly>
    <BrowserApiWidget />
    <template #fallback>
      <Skeleton />
    </template>
  </ClientOnly>

  <ServerOnly>
    <SeoMetaStrip />
  </ServerOnly>
</template>
```

Implementation: `ref(false)` + `onMounted(() => mounted.value = true)`. Slots `default` (children) and `fallback`. End-to-end dogfooding lives in [`examples/web/vue/ssr-examples/ssr/`](../../examples/web/vue/ssr-examples/ssr/) (see `e2e/ssr-boundaries.spec.ts`).

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
    withDirectives(h("a", null, "User Profile"), [
      [vLink, { name: "users.profile", params: { id: "123" } }],
    ]),
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
    default: () => [/* Your app */],
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

`announceNavigation` also accepts a `RouteAnnouncerOptions` object to customize the announced text:

| Option                | Type                | Description                                                                                         |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `prefix`              | `string`            | Prefix prepended to the resolved text (default `"Navigated to "`)                                   |
| `getAnnouncementText` | `(route) => string` | Full custom text; overrides the default `h1 → title → route-name` chain (falls back on empty/throw) |

```typescript
h(RouterProvider, {
  router,
  announceNavigation: {
    getAnnouncementText: (route) => `Now on ${route.name}`,
  },
});
```

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

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"native"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Prop is reactive — toggling mode at runtime reconfigures the utility (watched by primitive fields, so inline objects with the same fields do not thrash). Under `@real-router/browser-plugin`, replace transitions now preserve scroll position and programmatic reloads restore from `sessionStorage` (portable via `state.transition.replace` / `state.transition.reload`). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for the full behaviour matrix.

## Scroll Spy

Opt-in router-coordinated `IntersectionObserver` scroll spy — the URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights stay current:

```vue
<RouterProvider :router="router" :scroll-spy="{ selector: '[id]:is(h2,h3)' }">
  <!-- Your app -->
</RouterProvider>
```

Or via `h()`:

```typescript
h(
  RouterProvider,
  { router, scrollSpy: { selector: "[id]:is(h2,h3)" } },
  { default: () => [/* Your app */] },
);
```

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<Link hash>` (#532), `replace: true` so spy doesn't pollute history. Anti-flicker via `isTransitioning` + `coolingDown` gates with `selfEmitting` guard. Hardcoded internals: rAF + 150 ms debounce, MutationObserver 250 ms.

Options: `{ selector: string, rootMargin?: string, scrollContainer?: () => HTMLElement | null }`. Empty `selector` / `undefined` = off. Reactive — toggling via ref creates/destroys the utility (watched by primitive fields, so inline objects with the same `selector`/`rootMargin` don't thrash). SSR / browsers without `IntersectionObserver` = NOOP. Requires `browser-plugin` or `navigation-plugin` (hash-plugin / memory-plugin → warn-once + NOOP).

Behaviour is identical to the React adapter — see the [React Scroll Spy demo](../../examples/web/react/hash-examples/scroll-spy/) (12 sections, TOC sidebar, 10 e2e scenarios) and the [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## View Transitions

Opt-in animated route transitions via the browser's [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API):

```vue
<RouterProvider :router="router" :view-transitions="true">
  <!-- Your app -->
</RouterProvider>
```

Or via `h()`:

```typescript
h(
  RouterProvider,
  { router, viewTransitions: true },
  { default: () => [/* Your app */] },
);
```

Prop is reactive — toggling `true`/`false` at runtime creates/destroys the utility. No-op on unsupported browsers (Firefox as of 2026-04, SSR). Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name` for hero morphs. See [View Transitions guide](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) · [Scroll Spy](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) · [View Transitions](https://github.com/greydragon888/real-router/wiki/View-Transitions)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition) · [useRouteExit](https://github.com/greydragon888/real-router/wiki/useRouteExit) · [useRouteEnter](https://github.com/greydragon888/real-router/wiki/useRouteEnter)

## Examples

23 runnable examples — each is a standalone Vite app. Run: `cd examples/web/vue/basic && pnpm dev`

**Routing patterns:** [basic](../../examples/web/vue/basic) · [nested-routes](../../examples/web/vue/nested-routes) · [auth-guards](../../examples/web/vue/auth-guards) · [data-loading](../../examples/web/vue/data-loading) · [lazy-loading](../../examples/web/vue/lazy-loading) · [async-guards](../../examples/web/vue/async-guards) · [hash-routing](../../examples/web/vue/hash-routing) · [persistent-params](../../examples/web/vue/persistent-params) · [error-handling](../../examples/web/vue/error-handling) · [dynamic-routes](../../examples/web/vue/dynamic-routes) · [plugin-installation](../../examples/web/vue/plugin-installation) · [v-link-directive](../../examples/web/vue/v-link-directive) · [keep-alive](../../examples/web/vue/keep-alive) · [search-schema](../../examples/web/vue/search-schema) · [combined](../../examples/web/vue/combined)

**Animations:** [view-transitions](../../examples/web/vue/animation-examples/view-transitions) · [route-animations](../../examples/web/vue/animation-examples/route-animations) · [page-animations](../../examples/web/vue/animation-examples/page-animations) · [motion-animations](../../examples/web/vue/animation-examples/motion-animations)

**Server-side rendering:** [ssr](../../examples/web/vue/ssr-examples/ssr) · [ssr-streaming](../../examples/web/vue/ssr-examples/ssr-streaming) · [ssr-mixed](../../examples/web/vue/ssr-examples/ssr-mixed) · [ssg](../../examples/web/vue/ssr-examples/ssg)

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
