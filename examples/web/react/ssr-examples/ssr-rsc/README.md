# SSR-RSC React Example

> Real-router with React Server Components, SSR, Flight streaming, and per-request `cloneRouter` —
> via `@vitejs/plugin-rsc` + `@real-router/rsc-server-plugin`.

## What This Demonstrates

End-to-end RSC application using real-router as the routing layer:

- **Per-request `cloneRouter`** with `@real-router/rsc-server-plugin` — every HTTP request gets an isolated router with its own state
- **Two-endpoint architecture** — initial HTML load (`GET /:path`) and subsequent client navigations (`GET /__rsc?route=...`) flow through the same `entry.rsc.tsx` fetch handler
- **Flight injection** — RSC payload streams into the initial HTML via `rsc-html-stream/server`'s `injectRSCPayload`, with the client picking it up via `rsc-html-stream/client`'s `rscStream`
- **Single source of truth for client navigation** — `App.tsx`'s `router.subscribe` listener owns all `/__rsc` re-fetches; both `<Link>` clicks and `RevalidateButton`'s `router.navigate({ reload: true })` route through it. Each fetch carries its own `AbortController`; a new navigation aborts the previous in-flight `/__rsc` request, so rapid A→B clicks can't race the older response back into the DOM (Scenario 11).
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

Routes are nested in `src/router/createAppRouter.ts`: `users` (`/users`) is the parent of `users.list` (path `/?role`, i.e. resolves to `/users` with optional `?role=admin|user` query param) and `users.profile` (path `/:id`).

| Route name      | Path                  | Server Component                  | Loader                                    |
| --------------- | --------------------- | --------------------------------- | ----------------------------------------- |
| `home`          | `/`                   | `<HomePage />`                    | sync factory                              |
| `users.list`    | `/users` `?role`      | `<UsersList roleFilter={...} />` (async — calls `db.users.list()` inside the Server Component) | sync factory; `search.role` (`"admin"` \| `"user"` \| `undefined`) forwarded as `roleFilter` |
| `users.profile` | `/users/:id`          | `<UserProfile user={...} />` + `<RevalidateButton />` (Client Component) | async + DI (`getDep("db").users.findById(params.id)`); throws `LoaderNotFound` for unknown ids |
| `boom`          | `/boom`               | —                                 | rejects with `Error("Loader exploded")` — surfaces as 500 + server-rendered `<server-error>` (no Flight payload). Verified by Scenario 9 |

The `?role` query param is end-to-end demonstrated by Scenarios 12-15 (admin / user filter, default, invalid value falls through). `<UsersList>` itself reads `roleFilter` and produces a different shape per role.

In-memory mock store ([`src/database.ts`](src/database.ts)) — module-scoped singleton, shared between rsc env loaders and the inline `POST /__test/users/:id` mutation endpoint.

## E2e Scenarios

[`e2e/ssr-rsc.spec.ts`](e2e/ssr-rsc.spec.ts) — **26 Playwright scenarios**, organized by topic. The five "core" scenarios below establish the architectural contract; the remaining 21 cover query params, history navigation, race conditions, loader-driven HTTP, production HTTP semantics, Server Actions, and the `NotificationBanner` cross-component result pattern.

**Core (1-5)**
1. **Initial HTML load** — `/users/1` → server-rendered `<UserProfile>` visible synchronously, `self.__FLIGHT_DATA` script tags present, no hydration warnings
2. **Client navigation** — `/` → click `Users` link → `GET /__rsc?route=%2Fusers` → DOM updates without full reload
3. **Revalidation roundtrip** — `/users/1` → `POST /__test/users/1` (mutate) → DOM still shows old data → click `Revalidate` → `GET /__rsc?route=%2Fusers%2F1` → DOM updates with new email
4. **404 not-found** — `/nonexistent-page` → status `404` + `<p data-testid="not-found">` Server Component visible + no hydration errors
5. **Per-request isolation** — 10 concurrent `GET /users/{0..9}` → each `200 OK`, each HTML contains correct `data-user-id="${i}"`

