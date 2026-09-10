---
"@real-router/navigation-plugin": patch
---

a superseded traverse no longer retires its successor's record (#2067)

`traverseToLast` stages its record — `navigationType: "traverse"`, the entry key
and the destination hash — into one plugin-global slot, then calls `navigate()`.
When a second call staged its own and superseded the first, core fired the FIRST
transition's `onTransitionCancel`, which retired whatever was in the slot; by
then that was the SECOND call's record. The second navigation went on to succeed,
found no traverse key, and degraded into a plain push.

⚠ **The user-visible half is the history stack, not the metadata.** A traverse
that degrades to a push does not return to the entry the user meant — it leaves
that entry behind them and puts a duplicate in front. Measured against a stub
browser: `navigate(/users/view/7,push)` where `traverseTo(<key>)` was due, and a
committed `navigationType: "push"` where `"traverse"` was.

The record now carries an OWNER. `traverseToLast` claims it and retires it from
its own promise, so a rejection only clears a record still its own; the lifecycle
hooks retire an UNOWNED record, which is the browser-driven path that has no
competing owner. The synchronous facade refusal keeps its existing retirement —
that door already scoped itself to the sync case for exactly this reason.

⚠ **#1802 pulls the other way and stays satisfied.** There the record SURVIVES a
navigation that never started, so a later unrelated navigation replayed a stale
traverse; a fix for either that ignores the other re-opens it. Its five cells are
green, and removing the ownership guard reds this issue's cell alone with the
original symptom.
