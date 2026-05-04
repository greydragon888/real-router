# SSR-RSC React Example

> Real-router with React Server Components, SSR, Flight streaming, and per-request `cloneRouter` —
> via `@vitejs/plugin-rsc` + `@real-router/rsc-server-plugin`.

## What This Demonstrates

End-to-end RSC application using real-router as the routing layer:

- **Per-request `cloneRouter`** with `@real-router/rsc-server-plugin` — every HTTP request gets an isolated router with its own state
- **Two-endpoint architecture** — initial HTML load (`GET /:path`) and subsequent client navigations (`GET /__rsc?route=...`) flow through the same `entry.rsc.tsx` fetch handler
- **Flight injection** — RSC payload streams into the initial HTML via `rsc-html-stream/server`'s `injectRSCPayload`, with the client picking it up via `rsc-html-stream/client`'s `rscStream`
- **Single source of truth for client navigation** — `App.tsx`'s `router.subscribe` listener owns all `/__rsc` re-fetches; both `<Link>` clicks and `RevalidateButton`'s `router.navigate({ reload: true })` route through it
- **Server / Client component boundary** — `UserProfile` (Server Component) renders `<RevalidateButton />` (Client Component) directly via `'use client'` directive
- **404 handling** — `/nonexistent` returns 404 status with a Server-rendered not-found component flowing through the same Flight stream

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vite build (plugin-rsc auto-triggers Plugin.buildApp on Vite 7+)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright — 5 acceptance scenarios
```

## Architecture

```
Express  (server/index.ts | server/dev.ts) — thin Web↔Node bridge
   │  expressToFetchRequest(req) → entry.rsc.default.fetch(request)
   ▼
src/entry.rsc.tsx     — default { fetch } — owns request routing (rsc env, react-server condition)
   │  ─ GET /__test/users/:id → mutate db (Stage 4 e2e infrastructure)
   │  ─ cloneRouter(baseRouter, { db }) + usePlugin(rscServerPluginFactory(loaders))
   │  ─ await router.start(pathname) → state.context.rsc populated
   │  ─ renderToReadableStream(state.context.rsc) → Flight stream
   │  ─ if /__rsc?route=… → return Flight stream (Content-Type: text/x-component)
   │  ─ else → loadModule('ssr', 'index').renderHTML(flightStream, { ssrState, statusCode })
   ▼
src/entry.ssr.tsx     — exports renderHTML(rscStream, opts)  (ssr env, no react-server)
   │  ─ rscStream.tee() → flightForSsr (desuspend for HTML render) + flightForBrowser (inline-inject)
   │  ─ createFromReadableStream(/ssr) + React.use(payload) — desuspends Flight in SSR pass
   │  ─ renderToReadableStream(<App router payload />, { bootstrapScriptContent })
   │  ─ pipeThrough(injectRSCPayload(flightForBrowser)) — inline <script>self.__FLIGHT_DATA…</script>
   ▼
src/App.tsx           — unified root for SSR + client (use(payload) + router.subscribe re-fetch)
   │  ─ const initialNode = use(payload) ─ React 19 use() suspends until Flight resolved
   │  ─ useEffect(() => router.subscribe(({route}) => fetch(`/__rsc?route=${route.path}`)…))
   │  ─ <Layout router>{node}</Layout>
   │
   └── (client) src/entry.browser.tsx
         ─ hydrateRouter(router, ssrState)  ─ rebuilds router state from window.__SSR_STATE__
         ─ createFromReadableStream(rscStream)  ─ rscStream from rsc-html-stream/client
         ─ hydrateRoot(document, <App router payload />)
