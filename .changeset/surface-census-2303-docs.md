---
"@real-router/core": patch
---

Correct four claims the surface census refuted, and record two deliberate non-guards (#2303)

Documentation and tests only — no behaviour changes.

The census walked every member of every handed-out surface and found no guard
worth removing. What it did find was prose that had gone false, each confirmed by
execution:

- `getPluginApi(router).logger` does not exist. The capability is real but the
  door was misnamed, in three places; every shipped consumer already reads
  `getInternals(router).logger`.
- The config contract read "nested config aliases the live store … and it is NOT
  frozen" in three places. Since #2172 registration takes core's own snapshot and
  freezes it, so the worked example — `route.defaultParams.locale = "de"` with
  "routing has ALREADY changed" — throws a `TypeError` today and changes nothing.
  Guard factories stay the caller's functions and are the real exception.
- `getRoutesApi` claimed its twin `getPluginApi` is not frozen. It has been since
  #1805's second half (#2044).
- A docblock carried a count of example-app call sites that two independent
  re-counts disagreed with, and with each other. Removed rather than updated.

Two members carry no guard and, measured against the criterion in `CLAUDE.md`,
should not: `internals.logger` (diagnostics only — nothing routing reads it) and
`PluginApi.emitTransitionError`'s argument (no tier checks it, and
`RouterValidator` has no member for it). Both are now recorded where a triage
grep finds them.

New `tests/functional/door-census/surface.test.ts` derives every surface's composition
from the live object. It closes three blind spots the existing censuses share:
they read `Object.keys`, so a non-enumerable member passes them (measured — the
whole core suite stays green); none reads `getOwnPropertySymbols`, so the
`Router` brand symbol was invisible to every count so far; and accessors live one
level down, on what the members hand back, not on the surfaces themselves.
