---
"@real-router/core": minor
---

A leave listener waiting on another navigation's work fails its own navigation when that work is cancelled (#2786)

A `subscribeLeave` listener can wait on work another navigation started: that navigation's `navigate()` promise, or a request bound to its `signal` that rejects with `signal.reason`. When that work ends with the cancellation the router created for that navigation, the listener now fails the navigation it belongs to, as a guard holding the same value does since #2800: `TRANSITION_ERROR` is emitted, and `navigate()` rejects `CANNOT_DEACTIVATE`. Before, the listener's failure was taken for its own quiet cancel: the navigation still running ended in `TRANSITION_CANCEL` and the user's navigation was dropped with nothing reported.

Unchanged:

- a `RouterError(TRANSITION_CANCELLED)` the listener raises itself is a quiet cancel;
- any other error fails the navigation with that error;
- the cancellation of the listener's own navigation is still that navigation's cancellation.

**Breaking Change:** a leave listener that throws or rejects with the cancellation the router created for another navigation no longer cancels its own navigation quietly.

**Migration:** to keep the quiet cancel, raise one of the listener's own.

```diff
 router.subscribeLeave(async () => {
-  await sharedRequest;
+  try {
+    await sharedRequest;
+  } catch {
+    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
+  }
 });
```
