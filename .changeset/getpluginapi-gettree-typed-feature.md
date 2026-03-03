---
"@real-router/core": minor
---

Override `PluginApi.getTree()` return type to `RouteTree` and re-export `RouteTree` (#214)

`getPluginApi(router).getTree()` now returns properly typed `RouteTree` instead of `unknown`.
`RouteTree` type is also re-exported from `@real-router/core` for convenience.

This is a type-only change — no runtime behavior changed.
