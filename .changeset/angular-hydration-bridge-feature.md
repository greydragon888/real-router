---
"@real-router/angular": minor
---

Angular post-hydration loader skip via TransferState bridge (#599)

`provideRealRouterFactory` now bridges Angular's `TransferState` to the
hydration scratchpad established by #596:

- **Server pass** — after `await router.start(path)` resolves, the
  resulting state is serialized via `serializeRouterState(state)` and
  written to `TransferState` under `@real-router/angular:ssrState`.
  Angular's standard SSR pipeline (`provideClientHydration()` +
  `provideServerRendering()`) embeds the entry as `<script id="ng-state"
  type="application/json">…</script>` in the response body.
- **Client pass** — the same `provideAppInitializer` callback reads
  `TransferState`, finds the seeded JSON, and calls
  `hydrateRouter(router, ssrJson)` instead of `router.start(path)`.
  `hydrateRouter` deposits the parsed state into the one-shot
  scratchpad on `RouterInternals.hydrationState`, and `ssr-data-plugin`'s
  start interceptor reuses the server-resolved `state.context.data`
  without invoking the loader on first paint — parity with the other 5
  adapters that consume `<script>window.__SSR_STATE__</script>` in their
  `entry-client.tsx`.
- **Pure CSR** — no TransferState seed and `inject(REQUEST, { optional:
  true })` returns null; falls back to `router.start(path)` with no write.

The TransferState key is internal — no public API surface change. Existing
8 Angular examples (basic, combined, dynamic-routes, hash-routing,
lazy-loading, nested-routes, persistent-params, animation-examples/*)
continue to use `provideRealRouter` for SPA scenarios; the bridge applies
only to apps using `provideRealRouterFactory` together with
`provideClientHydration()`.

Verified end-to-end by `post-hydration loader skip (#599)` e2e in both
`examples/web/angular/ssr-examples/ssr/` and
`examples/web/angular/ssr-examples/ssr-streaming/` — counter on
`window.__LOADER_CALLS__` stays empty after deep-link navigation, parity
with the 5 cross-adapter baselines.
