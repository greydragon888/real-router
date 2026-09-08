---
"@real-router/rx": patch
---

A `Symbol.observable` polyfill imported after this package now reaches the prototype (#2119)

The TC39 interop alias was resolved once, when `@real-router/rx` was evaluated. A polyfill imported after that never reached `RxObservable.prototype`, so RxJS resolved the symbol, did not find the member, and silently fell through to the async-iterable protocol — a working stream with different delivery guarantees. Measured against `rxjs@7.8.2`, `next(1); next(2)` arrived as `[2]` instead of `[1, 2]`, three microtask turns later instead of synchronously.

The alias is now also topped up on construction, so import order no longer decides which spelling is live. The top-up lands on the prototype, so it repairs instances that already exist. No API change.

Because that read now sits on the construction path, it is wrapped: a host whose `Symbol.observable` accessor throws answers like a bare host — the `"@@observable"` string spelling stays — instead of making every `new RxObservable` throw.

One window stays open and is documented: an instance constructed _before_ the polyfill and handed to a consumer without any further construction still lacks the symbol — constructing anything afterwards repairs it.
