---
"@real-router/core": patch
---

Do not commit over a nested navigation that has not finished yet (#1626)

A guard factory recompiled inside `completeTransition` may start a nested
navigation. When that navigation ran to completion, #1611 already refused the
outer commit; when it is still **in flight**, the outer navigation committed on
top of it — `navigate()` resolved with success, `TRANSITION_SUCCESS` was emitted
for a navigation the FSM had already cancelled, and the nested navigation's
result was silently lost.

`isTransitioning()` cannot tell the two apart: with a nested navigation parked in
an async guard the machine *is* in a transition — somebody else's. The commit now
also asks the supersession token (`inFlight.isCurrent(nav.myId)`), and neither
half subsumes the other: the token is unmoved when a factory merely `dispose()`s
the router, and the machine is still transitioning when the supersede is another
navigation. A superseded navigation now rejects `TRANSITION_CANCELLED` and the
nested result stands.
