# @real-router/ssr-data-plugin

[![npm](https://img.shields.io/npm/v/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/ssr-data-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/ssr-data-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/ssr-data-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/ssr-data-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Per-route data loading for SSR with [Real-Router](https://github.com/greydragon888/real-router). Intercepts `start()` to load data before server rendering.

```typescript
// Without plugin:
const state = await router.start(url);
const data = await loadRouteData(state.name, state.params); // manual

// With plugin:
router.usePlugin(ssrDataPluginFactory(loaders));
const state = await router.start(url);
const data = state.context.data; // loaded automatically
```

## Installation

```bash
npm install @real-router/ssr-data-plugin
```

**Peer dependencies:** `@real-router/core`, `@real-router/types`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

const loaders: DataLoaderFactoryMap = {
  "users.profile": () => async (params) => fetchUser(params.id),
  "users.list": () => async () => fetchUsers(),
};

// Base router — created once
const baseRouter = createRouter(routes, { defaultRoute: "home", allowNotFound: true });

// Per-request SSR
const router = cloneRouter(baseRouter, { isAuthenticated: true });
router.usePlugin(ssrDataPluginFactory(loaders));

const state = await router.start(url);
const data = state.context.data; // data loaded by matching loader

const html = renderToString(<App />);
router.dispose();
```

## Configuration

Entries are keyed by **route name** (not path). Each value is either a **factory function** `(router, getDependency) => loaderFn` (short form) or an object `{ ssr?, loader? }` with optional per-route SSR mode. The factory runs once at plugin registration; the returned loader is cached. Each loader receives route `params` and returns `Promise<unknown> | unknown`:

```typescript
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

const loaders: DataLoaderFactoryMap = {
  // Short form — defaults to ssr: "full"
  home: () => async () => ({ featured: await fetchFeatured() }),

  // Object form — opt out of server rendering for this route
  "admin.dashboard": { ssr: false },

  // Object form — server fetches data, app ships shell + JSON
  "users.profile": {
    ssr: "data-only",
    loader: () => async (params) => ({ user: await fetchUser(params.id) }),
  },

  // Function-form resolver — mode resolved per-navigation
  "docs.detail": {
    ssr: (state) => state.params.format === "pdf" ? "client-only" : "full",
    loader: () => async (params) => ({ doc: await fetchDoc(params.id) }),
  },
};
```

Routes without a matching entry produce no data — `state.context.data` is `undefined` and `getSsrDataMode(state)` falls back to `"full"`.

## Per-route SSR mode

Three modes are supported. The plugin publishes the resolved mode to `state.context.ssrDataMode`; read it via `getSsrDataMode(state)`:

| `ssr` value                  | mode marker       | loader behaviour          |
| ---------------------------- | ----------------- | ------------------------- |
| omitted / `true` / `"full"`  | `"full"`          | runs (composes with #596) |
| `"data-only"`                | `"data-only"`     | runs (composes with #596) |
| `false` / `"client-only"`    | `"client-only"`   | **skipped** unconditionally |
| `(state) => SsrMode`         | resolver result   | resolved per-navigation   |

`"client-only"` is **symmetric**: the loader is skipped on every `start()` call (server and client). The application reads `getSsrDataMode(state)` and triggers its own client-side fetch (React Query, `useEffect`, Suspense). This keeps the plugin free of environment detection.

```typescript
import { getSsrDataMode } from "@real-router/ssr-data-plugin";

const state = await router.start(url);
const mode = getSsrDataMode(state); // "full" | "data-only" | "client-only"

if (mode === "full") {
  return renderToString(<App router={router} />);
}
return `<div data-ssr-mode="${mode}"></div>`;
```

The function-form resolver receives `state` **before** the mode is written, so it should not read `state.context.ssrDataMode`. Branch on `state.params`, `state.path`, or `state.name`.

See [`examples/web/react/ssr-examples/ssr-mixed/`](../../examples/web/react/ssr-examples/ssr-mixed) for a hybrid pipeline that demonstrates all three modes from a single `entry-server.tsx`.

## Accessing Data

After `await router.start(url)`, data is available on the returned state's context:

```typescript
const state = await router.start(url);
const data = state.context.data; // loaded data, or undefined if no loader matched
```

The plugin claims the `"data"` namespace on `state.context` via the [claim-based API](https://github.com/greydragon888/real-router/wiki/plugin-architecture). Module augmentation on `@real-router/types` provides type safety for `state.context.data`.

## SSR-Only by Design (with explicit CSR revalidation channel)

This plugin intercepts `start()` only — not `navigate()`. In SSR, the flow is:

```
cloneRouter → usePlugin → start(url) → data loaded → state.context.data → renderToString
```

Client-side navigation does **not** re-run the loader by default — application-layer fetching (React Query, Suspense, `useEffect`) owns CSR data. The one explicit exception is the `invalidate()` revalidation channel below.

## Client-side revalidation (`invalidate`)

After a mutation, mark the `"data"` namespace stale on the router. The next navigation (including a same-route reload) re-runs the loader for the destination route and overwrites `state.context.data` before `TRANSITION_SUCCESS` fires — so subscribers see the fresh payload.

```typescript
import { invalidate } from "@real-router/ssr-data-plugin";

// Fire-and-forget — stale until the user navigates somewhere.
invalidate(router, "data");

// Explicit await — pair with a same-route reload.
invalidate(router, "data");
await router.navigate(state.name, state.params, { reload: true });
```

The flag is **preserved** until a successful, non-cancelled loader write. So a navigation that lands on a route without a loader entry, a `client-only` route, a mode-only entry, or one that gets cancelled mid-loader (newer `navigate()` aborts the older controller) all leave the flag set for the next attempt. A loader rejection also leaves the flag set — retry re-runs the loader.

Idempotent — multiple `invalidate()` calls between refreshes collapse to one re-run. Survives `cloneRouter()` boundaries: each clone has its own flag set. Surgical for multi-namespace routes — only `"data"` re-runs; a side-by-side [`@real-router/rsc-server-plugin`](https://www.npmjs.com/package/@real-router/rsc-server-plugin) keeps its cached `state.context.rsc` unless its own `invalidate()` was also called.

### Cancellation-aware loaders

The leave handler passes the navigation's `AbortController.signal` as the second loader argument so loaders can abort their in-flight work (fetch, DB query, …) when a newer navigation supersedes:

```typescript
"users.profile": () => async (params, ctx) => {
  // Network layer cancels on rapid double-click — second click aborts
  // the first nav's controller, fetch sees `signal.aborted` and rejects.
  const response = await fetch(`/api/user/${params.id}`, {
    signal: ctx?.signal,
  });

  return response.json();
},
```

The start interceptor calls the loader without a context — SSR boot path apps thread a request-scoped signal via `cloneRouter(base, { abortSignal })` + `getDep("abortSignal")` + [`withTimeout({ upstreamSignal })`](https://github.com/greydragon888/real-router/wiki/SSR-Cancellation).

**Robust loaders check `signal.aborted` upfront** — a signal aborted before `addEventListener("abort", …)` does NOT auto-fire the listener. Pattern documented in the `home` loader of every `ssr-mixed/` example.

Non-breaking via TypeScript contravariance — existing `(params) => …` loaders without the second arg continue to work; they just don't observe cancellation.

## Post-hydration loader skip (#596)

When the application uses `hydrateRouter()` from `@real-router/core/utils`, the
parsed server-serialized state is briefly deposited on a one-shot internal
scratchpad before `start()` runs. The plugin reads this scratchpad and
**reuses the server-resolved value** if `state.context.data` is already present
for the same route name — skipping the redundant client-side loader call on
first paint.

```typescript
// Server: state.context.data populated by the loader, serialized into HTML
const html = `<script>window.__SSR_STATE__=${serializeRouterState(state)}</script>`;

// Client: hydrateRouter feeds the scratchpad, plugin sees it and skips re-load
await hydrateRouter(router, window.__SSR_STATE__);
// loader was NOT called — state.context.data === server's value
```

The skip is single-shot — only the first `start()` triggered by `hydrateRouter`
consumes the scratchpad. Subsequent navigations run the loader normally.
Composes with per-route mode: `"client-only"` skips the loader regardless of
scratchpad contents (mode wins).

**Mode marker is always written.** Even on a scratchpad-hit the plugin still
calls `claim.write(state, mode)` for `state.context.ssrDataMode` before the
loader-skip branch runs. So a route configured `ssr: "full"` keeps
`getSsrDataMode(state) === "full"` on the client after hydration even when the
loader was skipped — UI conditionals that branch on `ssrDataMode` don't need
to special-case the post-hydration first paint. Symmetric on the rsc-server-plugin
side (`state.context.ssrRscMode`).

## Typed Loader Errors (`@real-router/ssr-data-plugin/errors`)

The plugin is HTTP-agnostic — it only awaits the loader and writes the result to `state.context.data`. To bridge loader failures to HTTP semantics (404, 30x, 504), import typed error classes from the `errors` subpath and let your handler catch them:

```typescript
import {
  LoaderNotFound,
  LoaderRedirect,
  LoaderTimeout,
  withTimeout,
} from "@real-router/ssr-data-plugin/errors";

const loaders: DataLoaderFactoryMap = {
  "users.profile": (_router, getDep) => (params) => {
    const upstreamSignal = (
      getDep as unknown as (k: string) => AbortSignal | undefined
    )("abortSignal");

    return withTimeout(
      "users.profile",
      250,
      async ({ signal }) => {
        // signal aborts on the 250 ms deadline OR on client disconnect
        // (upstream); fetch propagates the abort to the network layer.
        const user = await fetchUser(params.id, { signal });
        if (!user) throw new LoaderNotFound(`user:${params.id}`);
        return { user };
      },
      { upstreamSignal },
    );
  },
  "users.legacy": () => (params) => {
    throw new LoaderRedirect(`/users/${params.id}`, 301);
  },
};

// In the handler:
try {
  const state = await router.start(url);
  return renderHtml(state);
} catch (error) {
  if (error?.code === "LOADER_NOT_FOUND") return res.status(404).send("Not Found");
  if (error?.code === "LOADER_REDIRECT") return res.redirect(error.status, error.target);
  if (error?.code === "LOADER_TIMEOUT") return res.status(504).send("Timeout");
  throw error;
}
```

Discriminator is the `code` field — match structurally without `instanceof`. Identical errors are also re-exported from `@real-router/rsc-server-plugin/errors` (same shared source) so RSC apps don't need to add a `ssr-data-plugin` dependency just to throw `LoaderNotFound`.

## Cleanup

```typescript
const unsubscribe = router.usePlugin(ssrDataPluginFactory(loaders));

// Later — releases "data" namespace claim and stops data loading
unsubscribe();
```

In SSR, `router.dispose()` handles cleanup automatically.

## Streaming SSR

Combine with React 19's `<Suspense>` + `use(promise)` for deferred sections that arrive after the shell. The loader resolves critical data; deferred fetches live inside Suspense components and stream in via `renderToReadableStream`. No router-specific wrapper API needed.

See [`examples/web/react/ssr-examples/ssr-streaming/`](../../examples/web/react/ssr-examples/ssr-streaming) for a complete working example, or the [Streaming SSR wiki guide](https://github.com/greydragon888/real-router/wiki/Streaming-SSR) for the design pattern.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and data flow
- [SSR Example](../../examples/web/react/ssr-examples/ssr) — Full working example (classical, non-streaming)
- [SSR Mixed-mode Example](../../examples/web/react/ssr-examples/ssr-mixed) — Hybrid pipeline: full SSR + data-only + client-only on the same server, **plus the canonical `mutation → invalidate → reload` dogfooding** (Home page Refresh button) replicated across all six adapters with paired `happy path` + `in-flight defer` e2e scenarios
- [Streaming SSR Example](../../examples/web/react/ssr-examples/ssr-streaming) — React 19 native streaming with `<Suspense>` + `use(promise)`
- [Streaming SSR wiki guide](https://github.com/greydragon888/real-router/wiki/Streaming-SSR)

## Related Packages

| Package                                                                                          | Description                                                                                  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [@real-router/core](https://www.npmjs.com/package/@real-router/core)                             | Core router (required peer dependency)                                                       |
| [@real-router/rsc-server-plugin](https://www.npmjs.com/package/@real-router/rsc-server-plugin)   | Sibling plugin — same `start()` interceptor pattern but for `ReactNode` (RSC payload). Runs side-by-side on the same router with distinct namespaces (`data` vs `rsc`). |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin)         | Browser History API integration                                                              |
| [@real-router/react](https://www.npmjs.com/package/@real-router/react)                           | React bindings                                                                               |

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
