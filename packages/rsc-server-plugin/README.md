# @real-router/rsc-server-plugin

[![npm](https://img.shields.io/npm/v/@real-router/rsc-server-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rsc-server-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/rsc-server-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/rsc-server-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/rsc-server-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/rsc-server-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Per-route `ReactNode` (RSC payload) loading for [Real-Router](https://github.com/greydragon888/real-router). Intercepts `start()` to load Server Components before Flight rendering. **Bundler-agnostic** — the plugin **never imports** a Flight renderer; the caller picks one of `@vitejs/plugin-rsc`, `react-server-dom-webpack`, `react-server-dom-turbopack`, or `react-server-dom-parcel`. Examples in this README and in the [wiki](https://github.com/greydragon888/real-router/wiki/RSC-Integration) use the Vite import path (`@vitejs/plugin-rsc/rsc`); other bundlers expose the same `renderToReadableStream` shape under their own paths (`react-server-dom-webpack/server.edge`, `react-server-dom-turbopack/server`, `react-server-dom-parcel/server`) — swap the import, keep the call site.

```typescript
// Without plugin: manual per-route Server Component dispatch
const state = await router.start(url);
const node = await getNodeForRoute(state.name, state.params); // manual

// With plugin:
router.usePlugin(rscServerPluginFactory(loaders));
const state = await router.start(url);
const node = state.context.rsc; // resolved automatically
```

## Installation

```bash
npm install @real-router/rsc-server-plugin
```

**Peer dependencies:** `@real-router/core`, `react` (>=19.0.0). No bundler dependency — the caller picks the Flight renderer.

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { rscServerPluginFactory } from "@real-router/rsc-server-plugin";
import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";

const loaders: RscLoaderFactoryMap = {
  "users.profile": () => async ({ params }) => {
    const user = await fetchUser(params.id);
    return <UserProfile user={user} />;
  },
  home: () => () => <HomePage />,
};

const baseRouter = createRouter(routes, { defaultRoute: "home", allowNotFound: true });

// Per-request SSR
const router = cloneRouter(baseRouter, { db: requestDb });
router.usePlugin(rscServerPluginFactory(loaders));

const state = await router.start(req.url);

// 1) Pipe RSC Flight payload (the bundler-specific renderer is *yours*)
if (state.context.rsc) {
  const flightStream = renderToReadableStream(state.context.rsc);
  // … pipe to HTTP response or inline-inject into HTML
}

// 2) Serialize state for client hydration — strip "rsc" (not JSON-serializable)
const ssrState = serializeRouterState(state, { excludeContext: ["rsc"] });

router.dispose();
```

## Configuration

Loaders are keyed by **route name** (not path). Each value is a **factory function** `(router, getDependency) => loaderFn` returning the compiled loader. The factory runs once at plugin registration; the returned loader is cached.

```typescript
import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";

const loaders: RscLoaderFactoryMap = {
  home: () => () => <HomePage />,                         // sync ReactNode
  "users.profile": () => async ({ params }) => {          // async ReactNode
    const user = await fetchUser(params.id);
    return <UserProfile user={user} />;
  },
  "posts.list": (_router, getDep) => async () => {        // DI via getDependency
    const db = getDep("db");
    const posts = await db.posts.findAll();
    return <PostsList posts={posts} />;
  },
};
```

Routes without a matching entry leave `state.context.rsc` as `undefined` and `getSsrRscMode(state)` falls back to `"full"`.

## Per-route SSR mode

`rsc-server-plugin` accepts the same `{ ssr?, loader? }` shape as `ssr-data-plugin`, but with a strict subset of `SsrMode`: only `"full"` and `"client-only"` are allowed. Passing `"data-only"` (RSC has no semantically meaningful "data without component") throws at factory time.

```typescript
const loaders: RscLoaderFactoryMap = {
  home: () => () => <HomePage />,                                 // short form, defaults to "full"
  "admin.dashboard": { ssr: false },                              // false → "client-only"
  "docs.detail": {
    ssr: (state) => state.search.format === "pdf" ? "client-only" : "full",
    loader: () => () => <Doc />,
  },
};
```

| `ssr` value                  | mode marker       | loader behaviour          |
| ---------------------------- | ----------------- | ------------------------- |
| omitted / `true` / `"full"`  | `"full"`          | runs (composes with #596) |
| `false` / `"client-only"`    | `"client-only"`   | **skipped** unconditionally |
| `(state) => RscSsrMode`      | resolver result   | resolved per-navigation   |

Read the resolved mode via `getSsrRscMode(state)` (returns `"full"` for routes without an entry):

```typescript
import { getSsrRscMode } from "@real-router/rsc-server-plugin";

const mode = getSsrRscMode(state); // RscSsrMode = "full" | "client-only"

if (mode === "full") {
  const flight = renderToReadableStream(buildRscPayload(state));
  // … pipe Flight + SSR HTML
}
// mode === "client-only" → no Server Component was rendered server-side
```

## Why `ReactNode`, not Flight bytes?

The plugin publishes a `ReactNode`, not a pre-rendered Flight `Uint8Array`. This keeps the plugin:

- **Bundler-agnostic** — `react-server-dom-{webpack,turbopack,parcel,esm}` have incompatible `renderToReadableStream` signatures; the caller picks the right one
- **Streaming-friendly** — Flight rendering happens out-of-band, in parallel with HTML SSR
- **Aligned with industry** — both React Router 7 (`unstable_RSCStaticRouter`) and TanStack Start (`renderServerComponent`) use the same model

The Flight render itself is one line:

```typescript
const flight = renderToReadableStream(state.context.rsc);
```

## Serialization

`state.context.rsc` is a `ReactNode` tree (functions, symbols) and cannot be JSON-serialized. Use `serializeRouterState`'s `excludeContext` option to strip it before client transport:

```typescript
import { serializeRouterState } from "@real-router/core/utils";

const ssrJson = serializeRouterState(state, { excludeContext: ["rsc"] });
// JSON contains state.context.data and other namespaces, but not state.context.rsc
```

## SSR-Only by Design (with explicit CSR revalidation channel)

This plugin intercepts `start()` only — not `navigate()`. In SSR, the flow is:

```
cloneRouter → usePlugin → start(url) → ReactNode resolved → state.context.rsc
                                                                    ↓
                                                  renderToReadableStream(node)
                                                                    ↓
                                                          Flight stream → HTTP
```

Client-side navigation does **not** re-run the RSC loader by default — application-layer fetching (React Query, Suspense, RSC `/__rsc` endpoint) owns CSR data. The one explicit exception is the `invalidate()` revalidation channel below.

## Client-side revalidation (`invalidate`)

After a mutation, mark the `"rsc"` namespace stale on the router. The next navigation (including a same-route reload) re-runs the RSC loader for the destination route and overwrites `state.context.rsc` before `TRANSITION_SUCCESS` fires — so subscribers see the fresh `ReactNode`.

```typescript
import { invalidate } from "@real-router/rsc-server-plugin";

// Fire-and-forget — stale until the user navigates somewhere.
invalidate(router, "rsc");

// Explicit await — pair with a same-route reload.
invalidate(router, "rsc");
await router.navigate(state.name, state.params, state.search, { reload: true });
```

The flag is **preserved** until a successful, non-cancelled loader write. So a navigation that lands on a route without an entry, a `client-only` route, a mode-only entry, or one that gets cancelled mid-loader (newer `navigate()` aborts the older controller) all leave the flag set for the next attempt. A loader rejection also leaves the flag set — retry re-runs the loader.

Idempotent — multiple `invalidate()` calls between refreshes collapse to one re-run. Surgical for multi-namespace routes — only `"rsc"` re-runs; a side-by-side [`@real-router/ssr-data-plugin`](https://www.npmjs.com/package/@real-router/ssr-data-plugin) keeps its cached `state.context.data` unless its own `invalidate()` was also called.

> **Failure semantics.** The refresh loader runs in the awaited LEAVE_APPROVE phase with no internal `try/catch`, so a rejecting loader **rejects the consuming `navigate()`** — one that would have succeeded *without* `invalidate`. The stale flag is cleared only after a successful write, so a rejection **keeps the flag set**: subsequent navigations to a loader-bearing route re-run the loader and fail again until it recovers (from "stale payload" to "cannot navigate"). Catch the `navigate()` rejection on the caller side, or make the loader infallible (`catch` → previous payload).

### Cancellation-aware loaders

The leave handler passes the navigation's `AbortController.signal` as the second loader argument so loaders can abort their in-flight work (DB query, RSC stream, …) when a newer navigation supersedes:

```typescript
"users.profile": (_router, getDep) => async ({ params }, ctx) => {
  const db = getDep("db");
  const user = await db.users.findById(params.id, { signal: ctx?.signal });

  return <UserProfile user={user} />;
},
```

The start interceptor calls the loader without a context. **Robust loaders check `signal.aborted` upfront** — a signal aborted before `addEventListener("abort", …)` does NOT auto-fire the listener.

Non-breaking via TypeScript contravariance — existing `({ params }) => …` loaders continue to compile and work unchanged.

## Post-hydration loader skip

When the application uses `hydrateRouter()` from `@real-router/core/utils`, the parsed server-serialized state is briefly deposited on a one-shot internal scratchpad before `start()` runs. The plugin reads this scratchpad and **reuses the server-resolved value** if `state.context.rsc` is already present for the same route name — skipping the redundant client-side `ReactNode` resolution on first paint.

In practice, RSC apps usually `excludeContext: ["rsc"]` from the JSON payload (a `ReactNode` tree contains functions/symbols and isn't JSON-serializable). In that case the scratchpad has no `rsc` namespace and the loader runs as today. The skip path matters when the bundler-specific Flight pipeline arranges to thread an already-resolved `ReactNode` through hydration.

The skip is single-shot — only the first `start()` triggered by `hydrateRouter` consumes the scratchpad. Composes with per-route mode: `"client-only"` skips the loader regardless of scratchpad contents (mode wins).

## Typed Loader Errors (`@real-router/rsc-server-plugin/errors`)

Mirror of [`@real-router/ssr-data-plugin/errors`](../ssr-data-plugin/README.md#typed-loader-errors-real-routerssr-data-pluginerrors) — same shared source under `shared/ssr/errors.ts`. RSC apps can import error classes without adding `ssr-data-plugin` as a dependency:

```typescript
import {
  LoaderNotFound,
  LoaderRedirect,
} from "@real-router/rsc-server-plugin/errors";

const loaders: RscLoaderFactoryMap = {
  "users.profile": (_router, getDep) => async ({ params }) => {
    const user = await getDep("db").users.findById(params.id);
    if (!user) throw new LoaderNotFound(`user:${params.id}`);
    return <UserProfile user={user} />;
  },
};

// In the RSC fetch handler:
try {
  const state = await router.start(pathname);
  return new Response(renderToReadableStream(buildRscPayload(state)));
} catch (error) {
  if (error?.code === "LOADER_NOT_FOUND") {
    return new Response("Not Found", { status: 404 });
  }
  throw error;
}
```

`LoaderNotFound`, `LoaderRedirect`, `LoaderTimeout`, `withTimeout` — same shape and structural `code` discriminator as the data-plugin counterparts.

## Cleanup

```typescript
const unsubscribe = router.usePlugin(rscServerPluginFactory(loaders));

// Later — releases "rsc" namespace claim and stops the start interceptor
unsubscribe();
```

In SSR, `router.dispose()` handles cleanup automatically.

## Server Actions (`rscActionPluginFactory`)

For RSC apps that ship Server Actions, this package also exports a **second factory** — `rscActionPluginFactory(getResult)` — that publishes the action result (`returnValue` / `formState`) to `state.context.rscAction`. It claims a separate `"rscAction"` namespace, so it composes with `rscServerPluginFactory` and `ssr-data-plugin` on the same router. Action results are produced *outside* the loader pipeline (typically in the request fetch handler, before the router exists for that request), so they're surfaced via a closure-captured resolver rather than a per-route map.

```typescript
import {
  buildRscPayload,
  rscActionPluginFactory,
  rscServerPluginFactory,
  type RscActionResult,
} from "@real-router/rsc-server-plugin";
// Vite path — swap for `react-server-dom-{webpack,turbopack,parcel}/server.*`
// when you use a different bundler. The plugin itself imports nothing here.
import {
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from "@vitejs/plugin-rsc/rsc";

let actionResult: RscActionResult | undefined;

if (request.method === "POST") {
  const isFormPost = request.headers
    .get("content-type")
    ?.includes("multipart/form-data");

  if (isFormPost) {
    // Progressive enhancement path — POST without JS.
    const formData = await request.formData();
    const decoded = await decodeAction(formData);
    const result = await decoded();
    const formState = await decodeFormState(result, formData);

    actionResult = formState ? { formState } : undefined;
  } else {
    // Hydrated client path — setServerCallback dispatched the call.
    const actionId = request.headers.get("rsc-action") ?? "";
    const fn = await loadServerAction(actionId);
    const args = await decodeReply(await request.text());

    actionResult = { returnValue: { ok: true, data: await fn(...args) } };
  }
}

const router = cloneRouter(baseRouter, requestDeps);

router.usePlugin(
  rscServerPluginFactory(loaders),
  rscActionPluginFactory(() => actionResult), // closure captures live mutation
);

const state = await router.start(new URL(request.url).pathname);
const flight = renderToReadableStream(buildRscPayload(state));
```

Rules:

- `getResult` is **validated at factory time** as a function — a TS-cast bypass that smuggles `null`/`async` through throws `TypeError` synchronously, **before** the `"rscAction"` namespace is claimed.
- The return value is **validated per `start()`** — must be `undefined` (skip the write) or a plain object. Arrays, primitives, and `Promise`/thenables are rejected with a typed message pointing back at the call site. The most common consumer mistake is wiring an `async` getResult; the runtime guard surfaces that explicitly.
- `state.context.rscAction` is plain JSON (no `ReactNode`), so `serializeRouterState(state)` includes it without `excludeContext` — but that JSON copy is for **server-side inspection / logging**, not a client transport. `hydrateRouter` restores only namespaces written by a claim writer, and this plugin's client side never reads the hydration scratchpad, so a serialized `rscAction` **evaporates on the client** (`hydrated.context.rscAction === undefined`). The action result reaches the client via the **Flight payload** — `buildRscPayload(state)` folds `returnValue` / `formState` into the RSC stream, read there with React's `useActionState`. Pass `excludeContext: ["rsc", "rscAction"]` to keep it out of the JSON entirely (e.g. server-only secrets).
- The two plugins coexist regardless of registration order; both namespaces are exclusive (double-registration throws `RouterError(CONTEXT_NAMESPACE_ALREADY_CLAIMED)`).
- `buildRscPayload(state, rootOverride?)` reads `state.context.rsc` + `state.context.rscAction` and returns the canonical `RscPayload<TReturn, TFormState>` Flight shape. `returnValue` / `formState` are **omitted** (not set to `undefined`) when their source is missing — type-safe under `exactOptionalPropertyTypes: true`.

For the full integration recipe (HTML + `/__rsc` endpoints, dev/prod bundler config, Flight injection), see the [Wiki: RSC Integration](https://github.com/greydragon888/real-router/wiki/RSC-Integration) guide.

## Example

- [examples/web/react/ssr-examples/ssr-rsc](../../examples/web/react/ssr-examples/ssr-rsc) — End-to-end dogfooding example: Express + `@vitejs/plugin-rsc` + this plugin, with Flight injection, client navigation via `/__rsc?route=…`, revalidation, and **Server Actions** wired through `rscActionPluginFactory` (see `entry.rsc.tsx` + `NotificationBanner.tsx`). The Playwright suite covers **27 scenarios** including initial HTML load, client nav, revalidation **happy path + in-flight defer** (Scenarios 3 + 3b), 404 routing, per-request isolation under concurrent load, `/__rsc` content-type assertions, loader-driven HTTP status (404/500), search-param flow, browser back/forward, interleaved-click abort, per-route Cache-Control, ETag absence on streamed responses, and the full Server Action lifecycle (form rendering, mutation, `useActionState` validation errors, `NotificationBanner` cross-component reflection via `state.context.rscAction`). `RevalidateButton` calls `invalidate(router, "rsc")` for API symmetry — see [`src/client-components/RevalidateButton.tsx`](../../examples/web/react/ssr-examples/ssr-rsc/src/client-components/RevalidateButton.tsx).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [INVARIANTS.md](INVARIANTS.md) — Property-based invariants
- [Wiki: RSC Integration](https://github.com/greydragon888/real-router/wiki/RSC-Integration) — End-to-end integration guide

## Related Packages

| Package                                                                                     | Description                                              |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                        | Core router (required peer dependency)                   |
| [@real-router/ssr-data-plugin](https://www.npmjs.com/package/@real-router/ssr-data-plugin)  | Sibling plugin for plain JSON data (`state.context.data`) |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                      | React bindings                                           |

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
