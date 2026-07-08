---
"@real-router/core": patch
---

Make `addInterceptor`'s unsubscribe idempotent (#1198)

`addInterceptor`'s unsubscribe spliced by `list.indexOf(fn)` with no guard, so calling the first unsubscribe twice — documented as safe by the `Unsubscribe` contract — removed a SECOND registration of the same `fn` (e.g. a shared module-level interceptor helper used by two plugin instances), silently deactivating another plugin's interceptor. A `removed` flag now short-circuits repeat calls, mirroring `extendRouter`.
