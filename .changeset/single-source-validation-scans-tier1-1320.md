---
"@real-router/core": patch
---

Single-source `hasFusedConstraintSuffix` + `INVALID_QUERY_NAME_RGX` in path-matcher's `constraint-grammar.ts` (#1320 Tier 1). The route-tree `validateRoutePath` gate and the path-matcher `registerTree` backstop previously each carried a byte-identical copy of the fused-constraint-suffix char-scan (a jscpd clone) and the invalid-query-name regex; both now import the one definition (like `isConstraintBalanced` / `hasConstraintInStaticSegment`), so the gate and backstop can't drift. No behaviour change; each layer keeps its own throw/message.
