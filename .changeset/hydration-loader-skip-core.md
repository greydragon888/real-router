---
"@real-router/core": minor
---

Eliminate post-hydration loader re-run via one-shot hydration scratchpad (#596)

`hydrateRouter()` now deposits the parsed `SerializedRouterState` (incl. plugin
context namespaces) onto a one-shot internal scratchpad before delegating to
`router.start(parsed.path)`, then clears it in `finally`. SSR loader plugins
read the scratchpad via a monorepo-internal helper to skip their loader call
when the server-resolved value is already present — avoiding the duplicate
loader fire on first paint.

The new `SerializedRouterState` type is exported from `@real-router/core/utils`
to give consumers a stable name for the parsed-state shape produced by
`serializeRouterState()`.
