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
  leafPaths    = getStaticPaths(router)              # leaves only:
                                                     #   /, /users/<id>/posts × 3
  profilePaths = derive(/users/<id>/posts → /users/<id>)
  paths        = unique(leafPaths ∪ profilePaths ∪ ["/users"])  # 8 URLs

  for each url in paths:
    cloneRouter(base) + ssr-data-plugin
      → start(url)
      → await render(App, { props: { router } })
      → meta.ts(state)        → <title>, description, canonical,
                                 og:type/title/description/url/image,
                                 twitter:card  via <!--ssr-meta-->
      → render output `head`  → injected via <!--ssr-head--> (covers <svelte:head>)
      → serializeRouterState(state) → window.__SSR_STATE__ inline script
      → write dist/<path>/index.html
      → router.dispose()                              # finally, per-URL clone
  + dist/404.html (rendered from /__nonexistent — no __SSR_STATE__)
  + dist/sitemap.xml (8 URLs with absolute SITE_ORIGIN prefix)

  If any render() threw, the script collects failures and exits 1
  — fail-fast guard against stale entries.ts ids producing silent 200s.
  (Currently dormant — see "Loader contract" below.)

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

## Output

```
dist/
  index.html              ← /
  404.html                ← not-found template (no __SSR_STATE__);
                            host platforms (Netlify/Vercel/CF Pages) auto-serve
                            this for unknown paths
  sitemap.xml             ← all 8 pre-rendered URLs with absolute SITE_ORIGIN
  users/
    index.html            ← /users
    1/
      index.html          ← /users/1
      posts/
        index.html        ← /users/1/posts (Alice — 2 posts)
    2/
      index.html          ← /users/2
      posts/
        index.html        ← /users/2/posts (Bob — 1 post)
    3/
      index.html          ← /users/3
      posts/
        index.html        ← /users/3/posts (Charlie — empty-state UI)
  assets/
    index-*.js            ← client bundle (shared across all pages)
```

## Svelte-Specific Gotchas

- **`hydrate` ≠ `mount` in Svelte 5.** Both live in `svelte`; they are different functions. `hydrate(App, { target, props })` claims existing DOM, `mount(App, { target, props })` mounts fresh. There is **no** `mount({ hydrate: true })` option in Svelte 5 — that's the deprecated Svelte 4 compat surface via `asClassComponent`. The dual-mode mount branches explicitly: `rootElement.firstElementChild ? hydrate(...) : mount(...)`
- **Per-pre-rendered file `head` injection.** The build script splices the `head` field returned by `render()` into the `<!--ssr-head-->` placeholder of every page so per-page meta from `<svelte:head>` survives.
- **`<Lazy>` ≠ SSR data.** `<Lazy>` uses `$effect` to start its loader, and `$effect` does not fire on the server — the SSR/SSG output renders **only** the fallback. For pre-rendered data, use `state.context.data` (via `ssr-data-plugin`)
- **Loaders are tolerant, not strict.** Like Solid SSG (and unlike Vue/React/Angular siblings), the Svelte loaders return `user: undefined` for unknown ids instead of throwing `LoaderNotFound` from `@real-router/ssr-data-plugin/errors`. Pages handle the undefined branch in their snippet templates. The fail-fast guard in `ssg-build.ts` (collects `failed[]`, `process.exit(1)` on non-empty) is therefore dormant in this example — but available for production setups that adopt the typed-error path
- **Snippet-driven `<RouteView>`.** Svelte 5's `<RouteView>` renders matched routes via `{#snippet name()}{/snippet}` blocks rather than component instances. `App.svelte` ships top-level snippets for `home`, `users`, `notFound`; `UserProfile.svelte` embeds a nested `<RouteView nodeName="users.profile">` with a `posts` snippet that renders `<UserPosts />`. There is no top-level `users.profile.posts` snippet in `App.svelte` — nesting is local to the parent component

## Run

```bash
pnpm dev                            # vite dev server (no SSG, client-only render)
                                    # `predev` hook runs `pnpm turbo run bundle --filter=...`
                                    # so workspace deps are rebuilt before vite starts.
SITE_ORIGIN=https://your.site \
  pnpm build:app                    # svelte-check + vite client + vite ssr + tsx scripts/ssg-build.ts
                                    # SITE_ORIGIN env var sets canonical URLs +
                                    # sitemap origins (default: https://example.com).
pnpm preview                        # vite preview — ssgServe() adds 301 trailing-slash
                                    # redirects only; no Cache-Control / ETag overrides
                                    # (unlike Vue/React siblings — see "E2e Coverage" below).
pnpm test:e2e                       # Playwright
```

## Limitations and Trade-offs

- **Post-hydration loader skip (#596).** Build-time loader resolves data → static HTML written with embedded `__SSR_STATE__` (path, params, context.data). On first paint `hydrateRouter(router, ssrState)` deposits the parsed state into a one-shot scratchpad on `RouterInternals.hydrationState`; `ssr-data-plugin`'s start interceptor reads it and writes `state.context.data` directly — no second loader call, no extra roundtrip per route. Same skip applies in the runtime SSR / streaming siblings. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssg.spec.ts`](e2e/ssg.spec.ts).
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

**Not present in Svelte (vs Vue/React siblings):** `Cache-Control` + weak-ETag tests. Svelte `vite.config.ts` has no `getCachePolicy` — `ssgServe()` is redirect-only. Adding cache policies (and the corresponding e2e) is a follow-up; pattern lives in `examples/web/vue/ssr-examples/ssg/vite.config.ts`. Same divergence as Solid SSG.

## Key Packages

- `@real-router/core` — `createRouter()` + base router types
- `@real-router/core/api` — `cloneRouter()` (subpath, NOT root export)
- `@real-router/core/utils` — `getStaticPaths()`, `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/ssr-data-plugin/errors` — typed loader errors (currently unused here; available for strict mode)
- `@real-router/svelte` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync after hydration

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssg/`](../../../vue/ssr-examples/ssg) — Vue counterpart with the same e2e contract
- Svelte docs: [`render`](https://svelte.dev/docs/svelte/svelte-server), [`hydrate`](https://svelte.dev/docs/svelte/imperative-component-api), [`mount`](https://svelte.dev/docs/svelte/imperative-component-api), [`<svelte:head>`](https://svelte.dev/docs/svelte/svelte-head)
