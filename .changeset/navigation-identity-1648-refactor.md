---
"@real-router/core": minor
---

A navigation's identity is the plan object, and the machine issues it (#1648)

The table could only ever check what it was given. A navigation read the machine's
epoch back through a DI member right after its own `NAVIGATE` send, kept the number
on its plan, and hand-stamped it onto every later send; `when: mayCommit` and
`when: mayFail` then compared that number against the machine's. The honesty of the
stamp was a convention — nothing structural stopped a site from stamping the wrong
one, and one already did (below).

The identity is now the plan **object** itself. `NavigationPlan` — which
`navigate()` builds anyway — IS the payload for `NAVIGATE` / `LEAVE_APPROVE` /
`COMPLETE`, and the `NAVIGATE` update adopts it into `RouterFSMContext.inflight`.
"Is this send stale?" becomes `payload === ctx.inflight`, a question no caller can
answer dishonestly, because presenting the live navigation means presenting the live
object. `FAIL` names its navigation the same way, by reference.

What that removes:

- `RouterFSMContext.epoch` — gone. `inflight` replaces it **and** `inflightToState`:
  one field is the navigation's identity and its target at once, so two facts about
  one navigation stopped being two fields that can disagree.
- `NavigationContext.myEpoch`, `NavigationDependencies.getNavigationEpoch` and
  `EventBusNamespace.getNavigationEpoch` — gone with the last reader. There is no
  epoch to read, so no site can stamp a send with the wrong one.
- The `NAVIGATE`, `LEAVE_APPROVE` and `COMPLETE` payload literals — the plan is
  handed over directly, and `completeTransition` stopped building a commit object
  beside it. Measured on the guard-free arc: **−135.9 B per navigation** (alternating
  processes, median of 31 windows of 200 navigations, A/A floor 0.0 B).

**A navigation whose `NAVIGATE` never fired is now refused at the seam.** `send()`
reports the resulting state, so `startTransition` reports whether the edge fired at
all. It does not, when user code drives the machine out of the transition band
between `canNavigate()` and the send — a `stop()` from a `forwardState` interceptor
is the shipped way there. Such a navigation was born dead: never announced, carried
by nobody, and it used to walk on and get refused at the very end by a coincidence of
topology (`COMPLETE` is not declared where it had landed). The rejection was already
`TRANSITION_CANCELLED` and still is; what changes is that a dead navigation stops
doing the work — pinned by counting the `AbortController` it used to allocate, since
the outcome cannot discriminate.

Two things deliberately unchanged: both `when`s stay (a stamp that was honest when
taken still goes stale across an `await`, so the freshness check is not removable —
only its currency changed), and `FAIL` keeps its own payload literal, because it
carries an `error` the plan does not.
