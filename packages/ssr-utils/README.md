# @real-router/ssr-utils

[![npm](https://img.shields.io/npm/v/@real-router/ssr-utils.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-utils)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/ssr-utils.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-utils)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/ssr-utils&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/ssr-utils&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Router-level SSR/SSG/hydration helpers for [Real-Router](https://github.com/greydragon888/real-router). Serialize state for transport, hydrate on the client, enumerate static paths, isolate per-request router clones.

## Installation

```bash
npm install @real-router/ssr-utils
```

Requires `@real-router/core` as a peer dependency.

## Quick Start

```typescript
// Server
import { serializeRouterState } from "@real-router/ssr-utils";

const state = await router.start(req.url);
const html = `<script>window.__SSR_STATE__=${serializeRouterState(state)}</script>`;

// Client
import { hydrateRouter } from "@real-router/ssr-utils";

await hydrateRouter(router, window.__SSR_STATE__);
```

## API

| Function | Description |
|----------|--------------|
| `serializeState(data, opts?)` | XSS-safe JSON serialization for embedding in HTML `<script>` tags |
| `serializeRouterState(state, opts?)` | XSS-safe `State` serializer — strips `transition`, keeps `context` |
| `hydrateRouter(router, source, opts?)` | Hydrate a fresh router from server-serialized state |
| `getStaticPaths(router, entries?)` | Enumerate leaf routes and build URLs for SSG pre-rendering |
| `createRequestScope(request, base, deps?)` | Per-request SSR isolation via a cloned router |

### `serializeRouterState(state, options?)`

```typescript
const json = serializeRouterState(state);

// Strip a non-JSON-serializable plugin namespace (e.g. an RSC ReactNode tree)
const json = serializeRouterState(state, { excludeContext: ["rsc"] });

// Non-JSON types (Date / Map / Set / RegExp / BigInt) via devalue
import * as devalue from "devalue";
const json = serializeRouterState(state, { serialize: devalue.stringify });
```

### `hydrateRouter(router, source, options?)`

```typescript
const router = createAppRouter();
router.usePlugin(browserPluginFactory());
await hydrateRouter(router, window.__SSR_STATE__);

// Pair with a custom serializer
await hydrateRouter(router, window.__SSR_STATE__, { deserialize: devalue.parse });
```

SSR loader plugins (`@real-router/ssr-data-plugin`, `@real-router/rsc-server-plugin`)
automatically skip their post-hydration re-fetch when the server-resolved
value is already present in the hydrated state — no extra wiring needed.

### `getStaticPaths(router, entries?)`

```typescript
const paths = await getStaticPaths(router);
// ["/", "/about", "/users/1", "/users/2", ...]

// Provide per-route param sets for dynamic segments
const paths = await getStaticPaths(router, {
  "users.profile": async () => [{ id: "1" }, { id: "2" }],
});
```

### `createRequestScope(request, base, deps?)`

```typescript
export async function render(url: string, req: IncomingMessage) {
  const scope = createRequestScope(req, baseRouter, { currentUser });
  try {
    scope.router.usePlugin(ssrDataPluginFactory(loaders));
    return await renderShell(scope.router, url);
  } finally {
    await scope.dispose();
  }
}

// `await using` (Node 24+, Bun, Deno, modern browsers)
export async function render(url: string, req: IncomingMessage) {
  await using scope = createRequestScope(req, baseRouter, { currentUser });
  return await renderShell(scope.router, url);
}
```

Binds an `AbortSignal` to the request lifetime (Node `"close"` event / Web
`request.signal`), injected into the clone's dependencies under
`abortSignal` — loaders read `getDep("abortSignal")` for cooperative
cancellation.

## Documentation

Full documentation: [Wiki — ssr-utils](https://github.com/greydragon888/real-router/wiki/ssr-utils)

## Related Packages

| Package | Description |
|---------|-------------|
| [@real-router/core](https://www.npmjs.com/package/@real-router/core) | Core router |
| [@real-router/ssr-data-plugin](https://www.npmjs.com/package/@real-router/ssr-data-plugin) | Per-route data loading — composes with the hydration scratchpad |
| [@real-router/rsc-server-plugin](https://www.npmjs.com/package/@real-router/rsc-server-plugin) | Per-route `ReactNode` (RSC) loading — same composition |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
