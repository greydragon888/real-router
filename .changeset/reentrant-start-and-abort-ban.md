---
"@real-router/core": minor
---

Refuse a start, and a navigation from an abort listener, inside a navigation core has not finished with (#2778)

**Breaking Change:** two calls that core used to accept now throw `RouterError(REENTRANT_NAVIGATION)` synchronously.

- **`start()` on a router that is not running — after `stop()`, or after a `start()` that failed before its boot began — from inside a router event listener, a navigation being prepared, or `replace()`'s revalidation**, the windows where the navigate family is already refused. That covers a retry from a failed start's own `TRANSITION_ERROR` listener. A restart there lost events: inside a `TRANSITION_SUCCESS` listener its success was never announced, inside a `TRANSITION_START` listener its start was not, and inside a `$start` listener the outer boot committed over it.
- **`navigate()`, `navigateToDefault()`, `navigateToNotFound()`, `navigateToState()` or such a `start()`, from an `abort` listener of the `signal` a guard or a `subscribeLeave` listener received, while core cancels that navigation or settles its synchronous failure** — a cancel by a superseding navigation, `stop()`, `dispose()`, an aborted `opts.signal` or `navigateToNotFound()`; a failure from a guard that refuses or throws, a `subscribeLeave` listener that throws, or a commit that fails. The navigation started there ran inside the cancel, before the cancelled navigation's `TRANSITION_CANCEL`.

Unchanged: `start()` on a router that is already started still rejects `ROUTER_ALREADY_STARTED`, inside these windows too; a restart from a guard, from a `$stop` listener of a top-level `stop()` or from a microtask still works; and so does a navigation from the `abort` listener core fires after an asynchronous guard's refusal, once `TRANSITION_ERROR` is out. The dispatch window's error message now names the abort listener.

⚠ Core does not isolate a throw inside an `abort` listener: the platform reports it as an uncaught exception, which ends a Node process.

**Migration:** defer the call past the window.

```diff
 router.subscribe(() => {
-  router.stop();
-  router.start("/login");
+  queueMicrotask(() => {
+    router.stop();
+    void router.start("/login");
+  });
 });

 signal.addEventListener("abort", () => {
-  router.navigate("home");
+  queueMicrotask(() => void router.navigate("home").catch(() => {}));
 });
```
