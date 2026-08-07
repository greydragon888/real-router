---
"@real-router/core": patch
---

An `opts.signal` aborted before the announce still cancels through the machine (#1704)

`addEventListener` never fires retroactively, so the bridge from the caller's
signal onto FSM `CANCEL` is only as good as the instant it is registered — and
there is a live window in front of the earliest registration. `beginTransition`
reads `opts.signal` and `opts.forceDeactivate` between the entry pre-check and
the announce, and reading `opts` is a call into application code whenever it is
accessor- or Proxy-backed (a supported input). A getter that aborted there left
the bridge standing on a dead signal, and the machine was never told.

Measured across the four reachable configurations, `TRANSITION_CANCEL` was lost
in **two of them**: no terminal event at all, `isLeaveApproved()` stuck `true`,
and `clear()` / `replace()` silent no-ops until the next navigation — the #1030
and #1684 symptom, reachable again through a window that no component owned. The
navigation's outcome was correct throughout (`mayCommit` refuses off
`opts.signal`), which is why the whole suite stayed green.

The cancellability scope now **adopts** what the caller's signal already says,
once, immediately after the announce — the first moment the machine can answer,
since `CANCEL` is declared on `TRANSITION_STARTED` / `LEAVE_APPROVED` only.
`bridgeLateIfOnlyGuardsCanAbort`'s own already-aborted check is gone with it, so
the platform fact has one owner instead of one copy per registration site (and
one site that had no copy at all).

All four configurations now announce exactly one `TRANSITION_CANCEL`, settle the
band, and leave route-CRUD unblocked.
