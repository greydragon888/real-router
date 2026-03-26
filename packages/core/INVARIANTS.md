# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## createRouter (factory)

`createRouter(routes?, options?, dependencies?)` is the factory function that creates a new router instance. These invariants verify that the factory produces a valid, unstarted router with the expected configuration.

| #   | Invariant               | Description                                                                                                           |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | No-args returns router  | `createRouter()` with no arguments returns a valid router with `isActive() === false` and `getState() === undefined`. |
| 2   | Routes are registered   | For any array of uniquely-named routes, `getRoutesApi(router).has(name)` returns `true` for each provided route.      |
| 3   | Dependencies accessible | Dependencies passed as the third argument are retrievable via `getDependenciesApi(router).get(name)`.                 |

## nameToIDs (pure function)

`nameToIDs(name)` converts a dot-separated route name into an array of ancestor IDs. It has five fast-path branches for 0-4 segments and a general path for 5+. These invariants serve as a regression net for any future optimizations to those branches.

| #   | Invariant                          | Description                                                                                                                                |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Last element equals original name  | `nameToIDs(name).at(-1) === name` for any non-empty name. The full name is always the last entry in the ID array.                          |
| 2   | First element equals first segment | `nameToIDs(name)[0] === name.split(".")[0]`. The root segment is always the first entry.                                                   |
| 3   | Length equals segment count        | For any name, `nameToIDs(name).length === name.split(".").length`. One ID per segment, no more, no less.                                   |
| 4   | Prefix property                    | `nameToIDs("a.b")` is a strict element-wise prefix of `nameToIDs("a.b.c")`. Shorter names produce arrays that are prefixes of longer ones. |
| 5   | Empty string acceptance            | `nameToIDs("") === [""]`. The empty string is a valid input and returns a single-element array.                                            |
| 6   | Monotonic string lengths           | Each element is strictly longer than the previous: `ids[i].length < ids[i+1].length`. Segments accumulate length as depth increases.       |
| 7   | Nesting via dot-prefix             | Each element is a dot-prefix of the next: `ids[i+1].startsWith(ids[i] + ".")`. The hierarchy is encoded in the string structure.           |

## areStatesEqual

`router.areStatesEqual(s1, s2, ignoreQueryParams?)` compares two router states. It operates on plain state objects and does not require registered routes.

| #   | Invariant                         | Description                                                                                                                                                   |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reflexivity                       | `areStatesEqual(s, s) === true` for any state. A state is always equal to itself.                                                                             |
| 2   | Symmetry                          | `areStatesEqual(s1, s2) === areStatesEqual(s2, s1)`. Equality is commutative.                                                                                 |
| 3   | Both undefined                    | `areStatesEqual(undefined, undefined) === true`. Two absent states are considered equal.                                                                      |
| 4   | One undefined                     | `areStatesEqual(s, undefined) === false` for any defined state. A defined state is never equal to an absent one.                                              |
| 5   | Monotonicity of ignoreQueryParams | If `areStatesEqual(s1, s2, false) === true`, then `areStatesEqual(s1, s2, true) === true`. Ignoring query params can only make states more equal, never less. |
| 6   | Different names implies not equal | If `s1.name !== s2.name`, then `areStatesEqual(s1, s2) === false`. Route name is the primary equality discriminant.                                           |
| 7   | Transitivity                      | If `areStatesEqual(a, b)` and `areStatesEqual(b, c)`, then `areStatesEqual(a, c)`. Equality is transitive.                                                    |

## buildPath / matchPath Roundtrip

`router.buildPath(name, params)` and `pluginApi.matchPath(path)` form an inverse pair. These invariants verify that the URL-building and URL-matching layers are consistent with each other.

| #   | Invariant              | Description                                                                                                                                                                  |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Roundtrip name         | `matchPath(buildPath(name, params)).name === name`. Building a URL and matching it back always recovers the original route name.                                             |
| 2   | Params preserved       | URL params from `matchPath(buildPath(name, params)).params` match the originals after string coercion. Numeric params become strings after decode, but values are preserved. |
| 3   | Path starts with slash | `buildPath(name, params)` always starts with `/`. All generated URLs are absolute paths.                                                                                     |
| 4   | Determinism            | `buildPath(name, params)` returns the same string for identical arguments. URL building is a pure function.                                                                  |
| 5   | Query params roundtrip | For routes with query parameters (e.g., `?q&page`), query values survive the build-then-match cycle intact.                                                                  |
| 6   | Static route default   | `buildPath("home")` with no params returns `/`. Static routes with no required params work without arguments.                                                                |

## isActiveRoute

`router.isActiveRoute(name, params?, strictEquality?, ignoreQueryParams?)` checks whether a route is currently active. It requires a started router with a current state.

