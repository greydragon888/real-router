# @real-router/rsc-server-plugin

[![npm](https://img.shields.io/npm/v/@real-router/rsc-server-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rsc-server-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/rsc-server-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rsc-server-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/rsc-server-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/rsc-server-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Per-route `ReactNode` (RSC payload) loading for [Real-Router](https://github.com/greydragon888/real-router). Intercepts `start()` to load Server Components before Flight rendering. **Bundler-agnostic** — works with `@vitejs/plugin-rsc`, `react-server-dom-webpack`, `react-server-dom-turbopack`, `react-server-dom-parcel`.

```typescript
// Without plugin: manual per-route Server Component dispatch
const state = await router.start(url);
const node = await getNodeForRoute(state.name, state.params); // manual

// With plugin:
router.usePlugin(rscServerPluginFactory(loaders));
const state = await router.start(url);
const node = state.context.rsc; // resolved automatically
```

## Installation

```bash
npm install @real-router/rsc-server-plugin
```

**Peer dependencies:** `@real-router/core`, `react` (>=19.0.0). No bundler dependency — the caller picks the Flight renderer.

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { rscServerPluginFactory } from "@real-router/rsc-server-plugin";
import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";

const loaders: RscLoaderFactoryMap = {
  "users.profile": () => async (params) => {
    const user = await fetchUser(params.id);
    return <UserProfile user={user} />;
  },
  home: () => () => <HomePage />,
};

const baseRouter = createRouter(routes, { defaultRoute: "home", allowNotFound: true });

// Per-request SSR
const router = cloneRouter(baseRouter, { db: requestDb });
router.usePlugin(rscServerPluginFactory(loaders));

const state = await router.start(req.url);

// 1) Pipe RSC Flight payload (the bundler-specific renderer is *yours*)
if (state.context.rsc) {
  const flightStream = renderToReadableStream(state.context.rsc);
  // … pipe to HTTP response or inline-inject into HTML
}

// 2) Serialize state for client hydration — strip "rsc" (not JSON-serializable)
const ssrState = serializeRouterState(state, { excludeContext: ["rsc"] });

router.dispose();
```

## Configuration

Loaders are keyed by **route name** (not path). Each value is a **factory function** `(router, getDependency) => loaderFn` returning the compiled loader. The factory runs once at plugin registration; the returned loader is cached.

```typescript
import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";

const loaders: RscLoaderFactoryMap = {
  home: () => () => <HomePage />,                         // sync ReactNode
  "users.profile": () => async (params) => {              // async ReactNode
    const user = await fetchUser(params.id);
    return <UserProfile user={user} />;
  },
  "posts.list": (_router, getDep) => async () => {        // DI via getDependency
    const db = getDep("db");
    const posts = await db.posts.findAll();
    return <PostsList posts={posts} />;
  },
};
```

Routes without a matching loader leave `state.context.rsc` as `undefined`.

## Why `ReactNode`, not Flight bytes?

The plugin publishes a `ReactNode`, not a pre-rendered Flight `Uint8Array`. This keeps the plugin:

- **Bundler-agnostic** — `react-server-dom-{webpack,turbopack,parcel,esm}` have incompatible `renderToReadableStream` signatures; the caller picks the right one
- **Streaming-friendly** — Flight rendering happens out-of-band, in parallel with HTML SSR
- **Aligned with industry** — both React Router 7 (`unstable_RSCStaticRouter`) and TanStack Start (`renderServerComponent`) use the same model

The Flight render itself is one line:

```typescript
const flight = renderToReadableStream(state.context.rsc);
```

## Serialization

`state.context.rsc` is a `ReactNode` tree (functions, symbols) and cannot be JSON-serialized. Use `serializeRouterState`'s `excludeContext` option to strip it before client transport:

```typescript
import { serializeRouterState } from "@real-router/core/utils";

const ssrJson = serializeRouterState(state, { excludeContext: ["rsc"] });
// JSON contains state.context.data and other namespaces, but not state.context.rsc
```

## SSR-Only by Design

This plugin intercepts `start()` only — not `navigate()`. In SSR, the flow is:

```
cloneRouter → usePlugin → start(url) → ReactNode resolved → state.context.rsc
                                                                    ↓
                                                  renderToReadableStream(node)
                                                                    ↓
                                                          Flight stream → HTTP
```

Client-side data fetching is the application's responsibility (React Query, Suspense, RSC `/__rsc` endpoint).

## Cleanup

```typescript
const unsubscribe = router.usePlugin(rscServerPluginFactory(loaders));

// Later — releases "rsc" namespace claim and stops the start interceptor
unsubscribe();
```

In SSR, `router.dispose()` handles cleanup automatically.

## Example

- [examples/web/react/ssr-rsc](../../examples/web/react/ssr-rsc) — End-to-end dogfooding example: Express + `@vitejs/plugin-rsc` + this plugin, with Flight injection, client navigation via `/__rsc?route=…`, and revalidation. 5-scenario Playwright suite covering initial HTML load, client nav, revalidation, 404, and per-request isolation under concurrent load.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [INVARIANTS.md](INVARIANTS.md) — Property-based invariants
- [Wiki: RSC Integration](https://github.com/greydragon888/real-router/wiki/RSC-Integration) — End-to-end integration guide

## Related Packages

| Package                                                                                     | Description                                              |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                        | Core router (required peer dependency)                   |
| [@real-router/ssr-data-plugin](https://www.npmjs.com/package/@real-router/ssr-data-plugin)  | Sibling plugin for plain JSON data (`state.context.data`) |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                      | React bindings                                           |

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
