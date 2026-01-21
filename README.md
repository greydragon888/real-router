# Real-Router

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> A simple, powerful, view-agnostic, modular and extensible router for JavaScript applications.

Real-Router is an **independent routing solution** inspired by the declarative routing philosophy of [router5](https://github.com/router5/router5), built from scratch with modern JavaScript, TypeScript-first design, and performance optimizations.

## Why Real-Router?

### Performance-First Design

Real-Router delivers exceptional performance through algorithmic improvements:

| Operation              | Optimization               |
| ---------------------- | -------------------------- |
| Route lookup           | O(1) Map-based operations  |
| Path matching          | O(segments) trie traversal |
| Event listener removal | O(1) hash-based removal    |
| Memory footprint       | Optimized data structures  |

### Modern Architecture

- **TypeScript-first**: Complete type safety with full generics support
- **Immutable state**: Predictable state management
- **Mandatory validation**: Descriptive error messages during development
- **Modern builds**: ESM and CommonJS with tree-shaking support

## Key Features

- **Framework-agnostic**: Works with React, Vue, Angular, or vanilla JS
- **Universal**: Client-side and server-side rendering
- **Nested routes**: Full support for hierarchical route structures
- **Lifecycle guards**: `canActivate` / `canDeactivate` for navigation control
- **Observable state**: Compatible with RxJS and other observable libraries
- **Middleware support**: Extensible navigation pipeline
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
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
];

const router = createRouter(routes);

router.usePlugin(browserPluginFactory());

router.start();

// Navigate programmatically
router.navigate("users.profile", { id: "123" });
```

### With React

```tsx
import { RouterProvider, useRoute, Link } from "@real-router/react";

function App() {
  const { route } = useRoute();

  return (
    <nav>
      <Link routeName="home">Home</Link>
      <Link routeName="users">Users</Link>
    </nav>
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

from(router).subscribe(({ route, previousRoute }) => {
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

| Package                              | Description                                     |
| ------------------------------------ | ----------------------------------------------- |
| [@real-router/react](packages/react) | React integration (Provider, hooks, components) |

### Plugins

| Package                                                                    | Description                                  |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| [@real-router/browser-plugin](packages/browser-plugin)                     | Browser history and URL synchronization      |
| [@real-router/logger-plugin](packages/logger-plugin)                       | Development logging with transition tracking |
| [@real-router/persistent-params-plugin](packages/persistent-params-plugin) | Parameter persistence across navigations     |

### Utilities

| Package                                  | Description                             |
| ---------------------------------------- | --------------------------------------- |
| [@real-router/helpers](packages/helpers) | Route comparison and checking utilities |

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
- **Middleware** — Navigation pipeline customization

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