| #   | Invariant                          | Description                                                                                                                                                                               |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Current route is active            | `isActiveRoute(currentState.name, currentState.params) === true`. The current route is always reported as active.                                                                         |
| 2   | Current route with strict equality | `isActiveRoute(currentState.name, currentState.params, true) === true`. Exact-match mode still recognizes the current route.                                                              |
| 3   | Ancestor is active                 | `isActiveRoute(parentName) === true` when the current route is a descendant of `parentName`. Ancestor routes are active by default.                                                       |
| 4   | Strict equality blocks ancestor    | `isActiveRoute(parentName, {}, true) === false` when `parentName !== currentState.name`. Strict mode requires an exact name match.                                                        |
| 5   | Monotonicity of strict             | If `isActiveRoute(name, params, true) === true`, then `isActiveRoute(name, params, false) === true`. Strict active implies loose active.                                                  |
| 6   | Monotonicity of ignoreQueryParams  | If `isActiveRoute(name, params, strict, false) === true`, then `isActiveRoute(name, params, strict, true) === true`. Ignoring query params can only make a route more active, never less. |
| 7   | Empty string returns false         | `isActiveRoute("") === false`. An empty route name is never considered active, regardless of current state.                                                                               |

## shouldUpdateNode

`router.shouldUpdateNode(nodeName)` returns a predicate that tells view layers whether a given route segment needs to re-render after a navigation.

| #   | Invariant                         | Description                                                                                                                                                                        |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Consistency with navigate         | After `navigate(toName)`, `shouldUpdateNode(segment)(toState, fromState) === true` for every segment in `activated` or `deactivated`. All changed segments are flagged for update. |
| 2   | Root node on first navigation     | `shouldUpdateNode("")(state) === true` after the first navigation. The root node always updates when there is no previous state.                                                   |
| 3   | Unrelated segment returns false   | `shouldUpdateNode("admin")(toState, fromState) === false` when navigating between routes that do not touch the `admin` subtree. Unchanged segments are not flagged.                |
| 4   | Intersection segment returns true | `shouldUpdateNode(intersection)(toState, fromState) === true` when navigating between siblings. The shared ancestor is included in the update check.                               |

## buildState / makeState (state factories)

`pluginApi.buildState(name, params)` and `pluginApi.makeState(name, params, path)` are factory functions for creating state objects. They are used internally by the navigation pipeline and by plugins.

| #   | Invariant                         | Description                                                                                                                                                                                      |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | buildState path matches buildPath | `buildState(name, params).path === buildPath(name, params)`. The path embedded in the state object matches the URL that `buildPath` would generate.                                              |
| 2   | buildState name matches request   | `buildState(name, params).name === name`. The state name is the requested route name (or its forwarded target).                                                                                  |
| 3   | makeState returns frozen state    | `Object.isFrozen(makeState(name, params, path)) === true`. All state objects are deeply frozen at creation.                                                                                      |
| 4   | makeState determinism             | `makeState(name, params, path)` with identical arguments produces structurally equal states (same name, path, and params). The `id` field differs between calls but all other fields are stable. |

## Router Lifecycle (start / stop / dispose)

These invariants cover the FSM-driven lifecycle of the router. Each state transition has observable consequences on `isActive()` and `getState()`.

| #   | Invariant                    | Description                                                                                                                                                                                                    |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | start sets isActive          | After `await start(path)`, `isActive() === true`. A started router reports itself as active.                                                                                                                   |
| 2   | start sets state             | After `await start(path)`, `getState() !== undefined`. Starting the router establishes an initial state.                                                                                                       |
| 3   | stop clears isActive         | After `stop()`, `isActive() === false`. A stopped router is no longer active.                                                                                                                                  |
| 4   | stop clears state            | After `stop()`, `getState() === undefined`. Stopping the router clears the current state.                                                                                                                      |
| 5   | Restart works                | After `stop()`, a subsequent `start(path)` succeeds and `isActive() === true`. The router can be restarted after stopping.                                                                                     |
| 6   | Double start rejects         | Calling `start()` on an already-started router rejects with `ALREADY_STARTED`. Starting twice is an error.                                                                                                     |
| 7   | dispose blocks all mutations | After `dispose()`, all 8 mutating methods (`navigate`, `navigateToDefault`, `navigateToNotFound`, `start`, `stop`, `usePlugin`, `subscribe`, `canNavigateTo`) throw `RouterError` with code `ROUTER_DISPOSED`. |
| 8   | dispose is idempotent        | Calling `dispose()` twice does not throw. The second call is a no-op.                                                                                                                                          |
| 9   | dispose works from any state | `dispose()` does not throw when called from IDLE or READY. The router can be disposed at any lifecycle stage.                                                                                                  |

## navigate / transition.segments

`router.navigate(name, params, opts)` is the primary navigation method. After a successful navigation, `getState().transition.segments` describes which route segments changed.

