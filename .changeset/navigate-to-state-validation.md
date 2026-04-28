---
"@real-router/validation-plugin": minor
---

Add `validateNavigateToStateArgs` validator for `api.navigateToState` (#525)

New validator function and `RouterValidator` namespace entry covering the
new `getPluginApi(router).navigateToState(state, opts)` primitive:

- Rejects `state` that is not an object or is `null` with `TypeError`.
- Rejects `state` missing required structural fields (`name`, `params`,
  `path`) or with wrong types per `isString` / `isParams`.

Wired through `validationPlugin` so `ctx.validator?.navigation.validateNavigateToStateArgs(state)` is called from the core's `getPluginApi.navigateToState` boundary when the plugin is registered.

No public API surface change for validation-plugin consumers — the
validator is invoked indirectly by core when validation-plugin is active.
