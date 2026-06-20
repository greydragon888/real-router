---
"@real-router/core": patch
---

Fix `subscribeLeave` signal aborting on successful navigation and never aborting on the no-guards path (#722)

The `signal` in the `subscribeLeave` payload now aborts **only** when the navigation is cancelled — superseded by a newer `navigate()`, `stop()`, `dispose()`, or an external `opts.signal` abort — and **never** on successful completion, consistently across both the guard and no-guards pipeline paths.

- **Guard path (over-abort):** the internal `AbortController` was aborted unconditionally on every settle (including success), so a listener that captured the signal saw `aborted === true` after a navigation that actually succeeded.
- **No-guards path (under-abort):** the sync-listener branch never tracked its controller, so the signal never aborted — not even when the navigation was superseded mid-leave.

Cleanup now distinguishes successful completion from cancellation: on success the controller is released without aborting, and the no-guards path is routed through the same cancellation-aware cleanup as the guard path. The external-`opts.signal` bridge is detached explicitly so it cannot leak onto a reused signal.
