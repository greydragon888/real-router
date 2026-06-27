---
"@real-router/core": patch
---

Extract start-pipeline FSM recovery into `#unwindFailedStart` (#940)

Internal refactor, no behavior change: the `start()` facade's inline `.catch` recovery (the two-branch FSM unwind) moves into a documented `#unwindFailedStart` method, and a comment records why the start FSM bookkeeping is deliberately split between the facade (`sendStart` before the interceptor chain, plus recovery) and `RouterLifecycleNamespace` (the `completeStart` commit). `sendStart` stays in the facade on purpose: moving it into the namespace (the interceptor target) would skip the STARTING state on a pre-`next()` interceptor throw, silently dropping the TRANSITION_ERROR that STARTING's FAIL action emits for `onTransitionError` plugins — a #668 regression.
