---
"@real-router/core": minor
---

fix(core): `clear()` refuses while a state is committed, instead of resetting it silently (#1612)

**Breaking change (pre-1.0).** `getRoutesApi(router).clear()` now throws `RouterError(ROUTER_NOT_STOPPED)` when `router.getState() !== undefined`. It is legal before `start()` and after `stop()`.

`clear()` used to drop the committed state to `undefined` and tell nobody: every `router.subscribe` consumer — `@real-router/sources` and all six framework adapters through `useSyncExternalStore` / signals — kept rendering a route the router had already discarded. It also left the router in `isActive() === true` with no state, a shape that otherwise exists only *during* `start()`; an always-on guard already misreads it, with path-less `navigateToNotFound()` answering `ROUTER_NOT_STARTED` on a started router.

Announcing the reset instead (making `clear()` behave like `replace([])`) was measured and rejected. It would make route CRUD emit a transition event as a **rule** — `replace()` is deliberately the one structural mutation that emits one — and it would not remove the shape, only make it prettier. It is also not the same operation: `replace([])` preserves external guards, `clear()` destroys them. Refusing removes the crossing outright: `clear()` stops writing into state it does not own.

**Migration.** To swap the tree on a **running** router use `replace(routes)` — atomic, one tree rebuild, notifies subscribers, and preserves external guards:

```diff
- routesApi.clear();
- routesApi.add(newRoutes);
+ routesApi.replace(newRoutes);
```

To genuinely tear the router down, stop it first:

```diff
+ router.stop();
  routesApi.clear();
```

The pre-existing "navigation in progress" precondition is unchanged and still logs-and-no-ops; the two hand over to each other, since it now applies only in the window where a navigation is in flight and no state is committed yet — the initial `start()`.

Also records `clear()`'s atomicity contract, which was never written down: unlike `replace` / `add` / `update` (prepare-then-commit, pre-flighted, declared), `clear()`'s is **structural** — three consecutive steps that hold together only because no user code runs in them. `INVARIANTS.md` now states it with its class named, backed by a post-condition property test (tree, guards and BOTH state cells go empty together), so a callback landing in one of those steps is recognised as a contract break rather than a refactor.

New error code: `errorCodes.ROUTER_NOT_STOPPED` (`"NOT_STOPPED"`).
