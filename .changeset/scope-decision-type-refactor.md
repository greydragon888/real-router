---
"@real-router/core": patch
---

The announce demands proof that the cancellability scope was decided (#1724)

`emitTransitionStart` now takes a third argument, a `ScopeDecision` produced
only by settling whether this navigation gets a bridge onto the caller's
`opts.signal`. A `const` cannot be read above its own declaration, so announcing
before deciding is `TS2448` instead of a test that would have to notice a
listener nobody called.

The order it locks is the one the `NAVIGATE` action was built around:
`addEventListener` does not fire retroactively, so a signal aborted from inside
the announce (a plugin's `onTransitionStart`) reaches nobody when the bridge is
registered afterwards — and the failure is silent, since the navigation still
commits and no `TRANSITION_CANCEL` is emitted.

Runtime behaviour is unchanged: the brand is erased, the token is module-level
(no allocation per navigation), and the conditional registration keeps the arc
without a signal on the same path it had. No public API changes.
