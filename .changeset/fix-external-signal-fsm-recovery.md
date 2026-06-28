---
"@real-router/core": patch
---

Fix external `opts.signal` abort leaving the FSM stuck (#1030)

An external `AbortController` (`opts.signal`) abort during an async guard now returns the FSM to `READY` and emits `TRANSITION_CANCEL`, symmetric with `stop()` / `dispose()` / supersede — `onExternalAbort` routes through `cancelNavigation`.

Previously it only aborted the internal controller, leaving the FSM stuck in `TRANSITION_STARTED` / `LEAVE_APPROVED`: `isTransitioning()` stayed `true` (silently blocking `getRoutesApi(router).replace()` / `clear()`) and `isLeaveApproved()` was falsely `true` until the next navigation.
