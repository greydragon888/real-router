---
"@real-router/rsc-server-plugin": minor
---

Add `@real-router/rsc-server-plugin` — per-route `ReactNode` (RSC payload) loading via `start()` interceptor

New plugin mirroring `@real-router/ssr-data-plugin` for React Server Components. Loaders return `ReactNode` (sync or async); the plugin writes the resolved node to `state.context.rsc` via the `"rsc"` namespace claim. Bundler-agnostic — the caller pipes the published node through their bundler's Flight renderer (`@vitejs/plugin-rsc`, `react-server-dom-webpack`, etc.).

```typescript
router.usePlugin(rscServerPluginFactory({
  "users.profile": () => async (params) => {
    const user = await fetchUser(params.id);
    return <UserProfile user={user} />;
  },
}));

const state = await router.start(url);
const flight = renderToReadableStream(state.context.rsc);
const json = serializeRouterState(state, { excludeContext: ["rsc"] });
```
