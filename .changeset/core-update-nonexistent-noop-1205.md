---
"@real-router/core": patch
---

fix(core): update() of a nonexistent route is a true no-op in bare core (#1205)

Without `@real-router/validation-plugin`, `update("ghost", …)` for a route that does not exist used to silently seed `config.defaultParams` + compile/register the guard factory and emit a lying `TREE_CHANGED` `"update"` event for a route `get()`/`has()` cannot see — and a later `add({ name: "ghost" })` inherited the phantom config + a blocking guard (`navigate` rejected `CANNOT_ACTIVATE` out of the box). It is now a genuine no-op: the commit and the emit are skipped when the route is absent. No throw is added (validation stays opt-in — the validation-plugin already throws a `ReferenceError` here).
