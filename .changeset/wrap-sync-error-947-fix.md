---
"@real-router/core": patch
---

Stop a guard-thrown thenable from making the wrapped `RouterError` thenable (#947)

When a transition step (e.g. a route guard) throws a thenable — a non-`Error` object
exposing a `then` method — `wrapSyncError()` spread its own-enumerable properties onto the
`RouterError` metadata, filtering only the reserved keys `code` / `segment` / `path`. `then`
was not filtered, so the produced `RouterError` carried a `then` function and was itself
thenable: a consumer that `await`ed it (or passed it through `Promise.resolve`, or returned
it from an `async` function) had it assimilated as a Promise instead of treated as a plain
rejection reason.

`wrapSyncError()` now also excludes `then` from the spread. Other own properties are still
copied onto the error metadata.
