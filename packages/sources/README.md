# @real-router/sources

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Framework-agnostic subscription layer for Real-Router. Subscribe to router state slices with automatic filtering and deduplication. Provides minimal reactive primitives for building UI bindings.

## Installation

```bash
npm install @real-router/sources
# or
pnpm add @real-router/sources
# or
yarn add @real-router/sources
# or
bun add @real-router/sources
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
]);

router.start();

const source = createRouteSource(router);

// Subscribe to route changes
const unsubscribe = source.subscribe(() => {
  console.log("Route:", source.getSnapshot().route?.name);
});

// Clean up when done
unsubscribe();
```

---

## API

### `createRouteSource(router)`

Creates a source for the full router state. Subscribes to the router on the first listener and unsubscribes when all listeners are removed (lazy-connection pattern).\
`router: Router` — router instance\
Returns: `RouterSource<RouteSnapshot>`

```typescript
const source = createRouteSource(router);
```

---

### `createRouteNodeSource(router, nodeName)`

Creates a source scoped to a specific route node. Only updates when the node is in the transition path, avoiding unnecessary re-renders for unrelated navigations. Uses a lazy-connection pattern: subscribes to the router on the first listener and unsubscribes when all listeners are removed.\
`router: Router` — router instance\
`nodeName: string` — route node name to scope updates to\
Returns: `RouterSource<RouteNodeSnapshot>`

```typescript
const source = createRouteNodeSource(router, "users");
```

---

### `createActiveRouteSource(router, routeName, params?, options?)`

Creates a source that tracks whether a specific route is active. Returns a boolean snapshot.\
`router: Router` — router instance\
`routeName: string` — route name to check\
`params?: Record<string, unknown>` — optional params to match\
`options?: ActiveRouteSourceOptions` — matching options\
Returns: `RouterSource<boolean>`

```typescript
const source = createActiveRouteSource(router, "users.profile", { id: "123" });
const source = createActiveRouteSource(router, "users", undefined, {
  strict: false,
  ignoreQueryParams: true,
});
```

Call `source.destroy()` when the source is no longer needed.

**Options:**

| Option              | Type      | Default | Description                                                |
| ------------------- | --------- | ------- | ---------------------------------------------------------- |
| `strict`            | `boolean` | `false` | When `true`, only matches the exact route, not descendants |
| `ignoreQueryParams` | `boolean` | `true`  | When `true`, ignores query parameters when matching        |

---

### `createTransitionSource(router)`

Creates a source that tracks the router's transition lifecycle. Updates on `TRANSITION_START`, `TRANSITION_SUCCESS`, `TRANSITION_ERROR`, and `TRANSITION_CANCEL` events. Unlike other sources, this uses eager subscription (subscribes to events immediately, not lazily on first listener).\
`router: Router` — router instance\
Returns: `RouterSource<RouterTransitionSnapshot>`

```typescript
const source = createTransitionSource(router);

source.subscribe(() => {
  const { isTransitioning, toRoute, fromRoute } = source.getSnapshot();
  if (isTransitioning) {
    console.log(`Navigating: ${fromRoute?.name} → ${toRoute?.name}`);
  }
});
```

Call `source.destroy()` when the source is no longer needed.

---

### `RouterSource<T>` Interface

All four factories return a `RouterSource<T>`:

```typescript
interface RouterSource<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  destroy(): void;
}
```

`subscribe` — registers a listener and returns an unsubscribe function. Compatible with `useSyncExternalStore`.\
`getSnapshot` — returns the current snapshot synchronously.\
`destroy` — tears down the source and removes the router subscription.

---

## Types

```typescript
import type {
  RouterSource,
  RouteSnapshot,
  RouteNodeSnapshot,
  RouterTransitionSnapshot,
  ActiveRouteSourceOptions,
} from "@real-router/sources";
```

`RouteSnapshot` — full router state: `{ route: State | undefined, previousRoute: State | undefined }`\
`RouteNodeSnapshot` — node-scoped state: `{ route: State | undefined, previousRoute: State | undefined }`\
`RouterTransitionSnapshot` — transition state: `{ isTransitioning: boolean, toRoute: State | null, fromRoute: State | null }`\
`ActiveRouteSourceOptions` — options for `createActiveRouteSource`: `{ strict?: boolean, ignoreQueryParams?: boolean }`\
`RouterSource<T>` — the source interface returned by all four factories

---

## Usage Examples

### With React (`useSyncExternalStore`)

```typescript
import { useSyncExternalStore } from "react";
import { createRouteSource } from "@real-router/sources";

const source = createRouteSource(router);

function CurrentRoute() {
  const { route } = useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
  );

  return <p>Current route: {route.name}</p>;
}
```

### With Vanilla JS

```typescript
import { createRouteSource } from "@real-router/sources";

const source = createRouteSource(router);

const unsubscribe = source.subscribe(() => {
  const { route, previousRoute } = source.getSnapshot();
  console.log("Navigation:", previousRoute?.name, "->", route.name);
});

// Later, clean up
unsubscribe();
```

### Node-Scoped Updates

```typescript
import { createRouteNodeSource } from "@real-router/sources";

// Only re-renders when navigating within the "users" subtree
const source = createRouteNodeSource(router, "users");

const unsubscribe = source.subscribe(() => {
  const { route } = source.getSnapshot();
  console.log("Users section route:", route?.name);
});

// Later, clean up (automatically unsubscribes from router)
unsubscribe();
```

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration (uses sources internally)
- [@real-router/rx](https://www.npmjs.com/package/@real-router/rx) — Reactive Observable API

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
