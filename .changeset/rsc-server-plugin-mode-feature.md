---
"@real-router/rsc-server-plugin": minor
---

Add per-route SSR mode (#597)

Mirror of `ssr-data-plugin`: `rscServerPluginFactory` now accepts the
`{ ssr?, loader? }` shape per route. `RscSsrMode = "full" | "client-only"` —
`"data-only"` is rejected at factory time (RSC has no semantically meaningful
"data without component"). Mode is published to `state.context.ssrRscMode`;
read via `getSsrRscMode(state)` (fallback `"full"`).

When mode is `"client-only"` the loader is skipped unconditionally; the
application is responsible for fetching the Server Component tree via a
separate mechanism.

Breaking on the type level: `RscLoaderFactoryMap` now accepts a union of
factory or `{ ssr?, loader? }` per entry. Existing consumers passing a factory
directly continue to work without changes.
