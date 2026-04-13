# @real-router/ssr-data-plugin

[![npm](https://img.shields.io/npm/v/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/ssr-data-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/ssr-data-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Per-route data loading for SSR with [Real-Router](https://github.com/greydragon888/real-router). Intercepts `start()` to load data before server rendering.

```typescript
// Without plugin:
const state = await router.start(url);
const data = await loadRouteData(state.name, state.params); // manual

// With plugin:
router.usePlugin(ssrDataPluginFactory(loaders));
const state = await router.start(url);
const data = state.context.data; // loaded automatically
```

## Installation

```bash
npm install @real-router/ssr-data-plugin
```

**Peer dependencies:** `@real-router/core`, `@real-router/types`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

const loaders: DataLoaderFactoryMap = {
  "users.profile": () => async (params) => fetchUser(params.id),
  "users.list": () => async () => fetchUsers(),
};

// Base router — created once
const baseRouter = createRouter(routes, { defaultRoute: "home", allowNotFound: true });

// Per-request SSR
const router = cloneRouter(baseRouter, { isAuthenticated: true });
router.usePlugin(ssrDataPluginFactory(loaders));

const state = await router.start(url);
const data = state.context.data; // data loaded by matching loader

const html = renderToString(<App />);
router.dispose();
```

## Configuration

Loaders are keyed by **route name** (not path). Each value is a **factory function** `(router, getDependency) => loaderFn` that receives the router instance and a dependency getter. The factory runs once at plugin registration; the returned loader is cached. Each loader receives route `params` and returns a `Promise`:

```typescript
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

const loaders: DataLoaderFactoryMap = {
  home: () => async () => ({ featured: await fetchFeatured() }),
  "users.profile": () => async (params) => ({ user: await fetchUser(params.id) }),
  "users.list": () => async () => ({ users: await fetchUsers() }),
};
```

Routes without a matching loader produce no data — `state.context.data` is `undefined`.

## Accessing Data

After `await router.start(url)`, data is available on the returned state's context:

```typescript
const state = await router.start(url);
const data = state.context.data; // loaded data, or undefined if no loader matched
```

The plugin claims the `"data"` namespace on `state.context` via the [claim-based API](https://github.com/greydragon888/real-router/wiki/plugin-architecture). Module augmentation on `@real-router/types` provides type safety for `state.context.data`.

## SSR-Only by Design

This plugin intercepts `start()` only — not `navigate()`. In SSR, the flow is:

```
cloneRouter → usePlugin → start(url) → data loaded → state.context.data → renderToString
```

Client-side navigation and data fetching is the application's responsibility (React Query, Suspense, `useEffect`, etc.).

## Cleanup

```typescript
const unsubscribe = router.usePlugin(ssrDataPluginFactory(loaders));

// Later — releases "data" namespace claim and stops data loading
unsubscribe();
```

In SSR, `router.dispose()` handles cleanup automatically.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [SSR Example](../../examples/ssr-react) — Full working example with React + Vite

## Related Packages

| Package                                                                                  | Description                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                     | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration        |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                   | React bindings                         |

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
