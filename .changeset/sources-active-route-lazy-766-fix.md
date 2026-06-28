---
"@real-router/sources": minor
---

fix(sources): make createActiveRouteSource lazy to close the listener-limit crash (#766)

`createActiveRouteSource` previously connected to the router **eagerly** at construction and cached every distinct `(name | params | options)` key with a no-op `destroy()`, so each unique key held a permanent `router.subscribe` handle that survived all Link unmounts. A long-lived router with per-item-params Links (infinite feed, virtualized table, pagination by id) accumulated handles until the `EventEmitter` listener limit (10000) threw in the render path.

It now uses the **lazy connection** the docs already promised: subscribe on the first listener, disconnect on the last, reconcile the snapshot on re-subscribe (same pattern as `createRouteNodeSource` / #765). The cache entry stays (a cheap closure) but holds no router subscription while it has zero listeners — unmounted Links stop costing a listener, and creating an unbounded number of unique keys no longer crashes.

**BREAKING:** the snapshot no longer updates while the source has zero subscribers (the previously-undocumented eager behaviour). Consumers that read `getSnapshot()` without subscribing must subscribe first; framework adapters (which bridge via `useSyncExternalStore` / signals) are unaffected.
