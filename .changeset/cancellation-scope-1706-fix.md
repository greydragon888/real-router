---
"@real-router/core": patch
---

A cancellation that lands before the navigation's `AbortController` exists is recorded instead of dropped (#1706)

The controller is allocated lazily — разрез А never gets one, and the guard fork
opens one only after `planPhases` — so the FSM `CANCEL` action reached
`ctx.inflight.controller` while it was still `undefined` and the `?.` silently
dropped the abort. The controller opened moments later was born **unaborted**,
which satisfied the liveness fence (`!controller.signal.aborted` is the only term
that discriminates an external `opts.signal`), and the guards of a navigation
that had already announced its `TRANSITION_CANCEL` ran anyway — contradicting the
contract #1687 shipped.

`CANCEL` now records the reason on the navigation itself (`cancelReason`) and the
pipeline opens every controller through one door, which aborts on birth when that
record is set. Because the record is DATA, nothing extra is allocated: разрез А
and the born-dead arcs still count zero controllers.

Two observable consequences, both the contract being met rather than changed:

- guards of a cancelled navigation no longer run — reachable today through an
  accessor- or Proxy-backed `opts`, whose getter aborts the caller's signal
  between the entry pre-check and the announce;
- a `subscribeLeave` listener registered from **inside** the announce is now
  handed an already-aborted signal like every other one. This was the last cell
  #1697 left open, and it was left open only because closing it seemed to require
  allocating for a listener that may never exist.

The navigation's outcome is unchanged in every case: `mayCommit` already refused
the commit off `opts.signal`, so `navigate()` rejected `TRANSITION_CANCELLED`
either way. What changes is that the work stops when the cancellation is
announced.
