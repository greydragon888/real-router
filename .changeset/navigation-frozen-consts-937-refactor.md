---
"@real-router/core": patch
---

Inline `Object.freeze` for `FROZEN_ACTIVATED` / `FROZEN_REPLACE_OPTS` (#937)

Combine the split declaration + `Object.freeze` of the module-level constants in `NavigationNamespace` into a single `const … = Object.freeze(…)` form, removing the window where a future edit could insert a mutation between declaration and freeze. Behaviorally inert — both constants were already frozen at runtime.
