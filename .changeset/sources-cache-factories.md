---
"@real-router/sources": minor
---

feat: per-router caching for all sources + helpers for adapters

- `getErrorSource(router)` and `getTransitionSource(router)` — cached factories for shared eager sources. Multiple consumers (mount/unmount cycles) reuse one instance; external `destroy()` is a no-op on the cached wrapper, so adapters with eager teardown (Angular `sourceToSignal`) are safe by default.
- `createRouteNodeSource(router, nodeName)` now caches per `(router, nodeName)` pair — N consumers of the same node share one router subscription instead of creating N.
- `createActiveRouteSource(router, name, params?, options?)` now caches per `(router, name, canonicalJson(params), options)`. Key-order-insensitive (`{ a:1, b:2 }` and `{ b:2, a:1 }` hit the same entry). `Symbol`/`BigInt` params fall back to creating a fresh uncached source.
- New exports: `DEFAULT_ACTIVE_OPTIONS`, `normalizeActiveOptions(opts?)`, `canonicalJson(value)`.
- Removed internal `shouldUpdateCache` helper — `createRouteNodeSource` now caches the `shouldUpdateNode` closure itself as part of the source cache.
