---
"@real-router/core": minor
---

Refuse a navigation started from a `canDeactivate` guard that `navigateToNotFound()` consults (#2786)

`navigateToNotFound()` asks the current route's `canDeactivate` before it commits the 404. A `navigate()`, `navigateToDefault()`, `navigateToNotFound()`, `navigateToState()` or a `start()` after `stop()` called synchronously from that guard now throws `RouterError(REENTRANT_NAVIGATION)` with a message naming the window. Before, the nested navigation ran first and the 404 was then decided from the state read before the guard was asked:

- a guard that navigated and allowed the leave: the nested navigation committed, and the 404 then committed over it, announced from the route the router had already left;
- a guard that redirected — `navigate()`, then `return false` — committed the redirect, and `navigateToNotFound()` threw `CANNOT_DEACTIVATE` with the router on the redirect's route;
- a navigation onto a route an async guard holds made `navigateToNotFound()` throw `ROUTER_NOT_STARTED`, and the 404 was not committed.

A guard that lets the throw escape refuses the 404 like any throwing guard: `CANNOT_DEACTIVATE`, and the router stays where it is. A guard that catches it decides with its own return value. `canNavigateTo()` consulting the same guard is unaffected.

**Breaking Change:** a `canDeactivate` guard no longer redirects when `navigateToNotFound()` consults it.

**Migration:** refuse from the guard, or defer the navigation.

```diff
 canDeactivate: (router) => (toState) => {
   if (toState.name === "confirm-leave") return true;
-  router.navigate("confirm-leave");
+  queueMicrotask(() => void router.navigate("confirm-leave"));
   return false;
 },
```
