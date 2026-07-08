---
"@real-router/fsm": minor
---

remove(fsm): drop the forceState() escape hatch (#1169)

`FSM.forceState(state)` — the direct `#state`/`#currentTransitions` write that bypassed actions and listeners — existed solely as core's navigate hot-path optimization. The #1169 commit-gate refactor routed the three hot transitions (NAVIGATE/LEAVE_APPROVE/COMPLETE) through the FSM transition table via `send()`, making the table the sole authority over state; `forceState` was left with zero consumers.

Removing it makes "the FSM table cannot be bypassed" a compiler-enforced guarantee rather than a convention — the exact resurrection vector behind #1169 no longer exists in the engine. The shared `requireDeclared` declared-state guard stays (still used by the constructor's `initial` and `on`'s `from`, #885).

Breaking (a public method is removed) — `minor` per the pre-1.0 policy.
