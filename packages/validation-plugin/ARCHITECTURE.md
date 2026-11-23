# @real-router/validation-plugin — Architecture

## Source Structure

```
src/
├── index.ts                  — Public API: validationPlugin()
├── validationPlugin.ts       — Plugin factory: isActive() guard, the installation mark,
│                               retrospective pass, check and kind registrations,
│                               teardown
├── helpers.ts                — CORE_LIMIT_DEFAULTS (the plugin's single mirror of core's
│                               DEFAULT_LIMITS) and the warn/error threshold arithmetic
│                               every resource counter shares
└── validators/
    ├── index.ts              — Barrel re-export for all validator functions
    ├── routes.ts             — RoutesNamespace: buildPath, matchPath, isActiveRoute,
    │                           shouldUpdateNode, addRoute, removeRoute, updateRoute,
    │                           forwardTo param compat + cycle detection, internal prefix guard
    ├── forwardTo.ts          — forwardTo helpers: target existence, param compatibility,
    │                           async callback detection (used by routes.ts)
    ├── options.ts            — OptionsNamespace: limits object shape, individual limit values
    ├── dependencies.ts       — getDependenciesApi + the store: name format, setDependency args,
    │                           full object structure, getter rejection
    ├── plugins.ts            — PluginsNamespace: count vs maxPlugins limit,
    ├── lifecycle.ts          — the guard doors: handler type, count vs maxLifecycleHandlers,
    │                           guard answers that are neither true nor false,
    │                           a thenable on the synchronous ask
    ├── navigation.ts         — NavigationNamespace: navigate args, navigateToDefault args,
    │                           NavigationOptions shape, params validation (navigate/buildPath/canNavigateTo),
    │                           start path validation
    ├── state.ts              — StateNamespace: makeState args, areStatesEqual args,
    │                           the route resolver's three reports
    ├── eventBus.ts           — the listener count vs maxListeners
    └── retrospective.ts      — Retrospective validators: run once at usePlugin() time
                                (existing routes, forwardTo consistency, route properties,
                                 dependency store structure, limits consistency)
```

## Validator Data Flow

Core asks at named check positions and raises diagnostic kinds. The plugin registers its checks with `PluginApi.addCheck` and subscribes to its kinds with `PluginApi.subscribeDiagnostic`; a position with no check registered calls nothing. The mark of an installation is the plugin's own: a module-level `WeakSet` of the routers it is installed on.

The mark admits one installation per router. A second registration is refused:
it would register every check and kind a second time.

```
router.usePlugin(validationPlugin())
    │
    ├── router.isActive() check — throws VALIDATION_PLUGIN_AFTER_START if already started
    │
    ├── INSTALLED.has(router)? — throws VALIDATION_PLUGIN_ALREADY_INSTALLED
    │
    ├── INSTALLED.add(router)  ← the installation's mark
    │
    ├── Retrospective pass (try/catch with rollback)
    │       ├── retroV.validateExistingRoutes(routes)
    │       ├── retroV.validateForwardToConsistency(forwardMap, lookup)
    │       ├── retroV.validateRoutePropertiesStore(routes)
    │       ├── retroV.validateForwardToTargetsStore(forwardMap, lookup)
    │       ├── retroV.validateDependenciesStructure(dependencies, limits)
    │       ├── retroV.validateLimitsConsistency(options, dependencyCount, maxDependencies)
    │       ├── validateOptions(options, "constructor (retrospective)")
    │       │       └── cross-field: warnListeners ≤ maxListeners, callbackIgnoresLevel requires callback
    │       └── retroV.validateConfiguredDefaultRoute(options.defaultRoute, lookup)  ← string defaultRoute only
    │               (a callback defaultRoute is judged by the check at navigateToDefault:route,
    │                which core asks in resolveDefault() on each navigateToDefault())
    │
    │   On error: INSTALLED.delete(router)  ← rollback, then re-throw
    │
    ├── api.addInterceptor("start", …), api.addCheck(…), api.subscribeDiagnostic(…)
    │
    └── return { teardown() { remove the registrations; INSTALLED.delete(router) } }


router.addRoute(routes)
    │
    └── core: runChecks(ctx.checks, POSITION["addRoute:batch"], …)
                                    └── the check registered there: checkRouteBatch(…, "addRoute", …)
```

## Retrospective Validation Design

The plugin registers after `createRouter()` returns, so routes and dependencies are already in the store. The retrospective pass validates the existing state before the router starts.

This is intentional: users often call `addRoute()` or `setDependency()` before `usePlugin()`. Without retrospective validation, those early calls would bypass all checks. The retrospective pass catches problems that accumulated before the plugin was installed.

The pass runs inside a `try/catch`. If any check fails, the router leaves the mark before the error propagates. The router is left in a clean state — no partial validation active.

