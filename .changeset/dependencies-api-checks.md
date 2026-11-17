---
"@real-router/core": minor
---

`getDependenciesApi` and `cloneRouter` stop consulting the validator (#2388)

Nine new check positions: `getDependency:entry`, `getDependency:value`,
`setDependency:entry`, `setDependency:count`, `setDependencies:entry`,
`setDependencies:count`, `removeDependency:entry`, `hasDependency:entry` and
`cloneRouter:entry`. Five new diagnostic kinds: `SET_DEPENDENCY_COUNT`,
`SET_DEPENDENCIES_COUNT`, `SET_DEPENDENCY_OVERWRITE`,
`SET_DEPENDENCIES_OVERWRITE` and `REMOVE_DEPENDENCY_MISSING`.

`RouterValidator` loses its `dependencies` namespace: core has no consultation
left for it. A validator of your own registers checks at these positions with
`PluginApi.addCheck`, and subscribes to these kinds with
`PluginApi.subscribeDiagnostic`, instead.

⚑ **A count position is asked about a NEW key only**, with the number of keys
the record held before the write and `limits.maxDependencies`. The count kind
follows with the same two numbers once the checks there pass, so a refused write
reports nothing.

⚠ **A report handler that throws no longer escapes the door.** On `set`,
`setAll` and `remove`, the router logs the throw through `logger.error`, and the
call completes as if the handler had returned. Previously a throwing overwrite
or missing-key report of the validator escaped all three: `set` before the
write, `setAll` after every key was written. Only a synchronous throw is
isolated; the rejected promise of an `async` handler is not (#2836).

Bare core reads the record's keys only for a consumer: a check at the count
position, or a handler of the count or overwrite kind.
