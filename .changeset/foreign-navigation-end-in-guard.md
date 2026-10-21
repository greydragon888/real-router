---
"@real-router/core": minor
---

A guard waiting on another navigation's work fails its own navigation when that work is cancelled (same class as #2788)

A guard can wait on work another navigation started: a request deduplicated across navigations and bound to that navigation's `signal`, which rejects with `signal.reason` as `fetch` does, or that navigation's `navigate()` promise. When that work ends with the cancellation the router created for that navigation — what it aborts the signal with when a newer navigation supersedes it, or what the navigation's promise rejects with — the guard now fails the navigation it belongs to: `TRANSITION_ERROR` is emitted, and `navigate()` rejects `CANNOT_ACTIVATE` — `CANNOT_DEACTIVATE` from a `canDeactivate` guard. Before, the guard took the other navigation's cancellation for its own quiet cancel: the navigation still running ended in `TRANSITION_CANCEL` and the user's navigation was dropped with nothing reported.

Unchanged — each of these is still a quiet cancel:

- a `RouterError(TRANSITION_CANCELLED)` or an `AbortError` the guard raises itself, one instance raised on every navigation included;
- an `AbortError` a request creates itself rather than taking it from the signal;
- the reason the application aborted a navigation's `opts.signal` with, whether the guard takes it from a request bound to that navigation's signal or from the application's own signal.

**Breaking Change:** a guard that rejects with the cancellation the router created for another navigation — the reason it aborted that navigation's `signal` with, or that navigation's rejection — no longer cancels its own navigation quietly.

**Migration:** to keep the quiet cancel, raise one of the guard's own.

```diff
 canActivate: () => async () => {
-  await sharedRequest;
+  try {
+    await sharedRequest;
+  } catch {
+    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
+  }

   return true;
 },
```
