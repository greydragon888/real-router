---
"@real-router/core": patch
---

Remove the epoch condition from the LEAVE_APPROVE edge — it could not refuse (#1670)

`when: isOwnEpoch` guarded the `TRANSITION_STARTED --LEAVE_APPROVE--> LEAVE_APPROVED` edge against a stale approval from a superseded navigation. Instrumented over the whole functional tier it was asked **3464 times and refused zero**, and the reason is structural rather than lucky: the asynchronous `LEAVE_APPROVE` arc is exactly one — through `runStep`, where the liveness fence is the first line of the step — and the other two arcs send synchronously right after `beginTransition`, where a reentrant navigate is banned.

It is **not** inert, and that distinction is what the decision turned on: with the fence deleted the predicate refuses four times, so "no new failing tests when both are removed" meant "no test observes the difference", not "the predicate does nothing". It was removed anyway, because the fence it duplicates is itself pinned — deleting the fence fails the same four tests with the predicate and without it.

With no reader left, the `epoch` field goes off the `LEAVE_APPROVE` payload and the parameter off `sendLeaveApprove`, so the three senders and the DI closure stop threading a value nobody consults.

What the predicate would have held is now recorded beside the fence in `guardPhase.ts`, together with a test that names the symptom rather than the cause: without the fence a superseded navigation's approval moves the machine under the dead navigation's payload, `onTransitionLeaveApprove` reports the dead destination, and the survivor's own approval becomes a table no-op — while `navigate()` still resolves and the state still commits. The fence now fails five tests instead of four.

No behaviour change: the edge fires in exactly the same situations it did before.
