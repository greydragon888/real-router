---
"@real-router/core": patch
---

`replace()` revalidates the state the router is on when its revalidation starts (#2786)

`replace()` read the router's state on entry and revalidated that snapshot against the new routes. The new batch's guard factories run in between, so a navigation one of them started did not survive: the revalidation committed its outcome for the snapshot over that navigation — the route the router had just left, with a `TRANSITION_SUCCESS` for it, when the batch keeps that route. The state is now read when the revalidation starts, so the state that navigation committed is the one revalidated, by the same rules as any revalidation.
