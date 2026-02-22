---
"@real-router/core": patch
---

Compare segment params in-place without intermediate objects (#141)

Replace `extractSegmentParams()` + object comparison with direct `segmentParamsEqual()` that compares parameters from state objects without creating intermediate `SegmentParams` objects. 
Eliminates 2×N object allocations per navigation where N = common ancestor depth.
