---
"@real-router/core": minor
---

Route registration decides every per-segment grammar rejection through the shared `parseSegment` tokenizer (#1324)

`registerTree`'s bare-core backstop previously spread its grammar rejections across separate char-scans: three whole-path constraint guards (`hasFusedConstraintSuffix`, `hasConstraintInStaticSegment`, and an `<>` literal check), a `FUSED_MARKER_RGX` in the trie's static branch, and per-branch throws in `extractParamName` / the optional fork. These collapse into a single `parseSegment` pass in `registerNode` — the SAME tokenizer the validation-plugin gate reads — so the backstop and the gate can no longer drift on any per-segment grammar form (name-less, fused marker, trailing marker, optional splat, empty / fused-suffix / constraint-in-static). The one whole-path check a per-segment scan cannot make — an unbalanced or stray `<`/`>` — stays as `isConstraintBalanced`.

The set of accepted vs rejected route paths is unchanged (verified path-by-path across the grammar), and every accepted route's params / match / buildPath is byte-identical. What changes is the error MESSAGE on some malformed paths: because the tokenizer decides per segment left-to-right, an empty constraint filling a static segment (`/foo<>`) now reports `Constraint '<...>' in a static segment` instead of `Empty constraint`, and a path with multiple grammar errors reports the first by left-to-right scan rather than the old guard order. Only code that registers a malformed route and asserts the exact rejection message is affected.