| #   | Invariant                                  | Description                                                                                                                                                            |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Partition coverage                         | `deactivated.length + activated.length` accounts for all segments that changed between `fromState` and `toState`. No changed segment is omitted.                       |
| 2   | Intersection is common prefix              | If `intersection` is non-empty, both `fromState.name` and `toState.name` start with it. The intersection is the deepest shared ancestor.                               |
| 3   | Deactivated in reverse order               | `segments.deactivated` is ordered from leaf to root (longest name first). Guards run innermost-first during deactivation.                                              |
| 4   | Activated in forward order                 | `segments.activated` is ordered from root to leaf (shortest name first). Guards run outermost-first during activation.                                                 |
| 5   | First navigation has no deactivated        | After `start(path)`, `segments.deactivated === []`. There is nothing to deactivate when there is no previous state.                                                    |
| 6   | Same route rejects with SAME_STATES        | Navigating to the current route with the same params rejects with `SAME_STATES`. Redundant navigations are rejected.                                                   |
| 7   | Unknown route rejects with ROUTE_NOT_FOUND | `navigate("nonexistent")` rejects with `ROUTE_NOT_FOUND`. Navigation to unregistered routes always fails.                                                              |
| 8   | Concurrent navigation cancels first        | Starting a second navigation while the first is in progress causes the first to reject with `TRANSITION_CANCELLED`. The second navigation wins.                        |
| 9   | reload bypasses SAME_STATES                | `navigate(currentName, currentParams, { reload: true })` succeeds even when the state would otherwise be identical. The `reload` flag forces re-entry.                 |
| 10  | State consistency                          | The state returned by the resolved `navigate()` promise is the same object as `getState()`. There is no gap between the resolved value and the router's current state. |
| 11  | AbortSignal cancellation                   | Navigating with a pre-aborted `AbortSignal` rejects with `TRANSITION_CANCELLED`. External cancellation via `opts.signal` is respected.                                 |
| 12  | Force replace from UNKNOWN_ROUTE           | When navigating FROM `UNKNOWN_ROUTE` state, `opts.replace` is auto-forced to `true`. This prevents browser history pollution with 404 entries.                         |

## navigateToNotFound

`router.navigateToNotFound(path?)` is a synchronous method that sets the router to the `UNKNOWN_ROUTE` state, bypassing the transition pipeline entirely.

| #   | Invariant                   | Description                                                                                                                      |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | State name is UNKNOWN_ROUTE | `navigateToNotFound(path).name === UNKNOWN_ROUTE`. The resulting state always has the special unknown-route name.                |
| 2   | Params is empty             | `navigateToNotFound(path).params` is `{}`. The unknown-route state carries no route parameters.                                  |
| 3   | Path is preserved           | `navigateToNotFound(path).path === path`. The original URL is stored in the state for display or logging.                        |
| 4   | Synchronous return          | The method returns a `State` object, not a `Promise`. It completes synchronously without entering the async pipeline.            |
| 5   | getState consistency        | After `navigateToNotFound(path)`, `getState().name === UNKNOWN_ROUTE`. The router's current state reflects the call immediately. |
| 6   | Not started throws          | Calling `navigateToNotFound()` on a router that has not been started throws `RouterError` with code `ROUTER_NOT_STARTED`.        |
| 7   | Plugins receive success     | After `navigateToNotFound()`, plugins' `onTransitionSuccess` is called with `opts.replace === true`.                             |
| 8   | Plugins skip start          | `navigateToNotFound()` does not trigger `onTransitionStart` on plugins. The transition pipeline is bypassed.                     |

## navigateToDefault

`router.navigateToDefault(options?)` navigates to the route configured as `defaultRoute` in router options.

| #   | Invariant                      | Description                                                                                                                                 |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolves to configured default | When `defaultRoute` is set, `navigateToDefault()` resolves to a state with `name === defaultRoute`.                                         |
| 2   | Rejects without default        | When no `defaultRoute` is configured, `navigateToDefault()` rejects with an error.                                                          |
| 3   | Equivalent to navigate         | `navigateToDefault()` produces the same resulting state as `navigate(defaultRoute)`. It is a convenience wrapper, not a separate code path. |
| 4   | Callback defaultRoute resolves | When `defaultRoute` is a function (`() => string`), `navigateToDefault()` calls it and navigates to the returned route name.                |

## forwardState / Route Forwarding

`pluginApi.forwardState(name, params)` resolves a route name through any `forwardTo` chain and returns the terminal destination. `navigate()` applies the same resolution automatically.

| #   | Invariant                | Description                                                                                                                                                                |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Terminality              | `forwardState(name, params).name` refers to a route with no `forwardTo`. The result is always the end of the forwarding chain.                                             |
| 2   | Idempotency              | `forwardState(forwardState(name, params).name, params).name === forwardState(name, params).name`. Applying `forwardState` twice gives the same result as applying it once. |
| 3   | navigate follows forward | `navigate("oldUsers")` resolves to the forwarded target (`"users"`), not the alias. Navigation always lands on the terminal route.                                         |
| 4   | Params preserved         | `forwardState(name, params).params` contains all params passed in. Forwarding does not discard parameters.                                                                 |

## Route Management (getRoutesApi)

`getRoutesApi(router)` provides CRUD operations on the route tree. These invariants verify that add, remove, update, replace, and clear operations behave atomically and consistently.

**Crash-preventing guards** (always enforced by core, regardless of plugins): `guardRouteStructure` rejects non-object routes, non-function `canActivate`/`canDeactivate`, and async `encodeParams`/`decodeParams`/`forwardTo`. `guardDependencies` rejects non-plain-object dependency maps. Circular `forwardTo` chains are detected by `resolveForwardChain` at registration time. These guards prevent silent state corruption and always throw, even without the validation-plugin.

**Invariants requiring `@real-router/validation-plugin`** are marked _(validation-plugin only)_.

