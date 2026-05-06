# SSG Solid Example

> Static site generation with Real-Router, Solid, and Vite — the Solid port of the React/Vue `ssg/` example.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `renderToString()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **Per-page SEO meta** — `meta.ts` resolves a `PageMeta` per route (title, description, canonical path, og:type, og:image). `ssg-build.ts` injects `<title>`, `<meta description>`, `<link rel="canonical">`, OpenGraph (`og:type`/`title`/`description`/`url`/`image`) and `twitter:card` tags. Profile pages use `og:type=profile`, posts pages use `article`. Each pre-rendered page ships a per-id canonical URL.
- **Nested route pre-rendering** — `users/:id/posts` is generated for every id in `entries.ts` (in addition to the parent `/users/:id` profile). 8 static HTMLs total: home, list, 3 profiles, 3 posts pages. `getStaticPaths()` enumerates leaf routes only, so intermediate `/users/:id` paths are derived in `ssg-build.ts` from the leaf list.
- **Solid hydration script** — `generateHydrationScript()` injected into every pre-rendered file so client `hydrate()` finds the SSR snapshot
- **404.html fallback + sitemap.xml** — generated as part of the build
- **Filesystem layout assertions + overfetch protection** — e2e reads `dist/` directly to verify (a) every pre-rendered route maps to exactly one `index.html` (incl. nested `/users/:id/posts/index.html`), (b) `users/` contains only the ids declared in `entries.ts`, (c) `sitemap.xml` matches the on-disk set with no extras and nothing missing.
- **XSS-safe state serialization** via `serializeRouterState()` — data embedded in static HTML
- **Dual-mode mount** — `entry-client.tsx` picks `hydrate` for SSG-rendered files and `render` for `vite dev`
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

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
      → renderToString(<RouterProvider><App /></RouterProvider>)
      → generateHydrationScript() → <head>
      → renderMetaBlock(meta) → <title>, description, canonical,
                                og:type/title/description/url/image,
                                twitter:card                     # 9 tags
      → serializeRouterState(state) → window.__SSR_STATE__ inline script
      → write dist/<path>/index.html
      → router.dispose()                              # finally, per-URL clone
  + dist/404.html (rendered from /__nonexistent — no __SSR_STATE__)
  + dist/sitemap.xml (8 URLs with absolute SITE_ORIGIN prefix)

  If any render() threw, the script logs every failure and exits with code 1
  — fail-fast guard against stale entries.ts ids producing silent 200s.

Client (initial visit to a pre-rendered URL):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)   # deposits parsed state in scratchpad, calls start(state.path)
                                                    # ssr-data-plugin reads context.data from scratchpad (#596) — loader skipped
    → if (root.firstElementChild) hydrate(...) else render(...)   # dual-mode mount
                                                    # browser-plugin handles SPA nav after this

Client (vite dev mode):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → router.start()   # no __SSR_STATE__ — fresh start, loader runs as today
    → render(...)      # firstElementChild is null in dev (no SSG content)
```

