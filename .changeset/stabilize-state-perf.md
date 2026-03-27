---
"@real-router/sources": patch
---

Add `stabilizeState` to prevent unnecessary re-renders across all frameworks (#339)

Path-based State reference stabilization: when `prev.path === next.path`, returns the previous State reference instead of creating a new snapshot. O(1) string comparison — no recursive object traversal.

Integrated into `computeSnapshot`, `createRouteSource`, and `createTransitionSource`. Guards before `updateSnapshot` prevent unnecessary listener notifications.
