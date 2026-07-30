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

`useRoute()` returns a **non-nullable** `route.current` (typed as `State<P>`) and throws when the router has no active state (unstarted, stopped, disposed). `useRouteNode(name)` keeps its nullable `current` — node inactivity is a legitimate business state, not a lifecycle error.

| Composable                         | Returns                                                                                               | Reactive?                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `useRouter()`                      | `Router`                                                                                              | Never                                      |
| `useNavigator()`                   | `Navigator`                                                                                           | Never (stable ref, safe to use directly)   |
| `useRoute()`                       | `{ navigator, route: { current: State<P> }, previousRoute: { current } }` — throws if no active state | `.current` on every navigation             |
| `useRouteNode(name)`               | `{ navigator, route: { current }, previousRoute: { current } }`                                       | `.current` when node activates/deactivates |
| `useRouteUtils()`                  | `RouteUtils`                                                                                          | Never                                      |
| `useRouterTransition()`            | `{ current: RouterTransitionSnapshot }`                                                               | `.current` on transition start/end         |
| `useRouteExit(handler, options?)`  | `void` — wraps `subscribeLeave` with abort + same-route guards                                        | Never (handler captured at init)           |
| `useRouteEnter(handler, options?)` | `void` — fires once on nav-driven mount via `$effect` + `transition.from`                             | Never (handler captured at init)           |

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

```svelte
<!-- useRouteExit — exit animations, draft autosave, AbortSignal-aware cleanup -->
<script lang="ts">
  import { useRouteExit } from "@real-router/svelte";

  // `let el = $state<HTMLDivElement | null>(null)` under Svelte 5 strict mode —
  // the `bind:this` target must be reactive for binding to land.
  let el = $state<HTMLDivElement | null>(null);

  useRouteExit(async ({ signal }) => {
    if (!el) return;
    el.classList.add("fade-out");
    const cleanup = () => el.classList.remove("fade-out");
    signal.addEventListener("abort", cleanup, { once: true });
    el.getBoundingClientRect(); // style flush
    await Promise.allSettled(el.getAnimations().map((a) => a.finished));
    cleanup();
  });
</script>

<div bind:this={el}>...</div>
```

```svelte
<!-- useRouteEnter — page-enter analytics, focus management, entry animations -->
<script lang="ts">
  import { useRouteEnter } from "@real-router/svelte";

  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
</script>
```

> **Svelte handler-reactivity:** composables run once at init, so `handler` is
> captured at hook-call time. To vary behavior over time, read
> `$state` / `$derived` **inside** the handler body. See [CLAUDE.md](./CLAUDE.md)
> → "useRouteExit / useRouteEnter Handler Is Captured At Init".

## Components

### `<Link>`

Navigation link with automatic active state detection. Uses `$derived` for href and class — only the DOM attributes update when active state changes.