**Post-hydration loader skip (#596).** Build-time loader resolves data → static HTML written with embedded `__SSR_STATE__`. On first paint `hydrateRouter(router, ssrState)` deposits the parsed state into a one-shot scratchpad on `RouterInternals.hydrationState`; `ssr-data-plugin`'s start interceptor reads it and writes `state.context.data` directly — no second loader call, no extra roundtrip per route. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssg.spec.ts`](e2e/ssg.spec.ts).

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

## Solid-Specific Gotchas

- **`hydrate` ≠ `render`.** Both live in `solid-js/web` but are different functions: `render()` mounts fresh; `hydrate()` claims existing DOM. Mixing them up produces silent mismatches that look like flicker. The dual-mode mount picks via `rootElement.firstElementChild ? hydrate : render`
- **`generateHydrationScript()` per pre-rendered file.** Each call returns the same `_$HY` runtime bootstrap; it must be present in every `dist/**/index.html`, not just the first. The build script injects it via the `<!--ssr-hydration-script-->` placeholder before writing
- **Top-level `<Show>` for UNKNOWN_ROUTE.** Same hk-counter divergence pattern as `examples/web/solid/ssr-examples/ssr/` — `<RouteView.NotFound>` as a sibling to multiple `<RouteView.Match>` blocks triggers a hydration mismatch in vite-plugin-solid 2.11.x. The SSG example uses an app-level `<Show>` for the 404 branch and ships a separate `dist/404.html` template
- **Double Vite resolve conditions + `noExternal: ["@real-router/solid"]`.** `vite.config.ts` sets BOTH top-level `resolve.conditions` and `ssr.resolve.conditions` to `["@real-router/internal-source", "development"]`, plus `ssr.noExternal: ["@real-router/solid"]`. Required so vite-plugin-solid recompiles the adapter from its `.tsx` source for the SSR codegen — without it, Vite would import the published `dist/esm/*.js` and the JSX would never reach `babel-preset-solid`. Symmetric with the sibling `ssr/` and `ssr-streaming/` configs
- **`appType: "mpa"` is load-bearing.** With Vite's default `appType: "spa"`, `vite preview` SPA-fallbacks every unknown URL to `dist/index.html` — the SSG output for `/users/1/`, `/users/2/posts/`, etc. would never be served. `mpa` mode disables that fallback so each pre-rendered file ships at its own URL
- **Loaders are tolerant, not strict.** Unlike Vue/React/Svelte/Angular siblings, the Solid SSG loaders return `user: undefined` for unknown ids instead of throwing `LoaderNotFound` from `@real-router/ssr-data-plugin/errors`. The `<Show>` fallback in `UserProfile.tsx` renders a "User not found" UI, and the build does **not** abort on stale `entries.ts`. The fail-fast guard in `ssg-build.ts` (collects `failed[]`, exits 1 on non-empty) is therefore dormant in this example — but available for production setups that adopt the typed-error path

## Run

```bash
pnpm dev                            # vite dev server (no SSG, client-only render)
                                    # `predev` hook runs `pnpm turbo run bundle --filter=...`
                                    # so workspace deps are rebuilt before vite starts.
SITE_ORIGIN=https://your.site \
  pnpm build:app                    # tsc + vite client + vite ssr + tsx scripts/ssg-build.ts
                                    # SITE_ORIGIN env var sets canonical URLs +
                                    # sitemap origins (default: https://example.com).
pnpm preview                        # vite preview — ssgServe() adds 301 trailing-slash
                                    # redirects only; no Cache-Control / ETag overrides
                                    # (unlike Vue/React siblings — see "E2e Coverage" below).
pnpm test:e2e                       # Playwright
```

## E2e Coverage

[`e2e/ssg.spec.ts`](e2e/ssg.spec.ts) — 24 Playwright scenarios across 7 functional groups:

- **Pre-rendered HTML with JS disabled** — every URL ships server-resolved markup before client takes over
- **`__SSR_STATE__` baking + per-route isolation** — each `dist/<path>/index.html` carries its own router state; no leak between profile/posts pages
- **Per-page meta** — `<title>`, `<meta description>`, `<link rel="canonical">`, OpenGraph (`og:type`/`title`/`description`/`url`/`image`), `twitter:card`; profile pages use `og:type=profile`, posts pages use `article`; nested deep links emit per-id canonicals (not the parent `/users` URL)
- **404 + sitemap** — `dist/404.html` renders the not-found template with no `__SSR_STATE__`; `sitemap.xml` lists all 8 pre-rendered URLs with absolute `SITE_ORIGIN`
- **`ssgServe` 301 redirect + absolute script paths** — trailing-slash normalisation; `/assets/index-*.js` served via absolute paths so deep links (e.g. `/users/1/posts`) load the bundle
- **CSR navigation + no hydration mismatch + nested deep-link no-flash** — after hydration, `@real-router/browser-plugin` handles SPA nav; deep visits to `/users/3/posts` show the empty-state UI without flashing through a generic loading state
- **Filesystem layout + overfetch protection + sitemap ↔ disk consistency** — e2e walks `dist/` and asserts the EXACT set of HTML files; `users/` contains only ids declared in `entries.ts`; every URL in `sitemap.xml` has a matching pre-rendered file
- **Solid-specific: `_$HY` runtime bootstrap** — `generateHydrationScript()` output appears in every `dist/**/index.html`

**Not present in Solid (vs Vue/React siblings):** `Cache-Control` + weak-ETag tests. Solid `vite.config.ts` has no `getCachePolicy` — `ssgServe()` is redirect-only. Adding cache policies (and the corresponding e2e) is a follow-up; pattern lives in `examples/web/vue/ssr-examples/ssg/vite.config.ts`.

**Not tested:** "selective hydration in SSG" — selective hydration is a streaming-only feature; SSG hydrates the whole tree at once via `hydrate()`.

## Key Packages

- `@real-router/core` — `createRouter()` + base router types
- `@real-router/core/api` — `cloneRouter()` (subpath, NOT root export)
- `@real-router/core/utils` — `getStaticPaths()`, `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/solid` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync after hydration

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssg/`](../../../vue/ssr-examples/ssg) — Vue counterpart with the same e2e contract
- Solid docs: [`renderToString`](https://docs.solidjs.com/reference/rendering/render-to-string), [`hydrate`](https://docs.solidjs.com/reference/rendering/hydrate), [`render`](https://docs.solidjs.com/reference/rendering/render), [`generateHydrationScript`](https://docs.solidjs.com/reference/rendering/generate-hydration-script)
