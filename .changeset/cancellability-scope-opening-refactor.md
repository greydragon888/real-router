---
"@real-router/core": patch
---

Open the cancellability scope from the NAVIGATE edge's action (#1724)

The bridge that routes a caller's `opts.signal` onto FSM `CANCEL` is registered
by the `NAVIGATE` edge's own action instead of by the pipeline, so the machine
now owns both ends of the scope's lifetime — it already owned closing it
(`CANCEL` / `FAIL` / `COMPLETE`, #1716).

That retires the one closing call the pipeline still made. It existed for a
navigation whose `NAVIGATE` the table refused: such a navigation had a listener
standing on the application's own `AbortController` and no edge that would ever
fire to remove it, so `beginTransition` removed it by hand. A refused edge runs
no action, so there is nothing to remove.

The `onTransitionStart` window stays covered — the action runs before the event
is emitted — and registration stays conditional, so the guard-free,
listener-free arc keeps the cost #1690 removed from it. No public API changes.
