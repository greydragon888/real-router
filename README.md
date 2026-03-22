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
  <b>Data-first router for JavaScript — URLs map to state, not components.</b>
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

Routing state arrives as external data — components don't manage it. No `useParams()` + `useEffect()` + `fetch()` chains.
The router tells you _where_ the user is; plugins handle data loading, titles, analytics outside the component tree. Components just render.

### Config = Full Specification

Route config is the **single source of truth** for the entire application — not just routing.
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

This means SSR works naturally: `cloneRouter()` per request, `start(url)` to resolve, `dispose()` to clean up — no special SSR mode, no framework-specific adapters. Data loading plugs in via interceptors without touching the transition pipeline. See the [SSR example](examples/ssr-react).

Result: **minimal allocations per navigation**, optimized independently from the external API.
See [Recipes](https://github.com/greydragon888/real-router/wiki/recipes) for plugin patterns: data lifecycle, analytics, scroll restoration.

### Performance

Custom **Segment Trie** matcher — O(segments) traversal, O(1) for static routes.

<details>
<summary><b>Benchmarks vs router5 and router6</b></summary>

**vs [router5](https://github.com/router5/router5):**

| Metric             | Improvement                              |
| ------------------ | ---------------------------------------- |
| Navigation         | 2-3x faster                              |
| URL building       | 7-16x faster                             |
| URL matching       | 3-5x faster                              |
| Memory allocations | 3-5x fewer                               |
| Scaling            | O(1) vs O(n) — up to 12x at 1000+ routes |

**vs [router6](https://github.com/nicolo-ribaudo/router6):**

| Metric             | Improvement                        |
| ------------------ | ---------------------------------- |
| Navigation         | ~2x faster                         |
| URL building       | 3-7x faster                        |
| URL matching       | ~2x faster                         |
| Memory allocations | 5-6x fewer                         |
| Scaling            | Both O(1) — up to 5x on deep trees |

</details>

### Key Features

- **Framework-agnostic** — React, Preact, Solid, Vue, Svelte, or vanilla JS
- **Universal** — client-side and server-side rendering ([SSR example](examples/ssr-react))
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
| `@real-router/core/utils`                   |                                                                                                                                   | Utility functions: `serializeState` (XSS-safe JSON for SSR)                                                        |
| [`@real-router/types`](packages/core-types) | [![npm](https://img.shields.io/npm/v/@real-router/types.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/types) | Shared TypeScript type definitions                                                                                 |

### Framework Integration

| Package                                  | Version                                                                                                                           | Description                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`@real-router/react`](packages/react)   | [![npm](https://img.shields.io/npm/v/@real-router/react.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/react) | React 19.2+ (hooks, `RouteView`, `Link`). React 18+ via `./legacy` |
| [`@real-router/preact`](packages/preact) |                                                                                                                                   | Preact (hooks, `RouteView`, `Link`, Suspense)                      |
| [`@real-router/solid`](packages/solid)   |                                                                                                                                   | Solid.js (signals, `RouteView`, `Link`, store-based state)         |
| [`@real-router/vue`](packages/vue)       |                                                                                                                                   | Vue 3 (composables, `RouteView`, `Link`, `KeepAlive`, `v-link`)    |
| [`@real-router/svelte`](packages/svelte) |                                                                                                                                   | Svelte 5 (runes, `RouteView` with snippets, `Lazy`, `use:link`)    |

### Plugins

| Package                                                                      | Version                                                                                                                                                                 | Description                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`@real-router/browser-plugin`](packages/browser-plugin)                     | [![npm](https://img.shields.io/npm/v/@real-router/browser-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/browser-plugin)                     | Browser History API and URL synchronization  |
| [`@real-router/hash-plugin`](packages/hash-plugin)                           | [![npm](https://img.shields.io/npm/v/@real-router/hash-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/hash-plugin)                           | Hash-based routing (`#/path`)                |
| [`@real-router/logger-plugin`](packages/logger-plugin)                       | [![npm](https://img.shields.io/npm/v/@real-router/logger-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/logger-plugin)                       | Development logging with transition tracking |
| [`@real-router/persistent-params-plugin`](packages/persistent-params-plugin) | [![npm](https://img.shields.io/npm/v/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin) | Parameter persistence across navigations     |
| [`@real-router/ssr-data-plugin`](packages/ssr-data-plugin)                   | [![npm](https://img.shields.io/npm/v/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)                   | SSR per-route data loading via interceptor   |

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

- [Solid Integration](https://github.com/greydragon888/real-router/wiki/Solid-Integration) · [Vue Integration](https://github.com/greydragon888/real-router/wiki/Vue-Integration) · [Svelte Integration](https://github.com/greydragon888/real-router/wiki/Svelte-Integration)

### Plugins

- [browser-plugin](https://github.com/greydragon888/real-router/wiki/browser-plugin) · [hash-plugin](https://github.com/greydragon888/real-router/wiki/hash-plugin) · [logger-plugin](https://github.com/greydragon888/real-router/wiki/logger-plugin) · [persistent-params-plugin](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin) · [ssr-data-plugin](https://github.com/greydragon888/real-router/wiki/ssr-data-plugin) · [rx](https://github.com/greydragon888/real-router/wiki/rx-package) · [sources](https://github.com/greydragon888/real-router/wiki/sources-package) · [route-utils](https://github.com/greydragon888/real-router/wiki/route-utils)

## Relationship to Router5

Real-Router is an **independent project** — not a fork. Built from scratch with different algorithms (Segment Trie vs linear scan), modern TypeScript API, and independent roadmap. Inspired by router5's declarative routing philosophy (named routes, hierarchical routing, lifecycle guards).

## Quality & Testing

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=greydragon888_real-router&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=greydragon888_real-router)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat-square&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fgreydragon888%2Freal-router%2Fmaster)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Property-Based Testing](https://img.shields.io/badge/PBT-fast--check-FF4785?style=flat-square)](https://fast-check.dev/)

Real-Router treats testing as a first-class engineering concern, not an afterthought.

- **100% code coverage** — enforced in CI across all packages, no exceptions
- **Static analysis** — SonarCloud quality gate on every PR: zero bugs, zero vulnerabilities, zero code smells
- **Property-based testing** — [fast-check](https://fast-check.dev/) generates thousands of random inputs to verify invariants that hand-written tests miss (URL encoding, parameter serialization, route tree operations)
- **Stress testing** — 413 dedicated stress tests across core and all framework adapters: thousands of concurrent navigations, guard removal mid-execution, route CRUD under load, heap snapshots confirming zero memory leaks, mount/unmount lifecycle validation, subscription fanout granularity, and full SPA simulations for React, Preact, Solid, Vue, and Svelte
- **Mutation testing** — [Stryker](https://stryker-mutator.io/) mutates source code and verifies that tests catch every mutation, ensuring test suite quality beyond line coverage

## Development

This is a pnpm monorepo with [Turborepo](https://turbo.build/repo) for task orchestration.

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm test -- --run    # Run tests once
pnpm type-check       # TypeScript type checking
pnpm lint             # ESLint
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
