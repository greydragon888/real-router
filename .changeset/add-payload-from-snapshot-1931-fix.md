---
"@real-router/core": patch
---

`add`'s `TREE_CHANGED` payload names the route the tree took (#1931)

The payload was walked off the **caller's** array, after the commit. Everything
between the `#1899` snapshot and that walk can change what a second read answers
— guard factories are compiled inside `adoptRouteArtifacts`, and mutating one's
own input array is not a router side effect — so the event could announce a route
`has()` denies while omitting the one that registered. Measured on a route object
whose `name` drifts: the tree holds `b @ /b`, the event announced
`GHOST @ /nope`.

It bites the pattern the docs recommend. `packages/core/CLAUDE.md` shows
`case "add": event.added.forEach(register)`; a name-keyed cache built that way
registered the ghost and never learned about the real route.

`addRoutes` already made that snapshot one frame down and threw it away — it is
returned now, and the payload is built from it. `replace` and `update` were
already right, each for its own reason: `replace`'s payload is store-derived and
`update`'s comes from an already-destructured return.

⚠ The read-count table pinned this door at **1** throughout, and that is why the
defect survived a guard written to catch exactly it: `readsThroughDoor` attached
no `subscribeChanges` listener, and `add` builds the payload only when someone is
listening. The listener is part of the measurement now, for all three
registration doors.
