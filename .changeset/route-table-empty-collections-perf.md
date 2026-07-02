---
"@real-router/core": patch
---

Cut large route-table memory via shared empty per-route collections (#1009)

For large route tables the segment matcher allocated a fresh empty `Set`/`Map`/array per route (query params, constraints, build slots) and added `cachedResult` after construction, making every `CompiledRoute` megamorphic. Both now reuse shared frozen sentinels and a single hidden class (extending the `EMPTY_CHILDREN_MAP` pattern already used for tree children). At 10 000 routes this is the bulk of a ~14.4 → ~9.0 MB drop (~1.2 → ~0.67 KB/route), with no change to the O(1) match (matcher CPU stays flat) or any observable behavior.
