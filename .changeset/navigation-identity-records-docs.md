---
"@real-router/core": patch
---

Re-align the identity records with the code #1648 shipped (#1648 #1664 #1673)

The doc sweep that came with the identity rework did not reach the rework's own
files, so several records still explain the mechanism through the counter it
removed:

- `executeNavigation.ts` carried TWO comments on `let nav`, the older one
  describing the numeric token (`0` until `beginTransition` returns) that
  `#1664` deleted — removed, its live replacement was already written below it;
- `AttemptedNavigation`'s docstring counted four fields and named `myId === 0`
  as how the handler asks its question — it is three fields and
  `nav === undefined`;
- `completeTransition.ts` explained the commit gate through "a superseded
  navigation carries a FOREIGN epoch (the nested NAVIGATE bumped it)", a
  sentence about a field that no longer exists — it is no longer the object in
  `ctx.inflight`;
- the root `ARCHITECTURE.md` asserted in the same file that the payloads "carry
  no identifier at all" and, 66 lines later, that "the machine adopts a
  navigation only together with its token";
- the new `#1671` test and `committedState.properties.ts` named
  `ctx.inflightToState` and the `hasInflight` predicate in the present tense,
  both retired in this same release.
