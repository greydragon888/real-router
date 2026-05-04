# SSG Svelte Example

> Static site generation with Real-Router, Svelte 5, and Vite — the Svelte port of the React/Vue/Solid `ssg/` examples.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `await render()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **Per-page SEO meta** — `meta.ts` resolves a `PageMeta` per route (title, description, canonical path, og:type, og:image). `ssg-build.ts` injects `<title>`, `<meta description>`, `<link rel="canonical">`, OpenGraph (`og:type`/`title`/`description`/`url`/`image`) and `twitter:card` tags via the `<!--ssr-meta-->` placeholder. Svelte's `<svelte:head>` content lands in the same template via `<!--ssr-head-->`. Each pre-rendered page ships a per-id canonical URL.
- **Nested route pre-rendering** — `users/:id/posts` is generated for every id in `entries.ts` (in addition to the parent `/users/:id` profile). 8 static HTMLs total: home, list, 3 profiles, 3 posts pages.
- **Dual-mode entry-client** — explicit `if (rootElement.firstElementChild) hydrate(...) else mount(...)` branching, since Svelte 5 has no `mount({ hydrate: true })` opt-in
- **404.html fallback + sitemap.xml** — generated as part of the build
- **XSS-safe state serialization** via `serializeRouterState()` — data embedded in static HTML
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation
- **Filesystem layout assertions + overfetch protection** — e2e reads `dist/` directly to verify (a) every pre-rendered route maps to exactly one `index.html`, (b) `users/` contains only the ids declared in `entries.ts` (overfetch protection), (c) `sitemap.xml` matches the on-disk set with no extras and nothing missing.

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

## Limitations and Trade-offs

- **Loader runs again on the client during hydration.** The same `ssr-data-plugin` is registered on both server and client (see `entry-client.ts`). Build-time loader resolves data → static HTML written. On first paint the JS bundle re-runs `start(url)` and the loader fires again. For the in-memory `database.ts` this is invisible; for a real `fetch()` it is one extra roundtrip per route. `__SSR_STATE__` carries the serialized state (path, params, context.data) — the client could in theory read it instead of re-fetching, but `ssr-data-plugin` doesn't ship that hook by default.
- **CSR navigation does not refetch loader data.** `ssr-data-plugin` intercepts `start()`, not `navigate()`. After hydration, clicking a `Link` to `/users/2` fires `router.navigate()` → loader does **not** run → `state.context.data === undefined` → "User not found". Same SSR-only contract as the runtime `ssr/` example. Use `lifecycle-plugin onNavigate` for client-side fetching.
- **Not ISR.** No incremental regeneration, no on-demand revalidation. Build-time only.
- **404.html / sitemap.xml are application-level outputs**, not plugin features. `scripts/ssg-build.ts` calls `renderEntry('/__nonexistent')` and writes `404.html` + assembles `sitemap.xml` from `getStaticPaths()`. Easy to copy into your own SSG pipeline, but Real-Router doesn't ship a built-in.
- **Vite preview / sirv 404 behavior depends on web-server config.** To serve `404.html` with HTTP 404 status (proper SEO signal) you need a real web server (nginx `try_files`, Cloudflare/Netlify `_redirects`).

## E2e Coverage

[`e2e/ssg.spec.ts`](e2e/ssg.spec.ts) — 23 Playwright scenarios:

- 16 baseline (404.html, sitemap.xml, ssgServe redirect, dynamic-route data in HTML, no hydration mismatch, CSR navigation, absolute script paths, per-page title+description, build determinism)
- Svelte-specific: dual-mode mount works (no hydration mismatch on pre-rendered pages, fresh mount in dev)
- **Filesystem layout**: `existsSync` for every expected `index.html`, including nested `/users/:id/posts/index.html`
- **Overfetch protection**: `readdirSync(users)` returns exactly `["1","2","3"]`, no `users/4` etc.
- **Nested route pre-rendering**: `/users/1/posts/` ships post titles in static HTML; `/users/3/posts/` shows empty state (no posts in DB)
- **Canonical + OpenGraph**: `rel=canonical`, `og:type/title/description/url/image`, `twitter:card` per route (incl. nested posts pages with `og:type=article`)
- **Per-id canonical**: `users/1/index.html` has `canonical=https://example.com/users/1`, `users/3/index.html` has `https://example.com/users/3` — not the parent `/users` URL
- **Sitemap ↔ filesystem cross-check**: every `<loc>` in `sitemap.xml` matches a generated file, no extras and nothing missing

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssg/`](../../../vue/ssr-examples/ssg) — Vue counterpart with the same e2e contract
- Svelte docs: [`render`](https://svelte.dev/docs/svelte/svelte-server), [`hydrate`](https://svelte.dev/docs/svelte/imperative-component-api), [`mount`](https://svelte.dev/docs/svelte/imperative-component-api), [`<svelte:head>`](https://svelte.dev/docs/svelte/svelte-head)
