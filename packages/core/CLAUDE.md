# @real-router/core

## Architecture

### Namespace-Based Design

The router uses a **facade + namespaces** architecture:

```
Router.ts (facade)
    │
    ├── RoutesNamespace        — route tree, path operations, forwarding
    ├── StateNamespace         — state storage (current, previous)
    ├── NavigationNamespace    — navigate(), transition pipeline
    ├── OptionsNamespace       — router options
    ├── DependenciesNamespace  — dependency injection (plain store, not a class)
    ├── EventBusNamespace      — FSM + EventEmitter encapsulation, events, subscribe
    │       └── routerFSM      — FSM instance (lifecycle + navigation state)
    ├── PluginsNamespace       — plugin lifecycle
    ├── RouteLifecycleNamespace — canActivate/canDeactivate guards
    └── RouterLifecycleNamespace — start/stop

src/pipeline/ (navigation delivery — three primitives over one opaque type)
    ├── canonicalize(port, name, params, search?, opts?) → Canonical  — ① forwardTo + ③ route defaults, one pass
    │        opts.resolveForward: false → the LITERAL form (the route NAMED, no chain, no seam)
    ├── buildURL(canonical, port)                → string     — ⑤a
    ├── materialize(canonical, opts)             → State      — ⑤b
    └── RouteResolver                                          — the port the router implements at wiring time

src/channels/ (channel correctness — one rule, three mechanisms; only `guard` is core's fifth always-on invariant guard, `modeGate` is deliberately NOT a guard)
    ├── guard      — findMisChanneledKey · assertChannelCorrect · misChanneledKeyMessage
    ├── defaults   — assertRouteDefaultChannels (config-time half) · withholdFilledSlots
    └── modeGate   — admittedSearch

    A subsystem and not a namespace method because the rule has no owning module:
    twelve call sites in seven modules — P1 (`internals`), the `forwardState`
    seam and `canNavigateTo` (`Router.ts`), P3 `navigateToState` (twice), the
    `decodeParams` boundary, `updateRoute`, and four registration entry points
    through the adapter in `RoutesNamespace/helpers.ts`. It lived in two files
    both named `helpers.ts` until then, one edit away from becoming two rules
    that disagree — the same shape one layer up (two stage-③ TERMINALS) is what
    let #1584 land on one and not the other, and what Phase 4 closed.
    Imports nothing from the namespaces, the engine or the pipeline:
    declared query names arrive as DATA, never as a matcher, so a second
    derivation of the one registry (#1556) cannot grow here. Enforced by a
    `no-restricted-imports` boundary in `packages/core/eslint.config.mjs`.

api/ (standalone functions — tree-shakeable)
    ├── getRoutesApi(router)      — route CRUD
    ├── getDependenciesApi(router) — dependency CRUD
    ├── getLifecycleApi(router)   — guard management
    ├── getPluginApi(router)      — plugin management
    └── cloneRouter(router, deps) — SSR cloning
```

