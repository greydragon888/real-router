---
"@real-router/rsc-server-plugin": minor
---

Two-channel RSC loader target — `{ params, search }` (#1548)

`RscLoaderFn` now receives `({ params, search }, context?)` instead of
`(params, context?)` (RFC-4 M2), mirroring `ssr-data-plugin`. Closes the same
query-param gap: a loader reading a query param now reads `target.search.x`.
New `RscLoaderTarget` type is exported. Breaking loader signature (pre-1.0);
migrate `(params) => …` to `({ params }) => …`.
