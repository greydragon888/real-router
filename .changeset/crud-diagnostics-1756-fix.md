---
"@real-router/core": patch
---

fix(core): route-CRUD diagnostics no longer announce what the call did not do ([#1756](https://github.com/greydragon888/real-router/issues/1756))

Two in-flight diagnostics named their operation ABOVE the check that decides whether the operation happens at all, so a route name that does not exist was told its removal / update was under way:

```
router.removeRoute("nope")   // mid-navigation, before
  [router.removeRoute] Route "nope" removed while navigation is in progress. …
  [router.removeRoute] Route "nope" not found. No changes made.

router.updateRoute("nope")   // mid-navigation, before
  [router.updateRoute] Updating route "nope" while navigation is in progress. …
  (nothing — the update silently did not happen)
```

Both reports moved below their existence check. Nothing changes for a name that really is a route: same text, same channel, same conditions — measured on both, with the in-flight CONTROL and an idle-router cell pinning each half of the condition.

The `remove()` half is a residual of this issue's own previous fix, which dropped a trailing "the removal is applied" and left the opening clause asserting the same thing; its regression test asserted the absence of that discarded draft's wording rather than the property, so it stayed green on the shipped message. The `update()` half is the untouched twin — and the worse one, since it had no follow-up line to contradict it. With `@real-router/validation-plugin` installed, `update()` of a missing route now throws its `ReferenceError` without logging first.

`validateRemoveRoute` loses its `isNavigating` parameter (internal; the report is now `warnRemovalDuringNavigation`, called from the door). A `v8 ignore` over the `update()` diagnostic went with the move — the line is reachable and now covered.

The predicate is EXISTENCE, deliberately not effect: `update("real", {})` with an empty patch still logs, and it should. The nearest available alternative — the structural predicate the `TREE_CHANGED` emit already uses — is the wrong one here, measured: a guard-only patch emits no event yet is exactly the case the warning exists for, since an in-flight navigation may read that guard after the update.
