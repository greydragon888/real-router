---
"@real-router/validation-plugin": patch
---

Absorb the dissolved `type-guards` package into `src/type-guards/`

The former private `type-guards` package was dissolved into its consumers. validation-plugin now owns the guards it used (`getTypeDescription`, `isString`, `isBoolean`, `isObjKey`, `isParams`, `isState`, `isNavigationOptions`, `validateRouteName`) as a local `src/type-guards/` subtree behind a barrel. Internal refactor — no public API or behaviour change.
