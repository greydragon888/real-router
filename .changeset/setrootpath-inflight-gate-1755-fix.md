---
"@real-router/core": minor
---

fix(core): `setRootPath` refuses while a navigation is in flight ([#1755](https://github.com/greydragon888/real-router/issues/1755))

**Breaking change (pre-1.0).** `getPluginApi(router).setRootPath(path)` is now a logged no-op while a navigation is in progress — **when it changes the root's PATH half**. Changing only the `?`-declared query names is still allowed there, because those move no route paths. It used to apply either way.

The analogue is `replace()`, which is a logged no-op in that same window. `clear()` is only the analogue in the **start** window: with a state committed it throws `ROUTER_NOT_STOPPED` first (#1612), on a different axis entirely.

`applyRootPath` rebuilds the tree **and** the matcher from the same definitions, so every route name survives and every route path moves. That is the whole-tree destruction its two siblings are refused for — and it was the one member of the family that went through anyway. Measured: an activation guard calling it made its **own** navigation resolve and commit

```ts
router.getState().path; // "/users"
router.buildPath("users"); // "/app/users"
getPluginApi(router).matchPath("/users"); // undefined — nothing owns it
```

Every URL plugin has written that path to the address bar by then, so the next Back is a 404 for the route the router believes it is on.

Migration is the one the family already gives for `clear` and `replace`: do it outside a navigation, or `await` the navigation first.

⚠ If you are already deferring out of a `subscribeChanges` handler because of #1751, a bare `queueMicrotask` is **not** sufficient when that handler ran inside a navigation — the deferred call lands in the same band and is refused again, quietly this time. `await` the navigation instead.

```ts
getLifecycleApi(router).addActivateGuard("users", () => async () => {
  await router.navigate("elsewhere").catch(() => {});
  getPluginApi(router).setRootPath("/app"); // now outside the window
  return true;
});
```

**Why the refusal is scoped to the path half.** The whole-string form was written first and was a regression. `@real-router/persistent-params-plugin` declares its keys with a query-only root (`setRootPath("?lang")`) and restores the original in `teardown()`; an `unsubscribe()` reached from a guard or a `subscribeLeave` listener found that restore silently refused — and because the refusal is a log rather than a throw, the plugin's own `try/catch` could not see it. The `?lang` declaration then stayed on a live router the caller believed was clean, where a later `navigate("home", { lang })` throws `WRONG_CHANNEL` for a plugin that is no longer installed. Registering the plugin mid-navigation had the mirror defect: the keys were never declared at all.

Measured with the gate off, which is what the scoping rests on: `"" → "/app"` mid-navigation commits a `state.path` the tree cannot match, while `"" → "?lang"` and `"?lang" → ""` both commit a state that still round-trips.

**It now reports whether it applied.** `setRootPath` returns `boolean` instead of `void` — `false` when the call was refused. Every existing caller may ignore it; the one that cannot is a plugin's `teardown()`, and that is why the return exists. The refusal's own justification is "a condition that clears by itself gets a log" — which is **false for a teardown**: the plugin will never call again, so a refused restore is permanent. Measured: a plugin holding a path prefix, torn down mid-navigation, leaked that prefix forever with no way for its own code to notice.

```ts
teardown() {
  if (!api.setRootPath(originalRootPath)) {
    // refused — a navigation is in flight and the restore moves paths.
    // Re-apply once it settles, or hold the plugin until then.
  }
}
```

Three things deliberately unchanged:

- **A log, not a throw.** The family's rule is that a condition which clears by itself gets a log and one that never does gets a throw. A navigation settles; the `REENTRANT_TREE_MUTATION` ban beside this one cannot be waited out from inside a `TREE_CHANGED` dispatch, which is why that one throws.
- **The ban and the disposed check still win.** Both are ordered above the new gate, and the one cell where the ban and the gate are both true — a guard that adds a route mid-navigation, whose `TREE_CHANGED` handler then calls `setRootPath` — still throws `REENTRANT_TREE_MUTATION` rather than logging.
- **Validation runs first.** An argument-shape `TypeError` is the caller's bug whatever the router is doing; reporting the timing first would hide it behind a log line the caller did not cause.

**What this deliberately does NOT do.** The issue proposed widening `completeTransition` and the `navigateToState` entry to ask URL ownership rather than route existence. Measured against that: the committed state is **identical** whether `setRootPath` (or `add`) lands mid-navigation or one statement after it, so a commit-door check would pay the `navigate` hot path to catch half a class. The residual — a committed state going stale because `setRootPath` never revalidates — is #1752's Gap B and is unchanged here. `add` is not gated either: its outcome is likewise identical with and without the window, and shadowing paths resolve last-wins by design.
