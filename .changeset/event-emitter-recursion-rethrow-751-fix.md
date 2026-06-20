---
"@real-router/core": patch
---

Fix RecursionDepthError being swallowed on the event emitter's fast path (#751)

The internal event emitter (bundled into core) documents that `RecursionDepthError` is **always** re-thrown from `emit()`, but the fast path (`maxEventDepth === 0`) routed it to `onListenerError` like an ordinary listener error, while the depth-tracking path re-threw it — a contract divergence between the two paths.

Both paths now share a single error-handling helper that re-throws the sentinel unconditionally, so a `RecursionDepthError` bubbling up from a nested depth-tracked emitter propagates to the caller regardless of the outer emitter's `maxEventDepth`. The router configures `maxEventDepth = 5` (depth-tracking path) after wiring, so it was unaffected; the fix restores the contract for the generic primitive.
