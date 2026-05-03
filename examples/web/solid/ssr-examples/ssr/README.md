# SSR Solid Example

> Real-Router with classical Solid SSR — `renderToString` + `generateHydrationScript()` over Express + Vite.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data` resolves before render, mirrors React/Vue
- **`solid-js/web.renderToString`** — sync, atomic SSR. The full tree is serialized in one pass
- **`solid-js/web.generateHydrationScript`** — Solid-only artifact that must be injected into `<head>` so the client hydration runtime (`_$HY`) finds the SSR snapshot
- **`solid-js/web.hydrate`** — separate from `render()`. Use `hydrate(() => <App />, root)` after `await hydrateRouter(router, ssrState)` so the router state is rebuilt before Solid claims the DOM
- **Per-request `cloneRouter()`** — guard plugins (`canActivate`) read deps via `cloneRouter(base, { currentUser })` so concurrent requests do not bleed state
- **`@real-router/browser-plugin` only on the client** — `entry-server.tsx` does not register it (it touches `globalThis.history`/`window.location`)
- **`vite-plugin-solid({ ssr: true })`** — required. Sets `hydratable: true` for both client and server builds, plus `generate: 'ssr'` for the server bundle. Without it, the client bundle has no hydration markers and the first render mismatches

## Architecture

```
Server (per request):
  cloneRouter(base, { currentUser })
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                   # critical data resolved
    → renderToString(<RouterProvider><App /></RouterProvider>)
    → generateHydrationScript()                    # must precede <body>
    → serializeRouterState(state) → __SSR_STATE__  # path + params + context.data
    → cleanup() (router.dispose() in finally)

Client (initial hydration):
  createAppRouter({ currentUser })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)  # rebuilds state via start(state.path)
    → hydrate(() => <RouterProvider><App /></RouterProvider>, #root)
                                                   # claims DOM, attaches handlers
                                                   # browser-plugin handles SPA nav after this
```

## Solid-Specific Gotchas

- **`generateHydrationScript()` is mandatory.** Without it, `_$HY` is undefined on the client and Solid emits hydration mismatch warnings + falls back to a full re-render — losing every streamed/SSR'd byte. The server returns `hydrationScript` as a separate field; the Express handler injects it via the `<!--ssr-hydration-script-->` placeholder
- **`hydrate` ≠ `render`.** Both live in `solid-js/web` but they are different functions. `render()` mounts fresh; `hydrate()` claims existing DOM. Mixing them up produces silent mismatches that look like flicker
- **Hooks return `Accessor<T>` even on the server.** `useRoute()` returns `Accessor<RouteState>` — read with `routeState().route.context.data`, not `routeState.route.context.data`
- **Components run once.** Solid components do not re-execute on prop changes; signals propagate updates. For SSR this means the render tree resolves synchronously — no async setup
- **`onMount` is SSR-safe.** The Solid runtime guarantees `onMount` callbacks never fire during `renderToString`/`renderToStream`. The adapter's `RouterProvider` uses `onMount` for `announceNavigation`/`scrollRestoration`/`viewTransitions` — all client-only by guarantee, no manual `isServer` branching needed

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # tsc + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## E2e

[`e2e/ssr.spec.ts`](e2e/ssr.spec.ts) — Playwright suite mirroring the Vue baseline, plus Solid-specific markers:

- Cross-cutting (per-request isolation, hydration round-trip, loaders, guards, query params, nested loaders, 404, 500, CSR navigation, `<Link>` href in no-JS mode) — same as Vue
- Solid-specific: `_$HY` hydration runtime variable injected via `generateHydrationScript()`
- Solid-specific: `data-hk-*` markers present in server-rendered HTML (proof `hydratable: true` is active)

## See Also

- [`@real-router/solid`](../../../../../packages/solid)
- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssr`](../../../vue/ssr-examples/ssr) — Vue counterpart with the same e2e contract
- Solid docs: [`renderToString`](https://docs.solidjs.com/reference/rendering/render-to-string), [`hydrate`](https://docs.solidjs.com/reference/rendering/hydrate), [`generateHydrationScript`](https://docs.solidjs.com/reference/rendering/generate-hydration-script)
