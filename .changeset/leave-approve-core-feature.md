---
"@real-router/core": minor
---

Add `LEAVE_APPROVED` FSM state, `TRANSITION_LEAVE_APPROVE` event, `router.subscribeLeave()` (#391)

New FSM state `LEAVE_APPROVED` between deactivation and activation guard phases.
New event `TRANSITION_LEAVE_APPROVE` fires when deactivation is confirmed but before state changes.
New public API `router.subscribeLeave(listener)` for leave side-effects (scroll save, analytics, cleanup).
New query `router.isLeaveApproved()` to distinguish deactivation-passed sub-phase.
Renamed FSM state `TRANSITIONING` → `TRANSITION_STARTED`.
