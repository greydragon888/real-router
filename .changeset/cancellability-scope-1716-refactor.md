---
"@real-router/core": patch
---

The cancellability scope is closed by the machine, not by four pipeline sites (#1716)

Detaching the bridge that routes a caller's `opts.signal` onto FSM `CANCEL` was
the pipeline's job, spread over four settle sites in `executeNavigation`
(#1688). It is now one operation owned by the state machine: the scope travels
with the navigation plan, the `NAVIGATE` edge adopts it, and the ACTION of
whichever terminal edge the navigation left the band through — `CANCEL`, `FAIL`
or `COMPLETE` — closes it.

No public behaviour changes. Two internal consequences worth recording:

- **`DISPOSE` is deliberately not in the closing set.** Its `update`
  (`resetState`) zeroes `inflight` before the action would run and it carries no
  payload, so an action there could not reach the scope — and it would have
  nothing to close in any case: instrumented over the whole functional tier, all
  230 `DISPOSE` traversals came from `IDLE` or `STARTING`, never from inside the
  band, because `dispose()` and `stop()` both send `sendCancelIfPossible` first.
  Eight deliberate attempts to reach an in-band `DISPOSE` all landed on the
  `IDLE` edge.
- **A late bridge registration is refused once the machine has cancelled the
  navigation.** `bridgeLateIfOnlyGuardsCanAbort` runs after the adoption that
  sends `CANCEL` for an already-aborted signal, so on that arc it used to install
  a listener the terminal edge had already passed by — one that nothing would
  ever remove. Measured: 4 leaked listeners on the application's own
  `AbortController` across 4056 passing tests.

Pinned by `cancellability-scope-1716.test.ts`, which counts
`addEventListener` / `removeEventListener` on the caller's signal per arc,
because a leaked listener changes no outcome, no event and no state.
