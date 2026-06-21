---
"@real-router/lifecycle-plugin": minor
---

Support updating lifecycle hooks via `routes.update()` (#797)

`RouteConfigUpdate` is now augmented with `onEnter` / `onStay` / `onLeave` /
`onNavigate` (each `| null` to remove), symmetric with the existing `Route`
augmentation. `getRoutesApi(router).update(name, { onNavigate })` hot-swaps a
hook factory with precise typing; the plugin recompiles it lazily on the next
navigation (the factory-reference change is detected automatically). Previously
the hook patch was silently dropped by core and the old hook kept firing.
