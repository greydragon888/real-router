---
"@real-router/core": minor
---

Refuse the `getInternals` members that start or commit from the windows `router.navigate()` refuses from (#2786)

`getInternals(router)` (`@real-router/core/validation`) hands out members that start a navigation or commit a state past the facade's checks. They now refuse as the facade does:

- `navigateToNotFound(path)` throws `RouterError(REENTRANT_NAVIGATION)` from every window in which `router.navigateToNotFound()` throws it — a router event listener, the logger's callback, a navigation being prepared and the others. Before, it committed the 404 over the transition being announced.
- `revalidateToNotFound(path)` and `systemCommit(toState, fromState, opts)` throw it from every window in which `router.navigate()` throws it, except inside `replace()`'s revalidation, which calls them itself — a `replace()` from a listener still revalidates. Before, they committed over the transition being announced.
- `start(path)` is now `router.start()`: it rejects `ROUTER_ALREADY_STARTED` on a started router, throws `REENTRANT_NAVIGATION` from a window, and boots a stopped router. Before, it ran the `start` interceptor chain alone — on a started router it booted a second time, and on a stopped router it rejected `TRANSITION_CANCELLED`.

**Breaking Change:** these members no longer commit or boot from inside a window, and `start` no longer boots a router that is already started.

**Migration:** defer a call made from a listener or a callback, as for `router.navigate()`, and stop the router before starting it again.

```diff
 api.addEventListener(events.TRANSITION_SUCCESS, () => {
-  getInternals(router).navigateToNotFound("/gone");
+  queueMicrotask(() => getInternals(router).navigateToNotFound("/gone"));
 });
```
