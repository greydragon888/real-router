---
"@real-router/core": minor
---

Introduce `GuardFn` type, remove `ActivationFn` from guards (#130)

**Breaking Change:** Guards now must return `boolean | Promise<boolean>` only.
Returning `State`, `void`, or `undefined` from guards is no longer supported.

**Migration:**

- Guards returning `true`/`false` → no changes needed
- Guards returning `undefined`/`void` → add explicit `return true`
- Guards returning `State` → move logic to middleware
