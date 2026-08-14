---
"@real-router/core": patch
---

The band's `CANCEL` edges are unconditional by type (#1681)

`CANCEL` is declared on `TRANSITION_STARTED` and `LEAVE_APPROVED` in the string
form, which carries no `when` — and that absence is load-bearing for a
NEIGHBOURING edge. `abortPreviousNavigation` leaves the band through
`canCancel()`, so while these edges refuse nothing, `sendNavigate` is only ever
reached from `READY` (measured: 0 of 3593 sends came from inside the band) and
the two `NAVIGATE` self-loops stay untraversed. A `when` here makes the self-loop
reachable, which is condition 3 of the false-green documented on the `READY`
`NAVIGATE` edge.

Nothing enforced that: the constraint lived in a comment two files away from
what it protects, and the next `when` would have re-opened the class without
reddening a single test. The table's declaration type is now sharpened to the
string form for this one event in these two states, so the object form does not
compile there — `TS2418` at the edge itself.

Keyed off `routerStates` / `routerEvents` rather than string literals, so
renaming a state or the event moves the constraint with them instead of silently
detaching it. No runtime change.
