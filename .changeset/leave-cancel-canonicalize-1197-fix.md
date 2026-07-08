---
"@real-router/core": patch
---

fix(core): canonicalize the cancellation outcome of an external abort during an async subscribeLeave (#1197)

When a navigation carrying an external `opts.signal` was parked on an async `subscribeLeave` listener and the signal aborted, the no-guards pipeline misclassified the cancellation: `navigate()` rejected with the **raw** abort reason (a plain `Error`/`DOMException`, so `err.code !== TRANSITION_CANCELLED`) and a spurious `TRANSITION_ERROR` was emitted after `TRANSITION_CANCEL` — two mutually exclusive outcomes for one navigation, plus an error-level "Unexpected navigation error" log for a routine user cancel.

The abort now rejects with `RouterError(TRANSITION_CANCELLED)` carrying the external reason, matching the guard path exactly (no raw reject, no spurious error). Internal cancel sources (supersede / `stop()` / `dispose()`), whose reason is already a `RouterError(TRANSITION_CANCELLED)`, are threaded through unchanged so the leave signal's `reason` (#943) is preserved.
