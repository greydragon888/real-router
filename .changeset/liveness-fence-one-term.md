---
"@real-router/core": patch
---

The liveness fence asks one term (#1734)

Both fences — the guard walk's and `finishAsyncNavigation`'s — asked
`isCurrentNavigation(plan) && !signal.aborted`. The identity half is gone; the
predicate is `!signal.aborted`, and the local is named `isLive` rather than
`isCurrentNav`, which had stopped being what it asks.

Measured before removing it. Instrumented over the whole tier, the fence
evaluates 1406 times in three combinations: `identity=true, aborted=false`
(1375), `identity=true, aborted=true` (22), `identity=false, aborted=true` (9).
The fourth — `identity=false, aborted=false`, the only one where identity is the
deciding term — never occurs, because every path that supersedes a navigation
cancels it first through FSM `CANCEL`. Dropping the term reds zero of 4092.

What it did hold was the consequence of a different breakage: with
`abortPreviousNavigation`'s cancel stripped, the tier went 26 red with the term
and 30 without. That defence is now gone by decision — a broken cancel surfaces
as 31 failures instead of 26, and the navigation it would have fenced walks on.

No behaviour change on healthy code: `CANCEL` carries no `update`, so
`ctx.inflight` still names the navigation on the way out and identity answered
`true` in every one of the 22 cancellations the tier exercises.
