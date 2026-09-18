---
"@real-router/core": minor
---

`getLifecycleApi` and `getPluginApi`'s state builders stop consulting the validator (#2388)

Six new positions: `addActivateGuard:entry`, `addDeactivateGuard:entry`,
`removeActivateGuard:entry`, `removeDeactivateGuard:entry`,
`forwardState:entry` and `buildNavigationState:state`. Messages and per-door
order are unchanged.

`lifecycle.validateHandler` leaves `RouterValidator` — these were its only
consultations.

⚑ **`buildNavigationState:state`, not `:entry`.** That door's consultations
judge `ownParams`, the copy `adoptChannel` made (#2134), while the name and
search are the caller's. The position name says so rather than implying the
whole tuple is the caller's.

⚠ **The two state builders consult the same pair in OPPOSITE orders**, so they
hold separate positions and each check keeps its own door's sequence: the first
refusal is the message the caller gets.

⚠ **`forwardState` is also an interceptable seam**, and the two rights do not
overlap — an interceptor there may rewrite the intent, a check may only refuse
it.
