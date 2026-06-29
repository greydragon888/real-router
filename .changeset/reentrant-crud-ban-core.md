---
"@real-router/core": minor
---

Ban synchronous reentrant route-CRUD from `subscribeChanges` handlers (#1032)

**Breaking change (pre-1.0).** A route-CRUD op — `add()` / `remove()` / `update()` / `clear()` / `replace()` on `getRoutesApi(router)` — called from **inside a `subscribeChanges` handler** (while a `TREE_CHANGED` event is being dispatched) now throws `RouterError(REENTRANT_TREE_MUTATION)` synchronously, **before mutating the tree**, instead of nesting a recursive `TREE_CHANGED` cascade.

This removes a class of non-atomic, causally-inconsistent behaviour: previously a reentrant cascade was bounded only by `maxEventDepth`, throwing `RecursionDepthError` mid-cascade and leaving a **partially-mutated tree** (a throwing `add()` had already committed routes), and downstream listeners observed events **out of causal order** (the reentrant-triggered event arrived before the triggering one). Mirrors the reentrant-`navigate` ban (`REENTRANT_NAVIGATION`).

Inside a handler the throw is surfaced by the emit's `onListenerError` isolation (visible, non-fatal), so the outer op still completes. Deferred CRUD is unaffected, and CRUD from a *transition* listener (`router.subscribe`, not a `TREE_CHANGED` dispatch) remains allowed.

**Migration:** defer the mutation so it runs after the dispatch settles:

```diff
- routes.subscribeChanges(() => { routes.add({ name: "x", path: "/x" }); });
+ routes.subscribeChanges(() => { queueMicrotask(() => routes.add({ name: "x", path: "/x" })); });
```
