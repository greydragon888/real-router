---
"@real-router/core": patch
---

`isCurrentNavigation` leaves the pipeline entirely (#1734)

The last consumer was `handleNavigateError`, which asked
`isCurrentNavigation(nav) && isTransitioning()` before reporting a failure as a
failure rather than a cancellation. Measured four ways: dropping the identity
term reds nothing; dropping `isTransitioning()` reds one; replacing the pair
with `isActive()` reds 115; and — unlike the guard walk's copy, which held four
cells when `abortPreviousNavigation`'s cancel was stripped — this one changed
nothing there either, 31 red with it and 31 without.

So the term went, and with it the whole chain: the dependency in
`NavigationDependencies`, the wiring hop, and `EventBusNamespace.isCurrentNavigation`
itself. The pipeline no longer asks the machine about identity at all; the
machine still compares the plan by reference on the `COMPLETE` edge, where
`mayCommit` needs it.

Five comments referred to the removed dependency, including a broken `{@link}`
in `NavigationContext`'s docs and the table in `cancellation.properties.ts` that
described the two terms as "defence in depth" — all five now describe what is
there.
