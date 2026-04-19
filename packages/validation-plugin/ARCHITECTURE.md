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
    ├── plugins.ts            — PluginsNamespace: count vs maxPlugins limit,
    │                           addInterceptor args validation (method enum, function type)
    ├── lifecycle.ts          — LifecycleNamespace: handler type, not-registering guard,
    │                           count vs maxLifecycleHandlers
    ├── navigation.ts         — NavigationNamespace: navigate args, navigateToDefault args,
    │                           NavigationOptions shape, params validation (navigate/buildPath/canNavigateTo),
    │                           start path validation
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
    │       ├── retroV.validateLimitsConsistency(options, store, deps)
    │       ├── validator.options.validateOptions(options)
    │       │       └── cross-field: warnListeners ≤ maxListeners, callbackIgnoresLevel requires callback
    │       └── retroV.validateResolvedDefaultRoute(options.defaultRoute, store)  ← string defaultRoute only
    │               (callback defaultRoute is validated at runtime via ctx.validator?.options.validateResolvedDefaultRoute,
    │                called from core's resolveDefault() on each navigateToDefault() / start() fallback)
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

## Two-Tier Validation Architecture

Validation in Real-Router operates at two distinct levels:

**Tier 1 — Core invariant guards (~94 LOC, always active)**

Core contains structural guards that run regardless of whether the plugin is installed:

| Guard                       | File                             | Purpose                              |
| --------------------------- | -------------------------------- | ------------------------------------ |
| `guardDependencies()`       | `guards.ts`                      | Plain object + no getters            |
| `guardRouteStructure()`     | `guards.ts`                      | Non-array objects, recursive         |
| `validateOptionsIsObject()` | `OptionsNamespace/validators.ts` | Plain object check                   |
| `isLoggerConfig()`          | `typeGuards.ts`                  | Logger config shape                  |
| `validatePlugin()`          | `PluginsNamespace/validators.ts` | Object, not Promise                  |
| `throwIfDisposed()`         | `api/helpers.ts`                 | Router not disposed (×18 call sites) |

In addition, core has two **invariant guards** added specifically to prevent silent corruption and deferred crashes in user-facing API:

- `validateSubscribeListener` — `subscribe(listener)`: deferred crash guard. A non-function listener is stored in the EventEmitter and crashes on the next navigation emit, with no stack trace pointing to `subscribe`. Also contains an actionable hint: `"For Observable pattern use @real-router/rx package"`.
- `navigateToNotFound` typeof check — `navigateToNotFound(path?)`: silent corruption guard. Without this check, `navigateToNotFound(42)` sets `state.path = 42` (a number), which corrupts downstream consumers (`browser-plugin` → `pushState`, `Link` → `href`) without any immediate crash.

**Criterion for adding a guard to core:** only if (a) silent corruption — invalid input does not crash but corrupts state, or (b) deferred crash in a user-facing API — the error is stored and crashes later in an unrelated location with no context pointing to the original call.

**Tier 2 — Plugin DX validation layer (opt-in)**

This plugin adds full argument validation for all public API methods via the `ctx.validator?` nullable slot. Core calls `ctx.validator?.ns.fn(args)` — optional chaining means zero overhead when the plugin is absent.

The plugin covers everything that core's invariant guards do not: argument type checks, shape validation, enum membership, limit enforcement, and descriptive error messages with `[router.METHOD]` prefixes.

### Error Message Convention

All errors thrown by this plugin follow a consistent format:

```
[router.METHOD] descriptive message, got ${typeDescription}
```

Examples:

```
[router.navigate] Invalid route name: expected string, got number
[router.navigate] params must be a plain object, got string
[router.addInterceptor] Invalid method: "intercept". Must be one of: start, buildPath, forwardState
```

**Error type mapping:**

| Error type       | When to use                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `TypeError`      | Wrong argument type or shape                                                                                         |
| `ReferenceError` | Resource not found (route, dependency)                                                                               |
| `RangeError`     | Numeric limit exceeded (`maxPlugins`, `maxLifecycleHandlers`), cross-field limit violation (`warnListeners > maxListeners`) |

Retrospective validation errors use `[validation-plugin]` prefix instead of `[router.METHOD]`, because no specific public method was called — the plugin is checking accumulated state at registration time:

```
[validation-plugin] validateExistingRoutes: duplicate route name "home"
```

## See Also

- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants (validateOptions, validateCloneArgs)
