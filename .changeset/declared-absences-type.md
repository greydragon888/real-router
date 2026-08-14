---
"@real-router/core": patch
---

The table's deliberate absences are declared as `never` (#1169, #1647)

Five edges are missing from the transition table on purpose, and each one was
protected by a comment saying so. An absence is the hardest thing in the table to
protect: a test exercises what happens, and there is no arc to exercise for an
edge that does not exist — so adding one back made a comment false and nothing
else, because until that moment the arc it opens was unreachable.

`DeclaredAbsences` spells them in the type, so putting one back is `TS2418` at
the edge itself:

- `STARTING` has neither `NAVIGATE` nor `SYSTEM_COMMIT` — together they ARE the
  pre-boot window, which is why the facade predicate that used to hold it could
  be deleted;
- `READY` has no `FAIL` — the two senders it existed for are reports to
  observers, so a stale `FAIL` there is a table no-op structurally;
- the band (`TRANSITION_STARTED` / `LEAVE_APPROVED`) has no `STOP` — terminating
  mid-transition is routed through `CANCEL` first;
- `DISPOSED` has nothing at all — the machine cannot be resurrected.

Each of the six is verified separately, not by analogy. Only absences already
documented as load-bearing are listed: an edge nobody has needed yet is not an
edge nobody may add. No runtime change.
