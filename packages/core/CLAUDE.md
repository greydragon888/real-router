# @real-router/core

> **How to read this file.** It states what holds TODAY and points at the thing
> that enforces it. It carries no history: why a rule looks the way it does lives
> in the issue, the changeset and `IMPLEMENTATION_NOTES.md`, and a second copy
> here would go stale on its own schedule while sitting next to the code. It also
> carries as few numbers as possible — a count written twice rots twice, so where
> a test owns one, the test is named instead.

## Architecture

### Namespace-Based Design

Facade + namespaces:

```
Router.ts (facade)
    ├── RoutesNamespace         — route tree, path operations, forwarding
    ├── StateNamespace          — state SERVICE (the pair itself lives in the FSM context)
    ├── NavigationNamespace     — navigate(), transition pipeline
    ├── OptionsNamespace        — router options
    ├── DependenciesNamespace   — dependency injection (plain store, not a class)
    ├── EventBusNamespace       — FSM + EventEmitter encapsulation, events, subscribe
    │       └── routerFSM       — FSM instance (lifecycle + navigation state)
    ├── PluginsNamespace        — plugin lifecycle
    ├── RouteLifecycleNamespace — canActivate/canDeactivate guards
    └── RouterLifecycleNamespace — start/stop

src/pipeline/ (navigation delivery — three primitives over one opaque type)
    ├── canonicalize(port, name, params, search?, opts?) → Canonical  — ① forwardTo + ③ route defaults
    │        opts.resolveForward: false → the LITERAL form (the route NAMED, no chain, no seam)
    ├── buildURL(canonical, port)           → string  — ⑤a
    ├── materialize(canonical, path)        → State   — ⑤b, frozen
    ├── materializePending(canonical, path) → State   — ⑤b, writable shell
    └── RouteResolver                                 — the port the router implements at wiring time

src/channels/ (channel correctness — one rule, three mechanisms)
    ├── guard      — findMisChanneledKey · assertChannelCorrect · misChanneledKeyMessage
    ├── defaults   — assertRouteDefaultChannels · withholdFilledSlots
    └── modeGate   — admittedSearch

api/ (standalone functions — tree-shakeable)
    ├── getRoutesApi(router)       — route CRUD
    ├── getDependenciesApi(router) — dependency CRUD
    ├── getLifecycleApi(router)    — guard management
    ├── getPluginApi(router)       — plugin management
    └── cloneRouter(router, deps)  — SSR cloning
```

`src/channels` is a subsystem rather than a namespace method because the rule has
no owning module, and it imports nothing from the namespaces, the engine or the
pipeline — declared query names arrive as DATA, never as a matcher, enforced by a
`no-restricted-imports` boundary in `packages/core/eslint.config.mjs`. Canon:
[src/channels/CLAUDE.md](src/channels/CLAUDE.md).

**SSR/SSG/hydration helpers live outside core**, in `@real-router/ssr-utils`.
They consume core through its public subpaths only. ⚠ The
`@real-router/core/utils` specifier is live and holds something else entirely —
`putField` / `copyFields` / `freezeThrownError`, core's discipline primitives.

**Hydration scratchpad**: `RouterInternals.hydrationState` is `null` outside
`hydrateRouter`. SSR loader plugins read it from inside their `start` interceptor
and reuse the parsed value instead of invoking the loader. Single-shot — only the
first `start()` consumes it.

**RouterFSM states**: `IDLE → STARTING → READY ⇄ TRANSITION_STARTED → LEAVE_APPROVED → READY | DISPOSED`

`DISPOSE` is wired from every non-DISPOSED state, so the FSM always settles at
`DISPOSED`. Healthy flows route through `IDLE`; the direct edges are the safety
net for a router that cannot be returned there. `STARTING` also accepts
`STOP → IDLE`, so a `stop()` while `start()` is parked in an async interceptor
cancels the start.

All router events are consequences of FSM transitions, never manual calls. No
boolean lifecycle flags.

**The table owns the committed state.** `current` / `previous` are fields of
`RouterFSMContext`, written by four edge `update`s and nothing else — `readonly`
there, so a foreign write is `TS2540`. Writer set derived by
`committed-state-authority.test.ts`.

⚑ **`SYSTEM_COMMIT` is a tenth event with exactly ONE edge, on `READY`.** It
carries the two commits that are not transitions — `navigateToNotFound`'s bypass
and the `replace()` revalidation. A `send` with no edge is a silent table no-op,
which is why the commit sites ask `canSend` first and throw.

⚠ **There is no `READY → FAIL` edge, and its absence is deliberate.** Early
validation errors and the plugin-facing `emitTransitionError` are REPORTS to
observers rather than failures of a transition, so they emit directly.
`STARTING --FAIL--> IDLE` stays unconditional — that is how a failed `start()`
unwinds.

### Navigation pipeline (`src/pipeline/`)

`canonicalize` is the **sole producer** of `Canonical`; `buildURL` / `materialize`
physically accept nothing else, because the brand is a `unique symbol` that is
never exported. Two compositional forms:

- **class ①** resolves `forwardTo` through the seam — `navigate`, `matchPath`,
  `canNavigateTo`, `buildNavigationState`;
- **class LITERAL** (`{ resolveForward: false }`) answers about the route it was
  NAMED — `buildPath`, `isActiveRoute`'s first arm, `makeState`.

`navigateToNotFound` is the one deliberate exception: it wraps a URL string rather
than building a state from an intent, so it has no channels to canonicalise.

Canon: [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md).

**The slot IS the channel.** `defaultParams` is the path channel, `defaultSearch`
the query channel, in every position; the router moves nothing between them.
`params` and `search` meet in exactly one place — the printed URL. Two checks,
split by what is knowable when:

- **Registration** — `assertRouteDefaultChannels`, an always-on core guard: a
  route's own `defaultParams` naming a key the route declares with `?`. Both sides
  are known at every registration door, so it fails at config time with the slot
  to move to, and every door runs it prepare-then-commit.
- **Resolution** — the `forwardState` seam: a hop's `defaultParams` naming a key
  the TARGET declares, which registration cannot see through a dynamic
  `forwardTo`. The error names the key, the route, and the route the caller
  actually named.

