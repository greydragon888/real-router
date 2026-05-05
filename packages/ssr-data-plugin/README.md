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

## Typed Loader Errors (`@real-router/ssr-data-plugin/errors`)

The plugin is HTTP-agnostic — it only awaits the loader and writes the result to `state.context.data`. To bridge loader failures to HTTP semantics (404, 30x, 504), import typed error classes from the `errors` subpath and let your handler catch them:

```typescript
import {
  LoaderNotFound,
  LoaderRedirect,
  LoaderTimeout,
  withTimeout,
} from "@real-router/ssr-data-plugin/errors";

const loaders: DataLoaderFactoryMap = {
  "users.profile": () => (params) =>
    withTimeout("users.profile", 250, async () => {
      const user = await fetchUser(params.id);
      if (!user) throw new LoaderNotFound(`user:${params.id}`);
      return { user };
    }),
  "users.legacy": () => (params) => {
    throw new LoaderRedirect(`/users/${params.id}`, 301);
  },
};

// In the handler:
try {
  const state = await router.start(url);
  return renderHtml(state);
} catch (error) {
  if (error?.code === "LOADER_NOT_FOUND") return res.status(404).send("Not Found");
  if (error?.code === "LOADER_REDIRECT") return res.redirect(error.status, error.target);
  if (error?.code === "LOADER_TIMEOUT") return res.status(504).send("Timeout");
  throw error;
}
```

Discriminator is the `code` field — match structurally without `instanceof`. Identical errors are also re-exported from `@real-router/rsc-server-plugin/errors` (same shared source) so RSC apps don't need to add a `ssr-data-plugin` dependency just to throw `LoaderNotFound`.

## Cleanup

```typescript
const unsubscribe = router.usePlugin(ssrDataPluginFactory(loaders));

// Later — releases "data" namespace claim and stops data loading
unsubscribe();
```

In SSR, `router.dispose()` handles cleanup automatically.

## Streaming SSR

Combine with React 19's `<Suspense>` + `use(promise)` for deferred sections that arrive after the shell. The loader resolves critical data; deferred fetches live inside Suspense components and stream in via `renderToReadableStream`. No router-specific wrapper API needed.

See [`examples/web/react/ssr-examples/ssr-streaming/`](../../examples/web/react/ssr-examples/ssr-streaming) for a complete working example, or the [Streaming SSR wiki guide](https://github.com/greydragon888/real-router/wiki/Streaming-SSR) for the design pattern.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [SSR Example](../../examples/web/react/ssr-examples/ssr) — Full working example (classical, non-streaming)
- [Streaming SSR Example](../../examples/web/react/ssr-examples/ssr-streaming) — React 19 native streaming with `<Suspense>` + `use(promise)`
- [Streaming SSR wiki guide](https://github.com/greydragon888/real-router/wiki/Streaming-SSR)

## Related Packages

| Package                                                                                          | Description                                                                                  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                             | Core router (required peer dependency)                                                       |
| [@real-router/rsc-server-plugin](https://www.npmjs.com/package/@real-router/rsc-server-plugin)   | Sibling plugin — same `start()` interceptor pattern but for `ReactNode` (RSC payload). Runs side-by-side on the same router with distinct namespaces (`data` vs `rsc`). |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin)         | Browser History API integration                                                              |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                           | React bindings                                                                               |

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