| #   | Invariant                                        | Description                                                                                                                                                                   |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | add then has                                     | After `add(route)`, `has(route.name) === true`. A newly added route is immediately visible.                                                                                   |
| 2   | add then get                                     | After `add(route)`, `get(route.name).path === route.path`. The stored route config matches what was added.                                                                    |
| 3   | remove then has                                  | After `remove(name)`, `has(name) === false`. A removed route is no longer present.                                                                                            |
| 4   | Cyclic forwardTo throws                          | Adding routes with a circular `forwardTo` chain throws an error. Cycles in the forwarding graph are rejected at registration time (crash-preventing core guard).              |
| 5   | replace atomicity                                | After `replace(newRoutes)`, all old routes are absent and all new routes are present. Replacement is all-or-nothing.                                                          |
| 6   | Duplicate names throw _(validation-plugin only)_ | Adding two routes with the same name in a single `add()` call throws an error when the validation-plugin is registered. Without the plugin, no uniqueness check is performed. |
| 7   | update then get                                  | After `update(name, { forwardTo: "x" })`, `get(name).forwardTo === "x"`. Updates are reflected immediately in `get()`.                                                        |
| 8   | clear then has                                   | After `clear()`, `has(name) === false` for every previously registered route. `clear()` removes all routes.                                                                   |
| 9   | add with parent                                  | `add(child, { parent: "users" })` makes the child accessible as `"users.child"`. The dot-notation name is derived from the parent.                                            |
| 10  | getRouteConfig returns fields                    | After `add({ name, path, myField })`, `getPluginApi(router).getRouteConfig(name).myField` returns the custom field. Route config metadata is preserved.                       |
| 11  | getRouteConfig unknown                           | `getPluginApi(router).getRouteConfig("nonexistent")` returns `undefined` for routes not in the tree.                                                                          |
| 12  | update canActivate guard                         | After `update(name, { canActivate: () => () => false })`, `canNavigateTo(name) === false`. Definition guards block navigation.                                                |
| 13  | update canActivate null                          | After `update(name, { canActivate: null })`, any previously set definition guard is removed and navigation is allowed again.                                                  |
| 14  | replace during navigation                        | `replace()` called during an active navigation returns silently without modifying routes. It is a silent no-op.                                                               |
| 15  | replace preserves external                       | `replace()` clears definition guards (from route config) but preserves external guards (from `getLifecycleApi`).                                                              |

## Guards + navigate Interaction

Guards registered via `getLifecycleApi(router)` run during the transition pipeline and can block navigation. These invariants verify the interaction between guard results and navigation outcomes.

| #   | Invariant                     | Description                                                                                                                         |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Blocking activate guard       | An activate guard returning `false` causes `navigate()` to reject with `CANNOT_ACTIVATE`. Guards can block entry to a route.        |
| 2   | Passing activate guard        | An activate guard returning `true` allows navigation to proceed. Guards that pass do not interfere with navigation.                 |
| 3   | Deactivate before activate    | Deactivate guards run before activate guards. The order is: deactivate innermost-first, then activate outermost-first.              |
| 4   | Guard receives correct states | An activate guard receives `(toState, fromState)` with the correct route names. Guards can inspect both the origin and destination. |
| 5   | Async guard blocking          | An async activate guard returning `Promise.resolve(false)` blocks navigation with `CANNOT_ACTIVATE`. Async guards are awaited.      |
| 6   | Async guard allowing          | An async activate guard returning `Promise.resolve(true)` allows navigation to proceed. Async approval works the same as sync.      |
| 7   | Guard receives AbortSignal    | The guard function receives an `AbortSignal` instance as its third parameter for cooperative cancellation.                          |

## canNavigateTo

`router.canNavigateTo(name, params?)` is a synchronous predicate that checks whether navigation would be allowed by currently registered sync guards.

| #   | Invariant                         | Description                                                                                                               |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unknown route returns false       | `canNavigateTo(unknownRoute) === false` for any route name not in the route tree. Unregistered routes are always blocked. |
| 2   | No guards returns true            | Without any registered guards, `canNavigateTo(existingRoute) === true`. Routes are navigable by default.                  |
| 3   | Passing sync guard returns true   | When a sync activate guard returns `true`, `canNavigateTo === true`. Guard approval is reflected synchronously.           |
| 4   | Blocking sync guard returns false | When a sync activate guard returns `false`, `canNavigateTo === false`. Guard rejection is reflected synchronously.        |

## subscribe (event delivery)

`router.subscribe(listener)` registers a callback that fires after every successful navigation. These invariants verify that the delivered event data is consistent with the router's state.

| #   | Invariant                             | Description                                                                                                              |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | route equals getState                 | The `route` field in the subscriber callback is the same object as `getState()` at the time of delivery.                 |
| 2   | previousRoute equals getPreviousState | The `previousRoute` field in the subscriber callback is the same object as `getPreviousState()` at the time of delivery. |
| 3   | Called exactly once per navigation    | A subscriber is called exactly once per successful navigation, not zero times and not multiple times.                    |
| 4   | Unsubscribe stops delivery            | After calling the returned `unsubscribe()` function, the listener is not called on subsequent navigations.               |

## getDependenciesApi (CRUD)

`getDependenciesApi(router)` provides a key-value store for dependency injection. These invariants verify basic store semantics.

