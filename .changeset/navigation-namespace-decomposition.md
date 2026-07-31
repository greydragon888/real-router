---
"@real-router/core": patch
---

Decompose NavigationNamespace — the per-navigation state first, the orchestration after (#1607)

`NavigationNamespace.ts` was 962 lines, and almost all of it belonged there: 13
of its 19 members need the DI bag, which is the namespace's reason to exist. The
exception was a coherent sub-domain with a tiny owner set — `#currentController`
and `#navigationId`, the lifecycle of one in-flight navigation.

Naming that state as `InFlightNavigation` (`begin` / `isCurrent` / `adopt` /
`release` / `abort`, one instance per router) is what let the orchestration
follow: `executeNavigation`, the two-pass prologue, `finishAsyncNavigation` and
`handleNoGuardsLeave` are now functions over `(deps, inFlight, plan)` in
`transition/executeNavigation.ts`. `navigateToNotFound` — the one commit
primitive that is not a transition — and `resolveAsyncGuard` moved to their own
homes too. The namespace is 327 lines and holds the entry points, their
fire-and-forget checkpoint, and the DI bag.

Internal only: no public API, no behaviour change. Verified with a zero
test-delta pathspec (positive control), 3840 functional / 432 property / 153
stress green, coverage 100%, and allocations bit-identical against the
production bundle across alternating OLD/NEW runs.
