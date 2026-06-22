---
"@real-router/validation-plugin": minor
---

Remove dead `validateNotRegistering` validator (#906)

Drops the `validateNotRegistering` implementation (`validators/lifecycle.ts`) and its wiring in `validationPlugin.ts` — it implemented a `RouterValidator` member that core never invoked (dead on both ends). No change to `validationPlugin()` behavior.
