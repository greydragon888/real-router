---
"@real-router/preload-plugin": minor
---

Two-channel preload target — `{ params, search }` (#1548)

`PreloadFn` now receives `({ params, search })` instead of `(params)` (RFC-4 M2).
Closes the query-param gap: under the params/search split a preload fn reading a
query param now reads `target.search.x` (path-only via `target.params.id`). New
`PreloadTarget` type is exported. Breaking signature (pre-1.0); migrate
`(params) => …` to `({ params }) => …`.
