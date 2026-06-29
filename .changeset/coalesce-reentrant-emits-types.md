---
"@real-router/types": minor
---

Remove `maxEventDepth` from `LimitsConfig` (#1033)

**Breaking change (pre-1.0).** `maxEventDepth` is no longer a router limit — the event emitter now coalesces re-entrant emits (depth ≤ 1) instead of bounding recursion depth, so the option had no remaining effect. Remove `maxEventDepth` from any `createRouter(routes, { limits })` call.
