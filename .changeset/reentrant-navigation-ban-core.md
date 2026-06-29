---
"@real-router/core": minor
---

Ban synchronous reentrant navigation from transition listeners (#1030)

**Breaking change (pre-1.0).** A synchronous `navigate()` / `navigateToDefault()` / `navigateToState()` / `navigateToNotFound()` called from **inside a transition-event listener** (a `subscribe` callback, `subscribeLeave` listener, or plugin `onTransition*` hook) while a transition is being dispatched now throws `RouterError(REENTRANT_NAVIGATION)` instead of self-feeding or superseding the in-flight navigation. Inside a listener the throw is surfaced by the emit's `onListenerError` isolation — visible, non-fatal.

Deferred navigation from a listener is unaffected: `await navigate(...)`, an `async` listener, `queueMicrotask(...)`, or `navigate(...).catch(...)` all run after the transition settles and remain allowed. Route-CRUD from a listener is also unaffected (reentrant CRUD stays bounded by `maxEventDepth`).

This removes a class of state-corruption bugs (#308) and the defensive `RecursionDepthError`-suppression machinery (#945) on the navigation path, and makes every cancellation path return the FSM to a consistent `READY`/`IDLE` state — subsuming the interim #1030 external-`opts.signal` recovery fix.

**Migration:** defer the navigation so it runs after the transition settles, or move it to the call site:

```diff
- router.subscribe(() => { router.navigate("orders"); });
+ router.subscribe(() => { queueMicrotask(() => void router.navigate("orders").catch(() => {})); });
+ // or at the call site: await router.navigate("users"); router.navigate("orders");
```
