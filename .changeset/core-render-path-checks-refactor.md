---
"@real-router/core": minor
---

The render-path doors and the state builders refuse and report through checks and diagnostics (#2388)

Nine new check positions. `buildPath:entry`, `isActiveRoute:entry` and
`shouldUpdateNode:entry` receive the caller's arguments, `matchPath:entry` the
path, `buildPathResolved:entry` the caller's two bags, and
`areStatesEqual:entry` the two states with `ignoreQueryParams` defaulted to
`true`. Three positions receive what core builds a state from:
`matchPath:decoded` the route name and the params the route's `decodeParams`
returned, asked only for a route with a decoder; `makeState:state` the
arguments of `makeState` with core's copy of the params; and `navigate:state`
the name and params the navigation pipeline builds its state from, where a
refusal rejects the navigation. Two new diagnostic kinds: `BUILD_PATH` and
`IS_ACTIVE_ROUTE`.

`RouterValidator` loses its `routes` and `navigation` namespaces and two `state`
members, `validateMakeStateArgs` and `validateAreStatesEqualArgs`; it keeps the
three `state` reports. A validator of your own registers checks at these
positions with `PluginApi.addCheck`, and subscribes to the kinds with
`PluginApi.subscribeDiagnostic`, instead.

⚑ **`BUILD_PATH` and `IS_ACTIVE_ROUTE` are raised after the door's `:entry`
checks pass**, so a call those checks refuse reports nothing. `buildPath`
raises its kind before it copies the params bag, so a refusal at
`buildPath:params` follows the report.

⚠ **A report handler that throws no longer escapes `buildPath` or
`isActiveRoute`.** The router logs the throw through `logger.error`, and the
door answers. Previously a throwing report of the validator made the call throw.
