---
"@real-router/react": minor
---

Narrow `useRoute()` return type so `route` is non-nullable; throw a clear error when the router has no active state (#535)

`useRoute()` previously returned `{ route: State | undefined }`, forcing every consumer to write `route?.x` or `if (!route) return null` — defensive code for a case that is unreachable once `await router.start()` has resolved. The hook now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before start (or after stop/dispose), and the return type narrows so consumers can read `route.params.id` directly. `useRouteNode(name)` is unchanged — `route === undefined` there is a legitimate "node inactive" business state.
