---
"@real-router/core": patch
---

A failed `start()` no longer steals the band from a live navigation (#1671 #1673)

`RouterLifecycleNamespace.start` reported its `ROUTE_NOT_FOUND` through the FSM
(`sendFail`), while the identical refusal in `NavigationNamespace` reports
directly — channel (б) in `wireNamespaces`, "early refusals report to observers
without moving the machine". Going through the table is what made the failure
of one operation reach the edges of another.

A `start()` parked in an async interceptor resumes after a `stop()`, a second
`start()` and a `navigate()` have moved the machine on — the one re-check there
is `isIdle()`, which none of that trips. Its `ROUTE_NOT_FOUND` then took
`TRANSITION_STARTED --FAIL--> READY`: plugins were told the LIVE navigation's
route had failed, that navigation was cancelled, its `TRANSITION_SUCCESS` never
fired, and the committed state stayed behind — the guard had already approved
the move. `#1671`'s split-by-edge could not catch it, because the edge cannot
tell a navigation's failure from a report that merely happened during one.

The report was also a DUPLICATE: `Router.#unwindFailedStart` already sends FAIL
for a start that threw while `STARTING`, which is how the two sibling refusals
in the same method (the cancelled-mid-window one and the path type guard) have
always reported. Measured: removing it leaves the observable behaviour of a
plain unmatched `start()` unchanged — one `TRANSITION_ERROR`, same `undefined`
target, router back at IDLE — so the sender is gone, together with the
`emitTransitionError` member it was the only caller of.
