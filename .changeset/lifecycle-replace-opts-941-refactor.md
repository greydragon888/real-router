---
"@real-router/core": patch
---

Inline `Object.freeze` for `REPLACE_OPTS` (#941)

Combine the split declaration + `Object.freeze` of `REPLACE_OPTS` in `RouterLifecycleNamespace` into a single `const … = Object.freeze(…)` form (matching the `REVALIDATE_OPTS` house style in `api/getRoutesApi.ts`), removing the window where a future edit could insert a mutation between declaration and freeze. Behaviorally inert — the constant was already frozen at runtime.
