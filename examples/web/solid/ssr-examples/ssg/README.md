# SSG Solid Example

> Static site generation with Real-Router, Solid, and Vite — the Solid port of the React/Vue `ssg/` example.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `renderToString()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **Per-page meta tags** — `meta.ts` derives `<title>` + `<meta description>` from resolved router state
- **Solid hydration script** — `generateHydrationScript()` injected into every pre-rendered file so client `hydrate()` finds the SSR snapshot
- **404.html fallback + sitemap.xml** — generated as part of the build
- **XSS-safe state serialization** via `serializeRouterState()` — data embedded in static HTML
- **Dual-mode mount** — `entry-client.tsx` picks `hydrate` for SSG-rendered files and `render` for `vite dev`
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
Build time (scripts/ssg-build.ts):
  for each url in getStaticPaths(router) ∪ ["/users"]:
    cloneRouter(base) + ssr-data-plugin
      → start(url)
      → renderToString(<RouterProvider><App /></RouterProvider>)
      → generateHydrationScript() → <head>
      → meta.ts(state)        → <title> + <meta description>
      → serializeRouterState(state) → window.__SSR_STATE__ inline script
      → write dist/<path>/index.html
  + dist/404.html (static not-found template)
  + dist/sitemap.xml

Client (initial visit to a pre-rendered URL):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)   # rebuilds state via start(state.path)
    → if (root.firstElementChild) hydrate(...) else render(...)   # dual-mode mount
                                                    # browser-plugin handles SPA nav after this

Client (vite dev mode):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → router.start()   # no __SSR_STATE__ — fresh start
    → render(...)      # firstElementChild is null in dev (no SSG content)
```

## Solid-Specific Gotchas

- **`hydrate` ≠ `render`.** Both live in `solid-js/web` but are different functions: `render()` mounts fresh; `hydrate()` claims existing DOM. Mixing them up produces silent mismatches that look like flicker. The dual-mode mount picks via `rootElement.firstElementChild ? hydrate : render`
- **`generateHydrationScript()` per pre-rendered file.** Each call returns the same `_$HY` runtime bootstrap; it must be present in every `dist/**/index.html`, not just the first. The build script injects it via the `<!--ssr-hydration-script-->` placeholder before writing
- **Top-level `<Show>` for UNKNOWN_ROUTE.** Same hk-counter divergence pattern as `examples/web/solid/ssr-examples/ssr/` — `<RouteView.NotFound>` as a sibling to multiple `<RouteView.Match>` blocks triggers a hydration mismatch in vite-plugin-solid 2.11.x. The SSG example uses an app-level `<Show>` for the 404 branch and ships a separate `dist/404.html` template

## Run

```bash
pnpm dev          # vite dev server (no SSG, client-only render)
pnpm build:app    # tsc + vite client + vite ssr + tsx scripts/ssg-build.ts
pnpm preview      # vite preview (serves dist/ statically with the ssgServe redirect plugin)
pnpm test:e2e     # Playwright
```

## E2e Coverage

[`e2e/ssg.spec.ts`](e2e/ssg.spec.ts) — Playwright suite mirroring the Vue baseline plus Solid-specific marker checks:

- Cross-cutting (404.html, sitemap.xml, ssgServe redirect, dynamic-route data in HTML, no hydration mismatch, CSR navigation, absolute script paths) — same as Vue
- Solid-specific: `_$HY` runtime bootstrap injected via `generateHydrationScript()` in every pre-rendered file
- **Not tested:** "selective hydration in SSG" — selective hydration is a streaming-only feature; SSG hydrates the whole tree at once via `hydrate()`

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssg/`](../../../vue/ssr-examples/ssg) — Vue counterpart with the same e2e contract
- Solid docs: [`renderToString`](https://docs.solidjs.com/reference/rendering/render-to-string), [`hydrate`](https://docs.solidjs.com/reference/rendering/hydrate), [`render`](https://docs.solidjs.com/reference/rendering/render), [`generateHydrationScript`](https://docs.solidjs.com/reference/rendering/generate-hydration-script)
