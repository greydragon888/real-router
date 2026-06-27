---
"@real-router/core": patch
---

Clear `EventBusNamespace` pending-error fields after emit (#949)

`#emitPendingError()` read `#pendingToState` / `#pendingFromState` / `#pendingError` to emit
`TRANSITION_ERROR` but did not clear them, leaving the last error's `State` / `RouterError`
pinned on the instance until the next `sendFail()` / `sendCancel()` overwrote them. The
fields are now cleared once consumed. State hygiene only — every consumer already overwrites
the fields before re-reading, so there is no observable behaviour change.
