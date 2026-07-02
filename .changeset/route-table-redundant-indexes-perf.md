---
"@real-router/core": patch
---

Drop redundant matcher indexes for large route tables (#1010)

The segment matcher kept two per-route `Map`s (`segmentsByName` / `metaByName`) duplicating references already held in `routesByName`; the `getSegmentsByName` / `getMetaByName` getters now derive from `routesByName` and the two maps are removed. At 10 000 routes this trims retained heap a further ~0.4 MB on top of #1009 (~9.0 → ~8.5 MB, ~0.63 KB/route), with no behavior or match-speed change.
