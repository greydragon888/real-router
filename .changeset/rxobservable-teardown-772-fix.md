---
"@real-router/rx": patch
---

Run terminal teardown when an `RxObservable` completes (#772)

`complete()` now runs the subscription's teardown and removes the abort listener, instead of deferring them to `unsubscribe()` — which was a no-op after completion. A self-completing source (intervals, DOM listeners, finite producers) previously leaked its resource, and under a long-lived shared `AbortSignal` leaked one abort listener per completed stream. Synchronous completion inside the subscribe function is handled as well: teardown runs once the subscribe function has returned it.
