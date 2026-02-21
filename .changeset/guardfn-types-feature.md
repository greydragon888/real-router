---
"@real-router/types": minor
---

Add `GuardFn` type for dedicated guard signatures (#130)

New `GuardFn` type narrows guard return type to `boolean | Promise<boolean>`.
`ActivationFn` remains available for middleware.
