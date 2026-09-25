# @real-router/validation-plugin

> Opt-in runtime validation layer for Real-Router

## Exports

| Export             | Kind     | Description                                                                                                                              |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `validationPlugin` | function | Plugin factory — pass to `router.usePlugin()`. No runtime arguments; generic over the router's dependency map, normally inferred (#1621) |
| `RouterValidator`  | type     | Full validator interface that core calls into via `ctx.validator?.ns.fn()`.                                                              |

## Validator Namespaces

The `RouterValidator` interface is organized into 8 namespaces, matching core's namespace structure:

| Namespace      | Key methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routes`       | `validateBuildPathArgs`, `validateMatchPathArgs`, `validateIsActiveRouteArgs`, `validateAddRouteArgs`, `validateRemoveRouteArgs`, `validateUpdateRouteBasicArgs`, `validateUpdateRoute`, `validateRouteName`, `guardRouteCallbacks`, `guardNoAsyncCallbacks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `options`      | `validateOptions`, `validateResolvedDefaultRoute`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `dependencies` | `validateDependencyName`, `validateSetDependencyArgs`, `validateDependenciesObject`, `validateDependencyExists`, `validateDependencyCount`, `validateCloneArgs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `plugins`      | `validatePluginLimit`, `validateNoDuplicatePlugins`, `validatePluginKeys` (validates hook names: `onStart`, `onStop`, `onTransitionStart`, `onTransitionLeaveApprove`, `onTransitionSuccess`, `onTransitionError`, `onTransitionCancel`, `teardown`), `validateCountThresholds`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `lifecycle`    | `validateHandler`, `validateHandlerLimit`, `validateCountThresholds`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `navigation`   | `validateNavigateToDefaultArgs`, `validateNavigateToStateArgs`, `validateNavigationOptions`, `validateParamsShape`, `validateSearch` — the query twin (#1972); shape only, because a query value round-trips through the URL and the path channel's Symbol / BigInt / control-char rules do not transfer, `validateStartArgs`. ⚠ `validateParams` and `validateNavigateArgs` are NOT here: they left the interface with #2388, and the plugin registers those walks as checks instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `state`        | `validateMakeStateArgs`, `validateAreStatesEqualArgs`, `reportDroppedQueryKey` — the mode gate's opt-in diagnostic (#1575): core silently DROPS a query key the active `queryParamsMode` will not print, and this warns once per route+key so the drop (and a `defaultSearch` that is dead config because of it) is visible in development — raised by EVERY producer, the render-path predicates included (#1581), which is the OPPOSITE of the neighbouring `reportUndeclaredParamKey` and deliberate: see the gotcha below; `reportUndeclaredParamKey` — the undeclared-params-bag diagnostic (#1579, the params half of #1553): a key the route declares NOWHERE stays in `state.params` as app-level data but never reaches the URL, so the state does not round-trip through its own `state.path`. Core's behaviour is UNCHANGED — dropping the key was measured and rejected (it retires a documented capability, and the predicate cannot tell a typo from `navigate("users", { id })` on a parent whose child declares `:id`). Opted into by the COMMITTING producers only, so every predicate — including `canNavigateTo`, which shares the resolving form with `navigate` — stays silent on the render path. ⚠ **Neither diagnostic says anything about a route that does not exist (#1584)** — core gates both on the route being real, because the declaration registries answer `[]` for a missing route exactly as they do for a route with no declarations, and reporting that blamed the caller's bag for a typo in the ROUTE name. ⚠ **Both de-dup caches are per ROUTER, not per module (#1583)** — `buildValidatorObject` closes over a fresh `Set` per registration, so a second router (or an SSR per-request clone) warns again, `teardown()` drops the cache with the validator, and nothing accumulates for the life of the process |
| `eventBus`     | `validateListenerArgs` — validates event names: `$start`, `$stop`, `$$start`, `$$leaveApprove`, `$$cancel`, `$$success`, `$$error`; `validateCountThresholds` — proactive `warn@20% / error@50%` on the per-event listener count for `subscribe` / `addEventListener` (#1188), mirroring the plugins / lifecycle / dependencies counters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Gotchas

### The factory is generic over the dependency map (#1621)

`validationPlugin<D>()` carries the CALLER's dependency map instead of the
`DefaultDependencies` (= `object`) default. `keyof object` is `never`, so a bare
`PluginFactory` types `getDependency` as `(key: never) => never`, and TypeScript
7 — which runs a variance check TS 6 skipped — refuses to assign that where
`PluginFactory<D>` is expected for any `D` with an **index signature**. In
practice `usePlugin(validationPlugin())` stopped compiling for a consumer typing
dependencies as `Record<string, T>`; a map with concrete keys was always fine.

`PluginFactory<never>` is NOT the shorthand here, even though core uses exactly
that for `AnyOptions = Options<never>`: measured, it fails on BOTH compilers,
because this plugin actually reads dependencies. `readRoutes` is generic for
the same reason — otherwise `RoutesApi<D>` does not fit its `RoutesApi<object>`
parameter.

⚠ The same `(): PluginFactory` default is still on the other nine plugin
factories — see #1621 for the list. Anything added here should take the type
parameter from the start.

### Register before start()

`validationPlugin()` must be registered before `router.start()`. Registering after start throws `RouterError("VALIDATION_PLUGIN_AFTER_START")`. That error is **frozen** (#1964), like every `RouterError` core throws — annotate a copy, not the instance you caught. This is enforced because the retrospective pass needs to run before the router begins navigating.

### One router, one validator (#2349)

A registration that finds `ctx.validator` already occupied throws
`RouterError("VALIDATION_PLUGIN_ALREADY_INSTALLED")`. The slot holds one
validator and `teardown` clears it, so two installations give the router a
teardown that switches validation off while a plugin is still registered —
whichever of the two runs first, and regardless of which installation it
belongs to.

⚠ **A clone needs no installation of its own.** `cloneRouter` re-runs the base's
plugin factories, so a clone arrives validated; calling `usePlugin` on it is the
shape this refuses, and the message says so. The SSR per-request clone is the
common case.

⚠ **The refusal reads the SLOT, not a tally of installations.** A counter would
model an ownership the slot does not grant — `validator` is one of two writable
members on an otherwise `readonly` `RouterInternals`, open to anything importing
`@real-router/core/validation`. Reading the slot also keeps re-registration after
`teardown()` working, which the two diagnostic de-dup tests depend on.

### `undefined` path is allowed in `validateStartArgs`

`validateStartArgs(undefined)` does not throw. This is intentional: the facade calls `validateStartArgs(startPath)` **before** the interceptor pipeline runs. `browser-plugin` injects `window.location` via `addInterceptor("start", ...)`, which wraps the internal `start()` call — **after** facade validation. If `undefined` were rejected, `router.start()` without an argument would fail when `browser-plugin` is installed.

### Unsafe path-param value rejection (#934 / #942)

The path-bag value walk (registered as a check at each door since #2388) and `validateStartArgs` reject param **values** and start paths that cannot safely round-trip through a URL path — these are silently accepted by bare core (validator-opt-in):

| Input                                                        | Bare core (no plugin)                                                                                                                     | With plugin                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Symbol / BigInt param value (`{ id: Symbol() }`)             | path-param: silent corruption (raw Symbol in `state.params`, non-round-tripping path); query-param: raw `TypeError` from `String(symbol)` | actionable `TypeError` naming the key: `param "id" cannot be a symbol …` |
| Control char in a param value or start path (NUL / C0 / DEL) | percent-encoded into `state.path` (`%00`, `%01`) — a valid-but-unreadable URL                                                             | `TypeError("… must not contain control characters …")`                   |

Value inspection is **own-property only** (mirrors `isParams`) and runs before the generic shape check so the message pinpoints the offending value rather than reporting the generic "params must be a plain object".

### Retrospective rollback on failure

If the retrospective pass throws (e.g., duplicate route name, or a dangling `forwardTo` target — a route forwarding to a name the tree does not hold), `ctx.validator` is set back to `null` before the error propagates. ⚠ A **dotted route name** is not among the throws this pass can produce (#1763). `createRouter`, `add` and `replace` each refuse a definition whose own `name` carries a dot — with this package's message, since the rule lives in `engine/validation/route-batch.ts` — so the failure lands before any plugin exists and a second check here would be unreachable. The router is left in a clean state — no partial validation active. The error surfaces at the `usePlugin()` call site.

### The two diagnostics answer the predicates differently — on purpose (#1581)

`reportDroppedQueryKey` fires from every producer that REACHES the mode gate —
`buildPath` and `canNavigateTo` always do. ⚠ `isActiveRoute` is the exception and
it matters, because it is the predicate a `<Link>` runs on every render: the sink
is read inside `canonicalize`'s slow path, and the arm for a route unrelated to
the active one answers above it. So the nav item you are NOT on raises nothing,
which is most of them. `dropped-query-key.test.ts` owns both arms.

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

### The retired single-bag spelling is reported at two doors, not four (#2238)

A declared QUERY name carrying a value in the `params` bag is reported at
`buildPath` and `isActiveRoute`. The other two doors already answer on their own:
`navigate` throws `WRONG_CHANNEL` and `canNavigateTo` returns `false`.

⚠ **The silence it closes reaches only the paths that never click.** A plain
left-click throws — `<Link>` hands the same bag to `router.navigate`, and P1's
throw is synchronous, so the component's own `.catch(() => {})` does not see it.
What follows the wrong href instead is ⌘/ctrl/shift/middle-click, `target="_blank"`,
a copied link, and server-rendered markup.

⚠ **A warning, not a throw**, because neither door has an error channel — one
returns a string, the other a boolean — and #2124 measured that wiring core's
guard here changes an ANSWER rather than revealing a silence.

⚠ **The predicate is core's `findMisChanneledKey`, re-exported on
`@real-router/core/validation`, never a copy.** Its carve-outs are the drift
surface: `undefined` is the removal marker, and a name owning a path slot
(`/items/:id?id`) is absent from `queryNames` by construction.

### Diagnostic de-dup is per router, not per process (#1583)

Both diagnostics warn once per `route + key` — the gate runs on every navigation
and every `matchPath`, so an un-deduped warning would flood a dev console the
moment a route is revisited.

That cache lives on the **validator object**, which `buildValidatorObject` builds
once per registration, i.e. once per router. A module-level `Set` — one per
PROCESS — points every consequence the wrong way for a dev-time signal:

- a second router, including a `cloneRouter` per-request clone under SSR/SSG,
  never warns for a pair the first one already reported, so the diagnostic fires
  for request #1 and stays silent for the life of the process;
- `teardown()` does not clear it, so re-registering the plugin buys silence;
- nothing evicts, so it grows without bound.

It is also why this package exports no `reset*` seam: a test seam compensating
for the design is the design's own bug report.

`tests/functional/no-module-level-cache.test.ts` scans `src/` and fails on a
regression — the shape recurred once already (#1579 copied #1575's module-level
`Set` a release later), which is why the guard is a scan rather than two fixed
call sites. It flags only ACCUMULATING state: a frozen lookup table is fine, and
so is a `WeakMap` keyed by an object, which evicts with its key.

### The `navigate` family consults the validator for nothing (#2388)

`navigate` and `canNavigateTo` register all nine of their refusals as checks at
four positions — `navigate:entry` / `navigate:params` and the two
`canNavigateTo` twins. Messages, order and failure SHAPE are unchanged, and the
existing authorities are what prove it: deleting one call from an entry check
reddens `navigation.validation.test.ts`, and deleting a core `runChecks` reddens
`predicate-totality-2245.test.ts`.

⚑ **Two members left `RouterValidator` entirely**, because these were their last
consultations: `navigation.validateParams` and `navigation.validateNavigateArgs`.
The functions behind them are unchanged — only the tier they are reached through.

⚠ **`navigate`'s ENTRY still refuses SYNCHRONOUSLY**, from a method whose
declared return is a promise. That is the facade's own shape for programmer
error (#1572), not something the channel introduced.

⚠ **The pipeline below `navigate` is a separate layer and still consults.**
`routes.validateStateBuilderArgs` runs under `buildNavigateState`; a door is
converted at its own layer, and `validatorContractNamespaces` pins that
remainder rather than describing it.

### The printers' value walks have left `RouterValidator` for the check channel (#2388)

`buildPath` and `buildPathResolved` have their path-bag VALUE walk registered
with `PluginApi.addCheck(…)` instead of consulted through `ctx.validator`.
Behaviour is unchanged — same function, same messages — and
`check-channel-consumer-2388.test.ts` owns every arm plus the bare-core controls.

⚑ **The position is what core BUILT, which is why these refusals went first.** A
check there receives `ownParams`, the copy that printer prints the path from
(#2134); no interceptor can reach it, because at the call boundary that object
does not exist yet.

⚠ **Two positions, not one shared by both printers.** They are reached
independently — the href door runs the forward chain itself and lands on the
resolved one — so a shared position would make a refusal name a call that did not
happen.

⚠ **The SHAPE half stays on the validator, and that asymmetry is load-bearing.**
`validateNavigateParamsShape` must judge the caller's bag BEFORE core copies —
a copy launders every shape it exists to refuse — so only the value half has an
object worth moving.

⚠ **`teardown` must remove the registration.** Nulling `ctx.validator` silences
every other door and does nothing to a channel registration, so a leak here
leaves a torn-down plugin still refusing.

### Teardown disables validation — but only the validator it still holds

Calling the unsubscribe function returned by `router.usePlugin(validationPlugin())` clears `ctx.validator`. All subsequent router calls skip validation silently. This is by design — plugins are removable.

⚠ **The release is owner-checked (#2339 §4 1b).** The plugin holds the object it wrote and nulls the slot only while that object is still there. `RouterInternals.validator` has no owner — it is plain data on a surface pinned `accessorNames === []`, so a second writer cannot be REFUSED at the slot — and an unconditional `= null` therefore destroyed whoever held the slot at teardown time. Measured with a control: with a second writer in place the foreign validator was nulled; with none, the plugin correctly nulled its own. Same shape as `claimContextNamespace`, which checks the holder on write and on release (#2059 / #1929); here only the release half is reachable.

⚠ **The WRITE half stays open, deliberately.** Refusing a second write needs an accessor on `RouterInternals`, and `accessorNames === []` is pinned on all six handed-out surfaces (`door-census/surface.test.ts`). It is answered where the slot goes away, not here — #2373.

### Cross-field `Options` validation

`validateOptions` + the retrospective pass diagnose combinations that individual field checks cannot catch:

| Combination                                                                   | Behavior                                                                                                                       | Location                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `limits.warnListeners > limits.maxListeners` (and `maxListeners > 0`)         | `throw RangeError`                                                                                                             | `validators/options.ts::validateLimits`                                                                                     |
| Static `defaultRoute: "<name>"` that does not exist in the route tree         | `throw Error` with `[validation-plugin]` prefix                                                                                | Retrospective pass (`validationPlugin.ts`)                                                                                  |
| `DefaultRouteCallback` returning a name that does not exist in the route tree | `throw Error` with `[validation-plugin]` prefix; propagates as `Promise.reject` via `navigateToDefault()` / `start()` fallback | Runtime hook `options.validateResolvedDefaultRoute` called from core's `resolveDefault()` when `defaultRoute` is a callback |

Callbacks are intentionally **not** probed at registration time — their return value depends on dependencies that may not be set yet. The hook on `resolveDefault()` catches bad return values on the first actual use.

**Logger config is not validated by this plugin.** The Router constructor consumes `options.logger` (it builds the router's own `RouterLogger` from it) and strips the key before options are stored (#724), so the retrospective pass — which reads the stored, logger-stripped options — never sees it. Logger config (`level` incl. `"none"`, `callback`, `callbackIgnoresLevel`) is therefore validated solely by core's `isLoggerConfig` guard at construction, the only place the input exists (#789). A prior `validateLoggerOption` here was dead on the live path and was removed.

### `navigateToDefault()` Promise contract

`navigateToDefault()` is declared `Promise<State>` but is not `async`. Synchronous exceptions from `deps.resolveDefault()` — a callback that throws, or a validator that rejects a callback's return — are caught and converted to `Promise.reject` so callers can uniformly handle errors via `.catch()` / `await`.

### Reaches the engine only through `@real-router/core` (#1301)

The plugin does **not** import the foundation `route-tree` package. `validateRoute` (the batch route/path validator — no matcher equivalent) comes from the `@real-router/core/validation` subpath; the route validators ask existence by walking `PluginApi.getTree()` and read path slots from `PluginApi.getUrlParams` (a `RouteLookup`, threaded into `validateRoutes` → `validateForwardToTargets`), and the retrospective pass reads the same two answers from that lookup. A batch route is not in the table yet, so its slots are read from its path with `buildParamMeta`, from the same subpath: both ends of a forward are read by core's grammar (#2569). The `RouteTree` type comes from core. This keeps core the sole consumer of the routing engine. `tests/functional/no-route-tree.test.ts` scans `src/` for any `route-tree` import and fails on a regression — keep it green (and `route-tree` out of `devDependencies`).

⚠ Those answers describe the registered table, which is what an `add` batch joins. A `replace` batch discards it, so `emptyTableUnder` hands the same route validators the root with no route and no forward under it (#2562) — judged against the registered table, a batch that keeps a route is refused as a duplicate.

### A message names a door that can reach it, and a walk says so (#2457)

Every `[router.<door>]` head in `src/` is checked against the doors that can
actually reach it, by `tests/functional/prefix-reachability-authority-2457.test.ts`.
The door comes from three places, none of them a list: an `addCheck("<door>:<slot>")`
position, the implementation in core that consults a `RouterValidator` member, or
a `methodName` the caller hands down for a helper serving several doors.

⚠ **The resolution of an implementation name STOPS at a published door.** It exists
only to translate `#runStart` into `start` and `#startPlugin` → `use` into
`usePlugin`. Left to run past a published name it becomes an unbounded closure —
measured, that gave one validator eleven doors, because `navigate`, `start` and
`matchPath` all reach a path build eventually, and a wrong door then passed.

