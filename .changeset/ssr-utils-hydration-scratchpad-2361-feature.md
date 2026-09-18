---
"@real-router/ssr-utils": minor
---

The hydration scratchpad lives in this package, read through `getHydrationState(router)` (#2361)

`hydrateRouter` deposits the parsed server state before `router.start()` and
restores the previous value when that call settles, exactly as before — but
into a scratchpad this package owns rather than a slot on core's internals.
`getHydrationState(router)` returns what the in-flight `hydrateRouter` call
deposited, or `null` outside one. There is no exported way to write it, so an
application cannot pre-populate it to skip a loader outside hydration.

`hydrateRouter` still refuses a value that is not a router, a `Proxy` over one
and a router built by another copy of `@real-router/core`, with core's message:
the scratchpad is keyed by router identity, and a plugin reads it with the
router it was installed on.
