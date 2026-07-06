---
"@real-router/core": minor
---

Reject two optional params directly before a splat (#1287)

Two constrained optionals directly before a splat (`/:a<c1>?/:b<c2>?/*rest`) registered silently, but a single trie slot carries only one optional→splat fork — the outer optional's mark overwrote the inner's, so the omit-outer/take-inner form silently reshaped into the splat (`/ab/x` → `{ rest: "ab/x" }` instead of `{ b: "ab", rest: "x" }`), a `range(buildPath) ⊄ dom(match)` desync with no error. `registerTree` now rejects the shape; split into separate routes or drop the `?` on one. A single constrained optional→splat (#1264 A1) and two optionals before a non-splat tail are unaffected.
