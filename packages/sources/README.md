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

| Factory                                                 | Returns                                                  | Cache                                         |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `createRouteSource(router)`                             | `RouterSource<{ route, previousRoute }>`                 | not cached                                    |
| `createRouteNodeSource(router, node)`                   | `RouterSource<{ route, previousRoute }>`                 | per-router + per-nodeName                     |
| `createActiveRouteSource(router, name, params?, search?, opts?)` | `RouterSource<boolean>`                                  | per-router + canonical-args                   |
| `createTransitionSource(router)`                        | `RouterSource<{ isTransitioning, isLeaveApproved, toRoute, fromRoute }>` | not cached (advanced)         |
| `getTransitionSource(router)`                           | same as above                                            | **per-router** — recommended for integrations |
| `createErrorSource(router)`                             | `RouterSource<{ error, toRoute, fromRoute, version }>`   | not cached (advanced)                         |
| `getErrorSource(router)`                                | same as above                                            | **per-router** — recommended for integrations |
| `primeErrorSource(router)`                              | `void` (side-effect only)                                | eagerly create+subscribe `getErrorSource` if the router is registered, else a safe no-op — adapters call it at `RouterProvider` mount so a boundary mounting after an error still sees it (#778) |
| `createDismissableError(router)`                        | `RouterSource<{ error, toRoute, fromRoute, version, resetError }>` | **per-router** — dismissal-aware error source for RouterErrorBoundary-style UIs |
| `createActiveNameSelector(router)`                      | `ActiveNameSelector` (selector API — `subscribe(name, listener)` / `isActive(name)` / `destroy`; **not** a `RouterSource<T>` — no `getSnapshot()`) | **per-router** — O(1) active-name checker for Link fast-path |

Plus utilities: `DEFAULT_ACTIVE_OPTIONS`, `normalizeActiveOptions(opts?)`, `canonicalJson(value)`, and the `ActiveNameSelector` type.

Plus the framework-agnostic route-window guards (#1435) — **not sources** (no `router`, no cache, no subscription): `createRouteEnterGate()` returns a stateful `(route, previousRoute, skipSameRoute) => RouteEnterContext | null` decision closure, and `guardLeaveListener(handler, { skipSameRoute? })` wraps a handler into a core `subscribeLeave` listener. Every adapter's `useRouteEnter` / `useRouteExit` delegates to these so the guard logic lives (and is tested) in one place.

All factories return a `RouterSource<T>` **except `createActiveNameSelector`**, which returns an `ActiveNameSelector` (see Source Factories table above):

```typescript
interface RouterSource<T> {
  subscribe(listener: () => void): () => void; // useSyncExternalStore-compatible
  getSnapshot(): T; // current value, synchronous
  destroy(): void; // no-op for cached wrappers; real teardown for create*
}

// createActiveNameSelector is the exception — its `subscribe` accepts a route-name
// argument and the active-state check lives on `isActive(name)` (no `getSnapshot()`).
interface ActiveNameSelector {
  subscribe(routeName: string, listener: () => void): () => void;
  isActive(routeName: string): boolean;
  destroy(): void;
}
```

### Cached vs non-cached factories

Cached factories (`createRouteNodeSource`, `createActiveRouteSource`, `getTransitionSource`, `getErrorSource`) share a single source across all consumers of the same router. Multiple `subscribe`/`unsubscribe` pairs on the same instance share one router subscription. `destroy()` on the returned wrapper is a **no-op** — the underlying source lives as long as the router (the `WeakMap` entry releases on router GC).

Non-cached factories (`createRouteSource`, `createTransitionSource`, `createErrorSource`) return a fresh instance every call with real teardown on `destroy()` — use when you need an isolated source.

All route-state sources (`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource`) deduplicate via `stabilizeState`: same-path non-reload transitions preserve the snapshot reference and skip listener notifications. Reload navigations bypass dedup. See [INVARIANTS.md](./INVARIANTS.md) #6.

### Lazy vs Eager Subscription

- `createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource` — **lazy**: subscribe to the router on first listener, unsubscribe when all removed
- `createTransitionSource` / `getTransitionSource` — **eager**: subscribes immediately (needs to track `TRANSITION_START`)
- `createErrorSource` / `getErrorSource` — **eager**: subscribes immediately (needs to track `TRANSITION_ERROR`)

### `createActiveRouteSource` Options

```typescript
const source = createActiveRouteSource(router, "users", undefined, undefined, {
  strict: false, // default: false — match descendants too
  ignoreQueryParams: true, // default: true
  hash: undefined, // default: undefined — ignore URL fragment.
  //                 string → match iff state.context.url.hash equals it (#532).
});
```

| Option              | Type        | Default       | Effect                                                                                                                                                                                                                                                       |
| ------------------- | ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strict`            | `boolean`   | `false`       | When `false`, parent route is active when the current route is a descendant; when `true`, only an exact name match is active.                                                                                                                                  |
| `ignoreQueryParams` | `boolean`   | `true`        | Whether to drop query-string params before comparing.                                                                                                                                                                                                          |
| `hash`              | `string`    | `undefined`   | When set, source is active iff route matches **and** `state.context.url.hash` equals this value. Requires a URL-publishing plugin (browser/navigation); under hash-plugin or memory-plugin (no `context.url` namespace), a **non-empty** hash is always `false`, while `hash: ""` still matches an active route (the missing namespace reads as "no fragment", #532). |

`params` and `search` are each hashed with `canonicalJson()`, so `{a: 1, b: 2}` and `{b: 2, a: 1}` hit the same cache entry. `BigInt`/circular refs fall back to a fresh non-cached source with a working `destroy()` — call it to release the router subscription.

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
import { getTransitionSource } from "@real-router/sources";

// getTransitionSource — per-router cached. Safe to call destroy() multiple
// times; shared across all consumers in the same process.
const source = getTransitionSource(router);

source.subscribe(() => {
  const { isTransitioning, isLeaveApproved, toRoute, fromRoute } =
    source.getSnapshot();
  if (isTransitioning) {
    showSpinner();
  } else {
    hideSpinner();
  }
});
```

### Error Tracking

```typescript
import { getErrorSource } from "@real-router/sources";

const source = getErrorSource(router);

source.subscribe(() => {
  const { error, toRoute } = source.getSnapshot();
  if (error) {
    console.error(`Navigation to ${toRoute?.name} failed: ${error.code}`);
  }
});
```

**Priming for boundaries that mount late.** `getErrorSource` is eager (subscribes on creation), but a `RouterErrorBoundary` that creates its source lazily on mount can miss an error that fired _before_ it mounted (a lazy app shell, a failed boot navigation). Adapters call `primeErrorSource(router)` at `RouterProvider` mount so the per-router error source exists from that point and the boundary catches up on first subscribe (#778). It is a safe no-op on a router-like with no internals (test stub / `Object.create` clone):

```typescript
import { primeErrorSource } from "@real-router/sources";

// At Provider mount — creates + subscribes getErrorSource if the router is
// registered, else a no-op. Does not throw.
primeErrorSource(router);
```

**Limitation — errors before the _first_ subscriber surface on the promise, not the source.** The error source tracks errors as transient _events_, not persistent state — core retains no "last error" to replay, so an error that fires before **any** subscriber (before `primeErrorSource` / the Provider mounts — e.g. an `await router.start()` that rejects during boot) is not reconstructable from the source afterward. Handle those on the navigation promise itself:

```typescript
try {
  await router.start();
} catch (err) {
  // boot-time navigation errors surface here, not on a not-yet-mounted boundary
}
```

This is by design (#1215): the source is a live event stream, symmetric with `createTransitionSource`, not a `getState()`-style snapshot of the last error.

## Documentation

- API reference and usage: [Wiki — sources-package](https://github.com/greydragon888/real-router/wiki/sources-package)
- Adapter integration guide (Link fast-path migration recipe, snapshot bridging patterns): [Wiki — sources-adapter-guide](https://github.com/greydragon888/real-router/wiki/sources-adapter-guide)

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
