---
"@real-router/core": patch
---

Dissolve the `DependenciesNamespace` pseudo-namespace into a store module (#2291)

Internal refactor, no behaviour change. The dependency store moves from `src/namespaces/DependenciesNamespace/` to `src/dependenciesStore.ts` and owns every operation core runs on it — one read behind every `getDependency` handed to application code, one clear for `reset()` and `dispose()`, one snapshot for `getAll()` and `getCloneState()` — where each was written out at its call sites. `RouterInternals.dependenciesGetStore()` and the `DependenciesStore` shape are unchanged.
