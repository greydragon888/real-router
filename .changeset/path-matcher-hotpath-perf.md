---
"@real-router/core": patch
---

Optimize path-matcher hot path: splat backtracking, static result caching, property access (#386)

- Skip splat backtracking when splat node has no children (-36% splat match)
- Pre-compute frozen `MatchResult` for static routes — zero-alloc fast path (-12% static match)
- Cache `caseSensitive` and decode function on instance to avoid per-segment property chain (-13% dynamic match)
