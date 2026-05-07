---
"@real-router/ssr-data-plugin": minor
---

Add per-route SSR mode (#597)

`ssrDataPluginFactory` now accepts a per-route object form `{ ssr?, loader? }`
where `ssr` is `"full" | "data-only" | "client-only" | boolean | (state) => SsrMode`.
The resolved mode is published to `state.context.ssrDataMode`. New helper
`getSsrDataMode(state)` returns the mode (fallback `"full"`).

When mode is `"client-only"` the loader is **skipped on every `start()` call**
(server and client). The application reads the mode marker and triggers its own
client-side fetching strategy. Short-form (loader factory directly) remains valid.

Breaking on the type level: `DataLoaderFactoryMap` now accepts a union of
factory or `{ ssr?, loader? }` per entry. Existing consumers passing a factory
directly continue to work; consumers iterating the map (`Object.entries`) need
a narrow / cast (e.g. `(Object.entries(loaders) as [string, DataLoaderFnFactory][])`).
