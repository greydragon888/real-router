---
"@real-router/validation-plugin": minor
---

Implement Phase 2 validator slots: options, dependencies, plugins, lifecycle, routes (#334)

17 new validator implementations: `validateOptions` (retrospective), `validateDependencyCount`, `validateCloneArgs`, `validatePluginKeys`, threshold warnings, overwrite warnings, async guard detection. Property-based tests verify invariants across ~58k generated inputs.
