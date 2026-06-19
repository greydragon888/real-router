---
"@real-router/rx": patch
---

Fix `takeUntil` leaking the notifier subscription (#773)

`takeUntil` now unsubscribes the notifier when the notifier errors, and when the notifier emits or errors synchronously on subscribe. Previously the notifier-error branch released only the source, and a synchronous notifier terminal returned before exposing a teardown — leaving the notifier subscription dangling forever (a long-lived notifier such as an `events$` router-listener stream stayed held until GC), with no way for the consumer's `unsubscribe()` to reach it after the sync terminal.
