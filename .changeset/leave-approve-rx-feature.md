---
"@real-router/rx": minor
---

Add `TRANSITION_LEAVE_APPROVE` to `events$` Observable stream (#391)

`events$` now emits `{ type: "TRANSITION_LEAVE_APPROVE", toState, fromState }` events.
