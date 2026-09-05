---
"@real-router/rsc-server-plugin": patch
---

`invalidate()`'s documented in-flight behaviour was backwards, and the docs said the companion namespace was cached (#2112)

Both plugins told you that a navigation already in flight "completes unchanged"
and that the *following* navigation consumes the stale flag. Measured on both
sides of the leave dispatch, that is only the second half: a navigation parked in
a deactivation guard — or an `invalidate()` issued from `onTransitionStart` —
absorbs the refresh into that same transition. Only from an activation guard
onwards is it deferred, and an in-flight `start()` never absorbs it at all,
because a navigation with no `fromState` dispatches no leave listeners.

The docs also said a side-by-side companion plugin "keeps its cached
`state.context.<other>`". Nothing is cached: `state.context` is rebuilt empty for
every navigation, so the companion namespace is absent unless its own
`invalidate()` was called on the same transition.

The wrapper docblock now carries the corrected in-flight rule and points at this
package's `CLAUDE.md` for the rest instead of restating it. The same-route reload
example moves to `NavigationOptions.reload` in `@real-router/core`, which owns it
together with the measurement of what the pre-M2 three-argument spelling does
instead (#2112).
