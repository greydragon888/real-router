---
"@real-router/preload-plugin": minor
---

Support updating `preload` via `routes.update()` (#797)

`RouteConfigUpdate` is now augmented with `preload` (`| null` to remove),
symmetric with the existing `Route` augmentation.
`getRoutesApi(router).update(name, { preload })` hot-swaps the preload factory
with precise typing; it is picked up lazily on the next hover/touch (the factory
reference change invalidates the compiled cache). Previously the patch was
silently dropped by core and the old factory stayed compiled.
