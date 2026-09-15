---
"@real-router/validation-plugin": minor
---

Read the adopted-origins record from `PluginApi` instead of the internals door (#2339)

`defaultsWatch.watch(...)` now takes `getPluginApi(router).getAdoptedOrigins()`.
Same record, same timing — the call still runs before the validator goes live, so
the first `navigateToDefault` after installation still has a baseline. What changes
is which published surface the plugin depends on.
