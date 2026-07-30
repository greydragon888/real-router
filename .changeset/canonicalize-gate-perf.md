---
"@real-router/core": patch
---

perf: `canonicalize`'s fast-path gate reads two values, not three (#1589)

The gate that decides "nothing to merge, nothing to gate" read `defaultParams`,
`defaultSearch` and `queryNames` on every call — three port hops per `<Link>`
render — and discarded all three on the fast path.

The third term was redundant. The gate's other half already establishes that the
caller brought no query bag, and the merged query bag has exactly two sources
(`defaultSearch` and the caller's own), so an empty bag has nothing for the mode
gate to drop however many `?names` the route declares. That is established rather
than argued: the term survives all 3808 tests, and a 33-probe × 3-mode matrix
over a `?`-declaring route with no defaults is byte-identical without it. It cost
~12 ns per call, because `getQueryParams` is a four-frame chain to a cached Map
rather than a Map read — and dropping it widens the fast path to routes that
declare query params but carry no defaults.

The two remaining reads stay above the gate on purpose: they are its route half
AND the slow path's first input, so the fast path pays two hops and the slow path
pays nothing extra. A variant collapsing them into one `mergesNothing()`
predicate was built and measured — indistinguishable on the fast arms, +10.6 % on
the defaults path — and dropped.

No behaviour change. Measured against pre-pipeline `0fed89b` as medians of 9
alternating single-module processes, A/A floor ≤ 0.7 %: `isActiveRoute` −12.2 % /
−12.8 %, `buildPath` −16.8 % static / −13.7 % params / −19.9 % on a `?`-declaring
route, `canNavigateTo` −8.2 % (now 1.06× of pre-pipeline — parity), and −0.3 % on
the defaults path.