| #   | Invariant           | Description                                                                                                                         |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | set then has        | After `set(name, value)`, `has(name) === true`. A set dependency is immediately visible.                                            |
| 2   | set then get        | After `set(name, value)`, `get(name) === value`. The stored value is exactly what was set.                                          |
| 3   | remove then has     | After `set(name, value)` and `remove(name)`, `has(name) === false`. Removal is effective immediately.                               |
| 4   | setAll then getAll  | After `setAll(deps)`, `getAll()` contains all key-value pairs from `deps`. Bulk set is consistent with bulk get.                    |
| 5   | Idempotent set      | Calling `set(name, value)` twice with the same arguments does not change the stored value. Overwriting with the same value is safe. |
| 6   | reset clears all    | After `reset()`, `has(name) === false` for every previously set dependency. `reset()` removes all dependencies.                     |
| 7   | getAll returns copy | `getAll()` returns a new object on each call (not the internal store). Mutating the result does not affect the store.               |
| 8   | set undefined no-op | `set(name, undefined)` does not register the dependency. `has(name)` remains `false`.                                               |

## usePlugin

`router.usePlugin(...plugins)` registers one or more plugins and returns an unsubscribe function. Plugins are observer factories that receive lifecycle events during navigation.

| #   | Invariant                               | Description                                                                                                                                                             |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unsubscribe calls teardown              | Calling the returned `unsubscribe()` function invokes `teardown()` on each plugin. Plugin resources are cleaned up on unsubscription.                                   |
| 2   | Idempotent unsubscribe                  | Calling `unsubscribe()` twice does not throw. The second call is a no-op.                                                                                               |
| 3   | Same toState/fromState across plugins   | All plugins registered in the same `usePlugin()` call receive the same `toState` and `fromState` references in `onTransitionSuccess`. Event data is shared, not cloned. |
| 4   | onStart missed after start              | Plugins registered after `router.start()` do not receive `onStart`. Lifecycle events are not replayed retroactively.                                                    |
| 5   | Disposed router throws ROUTER_DISPOSED  | Calling `usePlugin()` on a disposed router throws `RouterError` with code `ROUTER_DISPOSED`.                                                                            |
| 6   | Registration order preserved            | Plugins receive `onTransitionSuccess` in the order they were registered. First-registered plugin fires first.                                                           |
| 7   | opts passed to onTransitionSuccess      | `onTransitionSuccess(toState, fromState, opts)` receives the navigation options (e.g., `{ replace: true }`) as the third argument.                                      |
| 8   | extendRouter adds accessible properties | `pluginApi.extendRouter({ customMethod })` makes `router.customMethod` callable. Extensions are removed when the cleanup function is called.                            |
| 9   | extendRouter conflict throws            | `pluginApi.extendRouter({ navigate: ... })` throws `RouterError` with code `PLUGIN_CONFLICT`. Existing router properties cannot be overwritten.                         |

## cloneRouter

`cloneRouter(router, deps?)` creates a new router instance with the same route definitions and options as the source, optionally merging new dependencies.

| #   | Invariant              | Description                                                                                                                       |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Route preservation     | The cloned router has the same routes as the source. `has(name)` returns the same result on both.                                 |
| 2   | State independence     | A freshly cloned router has no state (`getState() === undefined`). The clone does not inherit the source's navigation state.      |
| 3   | Dependency merge       | Dependencies passed as the second argument are available in the cloned router. Source deps and override deps are merged.          |
| 4   | Disposed source throws | Cloning a disposed router throws `RouterError` with code `ROUTER_DISPOSED`.                                                       |
| 5   | Independent navigation | The cloned router can `start()` and `navigate()` independently. Navigation on the clone does not affect the source's state.       |
| 6   | Guard preservation     | Guards registered on the source router are preserved in the clone. `canNavigateTo` reflects source guards on the cloned instance. |

## getNavigator

`getNavigator(router)` returns a frozen subset of router methods intended for view layers. The navigator is cached per router instance via `WeakMap`.

| #   | Invariant        | Description                                                                                                                               |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cached reference | `getNavigator(router)` returns the same object reference on repeated calls. One frozen navigator per router instance.                     |
| 2   | Frozen           | `Object.isFrozen(getNavigator(router)) === true`. The navigator cannot be modified after creation.                                        |
| 3   | Method identity  | Navigator methods (`navigate`, `getState`, `isActiveRoute`, `canNavigateTo`, `subscribe`) are the same bound references as on the router. |
| 4   | Expected keys    | The navigator contains exactly the keys: `canNavigateTo`, `getState`, `isActiveRoute`, `navigate`, `subscribe`. No extra properties.      |

## pluginApi — buildNavigationState

`pluginApi.buildNavigationState(name, params)` builds a navigation state for a route, resolving `forwardTo` chains and computing the path. Returns `undefined` if the route is not found.

| #   | Invariant              | Description                                                                                                                           |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Path matches buildPath | `buildNavigationState(name, params).path === buildPath(name, params)`. The path in the returned state matches the URL builder output. |
| 2   | Undefined for unknown  | `buildNavigationState("nonexistent", {})` returns `undefined`. Unknown routes are not built.                                          |
| 3   | Forward resolved       | `buildNavigationState("oldUsers", {}).name` equals the forwarded target (`"users"`), not the alias.                                   |

