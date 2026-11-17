---
"@real-router/core": minor
---

`usePlugin` refuses and reports through checks and diagnostics (#2388)

Three new check positions: `usePlugin:count`, `usePlugin:entry` and
`usePlugin:plugin`. Three new diagnostic kinds: `USE_PLUGIN_COUNT`,
`USE_PLUGIN_DUPLICATE_IN_BATCH` and `USE_PLUGIN_HOOK_NOT_FUNCTION`.

`RouterValidator` loses its `plugins` namespace: core has no consultation left
for it. A validator of your own registers checks at these positions with
`PluginApi.addCheck`, and subscribes to these kinds with
`PluginApi.subscribeDiagnostic`, instead.

⚑ **`usePlugin:count` judges the call whole**, once, before its first factory
runs, with the number of plugins the router holds, the number of distinct
factories in the call and the resolved `limits.maxPlugins`. `usePlugin:entry`
receives each factory with the factories the router held when the call began,
and `usePlugin:plugin` the object a factory returned, after core's own shape
check. `USE_PLUGIN_COUNT` follows once the count and entry checks pass, with
the number of plugins held plus every factory the call carries, so a call
refused there reports nothing.

⚠ **A report handler that throws no longer escapes `usePlugin`.** The router
logs the throw through `logger.error`, and the install completes as if the
handler had returned. Previously a throwing count or batch-duplicate report of
the validator made `usePlugin` throw before any factory ran, and a throwing
hook-type report threw after the factory had run, leaving its `teardown`
uncalled. Only a synchronous throw is isolated; the rejected promise of an
`async` handler is not (#2836).

⚠ **Disposing the router during `usePlugin` makes the call throw
`ROUTER_DISPOSED`**, whether a factory, a check, a report handler or the logger
callback disposes it. If that happens before a factory runs, the factory does
not run. If it happens during a plugin's start, the plugin's `teardown` runs
first, and a batch rolls back. Previously the call returned a working
unsubscribe for a plugin wired into the cleared emitter, whose `teardown` ran
only when the caller unsubscribed, and a router disposed before a factory still
ran that factory.

Bare core builds the distinct-factory set and the registered list only for a
check at their position.
