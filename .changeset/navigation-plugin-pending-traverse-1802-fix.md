---
"@real-router/navigation-plugin": patch
---

A refused `traverseToLast()` no longer hijacks the next navigation (#1802)

`traverseToLast` stages a pending traverse record before starting the
navigation that consumes it, and the three lifecycle hooks were its only
readers. A navigation refused **synchronously** at the facade — the reentrancy
ban, which an app reaches by calling `traverseToLast` from a `router.subscribe`
listener — emits no hook at all, so the record stayed set: the next, unrelated
`navigate()` sent the browser to the stale entry while the router committed a
different route, and that transition wore the traverse's metadata
(`navigationType: "traverse"`) instead of its own.

The record is now retired on that door too, through the single helper the
cancel and error hooks already share.
