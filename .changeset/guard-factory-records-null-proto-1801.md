---
"@real-router/core": patch
---

Guard-factory records are keyed by a route name, so they are null-prototype dictionaries ([#1801](https://github.com/greydragon888/real-router/issues/1801))

`RouteLifecycleNamespace` keeps its guard factories in `Map`s and copies them out
into records keyed by a ROUTE NAME — two in `getFactories()`, four in
`getFactoriesByOrigin()`. All six were plain `{}`, and core accepts a route named
after any `Object.prototype` member, so the same defect surfaced twice over,
differently in each of the two consumers:

- **read by key** — `getRoutesApi` asks `name in canDeactivateFactories`, which
  walks the prototype chain. `get("toString")` reported a `canDeactivate`
  nobody registered, and so did the `TREE_CHANGED` payload that
  `subscribeChanges` consumers reconcile from. Feeding that config back through
  `add()` then threw.
- **enumerate** — `cloneRouter` re-registers through `Object.entries(...)`. For
  `"__proto__"` the write dispatched into the inherited setter, leaving the
  record with no own key, so the loop iterated nothing and **the clone lost a
  blocking `canActivate`** — it navigated to a route the base refuses. Both
  guard origins (route-config and `addActivateGuard`) were affected.

All six records are now `Object.create(null)`, which closes the write, the `in`
read and the enumeration at once, with no per-key branch. This is the discipline
the rest of the layer already used — every `RouteConfig` map, `routeCustomFields`
and the matcher's `staticChildren` — and the records never escape to a consumer,
so nothing observable becomes null-prototype.
