# @real-router/types

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

TypeScript type definitions for Real-Router ecosystem. Provides shared types used by all `@real-router/*` packages.

## Installation

This package is automatically installed as a dependency of `@real-router/core`. Direct installation is only needed for advanced use cases.

```bash
npm install @real-router/types
```

## Usage

```typescript
// Most users should import types from @real-router/core
import type { Router, State, Params } from "@real-router/core";

// Direct import is available for type-only scenarios
import type { State, Params, NavigationOptions } from "@real-router/types";
```

## Exported Types

### Core Router Types

| Type | Description |
|------|-------------|
| `Router<D>` | Full router interface with navigation, lifecycle, and plugin management |
| `Navigator` | Minimal safe subset of Router methods for passing to components |
| `State<P>` | Current route state with name, params, and metadata |
| `Params` | Route parameters object (string key-value pairs) |
| `NavigationOptions` | Options for navigation (e.g., replace, skipGuards) |
| `RouterError` | Error thrown during navigation failures |

### Lifecycle & Guards

| Type | Description |
|------|-------------|
| `GuardFn` | `(toState: State, fromState?: State, signal?: AbortSignal) => boolean \| Promise<boolean>` — route activation/deactivation guard |
| `GuardFnFactory<D>` | Factory function that creates a GuardFn with dependency injection |

### Subscription & Listeners

| Type | Description |
|------|-------------|
| `SubscribeFn` | `(state: SubscribeState) => void` — callback for route changes via `router.subscribe()` |
| `SubscribeState` | `{ route: State, previousRoute?: State }` — argument passed to SubscribeFn |
| `LeaveFn` | `(state: LeaveState) => void` — callback for leave events via `router.subscribeLeave()` |
| `LeaveState` | `{ route: State, nextRoute: State }` — argument passed to LeaveFn |
| `Unsubscribe` | `() => void` — function to unsubscribe from listeners |

### Plugin System

| Type | Description |
|------|-------------|
| `Plugin` | Plugin interface with optional lifecycle hooks |
| `PluginFactory<D>` | Factory function that creates a Plugin with dependency injection |
| `Plugin.onTransitionLeaveApprove` | Optional hook fired after leave guard confirms, before activation guards |

### Route Configuration

| Type | Description |
|------|-------------|
| `Route<D>` | Route configuration with name, path, guards, and children |
| `RouteConfigUpdate<D>` | Options for updating route configuration at runtime |
| `Options` | Router initialization options (defaults, encoding, limits) |

### Navigator Methods

| Method | Description |
|--------|-------------|
| `Navigator.navigate()` | Navigate to a named route with optional params |
| `Navigator.getState()` | Get current route state |
| `Navigator.isActiveRoute()` | Check if a route is currently active |
| `Navigator.canNavigateTo()` | Check if navigation to a route is allowed |
| `Navigator.subscribe()` | Subscribe to route changes |
| `Navigator.subscribeLeave()` | Subscribe to leave events (fires after guard confirms) |
| `Navigator.isLeaveApproved()` | Check if the current leave transition was approved |

## Why This Package?

This package solves TypeScript type compatibility issues between `@real-router/*` packages:

- **Single source of truth** — all packages share identical type definitions
- **No type duplication** — types are not inlined into each package's `.d.ts`
- **Module augmentation works** — plugins can extend Router interface correctly

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React bindings
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser History API

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
