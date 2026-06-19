---
"@real-router/rx": patch
---

Fix `RxObservable` async iterator dropping the terminal batch (#774)

`for await (const v of observable)` now yields a value emitted immediately before a synchronous `complete()`, and throws when the observable errors synchronously on subscribe. Previously the iterator loop checked `completed` before the buffered value and raised errors only after an `await`, so a synchronous terminal skipped the loop body entirely — dropping the final value and swallowing the error. The loop now drains a buffered value before honoring the terminal and raises the error from a single point.