**Beyond core**
- `9` — `/boom` → loader rejects → 500 + `<server-error>` body, no `__FLIGHT_DATA` shipped
- `10` — history (`back/forward`) → `popstate` → `router.subscribe` → `/__rsc` per step
- `11` — race-safe `/__rsc` aborts: rapid A→B navigation cancels in-flight A request via `AbortController` (App.tsx:55-103)
- `12-15` — `?role=admin|user` search-param filtering through loaders + UI
- `16a/16b` — `LoaderNotFound` → 404 text/plain on both HTML (`/users/9999`) and Flight (`/__rsc?route=/users/9999`) endpoints, with cleanup verified
- `16/17` — Cache-Control parity between HTML and Flight endpoints (Flight extracts `route` from query, applies the underlying route's policy)
- `18` — **No ETag** on either endpoint (intentional, see "Production HTTP semantics" below)
- `19-21` — Server Actions: `$ACTION_REF_*` wire signature, mutation persists across reload, server-side validation rejects invalid email
- `22-24` — `NotificationBanner` cross-cutting result UI via `state.context.rscAction`

```bash
pnpm test:e2e
# Running 26 tests using 1 worker
# ✓ Scenarios 1-5 — core architectural contract
# ✓ Scenarios 9-11 — loader rejection / history / race-safe abort
# ✓ Scenarios 12-15 — search-param routing
# ✓ Scenarios 16/16a/16b/17/18 — production HTTP (Cache-Control + 404 + no ETag)
# ✓ Scenarios 19-21 — Server Actions
# ✓ Scenarios 22-24 — NotificationBanner cross-component result
```

## Why Express + `serverHandler: false`?

`@vitejs/plugin-rsc` registers its own request handler by default. We disable it (`serverHandler: false`) and let Express forward **all** requests to `entry.rsc.tsx`'s `{ fetch }` handler. This makes the routing decision (RSC vs HTML) live **inside** `entry.rsc.tsx` rather than in Express, keeping Express as a thin Web↔Node bridge that's reusable between dev and prod servers.

In dev mode, [`server/dev.ts`](server/dev.ts) creates a `createServerModuleRunner(vite.environments.rsc)` to load `entry.rsc.tsx` per request (with HMR). In prod mode, [`server/index.ts`](server/index.ts) imports the pre-built `dist/rsc/index.js` once at startup.

## React 19 Server Actions

`src/server-actions/updateUserEmail.ts` declares a Server Action with the `'use server'` directive — `@vitejs/plugin-rsc` marks every export as a server reference, so calling the function from the client triggers an HTTP POST that the server decodes and runs. The action itself only exists in the rsc bundle (not the client bundle), so it can read secrets, mutate the database, etc. without exposing implementation to the browser.

`src/client-components/EditEmailForm.tsx` is a Client Component that wires the action into a form via React 19's `useActionState`:

- **Without JS** (progressive enhancement): `<form action={formAction}>` (where `formAction` is the dispatcher returned by `useActionState`) posts FormData to the current URL. React serializes the action reference via hidden `$ACTION_REF_*` / `$ACTION_KEY` form fields. `entry.rsc.tsx` decodes via `decodeAction(formData)` (recovers the action from those fields), runs it, and returns a fresh Flight payload. Works before hydration.
- **With JS**: `setServerCallback` (in `entry.browser.tsx`) intercepts the call. POSTs the encoded args with the action id in the `x-rsc-action` header. `entry.rsc.tsx` dispatches via `loadServerAction(id)` + `decodeReply(body)`. The handler also creates a `createTemporaryReferenceSet()` so non-serializable references (callbacks, abort signals) survive the encode/decode round-trip without losing identity. The Flight payload includes `returnValue`/`formState`; `useActionState` threads them back into the form. If the action throws, `entry.rsc.tsx` sets `actionStatus = 500` and the response carries `returnValue.ok === false`.
- **`useFormStatus`** (in the `SubmitButton` child) reads the parent form's pending state — button disabled + label flips to "Saving..." during submission.

Pipeline shape:

```
Client form                               entry.rsc.tsx
─────────                                 ─────────────
<form action={updateUserEmail}>           if (POST) {
  setServerCallback(id, args) ─────────►    if (header x-rsc-action) {
    POST /users/1                              decodeReply(body) → args
    x-rsc-action: <id>                         loadServerAction(id) → fn
    body: encodeReply(args)                    fn(...args) → returnValue
                                            } else {
                                              decodeAction(formData) → fn
                                              fn() → formState
                                            }
                                          }
                                          // re-render with mutation reflected
                                          renderToReadableStream({ root, returnValue, formState })
   ◄──── Flight + returnValue ─────────
   useActionState picks up result
   Server Component re-renders with
   mutated user.email
```

3 dedicated tests in `e2e/ssr-rsc.spec.ts`:

- **Scenario 19** — form renders with `$ACTION_REF_*` + `$ACTION_KEY` hidden fields (wire signature of `'use server'`).
- **Scenario 20** — submitting the form mutates state, page re-renders with new email, mutation persists across reload (proves the Server Action wrote to the DB and the next render reflected it).
- **Scenario 21** — server-side validation rejects invalid email → useActionState exposes `{ ok: false, message }` → no mutation; reload still shows original email.

### Cross-component action result via `rscActionPluginFactory`

`@real-router/rsc-server-plugin` exposes `rscActionPluginFactory(getResult)` — a sibling plugin that publishes Server Action results to `state.context.rscAction`. Server Components anywhere in the render tree can react to mutations without prop-drilling from the form component.

`src/server-components/NotificationBanner.tsx` is the demonstration: a Server Component that **receives the action result as a prop**. `entry.rsc.tsx` reads `state.context.rscAction` from the resolved router state and passes it into `<NotificationBanner action={...}>`, wrapping every page's Server Component tree. The banner renders a success/error banner if a mutation just ran, or `null` otherwise. Any page can show post-mutation feedback even though the form lives in `EditEmailForm` (a Client Component on the user profile page) — the result is plumbed through `state.context` rather than via prop-drilling from the form.

Wiring on the client: when the action POST returns the new Flight payload, `setServerCallback` (in `entry.browser.tsx`) dispatches a `rsc:server-action-response` `CustomEvent` with the new payload. `App.tsx` listens and replaces its tree state with `payload.root` — so the banner mounts immediately, no manual reload needed. The `CustomEvent` indirection decouples transport (entry.browser.tsx) from tree-update mechanism (App component state) without requiring a global mutable `setNode` reference.

3 dedicated tests:

- **Scenario 22** — plain GET requests show no banner (rscAction is undefined; banner Server Component returns null).
- **Scenario 23** — successful Server Action surfaces success banner via `state.context.rscAction`. Both the form's `useActionState` message AND the cross-cutting global banner are visible — the banner has access to the result without any prop being passed from the form.
- **Scenario 24** — validation-rejected action surfaces error banner with the rejection message; reload (no action) → banner gone, original DB state intact.

## Loader-driven HTTP: typed LoaderNotFound for unknown ids (HTML and Flight)

Typed loader errors live in `@real-router/rsc-server-plugin/errors` (the RSC-plugin mirror of `@real-router/ssr-data-plugin/errors`, hoisted from per-example `_loader-errors.ts` files in commit `e7ad413e` / issue #594). `src/router/loaders.tsx` imports `LoaderNotFound` from that subpath; the `users.profile` loader throws it for ids not in the database (e.g. the explicitly-marked `/users/9999`). `entry.rsc.tsx` catches the typed error BEFORE constructing the Flight stream and returns a `Response` with `404 Not Found` + `text/plain` — the SAME shape regardless of whether the request came in as `GET /users/9999` (HTML) or `GET /__rsc?route=/users/9999` (Flight). `router.dispose()` always runs in `finally`, no leak.

The RSC database (`src/database.ts`) fabricates fake users on-demand for unknown ids by default — so per-request isolation tests can hit `/users/0…9` in parallel without seeding the store. `EXPLICIT_MISSING_IDS` is the small set of ids that are guaranteed to return undefined; used by the tests and documented in the database file.

Verified by Scenarios 16a (HTML 404) and 16b (Flight 404).

## Production HTTP semantics: Cache-Control + AbortController (no ETag)

Both endpoints (`GET /:path` and `GET /__rsc?route=...`) get production-grade pieces tailored to the dual-shape architecture:

- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` holds a path→header lookup; the path-extraction helper that decides whether to use `request.url` (HTML endpoint) or `?route=` query (Flight endpoint) lives in `server/index.ts:effectivePathForCache` (and its dev mirror in `server/dev.ts`). Directives: `/` → `public, max-age=300, s-maxage=3600`; `/users` → `public, max-age=60`; `/users/:id` → `public, max-age=120`; `/boom` → `no-store`. **Note:** unlike sibling `ssr/` and `ssr-streaming/` examples, this example does NOT add `must-revalidate` — Flight bodies are streamed and the freshness check is delegated entirely to the CDN edge layer (which applies its own ETag/revalidation strategy on top of the chunked origin response).
- **`AbortController` per request** — `server/index.ts` creates a per-request controller, fires `.abort()` on `req.on("close")`, and threads the signal through `expressToFetchRequest(req, signal)` into the Web `Request`. The RSC handler observes disconnects via `request.signal`. (Note: unlike the runtime `ssr/` example, this RSC example does NOT inject `abortSignal` into the loader DI map — `cloneRouter(baseRouter, { db: database })` carries only the database. Loaders that need to bail out on disconnect would extend the deps map.)
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
