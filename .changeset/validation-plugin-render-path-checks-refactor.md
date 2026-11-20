---
"@real-router/validation-plugin": minor
---

The validation of the render-path doors and the state builders moves onto checks and diagnostics (#2388)

The argument refusals of `buildPath`, `buildPathResolved`, `isActiveRoute`,
`areStatesEqual`, `shouldUpdateNode` and `matchPath` are checks at their
`:entry` positions; what a route's `decodeParams` returns is refused at
`matchPath:decoded`, the arguments of `makeState` at `makeState:state`, and
what the navigation pipeline builds a state from at `navigate:state`. The
warning about a declared query name handed in the `params` bag is a
subscription to `BUILD_PATH` and `IS_ACTIVE_ROUTE`. All are removed on
`teardown`, and each refusal and report keeps its message.

The re-exported `RouterValidator` type loses its `routes` and `navigation`
namespaces and `state.validateMakeStateArgs` / `state.validateAreStatesEqualArgs`;
code typed against it registers checks and diagnostics instead, as
`@real-router/core` describes.

⚑ **The warning follows the entry refusals.** A `buildPath` or `isActiveRoute`
call the plugin refuses at its entry logs no warning about a declared query
name in `params`, and the warning comes on the first call that passes.
Previously a `buildPath` call with `params` or `search` of the wrong shape,
and an `isActiveRoute` call with a `search` of the wrong shape, logged it
before the throw. `buildPath` refuses a path value — a `Symbol`, say — after the warning,
as before.

⚠ **A throw from the warning no longer escapes the door.** A `console.warn`
that throws is logged through the router's `logger.error`, and `buildPath`
returns its path, `isActiveRoute` its answer.
