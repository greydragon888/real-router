---
"@real-router/core": patch
---

Throw `ROUTER_DISPOSED` from a bound `subscribeChanges()` reference used after `dispose()` (#982)

A `getRoutesApi(router).subscribeChanges()` reference captured before `dispose()` — `const s = routes.subscribeChanges.bind(routes)` — reached the unguarded `EventBusNamespace.subscribeTreeChanged`, the internal route-tree counterpart of the `subscribe`/`subscribeLeave` channels fixed in #946. Since `dispose()` had already run `clearAll()`, `emitter.on` recreated the `TREE_CHANGED` listener `Set` and added the listener — which could then NEVER fire (the FSM is `DISPOSED` and the route tree is torn down, no future emit): a silent no-op. Core now enforces the disposed state inside `subscribeTreeChanged` itself, completing the guard across all three subscription primitives (`subscribe`/`subscribeLeave`/`subscribeTreeChanged`), so a pre-bound `subscribeChanges` reference throws `RouterError(ROUTER_DISPOSED)` — consistent with the sibling `getRoutesApi` methods (`add`/`remove`/`update`/`clear`) and with a direct post-dispose call.