⚑ The register holds the two published names (`[cloneRouter]`, `[validation-plugin]`) and nothing else. `[internal]` left it with #2487: a refusal no caller input can reach now takes O-1's `Internal error (please report): ` marker rather than a bracketed head, so there is no entry to justify. "Both batch doors report `addRoute`" needs none either — the shared helper is reached from both batch positions, so the rule admits it unaided.

⚑ **A function is keyed by its declaration, and the TypeScript checker resolves
each call (#2545).** A name — even qualified by its file — merges two declarations
that share it: two object-literal methods, a function and a method, two nested
helpers, each reached from a different door. Through the checker a call follows
lexical scope, an import through the `type-guards` barrel, and a method to the
object or class that declares it, so no form of the collision is left for a key to
separate. The member a wiring entry implements is keyed `namespace.member` for the
same reason: `validateCountThresholds` belongs to three namespaces, each consulted
from its own doors. The real tree's collisions are inert today, so synthetic cells
hold both keys.

⚠ **Core's call graph stays keyed by name.** Core reaches some doors through a
dependency-injection interface the checker cannot follow, and linking those calls
by name is what finds the door behind them. `doorsForMember` in the authority
records the measurement.

`route-door-prefix-2399.test.ts` stays beside it and answers a different question —
what a caller SEES, driven end to end. Its reach is the sixteen refusals it drives:
measured, flipping the door on a route-CRUD message it does not drive left the
whole suite green.

### Core's limit defaults live in ONE place here (#1879)

`helpers.ts` exports `CORE_LIMIT_DEFAULTS`, and every reader takes its fallback from it, in one of two shapes: a `?? …` (four in `validationPlugin.ts`) or a defaulted parameter (`eventBus.ts`, `lifecycle.ts`, `plugins.ts`). Core keeps `DEFAULT_LIMITS` internal, so this is a copy by decision, not by accident.

Two things keep it honest, and they answer different questions. `Readonly<LimitsConfig>` — core's own interface — is what a **key** added in core hits, as a TS2741 here and in `LIMIT_BOUNDS`. `tests/functional/limit-defaults-authority-1879.test.ts` is what a **value** hits: it reads the resolved bag off a router built with no `limits`, so it compares against what core enforces rather than what any file says. The same file scans `src/` for a re-inlined literal, which is what stops the eight-copies shape coming back.

### Every declared limit is OPT-IN — bare core enforces none of them

`LimitsConfig` declares five: `maxDependencies`, `maxPlugins`, `maxListeners`,
`warnListeners`, `maxLifecycleHandlers`. Core declares all five, resolves them in
`createLimits`, and enforces **none** without this plugin. That is a decision, not a gap:
a limit is not critical validation, and its absence breaks nothing — it is a diagnostic for
an application that has grown a shape worth hearing about.

⚠ **Two sites read as core enforcement and are not, which is the trap.**
`RouteLifecycleNamespace.preflightHandlerLimit` lives in core and is called from core's
route-CRUD prepare phase — and returns on its first line without a validator, which its own
docblock states ("Plugin-gated: a no-op without the validator"). `EventEmitter` carries a
`maxListeners` / `warnListeners` check in `#add`, and core constructs it **without**
limits, so it runs at the `0` that means "no limit"; `setLimits` has no caller outside
tests. With the plugin installed the threshold is judged by `eventBus.validateCountThresholds`
instead.

So the shape to copy when a limit needs a better position — pre-flight instead of mid-loop,
say — is `preflightHandlerLimit`: core may own the PROJECTION and the call site while the
plugin owns the VERDICT. Moving a limit's enforcement into bare core would be a different
product, not a bug fix.

⚑ **`setDependencies` is the worked example (#2253).** Its limit is asked by
`validateDependencyBatchLimit`, from inside this plugin's `validateDependenciesObject`
wrapper — core's only pre-flight call on the whole bag, and therefore the one position from
which a refusal can precede every write. The position already existed in core, and
`PluginApi.getDependencyKeys()` plus `getResolvedLimits()` give the wrapper what it needs to
project (#2382). The per-key `validateDependencyCount` stays where it is, because the advisory `warn` / `error`
thresholds fire as the store grows and a projection cannot say which of them a batch would
cross without replaying it.

⚠ A limit core owns and `LIMIT_BOUNDS` does not is not a missing check — `validateLimits` rejects it as `unknown limit`, the `plugin ⊇ core` false-reject of #1224 / #1225. That is why the bounds table is keyed by core's type and not by its own literals.

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Source structure, data flow, design decisions
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — How core calls `ctx.validator?.ns.fn()`
- [packages/core/src/types/RouterValidator.ts](../core/src/types/RouterValidator.ts) — Full interface definition
