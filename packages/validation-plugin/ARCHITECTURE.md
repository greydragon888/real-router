# @real-router/validation-plugin — Architecture

## Source Structure

```
src/
├── index.ts                  — Public API: validationPlugin(), RouterValidator type
├── validationPlugin.ts       — Plugin factory: isActive() guard, validator construction,
│                               ctx.validator assignment, retrospective pass, teardown
└── validators/
    ├── index.ts              — Barrel re-export for all validator functions
    ├── routes.ts             — RoutesNamespace: buildPath, matchPath, isActiveRoute,
    │                           shouldUpdateNode, addRoute, removeRoute, updateRoute,
    │                           forwardTo param compat + cycle detection, internal prefix guard
    ├── forwardTo.ts          — forwardTo helpers: target existence, param compatibility,
    │                           async callback detection (used by routes.ts)
    ├── options.ts            — OptionsNamespace: limits object shape, individual limit values
    ├── dependencies.ts       — DependenciesNamespace: name format, setDependency args,
    │                           full object structure, getter rejection
    ├── plugins.ts            — PluginsNamespace: count vs maxPlugins limit
    ├── lifecycle.ts          — LifecycleNamespace: handler type, not-registering guard,
    │                           count vs maxLifecycleHandlers
    ├── navigation.ts         — NavigationNamespace: navigate args, navigateToDefault args,
    │                           NavigationOptions shape
    ├── state.ts              — StateNamespace: makeState args, areStatesEqual args
    ├── eventBus.ts           — EventBusNamespace: event name format, listener args
    └── retrospective.ts      — Retrospective validators: run once at usePlugin() time
                                (existing routes, forwardTo consistency, route properties,
                                 dependency store structure, limits consistency)
```

## Validator Data Flow

Core holds a nullable `ctx.validator` slot. When the slot is `null`, all validation calls are skipped. When the plugin registers, it builds a `RouterValidator` object and assigns it to the slot. From that point on, core calls `ctx.validator?.ns.fn(args)` before every mutating operation.

```
router.usePlugin(validationPlugin())
    │
    ├── router.isActive() check — throws VALIDATION_PLUGIN_AFTER_START if already started
    │
    ├── buildValidatorObject()
    │       └── Assembles RouterValidator from all validator modules
    │
    ├── ctx.validator = validator   ← core now calls validators on every operation
    │
    ├── Retrospective pass (try/catch with rollback)
    │       ├── retroV.validateExistingRoutes(store)
    │       ├── retroV.validateForwardToConsistency(store)
    │       ├── retroV.validateRoutePropertiesStore(store)
    │       ├── retroV.validateForwardToTargetsStore(store)
    │       ├── retroV.validateDependenciesStructure(deps)
    │       └── retroV.validateLimitsConsistency(options, store, deps)
    │
    │   On error: ctx.validator = null  ← rollback, then re-throw
    │
    └── return { teardown() { ctx.validator = null } }


router.addRoute(routes)
    │
    └── core: ctx.validator?.routes.validateAddRouteArgs(routes)
                                    └── routes.ts: validateAddRouteArgs()
                                            ├── null/array/non-object check
                                            └── validateRouteProperties() per route
```

## Retrospective Validation Design

The plugin registers after `createRouter()` returns, so routes and dependencies are already in the store. The retrospective pass validates the existing state before the router starts.

This is intentional: users often call `addRoute()` or `setDependency()` before `usePlugin()`. Without retrospective validation, those early calls would bypass all checks. The retrospective pass catches problems that accumulated before the plugin was installed.

The pass runs inside a `try/catch`. If any check fails, `ctx.validator` is rolled back to `null` before the error propagates. The router is left in a clean state — no partial validation active.

Retrospective validators receive store objects typed as `unknown` and cast internally using local structural interfaces. This avoids tight coupling to core's internal types while still accessing the data needed for validation.

## Plugin Lifecycle

```
usePlugin(validationPlugin())
    │
    ├── [REGISTER] isActive() guard
    ├── [REGISTER] buildValidatorObject() — assembles all namespace validators
    ├── [REGISTER] ctx.validator = validator
    ├── [REGISTER] retrospective pass — validates current router state
    │
    │   ... router is running, ctx.validator active ...
    │   ... core calls ctx.validator?.ns.fn() on every operation ...
    │
    └── [TEARDOWN] ctx.validator = null
```

The plugin has no `onStart`, `onStop`, or transition hooks. It only sets and clears `ctx.validator`. All validation happens synchronously inside the validator functions themselves, called by core at the point of each operation.

## Key Design Decisions

### Opt-in validation

Validation is a plugin, not a core feature. This keeps the core bundle small and lets production builds skip validation entirely. The `noValidate: true` option (deprecated) was the old way to disable validation; the new model is simply not registering this plugin.

### `ctx.validator` as a nullable slot

Core checks `ctx.validator?.ns.fn()` — optional chaining means zero overhead when the plugin is absent. The slot is typed as `RouterValidator | null` in core internals. The plugin is the only thing that sets it.

### Retrospective validators use `unknown` parameters

Retrospective functions accept `unknown` and cast internally. This decouples the plugin from core's internal store types. If core refactors its store shape, only the cast logic in `retrospective.ts` needs updating, not the function signatures.

### Rollback on retrospective failure

If the retrospective pass throws, `ctx.validator` is set back to `null`. This prevents a half-validated state where some checks pass but others were never run. The error propagates to the caller of `usePlugin()`.

### No module augmentation

The plugin doesn't extend the router's public API. It only affects internal behavior via `ctx.validator`. No `declare module` augmentation, no `extendRouter()` calls.
