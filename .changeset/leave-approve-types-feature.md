---
"@real-router/types": minor
---

Add `LeaveState`, `LeaveFn` types and `Plugin.onTransitionLeaveApprove` hook (#391)

New types for leave side-effects: `LeaveState` interface, `LeaveFn` type.
New plugin hook `onTransitionLeaveApprove` fires after deactivation guards pass.
`Navigator` and `Router` interfaces extended with `subscribeLeave` and `isLeaveApproved`.
