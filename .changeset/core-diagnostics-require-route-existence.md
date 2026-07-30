---
"@real-router/core": patch
---

Say nothing about the params when the route does not exist (#1584)

Both opt-in diagnostics answer "does route X declare this key?", and both read a
declaration registry that returns `[]` for a route with no declarations AND for
a route with no existence. So for a misspelled route name every key in the
caller's bag was announced as "declared nowhere on route X" — blaming the params
for a typo in the ROUTE name, which is the most misleading direction available.
Return values were always right (`buildNavigationState` answers `undefined`,
`navigate` rejects `ROUTE_NOT_FOUND`); only the diagnostics lied.

Second-order, and reachable within one router: each bogus report took a slot in
the per-`route + key` de-dup cache, so the genuine warning was suppressed if that
name later became real.

`RouteResolver.pathNames` now answers `readonly string[] | undefined`, where
`undefined` means "no such route" — restoring information the matcher already
computes (`getSegmentsByName`) and this port member used to discard. `queryNames`
deliberately keeps its `[]`: its other two consumers (the default merge, the mode
gate's drop) want an empty list for a missing route, and only the diagnostics ask
a question that presupposes existence.

The **mode gate's** diagnostic had the identical defect and is fixed with it —
found by sweeping this file's port consumers, not named in the issue. Both drops
and both refusals are unchanged; only the reports are now gated.

Dev-only either way: bare core installs neither sink and never pays the lookup.
