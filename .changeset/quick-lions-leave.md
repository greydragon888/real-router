---
"@real-router/core": patch
---

Make `subscribeLeave`'s unsubscribe idempotent (#1349)

`subscribeLeave` stored the listener directly in `#leaveListeners` and spliced by `indexOf(listener)` with no `removed` flag — the exact sibling of #1198 (`addInterceptor`), in a channel the `Unsubscribe` contract explicitly names as idempotent. With the same `fn` registered twice, calling the first unsubscribe twice removed a second registration, silently deactivating another subscriber's leave handler. A `removed` flag now short-circuits repeat calls (mirroring `addInterceptor` / `extendRouter`). Unlike `subscribe` / `subscribeChanges`, `subscribeLeave` does not wrap the listener in a fresh closure, so it needed the explicit guard. The misleading "irrelevant in practice" note in the JSDoc is corrected.
