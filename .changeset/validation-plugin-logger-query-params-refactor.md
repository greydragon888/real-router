---
"@real-router/validation-plugin": minor
---

Read `logger`, `getOptions` and the declared query names from `PluginApi` instead of the internals door (#2339)

Twenty reads move: eighteen inside `buildValidatorObject`, two in the factory body.
Same values — `PluginApi.getOptions` was measured identical to its internals twin
(the same frozen object, stable across calls, nested `limits` included), and the
other two are the frozen logger view and the renamed call the core changeset describes.

`buildValidatorObject` now takes the plugin API beside the internals bag, and the
bag it still needs shrinks from four members to one: `dependenciesGetStore`, whose
type no subpath publishes and which a later slice dissolves into narrower members.
Across the whole plugin the internals reach drops from six members to three.

⚠ Two test spies still reach `getInternals(router).logger` directly
(`validator-boundary-authority-2322`). That is deliberate scope: the shipped
consumer moved, the test seam did not, and the door census counts tests as
consumers on purpose.
