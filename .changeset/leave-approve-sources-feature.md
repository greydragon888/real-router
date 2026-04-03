---
"@real-router/sources": minor
---

Add `isLeaveApproved` to `RouterTransitionSnapshot` (#391)

`RouterTransitionSnapshot` now includes `isLeaveApproved: boolean` field.
Enables direction-aware exit animations via `useRouterTransition()` in all framework adapters.
