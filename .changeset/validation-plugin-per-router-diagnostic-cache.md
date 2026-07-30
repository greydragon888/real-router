---
"@real-router/validation-plugin": patch
---

Key the diagnostic de-dup caches per router, not per process (#1583)

Both diagnostics (`reportDroppedQueryKey` #1575, `reportUndeclaredParamKey`
#1579) de-duplicated their warnings in a module-level `Set` — one per PROCESS,
shared by every router in it. Every consequence pointed the wrong way for a
dev-time signal:

- a second router never warned for a `route + key` the first had reported,
  including a `cloneRouter` per-request clone: under SSR/SSG the diagnostic
  fired for request #1 and stayed silent for the life of the process;
- `teardown()` did not clear it, so re-registering the plugin bought silence;
- nothing evicted, so it grew without bound.

The caches now live on the validator object, which `buildValidatorObject` builds
once per registration — per-router lifetime, per-router isolation, collected with
the router, and dropped by `teardown()` along with the validator. No new module
state: a closure, not a `WeakMap`.

The two `resetDroppedQueryKeyReports` / `resetUndeclaredParamKeyReports` exports
are removed. They were internal (never re-exported from the package barrel) and
existed only so the tests could work around the module scope — a test seam
compensating for the design rather than the design being per-router.
