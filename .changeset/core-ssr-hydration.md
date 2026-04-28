---
"@real-router/core": minor
---

core: SSR hydration helpers — serializeRouterState + hydrateRouter (#563)

Two new utilities in `@real-router/core/utils` for the SSR transport layer:

**`serializeRouterState(state)`** — XSS-safe JSON serialization of a router State for SSR → client transport. Strips `state.transition` (per-navigation `TransitionMeta` — meaningless after hydration; the client's transition is regenerated on commit). Keeps `name`, `params`, `path`, and `context` (so `state.context.<namespace>` payloads from plugin claims survive transport).

```ts
// Server
const state = await router.start(req.url);
const html = `<script>window.__SSR_STATE__=${serializeRouterState(state)}</script>`;
```

**`hydrateRouter(router, source)`** — convenience helper accepting either a JSON string or a `{ path: string }` object. Internally extracts `state.path` and delegates to `router.start(state.path)` — the canonical URL is the source of truth on hydration. No new Router method, no overload of `start()`.

```ts
// Client
declare global { interface Window { __SSR_STATE__?: { path: string } } }

const router = createAppRouter();
router.usePlugin(browserPluginFactory());

const ssrState = window.__SSR_STATE__;
if (ssrState) {
  await hydrateRouter(router, ssrState);
} else {
  await router.start();
}
```

**Why path-only:** `state.path` is the canonical URL produced by the server's full pipeline. When the client calls `router.start(state.path)`, `matchPath` resolves the same name + params, and (URL-deterministic) `forwardState`/`buildPath` interceptors reproduce identical state. Bypassing those interceptors on hydration would mask non-idempotent interceptor design rather than fix it. The `transition` strip is the only structural concession needed for SSR transport — everything else is application-level data flow.

For server-side `state.context.<namespace>` payloads (e.g. `ssr-data-plugin`'s `state.context.data`): read them from `window.__SSR_STATE__` directly in app code (data-layer concern: TanStack Query `dehydrate`/`hydrate`, store rehydration, etc.). The router doesn't carry context across hydration — plugins write context on the client during their own lifecycle hooks.

See `SSR-Hydration` wiki page for the full pattern.
