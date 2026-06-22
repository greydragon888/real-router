---
"@real-router/core": patch
---

Fix `getStaticPaths` crashing with `RangeError` on a large static route section (#920)

`getStaticPaths` enumerated a subtree's leaf routes via
`result.push(...getLeafRouteNames(child))`. The spread passes one argument per
leaf, and V8 caps spread/apply arguments (~124k on Node 24), so a section with
more static leaf routes than that limit threw
`RangeError: Maximum call stack size exceeded` — a cryptic failure that reads
like infinite recursion, not "too many routes". Leaf collection now accumulates
into a shared array (no spread), which also removes the per-subtree
intermediate-array allocation. Enumeration order and output are unchanged.
