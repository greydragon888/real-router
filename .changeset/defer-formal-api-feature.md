---
"@real-router/ssr-data-plugin": minor
---

`defer()` formal API for critical/deferred split (#610)

Loaders may now return `defer({ critical, deferred })` to split per-route data
into a critical bundle (resolved before the shell renders) and a record of
deferred promises (streamed after as they resolve). This is the standard
pattern shipped by SvelteKit `streamed`, Remix / RR7 `defer()`, and TanStack
Start `defer()`.

```ts
import { defer } from "@real-router/ssr-data-plugin";
import { LoaderNotFound } from "@real-router/ssr-data-plugin/errors";

export const loaders = {
  "products.detail": () => (params) => {
    const product = getProduct(params.id);
    if (!product) throw new LoaderNotFound(`product:${params.id}`);

    return defer({
      critical: { product },
      deferred: {
        reviews: fetchReviews(params.id),
        related: fetchRelated(params.id),
      },
    });
  },
};
```

Plugin output:

- `state.context.data` — critical payload (existing contract).
- `state.context.ssrDataDeferred` — `Record<string, Promise<unknown>>` of the
  deferred promises (server) or registry-backed promises reconstructed from
  the inline settle scripts (client post-hydration).
- `state.context.ssrDataDeferredKeys` — `string[]` of declared keys, included
  in the SSR state so the client-side plugin can reconstruct the deferred map.

New server-side subpath `@real-router/ssr-data-plugin/server` exports:

- `injectDeferredScripts(reactStream, deferredMap, options?)` — wraps an HTML
  `ReadableStream` (e.g. from React 19's `renderToReadableStream`) with inline
  `<script>__rrDefer__("key", json)</script>` chunks emitted as each deferred
  promise resolves. Order is by resolution time.
- `getDeferBootstrapScript()` — returns the inline JS (no `<script>` wrapper)
  that installs the global `__rrDeferRegistry__` + `__rrDefer__` /
  `__rrDeferError__` functions. Embed once in `<head>` so React's hydration
  walks the pristine `#root` subtree it expects.

`devalue` / `superjson` integration: pass `{ serialize: devalue.stringify }`
to `injectDeferredScripts` for non-JSON deferred payloads (Date / Map / Set /
RegExp / BigInt). The wire-format remains a JSON string the client
`JSON.parse`s — combine with `hydrateRouter(router, json, { deserialize })`
from `@real-router/core/utils` for matching critical-data shapes.

Non-breaking — loaders that return plain values continue to work unchanged
and never touch the new namespaces. The plugin's `subscribeLeave` revalidation
channel (`invalidate(router, "data")`, #605) also handles deferred returns:
`router.navigate({ reload: true })` after `invalidate(...)` re-runs the loader
and overwrites both critical data and the deferred map.
