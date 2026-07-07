---
"@real-router/core": minor
---

Reject two optional params directly before a splat in the validation gate too (#1287)

path-matcher's `registerTree` already rejected a path with ≥2 optional params directly before a splat (`/:a<c>?/:b<c>?/*rest`) — a single trie slot carries one optional→splat fork, so the omit-outer/take-inner form silently reshapes into the splat. But route-tree's validation gate (`validateRoutePath`, used by `@real-router/validation-plugin`) did not, so a validation-plugin user got a raw `registerTree` throw instead of the gate's route-contextual error — the last cross-segment gate↔backstop drift. The gate now rejects it with a route-contextual message. The `hasMultipleOptionalsBeforeSplat` predicate is single-sourced in path-matcher and imported by both layers, so — like `isConstraintBalanced` — the two can no longer drift.
