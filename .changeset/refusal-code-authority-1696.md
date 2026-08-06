---
"@real-router/core": patch
---

A table condition landing on an asked edge now has to say what its refusal reports ([#1696](https://github.com/greydragon888/real-router/issues/1696))

The router asks the transition table before firing in five places, and every one of those refusals is a statement about the router's **state** — "not started", "already started", "disposed", or a silent no-op. A `when` refusal is a different kind of refusal on the same wire, and it would inherit whichever of those sentences the call site happens to throw: measured on the real table, a context-dependent condition on `NAVIGATE` surfaces as `ROUTER_NOT_STARTED` and a payload-dependent one as `TRANSITION_CANCELLED`, while the router is started and nothing was cancelled.

Nothing is broken today — `COMPLETE` is the only asked edge carrying a condition, and its `TRANSITION_CANCELLED` is honest, because `mayCommit` refuses for exactly three reasons and all three are cancellations. So this ships the guard rather than a fix, and deliberately **no new error code**: the right one depends on a condition that does not exist yet, and an `errorCodes` key with no producer is public surface for nothing.

`refusal-code-authority-1696.test.ts` is a closed-set assertion over asked events that carry a `when`, each with the code its refusal reports. It does not forbid conditions — the table's direction is more of them — it fails when one lands on an asked edge without that decision being made in the same change.

Also documented at `canBeginTransition`: the ask answers "is this edge declared from where I am", is made with no payload (before the plan that would be the payload exists), and therefore cannot be a verdict about a payload-reading condition.
