---
"@real-router/validation-plugin": minor
---

The dependency and `cloneRouter` validation is registered as checks and diagnostics (#2388)

Each refusal of `getDependenciesApi` and `cloneRouter` is a check at its door's
position, and each warning a subscription to its diagnostic kind, all removed on
`teardown`. Each refusal and warning keeps its message and logger channel, and
the refusals keep their order.

The re-exported `RouterValidator` type loses its `dependencies` namespace; code
typed against it registers checks and diagnostics instead, as
`@real-router/core` describes.

⚑ **The dependency count is split in two.** The limit refuses at
`setDependency:count` / `setDependencies:count`, and the `warn` / `error`
thresholds are logged from `SET_DEPENDENCY_COUNT` / `SET_DEPENDENCIES_COUNT`.
Core asks the position first, so a write refused at the limit logs nothing.
