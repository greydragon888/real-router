---
"@real-router/core": patch
---

The commit gate asks the navigation's own snapshot of `opts.signal`, not the caller's object again (#1717)

`NavigationOptions` is accessor- and Proxy-backed by contract, so every read of
`opts.signal` is a call into application code and two reads may hand back two
different objects. The `COMPLETE` edge's condition read it a second time — and
that condition is evaluated **twice** per commit, once for `canSend`'s ask and
once inside the `send` it permits, with the destructive post-leave cleanup
standing between them. A getter handing back an unrelated, already-aborted
signal therefore broke a navigation nothing had cancelled, in two different ways
depending on which evaluation it hit:

- **at the ask** — `navigate()` rejects `TRANSITION_CANCELLED` although the
  caller's own signal reads `aborted === false`. Because a refused condition
  does not move the machine, no `TRANSITION_CANCEL` is emitted either: the band
  sits in `LEAVE_APPROVED`, `isLeaveApproved()` lies, and `clear()` /
  `replace()` are logged no-ops until the next navigation.
- **at the send** — the permit was already granted, so `completeTransition` runs
  to its end and returns the state while the edge was a table no-op:
  `navigate()` resolves a state `getState()` disagrees with and no subscriber
  was ever notified.

The same second read decided whether the announcement strips the caller's
`AbortSignal` before handing the options to `onTransitionSuccess`, so a read
answering `undefined` handed plugins the caller's own object, accessor and all.

Both now read `externalSignal` — the signal the navigation captured once at its
entry and already carries on its plan — so the two evaluations of one condition
cannot disagree, and no read of the caller's `opts` survives between the entry
and the announcement. Nothing else moves: the snapshot was already a field of
the plan literal, so there is no new slot, no allocation and no hidden-class
change on the navigate path.

Pinned by `commit-gate-reads-the-snapshot-1717.test.ts`, whose fourth case
COUNTS the caller's getter invocations — two above the announce, one below it
(the announcement's own strip) — because a healthy navigation's outcome cannot
tell a snapshot read from a re-read that happens to agree.
