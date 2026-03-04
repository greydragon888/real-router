# @real-router/stores

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Framework-agnostic subscription stores for Real-Router. Minimal reactive primitives for building UI bindings.

## Installation

```bash
npm install @real-router/stores
# or
pnpm add @real-router/stores
# or
yarn add @real-router/stores
# or
bun add @real-router/stores
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { createRouteStore } from "@real-router/stores";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" },
]);

router.start();

const store = createRouteStore(router);

// Subscribe to route changes
const unsubscribe = store.subscribe(() => {
  console.log("Route:", store.getSnapshot().route.name);
});

// Clean up when done
unsubscribe();
```

---

## API

### `createRouteStore(router)`

Creates a store for the full router state. Subscribes to the router on the first listener and unsubscribes when all listeners are removed (lazy-connection pattern).\
`router: Router` — router instance\
Returns: `RouterStore<RouteSnapshot>`

```typescript
const store = createRouteStore(router);
```

---

### `createRouteNodeStore(router, nodeName)`

Creates a store scoped to a specific route node. Only updates when the node is in the transition path, avoiding unnecessary re-renders for unrelated navigations.\
`router: Router` — router instance\
`nodeName: string` — route node name to scope updates to\
Returns: `RouterStore<RouteNodeSnapshot>`

```typescript
const store = createRouteNodeStore(router, "users");
```

Call `store.destroy()` when the store is no longer needed.

---

### `createActiveRouteStore(router, routeName, params?, options?)`

Creates a store that tracks whether a specific route is active. Returns a boolean snapshot.\
`router: Router` — router instance\
`routeName: string` — route name to check\
`params?: Record<string, unknown>` — optional params to match\
`options?: ActiveRouteStoreOptions` — matching options\
Returns: `RouterStore<boolean>`

```typescript
const store = createActiveRouteStore(router, "users.profile", { id: "123" });
const store = createActiveRouteStore(router, "users", undefined, {
  strict: false,
  ignoreQueryParams: true,
});
```

Call `store.destroy()` when the store is no longer needed.

**Options:**

| Option              | Type      | Default | Description                                                |
| ------------------- | --------- | ------- | ---------------------------------------------------------- |
| `strict`            | `boolean` | `false` | When `true`, only matches the exact route, not descendants |
| `ignoreQueryParams` | `boolean` | `true`  | When `true`, ignores query parameters when matching        |

---

### `RouterStore<T>` Interface

All three factories return a `RouterStore<T>`:

```typescript
interface RouterStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  destroy(): void;
}
```

`subscribe` — registers a listener and returns an unsubscribe function. Compatible with `useSyncExternalStore`.\
`getSnapshot` — returns the current snapshot synchronously.\
`destroy` — tears down the store and removes the router subscription.

---

## Types

```typescript
import type {
  RouterStore,
  RouteSnapshot,
  RouteNodeSnapshot,
  ActiveRouteStoreOptions,
} from "@real-router/stores";
```

`RouteSnapshot` — full router state: `{ route: State | undefined, previousRoute: State | undefined }`\
`RouteNodeSnapshot` — node-scoped state: `{ route: State | undefined, previousRoute: State | undefined }`\
`ActiveRouteStoreOptions` — options for `createActiveRouteStore`: `{ strict?: boolean, ignoreQueryParams?: boolean }`\
`RouterStore<T>` — the store interface returned by all three factories

---

## Usage Examples

### With React (`useSyncExternalStore`)

```typescript
import { useSyncExternalStore } from "react";
import { createRouteStore } from "@real-router/stores";

const store = createRouteStore(router);

function CurrentRoute() {
  const { route } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  return <p>Current route: {route.name}</p>;
}
```

### With Vanilla JS

```typescript
import { createRouteStore } from "@real-router/stores";

const store = createRouteStore(router);

const unsubscribe = store.subscribe(() => {
  const { route, previousRoute } = store.getSnapshot();
  console.log("Navigation:", previousRoute?.name, "->", route.name);
});

// Later, clean up
unsubscribe();
```

### Node-Scoped Updates

```typescript
import { createRouteNodeStore } from "@real-router/stores";

// Only re-renders when navigating within the "users" subtree
const store = createRouteNodeStore(router, "users");

const unsubscribe = store.subscribe(() => {
  const { route } = store.getSnapshot();
  console.log("Users section route:", route?.name);
});

// Tear down completely when the component unmounts
store.destroy();
```

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration (uses stores internally)
- [@real-router/rx](https://www.npmjs.com/package/@real-router/rx) — Reactive Observable API

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