> **Rendering many links?** For nav menus, sitemaps or long/paginated lists, [`use:link`](#createlinkaction) is a lighter alternative — it enhances a plain `<a>` instead of instantiating a component per link (roughly **2× cheaper to mount** at ~1000 links).

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

| Prop                | Type                        | Default     | Description                                                                                                      |
| ------------------- | --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `routeName`         | `string`                    | required    | Target route name                                                                                                |
| `routeParams`       | `Params`                    | `undefined` | Route (path) parameters (omitted → `undefined`, shares one active-route source with `useIsActiveRoute(name)`, #776) |
| `routeSearch`       | `SearchParams`              | `undefined` | Query (search) parameters for the link's target — parallel to `routeParams` (RFC-4 M2, #1548)                    |
| `routeOptions`      | `NavigationOptions`         | `{}`        | Navigation options (replace, etc.)                                                                               |
| `class`             | `string`                    | `undefined` | CSS class                                                                                                        |
| `activeClassName`   | `string`                    | `"active"`  | Class added when route is active                                                                                 |
| `activeStrict`      | `boolean`                   | `false`     | Exact match only (no ancestor matching)                                                                          |
| `ignoreQueryParams` | `boolean`                   | `true`      | Query params don't affect active state                                                                           |
| `hash`              | `string`                    | `undefined` | URL fragment (decoded). Tri-state: undefined preserves, `""` clears, value sets. (#532)                          |
| `target`            | `string`                    | `undefined` | Link target (`_blank`, etc.)                                                                                     |
| `onclick`           | `(evt: MouseEvent) => void` | `undefined` | Custom click handler. Runs **before** the navigation logic — call `evt.preventDefault()` to suppress navigation. |

All other props are spread onto the `<a>` element.

#### `routeSearch` — query (search) channel

```svelte
<!-- Pagination link with an explicit query channel; active only on ?page=2 -->
<Link routeName="users" routeSearch={{ page: "2" }} ignoreQueryParams={false}>
  Page 2
</Link>
```

`routeSearch?: SearchParams` is the query channel of the path/query split (RFC-4 M2, #1548) — parallel to `routeParams` (the path channel). It feeds the URL query string in `href` (forwarded to `buildUrl`/`buildPath`) and, paired with `ignoreQueryParams={false}`, the active-state check.

#### `hash` — URL fragment / tab-style UIs

```svelte
<Link routeName="settings" hash="profile">Profile</Link>
<Link routeName="settings" hash="account">Account</Link>
```

Active class is hash-aware — only the matching tab lights up. Live demo: [`examples/web/react/hash-examples/link-hash/`](../../examples/web/react/hash-examples/link-hash/) — behavior is identical across adapters, only template syntax differs. See the [Hash Fragment Support](https://github.com/greydragon888/real-router/wiki/Hash) wiki page for the full surface.

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

| Prop        | Type      | Description                                                                   |
| ----------- | --------- | ----------------------------------------------------------------------------- |
| `nodeName`  | `string`  | Route node to match against. `""` for root.                                   |
| `self`      | `Snippet` | Rendered when the active route is exactly `nodeName` (no descendant segments) |
| `notFound`  | `Snippet` | Rendered when route is `UNKNOWN_ROUTE`                                        |
| `[segment]` | `Snippet` | Named snippet matching a route segment                                        |

Snippet names must be valid JavaScript identifiers and match the first segment of the active route after `nodeName`. For a route `users.profile` with `nodeName=""`, the snippet named `users` matches.

**`self` snippet:** distinguishes the exact-match case from any descendant. With `nodeName="users"`, the `users` segment snippet matches `users`, `users.list`, `users.profile`, etc. — but `{#snippet self()}` only renders when the active route is `"users"` exactly. Both `self` and `notFound` are **reserved** snippet names: a literal route named `notFound` or `self` is never matched as a regular segment.

```svelte
<!-- nested: render UsersIndex on /users, list on /users/list -->
<RouteView nodeName="users">
  {#snippet self()}<UsersIndex /> {/snippet}
  {#snippet list()}<UsersList /> {/snippet}
  {#snippet profile()}<UserProfile /> {/snippet}
</RouteView>
```

> **Note:** `keepAlive` is not supported. Svelte has no equivalent of React's `<Activity>` API or Vue's `<KeepAlive>`. Components are destroyed when navigating away.

### `<RouterErrorBoundary>`

Declarative error handling for navigation errors. Shows a fallback **alongside** children (not instead of) when a guard rejects or a route is not found.

```svelte
<script lang="ts">
  import { RouterErrorBoundary } from "@real-router/svelte";
</script>

<RouterErrorBoundary
  onError={(error, toRoute, fromRoute) =>
    analytics.track("nav_error", {
      code: error.code,
      to: toRoute?.name,
      from: fromRoute?.name,
    })
  }
>
  {#snippet fallback(error, resetError)}
    <div class="toast">
      {error.code} <button onclick={resetError}>Dismiss</button>
    </div>
  {/snippet}

  <Link routeName="protected">Go to Protected</Link>
</RouterErrorBoundary>
```

Auto-resets on next successful navigation. Works with both `<Link>` and imperative `router.navigate()`.

**`onError` signature:** `(error, toRoute, fromRoute) => void`. Receives the `RouterError`, the attempted destination (`State | null`), and the previously active route (`State | null`). A throwing `onError` is caught by the boundary, logged via `console.error`, and never breaks reactivity.

### `<ClientOnly>` / `<ServerOnly>`

Paired SSR-aware boundaries. `<ClientOnly>` renders the `fallback` snippet on the server (and on the client first paint, to match SSR HTML), then swaps in the `children` snippet after mount. `<ServerOnly>` is the symmetric inverse.

```svelte
<script lang="ts">
  import { ClientOnly, ServerOnly } from "@real-router/svelte";
</script>

<ClientOnly>
  {#snippet children()}
    <BrowserApiWidget />
  {/snippet}
  {#snippet fallback()}
    <Skeleton />
  {/snippet}
</ClientOnly>

<ServerOnly>
  {#snippet children()}
    <SeoMetaStrip />
  {/snippet}
</ServerOnly>
```

Implementation: `$state(false)` + `$effect(() => mounted = true)`. The Svelte compiler emits the rune as a no-op on the server, so server-side rendering naturally lands on the SSR-side branch. End-to-end dogfooding lives in [`examples/web/svelte/ssr-examples/ssr/`](../../examples/web/svelte/ssr-examples/ssr/) (see `e2e/ssr-boundaries.spec.ts`).

## Actions

### `createLinkAction`

Factory function that creates a low-level action for adding navigation to any element. Must be called during component initialization to capture the router context.

> **Prefer `use:link` for link-heavy pages.** Because it enhances a plain element instead of instantiating a Svelte component per link, `use:link` skips the component overhead `<Link>` pays on every instance — mounting a large batch of `use:link` anchors costs roughly **half** the script time of the same batch of `<Link>`s (directional, measured on ~1000 links). For nav menus, sitemaps, mega-menus and paginated lists, reach for `use:link` — set `href` yourself via `router.buildPath(name, params)` for real, middle-clickable anchors. Keep `<Link>` for its ergonomics (automatic active state, `hash` support) on ordinary links.

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

<!-- For non-anchor / non-button elements you can omit role="link" + tabindex="0":
     applyLinkA11y adds them automatically. Explicit attrs in the example below are
     redundant but harmless. -->
<div use:link={{ name: "settings", params: {}, options: { replace: true } }}>
  Settings
</div>
```

**Parameters:**

| Property  | Type     | Default | Description                        |
| --------- | -------- | ------- | ---------------------------------- |
| `name`    | `string` | —       | Target route name                  |
| `params`  | `Params` | `{}`    | Route parameters                   |
| `options` | `object` | `{}`    | Navigation options (replace, etc.) |

The action automatically adds `role="link"` + `tabindex="0"` to non-interactive elements for accessibility (skipping `<a>` / `<button>` which already convey link semantics). It handles click events and Enter key navigation.

> **Hash asymmetry vs `<Link hash>`:** `createLinkAction` does **not** accept a `hash` parameter; `<Link hash="x">` does (#532). Use `<Link>` when a hash-aware variant is needed (tab-style UIs, same-route different-fragment navigation through `navigateWithHash`). For pure `use:link` callers, attach a click handler that calls `router.navigate(name, params, undefined, { force: true, hash: "x" })` manually if hash control is required.

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

`announceNavigation` also accepts a `RouteAnnouncerOptions` object to customize the announced text:

| Option                | Type                | Description                                                                                         |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `prefix`              | `string`            | Prefix prepended to the resolved text (default `"Navigated to "`)                                   |
| `getAnnouncementText` | `(route) => string` | Full custom text; overrides the default `h1 → title → route-name` chain (falls back on empty/throw) |

```svelte
<RouterProvider
  {router}
  announceNavigation={{ getAnnouncementText: (route) => `Now on ${route.name}` }}
>
  {/* Your app */}
</RouterProvider>
```

## Scroll Restoration

Opt-in preservation of scroll position across navigations:

```svelte
<RouterProvider {router} scrollRestoration={{ mode: "restore" }}>
  <!-- Your app -->
</RouterProvider>
```

Restores scroll on back/forward, scrolls to top (or `#hash`) on push. Three modes: `"restore"` (default), `"top"`, `"native"`. Custom containers via `scrollContainer: () => HTMLElement | null`. Lifecycle tied to the provider — created on mount, destroyed on unmount. Under `@real-router/browser-plugin`, replace transitions now preserve scroll position and programmatic reloads restore from `sessionStorage` (portable via `state.transition.replace` / `state.transition.reload`). See [Scroll Restoration guide](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) for the full behaviour matrix.

## Scroll Spy

Opt-in router-coordinated `IntersectionObserver` scroll spy — the URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights stay current:

```svelte
<RouterProvider {router} scrollSpy={{ selector: "[id]:is(h2,h3)" }}>
  <!-- Your app -->
</RouterProvider>
```

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<Link hash>` (#532), `replace: true` so spy doesn't pollute history. Anti-flicker via `isTransitioning` + `coolingDown` gates with `selfEmitting` guard. Hardcoded internals: rAF + 150 ms debounce, MutationObserver 250 ms.

Options: `{ selector: string, rootMargin?: string, scrollContainer?: () => HTMLElement | null }`. Reactive via `$effect` — primitive fields (`selector`, `rootMargin`) wrapped in `$derived`, so inline objects with the same values don't thrash; `scrollContainer` getter pulled via `untrack` (identity changes don't retrigger). Empty `selector` / `undefined` = off. SSR / browsers without `IntersectionObserver` = NOOP. Requires `browser-plugin` or `navigation-plugin` (hash-plugin / memory-plugin → warn-once + NOOP).

Behaviour is identical to the React adapter — see the [React Scroll Spy demo](../../examples/web/react/hash-examples/scroll-spy/) (12 sections, TOC sidebar, 10 e2e scenarios) and the [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## View Transitions

Opt-in animated route transitions via the browser's [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API):

```svelte
<RouterProvider {router} viewTransitions>
  <!-- Your app -->
</RouterProvider>
```

Reactive via `$effect` — toggling the prop creates/destroys the utility. No-op on unsupported browsers (Firefox as of 2026-04, SSR). Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name` for hero morphs. See [View Transitions guide](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

## Documentation

Full documentation: [Wiki](https://github.com/greydragon888/real-router/wiki)

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [RouterErrorBoundary](https://github.com/greydragon888/real-router/wiki/RouterErrorBoundary) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [Scroll Restoration](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration) · [Scroll Spy](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) · [View Transitions](https://github.com/greydragon888/real-router/wiki/View-Transitions)
- [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator) · [useRouteUtils](https://github.com/greydragon888/real-router/wiki/useRouteUtils) · [useRouterTransition](https://github.com/greydragon888/real-router/wiki/useRouterTransition) · [useRouteExit](https://github.com/greydragon888/real-router/wiki/useRouteExit) · [useRouteEnter](https://github.com/greydragon888/real-router/wiki/useRouteEnter)

## Examples

24 runnable examples — each is a standalone Vite app. Run: `cd examples/web/svelte/basic && pnpm dev`

**Core:** [basic](../../examples/web/svelte/basic) · [nested-routes](../../examples/web/svelte/nested-routes) · [auth-guards](../../examples/web/svelte/auth-guards) · [data-loading](../../examples/web/svelte/data-loading) · [lazy-loading](../../examples/web/svelte/lazy-loading) · [async-guards](../../examples/web/svelte/async-guards) · [hash-routing](../../examples/web/svelte/hash-routing) · [persistent-params](../../examples/web/svelte/persistent-params) · [error-handling](../../examples/web/svelte/error-handling) · [dynamic-routes](../../examples/web/svelte/dynamic-routes) · [link-action](../../examples/web/svelte/link-action) · [lazy-loading-svelte](../../examples/web/svelte/lazy-loading-svelte) · [snippets-routing](../../examples/web/svelte/snippets-routing) · [reactive-source](../../examples/web/svelte/reactive-source) · [search-schema](../../examples/web/svelte/search-schema) · [combined](../../examples/web/svelte/combined)

**Animations:** [motion-animations](../../examples/web/svelte/animation-examples/motion-animations) · [page-animations](../../examples/web/svelte/animation-examples/page-animations) · [route-animations](../../examples/web/svelte/animation-examples/route-animations) · [view-transitions](../../examples/web/svelte/animation-examples/view-transitions)

**Server-side rendering:** [ssr](../../examples/web/svelte/ssr-examples/ssr) · [ssr-streaming](../../examples/web/svelte/ssr-examples/ssr-streaming) · [ssr-mixed](../../examples/web/svelte/ssr-examples/ssr-mixed) · [ssg](../../examples/web/svelte/ssr-examples/ssg)

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
