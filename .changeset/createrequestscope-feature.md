---
"@real-router/core": minor
---

Add `createRequestScope(req, base, deps)` SSR helper (#603)

New utility export from `@real-router/core/utils` that bundles the four-step
per-request boilerplate every server entry repeats:

1. `new AbortController()` per request
2. `req.on("close", () => controller.abort())`
3. `cloneRouter(base, { ...deps, abortSignal: signal })`
4. `try { ... } finally { router.dispose() }`

```typescript
import { createRequestScope } from "@real-router/core/utils";

export async function render(url: string, req: IncomingMessage) {
  const scope = createRequestScope(req, baseRouter, { currentUser });
  try {
    scope.router.usePlugin(ssrDataPluginFactory(loaders));
    return await renderShell(scope.router, url);
  } finally {
    await scope.dispose();
  }
}
```

Accepts both Node `IncomingMessage` (subscribes to its `"close"` event) and
Web `Request` shapes (uses `request.signal` directly). The injected
`abortSignal` is available to loaders via `getDep("abortSignal")` for
cooperative cancellation.

The scope also implements `Symbol.asyncDispose`, so `await using scope = …`
is supported on Node 24+, Bun, Deno, and modern browsers (Chrome/Edge 127+,
Firefox 141+). On Node 22 LTS the well-known symbol is unavailable, so the
bundled SSR examples use the explicit `try/finally` form shown above for
maximum compatibility — see JSDoc for the full runtime matrix.
