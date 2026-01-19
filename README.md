# Router6

[![npm version](https://badge.fury.io/js/router6.svg)](https://www.npmjs.com/package/router6)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> A simple, powerful, view-agnostic, modular and extensible router for JavaScript applications.

Router6 is a **complete rewrite** of [router5](https://github.com/router5/router5), built from the ground up with modern JavaScript, TypeScript-first design, and significant performance improvements.

## Why Router6?

### Performance Improvements

Router6 delivers **1.8x to 22x faster** hot-path operations compared to router5:

| Operation | Improvement |
|-----------|-------------|
| Route lookup | O(n) → O(1) Map operations |
| Path matching | O(n × regex) → O(segments) trie traversal |
| Event listener removal | O(n) → O(1) |
| Memory consumption | 3-70x lower in typical SPAs |

### Modern Architecture

- **TypeScript-first**: Complete elimination of `any` types, full generics support
- **Immutable state**: No more mutable state vulnerabilities
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
npm install router6
# or
pnpm add router6
# or
yarn add router6
```

## Quick Start

```typescript
import { createRouter } from "router6";
import { browserPlugin } from "router6-plugin-browser";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
];

const router = createRouter(routes);

router.usePlugin(browserPlugin());

router.start();

// Navigate programmatically
router.navigate("users.profile", { id: "123" });
```

### With React

```tsx
import { RouterProvider, useRoute, Link } from "react-router6";

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
  </RouterProvider>
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

### Public Packages

| Package | Description |
|---------|-------------|
| [router6](./packages/router6) | Core router implementation |
| [react-router6](./packages/react-router6) | React integration (Provider, hooks, components) |
| [router6-plugin-browser](./packages/router6-plugin-browser) | Browser history and URL synchronization |
| [router6-plugin-logger](./packages/router6-plugin-logger) | Debug logging for transitions |
| [router6-plugin-persistent-params](./packages/router6-plugin-persistent-params) | Parameter persistence across navigations |
| [router6-helpers](./packages/router6-helpers) | Route segment testing utilities |

### Internal Packages

| Package | Description |
|---------|-------------|
| [router6-types](./packages/router6-types) | Shared TypeScript type definitions |
| [type-guards](./packages/type-guards) | Runtime type validation utilities |
| [route-tree](./packages/route-tree) | Route tree data structure and operations |
| [search-params](./packages/search-params) | Query string parsing and building |

## Documentation

Full documentation is available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki).

### Getting Started

- [Introduction](https://github.com/greydragon888/router6/wiki) — overview and concepts
- [Defining Routes](https://github.com/greydragon888/router6/wiki/Defining-Routes) — route configuration
- [Path Syntax](https://github.com/greydragon888/router6/wiki/Path-Syntax) — URL patterns and parameters

### Core Concepts

- [Navigation](https://github.com/greydragon888/router6/wiki/Navigation) — programmatic navigation
- [State](https://github.com/greydragon888/router6/wiki/State) — router state management
- [Plugins](https://github.com/greydragon888/router6/wiki/Plugins) — extending router functionality
- [Middleware](https://github.com/greydragon888/router6/wiki/Middleware) — navigation pipeline

### API Reference

- [createRouter](https://github.com/greydragon888/router6/wiki/createRouter) — factory function
- [Router Methods](https://github.com/greydragon888/router6/wiki/Router) — full API reference
- [React Hooks](https://github.com/greydragon888/router6/wiki/React-Hooks) — useRouter, useRoute, useRouteNode

## Migration from Router5

Router6 introduces some breaking changes from router5:

```typescript
// router5
import createRouter from "router5";
const router = createRouter(routes);
router.add({ name: "new", path: "/new" });

// router6
import { createRouter } from "router6";
const router = createRouter(routes);
router.addRoute({ name: "new", path: "/new" });
```

Key differences:
- Named exports instead of default exports
- `addRoute()` instead of `add()`
- Unified trailing slash handling
- Restructured plugin API

See the [Migration Guide](https://github.com/greydragon888/router6/wiki/Migration-from-Router5) for details.

## Development

This is a pnpm monorepo using Turbo for task orchestration.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a pull request.

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
