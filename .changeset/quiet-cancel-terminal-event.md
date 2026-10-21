---
"@real-router/core": minor
---

A guard's quiet cancel ends its navigation with `TRANSITION_CANCEL` (#2787)

A guard that throws or rejects with `RouterError(TRANSITION_CANCELLED)` or an `AbortError` on a navigation nothing else cancelled — the quiet cancel — now leaves the transition the way a navigation a newer one cancels does: `TRANSITION_CANCEL` and `onTransitionCancel` fire, and `router.isLeaveApproved()` and `getInternals(router).isTransitioning()` are `false` once `navigate()` rejects. Before, no terminal event was emitted and the router stayed in the transition: the transition snapshot behind every adapter's `useRouterTransition` / `injectRouterTransition` stayed busy, and the next navigation logged "Concurrent navigation detected…" before it emitted the stranded navigation's `TRANSITION_CANCEL`. The cancel stays quiet: no `TRANSITION_ERROR`, no `onTransitionError`, and `navigate()` still rejects `TRANSITION_CANCELLED`.

- A `subscribeLeave` listener that throws or rejects with `RouterError(TRANSITION_CANCELLED)` cancels the same way.
- A `subscribeLeave` listener that throws or rejects with `RouterError(ROUTE_NOT_FOUND)`, or with an `Error` of its own carrying `code: "CANCELLED"` or `code: "ROUTE_NOT_FOUND"`, fails the navigation like any other listener error: `TRANSITION_ERROR`, and the transition is left. Both were stranded the same way.
- A quiet cancel in the start navigation: `start()` still rejects `TRANSITION_CANCELLED`, and the router now returns to IDLE, `$stop` included, as after a refused start — a `navigate()` afterwards rejects `ROUTER_NOT_STARTED`. Before, the router stayed in the transition and the next `navigate()` committed.
- `navigateToState()` and `navigateToDefault()` follow the same rule.

**Breaking Change:** while an asynchronous guard or `subscribeLeave` listener cancels quietly, `navigate()`, `navigateToDefault()`, `navigateToNotFound()`, `navigateToState()` or a `start()` after `stop()`, called from an `abort` listener of the `signal` a guard or a `subscribeLeave` listener received, now throws `RouterError(REENTRANT_NAVIGATION)` synchronously — as it already did on the synchronous arc. The quiet cancel is a cancellation core performs, and 0.149.0 refuses those calls from an abort listener inside one. Before, they ran and superseded the stranded transition. That abort now also runs before `TRANSITION_CANCEL` is emitted, as it does when a newer navigation, `stop()` or the caller's signal cancels. Core does not isolate the throw: the platform reports it as an uncaught exception.

**Migration:** defer the call past the cancel.

```diff
 signal.addEventListener("abort", () => {
-  router.navigate("home");
+  queueMicrotask(() => void router.navigate("home").catch(() => {}));
 });
```
