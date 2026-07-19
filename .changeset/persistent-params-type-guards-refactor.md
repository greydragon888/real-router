---
"@real-router/persistent-params-plugin": patch
---

Inline `isPrimitiveValue` locally (#1520)

The `isPrimitiveValue` helper now lives in `src/is-primitive-value.ts` instead of the dissolved `type-guards` package. Internal refactor — no public API or validation-behaviour change.