```

`Outlet` is removed — `Layout` renders `{children}` (the `node` from App) directly.

## Routes

| Route name      | Path           | Server Component                  | Loader                                    |
| --------------- | -------------- | --------------------------------- | ----------------------------------------- |
| `home`          | `/`            | `<HomePage />`                    | sync                                      |
| `users.list`    | `/users`       | `<UsersList />` (direct `db` import)  | async (`db.users.list()`)             |
| `users.profile` | `/users/:id`   | `<UserProfile user={...} />` + `<RevalidateButton />` (Client Component) | async + DI (`getDep("db").users.findById(params.id)`) |

In-memory mock store ([`src/database.ts`](src/db.ts)) — module-scoped singleton, shared between rsc env loaders and the inline `POST /__test/users/:id` mutation endpoint.

## E2e Scenarios

[`e2e/ssr-rsc.spec.ts`](e2e/ssr-rsc.spec.ts) — 5 Playwright scenarios:

1. **Initial HTML load** — `/users/1` → server-rendered `<UserProfile>` visible synchronously, `self.__FLIGHT_DATA` script tags present, no hydration warnings
2. **Client navigation** — `/` → click `Users` link → `GET /__rsc?route=%2Fusers` → DOM updates without full reload
3. **Revalidation roundtrip** — `/users/1` → `POST /__test/users/1` (mutate) → DOM still shows old data → click `Revalidate` → `GET /__rsc?route=%2Fusers%2F1` → DOM updates with new email
4. **404 not-found** — `/nonexistent-page` → status `404` + `<p data-testid="not-found">` Server Component visible + no hydration errors
5. **Per-request isolation** — 10 concurrent `GET /users/{0..9}` → each `200 OK`, each HTML contains correct `data-user-id="${i}"`

```bash
pnpm test:e2e
# Running 5 tests using 1 worker
# ✓ Scenario 1: Initial HTML load (782ms)
# ✓ Scenario 2: Client-side navigation via Link (602ms)
# ✓ Scenario 3: Revalidation button (240ms)
# ✓ Scenario 4: 404 (568ms)
# ✓ Scenario 5: Per-request isolation (36ms)
# 5 passed (6.0s)
```

## Why Express + `serverHandler: false`?

`@vitejs/plugin-rsc` registers its own request handler by default. We disable it (`serverHandler: false`) and let Express forward **all** requests to `entry.rsc.tsx`'s `{ fetch }` handler. This makes the routing decision (RSC vs HTML) live **inside** `entry.rsc.tsx` rather than in Express, keeping Express as a thin Web↔Node bridge that's reusable between dev and prod servers.

In dev mode, [`server/dev.ts`](server/dev.ts) creates a `createServerModuleRunner(vite.environments.rsc)` to load `entry.rsc.tsx` per request (with HMR). In prod mode, [`server/index.ts`](server/index.ts) imports the pre-built `dist/rsc/index.js` once at startup.

## Production HTTP semantics: Cache-Control + AbortController (no ETag)

Both endpoints (`GET /:path` and `GET /__rsc?route=...`) get production-grade pieces tailored to the dual-shape architecture:

- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives. The Flight endpoint extracts `route` from the query and applies the SAME policy as the underlying HTML route — so a CDN can cache both shapes (`/users/1` HTML and `/__rsc?route=/users/1` Flight) under their own keys with consistent freshness.
- **`AbortController` per request** — `server/index.ts` creates a per-request controller, fires `.abort()` on `req.on("close")`, and threads the signal through `expressToFetchRequest(req, signal)` into the Web `Request`. The RSC handler observes disconnects via `request.signal`; loaders that read `getDep("abortSignal")` can also bail out.
- **No ETag (intentional)** — both HTML and Flight responses are streamed; buffering for hashing would defeat streaming. Production setups rely on CDN-level caching with the CDN's own buffered ETag layer applied at the edge. Verified by Scenario 18.

3 dedicated tests in `e2e/ssr-rsc.spec.ts`:
- 16: Cache-Control per-route on HTML responses
- 17: Same policy on `/__rsc` Flight responses (extracts `route` param)
- 18: Honesty check — neither HTML nor Flight carries an `ETag` header

## See Also

- [@real-router/rsc-server-plugin](../../../../../packages/rsc-server-plugin) — the plugin itself (Variant B: ReactNode payload, bundler-agnostic)
- [@real-router/ssr-data-plugin](../../../../../packages/ssr-data-plugin) — sibling plugin for plain JSON data
- [examples/web/react/ssr-examples/ssr](../ssr) — classical SSR (no RSC) precedent
- [.claude/rfc-rsc-vite-example.md](../../../../../.claude/rfc-rsc-vite-example.md) — RFC + design rationale + Stage 0 spike findings
- [@vitejs/plugin-rsc](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) — multi-environment RSC bundler
- [rsc-html-stream](https://github.com/devongovett/rsc-html-stream) — Flight injection library (server + client)
