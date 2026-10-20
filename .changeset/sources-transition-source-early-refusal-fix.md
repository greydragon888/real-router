---
"@real-router/sources": patch
---

`createTransitionSource` keeps the transition in flight through a refusal that starts no transition (#2779)

Core reports a navigation it refuses before starting one (`SAME_STATES` or an unknown route name, for instance) and a plugin's `emitTransitionError` on `TRANSITION_ERROR`, and may do so while another transition is in flight. The source read any `TRANSITION_ERROR` as the end of the transition in flight, so a click on a link to the route the router still showed, while a guard held a navigation, reset the snapshot to idle — `isTransitioning`, `isLeaveApproved`, `toRoute` and `fromRoute` — while that navigation was still pending. It now ends the transition only on its own error, the one whose `toState` carries that transition's `context`. Every adapter reads this source: `useRouterTransition` (`injectRouterTransition` in Angular), and the scroll spy, which skips its emits while a transition is in flight.

When a listener registered before the source ends a transition inside `TRANSITION_START` — by aborting its signal or stopping the router — the source hears the end before the start and shows the transition in flight, as before. An unrelated refusal no longer happens to clear that; the next navigation does.
