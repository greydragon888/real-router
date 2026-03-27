# @real-router/sources

[![npm](https://img.shields.io/npm/v/@real-router/sources.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/sources)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/sources.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/sources)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/sources&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/sources&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Framework-agnostic subscription layer for [Real-Router](https://github.com/greydragon888/real-router). Reactive primitives compatible with `useSyncExternalStore` and vanilla JS.

Used internally by [`@real-router/react`](https://www.npmjs.com/package/@real-router/react). Use this package directly when building integrations for other frameworks or vanilla JS applications.

## Installation

```bash
npm install @real-router/sources
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users/:id" },
]);

await router.start("/");

const source = createRouteSource(router);
const unsubscribe = source.subscribe(() => {
  console.log("Route:", source.getSnapshot().route?.name);
});
```

## Source Factories

| Factory                                                 | Snapshot                                  | Updates when                                        |
| ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `createRouteSource(router)`                             | `{ route, previousRoute }`                | Every navigation                                    |
| `createRouteNodeSource(router, node)`                   | `{ route, previousRoute }`                | Only when node activates/deactivates                |
| `createActiveRouteSource(router, name, params?, opts?)` | `boolean`                                 | Route active status changes                         |
| `createTransitionSource(router)`                        | `{ isTransitioning, toRoute, fromRoute }` | Transition start/end/cancel/error                   |
| `createErrorSource(router)`                             | `{ error, toRoute, fromRoute, version }`  | Navigation error (guard rejection, route not found) |

All factories return a `RouterSource<T>`:

```typescript
interface RouterSource<T> {
  subscribe(listener: () => void): () => void; // useSyncExternalStore-compatible
  getSnapshot(): T; // current value, synchronous
  destroy(): void; // teardown, remove router subscription
}
```

### Lazy vs Eager Subscription

- `createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource` — **lazy**: subscribe to the router on first listener, unsubscribe when all removed
- `createTransitionSource` — **eager**: subscribes immediately (needs to track `TRANSITION_START`)
- `createErrorSource` — **eager**: subscribes immediately (needs to track `TRANSITION_ERROR`)

### `createActiveRouteSource` Options

```typescript
const source = createActiveRouteSource(router, "users", undefined, {
  strict: false, // default: false — match descendants too
  ignoreQueryParams: true, // default: true
});
```

## Usage Examples

### With React (`useSyncExternalStore`)

```tsx
import { useSyncExternalStore } from "react";
import { createRouteSource } from "@real-router/sources";

const source = createRouteSource(router);

function CurrentRoute() {
  const { route } = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return <p>Current route: {route?.name}</p>;
}
```

### With Vanilla JS

```typescript
import { createRouteNodeSource } from "@real-router/sources";

// Only fires when navigating within the "users" subtree
const source = createRouteNodeSource(router, "users");

const unsubscribe = source.subscribe(() => {
  const { route } = source.getSnapshot();
  console.log("Users section:", route?.name);
});

unsubscribe(); // automatically unsubscribes from router
```

### Transition Tracking

```typescript
import { createTransitionSource } from "@real-router/sources";

const source = createTransitionSource(router);

source.subscribe(() => {
  const { isTransitioning, toRoute, fromRoute } = source.getSnapshot();
  if (isTransitioning) {
    showSpinner();
  } else {
    hideSpinner();
  }
});
```

### Error Tracking

```typescript
import { createErrorSource } from "@real-router/sources";

const source = createErrorSource(router);

source.subscribe(() => {
  const { error, toRoute } = source.getSnapshot();
  if (error) {
    console.error(`Navigation to ${toRoute?.name} failed: ${error.code}`);
  }
});
```

## Documentation

Full documentation: [Wiki — sources](https://github.com/greydragon888/real-router/wiki/sources-package)

## Related Packages

| Package                                                                | Description                                 |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)   | Core router (required dependency)           |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react) | React integration (uses sources internally) |
| [@real-router/rx](https://www.npmjs.com/package/@real-router/rx)       | Observable API (`state$`, `events$`)        |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
