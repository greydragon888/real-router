# Real-Router

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@real-router/core.svg?style=flat-square&logo=npm)](https://www.npmjs.com/package/@real-router/core)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/core.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![Engineered with Claude Code](https://img.shields.io/badge/Engineered%20with-Claude%20Code-5865F2?style=flat-square&logo=anthropic&logoColor=white)](https://claude.com/claude-code)

</div>

<p align="center">
  <b>Data-first router for JavaScript — the most declarative router for client applications</b>
</p>

<p align="center">
  <a href="https://github.com/greydragon888/real-router/wiki">Wiki</a> ·
  <a href="https://github.com/greydragon888/real-router/wiki/recipes">Recipes</a> ·
  <a href="https://github.com/greydragon888/real-router/issues/296">Roadmap</a> ·
  <a href="https://github.com/greydragon888/real-router/releases">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/greydragon888/real-router/issues">Issues</a>
</p>

---

Every router you know maps URLs to **components**. Real-Router maps URLs to **data**.

```
React Router:     URL  →  <Component />     (router decides what to render)
Vue Router:       URL  →  component: View   (router decides what to render)
Real-Router:      URL  →  { name, params }  (you decide what to do)
```

This is not a minor API difference — it's a fundamentally different architecture.\
The router becomes a **data provider**: it tells you _where_ the user is, and you decide what to do with that information — render a page, load data, set a title, track analytics, or ignore it entirely.

> Built from scratch with TypeScript-first design. Independent project inspired by [router5](https://github.com/router5/router5)'s declarative philosophy, not a fork.

> **Pre-1.0**: Core API and plugin interfaces are stable. Minor versions preserve backward compatibility. See [Roadmap](https://github.com/greydragon888/real-router/issues/296) for the path to 1.0 and [Quality & Testing](#quality--testing) for reliability guarantees.

## Why Real-Router?

### One-Way Data Flow

Other routers push data fetching into components — `useParams()` + `useEffect()` + `fetch()` is imperative boilerplate that every page repeats.

Real-Router inverts this: routing state arrives as external data, plugins handle data loading, titles, analytics outside the component tree. Components just render what they receive.

### Declarative Route Config

One config object declares everything — routing, access control, data loading, and any custom concern. No logic scattered across component files.

Compare where routing logic lives across routers:

```
React Router v7:   guards in loaders, meta in page files — one route module per file
Vue Router v4:     guards in beforeEach(), data in components, titles wired manually
TanStack Router:   beforeLoad + loader + head per route file, scattered across file tree
Real-Router:       guards + data + titles + any router related logic in one config object → generic plugins
```

Guards control access, custom fields drive data loading, titles, and any other concern through generic plugins:

```typescript
const routes = [
  {
    name: "users",
    path: "/users",
    canActivate: authGuard, // access control (guard)
    title: "Users", // custom field → title plugin
    loadData: (p, api) => api.getUsers(p), // custom field → data plugin
    children: [
      {
        name: "profile",
        path: "/:id",
      },
    ],
  },
];

// Generic plugin — reads custom fields, no hardcoded route names
const dataPlugin: PluginFactory = (router, getDep) => {
  const { getRouteConfig } = getPluginApi(router);
  return {
    onTransitionSuccess: (toState) => {
      const route = getRouteConfig(toState.name);

      route?.loadData?.(toState.params, getDep("api"));
    },
  };
};
```

Adding a new page = one config entry. No plugin code changes. See [Recipes](https://github.com/greydragon888/real-router/wiki/recipes) for full examples.

### Runtime Route Management

Full CRUD for routes at runtime — add, remove, update, replace, clear.\
No other router offers `update()` for modifying guards, redirects, or defaults of individual routes without remove+add.\
`replace()` is atomic with state revalidation — designed for HMR and dynamic feature flags.

### Minimal Runtime Footprint

Platform-agnostic core — no DOM, no React, no History API in the routing layer.
All platform concerns live in plugins.

This means SSR works naturally: `cloneRouter()` per request, `start(url)` to resolve, `dispose()` to clean up — no special SSR mode, no framework-specific adapters. Data loading plugs in via interceptors without touching the transition pipeline. SSG is the same loop at build time — `getStaticPaths()` enumerates routes, `cloneRouter()` + `renderToString()` per URL. See the [SSR example](examples/react/ssr) and [SSG example](examples/react/ssg).

Result: **minimal allocations per navigation**, optimized independently from the external API.
See [Recipes](https://github.com/greydragon888/real-router/wiki/recipes) for plugin patterns: data lifecycle, analytics, scroll restoration.

### Performance

Custom **Segment Trie** matcher — O(segments) traversal, O(1) for static routes.

**1.7–2.5x faster and 1.5–3x lighter** than TanStack Router in full client-side navigation benchmarks (10-step loop, 56 subscribers per page):

**Speed** (ops/sec, higher is better):

| Framework | vs TanStack Router |
| --------- | ------------------ |
| Solid     | **2.5x faster**    |
| Vue       | **2.1x faster**    |
| React     | **1.7x faster**    |

**Memory per navigation** (heap bytes, lower is better):

| Framework | vs TanStack Router         |
| --------- | -------------------------- |
| Solid     | **3.0x fewer allocations** |
| React     | **2.6x fewer allocations** |
| Vue       | **1.5x fewer allocations** |

> Benchmark: [packages/router-benchmarks/client-nav](packages/router-benchmarks/client-nav) — identical workload, JSDOM, production builds, `--expose-gc`

<details>
<summary><b>Benchmarks vs router5 and router6 (core-level)</b></summary>

**vs [router5](https://github.com/router5/router5):**

| Metric             | Improvement                              |
| ------------------ | ---------------------------------------- |
| Navigation         | 2-3x faster                              |
| URL building       | 8-35x faster                             |
| URL matching       | 3-5x faster                              |
| Memory allocations | 5-18x fewer                              |
| Scaling            | O(1) vs O(n) — up to 14x at 1000+ routes |

**vs [router6](https://github.com/nicolo-ribaudo/router6):**

| Metric             | Improvement                        |
| ------------------ | ---------------------------------- |
| Navigation         | ~2x faster                         |
| URL building       | 3-10x faster                       |
| URL matching       | ~2x faster                         |
| Memory allocations | 5-8x fewer                         |
| Scaling            | Both O(1) — up to 5x on deep trees |

</details>

### Key Features

- **Framework-agnostic** — React, Preact, Solid, Vue, Svelte, or vanilla JS
- **Universal** — client-side, server-side rendering ([SSR example](examples/react/ssr)), and static site generation ([SSG example](examples/react/ssg))
- **Named nested routes** — dot-notation hierarchy (`users.profile`)
- **Lifecycle guards** — `canActivate` / `canDeactivate` per route or globally
- **AbortController** — cancel navigations via standard `AbortSignal`
- **Dynamic route management** — add, remove, update, replace routes at runtime
- **Dependency injection** — type-safe DI container for guards and plugins
- **Plugin architecture** — intercept and extend router behavior
- **Observable state** — RxJS and TC39 Observable compatible
- **Immutable state** — deeply frozen, predictable state management

## Quick Start

```bash
npm install @real-router/core
```

```typescript
import { createRouter } from "@real-router/core";
import { browserPluginFactory } from "@real-router/browser-plugin";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

const router = createRouter(routes);
router.usePlugin(browserPluginFactory());

await router.start();
await router.navigate("users.profile", { id: "123" });
```

> **Recommended for development:** add [`@real-router/validation-plugin`](https://www.npmjs.com/package/@real-router/validation-plugin) for descriptive runtime errors on every API call. Falsy values in `usePlugin()` are silently skipped, so inline conditionals work naturally:
>
> ```typescript
> import { validationPlugin } from "@real-router/validation-plugin";
>
> router.usePlugin(browserPluginFactory(), __DEV__ && validationPlugin());
> ```

> **Route-level lifecycle hooks:** add [`@real-router/lifecycle-plugin`](https://www.npmjs.com/package/@real-router/lifecycle-plugin) to attach `onEnter`, `onStay`, `onLeave` callbacks directly to route definitions — no `subscribe()` boilerplate:
>
> ```typescript
> import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
>
> const routes = [
>   { name: "home", path: "/", onLeave: () => cleanup() },
>   {
>     name: "users.view",
>     path: "/users/:id",
>     onEnter: (s) => track(s.params.id),
>   },
> ];
>
> router.usePlugin(lifecyclePluginFactory());
> ```

### With React

```tsx
import { RouterProvider, RouteView, Link } from "@real-router/react";

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <Link routeName="home">Home</Link>
        <Link routeName="users">Users</Link>
      </nav>
      <RouteView nodeName="">
        <RouteView.Match routeName="home">
          <HomePage />
        </RouteView.Match>
        <RouteView.Match routeName="users">
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

`RouteView` with `keepAlive` requires React 19.2+ (React Activity API). For React 18+, use `@real-router/react/legacy` — all hooks and `Link`, no `RouteView`.

## Packages

### Core

| Package                                     | Version                                                                                                                           | Description                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`@real-router/core`](packages/core)        | [![npm](https://img.shields.io/npm/v/@real-router/core.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/core)   | Router implementation                                                                                              |
| `@real-router/core/api`                     |                                                                                                                                   | Tree-shakeable modular API: `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getPluginApi`, `cloneRouter` |
| `@real-router/core/utils`                   |                                                                                                                                   | Utility functions: `serializeState` (XSS-safe JSON for SSR), `getStaticPaths` (static path generation for SSG)     |
| [`@real-router/types`](packages/core-types) | [![npm](https://img.shields.io/npm/v/@real-router/types.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/types) | Shared TypeScript type definitions                                                                                 |

### Framework Integration

| Package                                  | Version                                                                                                                             | Description                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`@real-router/react`](packages/react)   | [![npm](https://img.shields.io/npm/v/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react)   | React 19.2+ (hooks, `RouteView`, `Link`). React 18+ via `./legacy` |
| [`@real-router/preact`](packages/preact) | [![npm](https://img.shields.io/npm/v/@real-router/preact.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/preact) | Preact (hooks, `RouteView`, `Link`, Suspense)                      |
| [`@real-router/solid`](packages/solid)   | [![npm](https://img.shields.io/npm/v/@real-router/solid.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/solid)   | Solid.js (signals, `RouteView`, `Link`, store-based state)         |
| [`@real-router/vue`](packages/vue)       | [![npm](https://img.shields.io/npm/v/@real-router/vue.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/vue)       | Vue 3 (composables, `RouteView`, `Link`, `KeepAlive`, `v-link`)    |
| [`@real-router/svelte`](packages/svelte) | [![npm](https://img.shields.io/npm/v/@real-router/svelte.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/svelte) | Svelte 5 (runes, `RouteView` with snippets, `Lazy`, `use:link`)    |

### Plugins

| Package                                                                      | Version                                                                                                                                                                 | Description                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`@real-router/browser-plugin`](packages/browser-plugin)                     | [![npm](https://img.shields.io/npm/v/@real-router/browser-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/browser-plugin)                     | Browser History API and URL synchronization      |
| [`@real-router/navigation-plugin`](packages/navigation-plugin)               | [![npm](https://img.shields.io/npm/v/@real-router/navigation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/navigation-plugin)               | Navigation API integration + route-level history |
| [`@real-router/memory-plugin`](packages/memory-plugin)                       | [![npm](https://img.shields.io/npm/v/@real-router/memory-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/memory-plugin)                       | In-memory history: back/forward/go (no DOM)      |
| [`@real-router/hash-plugin`](packages/hash-plugin)                           | [![npm](https://img.shields.io/npm/v/@real-router/hash-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/hash-plugin)                           | Hash-based routing (`#/path`)                    |
| [`@real-router/logger-plugin`](packages/logger-plugin)                       | [![npm](https://img.shields.io/npm/v/@real-router/logger-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger-plugin)                       | Development logging with transition tracking     |
| [`@real-router/persistent-params-plugin`](packages/persistent-params-plugin) | [![npm](https://img.shields.io/npm/v/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin) | Parameter persistence across navigations         |
| [`@real-router/ssr-data-plugin`](packages/ssr-data-plugin)                   | [![npm](https://img.shields.io/npm/v/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)                   | SSR per-route data loading via interceptor       |
| [`@real-router/lifecycle-plugin`](packages/lifecycle-plugin)                 | [![npm](https://img.shields.io/npm/v/@real-router/lifecycle-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/lifecycle-plugin)                 | Route-level hooks: onEnter, onStay, onLeave      |
| [`@real-router/preload-plugin`](packages/preload-plugin)                     | [![npm](https://img.shields.io/npm/v/@real-router/preload-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/preload-plugin)                     | Preload on navigation intent (hover, touch)      |
| [`@real-router/validation-plugin`](packages/validation-plugin)               | [![npm](https://img.shields.io/npm/v/@real-router/validation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/validation-plugin)               | Runtime argument validation for development      |
| [`@real-router/search-schema-plugin`](packages/search-schema-plugin)         | [![npm](https://img.shields.io/npm/v/@real-router/search-schema-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/search-schema-plugin)         | Search param validation via Standard Schema      |

### Utilities

| Package                                            | Version                                                                                                                                       | Description                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`@real-router/sources`](packages/sources)         | [![npm](https://img.shields.io/npm/v/@real-router/sources.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/sources)         | Reactive subscription sources for UI bindings (`useSyncExternalStore`-ready) |
| [`@real-router/rx`](packages/rx)                   | [![npm](https://img.shields.io/npm/v/@real-router/rx.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rx)                   | Observable API: `state$`, `events$`, operators, TC39 Observable              |
| [`@real-router/route-utils`](packages/route-utils) | [![npm](https://img.shields.io/npm/v/@real-router/route-utils.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/route-utils) | Route tree queries: `getRouteUtils`, segment testers, `areRoutesRelated`     |
| [`@real-router/logger`](packages/logger)           | [![npm](https://img.shields.io/npm/v/@real-router/logger.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger)           | Structured logging utility                                                   |

## Documentation

Full documentation is available in the [Wiki](https://github.com/greydragon888/real-router/wiki).

### Getting Started

- [Core Concepts](https://github.com/greydragon888/real-router/wiki/core-concepts) — overview and mental model
- [Defining Routes](https://github.com/greydragon888/real-router/wiki/Route) — route configuration, nesting, path syntax
- [Navigation Lifecycle](https://github.com/greydragon888/real-router/wiki/navigation-lifecycle) — transitions, guards, hooks

### API Reference

- [createRouter](https://github.com/greydragon888/real-router/wiki/createRouter) · [navigate](https://github.com/greydragon888/real-router/wiki/navigate) · [start](https://github.com/greydragon888/real-router/wiki/start) · [stop](https://github.com/greydragon888/real-router/wiki/stop) · [buildPath](https://github.com/greydragon888/real-router/wiki/buildPath) · [isActiveRoute](https://github.com/greydragon888/real-router/wiki/isActiveRoute)
- [Guards](https://github.com/greydragon888/real-router/wiki/guards) · [State](https://github.com/greydragon888/real-router/wiki/State) · [NavigationOptions](https://github.com/greydragon888/real-router/wiki/NavigationOptions) · [RouterOptions](https://github.com/greydragon888/real-router/wiki/RouterOptions) · [RouterError](https://github.com/greydragon888/real-router/wiki/RouterError)
- [Plugin Architecture](https://github.com/greydragon888/real-router/wiki/plugin-architecture) · [getRoutesApi](https://github.com/greydragon888/real-router/wiki/addRoute) · [getDependenciesApi](https://github.com/greydragon888/real-router/wiki/getDependency) · [getLifecycleApi](https://github.com/greydragon888/real-router/wiki/addActivateGuard) · [cloneRouter](https://github.com/greydragon888/real-router/wiki/clone)

### React

- [RouterProvider](https://github.com/greydragon888/real-router/wiki/RouterProvider) · [RouteView](https://github.com/greydragon888/real-router/wiki/RouteView) · [Link](https://github.com/greydragon888/real-router/wiki/Link) · [useRouter](https://github.com/greydragon888/real-router/wiki/useRouter) · [useRoute](https://github.com/greydragon888/real-router/wiki/useRoute) · [useRouteNode](https://github.com/greydragon888/real-router/wiki/useRouteNode) · [useNavigator](https://github.com/greydragon888/real-router/wiki/useNavigator)

### Preact / Solid / Vue / Svelte

- [Preact Integration](https://github.com/greydragon888/real-router/wiki/Preact-Integration) · [Solid Integration](https://github.com/greydragon888/real-router/wiki/Solid-Integration) · [Vue Integration](https://github.com/greydragon888/real-router/wiki/Vue-Integration) · [Svelte Integration](https://github.com/greydragon888/real-router/wiki/Svelte-Integration)

### Plugins

- [browser-plugin](https://github.com/greydragon888/real-router/wiki/browser-plugin) · [hash-plugin](https://github.com/greydragon888/real-router/wiki/hash-plugin) · [logger-plugin](https://github.com/greydragon888/real-router/wiki/logger-plugin) · [persistent-params-plugin](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin) · [search-schema-plugin](https://github.com/greydragon888/real-router/wiki/search-schema-plugin) · [ssr-data-plugin](https://github.com/greydragon888/real-router/wiki/ssr-data-plugin) · [preload-plugin](https://github.com/greydragon888/real-router/wiki/preload-plugin) · [memory-plugin](https://github.com/greydragon888/real-router/wiki/memory-plugin) · [validation-plugin](https://github.com/greydragon888/real-router/wiki/validation-plugin) · [rx](https://github.com/greydragon888/real-router/wiki/rx-package) · [sources](https://github.com/greydragon888/real-router/wiki/sources-package) · [route-utils](https://github.com/greydragon888/real-router/wiki/route-utils)

## Examples

Many runnable examples across the most popular frameworks — each is a standalone Vite app:

| Feature                 | [React](examples/react)                                                                                        | [Preact](examples/preact)                              | [Solid](examples/solid)                                                                                                                                               | [Vue](examples/vue)                                                                                                                               | [Svelte](examples/svelte)                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic routing           | [basic](examples/react/basic)                                                                                  | [basic](examples/preact/basic)                         | [basic](examples/solid/basic)                                                                                                                                         | [basic](examples/vue/basic)                                                                                                                       | [basic](examples/svelte/basic)                                                                                                                                                                                   |
| Nested routes           | [nested-routes](examples/react/nested-routes)                                                                  | [nested-routes](examples/preact/nested-routes)         | [nested-routes](examples/solid/nested-routes)                                                                                                                         | [nested-routes](examples/vue/nested-routes)                                                                                                       | [nested-routes](examples/svelte/nested-routes)                                                                                                                                                                   |
| Auth guards             | [auth-guards](examples/react/auth-guards)                                                                      | [auth-guards](examples/preact/auth-guards)             | [auth-guards](examples/solid/auth-guards)                                                                                                                             | [auth-guards](examples/vue/auth-guards)                                                                                                           | [auth-guards](examples/svelte/auth-guards)                                                                                                                                                                       |
| Data loading            | [data-loading](examples/react/data-loading)                                                                    | [data-loading](examples/preact/data-loading)           | [data-loading](examples/solid/data-loading)                                                                                                                           | [data-loading](examples/vue/data-loading)                                                                                                         | [data-loading](examples/svelte/data-loading)                                                                                                                                                                     |
| Lazy loading            | [lazy-loading](examples/react/lazy-loading)                                                                    | [lazy-loading](examples/preact/lazy-loading)           | [lazy-loading](examples/solid/lazy-loading)                                                                                                                           | [lazy-loading](examples/vue/lazy-loading)                                                                                                         | [lazy-loading](examples/svelte/lazy-loading)                                                                                                                                                                     |
| Async guards            | [async-guards](examples/react/async-guards)                                                                    | [async-guards](examples/preact/async-guards)           | [async-guards](examples/solid/async-guards)                                                                                                                           | [async-guards](examples/vue/async-guards)                                                                                                         | [async-guards](examples/svelte/async-guards)                                                                                                                                                                     |
| Hash routing            | [hash-routing](examples/react/hash-routing)                                                                    | [hash-routing](examples/preact/hash-routing)           | [hash-routing](examples/solid/hash-routing)                                                                                                                           | [hash-routing](examples/vue/hash-routing)                                                                                                         | [hash-routing](examples/svelte/hash-routing)                                                                                                                                                                     |
| Persistent params       | [persistent-params](examples/react/persistent-params)                                                          | [persistent-params](examples/preact/persistent-params) | [persistent-params](examples/solid/persistent-params)                                                                                                                 | [persistent-params](examples/vue/persistent-params)                                                                                               | [persistent-params](examples/svelte/persistent-params)                                                                                                                                                           |
| Search schema           | [search-schema](examples/react/search-schema)                                                                  | [search-schema](examples/preact/search-schema)         | [search-schema](examples/solid/search-schema)                                                                                                                         | [search-schema](examples/vue/search-schema)                                                                                                       | [search-schema](examples/svelte/search-schema)                                                                                                                                                                   |
| Error handling          | [error-handling](examples/react/error-handling)                                                                | [error-handling](examples/preact/error-handling)       | [error-handling](examples/solid/error-handling)                                                                                                                       | [error-handling](examples/vue/error-handling)                                                                                                     | [error-handling](examples/svelte/error-handling)                                                                                                                                                                 |
| Dynamic routes          | [dynamic-routes](examples/react/dynamic-routes)                                                                | [dynamic-routes](examples/preact/dynamic-routes)       | [dynamic-routes](examples/solid/dynamic-routes)                                                                                                                       | [dynamic-routes](examples/vue/dynamic-routes)                                                                                                     | [dynamic-routes](examples/svelte/dynamic-routes)                                                                                                                                                                 |
| Combined (all features) | [combined](examples/react/combined)                                                                            | [combined](examples/preact/combined)                   | [combined](examples/solid/combined)                                                                                                                                   | [combined](examples/vue/combined)                                                                                                                 | [combined](examples/svelte/combined)                                                                                                                                                                             |
| **Framework-specific**  | [keepAlive](examples/react/keep-alive), [legacy-entry](examples/react/legacy-entry), [hmr](examples/react/hmr) | —                                                      | [store-based-state](examples/solid/store-based-state), [use-link-directive](examples/solid/use-link-directive), [signal-primitives](examples/solid/signal-primitives) | [plugin-installation](examples/vue/plugin-installation), [v-link-directive](examples/vue/v-link-directive), [keep-alive](examples/vue/keep-alive) | [link-action](examples/svelte/link-action), [lazy-loading-svelte](examples/svelte/lazy-loading-svelte), [snippets-routing](examples/svelte/snippets-routing), [reactive-source](examples/svelte/reactive-source) |

| **Server rendering** | [ssr](examples/react/ssr) — Express + Vite SSR, [ssg](examples/react/ssg) — Static site generation |

Run any example: `cd examples/react/basic && pnpm dev`

## Relationship to Router5

Real-Router is an **independent project** — not a fork. Built from scratch with different algorithms (Segment Trie vs linear scan), modern TypeScript API, and independent roadmap. Inspired by router5's declarative routing philosophy (named routes, hierarchical routing, lifecycle guards).

## Quality & Testing

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=greydragon888_real-router&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=greydragon888_real-router)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat-square&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fgreydragon888%2Freal-router%2Fmaster)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/e2e-playwright-2EAD33?style=flat-square&logo=playwright)](https://playwright.dev/)
[![Property-Based Testing](https://img.shields.io/badge/PBT-fast--check-FF4785?style=flat-square)](https://fast-check.dev/)

Real-Router treats testing as a first-class engineering concern, not an afterthought.

- **100% code coverage** — enforced in CI across all packages, no exceptions
- **Static analysis** — SonarCloud quality gate on every PR: zero bugs, zero vulnerabilities, zero code smells
- **Property-based testing** — [fast-check](https://fast-check.dev/) generates thousands of random inputs to verify invariants that hand-written tests miss (URL encoding, parameter serialization, route tree operations)
- **Stress testing** — 310 dedicated stress tests across core and all framework adapters: thousands of concurrent navigations, guard removal mid-execution, route CRUD under load, heap snapshots confirming zero memory leaks, mount/unmount lifecycle validation, subscription fanout granularity, and full SPA simulations
- **Playwright e2e testing** — 522 end-to-end test cases across 41 Playwright suites covering all 5 framework adapters (React, Preact, Solid, Vue, Svelte). Tests verify real browser behavior: navigation, guards, data loading, error handling, hash routing, nested routes, dynamic routes, and async guards
- **Mutation testing** — [Stryker](https://stryker-mutator.io/) mutates source code and verifies that tests catch every mutation, ensuring test suite quality beyond line coverage

## Development

This is a pnpm monorepo with [Turborepo](https://turbo.build/repo) for task orchestration.

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (errors-only output)
pnpm build:verbose    # Build with full output (debugging)
pnpm test -- --run    # Run tests once (errors-only output)
pnpm test:verbose     # Tests with full output (debugging)
pnpm type-check       # TypeScript type checking
pnpm lint             # ESLint
pnpm lint:e2e         # Verify e2e directories have spec files
pnpm lint:unused      # Check for unused code (knip)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full development setup, coding standards, and PR guidelines.

## Contributing

Contributions are welcome! Please read the [contributing guidelines](CONTRIBUTING.md) before submitting a pull request.

- [Good first issues](https://github.com/greydragon888/real-router/labels/good%20first%20issue) — great starting points for new contributors
- [Help wanted](https://github.com/greydragon888/real-router/labels/help%20wanted) — issues where community input is needed

## Changelog

The [changelog](https://github.com/greydragon888/real-router/releases) is regularly updated to reflect what's changed in each new release.

## Security

For details on supported versions and reporting security vulnerabilities, please refer to the [security policy](SECURITY.md).

## License

[MIT](LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
