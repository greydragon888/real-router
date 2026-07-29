---
"@real-router/core": patch
---

Offer an opt-in diagnostic for a param key the route declares nowhere (#1579)

A key named neither by a path slot nor with `?` has no channel to own it, so it
stays in `state.params` as app-level data — documented behaviour, and the reason
the state does not round-trip through its own `state.path`. That asymmetry was
the complaint behind #1553.

**Core's behaviour is deliberately unchanged.** Dropping the key was the original
proposal and was rejected on measurement, not on taste: a temporary detector on
the `navigate` facade (positive control fired) reddened **52 tests across 6
packages**, and the "declared nowhere" predicate cannot separate a typo from a
legitimate `navigate("users", { id })` on a parent route whose CHILD declares
`:id`. Dropping would have retired a shipped, documented capability to fix an
asymmetry that is mostly a documentation problem.

Instead the port grows an opt-in sink, `reportUndeclaredParamKey`, in the shape
the mode gate already uses (#1575): absent unless `validation-plugin` is
installed, so bare core checks one `undefined` and never walks the bag.

The diagnostic is opted into by the **committing producers** (`navigate`,
`buildNavigationState`) rather than inferred from the compositional form. That
distinction is measured too: `canNavigateTo` resolves `forwardTo`, so a
form-based test caught it and warned — on a predicate that runs on every `<Link>`
render, which is precisely the flood the channel guard avoids by not
instrumenting predicates at all. Every predicate now stays silent, pinned.

`RouteResolver` also gains `pathNames` — the other half of "is this declared
anywhere?", which `queryNames` alone cannot answer.
