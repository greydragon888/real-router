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

`Router.shouldUpdateNode` — which read `toState.transition.reload` flat — now
tolerates a state without the field. That is not the same claim as above and it
is why the read is optional-chained rather than left bare: `getInternals` is
published, and the commit door deliberately preserves the ABSENCE of
`transition` on a State an application hands it rather than fabricating meta, so
`getState()` can legally return one without it. Measured: one `systemCommit` of
a transition-less foreign state made `router.shouldUpdateNode(n)(getState())`
throw `Cannot read properties of undefined (reading 'reload')`. Absent and
`DEFAULT_TRANSITION` now answer identically — `reload` is `undefined` in both.

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