Stage ③ (route default UNDER the caller's value) has exactly ONE implementation,
`canonicalize`. Channels are frozen at merge time, independently of the
`materialize` / `materializePending` split, which defers only the state freeze.

### Validation Pattern

Two tiers: **invariant protection** in core, and **DX validation** opt-in via
`@real-router/validation-plugin`, which installs a `RouterValidator` into
`RouterInternals.validator`. Facade methods and standalone API functions call
through it with optional chaining, so it is a no-op when the plugin is absent:

```typescript
buildPath(route: string, params?: Params, search?: SearchParams): string {
  const ctx = getInternals(this);
  ctx.validator?.routes.validateBuildPathArgs(route);
  ctx.validator?.navigation.validateParams(params, "buildPath");
  return ctx.buildPath(route, params, search);
}
```

The validator is namespaced by concern (`routes`, `navigation`, `state`,
`lifecycle`, `dependencies`, `plugins`, `options`, `eventBus`).

**Lifecycle:** registered before `router.start()` — throws
`VALIDATION_PLUGIN_AFTER_START` otherwise; installs the validator and runs a
retrospective pass; `unsubscribe()` sets `ctx.validator = null`.

**`@real-router/core/validation` is the plugin's ONLY door to the engine.** It
re-exports `validateRoute` plus the `Matcher` / `RouteTree` types, so the plugin
never imports `src/engine` directly. A guard test in the plugin blocks
re-coupling.

**Validation runs on the RAW argument, before interceptors** — which is why
`validateStartArgs` deliberately permits `undefined`: a browser-plugin
interceptor fills the path in downstream.

### Invariant Guards (always active, no plugin required)

Five, and the criterion for a sixth is **(a)** silent corruption or **(b)** a
deferred crash in a user-facing API.

- **`subscribe(listener)`** — `typeof listener === "function"`, so a non-function
  cannot reach the emitter and crash on the next navigation. `subscribeLeave`
  validates the same way, without the `@real-router/rx` hint.
- **`navigateToNotFound(path)`** — `typeof path === "string"`. ⚑ **Nothing commits
  before the start navigation does, and that is the WINDOW's rule rather than this
  primitive's**: there the call is refused, because a 404 landing in that window
  is a phantom the boot overwrites a tick later. A `navigateToNotFound` from a
  guard OF the start navigation still commits — it aborts that navigation first.
  The window covers the navigate family too, held by two mechanisms rather than a
  predicate: a counted dispatch (`#assertNotReentrant`) and the table itself,
  since neither `NAVIGATE` nor `SYSTEM_COMMIT` is declared on `STARTING`. The
  refusal sites name the phase, because a bare `NOT_STARTED` reads as "you forgot
  to call `start()`" to a caller who is inside `start()`.
- **`start(path)`** — `typeof path === "string"`, AFTER the interceptor chain, so
  a browser-plugin's location injection still wins. Turns a cryptic `codePointAt`
  crash into `[router.start] path must be a string`.
- **`claimContextNamespace(namespace)`** — throws
  `CONTEXT_NAMESPACE_ALREADY_CLAIMED` on a second claim, `TypeError` on a
  non-string or empty namespace. `claim.write` goes through `putField`, so a
  namespace lands as a genuine own key whatever the prototype chain says. The
  record stores the CLAIM, and both `write` and `release` verify they are still
  the holder, so a released claim is inert rather than acting on whoever
  re-claimed the namespace after it (#2059 / #1929). Writing a namespace you do
  not hold is still possible through the documented `state.context[ns] = value`
  escape hatch — the claim was never the only door, only the owned one.
- **channel guard** — `params ∩ queryNames(name) ≠ ∅`: a key the route declares as
  a **query** param supplied in the **path** bag. A **detector, never a
  normaliser**, with two positions and deliberately different reactions:
  - **P3 — `navigateToState` REJECTS** (`WRONG_CHANNEL`): rejected promise plus
    `TRANSITION_ERROR`, mirroring the `ROUTE_NOT_FOUND` guard beside it, because
    URL plugins call it from popstate handlers and a new sync throw would change
    an existing method's failure shape. `start()` commits through the same
    primitive, so the guard sits on every start including SSR hydration.
  - **P1 — `navigate` / `makeState` / `buildNavigationState` THROW** a
    `TypeError`, synchronously, on the caller's RAW argument. This is an
    argument-shape defect at the API boundary; rejecting would let a `.catch()`
    written for navigation failures swallow a programming error.
  - `undefined`-blind **by VALUE** — an `undefined`-valued key is the documented
    removal marker, not a mis-channel; inherits the `/items/:id?id` carve-out from
    `getQueryParams`; short-circuits on a route with no query declarations; and
    **never becomes the thing that throws** — an accessor-backed bag whose read
    throws is left to the consumer that actually needed the value.
  - ⚠ An **absent BAG** is a separate fact from an absent value, and both spellings
    count: `undefined` and `null`. `navigate(name, null)` is supported runtime
    input while the signature admits neither, so the predicate tests for it
    explicitly — without that arm `Object.hasOwn` performs `ToObject` and the
    guard becomes the thing that throws (#1822). The rule is not the guard's
    alone — `normalizeChannel` carries it for `buildPath` and `isActiveRoute`,
    which reach it without passing the guard, and `adoptForeignBag` for a State
    handed in from outside. INVARIANTS "Supported input shapes" #5 owns the rule
    and names what guards it.
  - ⚠ It does **not** run on the predicates: a SCAN over the caller's bag on every
    `<Link>` render, for a condition almost always absent, whose reaction is a
    throw into a render. `canNavigateTo` is not blind regardless — it consults the
    same predicate and answers `false`.

**Param-value type validation stays opt-in.** Bare core tolerantly accepts values
that cannot round-trip through a URL path (a `Symbol` path param, a lossy
`BigInt`, a percent-encoded control char). These are exotic programmer errors, so
the plugin rejects them rather than core paying a per-navigate value scan.

### A route name is read as a property key (#1876 / #1881)

A route name reaches core's tables as a PROPERTY KEY, and `ToPropertyKey` runs
`toString` on anything that is not one — so a non-string name is a call into
application code, and a value that answers differently between reads is admitted
as one route and indexed as another.

`ARCHITECTURE.md` **"Route-Name Type Gates"** owns the rule that decides which
doors carry a gate: a **stably-coercing** non-string must already do damage there
— run application code as a side effect, or produce an object whose own fields
disagree. A door that merely answers what the value's `toString` named does not
gate. A gate is not an invariant guard: it answers the door's own closed answer
and never throws.

- **Gated — `defaultRoute`.** `navigateToDefault()` rejects `ROUTE_NOT_FOUND`
  without reading the value, because the forwarding arm otherwise **navigates** to
  the target — a transition nobody requested. The callback form is untouched.
  ⚠ The gate exists for BARE core; with the validator installed the `navigate`
  seam refuses the same value first. What the validator cannot do is answer at the
  CALL, since `navigateToDefault()` takes no name argument.
- **Not gated, and no predicate may be re-introduced** — `isActiveRoute`,
  `forwardState`, `buildNavigationState`, `navigate({ name })`, `canNavigateTo`.
  Each answers exactly what the coercion named, which is what degrading means
  here; read counts and answers are pinned by
  `tests/functional/canonical-name-read-once-1883.test.ts`.
- **The damage side is closed by a COERCION rather than a gate.**
  `pipeline/canonicalize` performs ONE `ToPropertyKey` for every producer that
  reaches it, so `buildPath` and `makeState` answer what their first read named.
  ⚠ The terminal is shared, and that is the whole design: a GATE there would have
  turned `isActiveRoute`'s `true` into `false` and re-introduced a predicate that
  was deliberately reverted.
- ⚠ **The four `getLifecycleApi` guard doors carry a gate (#1888)** — a
  non-string name is refused at **0** reads, with the message the route-CRUD
  doors give: one wording, one home, `assertRouteNameIsString` in
  `src/guards.ts`. A registration door returns nothing, so it has no answer to
  degrade into; what it would otherwise hand the caller is silence.
- ⚠ **The `@@` half of `assertNoInternalRouteName` is deliberately NOT borrowed
  there.** Guarding a system route is a declared capability —
  `addActivateGuard("@@router/UNKNOWN_ROUTE", …)` is asserted valid on both add
  doors — so only the type check is extracted, and the prefix rule stays with
  route-CRUD.
- ⚑ **`getPluginApi().addEventListener` is the fifth door of the same shape**,
  and its predicate is MEMBERSHIP rather than a type check: the valid set is
  closed and `events` declares it, so core derives the seven from that constant
  and `@real-router/validation-plugin` derives its own set from the same one.
  That closes the typo a route-name type check cannot, which is why the two
  doors do NOT share a backstop.
- ⚑ **A read-count instrument is the wrong tool for this family** — these doors
  coerce zero times either way. The discriminating cell is the refusal itself
  plus a string control that still installs a guard which RUNS, both in
  `tests/functional/api/getLifecycleApi/non-string-name-1888.test.ts`, which
  also pins that a refused registration compiles nothing.
- **The five route-CRUD doors refuse a non-string name at zero reads** and always
  did, because `assertNoInternalRouteName` is a string method. Its type check
  exists so the refusal names the door; the wording is validation-plugin's, byte
  for byte, pinned by that plugin's `bare-core-message-parity.test.ts`.
- **Unguarded at either level:** the exported `resolveForwardChain` coerces and
  resolves the chain, returning what it would have returned for the string — a
  free function with no validator seam. One read at entry, and one per HOP.
- ⚠ **A DEPENDENCY name is a different channel.** Every door there coerces ONCE
  and uses that key for the check, the old-value read, the diagnostic and the
  write. No gate on any of them, and a **symbol** name is exempt from the
  coercion entirely — a symbol IS a property key, so nothing drifts. This family
  HAS a validator seam: `validateDependencyName` refuses a non-string at zero
  coercions.

⚠ Do not restate any of this as "every entry point that takes a route name". It
was written that way once, from a sweep that was never enumerated, and three doors
refuted it.

### The mode gate — always-on, but a NORMALISER (#1575)

The channel guard **detects and never moves**; the mode gate **fixes and never
reports**.

One rule, all three `queryParamsMode` values, both directions: _a key the active
mode does not PRINT does not enter the canonical query channel._ That buys
`keys(state.search) ⊆ keys(matchPath(state.path).search)` in every mode.

- A **DROP, not a move** — the key does not fall back into `state.params`.
- Applied **after** the default merge, so a `defaultSearch` for a key the route
  does not declare with `?name` is dead config under `default` / `strict`.
- Wired at ONE terminal, `pipeline/canonicalize`, which every producer reaches.
  `loose` short-circuits, so the repo default pays nothing.
- **The diagnostic fires from every producer, predicates included, and that
  uniformity IS the design.** It speaks only when a key was actually DROPPED —
  i.e. only when the answer just returned is missing what the caller asked for.
  De-duplicated per route+key. ⚠ Pinned by "feeds the gate from EVERY producer" in
  `undeclared-query-mode-gate.test.ts`, the only test that fails on a mutant that
  silences one producer.
- **The message names the route and the key, deliberately not the PRODUCER** —
  under the de-dup that ships with it the name would be whichever producer ran
  first, asserting a locality the de-dup has already destroyed.
- The pipeline reads the decision through one boolean port accessor,
  `admitsUndeclaredQuery()`.
- **The REPORT presupposes the route exists.** The drop does not, but announcing
  "key `q` is not declared on route `nope`" about a route that is not a route
  blames the query for a typo in the ROUTE name. Both diagnostics gate on
  `pathNames(name) !== undefined`.
- Silent in bare core; the plugin's `reportDroppedQueryKey` makes it visible,
  de-duplicated per route+key **per router**, so an SSR clone is not silenced.

**A key declared NOWHERE keeps its params-bag home**, with an opt-in diagnostic.
It stays in `state.params` as app-level data — the state does not round-trip
through its own `state.path`, and that consequence is real. Core does NOT drop it:
dropping retires a shipped capability, and the "declared nowhere" predicate cannot
separate a typo from `navigate("users", { id })` on a parent route whose CHILD
declares `:id`. The diagnostic is opted into by the COMMITTING producers rather
than inferred from the compositional form, so no predicate pays it on the render
path.

**What each mechanism does on the RENDER path.** Read this before writing
"predicates are not …" anywhere:

| Mechanism                       | On predicates?                     | Why                                                                                                                                           |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Channel guard**               | **No** — never runs there          | A SCAN for a condition almost always absent, on every render, whose reaction is a throw into a render. `canNavigateTo` still answers `false`. |
| **Mode gate**                   | **Yes** — every producer           | Speaks only when a key was DROPPED, so the cost lands on the broken call. De-duplicated per route+key.                                        |
| **Undeclared-param diagnostic** | **No** — committing producers only | Nothing is lost; the advice is about round-tripping a state you are about to commit, and a predicate commits nothing.                         |

The discriminator is **loss**: report where information was destroyed, advise only
where something will be committed, and never scan the render path for an absence.

### Namespace Folder Structure

```
namespaces/RoutesNamespace/
├── RoutesNamespace.ts   — class with instance methods
├── routesStore.ts       — plain data store (interface + factory)
├── forwardChain.ts      — forwardTo chain resolution
├── constants.ts · helpers.ts · types.ts · index.ts
└── routeGuards.ts       — in-flight guards for the destructive doors,
                           plus warnRemovalDuringNavigation, a REPORT called AFTER the removal
```

**Store pattern:** `RoutesStore` and `DependenciesStore` are data-holder
interfaces, not classes. `RoutesStore` deliberately carries cross-namespace
references set during wiring, so the standalone CRUD helpers reach the lifecycle
namespace without threading a parameter through every helper. It is the api/
layer's transport channel, not inert data.

### Dependency Injection

Namespaces are constructed independently and wired by `wireNamespaces()`.
`setDependencies()` is a **pure assignment**, so the `wire*` call order is
arbitrary.

**Initial-route guard factories flush last** — `flushPendingGuards()` is the final
constructor step, so a factory sees a fully-built router and read-only calls are
safe. **Contract: a guard factory must be side-effect-free with respect to the
router.** Factories re-execute on the REGISTRATION paths (`cloneRouter`,
route-CRUD), so any side effect duplicates. A factory throw disposes the instance,
so a leaked router reference is fail-closed.

⚑ **A factory does not run inside a commit.** `completeTransition`'s post-leave
cleanup and `replace()`'s swap both READ a stored compiled form instead of
re-running the factory, so no application code is in either window. Locked by
`guard-factory-compiled-once-1649.test.ts`, which counts factory invocations
across a navigation and expects zero.

### Plugin Interception Points

```typescript
const api = getPluginApi(router);
api.addInterceptor("forwardState", (next, name, params) => ({
  ...next(name, params),
  params: mine,
}));
api.addInterceptor("start", (next, path) =>
  next(path ?? browser.getLocation()),
);
```

`InterceptableMethodMap` covers `start`, `buildPath`, `forwardState`. Multiple
interceptors run LIFO. Returns an unsubscribe.

**On `forwardState`, `next()` hands back a core-owned SNAPSHOT.** Both channel
bags are stripped of `"__proto__"` and copied into a fresh literal at every hop,
because merging the result is this seam's documented idiom and an own
`"__proto__"` riding through swaps the merging plugin's own prototype. Spread it
as before; do not rely on its identity.

**An interceptor may NOT start a navigation.** The four navigation entry points
called from a `forwardState` / `buildPath` interceptor, a route's `encodeParams`
or dynamic `forwardTo` callback, an option callback, or the `$start` dispatch
throw `REENTRANT_NAVIGATION` synchronously. Defer instead.

- ⚠ **`decodeParams` is NOT in that list** — it serves the URL→state direction and
  runs from `matchPath`, which prepares no navigation.
- Not affected: a **guard** (it runs after the announce, so the classic
  guard-redirect stays an ordinary supersede) and `matchPath()`.
- ⚑ The two halves throw the same code with DIFFERENT messages, because "you are
  inside a listener" is false in the pre-start window. Locked by an AST scan over
  `src` (`reentrancy-ban-messages.test.ts`), so a third ban cannot ship bare.

A **`start` interceptor is async** and must return a `Promise<State>`. One that
returns neither `next(...)`'s result nor a thenable is a misuse: `Router.start()`
rejects with an actionable `TypeError` rather than leaving the FSM stuck in
`STARTING`. ⚠ The sync interceptors have no analogous normalisation — same class,
tracked as a follow-up.

### Router Extension via `extendRouter()`

```typescript
const removeExtensions = api.extendRouter({ buildUrl, matchUrl });
router.buildUrl("users", { id: "1" }); // via declare module augmentation
removeExtensions();
```

Throws `PLUGIN_CONFLICT` if a key already exists; validation is atomic — all keys
are checked before any are assigned. Extensions are tracked in
`RouterInternals.routerExtensions` and removed on unsubscribe, with a
`dispose()`-time safety net.

---

## Key Concepts

### State is Immutable

States are deeply frozen. Never mutate, always create new.

**Exception — `state.context`** is intentionally not frozen: plugins write
per-route data into it via `claimContextNamespace()` + `claim.write(state, value)`
after creation. The `context` SLOT is frozen (reassignment throws); the object it
points to is not. So "deeply frozen" holds for `name` / `params` / `path` /
`transition`, with `context` the documented carve-out the whole mechanism depends
on.

Who freezes what is owned per producer and pinned by INVARIANTS "State
immutability" — there is no traversal, and re-freezing an already-frozen object is
why a central walk was rejected.

### Router Lifecycle: dispose()

Permanently terminates the router; unlike `stop()` it cannot be restarted, and it
is idempotent.

**Cleanup order**: abort navigation → cancel transition → stop → FSM `DISPOSE`
(**the committed pair is zeroed here**) → clearAll (events) → plugins → router
extensions → context claims → interceptors → routes → lifecycle → deps →
markDisposed.

⚠ **`getPreviousState()` is `undefined` inside a plugin's `teardown()`** — the
zeroing rides the `DISPOSE` edge, several steps earlier. `getState()` was already
`undefined` there, since `dispose()` routes through `stop()`.

After dispose every mutating method throws `ROUTER_DISPOSED`.

### Cloning Semantics (SSR)

`cloneRouter(router, deps?)` builds an independent router for per-request
isolation — one base per process, one clone per request. Always constructed fresh
(FSM `IDLE`, no committed state); cloning a disposed router throws.

| Subsystem                      | Clone behavior                                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route tree                     | **Rebuilt** from serialized definitions — not shared                                                                                                                                         |
| Root path                      | **Carried over**, so the clone builds and matches under the same sub-path                                                                                                                    |
| Options                        | Shallow spread with three substitutions: the clone's own logger config, the base's snapshotted `urlParamsEncoding` key, and the base's resolved `limits` restricted to the KEY SET it passed |
| Dependencies                   | **Shallow merge** through `ingestDependencies`, the same door the constructor uses. ⚠ An explicit `undefined` from the caller is ABSENCE, not a removal marker                               |
| Config (codecs / defaults / …) | `Object.assign` shallow — per-route objects **shared by reference**, copied BEFORE guards and plugins so re-run factories see the full config                                                |
| Lifecycle guards               | Re-registered **preserving origin**; effective guard is **external-wins**, so the clone runs the same guard as the base                                                                      |
| Plugins                        | Factories re-run — fresh instances, fresh `state.context` claims                                                                                                                             |
| State / FSM / emitter / claims | **Reset** per clone                                                                                                                                                                          |

⚠ **The `limits` substitution carries the base's KEY SET, not the whole resolved
bag** — materialising the unset defaults puts `warnListeners: 1000` beside a small
`maxListeners`, a pair `validation-plugin` refuses at install.

**Shared-by-reference is intentional.** A `Map`, class instance or nested object in
`base.dependencies` is the SAME instance in every clone. `structuredClone` is
deliberately not applied — it breaks class instances, functions, singleton pools
and circular refs. Rule: **singletons → `base.dependencies`; per-request mutable
state → the `deps` override** (or `createRequestScope`).

⚠ **Guard-factory closures are shared** — do not capture per-request state in a
guard registered on the base router.

**Not re-applied on the clone:** `extendRouter` / `addInterceptor` called OUTSIDE a
plugin factory. Full reference: `wiki/clone.md`.

**Per-clone footprint** ≈ a fresh `createRouter(routes)` of the same size, because
the clone rebuilds its own tree and matcher precisely so route-CRUD on a clone
never touches the base. Guarded by
`benchmarks/audit-probes/clone-router-2026-05-22/probe-09-memory-footprint.ts`.

### Enhanced State Object: TransitionMeta

```typescript
state.transition;
// { reload?, replace?, redirected?, phase, from, reason, blocker,
//   segments: { deactivated, activated, intersection } }
```

`replace` is also auto-modified by core; `redirected` is **only ever what the
caller passed** — core never sets it, not on a `forwardTo` and not on a guard
redirect. `blocker` is reserved. `TransitionMeta` and its nested objects are
deeply frozen.

#### `transition.replace` vs `state.context.navigation.navigationType`

They measure different things from different sources and coexist.

| Question                     | Core portable signal                         | navigation-plugin only          |
| ---------------------------- | -------------------------------------------- | ------------------------------- |
| replace?                     | `transition.replace === true`                | `navigationType === "replace"`  |
| reload?                      | `transition.reload === true`                 | `navigationType === "reload"`   |
| redirect?                    | **Not answerable** — only what caller passed | —                               |
| traverse (browser back/fwd)? | **Not covered**                              | `navigationType === "traverse"` |
| push?                        | by elimination                               | `navigationType === "push"`     |

Read `transition.*` for what the caller asked; read the plugin field for how the
browser classified it. `shared/dom-utils/scroll-restore.ts` reads both, and
dropping either side silently regresses one case.

### Transition Pipeline

Guards run synchronously until one returns a Promise, then the pipeline switches
to async.

```
router.navigate(name, params, search, opts)
  ├── build target state · same-state check · liveness snapshot
  ├── FSM send(NAVIGATE) → action emits TRANSITION_START
  ├── IMMEDIATE PATH (!hasGuards && !suspendable):
  │     completeImmediate() → sendLeaveApprove + completeTransition
  │     the cancellation machinery is ABSENT here, not skipped — no controller,
  │     no liveness closure, no commit-gate, and the return is a bare State
  ├── Guard pipeline: deactivate (inner→outer) · LEAVE_APPROVE · activate (outer→inner)
  ├── SYNC PATH:  completeTransition() → send(COMPLETE) → commit + TRANSITION_SUCCESS
  └── ASYNC PATH: finishAsyncNavigation() → await → completeTransition()
```

On error at any step: `emitTransitionError()` → `Plugin.onTransitionError()` → the
promise rejects with a `RouterError`.

**Cached error fast paths.** `SAME_STATES`, `ROUTER_NOT_STARTED` and
`ROUTE_NOT_FOUND` return pre-allocated rejections. ⚑ **Every `RouterError` core
throws is frozen at the throw**, and so are the ones raised by the three doors
outside core (`usePlugin` after start, an unmatched popstate, a Navigation API
rollback); the primitive is published as `freezeThrownError` on
`@real-router/core/utils`. Internal rule: **never mutate a caught error you do not
own** — `rethrowAsRouterError` re-codes a copy.

**`navigateToNotFound()` bypasses the pipeline, but not the machine and not the
guards.** It emits only `TRANSITION_SUCCESS`, takes a `SYSTEM_COMMIT` edge, and
**asks the current route's `canDeactivate`** — leaving is still leaving, and this
is the primitive URL plugins call on an unmatched Back. A refusal throws
`CANNOT_DEACTIVATE`; an async guard cannot be answered synchronously and resolves
to **refuse**, the fail-safe direction for a guard whose job is preventing loss.

⚑ **`replace()`'s revalidation opts out of `canDeactivate` on every arm, and that
is a RULE rather than two exceptions.** A tree swap is an operation the
application performed, not a departure the user chose, and there is no "stay"
branch to offer. The three arms call `revalidateToNotFound`; the departure path
calls `navigateToNotFound`, so no shared entry takes a flag.

**Fire-and-forget safety.** `navigate()`, `navigateToDefault()` and
`navigateToState()` suppress unhandled rejections for expected errors, so calling
them without `await` is safe. A guard block is an expected outcome — `await` the
call or observe it through `onTransitionError`.

### NavigationNamespace File Structure

```
namespaces/NavigationNamespace/
├── NavigationNamespace.ts  — the four entry points, their #settle checkpoint, the DI bag
├── constants.ts · types.ts · index.ts
└── transition/
    ├── executeNavigation.ts   — executeNavigation + the two-pass prologue, completeImmediate,
    │                            finishAsyncNavigation, handleNoGuardsLeave, abortPreviousNavigation
    ├── guardPhase.ts          — executeGuardPipeline, runFrom, resumeFrom, runPhase, runStep
    ├── completeTransition.ts  — completeTransition, buildTransitionMeta
    ├── navigateToNotFound.ts  — the one commit primitive that is NOT a transition
    └── errorHandling.ts       — handleGuardError, routeTransitionError, resolveAsyncGuard
```

**The namespace holds no per-navigation state.** The controller is a field of the
plan, which the machine carries as `ctx.inflight`, so the `CANCEL` action reaches
it by identity and every signature here is over `(deps, plan)`.

⚠ **Ownership is TRANSITIVE, and that is what closes a parity gap rather than only
shortening the code.** A router-level slot has a lifetime of its own and has to be
nulled on the way out; a field of the plan dies with the navigation the machine is
carrying, so neither "the `CANCEL` action found the slot empty" nor "the
guard-free arc's controller was invisible to the failure handler" is expressible.
Pinned by `controller-ownership-1684.test.ts`, whose guard arc is the CONTROL.

⚠ **The controller is allocated CONDITIONALLY**, because an external
`opts.signal` or a pre-commit listener makes a navigation suspendable without
giving it anything to hand a signal to. Filling the slot for every navigation is a
measured regression. Pinned by `controller-allocation.test.ts`, which COUNTS
allocated controllers. ⚑ They all go through one door, `openController`, so a
controller opened after the machine cancelled the navigation is born aborted from
the recorded `cancelReason` — and the door is idempotent.

**Guard pipeline — one program, two interpreters.** Three fixed phases walked by a
cursor of two numbers: `runFrom()` walks synchronously until a step hands back a
Promise and returns a `Suspension` saying where; `resumeFrom()` settles it and
hands the cursor back. `runPhase()` applies the phase short-circuit — which
carries `opts.forceDeactivate`, so it is contract rather than an emptiness test.
There is **one** cancellation check, in the head of `runStep()`, where nothing else
guards it.

**`NavigationPlan` extends `NavigationContext`**, so one object per navigation is
handed onward. It is filled in two passes across the `TRANSITION_START` emit:
`suspendable` before the pre-commit listener window, the guard maps after it,
since a `TRANSITION_START` listener may still register a guard.

⚑ **Every field the pipeline needs from the caller's `opts` is on the plan, read
ONCE at the entry.** `opts` is accessor- or Proxy-backed by contract, so every read
is a call into application code and a second read may answer differently. Below the
entry the router asks the PLAN and never the caller's object.

### Guards vs Plugins

|                     | Guards              | Plugins            | subscribeLeave                             |
| ------------------- | ------------------- | ------------------ | ------------------------------------------ |
| When                | Before state change | After state change | Between deactivation and activation guards |
| Can block           | Yes                 | No                 | No                                         |
| Can redirect        | No                  | No                 | No                                         |
| Can transform state | No                  | No                 | No                                         |
| Scope               | Per-route           | Global             | Global                                     |

**`subscribeLeave(listener)`** fires after all deactivation guards pass —
**departure is approved, not committed**: an activation guard can still reject, so
treat the leave as tentative for non-idempotent side effects. Payload:
`{ route, nextRoute, signal }`.

**Async semantics.** Listeners are **awaited** (`Promise.allSettled`) — the only
subscription that blocks the pipeline. A sync throw rejects `navigate()` with that
**original error** and emits `TRANSITION_ERROR`; it is not converted to
`TRANSITION_CANCELLED`, and the first sync throw wins.

The `signal` aborts when the navigation is **cancelled or fails**, and **never** on
success — a listener that captured it still observes `aborted === false` after the
commit.

**`subscribe(listener)`** — `TRANSITION_SUCCESS`, post-commit, fire-and-forget.
Listeners are invoked synchronously; returned promises are not awaited, and a
rejected one is isolated centrally to the same `onListenerError` sink a
synchronous throw flows through, so it does not leak as a Node
`unhandledRejection`. The same isolation covers **raw plugin hooks**.

A **synchronous** reentrant navigation from inside a transition listener is
**banned**. Deferred navigation is allowed.

**`navigateToNotFound()` bypasses plugins and ACTIVATION guards** — plugins see
only `onTransitionSuccess`, and there is nothing to activate at `UNKNOWN_ROUTE`.

### When `navigate()`'s Promise resolves vs subscribers

```
navigate()
  ├── deactivation guards
  ├── LEAVE_APPROVED: subscribeLeave listeners  ← awaited (blocks pipeline)
  ├── activation guards
  ├── completeTransition(): ask the table → send(COMPLETE) → commit → TRANSITION_SUCCESS
  │     subscribe listeners fire synchronously; returned promises ignored
  └── resolves here
```

So `await router.navigate(...)` guarantees `subscribeLeave` was awaited and
`subscribe` listeners were invoked — but **not** that async work inside a subscribe
listener has finished, and **not** that adapters have committed the DOM. To block
on post-commit work, use `subscribeLeave` instead.

### Force Replace from UNKNOWN_ROUTE

Navigating FROM `UNKNOWN_ROUTE` auto-forces `replace: true`, so 404 entries do not
pollute history.

### Atomic Route Replacement: replace()

`getRoutesApi(router).replace(routes)` is prepare-then-commit:

1. **Blocking** — throws if disposed; a logged no-op during active navigation.
2. **Validation** — fail-fast structural guards, tree unchanged on error.
3. **Build artifacts into locals** — a circular/async `forwardTo` or invalid path
   throws HERE, before the store is touched, so atomicity holds without the
   validation plugin. Two pre-flights run here too: the **handler-limit** check
   projected against the surviving external guards, and the **guard-compile** of
   the new batch — so a malformed batch aborts with both the tree AND the old
   definition guards intact.
4. **Clear definition guards** — preserves external ones; a both-slot name
   re-derives its compiled slot by READING the surviving external guard's stored
   form, so this step executes no application code.
5. **Atomic swap** — one pass of pure assignment that never throws.
6. **State revalidation + notify** — `matchPath(currentPath)` decides:
   **no match** → `revalidateToNotFound`; **survivor** (same route name) → keep it,
   carrying the prior `context` and route-meta, guards NOT re-run since the user
   was already legitimately here; **route-identity change** → consult the new
   route's activation guards synchronously, commit on pass, not-found on a block
   or an async guard.

⚑ **The commit is a DOOR, and it asks whether the URL's OWNER moved while the
window ran.** Both arms run application code between `matchPath` and the commit —
the survivor arm through the route's own `decodeParams`, the identity arm through
the guards it consults — and either can reach back into route-CRUD. The question
is asked as a **DIFFERENCE**: the raw matcher is asked who owns the URL before the
window and again at the door, and the commit is refused only if the answer
changed. Affordable because the raw matcher runs no application code, so the
predicate cannot re-open the window it guards.

⚠ Boundary: a `forwardTo` installed in the window is NOT caught, because resolving
the chain would run dynamic callbacks and interceptors.

⚑ The site set is derived and pinned by `commit-door-authority-1753.test.ts`,
which walks `src` for calls to a commit primitive. ⚠ `navigateToState`'s check is
not in that set and cannot be — it asks the same question one layer above its
commit, so it is covered behaviourally instead.

The revalidation `TRANSITION_SUCCESS` carries a distinguishable `revalidate: true`
opt. **This is the one structural mutation that emits a transition event.**

**`clear()` is a teardown primitive, and its atomicity is a different CLASS.**

- **Precondition.** It throws `ROUTER_NOT_STOPPED` while a state is committed —
  legal before `start()` and after `stop()`. `replace(routes)` is the tool for
  swapping the tree on a running router.
- **Atomicity class.** `replace` / `add` / `update` are prepare-then-commit with
  pre-flighted validation — a **declared** contract. `clear()`'s is
  **structural**: two steps with no try/catch that hold together only because no
  user code runs in them. Do not read `replace`'s guarantees onto it by analogy —
  INVARIANTS "Route Management" #17 and #18.

**Guard origin tracking.** `RouteLifecycleNamespace` keeps four Maps split by
origin, populated via the `isFromDefinition` parameter, which is REQUIRED with no
default so every caller commits to a lane. Resolution is **external-wins
regardless of registration order**: a definition registered while an external is
live is stored for a later `clearDefinitionGuards()` but does not overwrite the
compiled function, and `clearDefinitionGuards()` re-derives the compiled slot from
the surviving external guard — idempotent under external-wins.

⚑ **The re-derivation READS, it does not re-compile.** Four further Maps hold each
factory's compiled form beside it, so factory and compiled twin are one unit —
written, cleared and rolled back together.

⚠ **The records handed out are `Object.create(null)` dictionaries keyed by a ROUTE
NAME**, and that is load-bearing: core accepts a route named after any of
`Object.prototype`'s own members, and the two consumers read them differently
(`name in record` vs `Object.entries`). A plain `{}` failed both ways — a phantom
guard on one side, a silently dropped one on the other.

### A route NAME carries no dot (#1763)

`createRouter`, `add` and `replace` refuse a route definition whose own `name`
contains a dot — the nesting belongs in `children` or `{ parent }`. The message is
`@real-router/validation-plugin`'s, because the rule is not new: it lives in
`engine/validation/route-batch.ts` and was reachable only through `validateRoute`.

⚠ Only a DEFINITION's own name. A dotted name is still how a nested route is
ADDRESSED — `get` / `update` / `remove` / `navigate` / `isActiveRoute` /
`{ parent }` all take the full dotted form, and pinning that boundary is half of
`dotted-leaf-names-1763.test.ts`.

⚠ The migration is EXACT: the **absolute** marker keeps the URL
(`children: [{ name: "view", path: "~/view" }]` yields the same `users.view` at
the same `/view`), so the refusal buys correctness without retiring a capability.

**What it buys is structural.** A dotted LEAF is a standalone node whose name
merely LOOKS like a path through the tree, and predicates across four packages
read that resemblance as ancestry. Two of them take names ONLY and have no tree to
consult, so no local fix could ever reach them. Refusing to CREATE the shape makes
every reader correct by construction.

### Route CRUD during active navigation

Six doors react differently to `isTransitioning()` — the five mutating route-CRUD
ops, plus `setRootPath` on `getPluginApi`.

| Op            | During navigation                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `add`         | no check — proceeds silently                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `update`      | `logger.error`, then **proceeds** (an in-flight navigate may read the new config). The warning sits BELOW the existence check, so `update("nope")` logs nothing at all                                                                                                                                                                                                                                                                                 |
| `remove`      | the route you are ON, or a real ancestor of it: `logger.warn`, **no-op**. Anything else proceeds, with the warning emitted AFTER the removal. If you removed the route being navigated TO, `completeTransition`'s existence check fails that navigation — and the code is a CHANNEL split: the promise carries `CANCELLED` while the walk is synchronous and `ROUTE_NOT_FOUND` once async, while `onTransitionError` reports `ROUTE_NOT_FOUND` on both |
| `clear`       | committed state → **throws** `ROUTER_NOT_STOPPED`. Inside `start()` the answer depends on the arm: from an interceptor or `onStart` it applies and the boot degrades; from a guard or `onTransitionStart` it is a logged no-op                                                                                                                                                                                                                         |
| `replace`     | `logger.error`, **no-op**                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `setRootPath` | `logger.error`, **no-op** when the root's PATH half changes; a `?`-declaration-only change is allowed — it moves no paths                                                                                                                                                                                                                                                                                                                              |

The asymmetry is intentional: `clear` / `replace` / `setRootPath` are destructive
whole-tree operations, while `add` / `update` are incremental and benign. `add`
has no guard at all, and the contract holds in the sense that matters — a route
added mid-navigation leaves the committed state exactly where adding it one
statement later would.

### `update()` does not revalidate the active state

`update(name, ...)` mutates config in place and does **not** rebuild the tree or
recompute the current state, so updating the currently-active route's codecs or
defaults leaves `getState().path` built by the OLD config until the next
navigation. By design — `update` is O(1), not a re-navigation. Use
`navigate(name, params, undefined, { reload: true })` if you need the path
rebuilt.

### Plugin System

```typescript
const myPlugin: PluginFactory = (router, getDependency) => ({
  onStart,
  onStop,
  onTransitionStart,
  onTransitionLeaveApprove,
  onTransitionSuccess,
  onTransitionError,
  onTransitionCancel,
  teardown,
});
```

**Plugins are observers** — they react to events but cannot modify the transition.

**Hook error isolation, sync and async.** A synchronous throw is caught and
logged; an `async` hook that rejects is isolated the same way, so it does not
escape as an `unhandledRejection`. A hook must not rely on its rejection
propagating anywhere.

**Conditional registration:** `usePlugin()` silently skips falsy values, so
`__DEV__ && validationPlugin()` works inline.

### Routes Mutation Events (`subscribeChanges`)

`getRoutesApi(router).subscribeChanges(handler)` is the single entry point for
observing **structural** route-tree mutations — the route-tree counterpart to
`router.subscribe`, deliberately not a `router.*` facade method.

```typescript
const unsubscribe = getRoutesApi(router).subscribeChanges((event) => {
  switch (event.op) {
    case "add":
      event.added.forEach(register);
      break; // FLAT, full dotted names
    case "remove":
      event.removedSubtree.forEach(drop);
      break; // exactly what was removed
    case "update":
      if (event.patch.defaultParams) revalidate(event.name);
      break;
    case "replace":
      reconcile(event.removed, event.added);
      break;
    case "clear":
      clearAll();
      break;
  }
});
```

| Property                                      | Behavior                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payload**                                   | `TreeChangedEvent` discriminated union, keyed by `op`. Routes are FLAT (full dotted `name`, descendants included), frozen per node                                                                                                                                                                                                                                        |
| **Read-only in the TYPE, shallow at RUNTIME** | The arrays are `readonly ReadonlyRoute<D>[]`, so a write at ANY depth is a compile error. At runtime the route object is frozen but **nested config is by reference and aliases the live store** — `event.added[0].defaultParams` is the same object the router reads on every navigation, and it is NOT frozen. Copy first if you need to keep or transform payload data |
| **`remove` payload is the SPLICE**            | `removedSubtree` names the node that was spliced out plus its real `children`, and nothing else. The same set drives the config/lifecycle purge, so a survivor cannot lose its guards                                                                                                                                                                                     |
| **Timing**                                    | Post-commit — the handler sees the new tree. For `replace`, after the swap but before state revalidation                                                                                                                                                                                                                                                                  |
| **`update` filter**                           | Emits only when the patch has a structural field. Guard-only and empty patches are silent                                                                                                                                                                                                                                                                                 |
| **Fire-and-forget**                           | The handler cannot cancel the mutation; returned promises are ignored                                                                                                                                                                                                                                                                                                     |
| **Reentrant tree mutation is banned**         | Any tree mutator called from inside a handler throws `REENTRANT_TREE_MUTATION` synchronously, **before mutating**. The door set is DERIVED — `tree-mutator-guard-authority-1751.test.ts` walks `src` for API members that transitively write a `RoutesStore` field, so a seventh door cannot ship without a guard                                                         |
| **Errors**                                    | A throwing handler is isolated via `onListenerError`; a runaway listener-driven nested same-event emit is coalesced at the emitter                                                                                                                                                                                                                                        |
| **Duplicates**                                | Lenient — each call is an independent subscription                                                                                                                                                                                                                                                                                                                        |
| **Clone isolation**                           | A cloned router has an independent emitter                                                                                                                                                                                                                                                                                                                                |
| **Scope**                                     | Internal-only channel: `TREE_CHANGED` is not in the public `EventName` union, the `events.*` registry or the `Plugin` interface. By design                                                                                                                                                                                                                                |

`dispose()` releases all handlers before route teardown, and afterwards
`subscribeChanges` throws `ROUTER_DISPOSED` — including through a reference bound
before disposal.

### Recommended pattern: declarative reactive cache invalidation

When a plugin maintains a cache derived from route-tree state, subscribe
declaratively and own the invalidation policy in one place — the consumer's
constructor.

```typescript
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
```

It replaces three partial patterns: **imperative-on-read** (reasoning becomes
global), **per-op interceptor** (asymmetric — catches `add`, silent on the rest),
and **init snapshot** (diverges silently). The `switch` gives symmetric coverage
and local reasoning, and each branch tests independently.

**When to break the rule:** a pure function that derives on every call needs no
subscription; read-mostly state may be fine revalidated on access; and a
**core-internal cache co-located with the rebuilt artifact** must clear at the
rebuild choke point instead — a permanent internal subscriber would keep
`listenerCount > 0` forever and force the listener-gated O(N) diff on every
mutation.

**Anti-pattern: a centralized `CacheManager`.** Each cache owns its subscription
in its own constructor. Centralizing creates a knowledge leak, forces one
invalidation model onto caches that need different ones, and adds indirection with
no ownership benefit.

### Navigator (`getNavigator`)

Returns a frozen read-only subset for view layers — pre-bound, safe to
destructure, cached per router: `navigate`, `getState`, `isActiveRoute`,
`canNavigateTo`, `subscribe`, `subscribeLeave`, `isLeaveApproved`.

**`canNavigateTo` is a synchronous `boolean`, never a Promise, and has parity with
`navigate`.** It evaluates exactly the guard set `navigate` would run — ancestors
shared with the current route are not re-checked. An async guard cannot be
evaluated synchronously, so it resolves to `false` (silent in core, warned by the
plugin); a guard that **throws** also resolves to `false`, logged via
`logger.warn`.

Parity covers every way `navigate` refuses the SAME arguments, not just the guard
verdict: a missing required path param and a declared query key handed in the
`params` bag both resolve to `false` rather than throwing.

**Total, including the resolution step** — a dynamic `forwardTo`, a `forwardState`
interceptor and the caller's own bag all run user code, and a throw from any of
them yields `false` plus a warning. `isActiveRoute` carries the same boundary over
both arms and both operands: **neither predicate may throw into a render.**

Guards are invoked with `signal === undefined`. `canNavigateTo` returns `true` for
the current route; before `start()` it runs the target's activation guards only.

**`isActive()` spans the whole live lifecycle** — `true` throughout `STARTING`,
`READY`, `TRANSITION_STARTED` and `LEAVE_APPROVED`, so it is `true` during
`STARTING` while `getState()` is still `undefined`. It is **not** a synonym for
the removed `isStarted()`.

⚠ There is **no public `isTransitioning()`** — it exists only on
`RouterInternals` for cross-namespace plumbing (#924).

---

## Supported Input Shapes

> **Own enumerable properties only.** Inherited and non-enumerable properties of a
> caller-supplied object are **not** supported input.
>
> — owner decision, 2026-08-18. Revisit only on a concrete precedent where a valid
> case is refused, and revisit on the basis of the functionality that then exists.

The rule constrains a bag's KEY surface, not its values: `dependencies` may hold
`Map`s, class instances and pools; route configs may hold functions.

**`Proxy`-backed bags keep working.** Vue `reactive()` and Svelte `$state` are
pass-through Proxies over plain objects — they report own-enumerable keys
normally.

⚠ **A class instance is the shape that bites.** `new VM("7")` with a `get q()` on
the prototype and the constructor argument stored as an own field prints the
internal field, not the accessor. The migration is one line — return an own-keyed
object — and it applies to what a route's **codecs RETURN**, the one source that
reaches the matcher without passing through the normaliser. The caller's own bags
never accepted an inherited key.

The rule has four sides. Each is enforced by a DERIVED guard rather than a list,
so no count in prose can go stale against it.

### READ — what core takes off a caller's bag

Own enumerable keys only, as stated above. `normalizeChannel` copies own keys
off the caller's `params` / `search` before the matcher sees them, which is what
drops the inherited ones.

⚠ **A route's `encodeParams` is the one source that reaches the matcher without
passing through that copy**, so it is where the rule is felt: a returned object
whose keys live on its PROTOTYPE throws on the path channel and prints nothing on
the query one. The fix is one line — return an own-keyed object (`{ ...vm }`,
`Object.fromEntries`, or a plain literal). A class instance is the shape that
bites, because it answers with its own internal field rather than the prototype's
accessor.

### WRITE — what core stores under a key it did not choose (#1852)

`target[key] = value` is `[[Set]]`, which walks the DESTINATION's prototype chain
first: a getter-only accessor throws, a getter+setter pair diverts the value into
application code, and a non-writable data property drops it. The chain in question
is `Object.prototype`, and an ordinary library extension puts things there — no
attacker required. The names that hurt are the ones an application routes under:
`id`, `tab`, `page`, `lang`.

**One primitive, `putField` (`src/utils/ingest.ts`).** It asks `key in target` and
pays `Object.defineProperty` only where the chain answers; in a pristine
environment it never does. `copyFields` is its `Object.assign` twin — that
function is the same `[[Set]]` per key, in a form a `dst[key] = …` census cannot
see.

- ⚠ **`__proto__` is not the rule, it is one instance of it.**
- ⚑ **Where the record does not escape to a merging consumer, the key is ordinary
  DATA** — a route's custom fields and a plugin's context namespace both keep it.
- ⚠ **A prototype-less destination is the EXPENSIVE horn**, not the cheap one: V8
  keeps such an object in dictionary mode, so the price lands on every later READ.
  The figures live in `putField`'s docblock and are deliberately not repeated.
- The site set is DERIVED by `computed-key-write-authority-1852.test.ts`, which
  requires every remaining raw write to carry a written reason. ⚑ Its second arm
  covers every OTHER package's `src`, where the rule is absolute rather than
  classified.
- **`@real-router/core/utils`** publishes `putField` / `copyFields`, because the
  rule is the plugin author's too.

### HAND-OUT — what core returns (#1957)

A container carrying an own `"__proto__"` is inert while it sits there and becomes
a prototype-swap primitive the moment a consumer merges it with `Object.assign` or
a `for…in` copy.

⚠ A SPREAD is **not** one of them — `{ ...container }` performs
`CreateDataProperty` and never reaches an inherited accessor. ⚠ The SOURCE's own
prototype decides nothing, so `Object.create(null)` is not a fix at a hand-out
door.

Only two things work, and one question picks between them — **does core read that
key back off the very object it published?**

- **No → `dropUnsafeKey`** (`src/helpers.ts`): the router options at their source,
  the dependency clone transport, and `getAll`. It MUTATES, so it takes only an
  object core allocated one expression earlier.
- **Yes → `concealUnsafeKey`** (`src/utils/ingest.ts`): exactly one site, the
  matcher's route-meta record, whose keys are ROUTE NAMES and which
  `segmentParamsEqual` reads by key on every navigation. Deleting there is not a
  milder fix but a WRONG one — the read would reach the inherited accessor and
  answer "params unchanged".

⚠ **Consequence:** a dependency named `__proto__` is held by the base router and
answered by `get()`, but does NOT reach a clone.

⚠ **Five doors are EXEMPT, each with a measured reason** — two prior owner
decisions (`state.context`, a route's custom fields), the two PASS-THROUGHS where
the container is the caller's own object with identity intact, and the internals
handle, whose whole purpose is to hand out the live stores. Sanitising a
pass-through means COPYING the caller's bag, which invokes its accessors a second
time below the read that already decided.

⚠ **The level closed is the container a door RETURNS, and no further.** One level
down are the caller's own objects, handed back by reference under core's one-level
copy model.

The set is DERIVED by `handed-out-containers-1957.test.ts`, which measures every
container-returning door on the swap itself and snapshots each public surface's
member list, so a new door reds until someone classifies it.

### ENTRY — what core's own copy carries (#1901)

> **The copy preserves every own enumerable key.** A key core does not recognise
> survives the copy and reaches whatever reads it downstream.
>
> — owner decision, 2026-08-30.

**Why not curate to the declared fields.** "The declared fields" has no runtime
expression: `NavigationOptions` is extended by **module augmentation**, which
leaves no trace in the emitted JS, so a curating copy can only normalise to a
hard-coded list that goes stale against the contract silently.

⚠ **A registration channel was weighed and refused**, and the reason is reach
rather than cost: `shared/dom-utils` ships in six adapters and consumes
`<Link hash>` in configurations where no URL plugin is installed, and
`memory-plugin` tags restore navigations through a local intersection type. A
`usePlugin`-driven registry drops both.

⚠ **It does not re-admit `"__proto__"`.** The HAND-OUT rule still removes it from a
published container. For `NavigationOptions` the two levels coincide, so the key
is dropped once, in the copy loop.

⚑ **The copy is a key LOOP, not a spread**, and the reason is the read count: a
spread reads EVERY own key to exclude one, so excluding `signal` would cost a
second call into the caller's accessor. Counted by
`commit-gate-reads-the-snapshot-1717`.

### The two enforcement postures

**Where a report is cheap, report it.** At construction and registration time,
`@real-router/validation-plugin` says that a supplied bag carries readable keys
outside its own-enumerable surface.

**Where it is not cheap, stay silent.** On the per-navigation bags a
prototype-surface comparison costs a chain walk on the render path. Those bags are
object literals in practice, and the silence is the decision: a key that is not
own-enumerable is absent, and absence is not an error condition on the query
channel.

The visible asymmetry between the channels follows from that: a path slot the
route DECLARES cannot be left empty, so an absent `params` key is
`Missing required param`; a query key is optional by construction, so an absent
`search` key is just a shorter URL.

⚠ **A name blocklist is not the mechanism**, and cannot be:
`new URLSearchParams("__proto__=1")` yields that key from a URL a browser can
produce, and `?q=toString` is a legitimate search query — the same string is data
in one position and an identifier in another. Under this rule the name axis closes
without a list, because all twelve `Object.prototype` own members are
non-enumerable. Where a hard throw IS right it stays narrow and at registration
time: route names, declared param names, context namespaces, enum option values.

---

## Gotchas

### Guards Cannot Redirect

All guards are `GuardFn` (`boolean | Promise<boolean>`) — no State return. Both
route config and `addActivateGuard` / `addDeactivateGuard` accept a
`GuardFnFactory`, whose signature is `(router, getDependency) => GuardFn`.

```typescript
// WRONG — GuardFn returns boolean only
lifecycle.addActivateGuard(
  "admin",
  (router) => () => router.makeState("login"),
);

// CORRECT
lifecycle.addActivateGuard(
  "admin",
  (router, getDep) => () => getDep("isAuthenticated") === true,
);
```

### Frozen factory surfaces (#1805)

**Cached ⟹ frozen.** `getNavigator`, `getRoutesApi` and `getPluginApi` hand back a
frozen object, because one instance is shared by every consumer of a router and a
single member assignment rewires it for all of them. The two UNCACHED factories
(`getLifecycleApi`, `getDependenciesApi`) are not frozen and need not be — a write
to a per-call object reaches nobody. Classification DERIVED by
`factory-surface-freeze-authority-1805.test.ts`.

⚠ **A test that stubbed a member of these surfaces belongs on
`getInternals(router)`** — but not uniformly, and the three classes are derived by
`plugin-api-stub-seam-authority-1805.test.ts`: a member that CALLS `ctx.<name>()`
is intercepted whenever the spy stands; one that ALIASES it captures the reference
when the cached surface is BUILT, so a spy installed afterwards is missed; and one
that composes locally has no seam at all.

### areStatesEqual ignores query params by default

Query params live in `state.search`; `ignoreQueryParams` (default `true`) controls
whether that channel participates. `state.params` is always compared.

⚑ **Both arms decide from the key LIST `Object.keys` returned** (#1815) — the
READ rule above, applied to a comparison. Not `key in bag`, not
`Object.hasOwn(bag, key)`, not `propertyIsEnumerable`: those are one family
because the CALLER picks the key and the bag is asked about that key directly —
`in` through `[[HasProperty]]`, the other two through `[[GetOwnProperty]]`, and
on a Proxy each is a trap free to vouch for a key `ownKeys` never listed.
`Object.keys` asks `ownKeys` FIRST and consults descriptors only for what it
returned. That is #1854's argument, and this is the same bag it names. The declared-slot
arm is the whole-bag reader restricted to the route's slots.
INVARIANTS `areStatesEqual` #10 owns the statement and names the pins; the cost
is on the matching-name comparison only, since the name check short-circuits
first.

⚠ **`areStatesEqual(…, false)` and `isActiveRoute(…, false)` answer different
questions.** This one is state IDENTITY — its `false` polarity compares the WHOLE
`params` bag. `isActiveRoute` asks about the LOCATION. Its own reach is derived,
not restated — INVARIANTS `isActiveRoute` #10 names the test.

**`undefined` is absence on both sides of the default merge.** `mergeDefined` is
the single owner of "route default UNDER the value": a key survives only when its
winning value is defined. So a caller's explicit `undefined` means "I said
nothing" and the route default keeps the slot, and a default that itself carries
`undefined` behaves exactly like no entry. The rule lives in the merge rather than
in a separately-ordered normalize stage, which is what makes it order-insensitive
and true for every producer. `normalizeChannel` is the entry guard for BOTH
channels and collapses an empty bag onto that channel's own `EMPTY_*` singleton —
the singleton is a PARAMETER, so the two channels must not be handed each other's.

**One registry decides the channel, and it is the one that PRINTS.**
`getQueryParams` reads the matcher's `declaredQueryParams` — the very list the URL
build prints from — minus the route's `urlParams`. A key is separated into the
query channel **iff** the build prints it, with one carve-out: a name that also
occupies a path slot (`/items/:id?id`) stays path-owned, and only an explicit
`search` twin reaches the query channel.

**The caller beats the default**, within a channel. `undefined` is absence on both
sides, so a removal marker does not count as "filled".

**Value comparison is provenance-tolerant, not `===`.** The URL direction parses
query values while an intent keeps whatever the caller passed, so a strict
comparison reported two states on the SAME location as unequal.
`areParamValuesEqual` treats values as equal when they print into the same URL:
`string` / `number` / `boolean` by printed form, arrays element-wise, and a
singleton array against a bare scalar. `null`, `undefined` and objects stay strict
— they print differently, so tolerating them would equate different URLs. Storage
is untouched; comparison is the single place that knows both domains describe one
location.

### Hook Execution Order

For `users.profile` → `admin.dashboard`: deactivate `users.profile`, deactivate
`users`, activate `admin`, activate `admin.dashboard` — innermost first on the way
out, innermost last on the way in.

### Navigation Cancels Previous

```typescript
const p1 = router.navigate("users");
const p2 = router.navigate("admin"); // p1 rejects with TRANSITION_CANCELLED
```

### Plugins After start() Miss onStart

Register plugins BEFORE `start()` — `onStart` will not be called otherwise.

### `trailingSlash: "preserve"` + `rewritePathOnMatch: true`

Both default to on. `matchPath()` rebuilds `state.path` via `buildPath()`, then
re-attaches the source path's trailing-slash choice via
`matchSourceTrailingSlash()`. The reverse case is unreachable with the current
matcher.

---

## Performance Notes

The hot path is `navigate` and the render-path predicates. Everything here is a
measured trade; the measurements live in the issues and in each site's own
docblock, and are deliberately not restated.

- **Optimistic sync execution** — no AbortController, no async/await and no
  microtask delay on the guard-free, listener-free arc.
- **`hasGuards` is per-TRANSITION, not per-router.** `planPhases` asks whether a
  segment THIS transition walks carries a guard, not whether the router holds one
  anywhere — otherwise one `canActivate` on an admin route arms the full
  cancellation machinery for every public navigation. ⚠ The two branches are
  behaviourally equivalent, so it is pinned by COUNTING controllers
  (`guards-off-path.test.ts`), never by timing.
- **FSM `send()` is table-driven**, and `forceState()` exists nowhere in core —
  locked in two layers by `fsm-state-authority.test.ts`. An invalid transition is
  a table no-op, so the FSM cannot be resurrected out of `IDLE` / `DISPOSED`.
  Deliberate trade (owner decision): a measurable cost on `navigate/*` bought for
  structural determinism.
- **The commit-gate is `when: mayCommit` on the `COMPLETE` edge**, asked from
  `completeTransition` on every arc. It is asked ONCE, **above** the destructive
  post-leave cleanup — a cancelled navigation must not unregister the guard of the
  route the user is staying on. ⚠ That ordering is enforced by the TYPE: the ask
  returns a `CommitPermit` that `clearCanDeactivate` demands, so moving it back
  down is `TS2448` rather than a red test.
- ⚑ **A snapshot verdict is sound only because the window below it is inert.** The
  meta's three flags are read once at the entry, so `completeTransition` reads no
  `opts` field. ⚠ The claim is not "no application code runs in
  `completeTransition`" — the announce below the verdict runs plenty; it is that
  between the ask and the send there is bookkeeping and nothing else. Pinned by
  `commit-window-empty-1719.test.ts`, which counts the caller's getter
  invocations.
- ⚑ **The TABLE evaluates `mayCommit` TWICE** — once inside `canSend`, once inside
  the `send` it permits — so it may only read what cannot change between them. It
  asks `payload.externalSignal`, the signal captured at the entry, never the
  caller's `opts`.
- **Explicit params instead of `...args`** in both dispatch primitives: a rest
  parameter materialises an array per call, and these run several times per
  navigation.
- **Cached error rejections**, a cached `[deactivate, activate]` tuple, reused
  segment arrays, and lazily-created closures on the guard branch only.
- **Empty-channel reuse** — `normalizeChannel(bag, empty)` returns the shared
  frozen singleton the CALLER named, so an empty-params navigation allocates zero
  transient objects.
- **`isActiveRoute`'s `forwardTo` arm is gated tree-wide before per-route.**
  `RoutesStore.hasAnyForward` answers with one boolean load, because the per-route
  gate touches two `Object.create(null)` maps that V8 keeps in dictionary mode
  whatever their size. ⚠ Derived state: a stale `false` switches the arm off
  silently, so the flag moves only alongside `resolvedForwardMap` through
  `adoptForwardState` — a new writer of forward config belongs there, not in a
  second derivation.
- **`canonicalize`'s fast-path gate is TWO facts, one per side** — the CALLER
  brought no query bag, and the ROUTE carries no default on either slot. Between
  them stage ③ and the mode gate are provably identity. ⚠ The two defaults are read
  ABOVE the gate deliberately: they are its route half AND the slow path's first
  input.
- **Options are frozen at construction — one level, the level core owns** (#1832),
  so `getOptions()` is safe to return directly, and `buildPath` options are cached
  per router instance. ⚠ The nested bags are the CALLER's objects and core writes
  to none of them, so a write there is accepted and read live; the census in
  `options-ownership-1832.test.ts` owns the door list.
- Fire-and-forget suppressors are per-router and split by owner, classifying
  through one shared `isExpectedRejection`.

### Async subscribeLeave overhead

With **0 listeners** the leave arc is not on the hot path at all. With **N sync
listeners** a controller is created and released unaborted, plus a frozen
`LeaveState` and N try/catch. Benchmarks: `navigate/leave-1` / `navigate/leave-3`
in `tests/benchmarks/default.bench.ts`.

---

## Cancellation

Pass `{ signal }` via `NavigationOptions` for external cancellation; `stop()`,
`dispose()` and a concurrent navigation cancel automatically.

**The FSM is the single owner of cancellation.** Every source routes through FSM
`CANCEL`, whose action aborts the in-flight controller by reading it off the
navigation the machine is carrying — so **"`CANCEL` ⟹ controller aborted +
`TRANSITION_CANCEL` emitted"** holds atomically in one place. No source aborts the
controller by hand.

⚑ **The cancellability scope is OPENED and CLOSED by the machine.** The `NAVIGATE`
edge's own ACTION opens it — after the edge's `update`, before
`emitTransitionStart`, so the `onTransitionStart` window is covered while a
`NAVIGATE` the table REFUSES opens nothing — and whichever terminal edge the
navigation leaves the band through closes it. `DISPOSE` is deliberately not in
that set. Registration stays CONDITIONAL, because registering unconditionally is a
measured regression on the guard-free arc. Pinned by
`cancellability-scope-1716.test.ts`, which COUNTS `addEventListener` /
`removeEventListener` per arc, because a leaked listener changes no outcome, no
event and no state.

⚑ **The window in FRONT of the earliest registration is owned by one inline check
right after the announce.** `beginTransition` reads `opts` between the entry
pre-check and the announce, and reading a Proxy-backed `opts` IS a call into
application code — so a getter that aborts there would leave every bridge standing
on a dead signal, and `addEventListener` never fires retroactively. The scope
ADOPTS what the signal already says, once. **After** the announce is the whole
constraint: `CANCEL` is declared on the band only, so asking earlier is a table
no-op. Pinned by the four-cell matrix in `external-signal-bridge-1684.test.ts`,
which counts `TRANSITION_CANCEL` because the navigation's OUTCOME never
discriminated.

**What cancellation stops, and what it deliberately does not.** It stops
**guards**: the fence at the head of every guard step asks the same pair the
asynchronous half asks — still the navigation in flight, and the controller not
aborted — so after `TRANSITION_CANCEL` no guard of that navigation runs, on any
source and any phase. **`aborted` is the term that decides on every source.**

It does **not** stop the `subscribeLeave` dispatch, and that is the contract
rather than a residue: a listener whose leave was approved is still called, with
`signal.aborted` already `true`, which is exactly what `guardLeaveListener` and
`dom-utils/view-transitions` key their skip on.

⚑ **The `aborted` term works only because the cancel is RECORDED even when no
controller exists yet.** Allocation is lazy, so a `CANCEL` landing in front of the
first consumer writes `cancelReason` onto the navigation before aborting, and
`openController` aborts every later controller on birth from that record. Counted,
not traced — `cancellation-stops-the-guard-walk-1687.test.ts` asserts ZERO guard
invocations after the cancel, because the navigation's outcome does not
discriminate.

**Cancellation wins regardless of ORDER, and a cancelled navigation reports
nothing.** A navigation that is no longer the one in flight is a cancellation,
whatever its guard decided: no `TRANSITION_ERROR`, and `navigate()` rejects
`TRANSITION_CANCELLED` carrying the original error as `reason`. ⚠ The two failure
arcs read liveness from DIFFERENT facts, and the asymmetry is load-bearing:
`finishAsyncNavigation` holds its own controller and asks
`isCurrentNavigation(nav) && !signal.aborted`; the synchronous
`handleNavigateError` asks `isCurrentNavigation(nav) && deps.isTransitioning()` —
"does the FSM still hold MY transition", which is the actual precondition for
sending `FAIL`. `isActive()` alone would be too loose there.

**Non-cooperative guards are bounded.** `finishAsyncNavigation` races the guard
completion against the controller's abort, so an async guard whose Promise never
settles and ignores `signal` no longer wedges `navigate()` forever.

`AbortError` thrown in a guard is auto-converted to `TRANSITION_CANCELLED`, and a
guard may throw `RouterError(TRANSITION_CANCELLED)` directly for a quiet cancel —
it is **preserved**, so `onTransitionError` does not fire. Any other thrown
`RouterError` is re-coded to `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` **on a
copy**, because the thrown instance may be one of the cached singletons.

---

## Promise-Based Navigation API

All navigation methods return `Promise<State>`. Exception:
`navigateToNotFound(path?)` is **synchronous** and returns `State`.

**`navigateToDefault()`** is not `async`: synchronous throws from
`deps.resolveDefault()` are converted to `Promise.reject`, so callers can rely on
`.catch()` / `await` uniformly.

**`start(path)` requires a path string** — core is platform-agnostic.
Browser-plugin overrides it to make the path optional. With `allowNotFound: true`
and no match, `start()` commits `UNKNOWN_ROUTE`.

**`start()` rejection vs committed state.** `start()` commits INSIDE the
interceptable chain, and SSR loader plugins run after `await next(path)` — i.e.
after the commit emitted `TRANSITION_SUCCESS`. So the facade distinguishes two
shapes:

- **Pre-commit failure** (route not found, a blocking activation guard, a sync
  interceptor throw before `next()`): the half-started FSM unwinds to IDLE —
  `getState()` is `undefined`, `isActive()` is `false`.
- **Post-commit interceptor failure** (a loader throws after `next()`):
  subscribers already observed `TRANSITION_SUCCESS`, so core does **not** roll
  back. The committed state stands and the loader error surfaces only via the
  rejected `start()` promise — rolling back would retract an observed success.

**`UNKNOWN_ROUTE` state shape**:
`{ name: UNKNOWN_ROUTE, params: {}, search: {}, path: "/the/url", transition }` —
`params` and `search` are always empty; the URL is in `state.path`. Exported both
standalone and via `constants.UNKNOWN_ROUTE`.

**`GuardFn`**: `(toState, fromState, signal?) => boolean | Promise<boolean>`.

---

## Code Conventions

### Adding New Methods

**Facade methods:** validator → namespace instance method → facade method that
calls `ctx.validator?.ns.fn()` and delegates → bind in the constructor if it
touches private fields.

**Standalone API methods:** validator → module-private CRUD function in
`api/get*Api.ts` → method on the returned object → reach internals via
`getInternals(router)`.

**Adding validation:** call `ctx.validator?.ns.validateXxxArgs(...)`, add the
method to `RouterValidator`, implement it in the namespace's `validators.ts`, and
wire it in `validationPlugin.ts`.

### Modifying Existing Methods

Validation changes go in the namespace's `validators.ts`; logic changes in the
namespace method or the `api/` function. `Router.ts` only CALLS validators — it
never implements validation.

### Type Locations

| Kind                     | Location                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Public API types         | `src/types/` — the `types/index.ts` barrel IS the `/types` subpath and the augmentation declaration-site |
| Core-internal types      | `src/types/internal.ts` (`RouterEventMap`, `Limits`) — deliberately NOT re-exported                      |
| Namespace-internal types | `namespaces/XxxNamespace/types.ts`                                                                       |

⚠ **Augmentation invariant.** The augment-target interfaces (`StateContext`,
`NavigationOptions`) are declared **lexically in `types/index.ts`** — TS merges a
`declare module` augmentation only against the declaration-site of the resolved
entry module, so a re-export of any form is a silent no-op. Core's tsdown build is
two-pass to keep this true in `dist`, and the passes must stay SEQUENTIAL;
`scripts/check-dts-augment-targets.mjs` fails the bundle if the declarations move
or duplicate. The type-only import cycle this creates is deliberate.

⚠ **Gotcha:** the root exports the `Router` / `RouterError` **classes**, which
shadow the same-named interfaces. Import the `Router` **interface** from
`@real-router/core/types`, not the root.

### `Options<Dependencies>` vs `AnyOptions`

`Options` is generic over the router's dependency map, so the three resolver
callbacks receive a typed `getDependency`. Two rules:

- **Resolves callbacks → takes `Options<D>`** — `createRouter`, the constructor,
  `OptionsNamespace`, `RouterInternals.getOptions` / `getCloneState`,
  `resolveOption`, `resolveDefault`.
- **Reads configuration → takes `AnyOptions`** — `PluginApi.getOptions`, the
  matcher, the URL builders, the navigation and lifecycle dependency bags. These
  never resolve a callback, so parameterising them would be noise.

`AnyOptions = Options<never>`, and the `never` is load-bearing: `keyof never` is
`PropertyKey`, so the erased accessor takes ANY key and returns `never` — a wider
parameter and a narrower return, which is what contravariance needs for
`Options<D>` to flow in for every `D`. Every field stays visible; only the
callbacks become uncallable, which is honest — a plugin has no dependency map to
resolve them against.

### Test Coverage

100% required. Use `/* v8 ignore next N -- @preserve: reason */` sparingly, for V8
tool limitations, race-condition guards in async operators, security guards and
transpiler artifacts.

**`@preserve` means "intentionally kept after a v8-ignore audit — do not remove
without re-auditing".** Do NOT use it for defensive guards against
TypeScript-enforced invariants, and always give the reason.

### Mutation testing (Stryker)

The honest ceiling is ~90–92 %, and the remainder is structurally not worth
disabling: **entangled** mutators (a killed and a survived variant on one line),
**equivalents** (no test can kill them), and **validator-opt-in** branches that are
dead in core and covered in the plugin.

- **`survived ≠ equivalent`.** Disable ONLY after proving equivalence empirically.
  Silencing an unproven survivor hides a real gap — the exact anti-pattern
  mutation testing exists to catch.
- A **killable** survivor is closed with a **test**, never a `disable`.
- A **proven** equivalent gets `// Stryker disable next-line <Mutator>: reason`,
  listing only mutators with no killed sibling on that line.
- Score is a proxy for test strength, not a target.

Full record: `.claude/mutation-audit-2026-06-22.md`.

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — this package's structure and subsystem boundaries
- [INVARIANTS.md](INVARIANTS.md) — property-based invariants per entry point
- [src/engine/CLAUDE.md](src/engine/CLAUDE.md) — routing engine
- [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md) — navigation delivery pipeline
- [src/channels/CLAUDE.md](src/channels/CLAUDE.md) — channel-correctness subsystem
- [src/utils/fsm/CLAUDE.md](src/utils/fsm/CLAUDE.md) — FSM engine internals
- [packages/validation-plugin/CLAUDE.md](../validation-plugin/CLAUDE.md) — validator namespaces
- [root ARCHITECTURE.md](../../ARCHITECTURE.md) · [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) — system design, and the home of every "why it is this way"
