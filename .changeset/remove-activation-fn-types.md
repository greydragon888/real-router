---
"@real-router/types": minor
---

Remove `ActivationFn` and `ActivationFnFactory` types

**Breaking Change:** `ActivationFn` and `ActivationFnFactory` types have been removed. Use `GuardFn` and `GuardFnFactory` instead — guards return `boolean | Promise<boolean>` only.
