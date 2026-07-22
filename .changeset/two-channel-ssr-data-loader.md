---
"@real-router/ssr-data-plugin": minor
---

Two-channel data loader target — `{ params, search }` (#1548)

`DataLoaderFn` now receives `({ params, search }, context?)` instead of
`(params, context?)` (RFC-4 M2). Closes a query-param gap: under the
params/search split the query lives in `state.search`, so a loader reading a
query param (`params.page` before) now reads `target.search.page` — a loader
that kept reading `target.params` would silently see path-only. New
`DataLoaderTarget` type (`{ params, search }`) is exported. Breaking loader
signature (pre-1.0); migrate `(params) => …` to `({ params }) => …`.
