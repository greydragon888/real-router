---
"@real-router/core": patch
---

Move clone callbacks setup from Router into RouterWiringBuilder

`getCloneData` callback moved to `wireCloneCallbacks()` in RouterWiringBuilder.
`applyConfig` callback inlined into `Router.clone()` (same-class private field access).
New `RoutesNamespace.applyClonedConfig()` encapsulates the 5x Object.assign + setResolvedForwardMap logic.
`CloneNamespace.setCallbacks()` split into `setGetCloneData()` + `applyConfig` parameter on `clone()`.
