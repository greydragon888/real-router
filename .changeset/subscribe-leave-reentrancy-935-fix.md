---
"@real-router/core": patch
---

Bound synchronous reentrant `subscribeLeave` navigation (#935)

A sync `subscribeLeave` listener that calls `navigate()` re-enters the leave dispatch on the same call stack, nesting one navigation pipeline per hop. Unbounded, it overflowed the C stack (~615 deep) with a `RangeError` that escaped the fire-and-forget suppression net and could leak as an unhandled rejection or wedge the worker.

The leave dispatch is now depth-bounded by `maxEventDepth` (default 5) — the same limit the event emitter already applies to the plugin `onTransitionLeaveApprove` path — raising a controlled `RecursionDepthError` before the stack overflows, so both reentrancy routes are bounded identically. **Async** reentrant `subscribeLeave` navigation is unaffected (it unwinds the stack at each `await`), and `maxEventDepth: 0` opts out of the bound (mirroring the emitter).
