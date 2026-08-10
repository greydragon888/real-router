---
"@real-router/core": patch
---

The bridge's closer is the registration's return value (#1724)

Registering the bridge onto a caller's `opts.signal` and recording the closer
that undoes it used to be two statements whose ORDER was the contract:
`addEventListener` first, because it is a call into application code and can
throw, and a closer recorded ahead of it would stand on a plan the machine has
already published — the next terminal edge calls it, the removal throws the same
way, and the throw lands inside the `CANCEL` action above its own event, so the
FOLLOWING navigation dies with no event of any kind.

`bridgeSignal(signal, onAbort, onClosed)` now performs the registration and
RETURNS the closer, so the caller records it in one expression. There is no
moment at which a closer exists and the listener does not, and a failed
registration leaves the plan clean by construction rather than by care. The
self-clearing half moves to the caller — the field belongs to the plan — so
`plan.detachExternalBridge?.()` remains the whole closing protocol for all three
terminal edges.

Runtime behaviour is unchanged; the shape is what changed.
