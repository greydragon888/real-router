---
"@real-router/core": minor
---

fix(core): thread `parentName` into the `RouterValidator.routes.validateRoutes` type (#1224)

`RouterValidator.routes.validateRoutes` gained an optional `parentName?: string`
third argument, threaded from the `add({ parent })` call site (`getRoutesApi.ts`).
Without it the validation plugin validated a parented batch "from the root" and
false-rejected a `forwardTo` whose target needs the parent's path params — an add
that bare core accepts and runs correctly. Additive, non-breaking (optional
param); pre-1.0 `minor` for the public type surface. Bare core is unchanged (the
validator is `null` without the plugin).
