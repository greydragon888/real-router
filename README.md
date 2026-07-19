# Real-Router

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@real-router/core.svg?style=flat-square&logo=npm)](https://www.npmjs.com/package/@real-router/core)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/core.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
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

**The router tells you where. You decide what.**

This is not a minor API difference — it's a fundamentally different architecture.\
The router is a **lifecycle manager**, not a data layer.\
It tells you when transitions happen; what to do with that — render a page, load data, set a title, track analytics, or ignore it entirely — is your decision.

> Built from scratch with TypeScript-first design. Independent project inspired by [router5](https://github.com/router5/router5)'s declarative philosophy, not a fork.

> **Pre-1.0**: Core API and plugin interfaces are stable. Minor versions preserve backward compatibility. The high release count reflects monorepo-wide coordinated publishing — one change in core triggers version bumps across all ~30 dependent packages. See [Roadmap](https://github.com/greydragon888/real-router/issues/296) for the path to 1.0 and [Quality & Testing](#quality--testing) for reliability guarantees.

## Why Real-Router?

Your routing logic lives in one place — route config plus a plugin or two.
Adding a page means adding a config entry; changing auth means touching one module.

### One-Way Data Flow in UI

Other routers push data fetching into components — `useParams()` + `useEffect()` + `fetch()` is imperative boilerplate that every page repeats.

Real-Router inverts this: routing state arrives as external data, plugins handle data loading, titles, analytics outside the component tree.
Components just render what they receive.

### Declarative Route Config

One config object declares everything — routing, access control, data loading, and any custom concern. No logic scattered across component files.

Compare where routing logic lives across routers:

```
React Router v7:   guards in loaders, meta in page files — one route module per file
Vue Router v4:     guards in beforeEach(), data in components, titles wired manually
TanStack Router:   beforeLoad + loader + head per route file, scattered across file tree
Real-Router:       guards + data + titles + any router related logic in one config object → generic plugins
```

With [`@real-router/lifecycle-plugin`](packages/lifecycle-plugin), data loading, titles, and cleanup live next to the route they belong to — no wrapper components, no HOCs, no scattered `useEffect` in pages:

```typescript
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";

router.usePlugin(lifecyclePluginFactory());

const routes = [
  {
    name: "users",
    path: "/users",
    canActivate: authGuard,
    onNavigate: (state) => {
      store.users.load(state.params);
    },
    children: [
      {
        name: "profile",
        path: "/:id",
        onNavigate: (state) => {
          document.title = `User ${state.params.id}`;
          store.users.loadOne(state.params.id);
        },
      },
    ],
  },
];
```

One config, one place. Adding a new page = one config entry. See [Recipes](https://github.com/greydragon888/real-router/wiki/recipes) for full examples.

#### Writing your own plugin when lifecycle-plugin isn't enough

For custom transition phases, cross-route coordination, or domain-specific concerns, you can write a generic plugin that reads your own fields from route config:

```typescript
const routes = [
  {
    name: "users",
    path: "/users",
    loadData: (p, api) => api.getUsers(p), // custom field → your plugin
  },
];

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

The plugin reads custom fields from any route — no hardcoded route names, works across the entire config.

### Runtime Route Management

Swap entire route trees in one call — auth flows, feature flags, A/B experiments.

Full CRUD for routes at runtime — add, remove, update, replace, clear.\
No other router offers `update()` for modifying guards, redirects, or defaults of individual routes without remove+add.\
`replace()` is atomic with state revalidation — designed for HMR and dynamic feature flags.

The most direct demonstration is an auth-driven tree swap:

```typescript
import { getRoutesApi } from "@real-router/core/api";

async function login(credentials) {
  await api.login(credentials);

  const routes = getRoutesApi(router);
  routes.clear();
  routes.add(privateRoutes);
  router.navigate("dashboard");
}

async function logout() {
  await api.logout();

  const routes = getRoutesApi(router);
  routes.clear();
  routes.add(publicRoutes);
  router.navigate("auth");
}
```

In URL→Component routers, private routes exist in the tree regardless of auth state — something must match them and decide to redirect. Real-Router takes a different path: when the user isn't authenticated, private routes aren't in the tree at all. Nothing to match, nothing to mount. An entire class of auth-related edge cases disappears by construction.

> This is a client-side state consistency pattern, not a security boundary. Data authorization still belongs on the server (auth middleware, RLS, scoped tokens). The router keeps the client tree consistent with auth state; it doesn't protect data.

### Capability-Based API

Different consumers see different surfaces:

- **Application code** uses the router directly — `navigate`, `subscribe`, `usePlugin`, etc.
- **UI components** get `Navigator` — a frozen object with only the methods components actually need (`navigate`, `getState`, `isActiveRoute`, `canNavigateTo`, `subscribe`, `subscribeLeave`, `isLeaveApproved`). No way to accidentally call `dispose()` or mutate routes.
- **Plugin authors** explicitly import `getPluginApi(router)` to access interceptors, state context claims, and internals. These are gated behind a separate import — invisible to everyone else.

Most applications never encounter plugin APIs. Most components never see dangerous methods. The right surface at the right layer.

One practical payoff — RBAC-aware menus without a second permission table:

```tsx
// canNavigateTo runs the same guards navigate would —
// so your menu shows only what the current user is actually allowed to reach.
const visibleItems = menuItems.filter((item) =>
  navigator.canNavigateTo(item.route),
);
```

No separate permission table to keep in sync with route guards. One source of truth, used both to decide what to show and what to let through.

### Minimal Runtime Footprint

The core is platform-agnostic — no DOM, no History API, no framework dependencies in the routing layer.
It works in any JavaScript runtime, not just browsers: SSR, SSG, Service Workers, edge functions, React Native — all without special modes or framework-specific adapters.
Swap the platform plugin, reuse everything else.

Runs in **browser, terminal (Ink), and desktop (Electron, Tauri)** — same router, different plugins. See [Desktop Integration Guide](https://github.com/greydragon888/real-router/wiki/Desktop-Integration).

### First-Class SSR · Streaming · SSG

The only standalone router that ships the **same SSR contract** across React 19, Preact 10, Vue 3, Solid, Svelte 5, and Angular 22+ — without locking you into Next.js, Nuxt, SolidStart, or SvelteKit. ~300+ e2e scenarios covering classical SSR, streaming, SSG, and RSC pipelines.

| Adapter   | SSR | Streaming SSR                          | SSG | e2e scenarios |
| --------- | --- | -------------------------------------- | --- | ------------- |
| React 19  | ✓   | OOO `<Suspense>` + `use()`             | ✓   | 36+           |
| Preact 10 | ✓   | OOO `<preact-island>` + `<Await>`      | ✓   | 4 pipelines   |
| Vue 3     | ✓   | chunked + blocking Suspense            | ✓   | 55            |
| Solid     | ✓   | OOO + selective hydration              | ✓   | 59            |
| Svelte 5  | ✓   | deferred-data via `{#await}`           | ✓   | 52            |
| Angular   | ✓   | TransferState bridge                   | ✓   | 4 pipelines   |

**Unique primitives at the routing layer:**

- **Per-route SSR mode** — `full` / `data-only` / `client-only` + function form `(state) => SsrMode` (data-driven, not path-based)
- **Cross-adapter SSR components** — `<ClientOnly>`, `<ServerOnly>`, `<Await>`, `<Streamed>`, `<HttpStatusCode>` shipped symmetric across 5 adapters via `/ssr` subpath
- **Typed loader errors → HTTP** — `LoaderRedirect` / `LoaderNotFound` / `LoaderTimeout` mapped to 301/302/404/504 in both SSR and RSC pipelines
- **`createRequestScope(req, baseRouter, deps)`** — correct-by-construction request DI: clone + AbortController + `req.on("close")` + dispose in one call
- **Network-level cancellation** — `withTimeout()` composes deadline + client-disconnect into one `AbortSignal`; in-flight `fetch` aborts at TCP level when deadline fires
- **Post-hydration loader skip** — zero fetch on first paint after hydration, automatic in all 6 adapters

[SSR](examples/web/react/ssr-examples/ssr) · [Streaming SSR](examples/web/react/ssr-examples/ssr-streaming) · [SSG](examples/web/react/ssr-examples/ssg) · [RSC](examples/web/react/ssr-examples/ssr-rsc) · [Wiki: SSR](https://github.com/greydragon888/real-router/wiki/ssr) · [Streaming SSR](https://github.com/greydragon888/real-router/wiki/Streaming-SSR) · [SSR Hydration](https://github.com/greydragon888/real-router/wiki/SSR-Hydration)

### Performance

Navigation stays fast as your route tree grows — from 10 routes to 1000, the cost per navigation barely moves.
The Segment Trie matcher traverses in O(segments), not O(routes).

Measured in the [cross-router benchmark](benchmarks/README.md) — real Chromium (Playwright + CDP), production Vite builds, every serious competitor in each framework cohort, per-cohort verdicts only.

**vs TanStack Router** (same snapshot, per cohort):

| Cohort | Navigation latency | Transient GC per navigation |
| ------ | ------------------ | --------------------------- |
| React  | **~2.6× faster**   | **~12× fewer allocations**  |
| Solid  | **~6× faster**     | **~17× fewer allocations**  |
| Vue    | **~3.5× faster**   | **~24× fewer allocations**  |

In the isolated matcher microbench ([`matcher-bench`](benchmarks/cross-router/matcher-bench/README.md)), only real-router and TanStack hold a flat **O(1)** curve as the route table widens — every other measured router scans O(N) — and real-router **wins the deep-tree match in every cohort**.

### Key Features

- **Framework-agnostic** — React, Preact, Solid, Vue, Svelte, Angular, or vanilla JS
- **First-class SSR / Streaming / SSG / RSC** — same primitives across React 19, Preact 10, Vue 3, Solid, Svelte 5, Angular 22+ — no meta-framework lock-in. [See above](#first-class-ssr--streaming--ssg)
- **Named nested routes** — dot-notation hierarchy (`users.profile`)
- **Lifecycle guards** — `canActivate` / `canDeactivate` per route or globally
- **AbortController** — cancel navigations via standard `AbortSignal`
- **Dynamic route management** — add, remove, update, replace routes at runtime
- **Dependency injection** — type-safe DI container for guards and plugins
- **Plugin architecture** — intercept and extend router behavior
- **Observable state** — RxJS and TC39 Observable compatible
- **Immutable state** — deeply frozen, predictable state management
- **Scroll restoration** — opt-in via `RouterProvider.scrollRestoration` ([docs](https://github.com/greydragon888/real-router/wiki/Scroll-Restoration)); restores on back/forward, scrolls to top / `#hash` on push; `restore` / `top` / `manual` modes; custom scroll containers
- **Scroll spy** — opt-in via `RouterProvider.scrollSpy` ([docs](https://github.com/greydragon888/real-router/wiki/Scroll-Spy)); router-coordinated `IntersectionObserver` syncs the URL hash to the topmost visible anchor as you scroll

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
    children: [
      {
        name: "profile",
        path: "/:id",
      },
    ],
  },
];

const router = createRouter(routes);
router.usePlugin(browserPluginFactory(), __DEV__ && validationPlugin());

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

> **Route-level lifecycle hooks:** add [`@real-router/lifecycle-plugin`](https://www.npmjs.com/package/@real-router/lifecycle-plugin) to attach `onNavigate`, `onEnter`, `onStay`, `onLeave` callbacks directly to route definitions — no `subscribe()` boilerplate:
>
> ```typescript
> import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
>
> const routes = [
>   {
>     name: "home",
>     path: "/",
>     onLeave: () => cleanup(),
>   },
>   {
>     name: "users.view",
>     path: "/users/:id",
>     onNavigate: (s) => track(s.params.id),
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

| Package                                    | Version                                                                                                                               | Description                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@real-router/react`](packages/react)     | [![npm](https://img.shields.io/npm/v/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react)     | React 19.2+ (hooks, `RouteView`, `Link`). React 18+ via `./legacy`                         |
| [`@real-router/preact`](packages/preact)   | [![npm](https://img.shields.io/npm/v/@real-router/preact.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/preact)   | Preact (hooks, `RouteView`, `Link`, Suspense)                                              |
| [`@real-router/solid`](packages/solid)     | [![npm](https://img.shields.io/npm/v/@real-router/solid.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/solid)     | Solid.js (signals, `RouteView`, `Link`, store-based state)                                 |
| [`@real-router/vue`](packages/vue)         | [![npm](https://img.shields.io/npm/v/@real-router/vue.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/vue)         | Vue 3 (composables, `RouteView`, `Link`, `KeepAlive`, `v-link`)                            |
| [`@real-router/svelte`](packages/svelte)   | [![npm](https://img.shields.io/npm/v/@real-router/svelte.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/svelte)   | Svelte 5 (runes, `RouteView` with snippets, `Lazy`, `use:link`)                            |
| [`@real-router/angular`](packages/angular) | [![npm](https://img.shields.io/npm/v/@real-router/angular.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/angular) | Angular 22+ (signals, `inject*` functions, `<route-view>`, `realLink` directive, zoneless) |

### Plugins

| Package                                                                      | Version                                                                                                                                                                 | Description                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`@real-router/browser-plugin`](packages/browser-plugin)                     | [![npm](https://img.shields.io/npm/v/@real-router/browser-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/browser-plugin)                     | Browser History API and URL synchronization             |
| [`@real-router/navigation-plugin`](packages/navigation-plugin)               | [![npm](https://img.shields.io/npm/v/@real-router/navigation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/navigation-plugin)               | Navigation API integration + route-level history        |
| [`@real-router/memory-plugin`](packages/memory-plugin)                       | [![npm](https://img.shields.io/npm/v/@real-router/memory-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/memory-plugin)                       | In-memory history: back/forward/go (no DOM)             |
| [`@real-router/hash-plugin`](packages/hash-plugin)                           | [![npm](https://img.shields.io/npm/v/@real-router/hash-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/hash-plugin)                           | Hash-based routing (`#/path`)                           |
| [`@real-router/logger-plugin`](packages/logger-plugin)                       | [![npm](https://img.shields.io/npm/v/@real-router/logger-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger-plugin)                       | Development logging with transition tracking            |
| [`@real-router/persistent-params-plugin`](packages/persistent-params-plugin) | [![npm](https://img.shields.io/npm/v/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin) | Parameter persistence across navigations                |
| [`@real-router/ssr-data-plugin`](packages/ssr-data-plugin)                   | [![npm](https://img.shields.io/npm/v/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)                   | SSR per-route data loading via interceptor              |
| [`@real-router/rsc-server-plugin`](packages/rsc-server-plugin)               | [![npm](https://img.shields.io/npm/v/@real-router/rsc-server-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rsc-server-plugin)               | RSC per-route ReactNode loading (bundler-agnostic)      |
| [`@real-router/lifecycle-plugin`](packages/lifecycle-plugin)                 | [![npm](https://img.shields.io/npm/v/@real-router/lifecycle-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/lifecycle-plugin)                 | Route-level hooks: onNavigate, onEnter, onStay, onLeave |
| [`@real-router/preload-plugin`](packages/preload-plugin)                     | [![npm](https://img.shields.io/npm/v/@real-router/preload-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/preload-plugin)                     | Preload on navigation intent (hover, touch)             |
| [`@real-router/validation-plugin`](packages/validation-plugin)               | [![npm](https://img.shields.io/npm/v/@real-router/validation-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/validation-plugin)               | Runtime argument validation for development             |
| [`@real-router/search-schema-plugin`](packages/search-schema-plugin)         | [![npm](https://img.shields.io/npm/v/@real-router/search-schema-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/search-schema-plugin)         | Search param validation via Standard Schema             |

### Utilities

| Package                                            | Version                                                                                                                                       | Description                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@real-router/sources`](packages/sources)         | [![npm](https://img.shields.io/npm/v/@real-router/sources.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/sources)         | Reactive subscription sources for UI bindings — per-router cached `getTransitionSource` / `createDismissableError` / `createActiveNameSelector` + canonical params cache |
| [`@real-router/rx`](packages/rx)                   | [![npm](https://img.shields.io/npm/v/@real-router/rx.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rx)                   | Observable API: `state$`, `events$`, operators, TC39 Observable                                                                                                          |
| [`@real-router/route-utils`](packages/route-utils) | [![npm](https://img.shields.io/npm/v/@real-router/route-utils.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/route-utils) | Route tree queries: `getRouteUtils`, segment testers, `areRoutesRelated`                                                                                                 |
| [`@real-router/logger`](packages/logger)           | [![npm](https://img.shields.io/npm/v/@real-router/logger.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger)           | Structured logging utility                                                                                                                                               |

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

### Preact / Solid / Vue / Svelte / Angular

- [Preact Integration](https://github.com/greydragon888/real-router/wiki/Preact-Integration) · [Solid Integration](https://github.com/greydragon888/real-router/wiki/Solid-Integration) · [Vue Integration](https://github.com/greydragon888/real-router/wiki/Vue-Integration) · [Svelte Integration](https://github.com/greydragon888/real-router/wiki/Svelte-Integration) · [Angular Integration](https://github.com/greydragon888/real-router/wiki/Angular-Integration)

### Plugins

- [browser-plugin](https://github.com/greydragon888/real-router/wiki/browser-plugin) · [navigation-plugin](https://github.com/greydragon888/real-router/wiki/Navigation-Plugin) · [hash-plugin](https://github.com/greydragon888/real-router/wiki/hash-plugin) · [logger-plugin](https://github.com/greydragon888/real-router/wiki/logger-plugin) · [persistent-params-plugin](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin) · [search-schema-plugin](https://github.com/greydragon888/real-router/wiki/search-schema-plugin) · [ssr-data-plugin](https://github.com/greydragon888/real-router/wiki/ssr-data-plugin) · [rsc-server-plugin](https://github.com/greydragon888/real-router/wiki/rsc-server-plugin) · [lifecycle-plugin](https://github.com/greydragon888/real-router/wiki/lifecycle-plugin) · [preload-plugin](https://github.com/greydragon888/real-router/wiki/preload-plugin) · [memory-plugin](https://github.com/greydragon888/real-router/wiki/memory-plugin) · [validation-plugin](https://github.com/greydragon888/real-router/wiki/validation-plugin) · [rx](https://github.com/greydragon888/real-router/wiki/rx-package) · [sources](https://github.com/greydragon888/real-router/wiki/sources-package) · [route-utils](https://github.com/greydragon888/real-router/wiki/route-utils)

### Server-Side Rendering & RSC

- [Server-Side Rendering](https://github.com/greydragon888/real-router/wiki/ssr) — `cloneRouter` per request, `start(url)` resolution, `dispose()` cleanup
- [SSR Hydration](https://github.com/greydragon888/real-router/wiki/SSR-Hydration) — `serializeRouterState` + `hydrateRouter` round-trip, `excludeContext` for non-serializable namespaces
- [Data Loading](https://github.com/greydragon888/real-router/wiki/Data-Loading) — `ssr-data-plugin` for plain JSON, fetcher patterns
- [**Streaming SSR**](https://github.com/greydragon888/real-router/wiki/Streaming-SSR) — React 19 `renderToReadableStream` + `<Suspense>` + `use(promise)` for deferred sections. Zero router-specific API — pure delegation to React 19 native primitives. Reference: [`examples/web/react/ssr-examples/ssr-streaming/`](examples/web/react/ssr-examples/ssr-streaming)
- [**RSC Integration**](https://github.com/greydragon888/real-router/wiki/RSC-Integration) — React Server Components end-to-end: `@vitejs/plugin-rsc` setup, two-endpoint architecture (HTML + `/__rsc`), Flight injection, client mount. Reference implementation: [`examples/web/react/ssr-examples/ssr-rsc/`](examples/web/react/ssr-examples/ssr-rsc)

## Examples

Many runnable examples across the most popular frameworks — each is a standalone Vite app:

<details>
<summary><b>Feature matrix — 6 adapters × 12 features (+ framework-specific)</b></summary>

| Feature                 | [React](examples/web/react) | [Preact](examples/web/preact) | [Solid](examples/web/solid) | [Vue](examples/web/vue) | [Svelte](examples/web/svelte) | [Angular](examples/web/angular) |
| ----------------------- | --------------------------- | ----------------------------- | --------------------------- | ----------------------- | ----------------------------- | ------------------------------- |
| Basic routing           | [basic](examples/web/react/basic) | [basic](examples/web/preact/basic) | [basic](examples/web/solid/basic) | [basic](examples/web/vue/basic) | [basic](examples/web/svelte/basic) | [basic](examples/web/angular/basic) |
| Nested routes           | [nested-routes](examples/web/react/nested-routes) | [nested-routes](examples/web/preact/nested-routes) | [nested-routes](examples/web/solid/nested-routes) | [nested-routes](examples/web/vue/nested-routes) | [nested-routes](examples/web/svelte/nested-routes) | [nested-routes](examples/web/angular/nested-routes) |
| Auth guards             | [auth-guards](examples/web/react/auth-guards) | [auth-guards](examples/web/preact/auth-guards) | [auth-guards](examples/web/solid/auth-guards) | [auth-guards](examples/web/vue/auth-guards) | [auth-guards](examples/web/svelte/auth-guards) | — |
| Data loading            | [data-loading](examples/web/react/data-loading) | [data-loading](examples/web/preact/data-loading) | [data-loading](examples/web/solid/data-loading) | [data-loading](examples/web/vue/data-loading) | [data-loading](examples/web/svelte/data-loading) | — |
| Lazy loading            | [lazy-loading](examples/web/react/lazy-loading) | [lazy-loading](examples/web/preact/lazy-loading) | [lazy-loading](examples/web/solid/lazy-loading) | [lazy-loading](examples/web/vue/lazy-loading) | [lazy-loading](examples/web/svelte/lazy-loading) | [lazy-loading](examples/web/angular/lazy-loading) |
| Async guards            | [async-guards](examples/web/react/async-guards) | [async-guards](examples/web/preact/async-guards) | [async-guards](examples/web/solid/async-guards) | [async-guards](examples/web/vue/async-guards) | [async-guards](examples/web/svelte/async-guards) | — |
| Hash routing            | [hash-routing](examples/web/react/hash-routing) | [hash-routing](examples/web/preact/hash-routing) | [hash-routing](examples/web/solid/hash-routing) | [hash-routing](examples/web/vue/hash-routing) | [hash-routing](examples/web/svelte/hash-routing) | [hash-routing](examples/web/angular/hash-routing) |
| Persistent params       | [persistent-params](examples/web/react/persistent-params) | [persistent-params](examples/web/preact/persistent-params) | [persistent-params](examples/web/solid/persistent-params) | [persistent-params](examples/web/vue/persistent-params) | [persistent-params](examples/web/svelte/persistent-params) | [persistent-params](examples/web/angular/persistent-params) |
| Search schema           | [search-schema](examples/web/react/search-schema) | [search-schema](examples/web/preact/search-schema) | [search-schema](examples/web/solid/search-schema) | [search-schema](examples/web/vue/search-schema) | [search-schema](examples/web/svelte/search-schema) | — |
| Error handling          | [error-handling](examples/web/react/error-handling) | [error-handling](examples/web/preact/error-handling) | [error-handling](examples/web/solid/error-handling) | [error-handling](examples/web/vue/error-handling) | [error-handling](examples/web/svelte/error-handling) | — |
| Dynamic routes          | [dynamic-routes](examples/web/react/dynamic-routes) | [dynamic-routes](examples/web/preact/dynamic-routes) | [dynamic-routes](examples/web/solid/dynamic-routes) | [dynamic-routes](examples/web/vue/dynamic-routes) | [dynamic-routes](examples/web/svelte/dynamic-routes) | [dynamic-routes](examples/web/angular/dynamic-routes) |
| Combined (all features) | [combined](examples/web/react/combined) | [combined](examples/web/preact/combined) | [combined](examples/web/solid/combined) | [combined](examples/web/vue/combined) | [combined](examples/web/svelte/combined) | [combined](examples/web/angular/combined) |
| **Framework-specific**  | [keepAlive](examples/web/react/keepAlive), [legacy-entry](examples/web/react/legacy-entry), [hmr](examples/web/react/hmr), [link-hash](examples/web/react/hash-examples/link-hash), [navigation-api](examples/web/react/navigation-api), [scroll-restoration](examples/web/react/hash-examples/scroll-restoration), [scroll-spy](examples/web/react/hash-examples/scroll-spy), [ink-demo](examples/console/react-ink) | — | [store-based-state](examples/web/solid/store-based-state), [use-link-directive](examples/web/solid/use-link-directive), [signal-primitives](examples/web/solid/signal-primitives) | [plugin-installation](examples/web/vue/plugin-installation), [v-link-directive](examples/web/vue/v-link-directive), [keep-alive](examples/web/vue/keep-alive) | [link-action](examples/web/svelte/link-action), [lazy-loading-svelte](examples/web/svelte/lazy-loading-svelte), [snippets-routing](examples/web/svelte/snippets-routing), [reactive-source](examples/web/svelte/reactive-source) | — |

</details>

### Server rendering — cross-framework symmetry

Every pipeline below ships as a standalone Vite app per adapter — `pnpm dev` from any folder. All 6 web adapters cover the same 4 SSR pipelines through one `ssr-data-plugin` contract; React additionally has RSC + Flight via `@real-router/rsc-server-plugin`.

<details>
<summary><b>SSR pipeline matrix — 6 adapters × 4 pipelines (+ RSC for React)</b></summary>

| Pipeline       | [React](examples/web/react/ssr-examples)                       | [Preact](examples/web/preact/ssr-examples)                       | [Vue](examples/web/vue/ssr-examples)                       | [Solid](examples/web/solid/ssr-examples)                       | [Svelte](examples/web/svelte/ssr-examples)                       | [Angular](examples/web/angular/ssr-examples)                       |
| -------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Classical SSR  | [ssr](examples/web/react/ssr-examples/ssr)                     | [ssr](examples/web/preact/ssr-examples/ssr)                      | [ssr](examples/web/vue/ssr-examples/ssr)                   | [ssr](examples/web/solid/ssr-examples/ssr)                     | [ssr](examples/web/svelte/ssr-examples/ssr)                      | [ssr](examples/web/angular/ssr-examples/ssr)                       |
| Streaming SSR  | [ssr-streaming](examples/web/react/ssr-examples/ssr-streaming) | [ssr-streaming](examples/web/preact/ssr-examples/ssr-streaming)  | [ssr-streaming](examples/web/vue/ssr-examples/ssr-streaming) | [ssr-streaming](examples/web/solid/ssr-examples/ssr-streaming) | [ssr-streaming](examples/web/svelte/ssr-examples/ssr-streaming)  | [ssr-streaming](examples/web/angular/ssr-examples/ssr-streaming)   |
| Mixed SSR modes| [ssr-mixed](examples/web/react/ssr-examples/ssr-mixed)         | [ssr-mixed](examples/web/preact/ssr-examples/ssr-mixed)          | [ssr-mixed](examples/web/vue/ssr-examples/ssr-mixed)       | [ssr-mixed](examples/web/solid/ssr-examples/ssr-mixed)         | [ssr-mixed](examples/web/svelte/ssr-examples/ssr-mixed)          | [ssr-mixed](examples/web/angular/ssr-examples/ssr-mixed)           |
| SSG            | [ssg](examples/web/react/ssr-examples/ssg)                     | [ssg](examples/web/preact/ssr-examples/ssg)                      | [ssg](examples/web/vue/ssr-examples/ssg)                   | [ssg](examples/web/solid/ssr-examples/ssg)                     | [ssg](examples/web/svelte/ssr-examples/ssg)                      | [ssg](examples/web/angular/ssr-examples/ssg)                       |
| RSC + Flight   | [ssr-rsc](examples/web/react/ssr-examples/ssr-rsc)             | —                                                                | —                                                          | —                                                              | —                                                                | —                                                                  |

</details>

### Animations — cross-framework symmetry

Each adapter ships four standalone animation pipelines under `animation-examples/` (24 apps in total). See [Routing Animations](https://github.com/greydragon888/real-router/wiki/Routing-Animations) and [View Transitions](https://github.com/greydragon888/real-router/wiki/View-Transitions).

<details>
<summary><b>Animation pipeline matrix — 6 adapters × 4 pipelines</b></summary>

| Pipeline          | [React](examples/web/react/animation-examples) | [Preact](examples/web/preact/animation-examples) | [Solid](examples/web/solid/animation-examples) | [Vue](examples/web/vue/animation-examples) | [Svelte](examples/web/svelte/animation-examples) | [Angular](examples/web/angular/animation-examples) |
| ----------------- | ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| Motion animations | [motion-animations](examples/web/react/animation-examples/motion-animations) | [motion-animations](examples/web/preact/animation-examples/motion-animations) | [motion-animations](examples/web/solid/animation-examples/motion-animations) | [motion-animations](examples/web/vue/animation-examples/motion-animations) | [motion-animations](examples/web/svelte/animation-examples/motion-animations) | [motion-animations](examples/web/angular/animation-examples/motion-animations) |
| Page animations   | [page-animations](examples/web/react/animation-examples/page-animations)     | [page-animations](examples/web/preact/animation-examples/page-animations)     | [page-animations](examples/web/solid/animation-examples/page-animations)     | [page-animations](examples/web/vue/animation-examples/page-animations)     | [page-animations](examples/web/svelte/animation-examples/page-animations)     | [page-animations](examples/web/angular/animation-examples/page-animations)     |
| Route animations  | [route-animations](examples/web/react/animation-examples/route-animations)   | [route-animations](examples/web/preact/animation-examples/route-animations)   | [route-animations](examples/web/solid/animation-examples/route-animations)   | [route-animations](examples/web/vue/animation-examples/route-animations)   | [route-animations](examples/web/svelte/animation-examples/route-animations)   | [route-animations](examples/web/angular/animation-examples/route-animations)   |
| View Transitions  | [view-transitions](examples/web/react/animation-examples/view-transitions)   | [view-transitions](examples/web/preact/animation-examples/view-transitions)   | [view-transitions](examples/web/solid/animation-examples/view-transitions)   | [view-transitions](examples/web/vue/animation-examples/view-transitions)   | [view-transitions](examples/web/svelte/animation-examples/view-transitions)   | [view-transitions](examples/web/angular/animation-examples/view-transitions)   |

</details>

| **Terminal UI (Ink)** | [ink-demo](examples/console/react-ink) — CLI app via [@real-router/react/ink](packages/react/README.md#ink-terminal-ui) + memory-plugin |

| **Desktop (Electron, Tauri)** | [electron/react](examples/desktop/electron/react) (`browser-plugin` + `app://`), [electron/react-hash](examples/desktop/electron/react-hash) (`hash-plugin` + `file://`), [electron/react-navigation](examples/desktop/electron/react-navigation) (`navigation-plugin` + HistoryPanel), [tauri/react](examples/desktop/tauri/react) (Tauri v2 + `browser-plugin`), [tauri/react-navigation](examples/desktop/tauri/react-navigation) (Tauri v2 + `navigation-plugin`). See [Desktop Integration Guide](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) |

Run any example: `cd examples/web/react/basic && pnpm dev` (the Ink demo is tsx-based — `cd examples/console/react-ink && pnpm dev`; Electron — `cd examples/desktop/electron/react && pnpm dev`; Tauri — `cd examples/desktop/tauri/react && pnpm tauri dev`, requires Rust toolchain).

## Relationship to Router5

Real-Router is an **independent project** — not a fork. Built from scratch with different algorithms (Segment Trie vs linear scan), modern TypeScript API, and independent roadmap. Inspired by router5's declarative routing philosophy (named routes, hierarchical routing, lifecycle guards).

## Quality & Testing

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=greydragon888_real-router&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=greydragon888_real-router)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/e2e-playwright-2EAD33?style=flat-square&logo=playwright)](https://playwright.dev/)
[![Property-Based Testing](https://img.shields.io/badge/PBT-fast--check-FF4785?style=flat-square)](https://fast-check.dev/)

Real-Router treats testing as a first-class engineering concern, not an afterthought.

- **100% code coverage** — enforced in CI across all packages, no exceptions
- **Static analysis** — SonarCloud quality gate on every PR: zero bugs, zero vulnerabilities, zero code smells
- **Property-based testing** — 1000+ property tests via [fast-check](https://fast-check.dev/) across 31 packages, each running hundreds of generated inputs to verify invariants that hand-written tests miss (URL encoding, parameter serialization, route tree operations, reactive subscription ordering)
- **Stress testing** — 500+ dedicated stress tests across core, plugins, and all 6 framework adapters: thousands of concurrent navigations, guard removal mid-execution, route CRUD under load, heap snapshots confirming zero memory leaks, mount/unmount lifecycle validation, subscription fanout granularity, and full SPA simulations
- **Playwright e2e testing** — 1000+ end-to-end test cases across 100+ Playwright suites covering all 6 framework adapters (React, Preact, Solid, Vue, Svelte, Angular). Tests verify real browser behavior: navigation, guards, data loading, error handling, hash routing, nested routes, dynamic routes, and async guards
- **Mutation testing** — [Stryker](https://stryker-mutator.io/) mutates source code and verifies that tests catch every mutation, ensuring test suite quality beyond line coverage
- **Continuous performance benchmarking** — core hot-path navigation gated by [CodSpeed](https://codspeed.io/) on every PR: deterministic CPU-instruction-count measurement (not wall-clock) catches regressions before merge

## Development

This is a pnpm monorepo with [Turborepo](https://turbo.build/repo) for task orchestration.

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (errors-only output)
pnpm build:verbose    # Build with full output (debugging)
pnpm test -- --run    # Run tests once (errors-only output)
pnpm test:verbose     # Tests with full output (debugging)
pnpm type-check       # TypeScript type checking
pnpm lint             # ESLint check only — the gate (no --fix)
pnpm lint:fix         # ESLint with --fix (local auto-fix)
pnpm lint:e2e         # Verify e2e directories have spec files
pnpm lint:unused      # Check for unused code (knip)
```

### Windows: enable symlinks

The repo uses git-tracked symlinks to share source files across framework adapters (`packages/*/src/dom-utils` → `shared/dom-utils/` — see [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for the rationale). Unix/macOS/Linux contributors need no extra setup. Windows contributors need a one-time configuration:

```bash
# 1. Enable symlink support in git (one-time, global)
git config --global core.symlinks true
```

Additionally, enable [Developer Mode](https://learn.microsoft.com/en-us/windows/apps/get-started/developer-mode-features-and-debugging) in Windows Settings, or run git from an elevated shell. After enabling both, re-clone the repo (or run `git checkout` on an existing clone) to materialize the symlinks. Without this, `pnpm install`, `pnpm build`, and `pnpm test` fail with "file not found" errors for paths under `src/dom-utils/`.

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
