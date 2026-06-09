---
"@real-router/core": minor
---

Emit `TREE_CHANGED` on route-tree mutations via `getRoutesApi().subscribeChanges` (#702)

`getRoutesApi(router)` now exposes `subscribeChanges(handler)` — a single,
fire-and-forget channel for observing **structural** route-tree mutations. It is
emitted post-commit by `add` / `remove` / `replace` / `clear`, and by `update`
only when the patch contains a structural field (`forwardTo` / `defaultParams` /
`encodeParams` / `decodeParams`); guard-only and empty patches stay silent.

```typescript
const routes = getRoutesApi(router);
const unsubscribe = routes.subscribeChanges((event) => {
  switch (event.op) {
    case "add":
      event.added.forEach(register);
      break;
    case "remove":
      event.removedSubtree.forEach((r) => cache.delete(r.name));
      break;
    // update / replace / clear ...
  }
});
```

The channel reuses the router's existing `EventEmitter`, so recursion-depth
protection (`maxEventDepth`) and per-listener error isolation apply
automatically. `RecursionDepthError` (from `@real-router/event-emitter`) is now
re-exported from `@real-router/core` so callers can `instanceof`-check the one
error that escapes a `subscribeChanges` handler.
