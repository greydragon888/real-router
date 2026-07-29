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
| `state`        | `validateMakeStateArgs`, `validateAreStatesEqualArgs`, `reportDroppedQueryKey` — the mode gate's opt-in diagnostic (#1575): core silently DROPS a query key the active `queryParamsMode` will not print, and this warns once per route+key so the drop (and a `defaultSearch` that is dead config because of it) is visible in development — raised by EVERY producer, the render-path predicates included (#1581), which is the OPPOSITE of the neighbouring `reportUndeclaredParamKey` and deliberate: see the gotcha below; `reportUndeclaredParamKey` — the undeclared-params-bag diagnostic (#1579, the params half of #1553): a key the route declares NOWHERE stays in `state.params` as app-level data but never reaches the URL, so the state does not round-trip through its own `state.path`. Core's behaviour is UNCHANGED — dropping the key was measured and rejected (it retires a documented capability, and the predicate cannot tell a typo from `navigate("users", { id })` on a parent whose child declares `:id`). Opted into by the COMMITTING producers only, so every predicate — including `canNavigateTo`, which shares the resolving form with `navigate` — stays silent on the render path. ⚠ **Neither diagnostic says anything about a route that does not exist (#1584)** — core gates both on the route being real, because the declaration registries answer `[]` for a missing route exactly as they do for a route with no declarations, and reporting that blamed the caller's bag for a typo in the ROUTE name. ⚠ **Both de-dup caches are per ROUTER, not per module (#1583)** — `buildValidatorObject` closes over a fresh `Set` per registration, so a second router (or an SSR per-request clone) warns again, `teardown()` drops the cache with the validator, and nothing accumulates for the life of the process |
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

### The two diagnostics answer the predicates differently — on purpose (#1581)

`reportDroppedQueryKey` fires from **every** producer, `buildPath` /
`isActiveRoute` / `canNavigateTo` included, so a `<Link>` render can raise it.
`reportUndeclaredParamKey` fires only from the **committing** producers
(`navigate`, `buildNavigationState`) and every predicate stays silent. Both are
correct, and the discriminator is whether anything was LOST:

- the mode gate DROPPED the key, so the URL `buildPath` just returned is missing
  what the caller asked for — the warning is about the answer already handed
  back, and it is exactly the broken call that pays for it;
- the undeclared-param key is KEPT in `state.params`; nothing is wrong with the
  answer, the advice is about a state you are about to commit, and a predicate
  commits nothing.

This is not new behaviour and was never a leak: measured on the base commit of
the phase that fed `buildPath` into the gate, `canNavigateTo` and
`isActiveRoute`'s exact arm were ALREADY reporting through `makeState`. The
"predicates are deliberately not instrumented" line in `core`'s notes belonged to
the **channel guard** and had never described this diagnostic; it now says so.

⚠ The message names the route and the key and **not** the producer. That is a
settled decision, not an omission: de-dup is per route+key, so three producers
hitting the same pair raise ONE warning, and naming a producer would name
whichever ran first while the others with the identical defect went unmentioned.

### Diagnostic de-dup is per router, not per process (#1583)

Both diagnostics warn once per `route + key` — the gate runs on every navigation
and every `matchPath`, so an un-deduped warning would flood a dev console the
moment a route is revisited.

That cache lives on the **validator object**, which `buildValidatorObject` builds
once per registration, i.e. once per router. It used to be a module-level `Set`,
i.e. one per PROCESS, and the consequences all pointed the wrong way for a
dev-time signal:

- a second router — including a `cloneRouter` per-request clone under SSR/SSG —
  never warned for a pair the first one had already reported, so the diagnostic
  fired for request #1 and stayed silent for the life of the process;
- `teardown()` did not clear it, so re-registering the plugin bought silence;
- nothing evicted, so it grew without bound.

Two `reset*` exports existed only so the tests could work around this. They are
gone: a test seam compensating for the design was the design's own bug report.

`tests/functional/no-module-level-cache.test.ts` scans `src/` and fails on a
regression — the shape recurred once already (#1579 copied #1575's module-level
`Set` a release later), which is why the guard is a scan rather than two fixed
call sites. It flags only ACCUMULATING state: a frozen lookup table is fine, and
so is a `WeakMap` keyed by an object, which evicts with its key.

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
