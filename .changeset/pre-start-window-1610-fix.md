---
"@real-router/core": minor
---

Guard the pre-start window — a nested navigation from an interceptor or a codec is refused (#1610)

**Breaking change (pre-1.0).** Calling `navigate()` / `navigateToDefault()` / `navigateToState()` / `navigateToNotFound()` from **inside the code that prepares a navigation** now throws `RouterError(REENTRANT_NAVIGATION)` synchronously, before anything is committed.

That window is everything the router runs before it announces a transition: the `forwardState` and `buildPath` interceptor chains, a route's `encodeParams` / `decodeParams`, and the `defaultRoute` / `defaultParams` / `defaultSearch` callbacks resolved by `navigateToDefault()`. It was the one hole between the two bans that already existed — `REENTRANT_NAVIGATION` for transition listeners and `REENTRANT_TREE_MUTATION` (#1032) for `subscribeChanges` handlers — because both key off the event emitter's dispatch depth, and an interceptor runs before any emit.

A nested navigation there used to run to completion, with two observable consequences:

- **The outer navigation's `fromState` shifted under it.** Asking to go from `home`, the transition reported starting from wherever the nested navigation had left the router.
- **The nested navigation got a full `TRANSITION_SUCCESS` that was overwritten a tick later** — subscribers saw a committed state that stopped being true immediately.

What is unchanged: a guard runs *after* the announce, so the classic guard-redirect (`navigate(...)` then `return false`) is still an ordinary supersede. `matchPath()` runs the same `buildPath` chain but prepares no navigation, so navigating from its interceptors stays allowed. Deferred navigation is unaffected.

**Migration:** defer the navigation so it runs once the preparing call has returned.

```diff
  api.addInterceptor("forwardState", (next, name, params) => {
-   if (shouldRedirect(name)) router.navigate("login");
+   if (shouldRedirect(name)) queueMicrotask(() => router.navigate("login"));
    return next(name, params);
  });
```

Also records the invariant this protects — *a navigation departs from the state committed when it was requested* — in `INVARIANTS.md` with a property test over all three pre-start windows.
