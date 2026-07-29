---
"@real-router/core": patch
---

Add the phase lock: entry points of one compositional form agree on one intent (nav-pipeline Phase 2, step 2-8)

The final step of the phase, and the reason the phase is a unit rather than seven
unrelated refactors. The property needs ≥2 migrated points per class, so after
milestone 1 it could not be written at all — class ① held only `navigate`. With
all seven points on the pipeline it can, and what it locks is not "each point
still works" but "no two points can drift apart again": a divergence is now a
property failure instead of a bug someone has to notice.

Two classes, deliberately NOT interchangeable — `navigate` / `matchPath` /
`buildNavigationState` resolve `forwardTo`, while `buildPath` / `makeState` /
`isActiveRoute`'s first arm take the literal form. A forwarding route is exactly
where the two must DISAGREE, so a third property asserts the divergence: without
it the first two would both pass on a router that ignored `resolveForward`
entirely, which is the one regression the lock exists to catch.

Verified mutationally, per property — and the SITE of the mutation is part of the
claim, because the two classes reach `buildPath` through different depths.
Dropping the query at the FACADE (`Router.buildPath`, the argument surface M2's
slot shift moved) reddens the LITERAL class and nothing else; the same drop deep
in the namespace method reddens class ① instead, via the `matchPath` re-parse.
Ignoring the literal form reddens the divergence property and nothing else.

All four caveats from the parent RFC's §5 are carried and documented in the file,
including the one an earlier revision lost: `canNavigateTo` returns a `boolean`,
so its `Canonical` is observable only from inside the module — asserting it
through the public return would be a tautology, and it is deliberately not
asserted structurally here.

Also confirmed by scan, with a positive control on the detector: no test in the
suite pins the INTERMEDIATE shape of a composition any more. The two remaining
interceptor-based reads are contracts, not pins — `captureStageOne` is the only
place channel classification is observable at all, and the `matchPath` interceptor
test pins that interceptors run (#525).
