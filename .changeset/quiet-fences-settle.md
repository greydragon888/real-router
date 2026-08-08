---
"@real-router/core": patch
---

Drop the unreachable `isActive()` term from both navigation liveness fences (#1734)

- The guard-walk fence and `finishAsyncNavigation`'s post-race check both asked
  three questions; instrumenting them over the functional and property tiers gave
  317 refusals with the controller's `aborted` true in every one, so the router's
  own liveness never decided a single case
- Structural reason: `STOP` is not declared on `TRANSITION_STARTED` /
  `LEAVE_APPROVED`, so an in-flight navigation only sees a false `isActive()` as a
  downstream echo of the `CANCEL` that already aborted it
- Removing it leaves `NavigationDependencies.isActive` with no readers, so the
  dependency and its wiring closure go too
- Behaviour is unchanged and the pins are as strong: removing either fence whole
  reds the same tests as before (13, and 3 + 3), while removing the abort term
  alone now reds 9 instead of 7 — the deleted term had been masking two of them
