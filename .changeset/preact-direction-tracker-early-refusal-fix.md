---
"@real-router/preact": patch
---

`createDirectionTracker` keeps the transition in flight through a refusal that starts no transition (#2779)

Core reports a navigation it refuses before starting one (`SAME_STATES` or `ROUTE_NOT_FOUND`, for instance) on `TRANSITION_ERROR`, and may do so while another transition is in flight. The tracker read any `TRANSITION_ERROR` as the end of the transition in flight, so a Back was published as `<html data-nav-direction="forward">` when such a refusal came in while an async `canDeactivate` guard held the Back, or while a navigation the Back then cancelled was in flight. It now settles on an error only when it is the transition's own, the one whose `toState` carries that transition's `context`; with no transition in flight every error settles, as before.

When a listener registered before the tracker ends a transition inside `TRANSITION_START` — by aborting its signal or stopping the router — the tracker hears the end before the start and takes the transition to be in flight until the next navigation, as before. An unrelated refusal no longer cuts that short.
