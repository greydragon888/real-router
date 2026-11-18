---
"@real-router/core": minor
---

`navigateToState`, `setRootPath`, `navigateToDefault` and `start` refuse and report through checks and diagnostics ([#2388](https://github.com/greydragon888/real-router/issues/2388))

Five new check positions: `navigateToState:entry`, `setRootPath:entry`,
`navigateToDefault:entry` and `start:entry` receive the caller's arguments,
`undefined` for an omitted one, and `navigateToDefault:route` receives the name
a `defaultRoute` callback returned. One new diagnostic kind:
`NAVIGATE_TO_DEFAULT`.

`RouterValidator` loses its `options` namespace, `routes.validateSetRootPathArgs`
and four `navigation` members: `validateNavigateToDefaultArgs`,
`validateNavigateToStateArgs`, `validateNavigationOptions` and
`validateStartArgs`. Core never called `options.validateOptions`
([#2367](https://github.com/greydragon888/real-router/issues/2367)). A
validator of your own registers checks at these positions with
`PluginApi.addCheck`, and subscribes to the kind with
`PluginApi.subscribeDiagnostic`, instead.

⚑ **`start:entry` is asked before the `start` interceptor chain**, so a check
there sees `undefined` when the caller passed no path, and its refusal throws
synchronously. `navigateToDefault:route` is asked only when `defaultRoute` is a
callback, once core has resolved all three defaults.

⚑ **`NAVIGATE_TO_DEFAULT` is raised after the `navigateToDefault:entry` checks
pass** and before core resolves the defaults, so a call those checks refuse
reports nothing.

⚠ **A report handler that throws no longer escapes `navigateToDefault`.** The
router logs the throw through `logger.error`, and the navigation runs.
Previously a throwing report of the validator — the warning about a defaults
bag mutated after `createRouter()` — made `navigateToDefault` throw before the
navigation. Only a synchronous throw is isolated; the rejected promise of an
`async` handler is not
([#2836](https://github.com/greydragon888/real-router/issues/2836)).

⚠ **A router disposed by a check at `navigateToDefault:entry`, a handler of
`NAVIGATE_TO_DEFAULT` or the logger callback behind it makes
`navigateToDefault` throw `ROUTER_DISPOSED`.** Previously a logger callback
that disposed the router on the validator's warning left the navigation to
start on the disposed router, and the call rejected with `ROUTER_NOT_STARTED`.

⚠ **A `navigateToDefault` reference bound before `dispose()` throws
`ROUTER_DISPOSED` when called after it**, as `router.navigateToDefault` does,
instead of rejecting with `ROUTER_NOT_STARTED`.
