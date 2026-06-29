---
"@real-router/validation-plugin": minor
---

Drop `maxEventDepth` from limits validation (#1033)

`maxEventDepth` was removed from `LimitsConfig` (the event emitter now coalesces re-entrant emits instead of bounding recursion depth). The validation plugin no longer recognizes or range-checks it.
