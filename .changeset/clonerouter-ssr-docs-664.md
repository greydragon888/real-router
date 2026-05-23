---
"@real-router/core": patch
---

Document `cloneRouter` shallow-merge dependency semantics for SSR multi-tenancy (#664)

Clarifies in JSDoc and `IMPLEMENTATION_NOTES.md` that
`base.dependencies` values are shared by reference between the base
router and every clone (singleton services like DB clients depend on
this). Per-request mutable state — `currentUser`, `traceId`,
`sessionId` — must flow through the `cloneRouter` override parameter
or `createRequestScope`, never `base.dependencies`. No behaviour
change.
