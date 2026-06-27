---
"@real-router/core": patch
---

Correct the `subscribeLeave` contract: departures are approved, not confirmed (#932)

`subscribeLeave` fires in the `LEAVE_APPROVED` phase — after all `canDeactivate` guards pass, but **before** activation guards run — so the departure is **approved (tentative), not committed**: an activation (`canActivate`) guard can still reject, or the target route be removed mid-transition, leaving the user on the current route. The docs previously described this as a "confirmed" departure, which is misleading. Corrected the JSDoc, the core API reference, and the README to describe the departure as tentative and to point at the payload `signal` (now informative on failure — see #943) as the rollback channel. Behavior is unchanged — documentation fix.
