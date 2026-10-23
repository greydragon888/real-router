---
"@real-router/core": minor
---

A leave listener that throws or rejects with another navigation's cancellation or failure fails its own navigation with `CANNOT_DEACTIVATE` (#2786)

A `subscribeLeave` listener can wait on work another navigation started: that navigation's `navigate()` promise, or a request bound to its `signal` that rejects with `signal.reason`. When that work ends with the value the router ended that navigation with — the cancellation it created for it, or the error the navigation failed with — the listener now fails the navigation it belongs to, as a guard holding the same value does: `TRANSITION_ERROR` is emitted, and `navigate()` rejects `CANNOT_DEACTIVATE`. Before, a cancellation was taken for the listener's own quiet cancel — the navigation still running ended in `TRANSITION_CANCEL` and the user's navigation was dropped with nothing reported — and a failure failed the navigation with the other navigation's error, such as its `CANNOT_ACTIVATE`.

Unchanged:

- a `RouterError(TRANSITION_CANCELLED)` the listener raises itself is a quiet cancel;
- any other error fails the navigation with that error;
- the cancellation of the listener's own navigation is still that navigation's cancellation.

**Breaking Change:** a leave listener that throws or rejects with the value the router ended another navigation with no longer cancels its own navigation quietly, nor fails it with that navigation's error: the navigation fails with `CANNOT_DEACTIVATE`.

**Migration:** raise a value of the listener's own — a `RouterError(TRANSITION_CANCELLED)` keeps the quiet cancel, any other error fails the navigation with that error.

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
