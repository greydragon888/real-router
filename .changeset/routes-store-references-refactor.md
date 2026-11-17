---
"@real-router/core": minor
---

Move the tree-change channel from `RouterInternals` onto the routes store, and seal the references the store carries for its doors (#2952)

**Breaking Change:** only for code that reaches core's internals through `getInternals` from `@real-router/core/validation`.

- `RouterInternals` no longer has `treeChanged`. Subscribe to route-tree changes through `getRoutesApi(router).subscribeChanges(handler)`. Emitting on the channel, counting its listeners and asking whether it is emitting have no public replacement.
- The store that `routeGetStore()` returns carries the channel as `treeChanged`. Its `treeChanged`, `depsStore` and `lifecycleNamespace` slots refuse an assignment, a redefinition and a `delete`; in strict mode each refusal is a `TypeError`. The channel object is frozen, and the three slots are `readonly` in the type `routeGetStore()` returns.

`subscribeChanges`, its payloads and the `REENTRANT_TREE_MUTATION` ban are unchanged.
