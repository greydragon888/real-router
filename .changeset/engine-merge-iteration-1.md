---
"@real-router/core": patch
---

Internal: merge the routing-engine trio (search-params + path-matcher + route-tree) into a single private `engine` package (#1510)

Iteration 1 of the engine-merge RFC. The three internal foundation packages fold into one zero-dependency `engine` package (former `route-tree` facade at the src root; `path-matcher` and `search-params` as internal layers), which core bundles exactly as it bundled `route-tree` before. No public API or behaviour change — core's exports and dist shape are unchanged (tree-shaking already kept the layers internal to the bundle).
