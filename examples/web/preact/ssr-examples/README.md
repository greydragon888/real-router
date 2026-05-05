# Preact SSR Examples

> Server-side rendering, static site generation, and HTTP-streaming SSR with Real-Router and Preact 10.

Three example apps mirroring the structure of [`../../react/ssr-examples/`](../../react/ssr-examples) — minus React-specific scenarios that Preact does not support.

| Subdir | Demonstrates |
|---|---|
| [`ssr/`](./ssr) | Classical per-request `cloneRouter` + `start` + `renderToString` + hydration. Auth-gated routes, typed loader errors → 301/404/504, `useId`-stable form labels, per-route meta + canonical/og, ETag + Cache-Control + AbortController. |
| [`ssr-streaming/`](./ssr-streaming) | `renderToReadableStream` (since `preact-render-to-string@6.5.x`) + `Transfer-Encoding: chunked`. Critical data via `ssr-data-plugin`. **Out-of-order code-split streaming** via `<Suspense>` + `lazy()` — `<preact-island>` custom element swaps fallback ↔ resolved at the HTML level (since `@6.6.x`). |
| [`ssg/`](./ssg) | Build-time `getStaticPaths` + `renderToString` per URL + write HTML files. Nested SSG, dynamic entries, canonical/og, filesystem layout assertions, `404.html`, `sitemap.xml`, `LoaderNotFound` aborts the build. |

## Why no `ssr-rsc/`?

Preact does **not** support React Server Components.

The Preact maintainers have explicitly stated this is a design choice, not a temporal gap. From [preactjs/preact#2879](https://github.com/preactjs/preact/discussions/2879):

> "The result (HTML with islands of interactivity) is something we've already been executing around, but the specific technical approach React is using is not in line with Preact's goals."

Concrete consequences:

- **`react-server-dom-*` is incompatible with Preact** at the wire-protocol level. The Flight protocol is React-specific.
- **Fresh** (Deno meta-framework) ships *its own* server components model — different protocol, framework-bound, not portable as a library.
- **Preact v11** (still in preview as of May 2026) has no announced PSC roadmap.

If you want React Server Components, use the React adapter: [`../../react/ssr-examples/ssr-rsc/`](../../react/ssr-examples/ssr-rsc).

## Other Preact-specific limits documented in each README

| Feature | Preact 10 | Preact v11 (planned) | React 19 |
|---|---|---|---|
| `renderToString` (sync) | ✅ | ✅ | ✅ |
| `renderToStringAsync` (await all promises) | ✅ unique to Preact | ✅ | ❌ |
| `renderToReadableStream` (Web Streams) | ✅ since 6.5.x | ✅ | ✅ |
| `useId` SSR-stable IDs | ✅ since 6.6.5 | ✅ | ✅ |
| `<Suspense>` + `lazy()` (code-split) | ✅ | ✅ | ✅ |
| Out-of-order streaming for `lazy()` boundaries (`<preact-island>` custom element swap) | ✅ since 6.6.x — verified empirically | ✅ | ✅ via `<!--$?-->` + `<template id>` |
| Out-of-order Suspense for **non-lazy** boundaries | ❌ — only `lazy()` triggers the island swap | ✅ planned | ✅ |
| `<Suspense>` + `use(promise)` for in-component data deferral | ❌ no `use(promise)` hook | ❓ unannounced | ✅ |
| Async function components inside `<Suspense>` (server-only render) | ⚠️ silent skip — empirically tested | ❓ unannounced | ✅ |
| RSC / Flight protocol | ❌ design choice | ❌ design choice | ✅ |

When a feature is unavailable in Preact, the corresponding example **honestly omits** it (instead of faking it with extra abstraction). See per-subdir README for specifics.

### Empirical findings from this dogfooding pass

Two non-obvious results from building these three examples:

1. **`<preact-island>` out-of-order streaming exists in v10 for `lazy()` boundaries.** The Preact-www v10 docs warn about hydration that "can pause and wait for JS chunks" — widely read as "no out-of-order Suspense in v10". That warning is about hydration semantics, NOT about the streaming wire signature. The wire signature is alive: server emits `<!--preact-island:-N-->` markers + inline fallback, then a trailing `<preact-island hidden data-target="-N">…</preact-island>` chunk after the dynamic import resolves, with a custom-element bootstrap that swaps fallback ↔ resolved client-side. Verified by 4 e2e tests in `ssr-streaming/`.

2. **Two-versions-of-preact pitfall.** `@real-router/preact`'s peer dependency on `preact >= 10.0.0` lets two copies of preact (e.g. 10.25.4 from the adapter's devDeps + 10.28.2 pinned in the example) both end up in the bundle, producing two hook runtimes and `Cannot read properties of undefined (reading '__H')` on hydration. Fix: `resolve.dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"]` in the example's `vite.config.ts`. **All three examples ship this fix** — required pattern for any Preact monorepo example using `@real-router/preact`.

## See Also

- [React SSR examples](../../react/ssr-examples) — full feature parity reference
- [`@real-router/preact`](../../../../packages/preact) — adapter package
- [`@real-router/ssr-data-plugin`](../../../../packages/ssr-data-plugin) — per-route data loading (view-agnostic)
- [`@real-router/ssr-data-plugin/errors`](../../../../packages/ssr-data-plugin/src/errors.ts) — typed loader errors (`LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, `withTimeout`)
- [Preact SSR Guide v10](https://preactjs.com/guide/v10/server-side-rendering/)
- [`preact-render-to-string` releases](https://github.com/preactjs/preact-render-to-string/releases) — streaming added in 6.5.x, useId in 6.6.5
- [Preact Server Components discussion](https://github.com/preactjs/preact/discussions/2879)
