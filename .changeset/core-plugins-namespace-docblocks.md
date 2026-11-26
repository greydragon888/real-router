---
"@real-router/core": patch
---

Correct what the `PluginsNamespace` docblocks say the facade checks (#2974)

`PluginsNamespace.use` and its batch deduplication no longer describe a
duplicate check by the facade: the facade asks the checks that stand at
`usePlugin:count` and `usePlugin:entry`, and a factory an earlier call
registered is not looked for. Comments only; no runtime change.
