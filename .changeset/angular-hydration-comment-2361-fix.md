---
"@real-router/angular": patch
---

A bootstrap comment names where the hydration scratchpad lives (#2361)

`provideRealRouterFactory`'s comment said `hydrateRouter` writes
`RouterInternals.hydrationState`; the scratchpad now lives in
`@real-router/ssr-utils`. No behaviour change.
