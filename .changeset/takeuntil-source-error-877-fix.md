---
"@real-router/rx": patch
---

Release the source subscription when the source errors under `takeUntil` (#877)

`takeUntil` sets `completed = true` on a source `error()` and never forwards another source value, but it previously left the now-inert source subscription open — asymmetric with the notifier-emit, notifier-error, and source-complete branches, which all release the source eagerly. The source-error branch now unsubscribes the source as well, so its resource (e.g. a `state$` router listener reached through a throwing upstream operator) is released immediately instead of dangling until the consumer's `unsubscribe()`. A post-subscribe guard also covers a source that errors synchronously during subscribe.