## pluginApi — addEventListener

`pluginApi.addEventListener(event, listener)` registers a low-level event listener on the router's event bus. Returns an unsubscribe function.

| #   | Invariant        | Description                                                                                                                         |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Event delivery   | After `addEventListener(TRANSITION_SUCCESS, fn)` and a successful `navigate()`, the listener is called.                             |
| 2   | Unsubscribe      | After calling the returned unsubscribe function, the listener is not called on subsequent navigations.                              |
| 3   | Event ordering   | `TRANSITION_START` fires before `TRANSITION_SUCCESS` for the same navigation. Event sequence matches the transition pipeline order. |
| 4   | Lifecycle events | `ROUTER_START` fires on `start()` and `ROUTER_STOP` fires on `stop()`. Each is called exactly once per lifecycle transition.        |

## pluginApi — addInterceptor

`pluginApi.addInterceptor(method, interceptor)` wraps an interceptable router method (`start`, `buildPath`, `forwardState`) with custom logic. Each interceptor receives `next` plus the method's arguments.

| #   | Invariant              | Description                                                                                                                             |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Wraps method           | An interceptor on `buildPath` can prepend a prefix to the result. The intercepted value is returned by `router.buildPath()`.            |
| 2   | LIFO execution order   | Multiple interceptors on the same method execute in LIFO (reverse registration) order. The last-registered interceptor wraps the first. |
| 3   | Unsubscribe removes    | After calling the returned unsubscribe function, the interceptor is no longer active. `buildPath` returns the original value.           |
| 4   | Disposed router throws | `addInterceptor()` on a disposed router throws `RouterError`. Interceptors cannot be added after disposal.                              |

## pluginApi — extendRouter

`pluginApi.extendRouter(extensions)` adds new properties to the router instance. Returns a cleanup function that removes them.

| #   | Invariant              | Description                                                                                                                           |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extension accessible   | After `extendRouter({ myCustom: fn })`, `router.myCustom()` is callable. Extensions are assigned directly to the router instance.     |
| 2   | Conflict throws        | `extendRouter({ buildPath: fn })` throws `RouterError` with code `PLUGIN_CONFLICT`. Existing router properties cannot be overwritten. |
| 3   | Cleanup removes        | After calling the cleanup function, the extension property is `undefined` on the router. Extensions are fully removed.                |
| 4   | Idempotent cleanup     | Calling the cleanup function twice does not throw. The second call is a no-op.                                                        |
| 5   | Disposed router throws | `extendRouter()` on a disposed router throws `RouterError`. Extensions cannot be added after disposal.                                |

## pluginApi — setRootPath / getRootPath

`pluginApi.setRootPath(path)` and `pluginApi.getRootPath()` manage the root path prefix used by browser/hash plugins.

| #   | Invariant         | Description                                                                              |
| --- | ----------------- | ---------------------------------------------------------------------------------------- |
| 1   | Set-get roundtrip | After `setRootPath("/app")`, `getRootPath() === "/app"`. The value survives a roundtrip. |
| 2   | Default is empty  | `getRootPath()` returns `""` on a fresh router. No root path is set by default.          |

## pluginApi — getOptions

`pluginApi.getOptions()` returns the frozen router options object.

| #   | Invariant        | Description                                                                                             |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Frozen           | `Object.isFrozen(getOptions()) === true`. Options are immutable after construction.                     |
| 2   | Cached reference | `getOptions()` returns the same object reference on repeated calls. One allocation per router instance. |

## pluginApi — matchPath

`pluginApi.matchPath(path)` attempts to match a URL path against the route tree and returns a state-like object, or `undefined` if no route matches.

| #   | Invariant                | Description                                                                                                               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Roundtrip with buildPath | `matchPath(buildPath(name, params)).name === name`. Building a URL and matching it back recovers the original route name. |
| 2   | Undefined for unknown    | `matchPath("/this/does/not/exist")` returns `undefined`. Non-matching paths are not forced into a route.                  |

## RouterError (constructor)

`RouterError` is the typed error class thrown by all router operations. These invariants verify that construction is deterministic and that the error object is well-formed.

| #   | Invariant                   | Description                                                                                                                                |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Constructor determinism     | Two `RouterError` instances created with the same arguments have identical `code`, `message`, `segment`, and `path`. Construction is pure. |
| 2   | Code is always accessible   | `err.code` is always a string equal to the value passed to the constructor. The code is never lost or transformed.                         |
| 3   | Message defaults to code    | When no `message` option is provided, `err.message === code`. The code serves as the default message.                                      |
| 4   | Instanceof checks           | Every `RouterError` is an instance of both `Error` and `RouterError`. The prototype chain is correct.                                      |
| 5   | Optional fields             | `segment`, `path`, and `redirect` are set exactly when provided and remain `undefined` otherwise.                                          |
| 6   | Method protection           | Passing reserved keys (`setCode`, `toJSON`, `hasField`, etc.) as constructor options does not overwrite the class methods.                 |
| 7   | Arbitrary fields accessible | Custom fields passed to the constructor are accessible via index access, `hasField()`, and `getField()`.                                   |
| 8   | redirect is frozen          | `err.redirect` is always deeply frozen. The original redirect object passed in is not mutated.                                             |

