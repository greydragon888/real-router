---
"@real-router/core": patch
---

Drop `AttemptedNavigation.toState`, dead since the identity rework (#1648 #1673)

The field lost its consumer when `routeTransitionError` stopped taking a target,
leaving it read only inside `nav !== undefined && toState` — a conjunct that
cannot be false, because `toState` is a required parameter of
`executeNavigation` and is therefore always an object by the time `nav` is set.
Field and conjunct both removed; the failure path allocates one property less.
