# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2025-01-20

### Added

Initial release of Real-Router — a complete rewrite and evolution of the router6 project.

#### Public Packages

| Package                                 | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| `@real-router/core`                     | Core router implementation                      |
| `@real-router/react`                    | React integration (Provider, hooks, components) |
| `@real-router/browser-plugin`           | Browser history and URL synchronization         |
| `@real-router/logger-plugin`            | Development logging with transition tracking    |
| `@real-router/persistent-params-plugin` | Parameter persistence across navigations        |
| `@real-router/helpers`                  | Route comparison and checking utilities         |

#### Core Features

- **TypeScript-first** design with full type safety
- **O(1) route lookup** using Map-based data structures
- **Immutable state** architecture
- **Modern ESM/CJS** builds with tree-shaking support
- **Plugin architecture** for extensibility
- **Middleware support** for navigation pipeline customization
- **Lifecycle guards** (`canActivate` / `canDeactivate`)
- **Observable interface** compatible with RxJS

#### React Integration

- `RouterProvider` — context provider for router instance
- `useRouter` — access router instance
- `useRoute` — subscribe to route changes
- `useRouteNode` — optimized subscription for specific route segments
- `Link` / `ConnectedLink` — navigation components

#### Browser Plugin

- History API integration (pushState / replaceState)
- Hash routing support
- Popstate event handling
- URL building and matching utilities

### Changed

- Renamed all packages from `router6-*` to `@real-router/*`
- Renamed `browserPlugin` to `browserPluginFactory`
- Renamed `loggerPlugin` factory to `loggerPluginFactory`
- Renamed `persistentParamsPlugin` to `persistentParamsPluginFactory`
- Source directory renamed from `modules/` to `src/`

### Migration from router6

If you're migrating from router6 1.0.0:

```diff
- import { createRouter } from "router6";
- import browserPlugin from "router6-plugin-browser";
- import { RouterProvider, useRoute } from "react-router6";
+ import { createRouter } from "@real-router/core";
+ import { browserPluginFactory } from "@real-router/browser-plugin";
+ import { RouterProvider, useRoute } from "@real-router/react";

  const router = createRouter(routes);
- router.usePlugin(browserPlugin());
+ router.usePlugin(browserPluginFactory());
```

---

## History

Real-Router evolved from the router6 project, which was itself a complete rewrite of [router5](https://github.com/router5/router5).

### router6 1.0.0 (2025-01-18)

The final version of router6 before renaming to Real-Router. Key achievements:

- **1.8x to 22x faster** hot-path operations compared to router5
- **O(1) route lookup** instead of O(n) linear search
- Complete TypeScript rewrite with strict type checking
- Modern build system with ESM and CommonJS support

### Acknowledgments

Real-Router is inspired by the declarative routing philosophy of [router5](https://github.com/router5/router5) by Thomas Roch.
