---
"@real-router/core": minor
---

refactor(core): drop orphaned `RouterValidator` entries + the dead `validateDependencyLimit` call (#1226)

Removes validation-plugin mirror-drift left after #960: the never-called
`RouterValidator` interface methods `routes.validateExistingRoutes`,
`routes.validateForwardToConsistency`, `options.validateLimitValue`,
`options.validateLimits`, `dependencies.validateDependencyLimit`,
`dependencies.validateDependenciesStructure`, and `eventBus.validateEventName`
(core never invoked any of them — the plugin calls its own file-scope versions),
plus the dead `ctx.validator?.dependencies.validateDependencyLimit(...)` call in
`getDependenciesApi` (the dependency-count limit is enforced by
`validateDependencyCount`). Public type-surface removal (pre-1.0 `minor`); no
runtime behavior change — bare core never called these.
