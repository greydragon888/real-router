---
"@real-router/core": patch
---

Retire `when: hasInflight` from both CANCEL edges — it is a tautology on the band invariant (#1669)

`inflightToState` is written by exactly one `update` (`beginNavigation`, on the only edges that ENTER the transition band) and cleared on every exit, so inside `TRANSITION_STARTED ∪ LEAVE_APPROVED` it is always defined and outside it never is — which is precisely the window where a `CANCEL` edge exists at all. Instrumented over the whole functional tier the predicate is asked **202 times and refuses zero**.

Unlike the neighbouring `isOwnEpoch` (#1670), this one cannot refuse in **any** configuration: removing its hand-rolled twin in `EventBusNamespace.sendCancelIfPossible` does not even change the number of asks. That is the discriminator between "a tautology" and "a check whose backstop happens to run first", and it is why the two predicates were answered differently.

The twin itself **stays**, re-documented for what it actually is: a TYPE narrowing, not a second opinion. Semantically it is dead, but `sendCancel` takes a `State` and the compiler cannot see the band invariant; widening that signature would push `undefined` into the public `onTransitionCancel` hook for a payload field #1671 deletes outright. It retires there, where the CANCEL action reads `ctx.inflightToState` and this method stops passing a target at all.

No behaviour change: the edges fire in exactly the same situations they did before.
