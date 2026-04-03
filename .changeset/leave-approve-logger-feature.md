---
"@real-router/logger-plugin": minor
---

Log `TRANSITION_LEAVE_APPROVE` event (#391)

New `onTransitionLeaveApprove` hook logs leave-approve phase with timing.
Enables deactivation phase duration measurement (time from START to LEAVE_APPROVE).
