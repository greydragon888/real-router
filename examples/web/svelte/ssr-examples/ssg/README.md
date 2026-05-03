# SSG Svelte Example

> Static site generation with Real-Router, Svelte 5, and Vite — the Svelte port of the React/Vue/Solid `ssg/` examples.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `await render()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **Per-page meta tags** — `meta.ts` derives `<title>` + `<meta description>` from resolved router state, server splices them via `<!--ssr-meta-->`. Svelte's `<svelte:head>` content (if used) lands in the same template via `<!--ssr-head-->`
- **Dual-mode entry-client** — explicit `if (rootElement.firstElementChild) hydrate(...) else mount(...)` branching, since Svelte 5 has no `mount({ hydrate: true })` opt-in
- **404.html fallback + sitemap.xml** — generated as part of the build
- **XSS-safe state serialization** via `serializeRouterState()` — data embedded in static HTML
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
Build time (scripts/ssg-build.ts):
  for each url in getStaticPaths(router) ∪ ["/users"]:
    cloneRouter(base) + ssr-data-plugin
      → start(url)
      → await render(App, { props: { router } })
      → meta.ts(state)        → <title> + <meta description> via <!--ssr-meta-->
      → render output `head`  → injected via <!--ssr-head--> (covers <svelte:head>)
      → serializeRouterState(state) → window.__SSR_STATE__ inline script
      → write dist/<path>/index.html
  + dist/404.html (static not-found template)
  + dist/sitemap.xml

Client (initial visit to a pre-rendered URL):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)
    → if (root.firstElementChild) hydrate(...) else mount(...)
                                                    # browser-plugin handles SPA nav after this

Client (vite dev mode):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → router.start()
    → mount(...)                                    # firstElementChild is null in dev
```

## Svelte-Specific Gotchas

- **`hydrate` ≠ `mount` in Svelte 5.** Both live in `svelte`; they are different functions. `hydrate(App, { target, props })` claims existing DOM, `mount(App, { target, props })` mounts fresh. There is **no** `mount({ hydrate: true })` option in Svelte 5 — that's the deprecated Svelte 4 compat surface via `asClassComponent`. The dual-mode mount branches explicitly: `rootElement.firstElementChild ? hydrate(...) : mount(...)`
- **Per-pre-rendered file `head` injection.** The build script splices the `head` field returned by `render()` into the `<!--ssr-head-->` placeholder of every page so per-page meta from `<svelte:head>` survives.
- **`<Lazy>` ≠ SSR data.** `<Lazy>` uses `$effect` to start its loader, and `$effect` does not fire on the server — the SSR/SSG output renders **only** the fallback. For pre-rendered data, use `state.context.data` (via `ssr-data-plugin`)

## Run

```bash
pnpm dev          # vite dev server (no SSG, client-only render)
pnpm build:app    # svelte-check + vite client + vite ssr + tsx scripts/ssg-build.ts
pnpm preview      # vite preview (serves dist/ statically with the ssgServe redirect plugin)
pnpm test:e2e     # Playwright
```

## E2e Coverage

[`e2e/ssg.spec.ts`](e2e/ssg.spec.ts) — Playwright suite mirroring the Vue baseline:

- Cross-cutting (404.html, sitemap.xml, ssgServe redirect, dynamic-route data in HTML, no hydration mismatch, CSR navigation, absolute script paths) — same as Vue/Solid
- Svelte-specific: dual-mode mount works (no hydration mismatch on pre-rendered pages, fresh mount in dev)

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssg/`](../../../vue/ssr-examples/ssg) — Vue counterpart with the same e2e contract
- Svelte docs: [`render`](https://svelte.dev/docs/svelte/svelte-server), [`hydrate`](https://svelte.dev/docs/svelte/imperative-component-api), [`mount`](https://svelte.dev/docs/svelte/imperative-component-api), [`<svelte:head>`](https://svelte.dev/docs/svelte/svelte-head)
