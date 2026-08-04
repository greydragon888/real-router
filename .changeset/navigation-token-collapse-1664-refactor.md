---
"@real-router/core": patch
---

The navigation is counted once, not twice (#1664)

Two mechanisms answered one question. `InFlightNavigation` kept a supersession
token, handed it to each navigation as `NavigationContext.myId`, and three fences
asked `inFlight.isCurrent(myId)` — "am I still the navigation in flight?". The
machine answered the very same question about the very same navigation by
comparing the plan it had adopted on `NAVIGATE`. A counter beside an identity,
with a window in which the two could disagree: `begin()` bumped the token before
the send, so a navigation whose `NAVIGATE` never fired held the token while the
machine carried somebody else's plan.

The token is gone. The pipeline asks the machine through one boolean —
`deps.isCurrentNavigation(plan)` → `ctx.inflight === plan` — so the identity
still never leaves the machine, and `InFlightNavigation` is left with the one
thing the machine does not own: a controller to abort. `NavigationContext.myId`,
`InFlightNavigation.begin()` and `isCurrent()` go with it, along with the
parameter they were threaded through in `finishAsyncNavigation` and
`beginTransition`.

**Behaviour is unchanged, and the equivalence is measured rather than argued.**
Each of the three fences was mutated to `true` on both sides of the change: the
guard-pipeline one reds the same four tests before and after (it is the fence the
`LEAVE_APPROVE` predicate was retired against), and on the other two the token
conjunct alone killed nothing before the change and the identity conjunct kills
nothing after — the liveness question each is paired with (`isTransitioning()`,
the controller's `aborted`) is what those two arcs really stand on. Tiers
199/3969 functional at 100 % coverage, 44/441 property, 47/153 stress.
