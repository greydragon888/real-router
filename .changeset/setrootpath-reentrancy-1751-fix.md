---
"@real-router/core": minor
---

fix(core): setRootPath joins the reentrant-tree-mutation ban ([#1751](https://github.com/greydragon888/real-router/issues/1751))

**Breaking change (pre-1.0).** `getPluginApi(router).setRootPath(path)` called from **inside a `subscribeChanges` handler** — while a `TREE_CHANGED` emit is on the stack — now throws `RouterError(REENTRANT_TREE_MUTATION)` synchronously, **before** rebuilding. Previously it applied silently.

It is the sixth tree mutator and the one the #1032 sweep missed. `setRootPath` rebuilds the tree **and** the matcher (`applyRootPath`), so a call from a handler swapped what the router resolves against while the listeners still queued in that dispatch reasoned about the payload's tree — exactly the non-atomicity #1032's own error message forbids. It was overlooked because it lives on `PluginApi` rather than on `getRoutesApi`, and was formatted after a template whose members do not touch the tree at all.

Migration is the one the error itself names, and it is the same one the other five doors already give: defer the call.

```ts
getRoutesApi(router).subscribeChanges(() => {
  queueMicrotask(() => {
    getPluginApi(router).setRootPath("/app");
  });
});
```

Two things deliberately unchanged:

- **`dispose()` still reports `ROUTER_DISPOSED`.** The new check sits after the disposed check, so a plugin teardown reached from a handler surfaces the code it always did.
- **`cloneRouter` is unaffected.** It writes the clone's store, and the clone's emitter is never dispatching.

⚠ One narrow behavioural consequence worth knowing: `unsubscribe()`-ing a plugin from inside a `subscribeChanges` handler on a live router now throws where it used to succeed. `@real-router/persistent-params-plugin` swallows that throw in its teardown, so its root-path restore is skipped — the old root survives. No call site in this repository does that, and deferring the `unsubscribe()` avoids it entirely.

The door set is now derived rather than listed: `tree-mutator-guard-authority-1751.test.ts` walks `src` for API members that transitively write a `RoutesStore` field and requires the guard on each, so a seventh door cannot ship without one.
