---
"@real-router/core": minor
---

`RouterInternals` no longer carries `hydrationState` (#2361)

Core never read the hydration scratchpad — it only initialised the slot that
`@real-router/ssr-utils`' `hydrateRouter` wrote and the SSR loader plugins read.
The scratchpad now lives in `@real-router/ssr-utils` and is read through its
`getHydrationState(router)`, so `getInternals(router).hydrationState` no longer
exists. `validator` is the one writable member left on `RouterInternals`.

`SerializedRouterState` stays in `@real-router/core/types`: the shape is core's
own `State`.