Retrospective validators receive facts read from the published surface — routes as `RoutesApi.get` reports them, `PluginApi.getForwardMap()`, `getResolvedLimits()`, `getDependencyKeys()`, `getExternalGuardNames()` — never a core store. The one exception is the dependency getter walk, which reads core's live record: `getInternals` still hands that record out, so a getter can still be planted in it.

## Plugin Lifecycle

```
usePlugin(validationPlugin())
    │
    ├── [REGISTER] isActive() guard
    ├── [REGISTER] INSTALLED.add(router) — the installation's mark
    ├── [REGISTER] retrospective pass — validates current router state
    ├── [REGISTER] checks and diagnostic kinds
    │
    │   ... router is running ...
    │   ... core asks the checks at each position and raises the kinds ...
    │
    └── [TEARDOWN] the registrations removed; INSTALLED.delete(router)
```

The plugin has no `onStart`, `onStop`, or transition hooks. It registers its checks and kinds, and marks and unmarks the router. All validation happens synchronously inside the validator functions themselves, called by core at the point of each operation.

## Key Design Decisions

### Opt-in validation

Validation is a plugin, not a core feature. This keeps the core bundle small and lets production builds skip validation entirely. The `noValidate: true` option (deprecated) was the old way to disable validation; the new model is simply not registering this plugin.

### Checks and kinds, and a mark of its own

Core asks a check position or raises a kind; a position with no check registered calls nothing. Core holds nothing for the plugin: the mark that admits one installation per router is a module-level `WeakSet` in the plugin, so its entry goes with its router. Each copy of the package holds a set of its own, so a second copy installed on the same router is not refused.

### Retrospective validators take facts, not stores

Retrospective functions take values whose types core publishes — `Route`, `LimitsConfig`, a one-hop forward map, a `RouteLookup` — so no local mirror of a core store type exists to drift. A field core adds to `Route` reaches this pass through the type, and a store refactor inside core does not reach it at all.

### Rollback on retrospective failure

If the retrospective pass throws, the router leaves the mark, and nothing is registered: the checks and kinds are registered after the pass. A later installation is not refused, and no check of the failed one runs. The error propagates to the caller of `usePlugin()`.

### No module augmentation

The plugin doesn't extend the router's public API. It only affects internal behavior, through its checks and its kinds. No `declare module` augmentation, no `extendRouter()` calls.

### Core's limit defaults are mirrored once, and the mirror is derived

Core does not publish `DEFAULT_LIMITS`, so the plugin carries its own copy — one, in `helpers.ts`, which every fallback reads. Types come from core wherever core publishes them: `LimitsConfig` keys the bounds table, `EventName` / `EventMethodMap` / `ForwardToCallback` are re-exported rather than re-declared, and the key sets therefore cannot drift silently — a member core adds is a compile error here, not a legitimate option the plugin refuses as unknown.

Only `RouteConfigLike` stays hand-written, because core publishes no equivalent: `forwardMap` appears nowhere in `@real-router/core/types`.

## Two-Tier Validation Architecture

Validation in Real-Router operates at two distinct levels:

**Tier 1 — Core invariant guards (~94 LOC, always active)**

Core contains structural guards that run regardless of whether the plugin is installed:

| Guard                       | File                             | Purpose                              |
| --------------------------- | -------------------------------- | ------------------------------------ |
| `ingestDependencies()`       | `guards.ts`                      | Plain object + no getters            |
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

This plugin adds argument validation for the public API methods through the check positions core asks, and its reports through the diagnostic kinds core raises; a position with no check registered calls nothing.

The plugin covers everything that core's invariant guards do not: argument type checks, shape validation, enum membership, limit enforcement, and descriptive error messages with `[router.METHOD]` prefixes.

### Error Message Convention

All errors thrown by this plugin follow a consistent format:

```
[router.METHOD] descriptive message, got ${typeDescription}
```

`typeDescription` is a string for every value and never throws: an object whose reads throw, or whose constructor's `name` is not a string, is described as `object`.

Examples:

```
[router.navigate] Invalid route name: expected string, got number
[router.navigate] params must be a plain object, got string
```

**Error type mapping:**

| Error type       | When to use                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `TypeError`      | Wrong argument type or shape                                                                                         |
| `ReferenceError` | Resource not found (route, dependency)                                                                               |
| `RangeError`     | Numeric limit exceeded (`maxPlugins`, `maxLifecycleHandlers`), cross-field limit violation (`warnListeners > maxListeners`) |

Retrospective validation errors use `[validation-plugin]` prefix instead of `[router.METHOD]`, because no specific public method was called — the plugin is checking accumulated state at registration time. (The forward-chain checks are a third case: they call core's `resolveForwardChain`, so the refusal is core's and says `[router]`.)

```
[validation-plugin] validateExistingRoutes: duplicate route name "home"
```

## See Also

- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants (validateOptions, validateCloneArgs)
