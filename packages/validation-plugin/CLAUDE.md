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
| `routes`       | `validateBuildPathArgs`, `validateMatchPathArgs`, `validateIsActiveRouteArgs`, `validateAddRouteArgs`, `validateRemoveRouteArgs`, `validateUpdateRouteBasicArgs`, `validateUpdateRoute`, `validateRouteName`, `guardRouteCallbacks`, `guardNoAsyncCallbacks` |
| `options`      | `validateOptions`, `validateResolvedDefaultRoute`                                                                                                                             |
| `dependencies` | `validateDependencyName`, `validateSetDependencyArgs`, `validateDependenciesObject`, `validateDependencyExists`, `validateDependencyCount`, `validateCloneArgs` |
| `plugins`      | `validatePluginLimit`, `validateNoDuplicatePlugins`, `validatePluginKeys` (validates hook names: `onStart`, `onStop`, `onTransitionStart`, `onTransitionLeaveApprove`, `onTransitionSuccess`, `onTransitionError`, `onTransitionCancel`, `teardown`), `validateCountThresholds`, `validateAddInterceptorArgs` |
| `lifecycle`    | `validateHandler`, `validateHandlerLimit`, `validateCountThresholds`                                                                                |
| `navigation`   | `validateNavigateArgs`, `validateNavigateToDefaultArgs`, `validateNavigationOptions`, `validateParams`, `validateStartArgs`                                                   |
| `state`        | `validateMakeStateArgs`, `validateAreStatesEqualArgs`                                                                                                                         |
| `eventBus`     | `validateListenerArgs` — validates event names: `$start`, `$stop`, `$$start`, `$$leaveApprove`, `$$cancel`, `$$success`, `$$error`; `validateCountThresholds` — proactive `warn@20% / error@50%` on the per-event listener count for `subscribe` / `addEventListener` (#1188), mirroring the plugins / lifecycle / dependencies counters |

## Gotchas

### Register before start()

`validationPlugin()` must be registered before `router.start()`. Registering after start throws `RouterError("VALIDATION_PLUGIN_AFTER_START")`. This is enforced because the retrospective pass needs to run before the router begins navigating.

### `undefined` path is allowed in `validateStartArgs`

`validateStartArgs(undefined)` does not throw. This is intentional: the facade calls `validateStartArgs(startPath)` **before** the interceptor pipeline runs. `browser-plugin` injects `window.location` via `addInterceptor("start", ...)`, which wraps the internal `start()` call — **after** facade validation. If `undefined` were rejected, `router.start()` without an argument would fail when `browser-plugin` is installed.

### Unsafe path-param value rejection (#934 / #942)

`validateParams` (navigate / buildPath / canNavigateTo) and `validateStartArgs` reject param **values** and start paths that cannot safely round-trip through a URL path — these are silently accepted by bare core (validator-opt-in):

| Input | Bare core (no plugin) | With plugin |
| --- | --- | --- |
| Symbol / BigInt param value (`{ id: Symbol() }`) | path-param: silent corruption (raw Symbol in `state.params`, non-round-tripping path); query-param: raw `TypeError` from `String(symbol)` | actionable `TypeError` naming the key: `param "id" cannot be a symbol …` |
| Control char in a param value or start path (NUL / C0 / DEL) | percent-encoded into `state.path` (`%00`, `%01`) — a valid-but-unreadable URL | `TypeError("… must not contain control characters …")` |

Value inspection is **own-property only** (mirrors `isParams`) and runs before the generic shape check so the message pinpoints the offending value rather than reporting the generic "params must be a plain object".

### Retrospective rollback on failure

If the retrospective pass throws (e.g., duplicate route name, or a **dotted route name** in the constructor's initial routes — `validateExistingRoutes` rejects a flat dotted `name` symmetric with `add()`/`replace()`, #1194), `ctx.validator` is set back to `null` before the error propagates. The router is left in a clean state — no partial validation active. The error surfaces at the `usePlugin()` call site.

### Teardown disables validation

Calling the unsubscribe function returned by `router.usePlugin(validationPlugin())` sets `ctx.validator = null`. All subsequent router calls skip validation silently. This is by design — plugins are removable.

### Cross-field `Options` validation

`validateOptions` + the retrospective pass diagnose combinations that individual field checks cannot catch:

| Combination                                                                 | Behavior                                   | Location                                      |
| --------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `limits.warnListeners > limits.maxListeners` (and `maxListeners > 0`)       | `throw RangeError`                         | `validators/options.ts::validateLimits`       |
| Static `defaultRoute: "<name>"` that does not exist in the route tree       | `throw Error` with `[validation-plugin]` prefix | Retrospective pass (`validationPlugin.ts`) |
| `DefaultRouteCallback` returning a name that does not exist in the route tree | `throw Error` with `[validation-plugin]` prefix; propagates as `Promise.reject` via `navigateToDefault()` / `start()` fallback | Runtime hook `options.validateResolvedDefaultRoute` called from core's `resolveDefault()` when `defaultRoute` is a callback |

Callbacks are intentionally **not** probed at registration time — their return value depends on dependencies that may not be set yet. The hook on `resolveDefault()` catches bad return values on the first actual use.

**Logger config is not validated by this plugin.** The Router constructor consumes `options.logger` (applies it to the process-global logger singleton) and strips the key before options are stored (#724), so the retrospective pass — which reads the stored, logger-stripped options — never sees it. Logger config (`level` incl. `"none"`, `callback`, `callbackIgnoresLevel`) is therefore validated solely by core's `isLoggerConfig` guard at construction, the only place the input exists (#789). A prior `validateLoggerOption` here was dead on the live path and was removed.

### `navigateToDefault()` Promise contract

`navigateToDefault()` is declared `Promise<State>` but is not `async`. Synchronous exceptions from `deps.resolveDefault()` — a callback that throws, or a validator that rejects a callback's return — are caught and converted to `Promise.reject` so callers can uniformly handle errors via `.catch()` / `await`.

### Reaches the engine only through `@real-router/core` (#1301)

The plugin does **not** import the foundation `route-tree` package. `validateRoute` (the batch route/path validator — no matcher equivalent) comes from the `@real-router/core/validation` subpath; forwardTo segment lookup + target existence use the matcher's own `getSegmentsByName` / `hasRoute` (via `store.matcher`, threaded into `validateRoutes` → `validateForwardToTargets`); the `RouteTree` / `Matcher` types come from core. This keeps core the sole consumer of the routing engine. `tests/functional/no-route-tree.test.ts` scans `src/` for any `route-tree` import and fails on a regression — keep it green (and `route-tree` out of `devDependencies`).

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Source structure, data flow, design decisions
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — How core calls `ctx.validator?.ns.fn()`
- [packages/core/src/types/RouterValidator.ts](../core/src/types/RouterValidator.ts) — Full interface definition
