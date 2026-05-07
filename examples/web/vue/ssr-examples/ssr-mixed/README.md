# SSR Mixed Mode (per-route SSR strategy)

Demonstrates `@real-router/ssr-data-plugin`'s per-route `ssr` config (#597) by
serving four routes from a single `entry-server.ts`:

| Route                    | `ssr` config                             | Mode marker     | Server behaviour                          |
| ------------------------ | ---------------------------------------- | --------------- | ----------------------------------------- |
| `/`                      | short form (loader factory)              | `"full"`        | runs loader, renders full app HTML        |
| `/admin/dashboard`       | `{ ssr: false }`                         | `"client-only"` | skips loader, ships shell HTML            |
| `/users/:id`             | `{ ssr: "data-only", loader }`           | `"data-only"`   | runs loader, ships JSON, shell HTML       |
| `/docs/:id?format=pdf`   | `{ ssr: (state) => …, loader }`          | function-form   | resolver returns `client-only` for `pdf`  |

`entry-server.ts` reads `getSsrDataMode(state)` and branches:

- `"full"` — `renderToString(createSSRApp(...))` via `vue/server-renderer`.
- `"data-only"` / `"client-only"` — emits `<div data-ssr-shell data-ssr-mode="…">`.

## Running

```sh
pnpm dev      # http://localhost:3000 (Vite dev SSR)
pnpm preview  # production build + Express
pnpm test:e2e # Playwright assertions on each mode's HTTP response
```

See [Data-Loading](https://github.com/greydragon888/real-router/wiki/Data-Loading)
in the wiki for the full per-route mode reference.