## RouterError (methods)

| #   | Invariant                                      | Description                                                                                                                        |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | setCode updates code                           | After `err.setCode(newCode)`, `err.code === newCode`. The code is updated in place.                                                |
| 2   | setCode preserves custom message               | If the message was set explicitly (not defaulted from code), `setCode()` does not change it. Custom messages survive code changes. |
| 3   | setCode idempotency                            | Calling `setCode(newCode)` twice produces the same `code` and `message` as calling it once.                                        |
| 4   | setErrorInstance copies properties             | After `err.setErrorInstance(nativeErr)`, `err.message`, `err.stack`, and `err.cause` match the native error.                       |
| 5   | setErrorInstance rejects null                  | Passing `null` or `undefined` to `setErrorInstance()` throws `TypeError`.                                                          |
| 6   | setAdditionalFields adds fields                | Fields passed to `setAdditionalFields()` are accessible via index access, `hasField()`, and `getField()`.                          |
| 7   | setAdditionalFields does not overwrite methods | Reserved method names in the fields object are silently ignored. Class methods remain intact.                                      |
| 8   | setAdditionalFields accumulates                | Multiple calls to `setAdditionalFields()` accumulate fields from all calls. Later calls do not erase earlier ones.                 |
| 9   | hasField / getField consistency                | `hasField(key) === true` if and only if `getField(key) !== undefined` for any key that was set.                                    |
| 10  | hasField returns false for absent keys         | `hasField(nonExistentKey) === false` and `getField(nonExistentKey) === undefined` for keys that were never set.                    |

## RouterError (serialization)

| #   | Invariant                                         | Description                                                                                                                          |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | toJSON always contains code and message           | `err.toJSON()` always has `code` and `message` properties matching the error's values.                                               |
| 2   | toJSON includes optional fields only when defined | `segment`, `path`, and `redirect` appear in `toJSON()` output only when they were set.                                               |
| 3   | toJSON never includes stack                       | `err.toJSON()` does not include the `stack` property, regardless of whether a stack trace is present.                                |
| 4   | toJSON includes arbitrary fields                  | Custom fields set via constructor or `setAdditionalFields()` appear in `toJSON()` output.                                            |
| 5   | toJSON is deterministic                           | Multiple calls to `err.toJSON()` return structurally equal objects. Each call returns a new object (not the same reference).         |
| 6   | Identical errors serialize identically            | Two `RouterError` instances created with the same arguments produce identical `toJSON()` output.                                     |
| 7   | JSON.stringify round-trip                         | `JSON.parse(JSON.stringify(err))` preserves `code`, `message`, `segment`, `path`, and serializable custom fields. Stack is excluded. |
| 8   | toJSON returns plain object                       | `toJSON()` returns a plain `Object` (not an `Error` or `RouterError` instance) with no methods in its values.                        |

## RouterError (message formatting)

| #   | Invariant                               | Description                                                                                                         |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Code present in default message         | `err.message` always contains the `code` string when no custom message is provided.                                 |
| 2   | Default message is non-empty            | For any non-empty code, the default message has length greater than zero.                                           |
| 3   | Default message is printable ASCII      | Default messages contain only printable ASCII characters, spaces, tabs, and newlines.                               |
| 4   | Identical codes give identical messages | Two errors with the same code and no custom message have the same `message`. Message generation is deterministic.   |
| 5   | Custom message replaces default         | When a `message` option is provided, `err.message === customMessage`. The custom message is used verbatim.          |
| 6   | Unicode preserved in custom messages    | Custom messages with Unicode characters are stored and retrieved without modification.                              |
| 7   | setCode preserves custom message        | After `setCode(newCode)`, a custom message remains unchanged. Only the code changes.                                |
| 8   | Default message length is bounded       | Default messages are fewer than 1000 characters. No error code produces an unreasonably long message.               |
| 9   | Long custom messages are not truncated  | Custom messages of any length are stored in full. There is no truncation.                                           |
| 10  | Special characters preserved            | Line breaks, tabs, null bytes, and arbitrary Unicode code points in custom messages are stored exactly as provided. |

## RouterError (circular references)

`RouterError` accepts a `redirect` field of type `State`. States can contain params with circular references. These invariants verify that the deep-freeze logic handles circular structures without throwing.

| #   | Invariant                             | Description                                                                                                                          |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Circular params in redirect           | A `State` with a circular reference in `params` can be passed as `redirect` without error. The resulting `err.redirect` is frozen.   |
| 2   | Nested circular reference             | Circular references nested inside `params` objects are handled correctly. The frozen state preserves accessible non-circular values. |
| 3   | Circular reference through array      | Arrays containing circular references (e.g., `arr.push(arr)`) are handled. The frozen state is accessible.                           |
| 4   | Circular reference in meta.params     | Circular references in `state.meta.params` are handled without error.                                                                |
| 5   | Multiple mutual references            | States where two objects reference each other are handled. Both objects are accessible in the frozen result.                         |
| 6   | Deep circular reference chain         | Multi-level circular chains (level3 references level1) are handled. All non-circular values remain accessible.                       |
| 7   | Frozen state is immutable             | After freezing, attempts to modify `err.redirect.params` are silently ignored (or throw in strict mode). The value does not change.  |
| 8   | Arbitrary State without circular refs | Any `State` object generated without circular references can be passed as `redirect` and will be frozen successfully.                |

