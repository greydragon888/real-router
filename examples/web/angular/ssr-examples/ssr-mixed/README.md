# SSR Mixed Mode (per-route SSR strategy)

Demonstrates `@real-router/ssr-data-plugin`'s per-route `ssr` config (#597) by
serving four routes from a single `server.ts`:

| Route                    | `ssr` config                             | Mode marker     | Server behaviour                              |
| ------------------------ | ---------------------------------------- | --------------- | --------------------------------------------- |
| `/`                      | short form (loader factory)              | `"full"`        | Angular renders the full app HTML             |
| `/admin/dashboard`       | `{ ssr: false }`                         | `"client-only"` | shell HTML emitted directly (no bootstrap)    |
| `/users/:id`             | `{ ssr: "data-only", loader }`           | `"data-only"`   | shell HTML + JSON state (data in `__SSR_STATE__`) |
| `/docs/:id?format=pdf`   | `{ ssr: (state) => …, loader }`          | function-form   | resolver returns `client-only` for `pdf`      |

## Architecture

`src/server.ts` registers a mode-branching middleware **before** Angular's
`AngularNodeAppEngine`:

1. Clone the base router and register `ssrDataPluginFactory(loaders)`.
2. Run `start(url)` — this resolves the route AND the per-route mode via the plugin.
3. Read `getSsrDataMode(state)`:
   - `"full"` → call `next()` so the request flows into Angular's SSR pipeline.
   - `"client-only"` / `"data-only"` → emit a shell HTML directly with
     `<div data-ssr-shell data-ssr-mode="…">` and a `window.__SSR_STATE__`
     JSON payload from `serializeRouterState`. No Angular bootstrap occurs.

This is different from the React/Vue/Solid/Svelte/Preact `ssr-mixed` examples
(which use a single Vite-based custom Express handler that branches inside
`entry-server`). Angular requires a middleware before the Angular engine
because `AngularNodeAppEngine` owns the request once invoked.

## Running

```sh
pnpm dev      # http://localhost:4200 (ng serve)
pnpm preview  # production build + Express on port 4173
pnpm test:e2e # Playwright assertions on each mode's HTTP response
```

## Notes

- For shell modes (`"client-only"` / `"data-only"`) the response is NOT a
  hydration-able Angular page. Application code that needs Angular hooks on
  these routes must redirect to a separate Angular-rendered URL or boot a
  CSR-only entry — out of scope for this dogfooding example.
- For `"full"` mode Angular's `provideClientHydration(withIncrementalHydration())`
  works as in the canonical `ssr/` example, **including the post-hydration
  loader skip via the TransferState bridge (#599)** — verified by the
  `post-hydration loader skip (#599)` e2e test in `e2e/ssr-mixed.spec.ts`
  (`window.__LOADER_CALLS__` stays empty after navigation to `/`, the only
  short-form-loader full-mode route in this example).

See [Data-Loading](https://github.com/greydragon888/real-router/wiki/Data-Loading)
in the wiki for the full per-route mode reference.
