---
"@real-router/core": patch
---

The guard-free leave arc allocates its controller before the announce, so a cancel there aborts the leave signal ([#1697](https://github.com/greydragon888/real-router/issues/1697))

A navigation with **no guards but with `subscribeLeave` listeners** announced the leave and only then created the `AbortController`. A cancellation fired from inside that announce — a plugin's `onTransitionLeaveApprove`, or a raw `TRANSITION_LEAVE_APPROVE` listener, calling `stop()` or aborting the caller's `opts.signal` — therefore had nothing to abort, and the listeners were handed a **fresh, unaborted** signal for a navigation that had already had its `TRANSITION_CANCEL`.

That flag is exactly what makes being called after a cancellation safe, and two shipped primitives key their skip on it: `guardLeaveListener` (behind `useRouteExit` / `injectRouteExit` in all six adapters) and the reentrant-abort return in the shared view-transitions helper. With it `false`, both were bypassed — so an exit animation, a fetch abort or an analytics event ran for a departure that never happened, and a view transition was started for a navigation that would not commit.

The guard arc never had this: there the controller is on the plan before the walk, i.e. before any announce. The two arcs now agree — a leave listener called after `TRANSITION_CANCEL` sees `signal.aborted === true` on both.

`navigate()` already rejected `TRANSITION_CANCELLED` and nothing committed, so no state was corrupted; what changes is that application code stops running under a false premise.

**One cell is deliberately left open and now pinned:** a leave listener _registered from inside the announce_ cannot be counted by the pre-announce check and still receives an unaborted signal. Closing it would mean allocating a controller for a listener that may never exist — the trade the guard-free arc exists to avoid.
