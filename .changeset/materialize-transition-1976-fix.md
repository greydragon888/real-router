---
"@real-router/core": minor
---

Guards receive a state that satisfies its own type — `transition` is no longer omitted (#1976)

`State.transition` is declared REQUIRED, and the pending target the transition
pipeline hands to `canActivate` / `canDeactivate` did not have it. An `as State`
at the construction site laundered the gap, so a guard author writing
`toState.transition.reload` compiled cleanly and threw at runtime. Core carried
three workarounds for it, and the public doc example optional-chained a field
its own type calls required.

Measured before the fix, snapshotted synchronously inside a guard: the object
had keys `name, params, search, path, context` through a real `navigate` and
through `canNavigateTo` alike, against `name, params, search, path, context,
transition` on the committed state.

`transition` is now attached at construction by every core producer. Before the
commit it holds `DEFAULT_TRANSITION` — the same "no transition information"
value `matchPath` has always published on states that never transitioned — and
`completeTransition` overwrites it with the real meta. A guard reading
`transition.from` gets `undefined` instead of a `TypeError`.

**Behaviour change:** guards previously observed `state.transition === undefined`
and now observe `DEFAULT_TRANSITION`. Code that used the absence to detect
"pre-commit" must key on something else. The public docs promised the absence
(`redirected`: "not during guard execution") and that promise is retired.

The `skipFreeze: boolean` that governed this is gone. It named one guarantee and
delivered two — the shell freeze, and whether `transition` was attached at all —
so the only way to ask for a writable shell was to accept an incomplete object.
It is two entry points now, `materialize` and `materializePending`, and they
build the SAME shape; only the freeze differs. `MaterializeOptions` dissolves
into a positional `path`, which removes one object literal per navigation.
