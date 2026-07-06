---
"@real-router/core": patch
---

Re-export `validateRoute` (+ `Matcher` / `RouteTree` types) from the `@real-router/core/validation` subpath (#1301)

So `@real-router/validation-plugin` reaches the batch route validator through core instead of importing the foundation `route-tree` package directly — keeping core the sole consumer of the routing engine. Plumbing on the plugin-facing subpath (off the main public index); no runtime behaviour change.
