---
"@real-router/search-schema-plugin": minor
---

Support updating `searchSchema` via `routes.update()` (#797)

`RouteConfigUpdate` is now augmented with `searchSchema` (`| null` to remove),
symmetric with the existing `Route` augmentation.
`getRoutesApi(router).update(name, { searchSchema })` swaps the schema with
precise typing; the next navigation validates against it (the schema is read
lazily per navigation). Previously the patch was silently dropped by core and
navigation kept validating against the stale schema.
