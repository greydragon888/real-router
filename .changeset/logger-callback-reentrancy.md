---
"@real-router/core": minor
---

Refuse a navigation started from inside the logger's callback (#2786)

Core calls `options.logger.callback` from the middle of its own operations — the "Concurrent navigation detected" warning a superseding `navigate()` logs, for one, or a warning `replace()` logs about a route in its batch. `navigate()`, `navigateToDefault()`, `navigateToNotFound()`, `navigateToState()` or a `start()` after `stop()`, called synchronously from the callback, now throws `RouterError(REENTRANT_NAVIGATION)` with a message naming the callback. Before, the call ran to completion and the operation it interrupted then carried on with what it had read before: the superseding navigation emitted `TRANSITION_SUCCESS` from the route the router had already left, and `replace()` revalidated the state it held before the call, over the navigation.

The refusal holds wherever the callback runs, including where no navigation is in flight. Uncaught, the throw reaches the logger, which reports it with `console.error` like any error of the callback. Navigating another router from the callback is unaffected.

**Breaking Change:** a navigation started synchronously from the logger's callback throws.

**Migration:** defer it.

```diff
 logger: {
   callback: (level, context, message) => {
-    router.navigate("error");
+    queueMicrotask(() => void router.navigate("error"));
   },
 },
```
