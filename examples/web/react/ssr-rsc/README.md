# SSR-RSC React Example

> Real-router with React Server Components, SSR, and per-request `cloneRouter` —
> via `@vitejs/plugin-rsc` + `@real-router/rsc-server-plugin`.

## Status

🚧 **Stage 1 scaffold** — minimal hello-world (single `<HelloWorld>` Server Component) wired through real-router's `RouterProvider`. Validates end-to-end pipeline: `entry.rsc.tsx` request handler, `loadModule('ssr')` bridge, Flight injection, hydrate-with-state. Subsequent stages will add real route tree, multiple Server Components, `rsc-server-plugin` loaders, and Playwright e2e suite.

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vite build (single command — plugin-rsc auto-triggers Plugin.buildApp on Vite 7+)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright (currently 1 scaffold smoke test)
```

## Smoke

```bash
curl -s http://localhost:3000/users/42 | grep data-testid
# → <article data-testid="hello"><h1>Hello from Server Component</h1>...

curl -s -i 'http://localhost:3000/__rsc?route=/users' | head -3
# → HTTP/1.1 200 OK
# → content-type: text/x-component
```

## Architecture

```
Express (server/index.ts | server/dev.ts)
   │  forwards all paths to entry.rsc.tsx fetch handler
   ▼
src/entry.rsc.tsx     — default { fetch } — owns request routing
   │  if /__rsc?route=... → Flight stream Response
   │  else → loadModule('ssr', 'index').renderHTML(flightStream, pathname)
   ▼
src/entry.ssr.tsx     — exports renderHTML(rscStream, pathname)
   │  createFromReadableStream(/ssr) + use(payload) + injectRSCPayload
   ▼
src/App.tsx           — unified root for SSR + client (use(payload) + RouterProvider)
   │
   └── (client) src/entry.browser.tsx
         hydrateRouter(router, ssrState) → hydrateRoot(document, <App>)
```

See [`.claude/rfc-rsc-vite-example.md`](../../../../.claude/rfc-rsc-vite-example.md) for full RFC + Stage 0/1 spike findings.

## Plan

- **Stage 1** ✅ — scaffold (this commit): copies validated `.spike/rsc-stage-1/` baseline into workspace, registers via `pnpm-workspace.yaml` → `examples/web/*/*` glob, type-check + build + dev/prod smoke pass.
- **Stage 2** — server side: real route tree (`home`, `users.list`, `users.profile`), `db.ts` mock store, `loaders.ts` map, `rsc-server-plugin` integration, `serializeRouterState({ excludeContext: ["rsc"] })`.
- **Stage 3** — client side: `RevalidateButton`, navigation via `Link`, single source of truth for RSC fetch (App's `router.subscribe` listener).
- **Stage 4** — Playwright e2e: 5 acceptance scenarios (initial load, client navigation, revalidation, 404, per-request isolation).
- **Stage 5** — README finalisation, root README example link.

## Related

- [@real-router/rsc-server-plugin](../../../../packages/rsc-server-plugin) — the plugin itself (Variant B: ReactNode payload, bundler-agnostic)
- [@real-router/ssr-data-plugin](../../../../packages/ssr-data-plugin) — sibling plugin for plain JSON
- [examples/web/react/ssr](../ssr) — classical SSR (no RSC) precedent
