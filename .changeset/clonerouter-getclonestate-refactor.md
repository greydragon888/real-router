---
"@real-router/core": patch
---

Consolidate `cloneRouter` clone-state into a single `getCloneState()` accessor (#964)

Internal refactor — no public API or behavior change. `cloneRouter` previously
read its clone snapshot through three separate `RouterInternals` methods
(`cloneOptions`, `cloneDependencies`, `getPluginFactories`). These collapse into
one `getCloneState()` returning `{ options, dependencies, pluginFactories }`, so a
new clone-relevant subsystem is wired in a single place. The general-purpose
`routeGetStore` accessor is unchanged.