## errorCodes (constants)

`errorCodes` is the frozen object containing all error code constants exported from `@real-router/core`.

| #   | Invariant                         | Description                                                                                                                                                                                                                                                                     |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All required codes present        | `errorCodes` contains all 11 required keys: `ROUTER_NOT_STARTED`, `NO_START_PATH_OR_STATE`, `ROUTER_ALREADY_STARTED`, `ROUTE_NOT_FOUND`, `SAME_STATES`, `CANNOT_DEACTIVATE`, `CANNOT_ACTIVATE`, `TRANSITION_ERR`, `TRANSITION_CANCELLED`, `ROUTER_DISPOSED`, `PLUGIN_CONFLICT`. |
| 2   | All values are unique             | No two keys share the same string value. Each error code is distinct.                                                                                                                                                                                                           |
| 3   | All keys are unique               | No duplicate keys exist in the object.                                                                                                                                                                                                                                          |
| 4   | Values are non-empty strings      | Every value is a non-empty, non-whitespace string.                                                                                                                                                                                                                              |
| 5   | Keys follow SCREAMING_SNAKE_CASE  | All keys match `/^[A-Z0-9_]+$/` with no double underscores and no leading or trailing underscores.                                                                                                                                                                              |
| 6   | Values follow SNAKE_CASE          | All values match `/^\w+$/` with no double underscores and no leading or trailing underscores.                                                                                                                                                                                   |
| 7   | errorCodes is frozen              | `Object.isFrozen(errorCodes) === true`. The constants object cannot be modified at runtime.                                                                                                                                                                                     |
| 8   | Cannot add new properties         | Attempting to add a new key to `errorCodes` has no effect. The object is sealed.                                                                                                                                                                                                |
| 9   | Cannot modify existing properties | Attempting to overwrite an existing value has no effect. Values are immutable.                                                                                                                                                                                                  |
| 10  | Cannot delete properties          | Attempting to delete a key has no effect. All codes remain present.                                                                                                                                                                                                             |
| 11  | Backward-compatible values        | The string values of all 11 codes match their documented values (e.g., `TRANSITION_CANCELLED === "CANCELLED"`). These values are part of the public API contract.                                                                                                               |

---

## Test Files

| File                                                    | Invariants | Category                                      |
| ------------------------------------------------------- | ---------- | --------------------------------------------- |
| `tests/property/createRouter.properties.ts`             | 3          | Factory function                              |
| `tests/property/nameToIDs.properties.ts`                | 7          | Pure function with 5 fast-path branches       |
| `tests/property/areStatesEqual.properties.ts`           | 7          | State equality predicate                      |
| `tests/property/pathRoundtrip.properties.ts`            | 6          | buildPath / matchPath inverse pair            |
| `tests/property/isActiveRoute.properties.ts`            | 7          | Active route predicate with 4 flags           |
| `tests/property/shouldUpdateNode.properties.ts`         | 4          | View-layer update predicate                   |
| `tests/property/stateFactory.properties.ts`             | 4          | State factory functions                       |
| `tests/property/lifecycle.properties.ts`                | 9          | Router FSM lifecycle (start / stop / dispose) |
| `tests/property/transitionSegments.properties.ts`       | 12         | navigate() and transition segment structure   |
| `tests/property/navigateToNotFound.properties.ts`       | 8          | Synchronous unknown-route setter              |
| `tests/property/navigateToDefault.properties.ts`        | 4          | Default route navigation                      |
| `tests/property/forwarding.properties.ts`               | 4          | forwardTo chain resolution                    |
| `tests/property/routeManagement.properties.ts`          | 14         | Route CRUD via getRoutesApi                   |
| `tests/property/guards.properties.ts`                   | 7          | Guard and navigate interaction                |
| `tests/property/canNavigateTo.properties.ts`            | 4          | Synchronous navigation predicate              |
| `tests/property/subscribe.properties.ts`                | 4          | Event delivery to subscribers                 |
| `tests/property/dependencies.properties.ts`             | 8          | Dependency injection CRUD                     |
| `tests/property/usePlugin.properties.ts`                | 9          | Plugin registration and lifecycle             |
| `tests/property/cloneRouter.properties.ts`              | 6          | SSR cloning via cloneRouter                   |
| `tests/property/getNavigator.properties.ts`             | 4          | Frozen navigator subset (WeakMap-cached)      |
| `tests/property/pluginApi.properties.ts`                | 22         | Plugin infrastructure (getPluginApi)          |
| `tests/property/error/constructor.properties.ts`        | 8          | RouterError construction invariants           |
| `tests/property/error/methods.properties.ts`            | 10         | RouterError method invariants                 |
| `tests/property/error/serialization.properties.ts`      | 8          | RouterError toJSON and JSON.stringify         |
| `tests/property/error/message-formatting.properties.ts` | 10         | RouterError message formatting                |
| `tests/property/error/circular-refs.properties.ts`      | 8          | Deep-freeze with circular references          |
| `tests/property/error/constants.properties.ts`          | 11         | errorCodes object invariants                  |
