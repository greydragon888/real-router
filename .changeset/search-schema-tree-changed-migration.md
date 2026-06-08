---
"@real-router/search-schema-plugin": minor
---

Migrate dev-time defaultParams validation from the `add` interceptor to `TREE_CHANGED` (#702)

The plugin now observes route-tree mutations through
`getRoutesApi(router).subscribeChanges()` instead of the `add` interceptor. This
closes a verified gap: dynamically changing a route's `defaultParams` via
`update()`, or swapping the route set via `replace()`, now re-runs the dev-time
`searchSchema` check. `add` (including parented adds and children) keeps working;
`remove`/`clear` are no-ops. Production mode registers no subscription. The
runtime `forwardState` validation path is unchanged.
