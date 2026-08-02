---
"@real-router/core": minor
---

The FSM context owns the committed state (#1641)

`state.current` / `state.previous` moved out of `StateNamespace` and into the
router FSM's context, where they are written by four transition-table edges and
by nothing else: `COMPLETE` (a navigation commit), `SYSTEM_COMMIT` (the two
commits that are not transitions — `navigateToNotFound` and the `replace()`
revalidation), `STOP` and `DISPOSE`. Because an edge's `update` runs only after
the machine has decided the transition fires, "committed" and "announced" can no
longer come apart: the silent-commit shape behind #1609 / #1611 / #1626 — state
written, `TRANSITION_SUCCESS` never emitted, no subscriber notified — stops
being expressible rather than being guarded against after the fact.

Nothing on the public surface changes shape: `getState()`, `getPreviousState()`,
`isActive()` and `isLeaveApproved()` keep their signatures and semantics, and
`@real-router/sources` and the six framework adapters are untouched.

**One deliberate behaviour change, and it is why this is a `minor`.** Zeroing
the committed pair now rides the `DISPOSE` edge, which fires several steps
earlier in `dispose()` than the old `#state.reset()` — that call sat almost last,
*after* `plugins.disposeAll()`. The accessor this is observable through is
**`getPreviousState()`**: a plugin's `teardown()` that reads it now sees
`undefined` where it used to see the state the router was disposed from.
(`getState()` is unaffected — it was already `undefined` in `teardown()`, because
`dispose()` routes through `stop()`, which has always cleared the current state
before the plugin teardown step.) No `teardown()` body in this repository reads
either one and core does not touch the state in that window, but `teardown` is
public API. If yours needs the final state, capture it in `onTransitionSuccess`
instead of reading it during teardown.

Two smaller consequences of the same move:

- `READY --FAIL--> READY` is gone. Its only senders were reports to observers
  (the plugin-facing `emitTransitionError`, and early refusals such as
  `ROUTE_NOT_FOUND` that never announced a transition to fail); they emit
  `TRANSITION_ERROR` directly, so a stale `FAIL` in `READY` is now a table no-op
  structurally. `STARTING --FAIL--> IDLE` is unchanged — that one is how a failed
  `start()` unwinds.
- The generic FSM engine backing this (`utils/fsm`, internal) gained guarded and
  context-writing edges (`{ target, when?, update? }`) beside the existing bare
  `target` form, with the table pre-normalized once per table object so the
  dispatch path stays monomorphic.
