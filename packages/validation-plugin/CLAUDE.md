# @real-router/validation-plugin

> Opt-in runtime validation layer for Real-Router

## Exports

| Export              | Kind      | Description                                                                 |
| ------------------- | --------- | --------------------------------------------------------------------------- |
| `validationPlugin`  | function  | Plugin factory — pass to `router.usePlugin()`. Takes no arguments.          |
| `RouterValidator`   | type      | Full validator interface that core calls into via `ctx.validator?.ns.fn()`. |

## Validator Namespaces

The `RouterValidator` interface is organized into 8 namespaces, matching core's namespace structure:

| Namespace      | Key methods                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes`       | `validateBuildPathArgs`, `validateMatchPathArgs`, `validateIsActiveRouteArgs`, `validateAddRouteArgs`, `validateRemoveRouteArgs`, `validateUpdateRouteBasicArgs`, `validateUpdateRoute`, `validateRouteName`, `validateExistingRoutes`, `validateForwardToConsistency`, `guardRouteCallbacks`, `guardNoAsyncCallbacks` |
| `options`      | `validateLimitValue`, `validateLimits`, `validateOptions`, `validateResolvedDefaultRoute`                                                                                     |
| `dependencies` | `validateDependencyName`, `validateSetDependencyArgs`, `validateDependenciesObject`, `validateDependencyExists`, `validateDependencyLimit`, `validateDependenciesStructure`, `validateCloneArgs` |
| `plugins`      | `validatePluginLimit`, `validateNoDuplicatePlugins`, `validatePluginKeys` (validates hook names: `onStart`, `onStop`, `onTransitionStart`, `onTransitionLeaveApprove`, `onTransitionSuccess`, `onTransitionError`, `onTransitionCancel`, `teardown`), `validateCountThresholds`, `validateAddInterceptorArgs` |
| `lifecycle`    | `validateHandler`, `validateNotRegistering`, `validateHandlerLimit`, `validateCountThresholds`                                                                                |
| `navigation`   | `validateNavigateArgs`, `validateNavigateToDefaultArgs`, `validateNavigationOptions`, `validateParams`, `validateStartArgs`                                                   |
| `state`        | `validateMakeStateArgs`, `validateAreStatesEqualArgs`                                                                                                                         |
| `eventBus`     | `validateEventName`, `validateListenerArgs` — validates event names: `$start`, `$stop`, `$$start`, `$$leaveApprove`, `$$cancel`, `$$success`, `$$error`                      |

## Gotchas

### Register before start()

`validationPlugin()` must be registered before `router.start()`. Registering after start throws `RouterError("VALIDATION_PLUGIN_AFTER_START")`. This is enforced because the retrospective pass needs to run before the router begins navigating.

### `undefined` path is allowed in `validateStartArgs`

`validateStartArgs(undefined)` does not throw. This is intentional: the facade calls `validateStartArgs(startPath)` **before** the interceptor pipeline runs. `browser-plugin` injects `window.location` via `addInterceptor("start", ...)`, which wraps the internal `start()` call — **after** facade validation. If `undefined` were rejected, `router.start()` without an argument would fail when `browser-plugin` is installed.

### Retrospective rollback on failure

If the retrospective pass throws (e.g., duplicate route name in existing routes), `ctx.validator` is set back to `null` before the error propagates. The router is left in a clean state — no partial validation active. The error surfaces at the `usePlugin()` call site.

### Teardown disables validation

Calling the unsubscribe function returned by `router.usePlugin(validationPlugin())` sets `ctx.validator = null`. All subsequent router calls skip validation silently. This is by design — plugins are removable.

### Cross-field `Options` validation

`validateOptions` + the retrospective pass diagnose combinations that individual field checks cannot catch:

| Combination                                                                 | Behavior                                   | Location                                      |
| --------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `limits.warnListeners > limits.maxListeners` (and `maxListeners > 0`)       | `throw RangeError`                         | `validators/options.ts::validateLimits`       |
| `logger.callbackIgnoresLevel: true` without `logger.callback`               | `logger.error("router.<method>", …)` (non-throwing — option would be ignored) | `validators/options.ts::validateLoggerOption` |
| Static `defaultRoute: "<name>"` that does not exist in the route tree       | `throw Error` with `[validation-plugin]` prefix | Retrospective pass (`validationPlugin.ts`) |
| `DefaultRouteCallback` returning a name that does not exist in the route tree | `throw Error` with `[validation-plugin]` prefix; propagates as `Promise.reject` via `navigateToDefault()` / `start()` fallback | Runtime hook `options.validateResolvedDefaultRoute` called from core's `resolveDefault()` when `defaultRoute` is a callback |

Callbacks are intentionally **not** probed at registration time — their return value depends on dependencies that may not be set yet. The hook on `resolveDefault()` catches bad return values on the first actual use.

### `navigateToDefault()` Promise contract

`navigateToDefault()` is declared `Promise<State>` but is not `async`. Synchronous exceptions from `deps.resolveDefault()` — a callback that throws, or a validator that rejects a callback's return — are caught and converted to `Promise.reject` so callers can uniformly handle errors via `.catch()` / `await`.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Source structure, data flow, design decisions
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — How core calls `ctx.validator?.ns.fn()`
- [packages/core/src/types/RouterValidator.ts](../core/src/types/RouterValidator.ts) — Full interface definition
