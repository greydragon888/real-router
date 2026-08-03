---
"@real-router/core": minor
---

`navigateToNotFound` refuses before the start navigation commits, and the system commit says why it refused (#1644)

Two defects with one root. The state-ownership slice replaced
`navigateToNotFound`'s liveness gate — `!isActive()`, i.e. IDLE or DISPOSED —
with the transition table's `canSend(SYSTEM_COMMIT)`, which is true on `READY`
alone. Those are different questions ("is the router alive?" versus "is the
machine in the one phase that commits?"), and the wider one kept the narrower
one's error code.

**A 404 committed before `start()` has committed anything is a phantom.** Call
`router.navigateToNotFound(path)` from a plugin's `onStart` hook and it
committed `UNKNOWN_ROUTE` — then the boot's own commit overwrote it a tick
later, so every `router.subscribe` consumer saw a `TRANSITION_SUCCESS` for a
state that never survived. That is the shape #1610 removed from the other
pre-start windows; this one was reachable on both sides of the slice. It now
throws `ROUTER_NOT_STARTED`, and the boot announces exactly one commit.

The refusal is deliberately narrow: it fires only when nothing is committed AND
no navigation is in flight. A `navigateToNotFound` from a guard of the start
navigation still commits, because the primitive aborts that navigation first —
its 404 displaces the boot's commit instead of being overwritten by it, so it is
the final word rather than a phantom.

**The refusal now reports the reason it refused.** `ROUTER_DISPOSED` is kept for
a router that really was disposed (the #1186 / #1627 contract, unchanged); a
router that is merely starting, stopped or mid-transition gets
`ROUTER_NOT_STARTED` with a message naming the phase. Previously all of them
claimed disposal on a router whose own `isActive()` returned `true` — including
`replace()`'s revalidation when application code left a navigation in flight
across it.

If you catch by code around either primitive: a stopped or starting router that
used to surface as `DISPOSED` now surfaces as `NOT_STARTED`. `DISPOSED` still
means what it says.
