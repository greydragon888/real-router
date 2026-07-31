---
"@real-router/core": patch
---

A guard on a route the transition never walks no longer arms the cancellation machinery (#1588)

`hasGuards` was read from the router-wide guard Maps (`size > 0`), so a single
`canActivate` on an admin page sent **every** navigation down the guarded branch:
an `AbortController`, the `isCurrentNav` closure and a three-phase interpreter
walk that found no guard on any of its steps. The predicate now asks about the
segments this transition actually walks, mirroring what the interpreter would do
(a phase whose short-circuit is false runs no step, so `forceDeactivate` disarms
it too).

Measured on the production bundle, same-session A/B with an A/A control: a
navigation that never touches the guarded route went from **+97.7 ns / +643 B**
over the guard-free path to **+4.7 ns / +24 B** — −12% time and −29% allocations
on that navigation. Routers with no guards are unaffected (one `Map.size` load).

No behaviour change: the two branches were already equivalent, which is why the
waste was invisible to the suite. Pinned by counting allocated controllers
(`guards-off-path.test.ts`), not by timing.
