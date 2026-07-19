---
"@real-router/core": minor
---

Remove the unused public `Config` type

The `Config` interface (exported from `@real-router/core/types`) is removed. It was a
vestigial public export consumed by nothing — not `@real-router/core` internally, and not
a single adapter, plugin, or example across the monorepo — and merely duplicated four
fields of the internal `RouteConfig` (which additionally carries `forwardFnMap`).

**Breaking only for external code that imported `Config` from `@real-router/core/types`.**
There is no public replacement: the per-route config shape (decoders / encoders /
`defaultParams` / `forwardMap`) is an internal concern with no supported public type.
Nothing needs it — the export never had a consumer.
