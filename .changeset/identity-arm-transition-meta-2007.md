---
"@real-router/core": minor
---

`replace()`'s route-identity revalidation describes the transition it performed

When `replace()` leaves the current URL owned by a DIFFERENT route, the
revalidation committed the PREVIOUS route's transition meta onto the new state.
`segments.activated` then named a route the new tree no longer holds — `["x"]`
after `x` was replaced by `y` at the same path — while `segments.deactivated`
was empty and `transition.from` absent. Anything reading the segments to decide
what mounted was told about a route that does not exist.

The arm now builds its own meta from the transition path it already computes:
`from` is the departed route, `deactivated` and `activated` are the real segment
chains, and `intersection` is their common ancestor.

⚠ `transition.replace` stays `true` here, and it is now DERIVED rather than
inherited. The sibling arm that commits `UNKNOWN_ROUTE` reaches the same door
with an explicit replace option, so a revalidation commit is a replace by
construction; the copied value agreed only because `start()` happened to set it.

The other two arms are unchanged: the survivor arm copies the prior meta on
purpose (same route, same path, the user was legitimately there), and the
vanished arm already built its own.

Closes #2007.
