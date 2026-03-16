# Real-Router

<div align="center">

  <!-- Community -->

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![Engineered with Claude Code](https://img.shields.io/badge/Engineered%20with-Claude%20Code-5865F2?style=flat-square&logo=anthropic&logoColor=white)](https://claude.com/claude-code)

  <!-- Code Quality Tools -->

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Built with tsup](https://img.shields.io/badge/built%20with-tsup-blue?style=flat-square)](https://tsup.egoist.dev)
[![ESLint](https://img.shields.io/badge/eslint-9.39-4B32C3?style=flat-square&logo=eslint)](https://eslint.org/)
[![Turborepo](https://img.shields.io/badge/built%20with-Turborepo-EF4444?style=flat-square&logo=turborepo&logoColor=white)](https://turbo.build/repo)

  <!-- Quality & Testing -->

[![Enterprise Grade Testing](https://img.shields.io/badge/testing-enterprise%20grade-brightgreen?style=flat-square)](https://dashboard.stryker-mutator.io/reports/github.com/greydragon888/real-router/master)
[![Coverage Status](https://codecov.io/gh/greydragon888/real-router/branch/master/graph/badge.svg)](https://codecov.io/gh/greydragon888/real-router)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=greydragon888_real-router&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=greydragon888_real-router)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Property-Based Testing](https://img.shields.io/badge/PBT-fast--check-FF4785?style=flat-square)](https://fast-check.dev/)

</div>

> A simple, powerful, view-agnostic, modular and extensible router for JavaScript applications.

> **Warning**
> This project is pre-1.0. The core API and plugin interfaces are considered stable and are unlikely to change.
> Minor versions may include new features but aim to preserve backward compatibility.
> A 1.0 release will follow once the full API surface has been validated in production use.

Real-Router is an **independent routing solution** inspired by the declarative routing philosophy of [router5](https://github.com/router5/router5), built from scratch with modern JavaScript, TypeScript-first design, and performance optimizations.

## Why Real-Router?

### Performance-First Design

Real-Router uses a custom **Segment Trie** matcher — a trie where each edge is an entire URL segment, natively reflecting the hierarchy of named routes.

**vs [router5](https://github.com/router5/router5):**

| Metric             | Improvement                              |
| ------------------ | ---------------------------------------- |
| Navigation         | 2–3x faster                              |
| URL building       | 7–16x faster                             |
| URL matching       | 3–5x faster                              |
| Memory allocations | 3–5x fewer                               |
| Scaling            | O(1) vs O(n) — up to 12x at 1000+ routes |

**vs [router6](https://github.com/nicolo-ribaudo/router6):**

| Metric             | Improvement                        |
| ------------------ |------------------------------------|
| Navigation         | ~2x faster                         |
| URL building       | 3–7x faster                        |
| URL matching       | ~2x faster                         |
| Memory allocations | 5–6x fewer                         |
| Scaling            | Both O(1) — up to 5x on deep trees |

### Reliability

Verified by 99 stress tests covering 100% of the public API:

- **Zero memory leaks**: Heap stable across thousands of navigations, route mutations, and plugin cycles (50+ heap snapshots)
- **Clean disposal**: `dispose()` fully releases all resources; GC collects >50% of disposed routers immediately
- **Concurrent-safe**: Fire-and-forget navigations, guard removal during execution, and route CRUD under load — no race conditions
- **Robust error handling**: All error paths validated under storm conditions (1,000+ error cycles)

### Modern Architecture

- **TypeScript-first**: Complete type safety with full generics support
- **Immutable state**: Predictable state management
- **Mandatory validation**: Descriptive error messages during development
- **Modern builds**: ESM and CommonJS with tree-shaking support

## Key Features

- **Framework-agnostic**: Works with React, Vue, Angular, or vanilla JS
- **Universal**: Client-side and server-side rendering
- **Nested routes**: Full support for hierarchical route structures
- **Lifecycle guards**: `addActivateGuard` / `addDeactivateGuard` for navigation control
- **AbortController support**: Cancel navigations via standard `AbortSignal` API
- **HMR support**: Atomic route replacement via `replace()` with state preservation
- **Observable state**: Compatible with RxJS and other observable libraries
- **Plugin architecture**: Modular functionality

## Installation

```bash
npm install @real-router/core
# or
pnpm add @real-router/core
# or
yarn add @real-router/core
# or
bun add @real-router/core
```

## Quick Start

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

// Navigate programmatically
await router.navigate("users.profile", { id: "123" });
```

### With React

```tsx
import { RouterProvider, useRouteNode, Link } from "@real-router/react";

function App() {
  const { route } = useRouteNode(""); // root — re-renders on any route change

  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        <Link routeName="users">Users</Link>
      </nav>
      <p>Current route: {route?.name}</p>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <RouterProvider router={router}>
    <App />
  </RouterProvider>,
);
```

### With Observables

```typescript
import { from } from "rxjs";
import { observable } from "@real-router/rx";

from(observable(router)).subscribe(({ route, previousRoute }) => {
  console.log("Navigation:", previousRoute?.name, "→", route.name);
});
```

## Packages

This is a **monorepo** containing multiple packages. Install only what you need:

### Core

| Package                            | Description                |
| ---------------------------------- | -------------------------- |
| [@real-router/core](packages/core) | Core router implementation |

### Framework Integration

| Package                              | Description                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| [@real-router/react](packages/react) | React 19.2+ integration (Provider, hooks, components). React 18+ via `./legacy`. |

### Plugins

| Package                                                                    | Description                                  |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| [@real-router/browser-plugin](packages/browser-plugin)                     | Browser History API and URL synchronization  |
| [@real-router/hash-plugin](packages/hash-plugin)                           | Hash-based routing (`#/path`)                |
| [@real-router/logger-plugin](packages/logger-plugin)                       | Development logging with transition tracking |
| [@real-router/persistent-params-plugin](packages/persistent-params-plugin) | Parameter persistence across navigations     |

### Subscription Layer

| Package                                  | Description                                   |
| ---------------------------------------- | --------------------------------------------- |
| [@real-router/sources](packages/sources) | Reactive subscription sources for UI bindings |

### Utilities

| Package                                          | Description                                          |
| ------------------------------------------------ | ---------------------------------------------------- |
| [@real-router/fsm](packages/fsm)                 | Finite state machine engine                          |
| [@real-router/logger](packages/logger)           | Structured logging utility                           |
| [@real-router/rx](packages/rx)                   | Reactive Observable API (state$, events$, operators) |
| [@real-router/route-utils](packages/route-utils) | Route tree queries and segment testing utilities     |

## Documentation

Full documentation is available in the repository wiki.

### Getting Started

- **Introduction** — Overview and core concepts
- **Defining Routes** — Route configuration and nesting
- **Path Syntax** — URL patterns and parameters

### Core Concepts

- **Navigation** — Programmatic navigation API
- **State** — Router state management
- **Plugins** — Extending router functionality

### API Reference

- **createRouter** — Router factory function
- **Router Methods** — Complete API reference
- **React Hooks** — useRouter, useRoute, useRouteNode

## Relationship to Router5

Real-Router is an **independent project** inspired by router5's declarative routing philosophy. While it shares similar concepts (named routes, hierarchical routing, lifecycle guards), Real-Router is:

- **Not a fork**: Built from scratch with different implementation
- **Different API**: Modern TypeScript-first API design
- **Performance-focused**: Optimized algorithms and data structures
- **Independent development**: Separate roadmap and features

## Development

This is a pnpm monorepo using Turbo for task orchestration.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm type-check

# Linting
pnpm lint
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a pull request.

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)

---

**Inspired by the routing philosophy of [router5](https://github.com/router5/router5)**