**SSR/SSG/hydration helpers live outside core, in `@real-router/ssr-utils`** (`serializeState`, `serializeRouterState`, `hydrateRouter`, `getStaticPaths`, `createRequestScope` — #1543). They are router-level (not plugin-level like `shared/ssr`), consume core exclusively through its public subpaths (`@real-router/core/api`, `@real-router/core/validation`, `@real-router/core/types`), and were extracted from the former `@real-router/core/utils` subpath to keep core a pure router with zero SSR-specific surface.

**Hydration scratchpad (#596)**: `RouterInternals.hydrationState` is `null` outside `hydrateRouter` (`@real-router/ssr-utils`). Inside, the parsed `SerializedRouterState` is briefly assigned, then cleared in `finally`. SSR loader plugins (`ssr-data-plugin`, `rsc-server-plugin`) read `getInternals(router).hydrationState` from inside their `start` interceptor — when the namespace value is already present in the parsed context for the same route name, they reuse it instead of invoking the loader. Single-shot semantics: only the first `start()` consumes the scratchpad. The `SerializedRouterState` type itself is defined in `src/types/base.ts` (core owns the shape of its own hydration scratchpad) and re-exported by `@real-router/ssr-utils`.

**RouterFSM states**: `IDLE → STARTING → READY ⇄ TRANSITION_STARTED → LEAVE_APPROVED → READY | DISPOSED`

`DISPOSE` is wired from every non-DISPOSED state so the FSM always settles at `DISPOSED` when `router.dispose()` runs. For healthy flows the facade routes through `IDLE` first (`STOP → IDLE → DISPOSE`); the direct transitions are a safety net for cases where the FSM cannot be returned to `IDLE` (e.g. `dispose()` mid-`STARTING` when the start pipeline threw before `STARTED`/`FAIL`). `STARTING` also accepts `STOP → IDLE` (#1185): a `stop()` while `start()` is parked in an async start-interceptor cancels the start (facade `stop()` sends `STOP`; `RouterLifecycleNamespace.start` re-checks `isIdle()` after the interceptor chain and rejects `TRANSITION_CANCELLED`), so the "`stop()` cancels the transition" contract holds in the interceptor window as it already did in the guard phase. See `routerFSM.ts` transition table.

All router events are consequences of FSM transitions (via `fsm.on(from, event, action)`), not manual calls.
No boolean flags (`#started`, `#active`, `#navigating` removed).

### Navigation pipeline (`src/pipeline/`, RFC nav-pipeline — all four phases closed)

Every entry point builds its target state through the pipeline: `canonicalize` is the **sole producer** of `Canonical`, and `buildURL` / `materialize` physically accept nothing else (the brand is a `unique symbol` that is never exported, so `materialize({name, path, query})` does not compile). Phase 2 (#1548) migrated the remaining seven, one per commit, in TWO compositional forms:

- **class ①** (`canonicalize(...)`) — `navigate`, `matchPath`, `canNavigateTo`, `buildNavigationState`: resolve `forwardTo` through the seam.
- **class LITERAL** (`canonicalize(..., { resolveForward: false })`) — `buildPath`, `isActiveRoute`'s first arm, `makeState`: answer about the route they were NAMED. `buildPath` keeps its own interceptor zone and prints stage ⑤a locally (going through `buildURL` would recurse into the interceptable `ctx.buildPath` that wraps it); so does the `matchPath` rebuild, which carries options `buildURL` does not (`rewritePathOnMatch`, `trailingSlash`, the #1157 try/catch).

`navigateToNotFound` is the one deliberate exception — it wraps a URL string, it does not build a state from an intent, so it has no channels to canonicalise (INVARIANTS navigateToNotFound #2).

**Stage ② (channel separation) is GONE.** The `forwardState` seam used to run `separateChannels` over whatever left the interceptor chain, moving a declared `?key` out of the params bag behind the producer's back. It now applies the same centralized assertion the facade uses (`assertChannelCorrect`) and THROWS. Measured cost of the removal across 13 packages: 7 tests, all in core + `search-schema-plugin`; every other package was already channel-correct.

Why refusing beats repairing, in the three shapes the repair actually hit:

- **The producer kept believing its own bag shipped.** A `decodeParams` returning `{ params: { ...params, tag } }` published a state it never wrote.
- **It laundered values past validation.** `search-schema-plugin` documented the hole with a test named `LEAKS`: an interceptor registered AFTER the schema injected into `params`, the seam moved it into `search`, and an unvalidated value landed in the channel the schema owns. Refusing closes it structurally — an interceptor that wants the query channel must write `search`, where the schema sees it.
- **It inverted caller precedence.** A caller's mis-channelled key and a chain default's query half sat in different bags, where no merge ranks them, and the repair (spreading `search` last) handed the win to the DEFAULT — the #1570 defect.

✅ **`separateChannels` is deleted.** The three remaining call sites — `pipeline/canonicalize`, `StateNamespace.makeState`, the chain fold in `RoutesNamespace` — split a route's OWN defaults by the declaring route, and they went too. **The slot IS the channel**: `defaultParams` is the path channel, `defaultSearch` the query channel, in every position, and the router moves nothing between them. `params` and `search` meet in exactly one place — the printed URL.

The argument that kept the defaults split ("a hop can only spell a default in `defaultParams`") was false: the fold reads `defaultSearch` two lines above. And the routing actively hurt the author it was supposed to help — a hop could not tell which channel its own config would land in without reading a target that a `forwardTo` CALLBACK may not determine until navigation time.

Two checks replace it, split by what is knowable when:

- **Registration** (`assertRouteDefaultChannels`, always-on core guard) — a route's own `defaultParams` naming a key the route declares with `?`. Both sides are known at `createRouter` / `add` / `replace` / `update` / `setRootPath`, so it fails at config time with the slot to move to. Without it the router would build a state out of config it had accepted and its OWN always-on channel guard would reject it — `start()` throwing `WRONG_CHANNEL` about a bag the user never passed, the textbook deferred-crash shape core's invariant guards exist to prevent. Every one of those entry points runs it **prepare-then-commit**: a rejected batch leaves the store untouched (the first placement checked after the swap and left bad config installed — caught by the entry-point test).
- **Resolution** (the `forwardState` seam) — a hop's `defaultParams` naming a key the TARGET declares. Registration cannot see it through a dynamic `forwardTo`, so it is checked where the target is finally known, and the message names both routes.

Two things fell out as dead once nothing was split: the **cross-channel withholding loop** in the chain fold (#1570 needed it only because the split put a caller's params-twin and the query half of one default in different bags, where no merge ranks them) and `search-schema-plugin`'s own copy of the split (`omitKeys(defaultParams, pathParams)`, justified in its comment by "core separates afterwards").

The seam's error names the key, the route, and — when a chain resolved elsewhere — the route the caller actually named, because `navigate("src", { lang })` was written against `src`'s config, where `lang` is undeclared and legitimate.

Two wiring facts are load-bearing and were measured, not assumed — changing either is a behaviour change, not a refactor:

- **`port.resolveForward` is the `forwardState` SEAM** (`Router.ts:259-324`) — the interceptable chain _plus_ the centralized channel ASSERTION. It was a channel-SEPARATION wrapper until `ba0f6b18b` deleted stage ②; the check, not a repair, therefore lives in the port implementation and never inside the pipeline module.
- **`port.buildPath` is the interceptable `ctx.buildPath`** — one `navigate()` runs BOTH the `forwardState` and the `buildPath` interceptor today (`persistent-params` registers both). Reaching for the engine's `matcher.buildPath` would silently stop running the latter on the navigate path.

Stage ③ (route default UNDER the caller's value) has exactly ONE implementation — `canonicalize` — since nav-pipeline Phase 4 folded `StateNamespace.makeState` onto its LITERAL form. `makeState` used to carry a parallel copy of ③ and of the mode gate, which is how #1584's existence precondition came to land on one terminal and not the other; the fold was verified byte-identical across a 71-cell snapshot, because the only door to `makeState` is `PluginApi.makeState` and its P1 guard refuses exactly the bag the literal form's `withholdFilledSlots` would act on. Channels are frozen at merge time, independently of `materialize`'s `skipFreeze` (which defers only the state-object freeze, for the transition pipeline).

### Validation Pattern

Validation has two tiers: **invariant protection** in core (structural guards + 5 invariant guards) and **DX validation** opt-in via @real-router/validation-plugin. The plugin installs a `RouterValidator` object into `RouterInternals.validator` at registration time.

**Facade methods** and **standalone API functions** call through the optional validator using optional chaining:

```typescript
// Router.ts (facade)
buildPath(route: string, params?: Params, search?: SearchParams): string {
  const ctx = getInternals(this);
  ctx.validator?.routes.validateBuildPathArgs(route);      // no-op if plugin absent
  ctx.validator?.navigation.validateParams(params, "buildPath");
  return ctx.buildPath(route, params, search);  // via WeakMap — applies interceptor pipeline; search = query channel (M2 #1548)
}

// api/getRoutesApi.ts (standalone API)
add(routes) {
  ctx.validator?.routes.validateAddRouteArgs(routes);  // no-op if plugin not registered
  addRoutes(store, routes);
}
```

The `validator` object is namespaced by concern (`routes`, `navigation`, `state`, `lifecycle`, `dependencies`, `plugins`, `options`, `eventBus`). Each namespace maps to a group of validator functions.

**Plugin lifecycle:**

- `validationPlugin()` is registered before `router.start()` — throws `VALIDATION_PLUGIN_AFTER_START` otherwise
- On registration: installs validator + runs retrospective validation on existing routes/deps/options
- On teardown (`unsubscribe()`): sets `ctx.validator = null` — validation silently disabled

Structural guards remain in namespace folders (`OptionsNamespace/validators.ts`, `PluginsNamespace/validators.ts`). DX validators live in `@real-router/validation-plugin`, accessed via `RouterValidator` interface in `src/types/RouterValidator.ts`.

**The `@real-router/core/validation` subpath (`src/validation.ts`) is the plugin's ONLY door to the engine (#1301).** Besides `getInternals` / `RouterInternals`, it re-exports `validateRoute` (route-tree's batch validator — no matcher equivalent) plus the `Matcher` / `RouteTree` types, so the validation plugin never imports `src/engine` (the route-tree layer) directly (segment lookup + existence go through the matcher's own `getSegmentsByName` / `hasRoute`). Kept on this plugin-facing subpath, off the main public index; a guard test in the plugin blocks re-coupling.

### Invariant Guards (always active, no plugin required)

Core contains five invariant guards that run regardless of whether validation-plugin is installed:

- **`subscribe(listener)`** — validates `typeof listener === "function"`. Prevents deferred crash (non-function stored in EventEmitter, crash on next navigation). Includes actionable hint: "For Observable pattern use observable(router) from @real-router/rx". (`subscribeLeave` validates the same way but **without** the rx hint — `@real-router/rx` exposes the Observable pattern for success transitions (`observable(router)`, `state$`, `events$`), not for leave events.)
- **`navigateToNotFound(path)`** — validates `typeof path === "string"` when path is provided (prevents silent state corruption `state.path = 42`). A **path-less** call derives the default path from the committed state; during the two-phase start window (`isActive()` true while `getState()` is `undefined`) it throws `ROUTER_NOT_STARTED` with an actionable message instead of a cryptic `TypeError` from dereferencing the absent state (#1172 — same deferred-crash class as the `start(path)` guard below).
- **`start(path)`** (in `RouterLifecycleNamespace.start`, #939) — validates `typeof path === "string"`. Runs **after** the start interceptor chain, so a browser-plugin's location injection (`next(path ?? getLocation())`) still wins; it only fires when nothing supplied a path. Without it, `start(undefined)` with no browser-plugin reached `matchPath(undefined)` and threw a cryptic, code-less `TypeError: …codePointAt` deep in path-matcher. Symmetric with `navigateToNotFound`'s type guard. (The facade-level `validateStartArgs` validator deliberately permits `undefined` for the browser-plugin-override case — this guard is the post-override backstop.)
- **`claimContextNamespace(namespace)`** (on `PluginApi`, `getPluginApi.ts`) — throws `CONTEXT_NAMESPACE_ALREADY_CLAIMED` when a namespace is already claimed by another plugin, and a `TypeError` on a non-string or empty namespace (symmetric with the sibling guards' input-shape checks, #1191). `claim.write` writes a `"__proto__"` namespace via `Object.defineProperty` so it lands as a genuine own key (and survives `serializeRouterState`) instead of dispatching into the inherited `Object.prototype.__proto__` setter and swapping `state.context`'s prototype. Prevents silent corruption: without these, two plugins writing the same `state.context.<namespace>` would clobber each other's data, and a `"__proto__"` namespace's data would silently vanish from the SSR transport.

- **channel guard** (#1572) — `params ∩ queryNames(name) ≠ ∅`, i.e. a key the route declares as a **query** param supplied in the **path** bag. A **detector, never a normaliser**: the key is not moved (moving it is what channel separation does, and the nav-pipeline design removes that stage so channel-correctness becomes the producer's contract). Two positions, deliberately different reactions:
  - **P3 — `navigateToState` REJECTS** (`WRONG_CHANNEL`), mirroring the `ROUTE_NOT_FOUND` guard beside it: rejected promise + `TRANSITION_ERROR`, not a sync throw, because URL plugins call it from popstate handlers and a new sync throw would change an existing method's failure shape. It is the one producer taking a ready-made `State`, and there is no working form behind it — a pre-M2 layout commits silently corrupt (key in `state.params`, absent from `state.path`). `start()` commits through the same primitive, so the guard sits on every start including SSR hydration, at zero cost (a state produced by core is channel-correct by construction).
  - **P1 — `navigate` / `makeState` / `buildNavigationState` THROW** a `TypeError`, SYNCHRONOUSLY, on the caller's RAW argument before interceptors. Sync even on `navigate` (which otherwise reports failure through a rejected promise) because this is an ARGUMENT-SHAPE defect at the API boundary, caught before any transition exists — the same class as the `subscribe` / `start` guards; rejecting would let a `.catch()` written for navigation failures swallow a programming error. The warn-first step announced the contract so every call site could self-identify in the logs; this is the promotion it announced, shipped with its own test migration (~100 pins across core + 4 plugins, plus the `navigate/search-single-bag` benchmark arm, which measured a form that now throws).
  - `undefined`-blind (the persistent-key removal marker is not a mis-channel); inherits the `/items/:id?id` carve-out from `getQueryParams`, the same registry the URL build prints from (#1556), rather than re-deriving it; short-circuits on a route with no query declarations; and **never becomes the thing that throws** — an accessor-backed bag whose read throws is left to the consumer that actually needed the value, so a diagnostic cannot move the origin of an existing failure. **This guard** does not run on the predicates (`isActiveRoute` / `buildPath` / `canNavigateTo`): it is a SCAN over the caller's bag on every `<Link>` render, for a condition that is almost always absent, so correct links pay it too. The rule is the channel guard's own — **it is not core's policy on predicates, and the mode gate below makes the opposite call on purpose (#1581)**; see the render-path table at the end of this section for all three mechanisms side by side. **Not scanned ≠ blind, though (#1576):** `canNavigateTo` asks whether `navigate` WOULD work, so it consults the same predicate itself and returns `false` for the shape P1 throws on — an answer, not a throw, so the render-path trade is untouched. `isActiveRoute` / `buildPath` ask a different question and are unchanged.

### The mode gate — always-on, but a NORMALISER (#1575)

Distinct from the guards above and worth the contrast: the channel guard
**detects and never moves**; the mode gate **fixes and never reports**.

One rule, all three `queryParamsMode` values, both directions: _a key the active
mode does not PRINT does not enter the canonical query channel._ The URL build
has always printed declared names only under `default` / `strict`, so keeping an
undeclared key in `state.search` published a state whose own `path` contradicted
it. The gate drops it instead, buying `keys(state.search) ⊆
keys(matchPath(state.path).search)` in every mode (INVARIANTS makeState #6).

- A **DROP, not a move** — the key does not fall back into `state.params`.
  Re-channelling it there would re-create the per-entry-point ambiguity (#1553).
- Applied **after** the default merge, so a `defaultSearch` for a key the route
  does not declare with `?name` is dead config under `default` / `strict` — a
  deliberate side edge, not an oversight.
- Wired at ONE terminal — `pipeline/canonicalize` — which every producer now
  reaches: `navigate` / `buildNavigationState` / `buildPath` / `canNavigateTo` /
  `isActiveRoute` both arms / the `matchPath` rebuild, and `makeState`, the
  direct primitive plugins use to rebuild a state from a serialized history
  entry. It was three terminals before Phase 2 folded the `matchPath` rebuild in,
  two until Phase 4 folded `makeState`, and one since. That count is the whole
  point: while it was two, #1584's existence precondition landed on the first and
  not the second, because it was found by sweeping the PORT's consumers and
  `makeState` read its own dependency bag. `loose` short-circuits, so the repo
  default pays nothing.
- **The diagnostic fires from every one of them, predicates included — that
  uniformity IS the design (#1581), not a leak from it.** Measured on the phase's
  own base commit: `canNavigateTo` and `isActiveRoute`'s exact arm ALREADY
  reported, through `makeState`, so the render path was never silent; the two
  cells the phase changed (`buildPath`, `isActiveRoute`'s descendant arm) were
  silent only because they had no gate at all — the #1549 / #1578 divergence it
  closed. The channel guard's reason for staying off predicates does not
  transfer: that guard SCANS on every render for a condition usually absent,
  while this one speaks only when a key was actually DROPPED — i.e. only when the
  answer the predicate just returned is missing what the caller asked for. A
  `buildPath` that silently omits your key is exactly the case worth one line.
  De-duplicated per route+key, so it is one line per key, never a per-render
  flood. ⚠ Silencing `buildPath` again would restore the "one producer out of
  step" shape the phase exists to remove, and gating the report on
  `canonicalize`'s literal form cannot express a coherent rule anyway — it misses
  `canNavigateTo`, a predicate on the ① form (mutationally demonstrated: that
  mutant silences `buildPath` and both `isActiveRoute` arms and leaves
  `canNavigateTo` reporting). Pinned by "feeds the gate from EVERY producer" in
  `undeclared-query-mode-gate.test.ts`, which is the only test that fails on it.
- **The message names the route and the key, deliberately not the PRODUCER.**
  Adding one cannot work under the de-dup that ships with it: three producers
  hitting the same route+key raise exactly ONE warning (measured), so the name
  would be whichever ran first and would assert a locality the de-dup has already
  destroyed — a `<Link>` render would be blamed while the `navigate` with the
  identical defect went unmentioned. De-duplicating per producer instead would
  undo the anti-flood decision the diagnostic shipped with. Route + key already
  says WHAT is wrong; only a stack trace says WHERE, and `console.warn` carries
  one in the browser devtools this diagnostic targets.
- The pipeline reads the decision through one boolean port accessor,
  `admitsUndeclaredQuery()`, rather than learning the mode itself.
- **The REPORT presupposes the route exists (#1584).** The drop does not — it
  is always-on and correct for any name — but announcing "key `q` is not
  declared on route `nope`" about a route that is not a route blames the query
  for a typo in the ROUTE name. `queryNames` cannot tell the two apart (`[]`
  for both), so both diagnostics gate on `pathNames(name) !== undefined`, the
  one member that carries the distinction.
- Silent in bare core; `validation-plugin`'s `state.reportDroppedQueryKey`
  (called from the gate, de-duplicated per route+key — and per ROUTER since
  #1583, so a second router or an SSR clone is not silenced) makes it visible. Same
  always-on-fixes / opt-in-diagnoses split as the channel guard.

**A key declared NOWHERE keeps its params-bag home — with an opt-in diagnostic (#1579).** A key the route names neither as a path slot nor with `?` has no channel to own it, so it stays in `state.params` as app-level data (documented in the wiki: an arbitrary default is not part of the URL). The consequence is real and was the complaint behind #1553: the state does not round-trip through its own `state.path`. Core does NOT drop it — that was measured and rejected, because dropping retires a shipped capability across 52 tests in 6 packages, and the "declared nowhere" predicate cannot separate a typo from `navigate("users", { id })` on a parent route whose CHILD declares `:id`. Instead `validation-plugin` says it once per route+key, per ROUTER (#1583 — the cache used to be module-level, which silenced every router after the first) — and only for a route that EXISTS (#1584: `queryNames`/`pathNames` both answer `[]` for a missing route, so every key in the bag used to be reported as "declared nowhere", blaming the params for a route-name typo and burning a de-dup slot that silenced the genuine warning if that name later became real). The diagnostic is opted into by the COMMITTING producers (`navigate`, `buildNavigationState`) rather than inferred from the compositional form — `canNavigateTo` resolves `forwardTo` and would be caught by a form-based test while still running on every `<Link>` render, which is the same per-render flood the channel guard avoids by not instrumenting predicates.

**What each mechanism does on the RENDER path.** Three of them make a call about the predicates, each in its own section above, each for its own reason — and one sentence written without naming its mechanism read as a policy for all three, which is what #1581 was (the sentence lived in the channel guard's bullets and had never described the mode gate, not even before Phase 2). Read this table before writing "predicates are not …" anywhere:

| Mechanism                               | On predicates?                                                          | Why that answer                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Channel guard** (#1572)               | **No** — never runs there                                               | A SCAN over the caller's bag on every `<Link>` render, for a condition that is almost always absent. Correct links pay it too, and its reaction is a THROW — into a render, across six adapters. `canNavigateTo` is not blind regardless (#1576): it consults the same predicate and answers `false`.                                                               |
| **Mode gate** (#1575)                   | **Yes** — every producer, no exceptions                                 | Speaks only when a key was actually DROPPED, so the cost lands on the broken call, not on the correct one. A predicate that dropped your key just returned an answer missing what you asked for. De-duplicated per route+key.                                                                                                                                       |
| **Undeclared-param diagnostic** (#1579) | **No** — committing producers only (`navigate`, `buildNavigationState`) | Nothing is lost: the key STAYS in `state.params` as app-level data. The advice is about round-tripping a state you are about to commit, so a predicate that commits nothing has no use for it. Opted into by ROLE, not inferred from the compositional form — `canNavigateTo` shares the resolving form with `navigate` and would be swept in by a form-based rule. |

The discriminator is **loss**: report where information was destroyed, advise only where something will be committed, and never scan the render path for an absence.

**Criterion for adding invariant guards:** (a) silent corruption — invalid input doesn't crash but corrupts state, or (b) deferred crash in user-facing API — error stored, crash later with unrelated stack trace.

**Param-value type validation stays opt-in (validator), NOT a core guard.** Bare core tolerantly accepts param values that cannot round-trip through a URL path — a `Symbol` path-param keeps its raw identity in `state.params` (path stringifies to `/items/Symbol(x)`, never matching back), a `BigInt` coerces lossily, and a NUL/control char percent-encodes into `state.path` (`%00`). These are exotic programmer errors, so `@real-router/validation-plugin` rejects them with actionable messages (#934/#942) rather than core paying a per-navigate value-scan on the hot path. Symmetry note: a Symbol _query_ value already throws a raw `TypeError` from `String(symbol)` in bare core; the plugin aligns the path-param case to a clear error too.

### Namespace Folder Structure

Each namespace has its own folder with separated concerns:

```
namespaces/RoutesNamespace/
├── RoutesNamespace.ts     — class with instance methods
├── routesStore.ts         — plain data store (RoutesStore interface + factory)
├── forwardChain.ts        — forwardTo chain resolution (resolveForwardChain)
├── constants.ts           — namespace-specific constants
├── helpers.ts             — pure helper functions (no state)
├── routeGuards.ts         — remove/clear CRUD guards (validateRemoveRoute / validateClearRoutes)
├── types.ts               — namespace-specific types/interfaces
└── index.ts               — exports

namespaces/DependenciesNamespace/
├── dependenciesStore.ts   — plain data store (DependenciesStore interface + factory)
└── index.ts               — exports
```

**Store pattern:** `RoutesStore` and `DependenciesStore` are data-holder interfaces (not classes). Besides the tree/config/matcher data, `RoutesStore` deliberately carries internal cross-namespace references — `lifecycleNamespace` and `depsStore`, set after construction during wiring — so the standalone CRUD helpers can reach the lifecycle namespace (for `addCanActivate` / `clearDefinitionGuards` / `clearAll`) via `store.lifecycleNamespace` instead of threading a parameter through every helper. The store is the api/ layer's deliberate transport channel, not pure inert data. CRUD logic lives in the corresponding standalone API function (`getRoutesApi.ts`, `getDependenciesApi.ts`).

### Dependency Injection

Namespaces are constructed independently, then wired together by `wireNamespaces()` (`wiring/wireNamespaces.ts`) — plain `wire*` functions over a shared `NamespaceBag`. Each namespace receives a bundle of dependency closures via `setDependencies()` (a **pure assignment** — no side effects, #1331); cross-namespace references are set the same way:

```typescript
// wireNamespaces.ts — one wire* function per namespace
ns.routeLifecycle.setDependencies({ compileFactory, getValidator });
ns.routes.setDependencies({ addActivateGuard, makeState, forwardState, ... });
ns.routes.setLifecycleNamespace(ns.routeLifecycle);
```

The `wire*` call order is arbitrary (#1331): no `wire*` function runs user code or eagerly reads another namespace's deps.

**Initial-route guard factories flush last (#1331).** `canActivate` / `canDeactivate` factories from the initial route definitions are compiled and executed by `flushPendingGuards()` — the **final step of the constructor**, after all wiring and method binding — so a factory sees a fully-built router: read-only calls (`buildPath()`, `isActiveRoute()`, `getState()`) are safe. **Contract: a guard factory must be side-effect-free with respect to the router** (`navigate`, `usePlugin`, mutating route-CRUD are out of contract). Factories re-execute outside the constructor — `cloneRouter` re-compiles every definition guard on each clone, and `#recompileSlot` re-runs a factory after a definition-only clear — so any side effect duplicates per re-execution. (`cloneRouter` defensively skips replaying a plugin that a contract-violating factory already registered on the clone, but the contract stands: register plugins outside factories.) The pending factories also flush sequentially, so `canNavigateTo` called from a factory would observe a partially-registered guard set. **A factory throw disposes the instance**: the constructor calls `dispose()` before rethrowing, so a router reference leaked from an earlier factory is fail-closed (`ROUTER_DISPOSED`) rather than a live router with later guards silently missing.

### Plugin Interception Points

Plugins intercept router methods via a universal `addInterceptor()` API on `PluginApi`:

```typescript
const api = getPluginApi(router);

// Wrap forwardState to inject persistent params
api.addInterceptor("forwardState", (next, routeName, routeParams) => {
  const result = next(routeName, routeParams);
  return { ...result, params: withPersistentParams(result.params) };
});

// Wrap start to make path optional (browser-plugin)
api.addInterceptor("start", (next, path) =>
  next(path ?? browser.getLocation()),
);
```

**`InterceptableMethodMap`** defines interceptable methods: `start`, `buildPath`, `forwardState`. Consumers: `browser-plugin` / `hash-plugin` / `navigation-plugin` (start — path-optional via `shared/browser-env` `createStartInterceptor`), `ssr-data-plugin` / `rsc-server-plugin` (start — SSR loaders via `shared/ssr` `createSsrLoaderPlugin`), `persistent-params-plugin` (buildPath, forwardState).

Multiple interceptors per method execute in LIFO (reverse registration) order — the last-registered interceptor wraps the first, forming an onion-layer chain. Each receives `next` (original or previously-wrapped function) plus the method's arguments. Returns unsubscribe function.

A **`start` interceptor is async** — it must return a `Promise<State>` (either `next(...)`'s result or its own thenable). One that returns without calling `next()` and without returning a thenable (typically `undefined`) is a misuse: `Router.start()` detects the non-thenable chain result and **rejects with an actionable `TypeError`** rather than crashing on `internalStart.catch(undefined)` and leaving the FSM stuck in `STARTING` (#1411). The sync `buildPath` / `forwardState` interceptors have no analogous return-normalization yet — a non-conforming return there surfaces differently (silent `undefined` / destructure crash); same class, tracked as a follow-up.

Internally, `createInterceptable()` in `internals.ts` wraps methods at wiring time via `RouterInternals` WeakMap, ensuring all call paths (facade, wiring, plugins) are intercepted.

**Validation runs on the RAW argument, before interceptors.** `Router.start()` calls `validator?.navigation.validateStartArgs(startPath)` (and `sendStart()`) _before_ `getInternals(this).start(path)` dispatches the interceptor chain. So `validateStartArgs` sees the **caller's** `startPath`, not the value a browser-plugin interceptor substitutes (`path ?? browser.getLocation()`) — the validator deliberately permits `undefined` for exactly this reason (browser-plugin fills it in downstream). A plugin that needs to validate the _post-override_ path must do so inside its own interceptor.

### Router Extension via `extendRouter()`

Plugins can formally extend the router instance with new properties via `extendRouter()`:

```typescript
const api = getPluginApi(router);

const removeExtensions = api.extendRouter({
  buildUrl: (name, params) => buildUrlImpl(name, params),
  matchUrl: (url) => matchUrlImpl(url),
});

// Extensions are assigned directly to the router instance
router.buildUrl("users", { id: "1" }); // works (via declare module augmentation)

// Cleanup: removes extensions from router
removeExtensions();
```

**Conflict detection:** Throws `RouterError(PLUGIN_CONFLICT)` if any key already exists on the router instance. Validation is atomic — all keys are checked before any are assigned.

**Automatic cleanup:** Extensions are tracked in `RouterInternals.routerExtensions` and removed on unsubscribe. `Router.dispose()` includes a safety-net that cleans up any remaining extensions after plugin teardown.

---

## Key Concepts

### State is Immutable

States are **deeply frozen** via `Object.freeze()`. Never mutate, always create new.

**Exception — `state.context`:** the `context` object is **intentionally not frozen** (`pipeline/materialize.ts` — the state shape moved there when `03b70236f` inlined `createStateObject`; `navigateToNotFound` builds its own in `NavigationNamespace`). Plugins write per-route data into it via `claimContextNamespace()` + `claim.write(state, value)` (or the direct `state.context.<ns> = …` escape hatch) after state creation. The `context` _slot_ on the state is frozen (cannot be reassigned — `state.context = {}` throws), but the object it points to stays mutable. So "deeply frozen" holds for `name` / `params` / `path` / `transition` (+ nested), with `context` the documented carve-out that the whole `claimContextNamespace` mechanism depends on.

### Router Lifecycle: dispose()

`dispose()` permanently terminates the router. Unlike `stop()`, it cannot be restarted.

```typescript
router.dispose(); // Idempotent — safe to call multiple times
```

**Lifecycle**: healthy flows route through IDLE (`STOP → IDLE → DISPOSE`). The FSM also accepts `DISPOSE` directly from `STARTING`, `READY`, `TRANSITION_STARTED`, and `LEAVE_APPROVED` as a safety net (#660) — required when the orchestrated path cannot reach `IDLE`, e.g. `dispose()` called mid-`STARTING` after a start-pipeline throw left the FSM stuck.
**Cleanup order**: abort navigation → cancel transition → stop (if ready/transitioning) → FSM DISPOSE → clearAll (events) → plugins → router extensions (safety net) → context claims (safety net) → interceptors (safety net, #1199) → routes → lifecycle → state → deps → markDisposed
**After dispose**: All mutating methods throw `RouterError(ROUTER_DISPOSED)`
**Idempotency**: Second call is a no-op (FSM state check)

### Cloning Semantics (SSR)

`cloneRouter(router, deps?)` (standalone API, `api/cloneRouter.ts`) builds an independent router for **SSR per-request isolation** — one base router per process, one clone per request. The clone is always constructed fresh (FSM `IDLE`, no committed state) regardless of the source's lifecycle state; cloning a disposed router throws `ROUTER_DISPOSED`.

| Subsystem                                                                                     | Clone behavior                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route tree                                                                                    | **Rebuilt** from serialized definitions (`routeTreeToDefinitions` → constructor) — not shared                                                                                                     |
| Root path (`rootPath`)                                                                        | **Carried over** — the source's `setRootPath` value is re-applied so the clone builds/matches under the same sub-path (#1175)                                                                     |
| Options                                                                                       | Shallow spread; deep-frozen, so ref-sharing is safe                                                                                                                                               |
| Dependencies                                                                                  | **Shallow merge** `{ ...sourceDeps, ...deps }` — top-level keys fresh, **values shared by reference**                                                                                             |
| Config (decoders / encoders / forwardMap / `defaultParams` / `defaultSearch` / custom fields) | `Object.assign` shallow — per-route objects **shared by reference**; copied **before** guards/plugins so re-run factories see the full config (#1176/#1338)                                       |
| Lifecycle guards                                                                              | Re-registered **preserving origin** (definition stays definition, external stays external — #676); the effective guard is **external-wins**, so the clone runs the same guard as the base (#1174) |
| Plugins                                                                                       | Factories re-run on the clone — **fresh instances**, fresh `state.context` claims                                                                                                                 |
| State / FSM / EventEmitter / interceptors / `hydrationState` / `contextClaimRecords`          | **Reset** (fresh per clone)                                                                                                                                                                       |

**Shared-by-reference is intentional (#664).** A `Map`, `Set`, class instance, or nested object in `base.dependencies` (or a per-route `defaultParams` / custom-field object) is the **same instance** in every clone — mutating it from one clone is visible in the base and all siblings. `structuredClone` is deliberately not applied (it breaks class instances, functions, singleton pools, circular refs). Rule: **singletons / shared services → `base.dependencies`; per-request mutable state → the `deps` override** (or `createRequestScope`), which is applied last and wins over base keys. Cross-request leaks happen only when per-request state is wrongly placed in the base.

**Guard origin round-trips (#676).** Cloned definition guards are re-registered with `isFromDefinition=true`, so the clone's `replace()` strips them via `clearDefinitionGuards()` exactly as on the source. Caveat: guard-factory **closures are shared** — do not capture per-request state in guards registered on the base router (register such guards on the clone).

**Not re-applied on the clone:** `extendRouter` / `addInterceptor` called **outside** a plugin factory (directly via `getPluginApi(base)`) — only plugin-factory extensions/interceptors re-run. Full reference: `wiki/clone.md`.

**Per-clone footprint (#966).** A clone retains ≈ the cost of a **fresh `createRouter(routes)`** of the same size — measured ~173 KB vs ~175 KB for 50 routes (clone is in fact a touch cheaper). It rebuilds its own tree + matcher + namespaces precisely so route-CRUD on a clone never touches the base, so the footprint scales with route count, not a fixed "template" budget, and is reclaimed when the request-scoped clone is disposed. This is the price of independent-instance isolation, **not duplication to trim** — sharing the tree to shrink it would break per-clone route-CRUD isolation. (The earlier 20-80 KB "template" target was aspirational and never reflected an independent-instance cost.) Regression guard: `benchmarks/audit-probes/clone-router-2026-05-22/probe-09-memory-footprint.ts` asserts `clone ≈ fresh createRouter`.

### Enhanced State Object: TransitionMeta

After every successful navigation, `router.getState()` includes a `transition` field:

```typescript
const state = await router.navigate("users.profile", { id: "123" });
state.transition; // TransitionMeta
// {
//   reload: true,             // true after navigate(..., { reload: true }) (optional)
//   replace: true,            // true after navigate(..., { replace: true }) — also set on navigateToNotFound and auto-force from UNKNOWN_ROUTE (optional)
//   redirected: true,         // true if navigation was redirected via forwardTo (optional)
//   phase: "activating",      // last phase reached: "deactivating" | "activating"
//   from: "home",             // previous route name (undefined on first navigation)
//   reason: "success",        // always "success" for resolved navigations
//   blocker: undefined,       // guard name that blocked (reserved, not yet populated by core)
//   segments: {
//     deactivated: ["home"],  // route segments deactivated (frozen array)
//     activated: ["users", "users.profile"], // route segments activated (frozen array)
//     intersection: "",       // common ancestor segment
//   }
// }
```

Transition timing is available via `@real-router/logger-plugin`.

`TransitionMeta` and its nested objects are deeply frozen.

#### Core vs plugin signals: `transition.replace` vs `state.context.navigation.navigationType`

The two fields **complement** each other — they measure different things from different sources, so they coexist (no deprecation):

| Layer  | Field                                            | Source                                                                                                                             | Availability                                |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Core   | `state.transition.{replace, reload, redirected}` | `NavigationOptions` passed to `router.navigate(...)` (or auto-modified by `forceReplaceFromUnknown` / `navigateToNotFound`)        | Always, under any URL plugin (or no plugin) |
| Plugin | `state.context.navigation.navigationType`        | Platform Navigation API event (`event.navigationType`) or History-stack derivation — how the **browser** classified the navigation | Only under `@real-router/navigation-plugin` |

Semantic coverage at a glance:

| Question                                | Core portable signal                                      | Plugin signal (navigation-plugin only)                   |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Was this a replace transition?          | `state.transition.replace === true`                       | `state.context.navigation.navigationType === "replace"`  |
| Was this a reload transition?           | `state.transition.reload === true`                        | `state.context.navigation.navigationType === "reload"`   |
| Was this a redirect transition?         | `state.transition.redirected === true`                    | (no plugin signal — core-level concept)                  |
| Was this a traverse (browser back/fwd)? | **Not covered** — traverse has no `opts.replace`/`reload` | `state.context.navigation.navigationType === "traverse"` |
| Was this a push?                        | By elimination — none of the above flags                  | `state.context.navigation.navigationType === "push"`     |

Rule of thumb: read `transition.replace` (and `reload`/`redirected`) when you want to know **what the caller asked for** (or what core auto-modified) — portable across URL plugins. Read `state.context.navigation.navigationType` when you need to know **how the Navigation API classified** the transition, including browser-driven `traverse`/`reload` events that don't flow through `router.navigate` options.

Concrete consumer of both: `shared/dom-utils/scroll-restore.ts` reads `route.transition.reload || nav?.navigationType === "reload"`. The core arm covers programmatic reload (`router.navigate({reload:true})`); the plugin arm covers F5/cross-document under navigation-plugin (#531 priming via `getActivationType()` sets `nav.navigationType === "reload"` while leaving `opts.reload` undefined on the initial transition). Dropping either side silently regresses one of the cases.

### Transition Pipeline

All navigation methods return `Promise<State>`. The pipeline uses **optimistic sync execution** — guards run synchronously until one returns a Promise, then switches to async.

```
router.navigate(name, params, search, opts)   // search = query channel; opts at slot 4 (M2 #1548)
  │
  ├── Build target state (buildNavigateState)
  ├── Same-state check (path comparison)
  ├── liveness snapshot (suspendable? — external signal / leave / start listeners; #1169)
  ├── FSM send(NAVIGATE) → action emits TRANSITION_START
  │
  ├── Guard pipeline (executeGuardPipeline)
  │   ├── Deactivation guards (innermost → outermost)
  │   ├── LEAVE_APPROVE phase: FSM send(LEAVE_APPROVE) → action emits TRANSITION_LEAVE_APPROVE
  │   │   └── subscribeLeave() callbacks fire here (approved/tentative departure, before activation — activation can still reject)
  │   └── Activation guards (outermost → innermost)
  │   Returns: undefined (all sync) | Promise<void> (async detected)
  │
  ├── SYNC PATH (no async guards):
  │   └── commit-gate (if suspendable && cancelled/terminated → reject; #1169)
  │       → completeTransition() → setState + FSM send(COMPLETE) → action emits TRANSITION_SUCCESS
  │       → return Promise.resolve(state)
  │
  └── ASYNC PATH (async guard detected):
      └── #finishAsyncNavigation(guardCompletion, ...)
          ├── receives AbortController (set up upfront when guards/leave-listeners present)
          ├── await guardCompletion
          └── completeTransition() → same as sync
```

**Key optimization:** On the pure hot path (no guards, no `subscribeLeave` listeners) the navigation runs fully synchronously — no AbortController, no async/await, no microtask delay. Sync guards/listeners still complete inline (no await) but allocate an AbortController that is released unaborted on success.

On error at any step: `emitTransitionError()` → `Plugin.onTransitionError()` → Promise rejects with `RouterError`.

**Cached error fast paths:** Common rejections (SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND) return pre-allocated `Promise.reject()` instances from `constants.ts` — zero allocation per rejection.

**`navigateToNotFound()` bypasses this pipeline entirely.** It sets state directly and emits only `TRANSITION_SUCCESS` (no `TRANSITION_START`, no guards, no FSM transition, no AbortController). Always passes `{ replace: true }` as opts.

**Fire-and-forget safety:** `navigate()`, `navigateToDefault()`, and the `navigateToState()` plugin primitive internally suppress unhandled rejections for expected errors (`SAME_STATES`, `TRANSITION_CANCELLED`, `ROUTER_NOT_STARTED`, `ROUTE_NOT_FOUND`, `CANNOT_ACTIVATE`, `CANNOT_DEACTIVATE`), so calling them without `await` is safe (#721). A guard block (or a plugin's guard-blocked `back()`/`forward()`) is an expected outcome, not an internal error — the safety net stays silent; `await` the call or use an `onTransitionError` plugin to observe a guard rejection. (A **synchronous** reentrant navigation from inside a transition listener is **banned** — it throws `REENTRANT_NAVIGATION` at the facade, RFC navigation-cancellation-unification §4 — so there is no self-feeding chain to suppress; the former #945 `RecursionDepthError` carve-out is gone.)

### NavigationNamespace File Structure

```
namespaces/NavigationNamespace/
├── NavigationNamespace.ts     — navigate(), #finishAsyncNavigation()
├── constants.ts               — cached error instances (CACHED_*_REJECTION)
├── types.ts                   — NavigationContext, NavigationDependencies
├── index.ts                   — exports
└── transition/
    ├── guardPhase.ts          — executeGuardPipeline(), runGuards(), resolveRemainingGuards()
    ├── completeTransition.ts  — completeTransition(), buildTransitionMeta()
    └── errorHandling.ts       — handleGuardError(), routeTransitionError()
```

**Guard pipeline** (`guardPhase.ts`): `executeGuardPipeline()` orchestrates deactivation → activation phases. `runGuards()` iterates guards synchronously, returns `Promise<void>` on first async guard. `resolveRemainingGuards()` continues the async tail as a flat for-loop (no `.slice()` allocations).

**`NavigationContext`** (`types.ts`): Shared interface passed from `navigate()` through async path to `completeTransition()`. Avoids constructing intermediate objects on the hot path.

### Guards vs Plugins

|                     | Guards              | Plugins            | subscribeLeave                                                    |
| ------------------- | ------------------- | ------------------ | ----------------------------------------------------------------- |
| When                | Before state change | After state change | Between deactivation and activation guards (LEAVE_APPROVED phase) |
| Can block           | Yes                 | No                 | No                                                                |
| Can redirect        | No                  | No                 | No                                                                |
| Can transform state | No                  | No                 | No                                                                |
| Scope               | Per-route           | Global             | Global                                                            |

**`subscribeLeave(listener)`** — subscribe to approved route departures. Fires after all deactivation guards pass (**departure is approved, not yet committed**) but before activation guards run — an activation guard can still reject, leaving state unchanged, so treat the leave as tentative (verify the outcome for non-idempotent side-effects). Returns an unsubscribe function.

**Listener signature:** `(payload: LeaveState) => void | Promise<void>` where `LeaveState = { route: fromState, nextRoute: toState, signal: AbortSignal }`.

**Async semantics (important):** `subscribeLeave` listeners are **awaited** — the activation phase does not start until all listeners' returned Promises settle (`Promise.allSettled`). This is the only subscription in the router that blocks the navigation pipeline. Use it for:

- Animation hooks that must snapshot DOM before commit (e.g., `document.startViewTransition`)
- Async cleanup that must complete before activation
- Data prefetch coordinated with leave event

Sync listeners run inline; a sync throw rejects `navigate()` with that **original error** and emits `TRANSITION_ERROR` — it is **not** converted to `TRANSITION_CANCELLED`. The first sync throw wins, and a sync throw takes priority over any async listener rejection. The `signal` in the payload aborts when the navigation is **cancelled** — superseded by a newer `navigate()`, `stop()`, `dispose()`, or an external `opts.signal` abort — **or fails** (a sync leave throw, a rejecting activation guard), and **never** on successful completion. This holds identically on the guard and no-guards pipeline paths: the same controller backs the signal, and core releases it without aborting on success (`#cleanupController(controller, /* cancelled */ false)`), so a listener that captured the signal still observes `aborted === false` after the navigation commits (#722).

**`subscribe(listener)`** — subscribe to `TRANSITION_SUCCESS` (post-commit). In contrast to `subscribeLeave`:

- **Fire-and-forget:** listeners are invoked synchronously from `EventEmitter.emit`; returned Promises are **not awaited** — `router.navigate()`'s returned Promise resolves before an async listener's body completes. The listener's return value is ignored, but **a rejected Promise from an async listener is isolated by core** (#944): the subscribe wrapper just returns the listener's runtime value to the `EventEmitter`, whose **central isolation** (#1412) inspects the return value and routes a rejected thenable to the same `onListenerError` sink a synchronous throw flows through, so it does **not** leak as a Node `unhandledRejection` (which would terminate the process under `--unhandled-rejections=strict`, the Node 22+ default). The same central isolation covers **raw plugin hooks** (`onStart`, `onTransitionSuccess`, …) — an `async` hook that rejects is isolated identically, not only `subscribe` listeners (#1412). Symmetric with `subscribeLeave`, which awaits listeners via `Promise.allSettled` and isolates their rejections. A **synchronous** reentrant `router.navigate()` (or `navigateToDefault`/`navigateToState`/`navigateToNotFound`) from inside a transition listener is **banned** — it throws `RouterError(REENTRANT_NAVIGATION)` synchronously at the facade (RFC navigation-cancellation-unification §4); inside a listener the emit's `onListenerError` isolation surfaces it non-fatally. Deferred (async / `await`ed / `queueMicrotask`) navigation from a listener is allowed (the transition has settled, FSM is `READY` again) — "navigation after navigation" should use `await navigate(...)`, an async listener, or `navigate(...).catch(...)`.
- **Listener signature:** `(payload: { route: State, previousRoute?: State }) => void` — no `signal` (no cancellation, the transition already committed).
- **Invocation order:** `router.subscribe` listeners fire in registration order, all before `navigate()` resolves. Do not rely on other subscribers having run their async tails when your listener executes.

**`navigateToNotFound()` bypasses both:** no guards run, plugins only see `onTransitionSuccess` (no `onTransitionStart`).

### When `navigate()`'s Promise resolves vs subscribers

```
navigate()
  ├── deactivation guards (sync/async)
  ├── LEAVE_APPROVED: subscribeLeave listeners  ← awaited (blocks pipeline)
  ├── activation guards (sync/async)
  ├── completeTransition():
  │    ├── setState(finalState)
  │    └── emit(TRANSITION_SUCCESS) → subscribe listeners fire synchronously
  │        (returned Promises ignored)
  └── return Promise.resolve(finalState)   ← resolves here
```

Consequence: `await router.navigate(...)` guarantees that `subscribeLeave` fully awaited and `subscribe` listeners were invoked synchronously — but **not** that any `async` work inside a subscribe listener has finished. It also does **not** guarantee that framework adapters have committed the DOM (adapters translate the `TRANSITION_SUCCESS` emission into their own scheduled re-render; see `@real-router/sources` + `useSyncExternalStore`/signal-based equivalents).

**To block navigation on post-commit work**, put it in a `subscribeLeave` listener instead — or subscribe to a later lifecycle event via a plugin (`onTransitionSuccess`, but this still doesn't await either).

### Force Replace from UNKNOWN_ROUTE

When navigating FROM `UNKNOWN_ROUTE` state, `navigate()` auto-forces `replace: true` to prevent browser history pollution with 404 entries. This is handled by `forceReplaceFromUnknown()` in `NavigationNamespace`.

### Atomic Route Replacement: replace()

`getRoutesApi(router).replace(routes)` atomically replaces all routes in one operation.

**Semantics** (prepare-then-commit / build-then-swap, #698):

1. **Blocking** — `throwIfDisposed()`; logged no-op during active navigation (`validateClearRoutes` → `logger.error`, returns `false`)
2. **Validation** — fail-fast structural guards, tree unchanged on error (atomicity)
3. **Build artifacts into locals** — `buildReplaceArtifacts()` builds the whole new `definitions`/`config`/`tree`/`matcher`/`forwardMap` in temporary structures; a circular/async `forwardTo` or invalid path **throws here**, before the store is touched — so atomicity holds even without validation-plugin
   - **Handler-limit pre-flight (#1046)** — with validation-plugin installed, the per-type lifecycle-handler limit (#961) is projected against the **surviving external guards** (the post-clear state) and throws here too if the new batch's guard slots would exceed `maxLifecycleHandlers` — so an at-limit batch aborts before `clearDefinitionGuards()`/swap, not after (`#956` had hoisted only the guard-_compile_ throw, leaving the _limit_ throw live on the post-swap install path). The same pre-flight runs for `add` (against the live union count) and `update` (a single new slot).
   - **Guard-compile pre-flight (#1193)** — the new batch's pending guard factories are compiled here (`compileArtifactGuards`), **before** `clearDefinitionGuards()`. A factory that throws on compile (or returns a non-function) aborts with BOTH the tree AND the old definition guards intact; the swap then installs the pre-compiled functions without re-running the factories. (Before #1193 the compile lived inside the post-clear swap, so a malformed batch aborted the swap but had already erased the old definition guards — a silent fail-open.)
4. **Clear definition guards** — `clearDefinitionGuards()` preserves external guards; for a **both-slot** name (definition + external) it recompiles the compiled function from the surviving external factory (external-wins, so the compiled slot is already that external guard — the recompile is idempotent — #1192/#1174)
5. **Atomic swap** — `adoptRouteArtifacts()` assigns the prepared artifacts into the store in one pass (pure assignment, never throws) and registers the collected guards
6. **State revalidation + notify (#950, hybrid #1201)** — `matchPath(currentPath)` decides the next committed state:
   - **no match** → `navigateToNotFound(currentPath)` (commits `UNKNOWN_ROUTE`, emits `TRANSITION_SUCCESS`) instead of a silent `clearState()`.
   - **survivor** (URL still maps to the SAME route name) → keep it, carrying the prior `context` (plugin data — #1236) and route-meta; guards are **not** re-run (the user was already legitimately here — parity with `update()`, #1201).
   - **route-identity change** (URL now owned by a DIFFERENT route, or a newly-added `forwardTo` teleport) → consult the new route's activation guards synchronously (`store.lifecycleNamespace.canNavigateTo`, #1201); commit on pass, `navigateToNotFound(currentPath)` on a block — or an async guard that can't be evaluated synchronously — so a guarded route is **never silently activated**.
     Either way `router.subscribe` / `useSyncExternalStore` adapters are notified, so they re-render instead of showing the pre-replace state. The revalidation `TRANSITION_SUCCESS` carries a distinguishable `revalidate: true` opt (#1201) so a plugin's `onTransitionSuccess` can special-case a revalidation vs a real navigation (both otherwise carry only `replace: true`). **This is the one structural mutation that emits a transition event** — `clear()` stays a silent reset (emits only `TREE_CHANGED`); the asymmetry is deliberate. A consequence: plugins' `onTransitionSuccess` fires for a `replace()` revalidation, and after a drop `getState()` is `UNKNOWN_ROUTE` (not `undefined`).

**Guard origin tracking**: `RouteLifecycleNamespace` tracks guard origins with four Maps split by origin (`#definitionActivateFactories` / `#externalActivateFactories` / `#definitionDeactivateFactories` / `#externalDeactivateFactories`), populated via the `isFromDefinition` parameter on `addCanActivate()`/`addCanDeactivate()`. Resolution is **external-wins regardless of registration order** (`#registerHandler`, #1174): when a route holds both a definition and an external guard, the compiled slot is the **external** one — a definition registered while an external is live is stored (for a later `clearDefinitionGuards()`) but does **not** overwrite the compiled function. `clearDefinitionGuards()` clears the two definition Maps and, for a name that _also_ holds an external guard, **recompiles** the compiled-function slot from that surviving external factory (#1192) — idempotent under external-wins (the slot is already external), so external guards survive `replace()` in behavior, not merely in the Map. **One policy** across `#registerHandler` / `#recompileSlot` / `clearDefinitionGuards`, so a clone's fixed definition→external replay yields the source's effective guard with no extra origin tracking (#1174).

**Key files**: `getRoutesApi.ts` (`replaceRoutes` helper), `routesStore.ts` (`buildReplaceArtifacts()` / `adoptRouteArtifacts()`), `RouteLifecycleNamespace.ts` (guard tracking).

### Route CRUD during active navigation

The five mutating route-CRUD ops react differently to an in-flight navigation (`isTransitioning()`):

| Op        | During navigation                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------- |
| `add`     | no check — proceeds silently                                                                       |
| `update`  | `logger.error` warning, then **proceeds** (an in-flight navigate may read the new config)          |
| `remove`  | non-active route: `logger.warn`, proceeds; active route: `logger.warn`, **no-op** (always blocked) |
| `clear`   | `logger.error`, **no-op** (blocked)                                                                |
| `replace` | `logger.error`, **no-op** (blocked — shares `validateClearRoutes`)                                 |

The asymmetry is intentional: `clear`/`replace` are destructive whole-tree swaps (blocked mid-navigation), while `add`/`update` are incremental and benign (the in-flight transition already resolved its target). `add` has no guard at all — the contract "add is allowed during navigation" is verified benign (no corruption of the in-flight nav).

### `update()` does not revalidate the active state

`getRoutesApi(router).update(name, ...)` mutates config in place and **does not rebuild the tree or recompute the current state** (NO_TREE_REBUILD). So when you update the **currently-active** route's `encodeParams` / `decodeParams` / `defaultParams` / `defaultSearch` / `forwardTo`, the committed `getState().path` keeps the value built by the _old_ config — it can disagree with a fresh `buildPath(name, params)` until the next navigation. This is by-design (update is O(1), not a re-navigation); call `router.navigate(name, params, undefined, { reload: true })` if you need the active path rebuilt with the new config.

### Plugin System

```typescript
const myPlugin: PluginFactory = (router, getDependency) => ({
  onStart() {
    /* router started */
  },
  onStop() {
    /* router stopped */
  },
  onTransitionStart(toState, fromState) {
    /* navigation began */
  },
  onTransitionLeaveApprove(toState, fromState) {
    /* deactivation guards passed, activation guards pending (LEAVE_APPROVED phase) */
  },
  onTransitionSuccess(toState, fromState, opts) {
    /* navigation completed */
  },
  onTransitionError(toState, fromState, err) {
    /* navigation failed */
  },
  onTransitionCancel(toState, fromState) {
    /* navigation cancelled */
  },
  teardown() {
    /* cleanup on unsubscribe */
  },
});

const unsubscribe = router.usePlugin(myPlugin);
```

**Key:** Plugins are **observers** - they react to events but cannot modify the transition.

**Hook error isolation (sync + async, #1412).** Plugin hooks (`onStart`, `onTransitionSuccess`, `onTransitionError`, …) are raw `EventEmitter` listeners. A **synchronous** throw from a hook is caught and logged (other plugins' hooks still run). An `async` hook that **rejects** is now isolated the same way — the emitter inspects each listener's return value and routes a rejected thenable to `logger.error`, so a rejecting `async onStart()` no longer escapes as a Node `unhandledRejection` (fatal under `--unhandled-rejections=strict`, the Node 22+ default); the router still starts / completes the transition. Same central isolation as `subscribe` (#944) — see the `subscribe` fire-and-forget note above. A hook must not rely on its rejection propagating anywhere: it is observed only via `logger.error` (or the emitter's `onListenerError` sink).

**Conditional registration:** `usePlugin()` silently skips falsy values (`undefined`, `null`, `false`), enabling inline conditionals:

```typescript
router.usePlugin(
  browserPluginFactory(),
  __DEV__ && validationPlugin(), // false when __DEV__ is false — skipped
);
```

Plugins can extend the router instance with new methods via `extendRouter()`:

```typescript
const myPlugin: PluginFactory = (router, getDependency) => {
  const api = getPluginApi(router);
  const removeExtensions = api.extendRouter({
    customMethod: () => {
      /* ... */
    },
  });

  return {
    teardown() {
      removeExtensions(); // auto-cleanup on unsubscribe
    },
  };
};
```

### Routes Mutation Events (`subscribeChanges`)

`getRoutesApi(router).subscribeChanges(handler)` is the single entry point for observing **structural** route-tree mutations. It is the route-tree counterpart to `router.subscribe` (transitions) — a separate axis, deliberately not a `router.*` facade method.

```typescript
const routes = getRoutesApi(router);
const unsubscribe = routes.subscribeChanges((event) => {
  switch (event.op) {
    case "add":
      event.added.forEach(register);
      break; // FLAT, full dotted names
    case "remove":
      event.removedSubtree.forEach(drop);
      break; // route + descendants, FLAT
    case "update":
      if (event.patch.defaultParams) revalidate(event.name);
      break;
    case "replace":
      reconcile(event.removed, event.added);
      break; // FLAT diff by name
    case "clear":
      clearAll();
      break;
  }
});
```

| Property                             | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Payload**                          | `TreeChangedEvent` discriminated union (from `@real-router/core/types`), keyed by `op`. Routes are FLAT (full dotted `name`, descendants included), frozen per node.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Immutability is shallow**          | The payload route object (and `update`'s `patch` envelope) is `Object.freeze`d, but **nested config is by reference and aliases the live store** — `event.added[0].defaultParams` is the same object the router reads on every navigation (same aliasing as `get()`), and it is NOT frozen. **Treat payloads as read-only**: mutating a nested field (`event.added[0].defaultParams.x = …`, a `patch.defaultParams`, an `encodeParams`/guard closure) corrupts router config. Core does not deep-freeze (that would freeze the caller's own input, see H-1) or deep-clone (circular refs / class instances). |
| **Timing**                           | Post-commit — the handler sees the new tree via `get()`/`has()`. For `replace`, fires after the tree swap but before state revalidation (new tree, still-old state).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`update` filter**                  | Emits only when the patch has a structural field (`forwardTo` / `defaultParams` / `defaultSearch` / `encodeParams` / `decodeParams`). Guard-only and empty patches are silent.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Fire-and-forget**                  | The handler cannot cancel the mutation; returned promises are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Reentrant CRUD is banned (#1032)** | A route-CRUD op (`add`/`remove`/`update`/`clear`/`replace`) called **from inside a `subscribeChanges` handler** (while a `TREE_CHANGED` emit is on the stack) throws `RouterError(REENTRANT_TREE_MUTATION)` synchronously, **before mutating** — the tree stays atomic. The throw surfaces via `onListenerError` (visible, non-fatal); the outer op completes. Defer instead (`queueMicrotask`/`await`). Mirrors the reentrant-`navigate` ban (§4). CRUD from a _transition_ listener (`subscribe`, not a TREE_CHANGED dispatch) is unaffected.                                                              |
| **Errors**                           | A throwing handler is isolated via `onListenerError`; other handlers still run and the CRUD caller does not see a re-throw. A runaway listener-driven nested same-event emit — e.g. a `router.subscribe` listener that calls `replace()` unconditionally, whose revalidation would re-emit `TRANSITION_SUCCESS` (#950) and re-enter the listener — is harmlessly **coalesced** at the emitter (#1033): the re-entrant emit is a no-op (depth ≤ 1), so the listener runs once and the mutation still commits. (This replaced the former `maxEventDepth` depth bound + `RecursionDepthError`.)                 |
| **Duplicates**                       | Lenient (mirrors `router.subscribe`) — each call is an independent subscription with its own unsubscribe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Clone isolation**                  | A cloned router has an independent emitter; mutations never cross the clone boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Scope**                            | Internal-only channel: `TREE_CHANGED` is not in the public `EventName` union / `events.*` registry / `Plugin` interface. There is no `router.subscribeTree()` and no `addEventListener` path — by design (tree mutations are infrastructural, not app-level).                                                                                                                                                                                                                                                                                                                                                |

`dispose()` releases all `subscribeChanges` listeners (during the `clearAll` events step) before the route teardown, so no event fires during disposal. After disposal, `subscribeChanges` throws `RouterError(ROUTER_DISPOSED)` — including via a reference bound before `dispose()` (`const s = routes.subscribeChanges.bind(routes)`) — rather than silently re-registering a listener that can never fire (#982). This mirrors the `router.subscribe` / `subscribeLeave` guard (#946) and the sibling `getRoutesApi` mutators (`add` / `remove` / `update` / `clear`), which all throw `ROUTER_DISPOSED` after `dispose()`.

### Recommended pattern: declarative reactive cache invalidation

When a plugin (or infrastructure consumer) maintains a cache derived from route tree state, **subscribe declaratively to TREE_CHANGED via `getRoutesApi(router).subscribeChanges()`** and own the invalidation policy in one place — the consumer's constructor or factory.

This is the **recommended approach** for any cache whose contents are keyed by route name or depend on tree shape. It replaces three legacy patterns that solved partial overlapping problems before TREE_CHANGED existed:

| Legacy pattern                                                    | Problem                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Imperative-on-read** (lazy revalidation on access)              | Reasoning is global — to predict cache state you must trace every access site           |
| **Per-op interceptor** (e.g., `addInterceptor("addRoutes")`)      | Asymmetric coverage — catches `add` only, silent on `update`/`remove`/`replace`/`clear` |
| **Init snapshot** (capture tree state at plugin init, never sync) | Diverges from live tree silently — invariants only hold at startup                      |

#### Recommended (declarative reactive)

```typescript
class SearchSchemaPlugin {
  #validated = new Map<string, ValidatedSchema>();

  constructor(router: Router) {
    getRoutesApi(router).subscribeChanges((event) => {
      switch (event.op) {
        case "add":
          event.added.forEach((r) => this.#validate(r));
          break;
        case "update":
          if (event.patch.searchSchema) this.#revalidate(event.name);
          break;
        case "remove":
          this.#validated.delete(event.name);
          break;
        case "replace":
        case "clear":
          this.#validated.clear();
          break;
      }
    });
  }
}
```

#### Why this is the right pattern

1. **Self-contained module** — Cache owner has zero coupling to call sites. Adding new CRUD callers does not require updating cache logic.
2. **Symmetric coverage** — The `switch (event.op)` handles all five operations in one place. No "covered for add but missed for update" gaps.
3. **Local reasoning** — Given any sequence of CRUD calls, cache state is predictable by reading a single `subscribeChanges` handler.
4. **Testable in isolation** — Each branch tests independently: `routes.remove("foo")` ⇒ assert `cache.has("foo") === false`.

#### When to break the rule

- **Pure functions** that derive from tree on every call — no cache, no subscription needed.
- **Read-mostly state** where invalidation is acceptable on next access — imperative-on-read may be simpler (preload-plugin uses this for compiled functions whose factory identity is the implicit cache key).
- **Core-internal caches co-located with the rebuilt artifact** — when a core namespace caches data derived 1:1 from the matcher/tree (e.g. `RoutesStore.urlParamsCache`, the path-param-name cache behind `areStatesEqual` / `isActiveRoute`), clear it at the matcher-rebuild choke point itself (`rebuildTreeInPlace` / `adoptRouteArtifacts`), **not** via a `subscribeChanges` listener. A permanent internal `TREE_CHANGED` subscriber would keep `listenerCount > 0` forever, forcing the listener-gated O(N) `replace`/`add` diff (subscribeChanges invariant 8) to run on every mutation even when no application listener exists. Clearing a `Map` at the rebuild is O(1) and never touches the event path (#723).

#### Anti-pattern: centralized CacheManager

Do NOT build a `CacheManager` that registers caches and dispatches invalidation. Each cache owns its own subscription in its own constructor. Centralizing this:

- Creates a knowledge-leak (caches become aware of CacheManager)
- Forces a unified invalidation model that doesn't fit per-cache strategies
- Adds an indirection layer with no ownership benefit

This is the same lesson MobX's API documents: `observe()` is a low-level utility for building derived sources, not for application-level cache coordination. Use it directly per cache; do not build framework-on-framework.

### Navigator (`getNavigator`)

`getNavigator(router)` returns a frozen read-only subset of router methods for view layers. Pre-bound, safe to destructure. Cached per router instance via WeakMap.

```typescript
import { getNavigator } from "@real-router/core";
const nav = getNavigator(router);
```

| Method            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate`        | Navigate to a route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `getState`        | Get current router state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `isActiveRoute`   | Check if a route is active                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `canNavigateTo`   | Check whether a route's guards would allow navigation — **synchronous, returns `boolean`** (never a Promise). **Parity with `navigate`:** evaluates exactly the guard set `navigate` would run — `toState` is built with route-meta (like `buildNavigateState`), so guards on ancestors **shared with the current route are not re-checked** (they stay mounted), no over-checking (#970). An async guard on the path can't be evaluated synchronously, so it resolves to `false` (core stays silent — DX diagnostics are opt-in; `@real-router/validation-plugin` logs a warning, #958). A guard that **throws** also resolves to `false`, but core logs it via `logger.warn` directly (an operational fault, never silent — #959). Parity covers every way `navigate` refuses the SAME arguments, not just the guard verdict: a missing required path param (#725) and a declared query key handed in the `params` bag (#1576, the shape P1 throws on) both resolve to `false` rather than throwing — the predicate never promises a navigation that would throw on the click. **Total, and that now covers the resolution step (#1577):** a dynamic `forwardTo`, a `forwardState` interceptor, and the caller's own bag (channel separation walks it, so an accessor-backed key throws there) all run user code — a throw from any of them yields `false` + `logger.warn`, never an exception. `isActiveRoute` carries the same boundary over both its branches; both are render-path predicates and neither may throw into a render. Guards are invoked with `signal === undefined` (no AbortController — unlike `navigate`). Returns `true` for the current route (same-state is a no-op, not a guard rejection); before `start()` it runs the target's **activation** guards only (nothing to deactivate, so a blocking _deactivate_ guard is not consulted). Throws `ROUTER_DISPOSED` after `dispose()` |
| `subscribe`       | Subscribe to successful transitions. Fire-and-forget: returned Promises ignored (async rejections isolated, #944), `navigate()` does not wait for async listener bodies. Throws `TypeError` when `listener` is not a function; throws `ROUTER_DISPOSED` after `dispose()` — including via a reference bound before disposal (#946)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `subscribeLeave`  | Subscribe to **approved** route departures (LEAVE_APPROVED phase) — tentative, not committed: an activation guard can still reject. Listener receives `{ route: fromState, nextRoute: toState, signal: AbortSignal }` (the signal aborts with the failure reason if the navigation does not commit). Async listeners are awaited — the activation phase blocks until all Promises settle. Throws `TypeError` when `listener` is not a function; throws `ROUTER_DISPOSED` after `dispose()` — including via a pre-bound reference (#946)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `isLeaveApproved` | Returns `true` when FSM is in LEAVE_APPROVED state (deactivation done, activation pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Transition-in-flight signal.** `isLeaveApproved()` (public, on router and navigator) returns `true` only in the LEAVE_APPROVED phase (deactivation done, activation pending). There is **no public `isTransitioning()` method on the Router class today** — `isTransitioning()` exists only internally (`RouterInternals`, spanning TRANSITION_STARTED + LEAVE_APPROVED) for cross-namespace plumbing. Whether to promote it to the public surface is an open research question (ROI vs. `isLeaveApproved()` + `getState()` already covering the observable cases) — see issue #924.

**`isActive()` spans the whole live lifecycle.** `isActive()` returns `true` throughout `STARTING`, `READY`, `TRANSITION_STARTED`, and `LEAVE_APPROVED` (`fsmState !== IDLE && fsmState !== DISPOSED`) — i.e. from the moment `start()` begins the start lifecycle, not only after it resolves. In particular it is `true` during `STARTING` while `getState()` is still `undefined` (two-phase start). The removed `isStarted()` boolean had the narrower "after successful start" meaning — `isActive()` is **not** its synonym.

## Gotchas

### Guards Cannot Redirect

All guards use `GuardFn` (`boolean | Promise<boolean>`) — **no State return**.

Both route config (`canActivate`/`canDeactivate`) and `addActivateGuard`/`addDeactivateGuard` accept `GuardFnFactory` which returns `GuardFn`.

**`GuardFnFactory` signature: `(router, getDependency) => GuardFn`** — same as `PluginFactory`.

```typescript
import { getLifecycleApi } from "@real-router/core/api";

const lifecycle = getLifecycleApi(router);

// WRONG - GuardFn can only return boolean
lifecycle.addActivateGuard(
  "admin",
  (router, getDep) => (toState, fromState) => {
    return router.makeState("login"); // TypeError! GuardFn returns boolean only
  },
);

// CORRECT - return boolean, use getDependency for DI
lifecycle.addActivateGuard("admin", (router, getDep) => (toState) => {
  return getDep("isAuthenticated") === true; // false blocks navigation
});

// CORRECT - ignore factory params if not needed
lifecycle.addActivateGuard("admin", () => (toState) => {
  return isAuthenticated(); // false blocks navigation
});
```

### areStatesEqual Ignores Query Params by Default

Query params live in `state.search` (RFC-4 M2 / #1548); `ignoreQueryParams` (default `true`) controls whether that channel participates. `state.params` (path) is always compared. Signature unchanged: `areStatesEqual(s1, s2, ignoreQueryParams = true)`.

```typescript
router.areStatesEqual(state1, state2); // Ignores state.search (query)
router.areStatesEqual(state1, state2, false); // Compares state.params AND state.search
```

**`undefined` is absence on both sides of the default merge (#1550 / #1551).** `mergeDefined` (`src/helpers.ts`) is the single owner of "route default UNDER the value": a key survives only when its winning value is defined. So a caller's explicit `undefined` means "I said nothing" and the route default keeps the slot (`navigate("x", {}, { page: undefined })` on `defaultSearch { page: "1" }` commits `page: "1"`, symmetric with the path channel), and a default that itself carries `undefined` behaves exactly like no entry (no `undefined`-valued own key ever reaches the frozen state, a codec, or `forwardState`'s result). The rule lives in the merge rather than in a separately-ordered normalize stage — that is what makes it order-insensitive and true for every producer (`makeState`, `pipeline/canonicalize`, `matchPath`, `buildPath`, `forwardState` source-layering). `normalizeParams` stays as the path-channel entry guard (it also collapses an empty bag to the `EMPTY_PARAMS` singleton, #1027).

**A route's own defaults are decided by the SLOT, and merged in exactly one place (#1549, superseded by `ba0f6b18b`).** `defaultParams` IS the path channel and `defaultSearch` IS the query channel, whatever the route declares. ⚠ For one release this paragraph said the opposite — that the `?`-declaration routed them, exactly as a hop's defaults were routed by the destination's — and that routing is gone; a `defaultParams` naming a `?`-declared key is REFUSED at registration instead, so the two slots can no longer compete for one key and there is no precedence left to state between them (the caller still outranks whichever default owns the slot). The merge itself has one implementation, `pipeline/canonicalize`, since Phase 4 folded `makeState` onto it; `RoutesNamespace.buildPath` and the `matchPath` rebuild reach that same implementation through the literal and resolving forms. One terminal is what keeps a `state.search` from contradicting its own `state.path`: the URL builders run BEFORE the state builders, so a merge living only in the latter would publish exactly that contradiction. Since Phase 2 (#1548) `buildPath` goes through the literal form like everyone else — the v1 single-bag skip it used to carry is retired, and the matcher's `search ?? params` fallback behind it is no longer reachable from any core producer (they all pass a defined query bag), so the query string is printed from the canonical query channel alone. What survives from #1578 is the RULE the skip kept breaking: **`buildPath` must agree with `navigate` / `makeState` / the `matchPath` rebuild on the same intent, and the href it prints must survive its own `matchPath`.** The literal form withholds a query default only for a name the route DECLARES with `?` (there, and only there, a params-bag entry is the retired twin competing for the slot); a default for a key declared nowhere, or for the path-slot half of a `/items/:id?id` collision, is never withheld — doing so re-opened the same href-≠-destination divergence one review later. Until #1549 each slot worked in exactly one position — a hop's `defaultSearch` was read by nobody, and a terminal's `defaultParams` for a declared query name stayed in the path bag, which made the P3 guard reject core's OWN state on `start()`.

**The ROUTER-level defaults have both slots too, and that one was not cosmetic.** `RouterOptions` carried `defaultParams` with no query twin, so the default route's query defaults could be spelled only in the path bag — and reached the URL only because the `forwardState` seam re-separated channels on the way through (stage ②, since deleted). Measured by neutralising that stage before removing it: a route's own `defaultParams` and a `forwardTo` hop's both survived it (their split lived in the pipeline, #1549/#1570), but the router option did NOT — `navigateToDefault` passed `undefined` in the query slot, so the key stayed in `state.params` and never printed. Deleting stage ② would have turned that into a silent regression with no correct spelling to migrate to and no test to catch it (the existing `navigateToDefault` coverage uses only UNDECLARED keys, which legitimately stay in `params`), so `Options.defaultSearch` shipped in the same commit as the spelling: resolved by the same `resolveOption` helper, static value or dependency-resolved callback like its siblings, and passed to `navigate` in the query slot. ⚠ Unlike a ROUTE's `defaultParams`, the router option is **not** refused at registration — `defaultRoute` and both default slots may be dependency-resolved callbacks, and the route they name need not exist yet — so a query key spelled there still surfaces at `navigateToDefault` time, through the seam's channel guard.

**One registry decides the channel, and it is the one that prints (#1556).** `RoutesNamespace.getQueryParams` (the input to the channel guard, the default merge and the mode gate alike) reads the matcher's `declaredQueryParams` — the very list `#buildQueryStringForBuild` prints from — minus the route's `urlParams`. It used to walk the route's `matchSegments` instead, which never contains the **root** node, so a key declared via `setRootPath("?lang&theme")` (how `persistent-params` declares its keys, `plugin.ts:48`) printed as a query param but classified as a **path** param: it landed in `state.params`, disappeared from `state.path` on the intent direction, and made `isActiveRoute` false in _both_ spellings for a link to the active page. The invariant is now structural — a key is separated into the query channel **iff** the build prints it — with one deliberate carve-out: a name that also occupies a path slot (`/items/:id?id`) stays path-owned in the params bag, and only an explicit `search` twin reaches the query channel (#843/#1549).

**A `forwardTo` chain's defaults obey the same rule as everyone else's — the SLOT is the channel (#1570, superseded).** For one release the chain fold routed a hop's `defaultParams` by the **resolved target's** declaration, splitting it through `separateChannels` / `getQueryParams`. That is gone with the rest of the routing: a hop spells its query defaults in `defaultSearch` exactly like a terminal route, and a `defaultParams` naming a key only the resolved target declares with `?` is refused at the `forwardState` seam (registration cannot see it through a dynamic `forwardTo`). The argument that justified the routing — "a hop can only spell a default in `defaultParams`, the single slot a route config gives it" — was false when written: the fold reads `defaultSearch` two lines above.

What survives from #1570 is the precedence rule, and it survives because it is about competition WITHIN one channel: **the caller beats the default.** Under the old split the default and a caller's params-twin landed in different channels, where no merge ranks them, and the seam (spreading `search` last) let the DEFAULT win — `navigate("src", { lang: "de" })` on a chain default `{ lang: "fr" }` committed `?lang=fr`. `undefined` is absence on both sides (#1550/#1551), so a removal marker does not count as "filled" and the default survives it. The cross-channel half of the withholding — the loop that declined a chain default because the caller had filled the same slot in the OTHER bag — died with the split it worked around, and was found dead by a coverage drop rather than by reading.

**Value comparison is provenance-tolerant, not `===` (#1554).** The URL direction parses query values (`?page=2` → `2` number, `?a=1&a=2` → `[1, 2]`, a path slot decodes to a string) while an intent keeps whatever the caller passed, so a strict comparison reported two states on the SAME location (byte-identical `state.path`) as unequal — an active link rendered inactive. `areParamValuesEqual` (`src/helpers.ts`, shared by `areStatesEqual` **and** `isActiveRoute`'s hierarchical `paramsMatch` branch) therefore treats values as equal when they print into the same URL: `string` / `number` / `boolean` by printed form (`2 ≡ "2"`, `true ≡ "true"`), arrays element-wise under the same rule, and a singleton array against a bare scalar (`["1"]` and `1` both print `?a=1`). `null`, `undefined` and objects stay strict — they print differently (`?a` vs `?a=` vs nothing), so tolerating them would equate different URLs. Storage is untouched: `state.search` keeps the mixed domain (URL → parsed, intent → as supplied); comparison is the single place that knows both domains describe one location.

### Hook Execution Order

For `users.profile` → `admin.dashboard`:

1. deactivate guard `'users.profile'` - innermost first
2. deactivate guard `'users'`
3. activate guard `'admin'`
4. activate guard `'admin.dashboard'` - innermost last

### Navigation Cancels Previous

```typescript
const p1 = router.navigate("users");
const p2 = router.navigate("admin");
// p1's internal AbortController is aborted, p1 rejects with TRANSITION_CANCELLED
```

### Plugins After start() Miss onStart

```typescript
await router.start("/home");
router.usePlugin(myPlugin); // onStart won't be called!
// Register plugins BEFORE start()
```

### `trailingSlash: "preserve"` + `rewritePathOnMatch: true`

Both options default to on. `matchPath()` rebuilds `state.path` via `buildPath()` (applying `forwardTo`, encoders, `defaultParams`) — then re-attaches the source path's trailing-slash choice via `matchSourceTrailingSlash()` in `RoutesNamespace/helpers.ts`. This honours `"preserve"` semantics without disabling the rest of the rewrite pipeline. The reverse case (matcher adds trailing, source had none) is unreachable with the current matcher's `undefined` trailing-slash mode.

## Performance Notes

### Navigate hot path (#307)

- **Optimistic sync execution** — guards run synchronously, async path deferred. No AbortController/Promise on sync path
- **FSM `send()` (table-driven, #1169)** — the NAVIGATE/LEAVE_APPROVE/COMPLETE transitions dispatch through the FSM table via `send()`, which fires the registered emit action; **`forceState()` is no longer called anywhere in core** — the bypass primitive was removed from the FSM engine (`src/utils/fsm`) outright, and `tests/functional/fsm-state-authority.test.ts` locks the invariant in two layers (the FSM engine exposes no `forceState`; a static scan of core `src` finds zero `.forceState` accesses). An invalid transition (e.g. `COMPLETE` after a listener's `stop()`/`dispose()`) is a table no-op, so the FSM is the sole authority over state and cannot be resurrected out of IDLE/DISPOSED. Deliberate trade-off (owner decision): ~+15–20% on `navigate/*` + one transition-payload allocation per navigation, bought for structural determinism (cancellation enforced by the state machine, not scattered re-checks). The pre-`setState` **commit-gate** in `NavigationNamespace` (active only when a listener window is reachable) rejects a navigation cancelled/terminated mid-flight before it commits
- **EventEmitter explicit params** — `emit(name, a?, b?, c?, d?)` instead of `...args` to avoid V8 rest-param array allocation
- **Cached error rejections** — pre-allocated `Promise.reject()` for SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND (zero alloc per rejection)
- **`getFunctions()` cached tuple** — `RouteLifecycleNamespace` returns pre-allocated `[deactivate, activate]` array (no alloc per navigate)
- **Segment array reuse** — `toActivate`/`toDeactivate` reuse arrays from `getTransitionPath()`
- **`buildNavigateState()`** — single-pass state construction through `src/pipeline`: one `canonicalize` (① forwardState seam + ③ defaults) feeding `buildURL` + `materialize`. Costs two object literals per navigation over the pre-pipeline form (the `Canonical` and `materialize`'s options bag); the merge itself still allocates nothing when the route has no defaults
- **Empty-params reuse** — `normalizeParams()` returns the shared frozen `EMPTY_PARAMS` singleton when nothing survives (empty input, or all values `undefined`), so `makeState`'s `params === EMPTY_PARAMS` branch reuses it: an empty-params navigation allocates **zero** transient `{}` (lazy allocation in `normalizeParams` + singleton reuse, #1027)
- **Freeze once, at the origin** — there is NO traversal (this line claimed "consolidated into one recursive traversal" long after the traversal was gone, #1599). `freezeStateShell` — renamed from `freezeStateInPlace`, which promised a depth it never delivered — freezes the state object's own level; the depth comes from each producer freezing its own output exactly once: `params` in `mergeWithDefault` (slow path) / `materialize` at the publication boundary (fast path, #1598), `search` from the `EMPTY_SEARCH` singleton or `admittedSearch`'s drop branch, `transition` + nested in `buildTransitionMeta`. Measured reason not to centralise: re-freezing an already-frozen object costs ~8 ns, so a walk would pay per node for work already done. Owned and pinned per producer — INVARIANTS "State immutability (who freezes what)"

### General

- States cached to avoid repeated freezing
- URL params cached per route name
- Lifecycle functions pre-compiled at registration
- Event listeners lazily created
- `nameToIDs()` has fast paths for 1-4 segments
- Route tree is immutable (Object.freeze) — cloneRouter() rebuilds from definitions (not shared)
- Router options are immutable — deep-frozen at construction (`OptionsNamespace`), safe to return directly
- `static #onSuppressedNavigateError` / `#onSuppressedStartError` — cached suppressor callbacks, one allocation per class (not per navigate/start); both share `#isExpectedRejection` for the silent-suppress classification
- Segment cleanup uses `Array.includes()` instead of `new Set()` (1-5 elements — linear faster)
- `createInterceptable()` — empty-array fast path skips iteration when no interceptors registered
- FSM `canSend()` — O(1) via cached `#currentTransitions`
- `getNavigator()` — WeakMap cache keyed by router, one frozen navigator per router instance
- `buildPath` options cached per router instance (`#cachedBuildPathOpts`) — the cache ignores its `options` argument after the first call, valid because router options are immutable per instance (see above); a dev-build `logger.warn` asserts against a future caller passing a varying `options` reference (`#cachedOptionsSource`, #957)
- `isActiveRoute`'s `forwardTo` arm (#1573) is gated tree-wide before it is gated per route (#1595). The per-route gate asks two `Object.create(null)` maps — V8 keeps those in **dictionary mode** whatever their size, empty ones included — and the pair measured ~14 ns, paid by every route in the tree for a feature only forwarding routes use, on the shape that reaches the gate: an INACTIVE link, i.e. most links on a page. `RoutesStore.hasAnyForward` answers first with one boolean load. The cost was NOT the `Object.hasOwn` form (a plain property read measured identical) but touching the dictionaries at all — two other candidate mechanisms, extracting the arm's tail and de-polymorphising `#matchesActiveState`, both measured null before this one. ⚠ Derived state: a stale `false` switches the arm off silently, so it moves only alongside `resolvedForwardMap` through `adoptForwardState`, pinned across every route-CRUD path by six mutationally-validated cases in `isActiveRoute.test.ts`. Measured: an inactive link 44.3 → 32.9 ns, 1.75× → 1.29× of pre-pipeline
- `canonicalize`'s fast-path gate is TWO facts, one per side — the CALLER brought no query bag, and the ROUTE carries no default on either slot — and between them stage ③ and the mode gate are provably identity (#1589). It used to carry a THIRD term, "the route declares no `?name`", which was redundant against the first: the mode gate filters the MERGED query bag, whose only sources are `defaultSearch` and the caller's bag, so an empty bag has nothing to drop however many names are declared. Established rather than argued — the term survived all 3808 tests (a mutation survivor with no behaviour behind it) and a 33-probe × 3-mode matrix over a `?`-declaring route with no defaults is byte-identical without it — while costing ~12 ns per call, because `getQueryParams` is a four-frame chain to a cached Map, not a Map read. Dropping it also widens the fast path to routes that declare query params but carry no defaults. ⚠ The two defaults are read ABOVE the gate deliberately: they are its route half AND the slow path's first input, so the fast path pays two hops and the slow path pays nothing extra. The alternative — one `port.mergesNothing()` predicate, defaults re-read below — was built and measured: indistinguishable on the fast arms (its single hop runs two `Object.hasOwn` calls, so it is not actually cheaper than two null-prototype reads) and **+10.6 % on the defaults path**, which is a fourth hop there. Measured against pre-pipeline `0fed89b` (medians of 9 alternating single-module processes, A/A floor ≤ 0.7 %): the pipeline's regression is 1.75–2.50× on the predicates, of which this recovers `isActiveRoute` −12.2 % / −12.8 %, `buildPath` −13.7 %, −16.8 % static, −19.9 % on a `?`-declaring route, `canNavigateTo` −8.2 % (now 1.06× — parity), and −0.3 % (wash) on the defaults path. The `isActiveRoute` sibling arm is untouched at 1.75×: it early-outs before `canonicalize`, so its residual is not the pipeline's to give back

### Async subscribeLeave overhead

- **0 listeners (hot path):** on the no-guards path `#handleNoGuardsLeave` runs only `sendLeaveApprove` + a `hasLeaveListeners()` check + a `navigationId` check — no `{nav}` context, no `LeaveState`, no `AbortController` (all allocated only when listeners exist)
- **N sync listeners:** AbortController created + released (not aborted on success, #722; ~5µs total with cleanup), frozen `LeaveState` object, N try/catch (V8 zero-cost on happy path), N×2 thenable checks
- **Lazy closures:** `isCurrentNav` / `emitLeaveApproveCallback` closures and the `{nav}` context are created inside the `if (hasGuards)` branch (or the async tail) only — not on the no-guards hot path
- **Benchmarks:** `navigate/leave-1` / `navigate/leave-3` in `tests/benchmarks/default.bench.ts` (gated tinybench + CodSpeed hot-path suite) — run via `pnpm -F @real-router/core bench`

## Code Conventions

### Adding New Methods

**Facade methods** (on Router class):

1. Add **validator** to `namespaces/XxxNamespace/validators.ts` (if new validation needed)
2. Add **instance method** to namespace (business logic)
3. Add **facade method** to Router.ts (`ctx.validator?.ns.fn()` → delegate)
4. Bind method in Router constructor if it accesses private fields

**Standalone API methods** (on `get*Api()` return objects):

1. Add **validator** to `namespaces/XxxNamespace/validators.ts`
2. Add **CRUD logic** as module-private function in `api/get*Api.ts`
3. Add **method** to the returned API object (`ctx.validator?.ns.fn()` → CRUD)
4. Access internals via `getInternals(router)` WeakMap

**Adding validation to a new method:**

- Call `ctx.validator?.ns.validateXxxArgs(...)` — optional chaining means no-op when plugin is absent
- Add the corresponding method to `RouterValidator` in `src/types/RouterValidator.ts`
- Implement the validator function in `namespaces/XxxNamespace/validators.ts`
- Wire it up in `validationPlugin.ts` (in the `@real-router/validation-plugin` package)

### Modifying Existing Methods

- **Validation changes** → update validator in namespace (`validators.ts`)
- **Logic changes** → update instance method in namespace or module-private function in `api/`
- Router.ts facade only **calls** validators, never implements validation logic itself

### Type Locations

| Type Kind        | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API types | `src/types/` — the `types/index.ts` barrel IS the `@real-router/core/types` subpath (also re-exported from the root `@real-router/core`) and the augmentation declaration-site (`declare module "@real-router/core/types"`). Folded from `@real-router/types` (wave-2, initially as `public-types/`, then consolidated into `types/`). **Augmentation invariant (#1540/#1519):** the augment-target interfaces (`StateContext`, `NavigationOptions`) are declared **lexically in `types/index.ts`** (not in `base.ts`) — TS merges a `declare module` augmentation only against the declaration-site of the resolved entry module; a re-export of any form is a silent no-op. To keep this true in `dist`, core's tsdown build is two-phase (JS bundled, dts unbundled — see `tsdown.config.mts`), and `scripts/check-dts-augment-targets.mjs` fails the bundle if the `types` entry dts loses the lexical declarations or a duplicate appears elsewhere. The type-only import cycle `index ↔ base/router/api` this creates is deliberate. **Gotcha:** the root exports the `Router` / `RouterError` **classes**, which shadow the same-named interfaces; import the `Router` **interface** (factory-param typing) from `@real-router/core/types`, not the root. |

### `Options<Dependencies>` vs `AnyOptions`

`Options` is **generic over the router's dependency map**, so the three resolver
callbacks (`defaultRoute` / `defaultParams` / `defaultSearch`) receive a typed
`getDependency`. Before that they defaulted to `object`, whose `keyof` is
`never`: every key was rejected, and the `defaultParams: (getDependency) => …`
form the wiki documents did not compile at all.

The generic deliberately does NOT spread. Two rules:

- **Resolves callbacks → takes `Options<D>`** — `createRouter`, the `Router`
  constructor, `OptionsNamespace`, `RouterInternals.getOptions` /
  `getCloneState`, `resolveOption`, `resolveDefault`.
- **Reads configuration → takes `AnyOptions`** — `PluginApi.getOptions`, the
  matcher, the URL builders, `NavigationDependencies` /
  `RouterLifecycleDependencies`. These never resolve a callback (that is
  `resolveDefault`'s job), so parameterising them would be noise in every
  namespace that has no dependency map to offer.

`AnyOptions = Options<never>`, and the `never` is load-bearing rather than a
shrug: `keyof never` is `PropertyKey`, so the erased accessor takes ANY key and
returns `never` — a wider parameter and a narrower return, exactly what
contravariance needs for `Options<D>` to flow in for every `D`.
`Options<object>` erases `keyof` to `never` instead and accepts nothing but
itself (measured: the assignment fails, the `never` one compiles). Every field
stays visible; only the callbacks become uncallable, which is honest — a plugin
has no dependency map to resolve them against. Verified across the whole
monorepo: 16 packages type-check with zero changes.

| Core-internal types | `src/types/internal.ts` — `RouterEventMap`, `Limits`; deliberately NOT re-exported by `types/index.ts`, so they never reach the subpath / root. Imported by core via `./types/internal`. (Was the old `src/types.ts` reshim, now deleted.) |
| Namespace-internal types | `namespaces/XxxNamespace/types.ts` |

### Test Coverage

100% coverage required. Use `/* v8 ignore next N -- @preserve: reason */` sparingly for:

- V8 tool limitations (async generator branches, ternary expressions in certain contexts)
- Race condition guards in async operators (tested but V8 can't track timing)
- Security guards (Object.prototype pollution checks)
- Transpiler artifacts (__awaiter detection)

**`@preserve` annotation convention:**

- Means "intentionally kept after v8 ignore audit — do not remove without re-auditing"
- Do NOT use for defensive guards against TypeScript-enforced invariants
- All `@preserve` blocks must have clear explanatory comments

### Mutation testing (Stryker)

Mutation score sits at ~90 % (`/mutation-score` skill; full record in `.claude/mutation-audit-2026-06-22.md`). **Do NOT chase 100 % by silencing survivors** — the honest ceiling is ~90–92 %. The remainder is structurally not worth disabling:

- **Entangled** — the same mutator has a _killed_ AND a _survived_ variant on one line (`CE→true` killed, `CE→false` survived). `// Stryker disable <Mutator>` would drop the kill. Un-silenceable by design.
- **Equivalents** — no test can kill them: cache short-circuit (recompute is identical), `>0→>=0` on an empty collection, `++→--` on identity-only ids, `{once}` listener redundancy, defensive-redundancy cancel-checks.
- **Validator-opt-in** — `ctx.validator?.…` branches are dead in core (validator is `null`), covered in `@real-router/validation-plugin`. Left documented (the comment says where they're tested), not disabled.

Rules:

- **`survived ≠ equivalent`.** Disable ONLY after proving equivalence empirically (manual mutation + full suite green). Multiple survivors here _looked_ equivalent but were killable — the `finally` controller-cleanup, cache _conditions_ (a stale-hit returns the wrong cached value), the `isActive` fast-path. Silencing an unproven survivor hides a real coverage gap — the exact anti-pattern mutation testing exists to catch.
- A **killable** survivor → close it with a **test** (that strengthens the suite), never a `disable`.
- A **proven** equivalent → `// Stryker disable next-line <Mutator>: reason`, listing only mutators with no killed sibling on that line. If un-targetable — entangled, or a `finally` body whose catch-`}` and `finally-{` share one line — document with a plain comment and leave it survived.
- Score is a proxy for test strength, not a target. Inflating it by silencing is net-negative.

### Promise-Based Navigation API

All navigation methods (`navigate`, `navigateToDefault`, `start`) return `Promise<State>`. Exception: `navigateToNotFound(path?)` is **synchronous** and returns `State` directly.

**`navigateToDefault()` Promise contract:** the method is not `async`. Synchronous throws from `deps.resolveDefault()` — a `DefaultRouteCallback` that throws, or a validator hook that rejects the callback's return value — are caught and converted to `Promise.reject`. Callers can rely on `.catch()` / `await` uniformly for both resolution and callback errors.

**`start(path)` requires a path string.** Core is platform-agnostic — the caller always provides the path. Browser-plugin overrides `start(path?)` to make path optional (injects browser location). When `allowNotFound: true` and path doesn't match, `start()` calls `navigateToNotFound(path)` (returns synchronous `State` wrapped in resolved Promise).

**`start()` rejection vs. committed state (#763).** `start()` commits via `navigateToState` _inside_ the interceptable `start` chain (`RouterLifecycleNamespace.start`), and plugin `start` interceptors (`ssr-data-plugin`, `rsc-server-plugin`) run their loader **after** `await next(path)` — i.e. after the commit emitted `TRANSITION_SUCCESS`. The facade's `.catch` therefore distinguishes two failure shapes by whether a state was committed (`this.#state.get()`):

- **Pre-commit failure** (route not found, an activation guard blocked the start navigation, a sync interceptor throw before `next()`): no `TRANSITION_SUCCESS` was emitted, so the half-started FSM unwinds back to IDLE (two-phase start) — `getState()` is `undefined`, `isActive()` is `false`.
- **Post-commit interceptor failure** (a loader throws after `next()` committed): subscribers already observed `TRANSITION_SUCCESS`, so core does **not** roll back — the committed state stands, `isActive()` stays `true`, and the loader error surfaces **only** via the rejected `start()` promise. Rolling back here would retract an observed success ("phantom success"). Plugins must not swallow the loader error (that violates "Loader errors propagate"); core owns the state-consistency half by keeping the commit.

**UNKNOWN_ROUTE state shape:** `{ name: UNKNOWN_ROUTE, params: {}, search: {}, path: "/the/url", transition: TransitionMeta }` — note: `params` and `search` are always `{}` (the URL is in `state.path`, not `state.params.path`).

**`UNKNOWN_ROUTE` export:** Available as standalone `import { UNKNOWN_ROUTE } from "@real-router/core"` and via `constants.UNKNOWN_ROUTE`.

Key types:

- **`GuardFn`**: `(toState, fromState, signal?) => boolean | Promise<boolean>` — guard type (boolean only, receives AbortSignal)
- **Removed types**: `ActivationFn`, `DoneFn`, `CancelFn`, `StrictDoneFn`, `MiddlewareFn`
- **Removed functions**: `safeCallback`, `parseNavigateArgs`, `parseNavigateToDefaultArgs`, `getStartRouterArguments`
- **Removed constants**: `CACHED_NO_START_PATH_ERROR`

Cancellation: Pass `{ signal }` via `NavigationOptions` for external `AbortController` cancellation. `router.stop()`, `router.dispose()`, and concurrent navigation cancel the in-flight navigation automatically. **The FSM is the single owner of cancellation.** Every source routes through FSM `CANCEL` (`stop`/`dispose` → `sendCancelIfPossible`; supersede / external `opts.signal` → `cancelNavigation`), and the `CANCEL` action (`handleCancel`) aborts the in-flight controller via the injected `abortController` effect — so the invariant **"FSM `CANCEL` ⟹ controller aborted (pipeline woken) + `TRANSITION_CANCEL` emitted"** holds atomically in one place. No source aborts the controller by hand. Aborting `#currentController` sets `signal.aborted`, which the async pipeline's post-race `isActive()` (`navigationId === myId && !signal.aborted && deps.isActive()`) detects regardless of the resulting FSM state (`READY` for external, `IDLE`/`DISPOSED` for stop/dispose, the superseding nav's `TRANSITION_STARTED` for supersede). The external `opts.signal` reason is threaded through `cancelNavigation(reason)` → the controller's `signal.reason` (#943). Before this unification the external-signal path only aborted the controller and left the FSM stuck in `TRANSITION_STARTED`/`LEAVE_APPROVED` (#1030) — `isTransitioning()` stayed true (route-CRUD silently blocked) and `isLeaveApproved()` was falsely true until the next navigation; the cross-source invariant property test (`tests/property/cancellation.properties.ts`) now locks recovery for every source × suspension point.
Guards receive `signal` as optional 3rd parameter for cooperative cancellation (e.g., `fetch(url, { signal })`).
**Non-cooperative guards are also bounded (#1018):** `#finishAsyncNavigation` races the guard completion against the controller's abort — `await Promise.race([guardCompletion, abortRace])`, where `abortRace` resolves on abort and the existing post-race `isActive()` check then rejects with `TRANSITION_CANCELLED`. So an async guard whose Promise **never settles** and ignores `signal` no longer wedges `navigate()` forever: `stop()`/`dispose()`/supersede abort the controller and the navigation rejects instead of hanging. Mirrors the leave-path protection `settleLeavePromises` (#663/#673). Consequence: when an abort precedes a slow guard's own verdict, cancellation wins — the navigation rejects `TRANSITION_CANCELLED` rather than waiting for the guard's `CANNOT_ACTIVATE`.
`AbortError` thrown in guards is auto-converted to `TRANSITION_CANCELLED`. A guard may also throw `RouterError(TRANSITION_CANCELLED)` directly to signal a quiet cancel — it is **preserved** (not re-coded to `CANNOT_ACTIVATE`/`CANNOT_DEACTIVATE`), so the navigation rejects with `TRANSITION_CANCELLED` and `onTransitionError` does **not** fire (#933). Any other thrown `RouterError` is still re-coded to the guard's `CANNOT_ACTIVATE`/`CANNOT_DEACTIVATE`.

## See Also

- [packages/validation-plugin/CLAUDE.md](../validation-plugin/CLAUDE.md) — Validation plugin architecture and validator namespaces
- [src/engine/CLAUDE.md](src/engine/CLAUDE.md) — Routing engine (merged route-tree + path-matcher + search-params, #1510)
- [src/utils/fsm/CLAUDE.md](src/utils/fsm/CLAUDE.md) — FSM engine internals (lifecycle + navigation state machine)
- [ARCHITECTURE.md](ARCHITECTURE.md) — this package's structure, pipeline wiring, subsystem boundaries
- [INVARIANTS.md](INVARIANTS.md) — property-based invariants per entry point
- [root ARCHITECTURE.md](../../ARCHITECTURE.md) — System design and package structure
- [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) — Infrastructure decisions
