---
"@real-router/logger-plugin": patch
---

A refusal that starts no transition no longer ends the log of the transition in flight (#2779)

Core reports a navigation it refuses before starting one (`SAME_STATES` or `ROUTE_NOT_FOUND`, for instance) on `onTransitionError`, and may do so while another transition is in flight. The plugin read any such error as the end of that transition: it logged the refusal with the transition's timing, measured `router:transition-failed:<label>` from the transition's start mark and closed its console group, so the transition's success was logged outside the group and without its timing, and its `router:transition-end:` mark and `router:transition:` measure carried an empty label. The refusal is now logged on its own, without timing, and the transition keeps its group, timing and marks until its own terminal event — for an error, the one whose `toState` carries that transition's `context`.

When a plugin registered before the logger ends a transition inside `onTransitionStart`, the logger opens that transition's group after its end, as before. An unrelated refusal no longer happens to close the group; the next transition's end does.
