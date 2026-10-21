---
"@real-router/core": minor
---

A guard that redirects and then refuses rejects `TRANSITION_CANCELLED` whether the redirect's target commits at once or waits on an async guard (#2788)

A guard that calls `router.navigate()` to another route and then returns `false` has handed the transition to that redirect, and the stream announces `TRANSITION_CANCEL` for its own navigation. When an asynchronous guard holds the redirect's target, that navigation's `navigate()` now rejects `TRANSITION_CANCELLED` too, as it already did for a target that commits at once. Before, it rejected with the guard's own code, `CANNOT_ACTIVATE` or `CANNOT_DEACTIVATE`, so a caller reading that code as "access denied" reported a redirect as a refusal. Core now asks whether the machine cancelled this navigation, not whether it holds some transition.

- A navigation whose target route, or an ancestor of it, is removed while it runs rejects `ROUTE_NOT_FOUND` on the synchronous guard walk as well — the code `onTransitionError` reports on both walks. The same holds for `start()` on a router created with `allowNotFound: false`; with `allowNotFound`, `start()` still degrades into the not-found state.
- The `[router.removeRoute]` warning names that one code.
- A redirect the router refuses on the spot — to the state it already shows (`SAME_STATES`) — supersedes nothing, and the guard's refusal stands: `CANNOT_ACTIVATE`, as before.
- Under a URL plugin, a Back whose guard redirects to a route an asynchronous guard holds, and then refuses, no longer takes the browser back to the entry the Back started from: the redirect owns the URL and records its entry after the one the Back reached, as it already did for a redirect target that commits at once.

**Breaking Change:** a navigation that fails because its target route was removed during a synchronous guard walk no longer rejects `TRANSITION_CANCELLED` with the `ROUTE_NOT_FOUND` on `reason`; it rejects `ROUTE_NOT_FOUND` itself.

**Migration:** classify the failure by its own code.

```diff
-const reason = error.getField("reason");
-
-if (
-  error.code === "CANCELLED" &&
-  reason instanceof RouterError &&
-  reason.code === "ROUTE_NOT_FOUND"
-) {
+if (error.code === "ROUTE_NOT_FOUND") {
```
