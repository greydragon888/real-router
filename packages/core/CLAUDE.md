# @real-router/core

## Architecture

### Namespace-Based Design

The router uses a **facade + namespaces** architecture:

```
Router.ts (facade)
    │
    ├── RoutesNamespace        — route tree, path operations, forwarding
    ├── StateNamespace         — state SERVICE (the pair itself lives in the FSM context)
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

    A subsystem and not a namespace method because the rule has no owning
    module — twelve call sites in seven modules — and it imports nothing from
    the namespaces, the engine or the pipeline (declared query names arrive as
    DATA, never as a matcher, so a second derivation of the one registry #1556
    cannot grow here; enforced by a `no-restricted-imports` boundary in
    `packages/core/eslint.config.mjs`). Canon — the call-site table, the
    per-mechanism render-path rules and the gotchas — lives in
    [src/channels/CLAUDE.md](src/channels/CLAUDE.md); the render-path table
    comparing all three mechanisms against the other always-on guards stays
    below, in "What each mechanism does on the RENDER path".

api/ (standalone functions — tree-shakeable)
    ├── getRoutesApi(router)      — route CRUD
    ├── getDependenciesApi(router) — dependency CRUD
    ├── getLifecycleApi(router)   — guard management
    ├── getPluginApi(router)      — plugin management
    └── cloneRouter(router, deps) — SSR cloning
```

**SSR/SSG/hydration helpers live outside core, in `@real-router/ssr-utils`** (`serializeState`, `serializeRouterState`, `hydrateRouter`, `getStaticPaths`, `createRequestScope` — #1543). They are router-level (not plugin-level like `shared/ssr`), consume core exclusively through its public subpaths (`@real-router/core/api`, `@real-router/core/validation`, `@real-router/core/types`), and were extracted from the SSR-era `@real-router/core/utils` subpath to keep core a pure router with zero SSR-specific surface. ⚠ That subpath NAME is live again and holds something else entirely — `putField` / `copyFields`, core's ingestion discipline (#1852, "The WRITE side of the same rule" below). Only the SSR content moved out; the specifier was not retired, and a search for `core/utils` finds both stories.

**Hydration scratchpad (#596)**: `RouterInternals.hydrationState` is `null` outside `hydrateRouter` (`@real-router/ssr-utils`). Inside, the parsed `SerializedRouterState` is briefly assigned, then cleared in `finally`. SSR loader plugins (`ssr-data-plugin`, `rsc-server-plugin`) read `getInternals(router).hydrationState` from inside their `start` interceptor — when the namespace value is already present in the parsed context for the same route name, they reuse it instead of invoking the loader. Single-shot semantics: only the first `start()` consumes the scratchpad. The `SerializedRouterState` type itself is defined in `src/types/base.ts` (core owns the shape of its own hydration scratchpad) and re-exported by `@real-router/ssr-utils`.

**RouterFSM states**: `IDLE → STARTING → READY ⇄ TRANSITION_STARTED → LEAVE_APPROVED → READY | DISPOSED`

`DISPOSE` is wired from every non-DISPOSED state so the FSM always settles at `DISPOSED` when `router.dispose()` runs. For healthy flows the facade routes through `IDLE` first (`STOP → IDLE → DISPOSE`); the direct transitions are a safety net for cases where the FSM cannot be returned to `IDLE` (e.g. `dispose()` mid-`STARTING` when the start pipeline threw before `STARTED`/`FAIL`). `STARTING` also accepts `STOP → IDLE` (#1185): a `stop()` while `start()` is parked in an async start-interceptor cancels the start (facade `stop()` sends `STOP`; `RouterLifecycleNamespace.start` re-checks `isIdle()` after the interceptor chain and rejects `TRANSITION_CANCELLED`), so the "`stop()` cancels the transition" contract holds in the interceptor window as it already did in the guard phase. See `routerFSM.ts` transition table.

All router events are consequences of FSM transitions (via `fsm.on(from, event, action)`), not manual calls.
No boolean flags (`#started`, `#active`, `#navigating` removed).

**The table owns the committed state (#1641).** `current` / `previous` are fields of `RouterFSMContext`, written by four edge `update`s and by nothing else — see INVARIANTS "Committed-state ownership" #4. Two consequences worth knowing before reading the table:

- **`SYSTEM_COMMIT` is a tenth event, and it has exactly ONE edge — on `READY`.** It carries the commits that are NOT transitions — `navigateToNotFound`'s bypass and the `replace()` revalidation — onto the machine so they shift the pair like everyone else. ⚠ It shipped with a second edge on `STARTING`, justified by the phase-4.1 spikes ("`start()` with `allowNotFound` commits its 404 while still STARTING; so does a `replace()` inside an async start interceptor, #1204"), and BOTH claims were false: `completeStart()` sends STARTED — leaving STARTING — before `navigateToNotFound` runs, an order standing since #123, and the revalidation commits only when a state is already committed, which means start finished. Traced on both arcs, untraversed by 4506 tests, removed at zero test cost. Missing an edge is SILENT (a `send` with no edge is a table no-op), which is why the commit sites ask `canSend` first and throw — so the arc nobody has named would now surface loudly instead of not committing.
- **There is no `READY → FAIL` edge, and its absence is the answer to RFC-10a §16.5, not an omission.** The edge existed for two senders — early validation errors and the plugin-facing `emitTransitionError` — and both are REPORTS to observers rather than failures of a transition, so they emit directly. A stale `FAIL` in `READY` is therefore a table no-op structurally, which is stronger than the predicate that was drafted for it. `STARTING --FAIL--> IDLE` stays unconditional: that one is how a failed `start()` unwinds.

### Navigation pipeline (`src/pipeline/`, RFC nav-pipeline — all four phases closed)

Every entry point builds its target state through the pipeline: `canonicalize` is the **sole producer** of `Canonical`, and `buildURL` / `materialize` physically accept nothing else (the brand is a `unique symbol` that is never exported, so `materialize({name, path, query})` does not compile). Phase 2 (#1548) migrated the remaining seven, one per commit, in TWO compositional forms — **class ①** (resolves `forwardTo` through the seam: `navigate`, `matchPath`, `canNavigateTo`, `buildNavigationState`) and **class LITERAL** (`{ resolveForward: false }` — answers about the route it was NAMED: `buildPath`, `isActiveRoute`'s first arm, `makeState`). Canon — the port's members and its two load-bearing wiring facts, the local-⑤a exceptions, the perf notes and the gotchas — lives in [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md).

`navigateToNotFound` is the one deliberate exception — it wraps a URL string, it does not build a state from an intent, so it has no channels to canonicalise (INVARIANTS navigateToNotFound #2).

**Stage ② (channel separation) is GONE.** The `forwardState` seam used to run `separateChannels` over whatever left the interceptor chain, moving a declared `?key` out of the params bag behind the producer's back. It now applies the same centralized assertion the facade uses (`assertChannelCorrect`) and THROWS — refusing rather than repairing, because the repair let a producer keep believing its own bag shipped, laundered values past `search-schema`'s validation, and inverted caller precedence (#1570). The three shapes it hit, and what fell out as dead with it: [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md).

✅ **`separateChannels` is deleted.** The three remaining call sites — `pipeline/canonicalize`, `StateNamespace.makeState`, the chain fold in `RoutesNamespace` — split a route's OWN defaults by the declaring route, and they went too. **The slot IS the channel**: `defaultParams` is the path channel, `defaultSearch` the query channel, in every position, and the router moves nothing between them. `params` and `search` meet in exactly one place — the printed URL.

The argument that kept the defaults split ("a hop can only spell a default in `defaultParams`") was false: the fold reads `defaultSearch` two lines above. And the routing actively hurt the author it was supposed to help — a hop could not tell which channel its own config would land in without reading a target that a `forwardTo` CALLBACK may not determine until navigation time.

Two checks replace it, split by what is knowable when:

- **Registration** (`assertRouteDefaultChannels`, always-on core guard) — a route's own `defaultParams` naming a key the route declares with `?`. Both sides are known at `createRouter` / `add` / `replace` / `update` / `setRootPath`, so it fails at config time with the slot to move to. Without it the router would build a state out of config it had accepted and its OWN always-on channel guard would reject it — `start()` throwing `WRONG_CHANNEL` about a bag the user never passed, the textbook deferred-crash shape core's invariant guards exist to prevent. Every one of those entry points runs it **prepare-then-commit**: a rejected batch leaves the store untouched (the first placement checked after the swap and left bad config installed — caught by the entry-point test).
- **Resolution** (the `forwardState` seam) — a hop's `defaultParams` naming a key the TARGET declares. Registration cannot see it through a dynamic `forwardTo`, so it is checked where the target is finally known, and the message names both routes.

The seam's error names the key, the route, and — when a chain resolved elsewhere — the route the caller actually named, because `navigate("src", { lang })` was written against `src`'s config, where `lang` is undeclared and legitimate.

Stage ③ (route default UNDER the caller's value) has exactly ONE implementation — `canonicalize` — since nav-pipeline Phase 4 folded `StateNamespace.makeState` onto its LITERAL form. `makeState` used to carry a parallel copy of ③ and of the mode gate, which is how #1584's existence precondition came to land on one terminal and not the other. Channels are frozen at merge time, independently of `materialize`'s `skipFreeze` (which defers only the state-object freeze, for the transition pipeline).

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
- **`navigateToNotFound(path)`** — validates `typeof path === "string"` when path is provided (prevents silent state corruption `state.path = 42`). **Nothing commits before the start navigation does — and that is the WINDOW's rule, not this primitive's (#1644 / #1661 / #1647):** in that window the call is refused (`REENTRANT_NAVIGATION` from a hook or listener, `ROUTER_NOT_STARTED` from a start interceptor), because a 404 landing in that window is a PHANTOM — the boot overwrites it a tick later and `router.subscribe` consumers have already seen a `TRANSITION_SUCCESS` for a state that never survives (the #1610 shape; reproduced from a plugin's `onStart` hook). The `in flight` half keeps the refusal narrow: a `navigateToNotFound` from a guard OF the start navigation still commits, because the primitive aborts that navigation first, so its 404 displaces the boot's commit rather than being overwritten by it. The **path-less** form additionally cannot derive a path there at all, so it throws with its own message whatever is in flight (#1172 — same deferred-crash class as the `start(path)` guard below, instead of a cryptic `TypeError` from dereferencing the absent state). ⚑ **The same window refuses the navigate family too — and since #1647 NO predicate of this primitive's says so.** `navigate` / `navigateToDefault` / `navigateToState` were the channels #1644 did not sweep, and there the FSM says yes: `completeStart()` reaches `READY` before the boot commits and `NAVIGATE` is declared on `READY`, so a `navigate()` from a plugin's `onStart` ran to completion, announced `TRANSITION_SUCCESS`, and the boot overwrote it. #1661 held that with a hand-rolled facade predicate (`Router.#refusesBeforeBootCommit`); **#1647 deleted it, and the window is now held by two mechanisms that were already load-bearing under it.** From a plugin `onStart` or a raw `$start` listener the emit is a COUNTED dispatch, so `#assertNotReentrant` throws `REENTRANT_NAVIGATION` first — for all four doors alike, the same rule the transition-event windows use. From a start INTERCEPTOR the machine is still `STARTING`, where neither `NAVIGATE` nor `SYSTEM_COMMIT` is declared, so the table refuses on its own. What the predicate really carried was the MESSAGE, and only that moved: the refusal sites name the phase (`EventBusNamespace.#refuseSystemCommit` for the 404 twin, `deps.isStarting()` picking `CACHED_PRE_BOOT_COMMIT_REJECTION` in `NavigationNamespace`), because a bare `NOT_STARTED` reads as "you forgot to call `start()`" to a caller who is inside `start()`. An ordinary never-started router still gets the plain sentence — `isStarting()` is the whole distinction.
- **`start(path)`** (in `RouterLifecycleNamespace.start`, #939) — validates `typeof path === "string"`. Runs **after** the start interceptor chain, so a browser-plugin's location injection (`next(path ?? getLocation())`) still wins; it only fires when nothing supplied a path. Without it, `start(undefined)` with no browser-plugin reached `matchPath(undefined)` and threw a cryptic, code-less `TypeError: …codePointAt` deep in path-matcher. Symmetric with `navigateToNotFound`'s type guard. (The facade-level `validateStartArgs` validator deliberately permits `undefined` for the browser-plugin-override case — this guard is the post-override backstop.)
- **`claimContextNamespace(namespace)`** (on `PluginApi`, `getPluginApi.ts`) — throws `CONTEXT_NAMESPACE_ALREADY_CLAIMED` when a namespace is already claimed by another plugin, and a `TypeError` on a non-string or empty namespace (symmetric with the sibling guards' input-shape checks, #1191). `claim.write` goes through `putField` (#1852), so a namespace lands as a genuine own key whatever the prototype chain says about that name — rather than dispatching into an inherited setter, losing the value and (for `"__proto__"`) swapping `state.context`'s prototype. ⚠ It carried a hand-written `Object.defineProperty` for the one literal `"__proto__"` from #1191 until #1852 generalised it: the name that hurts a plugin is not that literal but whatever the APPLICATION put on `Object.prototype`, and a namespace is a plugin-chosen string. Prevents silent corruption: without these, two plugins writing the same `state.context.<namespace>` would clobber each other's data, and a namespace the chain answers for would silently vanish from the SSR transport.

- **channel guard** (#1572) — `params ∩ queryNames(name) ≠ ∅`, i.e. a key the route declares as a **query** param supplied in the **path** bag. A **detector, never a normaliser**: the key is not moved (moving it is what channel separation does, and the nav-pipeline design removes that stage so channel-correctness becomes the producer's contract). Two positions, deliberately different reactions:
  - **P3 — `navigateToState` REJECTS** (`WRONG_CHANNEL`), mirroring the `ROUTE_NOT_FOUND` guard beside it: rejected promise + `TRANSITION_ERROR`, not a sync throw, because URL plugins call it from popstate handlers and a new sync throw would change an existing method's failure shape. It is the one producer taking a ready-made `State`, and there is no working form behind it — a pre-M2 layout commits silently corrupt (key in `state.params`, absent from `state.path`). `start()` commits through the same primitive, so the guard sits on every start including SSR hydration, at zero cost (a state produced by core is channel-correct by construction).
  - **P1 — `navigate` / `makeState` / `buildNavigationState` THROW** a `TypeError`, SYNCHRONOUSLY, on the caller's RAW argument before interceptors. Sync even on `navigate` (which otherwise reports failure through a rejected promise) because this is an ARGUMENT-SHAPE defect at the API boundary, caught before any transition exists — the same class as the `subscribe` / `start` guards; rejecting would let a `.catch()` written for navigation failures swallow a programming error. The warn-first step announced the contract so every call site could self-identify in the logs; this is the promotion it announced, shipped with its own test migration (~100 pins across core + 4 plugins, plus the `navigate/search-single-bag` benchmark arm, which measured a form that now throws).
  - `undefined`-blind (the persistent-key removal marker is not a mis-channel); inherits the `/items/:id?id` carve-out from `getQueryParams`, the same registry the URL build prints from (#1556), rather than re-deriving it; short-circuits on a route with no query declarations; and **never becomes the thing that throws** — an accessor-backed bag whose read throws is left to the consumer that actually needed the value, so a diagnostic cannot move the origin of an existing failure. **This guard** does not run on the predicates (`isActiveRoute` / `buildPath` / `canNavigateTo`): it is a SCAN over the caller's bag on every `<Link>` render, for a condition that is almost always absent, so correct links pay it too. The rule is the channel guard's own — **it is not core's policy on predicates, and the mode gate below makes the opposite call on purpose (#1581)**; see the render-path table at the end of this section for all three mechanisms side by side. **Not scanned ≠ blind, though (#1576):** `canNavigateTo` asks whether `navigate` WOULD work, so it consults the same predicate itself and returns `false` for the shape P1 throws on — an answer, not a throw, so the render-path trade is untouched. `isActiveRoute` / `buildPath` ask a different question and are unchanged.

### A route name is read as a property key — which doors gate, and why most do not (#1876 / #1881)

A route name reaches core's tables as a PROPERTY KEY, and `ToPropertyKey` runs
`toString` on anything that is not one. So a non-string name is not merely
wrong — it is a call into application code, and a value that answers differently
between reads is admitted as one route and indexed as another.

`ARCHITECTURE.md` **"Route-Name Type Gates"** owns the rule that decides which
doors carry a gate: a **stably-coercing** non-string must already do damage
there — run application code as a side effect, or produce an object whose own
fields disagree. A door that merely answers what the value's `toString` named
does not gate. These are not the invariant guards above: a gate answers the
door's own closed answer and never throws, and
`@real-router/validation-plugin` remains the thing that diagnoses.

**Gated — `defaultRoute` (#1876).** `navigateToDefault()` rejects with
`ROUTE_NOT_FOUND` and the reason `defaultRoute did not resolve to a route name`,
without reading the value. What it stops, measured on bare core with the gate
deleted, router on `/other`, an `any`-typed callback returning a bag: a bag
naming a route with `forwardTo` **navigates to the target** (6 reads) — a
transition nobody requested, and the reason the option is `string |
DefaultRouteCallback` yet not TS-provable. A bag naming a plain route rejects
`ROUTE_NOT_FOUND` at 4 reads, so the forwarding arm is the one that fails open
and `forwardState` is what carries it there. The callback form is untouched and
still re-evaluated per call. (`start()` has never consulted `defaultRoute` —
measured, zero calls for an empty path, an unmatched path and `/` alike.)

⚠ The gate exists for BARE core, and only there. With the validator installed
the `navigate` seam downstream refuses the same value as a `TypeError` — so
`navigateToDefault()` rejecting `ROUTE_NOT_FOUND` instead is the observable
proof that core answered first. What the validator cannot do is answer at the
CALL: `navigateToDefault()` takes no name argument, so an `any`-typed callback's
return only becomes visible inside core.

**Not gated, and no predicate may be re-introduced.** Measured on bare core,
router on `/home`, a bag whose `toString` returns `"fwd"` (`forwardTo: "home"`):

| door                   | answer                  | reads | with the validator |
| ---------------------- | ----------------------- | ----- | ------------------ |
| `isActiveRoute`        | `true`                  | 9     | throws, 0 reads    |
| `forwardState`         | resolves to `home`      | 6     | throws, 0 reads    |
| `buildNavigationState` | a State for `home`      | 6     | throws, 0 reads    |
| `navigate({ name })`   | rejects ROUTE_NOT_FOUND | 0     | throws, 0 reads    |
| `canNavigateTo`        | `false`                 | 0     | throws, 0 reads    |

Each answers exactly what the coercion named, which is what degrading means
here. A `typeof` on any of them restates an answer the opt-in layer already
gives, permanently, for a shape TypeScript already rejects — measured, the
validator covers all five including the two that need no help.

**Was the rule's damage side; CLOSED, and by a coercion rather than a gate.**
`buildPath` coerced **4×** and threw about a route that exists — **5×** on a route
declaring `encodeParams`, **whose encoder RAN** before the throw (#1889) — and
`makeState`'s four-argument form coerced **2×** and ANSWERED, returning a State
whose `name` was the caller's object beside the coerced route's `defaultParams`
(#1883). With `path` omitted it coerced **6×** and threw about a route that
exists.

`pipeline/canonicalize` now performs ONE `ToPropertyKey` for every producer that
reaches it, so all four numbers are **1** and both doors ANSWER what the first
read named. That removes the damage instead of refusing it, which is why the
rule stops earning a gate here: the fields agree afterwards. #1889's own two
residues — the encoder running before a guaranteed refusal, and a drift splitting
the encoder read from the matcher read — close with it, and its bind at
`buildPath` becomes unkillable (kept and declared so; the twin in `matchPath`
stays live, because a `forwardState` interceptor returns AFTER this coercion).

⚠ The terminal is shared, so the choice of coercion over a gate is the whole
design. A GATE here would have turned `isActiveRoute`'s `true` into `false` and
re-introduced one of the three predicates #1897 reverted. Measured on both
fixtures, the coercion changes `isActiveRoute` not at all — its `forwardTo` arm
reads the name ABOVE this terminal — and `navigate` / `canNavigateTo` never
arrive, refusing on a `Map` miss at zero reads. Pinned by the CONTROL cell in
`tests/functional/canonical-name-read-once-1883.test.ts`.

⚠ The four `getLifecycleApi` guard doors are the rule's THIRD clause, and the
only doors in the family that fail OPEN: they accept a non-string name with 0
reads and no error, then never find the guard (#1888). Nothing is returned, so
there is no answer to degrade into — a `canDeactivate` deny-guard is silently
never installed. A read-count instrument cannot see this one either: it coerces
zero times before and after. Not gated yet.

**A different question, and not a gate (#1896):** the five route-CRUD doors —
`createRouter([...])`, `add`, `replace`, `remove`, `update` — refuse a non-string
name at **0** reads and always did, because `assertNoInternalRouteName` is a
string method. Its type check exists so the refusal names the door
(`[router.removeRoute] Route name must be a string, got object`) rather than a
private local; the wording is validation-plugin's, byte for byte, pinned by
`packages/validation-plugin/tests/functional/bare-core-message-parity.test.ts`.
The constructor is the one that gains most — the plugin installs through
`usePlugin`, i.e. after construction, so it never had a message from either
layer. Same shape as `start()`'s guard, which turns a `codePointAt` crash into
`[router.start] path must be a string`.

**Unguarded at either level:** the exported `resolveForwardChain` coerces and
resolves the chain, returning what it would have returned for the string. It is
a free function with no validator seam — nothing for
`@real-router/validation-plugin` to hook, and that plugin is itself a consumer,
so "bare core degrades, the opt-in validator diagnoses" has nowhere to live.
⚑ That sentence describes the door only since #1882: the walk asked the same
question twice — `while (forwardMap[current])` tested one coercion and
`const next = forwardMap[current]` indexed another — so on a map
`{ alias: "users", other: "home" }` a name answering `"alias"` then `"other"`
resolved to **`home`**, the forward target of a route nobody named. With no entry
in the map it handed the caller's own OBJECT back, so the declared `: string` was
not true either. One read at entry — and one per HOP, because the map's declared
`Record<string, string>` has the same status the name's `string` has, and the
walk asked a hop the same two questions until the same fix reached it. It is a
COERCION rather than a gate for the reason the table above gives: a stable
non-string answers exactly what its `toString` names.

⚠ **A DEPENDENCY name is a different channel, and the doctrine above does not
reach it.** It is also read as a property key, but nothing here decides its
policy: `set` and `remove` coerce ONCE at the door and use that key for the
check, the old-value read, the diagnostic and the write (#1843 — before that they
coerced three times and two, so the key that was checked was not the one written
or deleted, which skipped the new-key limit check and mis-targeted a delete).
`get`, `has` and `setAll` were already single-read. There is no gate on any of
them, and a **symbol** name is exempt from the coercion entirely — a symbol IS a
property key, so nothing drifts, and coercing it diverges `set` / `remove` from
`has` / `get`. ⚑ Unlike `resolveForwardChain`, this family HAS a validator seam:
`validateDependencyName` refuses a non-string at **0** coercions, so everything
above describes bare core, and what the fix buys there is that the degradation is
the one the door's FIRST read names.

⚠ Do not restate any of this as "every entry point that takes a route name".
It was written that way once, from a sweep that was never enumerated, and three
doors refuted it.

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
├── routeGuards.ts       — in-flight guards for the destructive doors (validateRemoveRoute / validateClearRoutes / validateSetRootPath — the last one called from `api/getPluginApi.ts`, #1755) + `warnRemovalDuringNavigation`, the removal's in-flight REPORT, which is not a guard and is called after the removal (#1756)
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

**Initial-route guard factories flush last (#1331).** `canActivate` / `canDeactivate` factories from the initial route definitions are compiled and executed by `flushPendingGuards()` — the **final step of the constructor**, after all wiring and method binding — so a factory sees a fully-built router: read-only calls (`buildPath()`, `isActiveRoute()`, `getState()`) are safe. **Contract: a guard factory must be side-effect-free with respect to the router** (`navigate`, `usePlugin`, mutating route-CRUD are out of contract). Factories re-execute outside the constructor — `cloneRouter` re-compiles every definition guard on each clone, and route-CRUD compiles the batch it installs — so any side effect duplicates per re-execution. **The re-execution set is exactly the REGISTRATION paths (#1649):** `#recompileSlot` used to be in it, re-running a factory after a definition-only clear at a moment no caller could predict, and it is now a `Map` read over compiled forms stored beside their factories. So the contract is "compiled once per registration per router" with no unpredictable exception — and a factory that captures a dependency at compile time keeps the one it captured until something re-registers it. (`cloneRouter` defensively skips replaying a plugin that a contract-violating factory already registered on the clone, but the contract stands: register plugins outside factories.) The pending factories also flush sequentially, so `canNavigateTo` called from a factory would observe a partially-registered guard set. **A factory throw disposes the instance**: the constructor calls `dispose()` before rethrowing, so a router reference leaked from an earlier factory is fail-closed (`ROUTER_DISPOSED`) rather than a live router with later guards silently missing.

**A factory can no longer break the contract mid-commit, because it does not run there (#1649).** `completeTransition`'s post-leave cleanup clears the external `canDeactivate`, and when a definition factory survives that clear the slot is re-derived from it — by READING its stored compiled form. There is no application code in the window at all, so the scenarios below are unreachable rather than caught: a factory that would `dispose()` / `stop()` / renavigate from there never gets the turn. The same root fed `replace()`'s `clearDefinitionGuards` (#1627), and both sites closed together. Locked by `tests/functional/navigation/guard-factory-compiled-once-1649.test.ts`, which COUNTS factory invocations across a navigation (expected: zero) — restoring the invocation reds it and the `replace()` block alike. What follows is why the window used to need a verdict at all.

**How it failed while the factory did run (#1611).** The re-execution was not only a clone-time concern: the post-leave cleanup invoked the surviving definition factory — application code running one statement before `setState`. A `dispose()` / `stop()` from there used to let the commit land anyway: `navigate()` resolved, the router held a state committed after it was terminated, and `COMPLETE` from `DISPOSED`/`IDLE` being a table no-op meant **no `TRANSITION_SUCCESS` reached anyone**. The commit is now asked of the TABLE — `when: mayCommit` on the `COMPLETE` edge, which refuses a payload that is not the navigation in flight (a superseded one, including one the factory itself started) and a router with nothing in flight — and the navigation rejects `TRANSITION_CANCELLED`. It began as an `isTransitioning()` re-check on the same side of the factory as `setState`; there is no `setState` any more, so the two halves it carried became the two clauses of one edge condition (#1641). The #1169 commit-gate does not cover this — it sits _before_ `completeTransition` and is `suspendable`-gated, while the defect reproduces on the uncancellable `completeImmediate` arc. INVARIANTS "Committed-state ownership" #3.

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

**An interceptor may NOT start a navigation (#1610).** `navigate` / `navigateToDefault` / `navigateToState` / `navigateToNotFound` called from inside a `forwardState` or `buildPath` interceptor, a route's `encodeParams` or dynamic `forwardTo` callback, or a `defaultRoute` / `defaultParams` / `defaultSearch` option callback throws `RouterError(REENTRANT_NAVIGATION)` synchronously — the same ban transition listeners get, extended to the **pre-start** window. ⚠ **`decodeParams` is NOT in that list, and the enumeration used to claim it was (#1713):** it serves the URL→state direction and runs from `matchPath`, which prepares no navigation and is deliberately outside the ban — measured, `navigate()` invokes a route's decoder zero times. The `forwardTo` callback is the mirror error, omitted while covered; a developer who hit the throw from one was told about someone else's window, the shape #1665 exists to prevent. ⚑ Since #1647 the ban also covers the `$start` dispatch (a plugin's `onStart`, a raw `ROUTER_START` listener): `emitRouterStart` was the one router emit that did not raise the dispatch depth, which is exactly why that window needed a predicate of its own until it did. Those hooks all run BEFORE the transition is announced, which is exactly why the listener-side ban could not see them: it keys off the emitter's dispatch depth and there has been no emit yet. Left unguarded, a nested navigation ran to completion — it committed a state the outer navigation overwrote a tick later (a phantom `TRANSITION_SUCCESS` for subscribers) and shifted the outer transition's `fromState` to wherever it had stopped. Defer instead (`queueMicrotask` / `await`). Not affected: a **guard** (it runs after the announce, so the classic guard-redirect stays an ordinary supersede) and `matchPath()` (same `buildPath` chain, but it prepares no navigation). Carried by `NavigationNamespace.isPreparing()`, read by `Router.#assertNotReentrant` alongside `EventBus.isProcessing()` — INVARIANTS "Reentrancy & dispatch" #4 and "Committed-state ownership". ⚑ **The two halves throw the same code with DIFFERENT messages (#1665)**, because one text cannot serve both: "you are inside a listener" is false in the pre-start window, where no emit is on the stack at all, and a developer told that reads their error as spurious. Unlike a state error (`ROUTER_DISPOSED`, `SAME_STATES`) this code names a RULE, and the remedy does not follow from the name — while it lived only in prose it produced two docs issues (#1203, #1219) and nothing else. Locked by an AST scan over `src` (`tests/functional/reentrancy-ban-messages.test.ts`), so a third ban added later cannot ship bare.

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
**Cleanup order**: abort navigation → cancel transition → stop (if ready/transitioning) → FSM DISPOSE (**this is where the committed pair is zeroed**, on the edge's `resetState` update) → clearAll (events) → plugins → router extensions (safety net) → context claims (safety net) → interceptors (safety net, #1199) → routes → lifecycle → deps → markDisposed

⚠ **The state step MOVED, and it is a behaviour change, not a reorder of equals (#1641).** It used to be `#state.reset()`, second-to-last, i.e. AFTER `plugins.disposeAll()`; the zeroing now rides the `DISPOSE` edge, which is several steps earlier. The accessor it is observable through is **`getPreviousState()`**: a plugin's `teardown()` reading it sees `undefined` where it used to see the state the router was disposed from (measured on both sides — `getState()` was ALREADY `undefined` there, since `dispose()` routes through `stop()`, which clears the current state before the plugin teardown step; only the `previous` cell survived that far). The radius was measured as nil — core does not touch the state in that window and no `teardown()` body in the repo reads it — but `teardown` is public API, so this ships under a changeset rather than as an internal move.
**After dispose**: All mutating methods throw `RouterError(ROUTER_DISPOSED)`
**Idempotency**: Second call is a no-op (FSM state check)

### Cloning Semantics (SSR)

`cloneRouter(router, deps?)` (standalone API, `api/cloneRouter.ts`) builds an independent router for **SSR per-request isolation** — one base router per process, one clone per request. The clone is always constructed fresh (FSM `IDLE`, no committed state) regardless of the source's lifecycle state; cloning a disposed router throws `ROUTER_DISPOSED`.

| Subsystem                                                                                     | Clone behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route tree                                                                                    | **Rebuilt** from serialized definitions (`routeTreeToDefinitions` → constructor) — not shared                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Root path (`rootPath`)                                                                        | **Carried over** — the source's `setRootPath` value is re-applied so the clone builds/matches under the same sub-path (#1175)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Options                                                                                       | Shallow spread, with THREE substitutions: the clone's own resolved logger config, the base's already-snapshotted `urlParamsEncoding` key (#1877), and the base's resolved `limits` — restricted to the keys the base actually passed (#1875 / #1880). None is coerced per clone, and for the latter two the clone's `getOptions()` reports the resolved value rather than the caller's. ⚠ The `limits` substitution carries the base's KEY SET, not the whole resolved bag: materialising the unset defaults puts `warnListeners: 1000` beside a small `maxListeners`, a pair `validation-plugin` refuses at install. Everything else is ref-shared, which is safe because options are deep-frozen |
| Dependencies                                                                                  | **Shallow merge** — the base's keys, then the caller's over them; top-level keys fresh, **values shared by reference**. The caller's bag goes through `ingestDependencies`, the same door the constructor uses, so it is refused if it is not a plain object or carries an own enumerable getter (#1860 — it used to be spread into a literal BEFORE the guard could see it, and a `Map` silently became `{}` on every request). ⚠ An explicit `undefined` from the caller is ABSENCE, not a removal marker: the base's key survives it, per `undefined is absence` (#1550/#1551). The literal spelling `{ ...sourceDeps, ...deps }` implied the opposite and did behave that way                  |
| Config (decoders / encoders / forwardMap / `defaultParams` / `defaultSearch` / custom fields) | `Object.assign` shallow — per-route objects **shared by reference**; copied **before** guards/plugins so re-run factories see the full config (#1176/#1338)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Lifecycle guards                                                                              | Re-registered **preserving origin** (definition stays definition, external stays external — #676); the effective guard is **external-wins**, so the clone runs the same guard as the base (#1174)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Plugins                                                                                       | Factories re-run on the clone — **fresh instances**, fresh `state.context` claims                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| State / FSM / EventEmitter / interceptors / `hydrationState` / `contextClaimRecords`          | **Reset** (fresh per clone)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

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
  ├── IMMEDIATE PATH (!hasGuards && !suspendable — разрез А, #1588):
  │   hasGuards asks about the guards of THIS transition — a guard on a route
  │   the walk never reaches does not arm anything (see Performance Notes)
  │   └── completeImmediate() → sendLeaveApprove + completeTransition
  │       nothing can cancel it and nothing in it can suspend, so the
  │       cancellation machinery is not skipped here — it is ABSENT:
  │       no AbortController, no liveness closure, no commit-gate,
  │       and the return is a bare State, not a Promise
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
  │       → completeTransition() → ask + FSM send(COMPLETE) → commit update writes the pair,
  │                                    action emits TRANSITION_SUCCESS
  │       → return Promise.resolve(state)
  │
  └── ASYNC PATH (async guard detected):
      └── finishAsyncNavigation(guardCompletion, ...)
          ├── receives AbortController (set up upfront when guards/leave-listeners present)
          ├── await guardCompletion
          └── completeTransition() → same as sync
```

**Key optimization:** On the pure hot path (no guards, no `subscribeLeave` listeners) the navigation runs fully synchronously — no AbortController, no async/await, no microtask delay. Sync guards/listeners still complete inline (no await) but allocate an AbortController that is released unaborted on success.

On error at any step: `emitTransitionError()` → `Plugin.onTransitionError()` → Promise rejects with `RouterError`.

**Cached error fast paths:** Common rejections (SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND) return pre-allocated `Promise.reject()` instances from `constants.ts` — zero allocation per rejection. The three error instances are **frozen** (#1606): they are handed to arbitrary consumer code process-wide, so an in-place write — core's own `rethrowAsRouterError` used to `setCode` a caught one when a guard awaited a rejecting navigation, permanently poisoning the singleton's code for every later consumer (SSR: across requests) — now fails loudly instead of corrupting silently. Internal rule: **never mutate a caught error you do not own**; `rethrowAsRouterError` re-codes a copy.

**`navigateToNotFound()` bypasses this pipeline — but not the machine, and no longer the guards.** It emits only `TRANSITION_SUCCESS` (no `TRANSITION_START`, no AbortController) and always passes `{ replace: true }` as opts. Two of the three "no"s this line used to carry are gone:

- **It takes a `SYSTEM_COMMIT` edge** (#1641), so the committed pair shifts for it like it does for a navigation. "No FSM transition" was true until the state moved into the machine's context.
- **It asks the current route's `canDeactivate` guards** (#1643). Only the ACTIVATION half of "bypasses the pipeline" ever followed from being a 404 — there is nothing to activate at `UNKNOWN_ROUTE`, but there is very much something to deactivate, and the shipped URL plugins call this from their popstate / navigate handlers. So an editor with unsaved changes lost them to any URL that no longer matched a route, with the app's own confirm dialog never shown. A refusal **throws** `CANNOT_DEACTIVATE` and emits `TRANSITION_ERROR`, which is exactly what the surrounding handlers already expect — the matched-route branch beside it rejects and its `catch` rolls the URL back, and the strict-mode branch throws for the same purpose. An async guard cannot be answered by a synchronous primitive and resolves to **refuse**, mirroring `canNavigateTo`: the fail-safe direction for a guard whose job is preventing loss is "do not leave".

  **`replace()`'s revalidation opts out on every arm, and that is a RULE, not two exceptions (#1652).** A tree swap is an operation the application performed, not a departure the user chose, and there is no "stay" branch to offer: after the swap the old route may not exist, or may live at another path, so a retained state would point at a route that no longer owns its URL. ⚠ The route-identity arm used to be the odd one out — it asked through `canNavigateTo`, whose ONE boolean collapses "cannot enter" and "do not leave", and routed both to not-found. Measured: with no `canDeactivate` the user landed on the new route, WITH a refusing one on `UNKNOWN_ROUTE` — a guard that could not be honoured was making the outcome worse than no guard at all. It now asks the ACTIVATION half only, so all three arms agree (survivor: the user was legitimately here, #1201; vanished: the route whose guard would speak is gone). Side effect and an improvement: the refusal used to short-circuit before activation ran, so "may the user be on the new route" went unasked — now it always is. `start()` needs no opt-out — nothing is committed yet, so the consult short-circuits. ⚑ Since #1981 the opt-out is a NAMED DOOR rather than an argument: the three arms call `revalidateToNotFound`, the departure path calls `navigateToNotFound`, and there is no longer a shared entry where a flag picks the lane.

**Fire-and-forget safety:** `navigate()`, `navigateToDefault()`, and the `navigateToState()` plugin primitive internally suppress unhandled rejections for expected errors (`SAME_STATES`, `TRANSITION_CANCELLED`, `ROUTER_NOT_STARTED`, `ROUTE_NOT_FOUND`, `CANNOT_ACTIVATE`, `CANNOT_DEACTIVATE`), so calling them without `await` is safe (#721). A guard block (or a plugin's guard-blocked `back()`/`forward()`) is an expected outcome, not an internal error — the safety net stays silent; `await` the call or use an `onTransitionError` plugin to observe a guard rejection. (A **synchronous** reentrant navigation from inside a transition listener is **banned** — it throws `REENTRANT_NAVIGATION` at the facade, RFC navigation-cancellation-unification §4 — so there is no self-feeding chain to suppress; the former #945 `RecursionDepthError` carve-out is gone.)

### NavigationNamespace File Structure

```
namespaces/NavigationNamespace/
├── NavigationNamespace.ts     — the entry points (navigate / navigateToState /
│                                navigateToDefault / navigateToNotFound), their
│                                #settle fire-and-forget checkpoint, private cores,
│                                and the DI bag. Nothing else.
├── constants.ts               — cached error instances (CACHED_*_REJECTION),
│                                SUPPRESSED_ERROR_CODES, PRE_SUPPRESSED
├── types.ts                   — NavigationContext, NavigationPlan, NavigationDependencies
├── index.ts                   — exports
└── transition/
    ├── executeNavigation.ts   — executeNavigation() + the two-pass prologue
    │                            (beginTransition / planPhases), completeImmediate(),
    │                            finishAsyncNavigation(), handleNoGuardsLeave(),
    │                            abortPreviousNavigation()
    ├── guardPhase.ts          — executeGuardPipeline(), runFrom(), resumeFrom(), runPhase(), runStep()
    ├── completeTransition.ts  — completeTransition(), buildTransitionMeta()
    ├── navigateToNotFound.ts  — the one commit primitive that is NOT a transition
    └── errorHandling.ts       — handleGuardError(), routeTransitionError(), resolveAsyncGuard()
```

**The namespace holds no per-navigation state at all, and that took three passes (#1607 → #1664 → #1684).** It began as `#currentController` + `#navigationId` — one sub-domain with a small owner set (four members and three, against thirteen that need the DI bag) — and naming it `InFlightNavigation` is what let the orchestration around it become plain functions. The token half went at #1664: the machine already answered "am I still the navigation in flight?" by comparing the plan it adopted, so the pipeline asks it (`deps.isCurrentNavigation(plan)`) instead of counting in parallel. ⚑ **The controller half went at #1684, and the class with it** — it is a field of the plan now (`NavigationContext.controller`), which the machine carries as `ctx.inflight`, so the `CANCEL` action reaches it by identity and every signature here is over `(deps, plan)`. The namespace went 962 → 327 lines at #1607, and the wire that fed the old slot — `EventBusOptions.abortController`, the closure in `Router.ts`, `NavigationNamespace.abortCurrentController` — is gone across four files.

⚠ **Ownership is TRANSITIVE, and that is what fixed a parity gap rather than only shortening the code.** A router-level slot has a lifetime of its own, so the pipeline had to null it on the way out — and it did so BEFORE the commit on every synchronous arc. Two consequences, both real: the FSM `CANCEL` action could find the slot already empty, and the guard-free leave arc's controller (local to `handleNoGuardsLeave`) was invisible to the failure handler, which is why a cancelled navigation there handed its `subscribeLeave` listener a signal that never aborted. A field of the plan has no lifetime of its own — it dies with the navigation the machine is carrying — so neither is expressible. Pinned by `controller-ownership-1684.test.ts`, whose guard arc is the CONTROL.

⚠ **The controller is still allocated CONDITIONALLY, and that is unchanged.** The call sites keep their own conditions — the guard branch allocates unconditionally, the guard-free leave arc only `if (hasLeaveListeners())` — because an external `opts.signal` or a pre-commit listener makes a navigation _suspendable_ without giving it anything to hand a signal to. Filling the slot for every navigation is the regression Step 1b of #1588 refused by measurement, and moving ownership does not license it. Pinned by `controller-allocation.test.ts` (counts allocated controllers; the forbidden edit fails two of them). ⚑ **Since #1706 they all go through ONE door — `openController` — and there is exactly one `new AbortController()` in the file.** The conditions did not move; what the door adds is that a controller opened AFTER the machine cancelled the navigation is born aborted, from the `cancelReason` the `CANCEL` action records on the plan. It is also idempotent, because the guard-free leave arc opens one before the announce and asks again after it, and replacing the signal the listeners were handed is the #1697 defect.

**Guard pipeline** (`guardPhase.ts`) — **one program, two interpreters** (#1588). The program is three fixed phases (`0 = deactivate`, `1 = leave`, `2 = activate`) walked by a cursor of two numbers. `runFrom()` is the synchronous interpreter: it walks until a step hands back a Promise, then stops and returns a `Suspension` saying where. `resumeFrom()` is the asynchronous one: it settles that Promise and hands the cursor straight back to `runFrom()`. `runPhase()` applies the phase's short-circuit (`shouldDeactivate` / `shouldActivate` — these carry `opts.forceDeactivate`, so they are contract, not an emptiness test) and `runStep()` runs one step. `executeGuardPipeline()` keeps the same outer contract as before: `undefined` when everything ran synchronously, a `Promise<void>` otherwise.

This replaced three orchestrators (`executeGuardPipeline` / `finishAsyncPipeline` / `finishAfterAsyncLeave`) and two copies of the guard loop (`runGuards` / `resolveRemainingGuards`). The payoff is **one cancellation check instead of eight**: five of the eight were mutationally unkillable — their breakage was as invisible as their removal, because the liveness check in `finishAsyncNavigation` already covered any navigation that reached them. The single check in the head of `runStep()` sits where nothing else guards it; removing it fails four tests.

**`NavigationContext` / `NavigationPlan`** (`types.ts`): `NavigationPlan` is what a navigation actually builds — everything worked out before any guard runs, filled in **two passes** across the `TRANSITION_START` emit (`suspendable` must be read before the pre-commit listener window, the guard maps after it, since a `TRANSITION_START` listener may still register a guard). It **extends** `NavigationContext`, so the same object is handed to `completeTransition()` / `finishAsyncNavigation()` instead of a second literal — one context object per navigation. ⚑ **Every field the pipeline needs from the caller's `opts` is on it, read ONCE at the entry:** `externalSignal` (#1690), `forceDeactivate` (#1690) and the meta's three flags — `reload` / `replace` / `redirected` (#1719). The reason is one and the same: `opts` is accessor- or Proxy-backed by contract, so every read is a call into application code, and a second read may answer differently. Below the entry the router asks the PLAN and never the caller's object — and since #1962 that is literal rather than nearly true: the entry door copies the bag once, above every read but the signal's, so the caller's object is read **zero** times below the announce. The announcement used to hold the last one (`stripSignal`'s spread, defended on the ground that it stands where application code already runs); with `payload.opts` already core's own frozen record there is nothing left for it to strip.

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

Sync listeners run inline; a sync throw rejects `navigate()` with that **original error** and emits `TRANSITION_ERROR` — it is **not** converted to `TRANSITION_CANCELLED`. The first sync throw wins, and a sync throw takes priority over any async listener rejection. The `signal` in the payload aborts when the navigation is **cancelled** — superseded by a newer `navigate()`, `stop()`, `dispose()`, or an external `opts.signal` abort — **or fails** (a sync leave throw, a rejecting activation guard), and **never** on successful completion. This holds identically on the guard and no-guards pipeline paths — ⚑ **since #1684 it actually does.** The controller is a field of the navigation, so the failure handler reaches it on both arcs; before that the no-guards arc kept it local and released it as a success, and a cancelled navigation there left the captured signal unaborted while the guard arc aborted it correctly (#1197 had closed the ASYNC half of the same arc). Success still never aborts: nothing releases the controller at all now, it simply dies with the navigation, so a listener that captured the signal still observes `aborted === false` after the navigation commits (#722).

**`subscribe(listener)`** — subscribe to `TRANSITION_SUCCESS` (post-commit). In contrast to `subscribeLeave`:

- **Fire-and-forget:** listeners are invoked synchronously from `EventEmitter.emit`; returned Promises are **not awaited** — `router.navigate()`'s returned Promise resolves before an async listener's body completes. The listener's return value is ignored, but **a rejected Promise from an async listener is isolated by core** (#944): the subscribe wrapper just returns the listener's runtime value to the `EventEmitter`, whose **central isolation** (#1412) inspects the return value and routes a rejected thenable to the same `onListenerError` sink a synchronous throw flows through, so it does **not** leak as a Node `unhandledRejection` (which would terminate the process under `--unhandled-rejections=strict`, the Node 22+ default). The same central isolation covers **raw plugin hooks** (`onStart`, `onTransitionSuccess`, …) — an `async` hook that rejects is isolated identically, not only `subscribe` listeners (#1412). Symmetric with `subscribeLeave`, which awaits listeners via `Promise.allSettled` and isolates their rejections. A **synchronous** reentrant `router.navigate()` (or `navigateToDefault`/`navigateToState`/`navigateToNotFound`) from inside a transition listener is **banned** — it throws `RouterError(REENTRANT_NAVIGATION)` synchronously at the facade (RFC navigation-cancellation-unification §4); inside a listener the emit's `onListenerError` isolation surfaces it non-fatally. The same ban covers the **pre-start** window since #1610 — interceptors and codecs, i.e. the other side of the announce (see "Plugin Interception Points") — and the **`$start`** dispatch since #1647, so a plugin's `onStart` is on exactly the same footing as an `onTransitionSuccess`. Deferred (async / `await`ed / `queueMicrotask`) navigation from a listener is allowed (the transition has settled, FSM is `READY` again) — "navigation after navigation" should use `await navigate(...)`, an async listener, or `navigate(...).catch(...)`.
- **Listener signature:** `(payload: { route: State, previousRoute?: State }) => void` — no `signal` (no cancellation, the transition already committed).
- **Invocation order:** `router.subscribe` listeners fire in registration order, all before `navigate()` resolves. Do not rely on other subscribers having run their async tails when your listener executes.

**`navigateToNotFound()` bypasses plugins and ACTIVATION guards:** plugins only see `onTransitionSuccess` (no `onTransitionStart`), and there is nothing to activate at `UNKNOWN_ROUTE`. It DOES consult the current route's `canDeactivate` (#1643) — leaving is still leaving, and this is the primitive the URL plugins call on an unmatched Back.

### When `navigate()`'s Promise resolves vs subscribers

```
navigate()
  ├── deactivation guards (sync/async)
  ├── LEAVE_APPROVED: subscribeLeave listeners  ← awaited (blocks pipeline)
  ├── activation guards (sync/async)
  ├── completeTransition():
  │    ├── ask the table (canCommitTransition) — may refuse
  │    ├── send(COMPLETE) → the edge's update writes current/previous
  │    └── the edge's action emits TRANSITION_SUCCESS → subscribe listeners fire synchronously
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
4. **Clear definition guards** — `clearDefinitionGuards()` preserves external guards; for a **both-slot** name (definition + external) it re-derives the compiled function from the surviving external guard (external-wins, so the compiled slot is already that guard — the re-derivation is idempotent — #1192/#1174). It READS that guard's stored compiled form rather than re-running its factory (#1649), so this step executes no application code and the swap cannot be torn down from inside itself
5. **Atomic swap** — `adoptRouteArtifacts()` assigns the prepared artifacts into the store in one pass (pure assignment, never throws) and registers the collected guards
6. **State revalidation + notify (#950, hybrid #1201)** — `matchPath(currentPath)` decides the next committed state:
   - **no match** → `navigateToNotFound(currentPath)` (commits `UNKNOWN_ROUTE`, emits `TRANSITION_SUCCESS`) instead of silently dropping the committed state. ⚠ This line named `clearState()` as the alternative until #1749 deleted that primitive; there is no way to drop the pair outside the table any more, so the contrast is with the SHAPE, not with a call you could still make.
   - **survivor** (URL still maps to the SAME route name) → keep it, carrying the prior `context` (plugin data — #1236) and route-meta; guards are **not** re-run (the user was already legitimately here — parity with `update()`, #1201).
   - **route-identity change** (URL now owned by a DIFFERENT route, or a newly-added `forwardTo` teleport) → consult the new route's activation guards synchronously (`store.lifecycleNamespace.canNavigateTo`, #1201); commit on pass, `navigateToNotFound(currentPath)` on a block — or an async guard that can't be evaluated synchronously — so a guarded route is **never silently activated**.
   - ⚑ **The commit itself is a DOOR, and it asks whether the URL's owner MOVED while the window ran (#1753 / #1754).** Both arms above run application code between `matchPath` and the commit — the survivor arm through the route's own `decodeParams` (invoked by that very `matchPath`), the identity arm additionally through the guards it consults — and either can reach back into route-CRUD, since no navigation is in flight and the `TREE_CHANGED` dispatch has already returned. So `commitRevalidated` re-reads `store.matcher` and falls through to `navigateToNotFound(currentPath)` when the state it is about to commit is no longer the right one. ⚑ The question is OWNERSHIP, and it is asked as a DIFFERENCE (#1754): the raw matcher is asked who owns the URL before the window and again at the door, and the commit is refused only if the answer changed. Not an equality against `state.name` — that form was written first and 404'd two healthy configurations, `rewritePathOnMatch: false` and the #1157 rebuild fallback, both of which commit `{ terminal, sourceUrl }` on purpose. `hasRoute` — what #1753 shipped — closes only "the route is gone", and the NAME is the one field the window can leave untouched while invalidating the rest (a nested `replace()` reusing it at another path, a `setRootPath`, an `add` of a more specific route). Ownership subsumes existence, so it REPLACED that check rather than joining it. Affordable because the raw matcher runs no application code — the decoder, the `forwardState` seam and the encoders all sit above it — so the predicate cannot re-open the window it guards; ⚠ and the tier measurement that preceded it (515 firings, 512 agreements) validated the EQUALITY form, which was then found to 404 two healthy configurations — it is recorded as the lesson that the tier's shapes are not the reachable shapes, NOT as clearance for the difference form that replaced it. ⚠ Boundary: a `forwardTo` installed in the window is NOT caught, because resolving the chain would run dynamic callbacks and interceptors. It used to ask nothing: `systemCommit` answers "is the MACHINE somewhere a commit is legal" — an edge declared on `READY` alone since #1644, so it refuses a perfectly LIVE router that is starting or mid-transition, and it never asks about the route. The comment above the commit meanwhile asserted the window held no caller code at all; that is true of the guard FACTORY #1649 removed and false of at least four other things, the decoder and the consult among them. Two shapes measured: a guard removing the very route it was consulted about, and a nested `replace()` from a decoder dropping the route the outer call then re-committed over that nested call's own honest 404. ⚑ The site set is derived and PINNED by `tests/functional/commit-door-authority-1753.test.ts`, which walks `src` for CALLS to a commit primitive: three sites outside the DI plumbing — `completeTransition`, this one, and `navigateToNotFound`, the one deliberate exemption (it commits `UNKNOWN_ROUTE`, which is not a route to look up). ⚠ `navigateToState`'s check is NOT in that set and cannot be: it asks the same question one layer above its commit and reaches the pair through `completeTransition`, so it is covered behaviourally (`navigation/navigate/error-context.test.ts`) rather than by the walk. Writes to the pair that carry no state — `STOP` and `DISPOSE`, both table edges — are the subject of `committed-state-authority.test.ts` instead, which since #1749 whitelists ONE file: `StateNamespace.clearCommitted` was the last non-table writer and it is deleted, so the cells are `readonly` on `RouterFSMContext` and a foreign write is `TS2540`.
     Either way `router.subscribe` / `useSyncExternalStore` adapters are notified, so they re-render instead of showing the pre-replace state. The revalidation `TRANSITION_SUCCESS` carries a distinguishable `revalidate: true` opt (#1201) so a plugin's `onTransitionSuccess` can special-case a revalidation vs a real navigation (both otherwise carry only `replace: true`). **This is the one structural mutation that emits a transition event** — and since #1612 it is the one that CAN, because `clear()` no longer runs on a router that has state to lose. A consequence: plugins' `onTransitionSuccess` fires for a `replace()` revalidation, and after a drop `getState()` is `UNKNOWN_ROUTE` (not `undefined`).

**`clear()` is a teardown primitive, and its atomicity is a different CLASS from `replace()`'s (#1612).** Two things to keep straight:

- **Precondition.** `clear()` throws `RouterError(ROUTER_NOT_STOPPED)` while a state is committed — it is legal before `start()` and after `stop()`, and `replace(routes)` is the tool for swapping the tree on a running router (atomic, notifies subscribers, and preserves external guards, which `clear()` deliberately does not). It used to reset the state silently, leaving every `router.subscribe` consumer rendering a discarded route and the router in `isActive() === true` with no state — the transient two-phase-start shape, made permanent. Announcing the reset instead was measured and rejected: it would make CRUD emit a transition event as a rule and would not remove the shape. The throw (rather than the `logger.error` + no-op the navigation-in-progress precondition uses) is the `REENTRANT_TREE_MUTATION` line: waiting fixes that one, only a code change fixes this one. Design note `.claude/fsm-as-state-owner-2026-07-31.md` §11.A1, option (в).
- **Atomicity class.** `replace` / `add` / `update` are prepare-then-commit with pre-flighted validation — a **declared** contract. `clear()`'s is **structural**: `resetStore` → `clearAll()`, two steps with no try/catch that hold together only because no user code runs in them. Do not read `replace`'s guarantees onto it by analogy, and treat a callback landing in either as a contract break rather than a refactor — INVARIANTS "Route Management" #17 and #18. ⚑ It was three steps until #1749, the third being a shift of the committed pair; `clear()` touches no state cell now, so `getPreviousState()` survives it exactly as it survives `stop()`.

**Guard origin tracking**: the factories live in `Map`s, and the two methods that hand them out — `getFactories()` (two records) and `getFactoriesByOrigin()` (four) — materialise them into `Object.create(null)` dictionaries keyed by a ROUTE NAME. The null prototype is load-bearing, not cosmetic (#1801): core accepts a route named after any of `Object.prototype`'s twelve own members, and the two consumers read these records DIFFERENTLY — `getRoutesApi` asks `name in record`, `cloneRouter` walks `Object.entries(record)`. A plain `{}` therefore failed twice over, and differently: an inherited member answered the `in` test (a phantom `canDeactivate` in `get()` and in the `TREE_CHANGED` payload), while a `"__proto__"` write hit the inherited setter and left no own key to enumerate, so the clone silently lost a blocking guard. The records never escape to a consumer — `enrichRoute` copies the factory out onto an ordinary object — so nothing observable is null-prototype. `RouteLifecycleNamespace` tracks guard origins with four Maps split by origin (`#definitionActivateFactories` / `#externalActivateFactories` / `#definitionDeactivateFactories` / `#externalDeactivateFactories`), populated via the `isFromDefinition` parameter on `addCanActivate()`/`addCanDeactivate()` — REQUIRED since #1977, with no default, so every caller commits to a lane exactly as the clear side already demanded (#1171). Its default used to be the MINORITY polarity, and a forgotten argument filed a definition guard as external, where `clearDefinitionGuards()` does not reach it. Resolution is **external-wins regardless of registration order** (`#registerHandler`, #1174): when a route holds both a definition and an external guard, the compiled slot is the **external** one — a definition registered while an external is live is stored (for a later `clearDefinitionGuards()`) but does **not** overwrite the compiled function. `clearDefinitionGuards()` clears the two definition Maps and, for a name that _also_ holds an external guard, **re-derives** the compiled-function slot from that surviving external guard (#1192) — idempotent under external-wins (the slot is already external), so external guards survive `replace()` in behavior, not merely in the Map. **One policy** across `#registerHandler` / `#recompileSlot` / `clearDefinitionGuards`, so a clone's fixed definition→external replay yields the source's effective guard with no extra origin tracking (#1174). ⚑ **The re-derivation READS, it does not re-compile (#1649):** four further Maps hold each factory's compiled form beside it, split by the same origin×type, so no application code runs inside `replace()`'s swap (the #1627 site) or `completeTransition`'s cleanup. Factory and compiled twin are one unit — they are written, cleared and rolled back together.

**Key files**: `getRoutesApi.ts` (`replaceRoutes` helper), `routesStore.ts` (`buildReplaceArtifacts()` / `adoptRouteArtifacts()`), `RouteLifecycleNamespace.ts` (guard tracking).

### A route NAME carries no dot (#1763)

`createRouter`, `add` and `replace` refuse a route definition whose own `name`
contains a dot — `{ name: "users.view" }` where the nesting belongs in
`children` or `{ parent }`. The message is the one
`@real-router/validation-plugin` has always thrown, because the rule is not new:
it lives in `engine/validation/route-batch.ts` (`validateRouteName`) and was
reachable only through `validateRoute`, which core exports FOR the plugin and
never called itself. Bare core tolerated a spelling the project's own validation
layer rejected — the same asymmetry #1047 closed for the reserved `@@` prefix.

⚠ Only a DEFINITION's own name. A dotted name is still how a nested route is
ADDRESSED — `get` / `update` / `remove` / `navigate` / `isActiveRoute` /
`{ parent }` all take the full dotted form, and pinning that boundary is half of
`tests/functional/routes/dotted-leaf-names-1763.test.ts`.

⚠ The migration is EXACT, which matters for whether this rule costs anything.
Plain nesting moves the URL (`/view` becomes `/users/view`), but the **absolute**
marker keeps it: `children: [{ name: "view", path: "~/view" }]` yields the same
`users.view` at the same `/view`. So every flat spelling has an equivalent in
both name and path — the refusal buys correctness without retiring a capability.

**What the refusal buys is structural, and it is why this shipped instead of a
fifth local fix.** A dotted LEAF is a standalone node whose name merely LOOKS
like a path through the tree, and predicates across four packages read that
resemblance as ancestry: `isActiveRoute` reported a `<Link to="users">` active
while the address bar showed another route (#1763), `remove()` purged a
surviving route's config and guards (#1757), and #1194's `add` / `buildPath`
halves. Two of them — `route-utils`'s exported `areRoutesRelated` and `solid`'s
`isRouteActive` — take names ONLY and have no tree to consult, so no local fix
could ever reach them. Refusing to CREATE the shape makes every reader correct
by construction, which is the one thing enumerating readers cannot do.

### Route CRUD during active navigation

Six doors react differently to an in-flight navigation (`isTransitioning()`) — the five mutating route-CRUD ops on `getRoutesApi`, plus `setRootPath` on `getPluginApi` (#1755, which is not route-CRUD and not on that surface):

| Op            | During navigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`         | no check — proceeds silently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `update`      | `logger.error` warning, then **proceeds** (an in-flight navigate may read the new config) — and the warning sits BELOW the existence check (#1756), so `update("nope")` logs nothing at all rather than announcing an update its own #1205 backstop then skips                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `remove`      | route you are ON (or a real ancestor of it — the name PREFIX, which IS ancestry now that a route name cannot carry a dot, #1763; #1757 had to walk the matcher's segment chain for it, and that walk decided nothing once the spelling was refused): `logger.warn`, **no-op** (always blocked). Anything else: `logger.warn`, proceeds — the warning is emitted AFTER the removal (#1756), so a `name` that is not a route gets only `not found. No changes made.` and is not told a navigation may have died of a removal that never happened. That report lives in `warnRemovalDuringNavigation`, not in the gate: `validateRemoveRoute` decides whether the removal may happen, the report describes what one DID. If what you removed is the route being navigated TO (or its ancestor), `completeTransition`'s existence check then fails that navigation — and the code is a CHANNEL split, not only an arc split (#1756): the rejected `navigate()` promise carries `"CANCELLED"` while the guard walk is synchronous and `"ROUTE_NOT_FOUND"` once it has gone async, while `onTransitionError` reports `"ROUTE_NOT_FOUND"` on both and `onTransitionCancel` never fires. An unrelated route leaves the navigation to complete. ⚠ That ANCESTOR half used to hold only for a WELL-FORMED tree — under a flat dotted name the door, which asks `hasRoute(toState.name)` for the terminal alone, let the navigation commit with `transition.segments.activated` naming a route `has()` denies (#1194). Every tree is well-formed now: bare core refuses a dotted name at registration (#1763), so the shape is unconstructible rather than merely unlikely |
| `clear`       | committed state → **throws** `ROUTER_NOT_STOPPED` (#1612). Inside `start()` the answer depends on WHICH of its three arms you are in (#1750): from an async `start` interceptor or a plugin's `onStart` / a raw `$start` listener, `isTransitioning()` is `false`, so it **applies** and the boot degrades — `UNKNOWN_ROUTE` under `allowNotFound`, `ROUTE_NOT_FOUND` without it; from a guard or `onTransitionStart` OF the start navigation it is `true`, and it is a `logger.error` **no-op**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `replace`     | `logger.error`, **no-op** (blocked — shares `validateClearRoutes`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `setRootPath` | `logger.error`, **no-op** when the root's PATH half changes (#1755); a `?`-declaration-only change is allowed — it moves no paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The asymmetry is intentional: `clear`/`replace`/`setRootPath` are destructive whole-tree operations (blocked mid-navigation — `setRootPath` rebuilds tree AND matcher from the same definitions, so every name survives and every PATH moves, and it was the last of the three to be gated, #1755), while `add`/`update` are incremental and benign (the in-flight transition already resolved its target). `add` has no guard at all — the contract "add is allowed during navigation" holds in the sense that matters: a route added mid-navigation leaves the committed state exactly where adding it one statement AFTER the navigation would (measured, #1755), and a shadowing path resolves last-wins by design either way.

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
      break; // exactly what was removed — the node + its real children, FLAT
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

| Property                                                      | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payload**                                                   | `TreeChangedEvent` discriminated union (from `@real-router/core/types`), keyed by `op`. Routes are FLAT (full dotted `name`, descendants included), frozen per node.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Immutability is shallow**                                   | The payload route object (and `update`'s `patch` envelope) is `Object.freeze`d, but **nested config is by reference and aliases the live store** — `event.added[0].defaultParams` is the same object the router reads on every navigation (same aliasing as `get()`), and it is NOT frozen. **Treat payloads as read-only**: mutating a nested field (`event.added[0].defaultParams.x = …`, a `patch.defaultParams`, an `encodeParams`/guard closure) corrupts router config. Core does not deep-freeze (that would freeze the caller's own input, see H-1) or deep-clone (circular refs / class instances). ⚑ The record is written as ordinary DATA for every field name — and since #1852 that sentence is finally true of every name rather than of one. It said so from #1788, while the code special-cased the literal `"__proto__"` alone; the reasoning given was that `Object.prototype`'s other eleven own members are plain writable data properties, which is correct and beside the point, because the hazard is what the APPLICATION put on the chain under a custom field's name. Measured through `update("home", { zzHaz: 42 })` with an accessor there: the getter+setter shape did not throw at all — `update()` reported success, the value went to the foreign setter, and the field vanished; with no other custom field on the route the record emptied and `getRouteConfig` answered `undefined`. `putField` (`src/utils/ingest.ts`) now covers every name at all three sites that carried the one-name form (`prepareCustomFields`, `claim.write` #1191, `assignParam` #855), which also restores agreement with REGISTRATION: `Object.fromEntries` there DEFINES for every key, so `add` was already immune on this axis while `update` was not. The route-name-keyed containers of the ROUTE STORE never had that exposure: `routeCustomFields` and every `RouteConfig` map is an `Object.create(null)` dictionary. ⚠ That was stated as covering the whole layer and did not: `RouteLifecycleNamespace`'s six guard-factory records are keyed by a route name too and were plain `{}` until #1801 — read by key they reported a `canDeactivate` nobody registered, enumerated they dropped a `"__proto__"` route's guard on `cloneRouter`. They are `Object.create(null)` now, so the claim holds for the layer as a whole. |
| **`remove` payload is the SPLICE, not a name prefix (#1757)** | `removedSubtree` names the node that was spliced out plus its real `children`, and nothing else. Core accepts a dotted LEAF, so `{ name: "a.b" }` declared beside `{ name: "a" }` is a STANDALONE node: `remove("a")` leaves it in the tree and the payload must not claim it. The same set drives the config/lifecycle purge, so a survivor cannot lose its guards — the prefix form unregistered a blocking `canActivate` from a route that stayed, with no log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Timing**                                                    | Post-commit — the handler sees the new tree via `get()`/`has()`. For `replace`, fires after the tree swap but before state revalidation (new tree, still-old state).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`update` filter**                                           | Emits only when the patch has a structural field (`forwardTo` / `defaultParams` / `defaultSearch` / `encodeParams` / `decodeParams`). Guard-only and empty patches are silent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Fire-and-forget**                                           | The handler cannot cancel the mutation; returned promises are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Reentrant tree mutation is banned (#1032, #1751)**          | A tree mutator — the five route-CRUD ops (`add`/`remove`/`update`/`clear`/`replace`) on `getRoutesApi`, **plus `setRootPath` on `getPluginApi`** (#1751: it rebuilds tree AND matcher, and was the sixth door the #1032 sweep missed because it lives on the plugin surface) — called **from inside a `subscribeChanges` handler** (while a `TREE_CHANGED` emit is on the stack) throws `RouterError(REENTRANT_TREE_MUTATION)` synchronously, **before mutating** — the tree stays atomic. The throw surfaces via `onListenerError` (visible, non-fatal); the outer op completes. Defer instead (`queueMicrotask`/`await`) — and since #1665 the error says so itself, rather than leaving the remedy in the JSDoc above the throw. Mirrors the reentrant-`navigate` ban (§4). CRUD from a _transition_ listener (`subscribe`, not a TREE_CHANGED dispatch) is unaffected. The door set is derived, not listed — `tests/functional/tree-mutator-guard-authority-1751.test.ts` walks `src` for API members that transitively write a `RoutesStore` field and requires the guard on each, so a seventh door cannot ship without one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Errors**                                                    | A throwing handler is isolated via `onListenerError`; other handlers still run and the CRUD caller does not see a re-throw. A runaway listener-driven nested same-event emit — e.g. a `router.subscribe` listener that calls `replace()` unconditionally, whose revalidation would re-emit `TRANSITION_SUCCESS` (#950) and re-enter the listener — is harmlessly **coalesced** at the emitter (#1033): the re-entrant emit is a no-op (depth ≤ 1), so the listener runs once and the mutation still commits. (This replaced the former `maxEventDepth` depth bound + `RecursionDepthError`.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Duplicates**                                                | Lenient (mirrors `router.subscribe`) — each call is an independent subscription with its own unsubscribe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Clone isolation**                                           | A cloned router has an independent emitter; mutations never cross the clone boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Scope**                                                     | Internal-only channel: `TREE_CHANGED` is not in the public `EventName` union / `events.*` registry / `Plugin` interface. There is no `router.subscribeTree()` and no `addEventListener` path — by design (tree mutations are infrastructural, not app-level).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

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

## Supported Input Shapes

> **Own enumerable properties only.** Inherited and non-enumerable properties of a
> caller-supplied object are **not** supported input.
>
> — owner decision, 2026-08-18. Rationale: no worthy use case is known, and the
> narrow rule discharges functionality rather than adding it. Revisit only on a
> concrete precedent where a valid case is refused, and revisit **on the basis of
> the functionality that then exists**, not speculatively.

The rule constrains a bag's KEY surface, not its values: `dependencies` may still
hold `Map`s, class instances and pools; route configs may still hold functions.

**`Proxy`-backed bags keep working, measured.** Vue `reactive()` and Svelte
`$state` are pass-through Proxies over plain objects — they report own-enumerable
keys normally, so a spread reads them correctly. This was the main risk of the
narrow rule and it is not one.

### What the rule looks like from outside

`Object.create({ id: "7" })` handed to each of the four bags, measured against the
published packages:

| bag, carrying the key on its PROTOTYPE            | 0.94.0                          | 0.96.1         |
| ------------------------------------------------- | ------------------------------- | -------------- |
| the CALLER's `params` (`buildPath("a", bag)`)     | throws `Missing required param` | unchanged      |
| the CALLER's `search` (`buildPath("s", {}, bag)`) | key absent from the URL         | unchanged      |
| what a route's `encodeParams` RETURNS as `params` | `/a/7`                          | **throws**     |
| what a route's `encodeParams` RETURNS as `search` | `/s?q=7`                        | **key absent** |

Two things this table settles, both of which have been stated the other way round
in shipped text:

- **The caller's bags never accepted an inherited key.** `normalizeChannel` copies
  own keys off the caller's object before the matcher sees it, and copying own
  keys is exactly what drops inherited ones. Nothing about that changed in
  0.95.0. ⚠ The 0.95.0 CHANGELOG says "a caller may still hand `navigate` /
  `buildPath` an object with inherited values"; measured, it may not, on either
  version.
- **Only the codec seam changed**, because it is the one source that reaches the
  matcher without passing through the normaliser. The migration is one line —
  return an own-keyed object (`{ ...vm }`, `Object.fromEntries`, or a plain
  literal).

⚠ A class instance is the shape that bites: `new VM("7")` with a `get q()` on the
prototype and the constructor argument stored as an own field prints `?v=7` — the
internal field, not the accessor. That is the rule working exactly as written, and
it is why "return an own-keyed object" is the migration rather than "avoid
prototypes".

### The WRITE side of the same rule (#1852)

"Own enumerable properties only" says what core READS off a caller's bag. The
other half is what happens when core WRITES into a record of its own under a key
it did not choose — a route's declared slot, a query name from a URL, a plugin's
namespace, a custom field from an `update()` patch.

`target[key] = value` is `[[Set]]`, which walks the DESTINATION's prototype chain
before storing, so a name the chain answers for is not stored at all: a
getter-only accessor throws, a getter+setter pair diverts the value into
application code, and a non-writable data property drops it. The chain in
question is `Object.prototype`, and an ordinary library extension puts things
there — no attacker involved. The names that hurt are the ones an application
routes under: `id`, `tab`, `page`, `lang`.

**One primitive, `putField` (`src/utils/ingest.ts`), at twenty-two sites.** ⚠ That count is DESCRIPTIVE, not the contract, and this is the only place it is written down — it was repeated in four other files and went stale in all four at once the moment #1904 added a twenty-second. ⚠ "Only place" was FALSE when written: `src/utils/ingest.ts` carried a fifth copy ("twenty-one sites in core, fourteen across four plugins"), stale on BOTH halves — the core figure by one and the plugin figure by one in the other direction (measured: 22 and 13). It now points here instead of restating. A claim of single-sourcing is itself a claim, and this one shipped unverified beside the very warning it was making. The contract is the DERIVED set below. It asks
`key in target` and pays `Object.defineProperty` only where the chain answers; in
a pristine environment it never does. `copyFields` is its `Object.assign` twin —
that function is the same `[[Set]]` per key, in a form a `dst[key] = …` census
cannot see, and it was hiding two live sites in the matcher's junction walk.

- ⚠ **`__proto__` is not the rule, it is one instance of it.** #855, #1191 and
  #1788 each special-cased that literal in one file, on the reasoning that the
  other eleven `Object.prototype` members are plain writable data properties.
  True, and beside the point. All three are replaced.
- ⚑ **Where the record does not escape to a merging consumer, the key is
  ordinary DATA** — a route's custom fields (#1788) and a plugin's context
  namespace (#1191) both keep it, which is what let one primitive replace their
  three hand-written special cases.
- ⚠ **The published CHANNEL bags are the exception, and it is a separate
  decision from the primitive.** `state.params` / `state.search` still drop
  `"__proto__"` at the copy sites in `helpers.ts`, because a bag core hands BACK
  carrying that key is a prototype-swap primitive for any consumer merging it
  with `Object.assign` — measured from a bare URL, `?__proto__` yields `null`
  and `?__proto__=1&__proto__=2` an array, and the inherited setter accepts
  both. `getDependenciesApi.getAll()` deletes it for that reason in those words,
  and records the asymmetry this follows: a single read hands back a VALUE, a
  door like this hands back a CONTAINER someone will merge.
  ⚠ Carrying it was shipped briefly and reverted. The motive — "a query string
  may legitimately say `?__proto__=1`, do not discard the user's data" — does
  not survive contact with a consumer: `Object.assign` drops the key even in the
  safe string case, so the preservation held for exactly one hop and then failed
  unpredictably instead of here.
- ⚠ **A prototype-less destination is the EXPENSIVE horn, not the cheap one.** V8
  keeps such an object in dictionary mode, so the price is on every later READ,
  and it lands in the HUNDREDS of percent where the guard costs single digits —
  the figures live in `putField`'s docblock
  (`src/utils/ingest.ts`) and are deliberately not repeated here, because a
  number repeated is a number that goes stale in more than one place. It also
  changes a published shape — **352 tests in 17 packages** (re-measured on a
  full-monorepo run; the first figure, 263/15, was taken package-by-package
  partway through the change and was low on both halves), none for a behavioural
  reason. `{ __proto__: null }` as a literal is no cheaper.
- The site set is DERIVED, not listed:
  `tests/functional/computed-key-write-authority-1852.test.ts` walks `src` for
  both shapes and requires every remaining write to carry a written reason.
- **`@real-router/core/utils`** publishes `putField` / `copyFields`, because the
  rule is the plugin author's too — four shipped plugins were copying a caller's
  bag into records of their own.

### The HAND-OUT side, and the one question that picks the fix (#1957)

The two sides above are about a key core READS off a caller's bag and a key core
WRITES into a record of its own. The third is what core hands BACK: a container
carrying an own `"__proto__"` is inert while it sits there and becomes a
prototype-swap primitive the moment a consumer merges it with `Object.assign` or
a `for…in` copy — both `[[Set]]` that name on the TARGET, where
`Object.prototype`'s accessor replaces the target's prototype.

⚠ A SPREAD is **not** one of them. `{ ...container }` performs
`CreateDataProperty`, so it never reaches an inherited accessor — measured on a
`JSON.parse`d bag, a null-prototype carrier and a pass-through Proxy, it swaps in
none of the three. #1823 stated the pair correctly and a first revision of this
section widened it to include the spread; the hazard is real and narrower than
that. It is also why the derived guard measures with `Object.assign` only.

⚠ The SOURCE's own prototype decides nothing — measured, an
`Object.create(null)` container swaps the merge target exactly the same — so
`emptyRecord` is not a fix at a hand-out door and never was. Only two things
work: remove the key, or remove it from ENUMERATION. Which one is decided by a
single question — **does core read that key back off the very object it
published?**

- **No → `dropUnsafeKey`** (`src/helpers.ts`), the shape `getAll` found at
  #1823, now serving four doors: the router options at their SOURCE (the
  `OptionsNamespace` constructor, which is above both `getOptions()` and
  `getCloneState().options` — measured, those are two objects and not one, the
  second an unfrozen spread of the first), the dependency clone transport,
  and `getAll` itself — **three** call sites, counted rather than recalled.
  ⚠ It served two more until #1962, and their absence is the point:
  `stripSignal`'s rest-destructuring no longer exists, and the forced-replace
  substitution no longer needs the drop, because the ENTRY door drops the key
  once, above both, in the copy every navigation arc now shares. Re-adding either
  would be an unfalsifiable no-op. Unconditional, and the delete is
  measured as free: on the
  long-lived options object, which every navigation reads, deleting an ABSENT
  key leaves the hidden class alone (−1.0 %, i.e. noise). ⚠ It MUTATES, so it
  takes only an object core allocated one expression earlier: on a frozen
  container carrying the key it throws (measured, and the right failure — a
  silent no-op would publish the key).
- **Yes → `concealUnsafeKey`** (`src/utils/ingest.ts`), used at exactly one
  site: the matcher's route-meta record, whose keys are ROUTE NAMES and which
  `segmentParamsEqual` reads by key on every navigation. Deleting is not a
  milder fix there but a WRONG one — the read then reaches the inherited
  accessor and answers `Object.prototype`, an object with no keys, i.e. "params
  unchanged", so a route named `__proto__` stops re-activating when its `:id`
  changes (measured: `["__proto__"]` → `[]`).

⚠ **Consequence worth knowing:** a dependency named `__proto__` is held by the
base router and answered by `get()`, but does NOT reach a clone. The same trade
#1823 took at `getAll`, one door over.

⚠ **Five doors are EXEMPT, each with a measured reason** — the two prior owner
decisions (`state.context` #1191, a route's custom fields #1788), the two
PASS-THROUGHS where the container is the caller's own object with identity
intact (`forwardState`'s bags on the no-default fast path, and the un-forced
`NavigationOptions` arc), and the internals handle, whose whole purpose is to
hand out the live stores. Sanitising a pass-through means COPYING the caller's
bag, which invokes its accessors a second time below the read that already
decided — `opts-read-once-1817.test.ts` counts exactly those and pins them at
one.

⚠ **The level closed is the container a door RETURNS, and no further.** One
level down are the caller's own objects, handed back by reference under core's
one-level copy model (#1958) — `getOptions().defaultParams`,
`get(name).defaultParams` and a dependency's value all still swap, measured, and
`getOptions().defaultParams` IS the caller's object by identity. That is the
pass-through answer again, one level lower, and it is pinned rather than left as
an absence.

The set is DERIVED, not listed:
`tests/functional/handed-out-containers-1957.test.ts` measures every
container-returning door on the swap itself (never on the own key — the two part
company at the concealed one), runs `hostileBags`'s six container shapes through
the fixed doors, and snapshots each public surface's member list, so a new door
reds until someone classifies it.

### The ENTRY side — what core's own copy of a caller's bag keeps (#1901)

> **The copy preserves every own enumerable key.** A copy core makes of a
> caller-supplied bag at its entry door is not curated to a known field list: a
> key core does not recognise survives the copy and reaches whatever reads the
> copy downstream.
>
> — owner decision, 2026-08-30. It settles the gate #1901 names as "a contract
> decision this umbrella has to make, not an implementation detail".

The three sides above are about a key core READS off a caller's bag, one it
WRITES into a record of its own, and one it hands BACK. This is the fourth: what
core's own copy CARRIES, when a door copies the caller's bag before reading it.

**Why not curate to the declared fields.** Because "the declared fields" has no
runtime expression. `NavigationOptions` is extended by **module augmentation**,
and augmentation leaves no trace in the emitted JS — a curating copy can only
normalise to a list hard-coded at the time it was written, which is a different
thing from the contract and goes stale against it silently.

Measured, the keys such a list would drop are all first-party and all declared:

| declaring file                            | members beyond core's seven    |
| ----------------------------------------- | ------------------------------ |
| `packages/browser-plugin/src/index.ts`    | `source`, `hash`, `hashChange` |
| `packages/hash-plugin/src/index.ts`       | `hash`, `hashChange`, `source` |
| `packages/navigation-plugin/src/index.ts` | `hash`, `hashChange`           |

⚠ **A registration channel is the alternative that was weighed and refused**, and
the reason is not cost but reach: two classes of writer never pass through plugin
registration at all. `shared/dom-utils` is adapter code shipped in six adapters,
and its own comment states the intent — _"adapters do not need to augment
`NavigationOptions` themselves to consume `<Link hash>`"_ — for exactly the
configuration where no URL plugin is installed, i.e. where nothing would register
`hash`. `memory-plugin` tags its restore navigations with `source` through a
local intersection type, because the two plugins that declare `source` globally
may be absent. A `usePlugin`-driven registry drops both.

⚠ **This is not a licence for an open-ended pass-through, and the measurement
says why.** A TS-compiler-API census of every call at an options slot (3408
files, 579 candidate sites) found **zero** keys that are not declared somewhere:
the entire surplus is `hash` (43 sites) and `hashChange` (12). The rule is
therefore cheap — it carries ten known keys, seven of them core's own — and its
real subject is the key an APPLICATION invents, which the repo cannot measure.
⚠ 95 of those candidates pass a variable or a spread and are unreadable to a
static census; `source` reaches `opts` through one of them.

⚠ **It does not re-admit `"__proto__"`.** Read literally, "every own enumerable
key" includes that one — and the HAND-OUT rule above still removes it from the
container a door PUBLISHES, for the reason measured there. The two rules compose
rather than conflict, and for `NavigationOptions` they act on the SAME object:
core's entry copy IS what every plugin hook receives, so entry and hand-out
coincide and the key is dropped once, in the copy loop (#1962). Where the two
levels are distinct — a bag core ingests and keeps privately — the entry copy
carries the key as ordinary data and the hand-out door is what withholds it.

⚑ **The copy is a key LOOP, not a spread, and the reason is the read count.**
`{ signal: _, ...rest }` is four times cheaper (measured: 27 ns against 120 on a
four-key bag) and cannot be diverted by an ambient accessor, since a spread
`[[DefineOwnProperty]]`s. It is still wrong here: a spread reads EVERY own key to
exclude one, so excluding `signal` costs a second call into the caller's
accessor. `commit-gate-reads-the-snapshot-1717` counts exactly that and caught
the substitution at two reads instead of one. Skipping a key without reading it
is what forces the loop.

### The two enforcement postures, and why they differ

**Where a report is cheap, report it.** At construction and registration time —
`options`, `dependencies`, route configs — `@real-router/validation-plugin` is the
place to say that a supplied bag carries readable keys outside its own-enumerable
surface. This follows the existing split: core degrades, the plugin diagnoses.

**Where it is not cheap, stay silent.** On the per-navigation bags (`params`,
`search`) a prototype-surface comparison costs a chain walk on the render path,
and `isActiveRoute` is 23 ns. Those bags are object literals in practice. The
silence is the decision, not an oversight — a key that is not own-enumerable is
absent, and absence is not an error condition on the query channel.

The visible asymmetry between the two channels follows from that and not from a
second rule: a path slot the route DECLARES cannot be left empty, so an absent
`params` key is `Missing required param`; a query key is optional by construction,
so an absent `search` key is just a shorter URL.

### What this rule replaced

The name-blocklist proposal (`"block __proto__ at the entry"`) was considered and
rejected as the primary mechanism: `new URLSearchParams("__proto__=1")` yields
that key from a URL a browser can produce, and `?q=toString` is a legitimate
search query — the same string is data in one position and an identifier in
another. Under this rule the name axis closes without a list, because all twelve
`Object.prototype` own members are non-enumerable (measured) and no own-enumerable
copy can pick them up. Where a hard throw IS right, it stays narrow and at
registration time: route names, declared param names, context namespaces, enum
option values.

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

**`undefined` is absence on both sides of the default merge (#1550 / #1551).** `mergeDefined` (`src/helpers.ts`) is the single owner of "route default UNDER the value": a key survives only when its winning value is defined. So a caller's explicit `undefined` means "I said nothing" and the route default keeps the slot (`navigate("x", {}, { page: undefined })` on `defaultSearch { page: "1" }` commits `page: "1"`, symmetric with the path channel), and a default that itself carries `undefined` behaves exactly like no entry (no `undefined`-valued own key ever reaches the frozen state, a codec, or `forwardState`'s result). The rule lives in the merge rather than in a separately-ordered normalize stage — that is what makes it order-insensitive and true for every producer (`makeState`, `pipeline/canonicalize`, `matchPath`, `buildPath`, `forwardState` source-layering). `normalizeChannel` is the entry guard for BOTH channels since #1812 — the query bag used to reach the merge uncopied, which let an accessor-backed bag be admitted on one read and committed with another (it also collapses an empty bag onto the channel's own `EMPTY_*` singleton, #1027; the singleton is a PARAMETER, so the two channels must not be handed each other's).

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
- **`hasGuards` is per-TRANSITION, not per-router.** `planPhases` asks whether a segment THIS transition walks carries a guard (`hasGuardOnPath`, one `Map.has` per segment, short-circuited by an empty-Map check), not whether the router holds a guard anywhere. Reading the Maps' `size` answered a different question, and the difference was pure waste: one `canActivate` on an admin route armed the full cancellation machinery for every public navigation — an `AbortController`, the `isCurrentNav` closure and a three-phase walk that found no guard on any step. Measured on the production bundle (same-session A/B, alternating processes, medians of 3+3 runs, A/A floor 0.3–3.5%): a navigation that never touches the guarded route cost **+97.7 ns / +643 B** over the guard-free one and now costs **+4.7 ns / +24 B** — i.e. **−93 ns (−12%) and −619 B (−29%)** on the affected navigation, with the guard-free router unchanged. The predicate mirrors the interpreter (a phase whose short-circuit is false runs no step, so `forceDeactivate` also disarms it), so it is a gate on the fast path and not a second policy about guards. ⚠ The two branches are behaviourally equivalent — which is why the waste was invisible to 3826 tests — so it is pinned by COUNTING controllers (`guards-off-path.test.ts`, mutationally validated on both halves of the predicate: widening it fails 2 tests, disarming the deactivate half 1, the activate half 3), never by timing
- **FSM `send()` (table-driven, #1169)** — the NAVIGATE/LEAVE_APPROVE/COMPLETE transitions, plus `SYSTEM_COMMIT` for the two commits that are not transitions, dispatch through the FSM table via `send()`, which fires the registered emit action; **`forceState()` is no longer called anywhere in core** — the bypass primitive was removed from the FSM engine (`src/utils/fsm`) outright, and `tests/functional/fsm-state-authority.test.ts` locks the invariant in two layers (the FSM engine exposes no `forceState`; a static scan of core `src` finds zero `.forceState` accesses). An invalid transition (e.g. `COMPLETE` after a listener's `stop()`/`dispose()`) is a table no-op, so the FSM is the sole authority over state and cannot be resurrected out of IDLE/DISPOSED. Deliberate trade-off (owner decision): ~+15–20% on `navigate/*` + one transition-payload allocation per navigation, bought for structural determinism (cancellation enforced by the state machine, not scattered re-checks). The **commit-gate** is no longer a `suspendable`-gated re-check in `NavigationNamespace` — it is `when: mayCommit` on the `COMPLETE` edge, asked from `completeTransition` on every arc, so a navigation cancelled/terminated mid-flight is refused by the table rather than by a predicate beside it. `completeTransition` asks it ONCE, **above** the destructive post-leave `clearCanDeactivate` cleanup — a cancelled navigation must not unregister the guard of the route the user is staying on. It asked a second time below the cleanup until #1649, because the cleanup used to invoke a guard factory and the verdict had to see what that factory did; the factory no longer runs there, so the second ask has no subject. ⚠ The survivor could NOT stay in the lower position: the cleanup is destructive even when silent, so an ask below it reds `commit-gate-1169 › stop() from a sync subscribeLeave leaves the external canDeactivate registered` — a cell that had to be WRITTEN for that to be true: the aborted-`opts.signal` sibling this line used to name never reaches `completeTransition` at all, so it was green either way (instrumented: every refusal that does reach the ask carried an EMPTY cleanup). The discriminating cell uses `forceDeactivate`, the one arc where a non-empty cleanup and a refusal coexist. **That ordering is enforced by the TYPE, not by the comment (#1649):** the ask returns a `CommitPermit` and `deps.clearCanDeactivate(name, permit)` demands one, so moving the ask back down is `TS2448` (a `const` read above its declaration) rather than a red test. It is a compile-time lock because the same mistake has been made twice — the #1641 review, and the #1649 write-up, which prescribed the lower position outright. ⚠ **One ask means the verdict is a SNAPSHOT, and what makes a snapshot sound is that the window below it is inert.** It used to be kept inert by a second ordering rule the type does NOT express — `buildTransitionMeta` + `Object.freeze` hoisted ABOVE the ask, because the meta read `reload` / `replace` / `redirected` off the CALLER's `NavigationOptions`, and an accessor- or Proxy-backed `opts` is supported input. Built below the ask, a getter calling `stop()` / `dispose()` invalidated a verdict already given — `COMPLETE` found no edge, the send was a silent no-op, and `completeTransition` still returned its state, i.e. `navigate()` resolved a state nobody committed and no subscriber heard about. The send cannot be made to report instead (`FSM.send` returns the resulting STATE, and a `subscribe` listener inside the `COMPLETE` action may legitimately move the machine). ⚑ **Since #1719 the rule has no subject: the three flags are read ONCE at the entry (`NavigationContext.reload` and its two siblings, in the plan's literal), so `completeTransition` reads no `opts` field and the window is empty STRUCTURALLY rather than by care.** ⚠ Not "no application code runs in `completeTransition`" — the ANNOUNCE below the verdict runs plenty, synchronously into every hook and subscriber; the exact claim is that between the ask and the send there is bookkeeping and nothing else. The entry reads stand ABOVE `abortPreviousNavigation`, which is measured and not stylistic: one statement lower they sit in a window where the machine has left the band and this navigation has not entered it, so a getter starting a nested navigation parks it back IN and this navigation's own `send(NAVIGATE)` takes the `LEAVE_APPROVED` self-loop the table documents as never traversed (instrumented over the whole tier: zero traversals here, one there — with the tier equally green either way). Pinned by `commit-window-empty-1719.test.ts`, which COUNTS the caller's getter invocations and requires zero below the announce; it replaced `commit-ask-snapshot-1649.test.ts`, whose subject the change removed. ⚑ **"One ask" counts the CALLER's asks; the TABLE evaluates the predicate TWICE (#1717)** — once inside `canSend`, once inside the `send` it permits — so `mayCommit` may only read what cannot change between them. Identity cannot; the caller's `opts` very much can, because reading an accessor- or Proxy-backed one is a call into application code, and it did: a `signal` getter handing back a different object refused a healthy commit at the ask (`navigate()` rejecting `TRANSITION_CANCELLED` with nobody told, since a `when` refusal does not move the machine — the stuck band of #1684 / #1704) or at the send (the #1649 phantom resolve again, from below the hoist rather than above it). The third term therefore asks `payload.externalSignal`, the signal the navigation captured at its entry (#1690), and the `COMPLETE` action's strip branch asks the same field; `RouterPayloads.COMPLETE.opts` is required now that nothing on the table reads it. The window between the two evaluations is `clearCanDeactivate`, which has run no application code since #1649 — the two facts together are what make a snapshot verdict sound. Pinned by `commit-gate-reads-the-snapshot-1717.test.ts`, which COUNTS getter invocations (two above the announce, one below it — the strip's own spread), because a healthy navigation's outcome cannot tell a snapshot read from a re-read that happens to agree
- **Explicit params instead of `...args`, in BOTH dispatch primitives** — `EventEmitter.emit(name, a?, b?, c?, d?)`, and since the state-ownership slice the FSM's `send` / `canSend` too: a rest parameter materialises an array per call, and these run several times per navigation. The FSM keeps the conditional rest TUPLE in its overload (it is the only way to express payload correlation, #753) and takes the payload positionally in the implementation. Measured **−88 B/navigation**, p90 tail 2384 → 2133 B, timing unchanged — the engine had simply never received the trade the EventEmitter made years earlier
- **Cached error rejections** — pre-allocated `Promise.reject()` for SAME_STATES, ROUTER_NOT_STARTED, ROUTE_NOT_FOUND (zero alloc per rejection)
- **`getFunctions()` cached tuple** — `RouteLifecycleNamespace` returns pre-allocated `[deactivate, activate]` array (no alloc per navigate)
- **Segment array reuse** — `toActivate`/`toDeactivate` reuse arrays from `getTransitionPath()`
- **`buildNavigateState()`** — single-pass state construction through `src/pipeline`: one `canonicalize` (① forwardState seam + ③ defaults) feeding `buildURL` + `materialize`. Costs two object literals per navigation over the pre-pipeline form (the `Canonical` and `materialize`'s options bag); the merge itself still allocates nothing when the route has no defaults
- **Empty-channel reuse** — `normalizeChannel(bag, empty)` returns the shared frozen singleton the CALLER named (`EMPTY_PARAMS` / `EMPTY_SEARCH`) when nothing survives (empty input, or all values `undefined`), so `makeState`'s `params === EMPTY_PARAMS` branch reuses it: an empty-params navigation allocates **zero** transient `{}` (lazy allocation in `normalizeChannel` + singleton reuse, #1027)
- **Freeze once, at the origin** — there is NO traversal (this line claimed "consolidated into one recursive traversal" long after the traversal was gone, #1599). `freezeStateShell` — renamed from `freezeStateInPlace`, which promised a depth it never delivered — freezes the state object's own level; the depth comes from each producer freezing its own output exactly once: `params` in `materialize` at the publication boundary, both paths (#1598 moved it there, #1928 removed the merge-time second owner), `search` from the `EMPTY_SEARCH` singleton or `admittedSearch`'s drop branch, `transition` + nested in `buildTransitionMeta`. Measured reason not to centralise: re-freezing an already-frozen object costs ~8 ns, so a walk would pay per node for work already done. Owned and pinned per producer — INVARIANTS "State immutability (who freezes what)"

### General

- States cached to avoid repeated freezing
- URL params cached per route name
- Lifecycle functions pre-compiled at registration
- Event listeners lazily created
- `nameToIDs()` has fast paths for 1-4 segments
- Route tree is immutable (Object.freeze) — cloneRouter() rebuilds from definitions (not shared)
- Router options are immutable — deep-frozen at construction (`OptionsNamespace`), safe to return directly
- Fire-and-forget suppressors are **per-router, and split by owner** (#1588): `NavigationNamespace.#onSuppressed` (built once in `setDependencies`) covers navigate / navigateToState / navigateToDefault, because the layer that CREATES a promise is the only one that can tell a fresh rejection from one of its own pre-suppressed singletons; `Router.#onSuppressedStartError` stays on the facade, which builds `start()`'s promise itself. Both classify through one shared module-level `isExpectedRejection` / `SUPPRESSED_ERROR_CODES` in `NavigationNamespace/constants.ts` — one owner, two readers. (Neither is `static`: they log through THIS router's logger, #724.)
- Segment cleanup uses `Array.includes()` instead of `new Set()` (1-5 elements — linear faster)
- `createInterceptable()` — empty-array fast path skips iteration when no interceptors registered
- FSM `canSend()` — O(1) via cached `#currentTransitions`
- `getNavigator()` — WeakMap cache keyed by router, one frozen navigator per router instance
- `buildPath` options cached per router instance (`#cachedBuildPathOpts`) — the cache ignores its `options` argument after the first call, valid because router options are immutable per instance (see above); a dev-build `logger.warn` asserts against a future caller passing a varying `options` reference (`#cachedOptionsSource`, #957)
- `isActiveRoute`'s `forwardTo` arm (#1573) is gated tree-wide before it is gated per route (#1595). The per-route gate asks two `Object.create(null)` maps — V8 keeps those in **dictionary mode** whatever their size, empty ones included — and the pair measured ~14 ns, paid by every route in the tree for a feature only forwarding routes use, on the shape that reaches the gate: an INACTIVE link, i.e. most links on a page. `RoutesStore.hasAnyForward` answers first with one boolean load. The cost was NOT the `Object.hasOwn` form (a plain property read measured identical) but touching the dictionaries at all — two other candidate mechanisms, extracting the arm's tail and de-polymorphising `#matchesActiveState`, both measured null before this one. ⚠ Derived state: a stale `false` switches the arm off silently, so it moves only alongside `resolvedForwardMap` through `adoptForwardState`, pinned in `isActiveRoute.test.ts`. ⚠ That pin enumerated route-CRUD only, and `cloneRouter` is not route-CRUD — it wrote the map directly and left the flag unset, so every SSR clone answered `false` for every forwarding route until #1800. The clone now goes through the same function; a new writer of forward config belongs there too, not in a second derivation. Measured: an inactive link 44.3 → 32.9 ns, 1.75× → 1.29× of pre-pipeline
- `canonicalize`'s fast-path gate is TWO facts, one per side — the CALLER brought no query bag, and the ROUTE carries no default on either slot — and between them stage ③ and the mode gate are provably identity (#1589). It used to carry a THIRD term, "the route declares no `?name`", which was redundant against the first: the mode gate filters the MERGED query bag, whose only sources are `defaultSearch` and the caller's bag, so an empty bag has nothing to drop however many names are declared. Established rather than argued — the term survived all 3808 tests (a mutation survivor with no behaviour behind it) and a 33-probe × 3-mode matrix over a `?`-declaring route with no defaults is byte-identical without it — while costing ~12 ns per call, because `getQueryParams` is a four-frame chain to a cached Map, not a Map read. Dropping it also widens the fast path to routes that declare query params but carry no defaults. ⚠ The two defaults are read ABOVE the gate deliberately: they are its route half AND the slow path's first input, so the fast path pays two hops and the slow path pays nothing extra. The alternative — one `port.mergesNothing()` predicate, defaults re-read below — was built and measured: indistinguishable on the fast arms (its single hop runs two `Object.hasOwn` calls, so it is not actually cheaper than two null-prototype reads) and **+10.6 % on the defaults path**, which is a fourth hop there. Measured against pre-pipeline `0fed89b` (medians of 9 alternating single-module processes, A/A floor ≤ 0.7 %): the pipeline's regression is 1.75–2.50× on the predicates, of which this recovers `isActiveRoute` −12.2 % / −12.8 %, `buildPath` −13.7 %, −16.8 % static, −19.9 % on a `?`-declaring route, `canNavigateTo` −8.2 % (now 1.06× — parity), and −0.3 % (wash) on the defaults path. The `isActiveRoute` sibling arm is untouched at 1.75×: it early-outs before `canonicalize`, so its residual is not the pipeline's to give back

### Async subscribeLeave overhead

- **0 listeners (hot path):** `handleNoGuardsLeave` is not on it at all since разрез А (#1588) — no leave listeners means `suspendable` is false, so a guard-free navigation returns from `completeImmediate`, which runs `sendLeaveApprove` + `completeTransition` and nothing else. No `LeaveState`, no `AbortController`, no commit-gate. `handleNoGuardsLeave` now serves only the guard-free **suspendable** arcs (external `signal` / pre-commit listener / leave listeners), where it still allocates a controller only `if (hasLeaveListeners())` — which is why folding it into the guard machinery was measured and rejected (the guard path allocates one unconditionally)
- **N sync listeners:** AbortController created + released (not aborted on success, #722; ~5µs total with cleanup), frozen `LeaveState` object, N try/catch (V8 zero-cost on happy path), N×2 thenable checks
- **Lazy closures:** `isCurrentNav` / `emitLeaveApproveCallback` closures are created inside the `if (hasGuards)` branch (or the async tail) only — never on the guard-free path. The context bag is not lazy and does not need to be: `NavigationPlan` is built once per navigation and IS the `NavigationContext` handed to `completeTransition` / `finishAsyncNavigation`
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

| Type Kind        | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API types | `src/types/` — the `types/index.ts` barrel IS the `@real-router/core/types` subpath (also re-exported from the root `@real-router/core`) and the augmentation declaration-site (`declare module "@real-router/core/types"`). Folded from `@real-router/types` (wave-2, initially as `public-types/`, then consolidated into `types/`). **Augmentation invariant (#1540/#1519):** the augment-target interfaces (`StateContext`, `NavigationOptions`) are declared **lexically in `types/index.ts`** (not in `base.ts`) — TS merges a `declare module` augmentation only against the declaration-site of the resolved entry module; a re-export of any form is a silent no-op. To keep this true in `dist`, core's tsdown build is two-pass, both in `tsdown.config.mts` and selected by `RR_DTS_PASS`: **pass 1** emits the unbundled declarations (owns `clean: true` for the whole build) and deletes the throwaway CJS JS graph that comes with them from its own `build:done` hook, scoped to that config's `outDir` — pass 1 emits no ESM JS, so nothing else matches; **pass 2** emits the bundled JS and runs `publint`/`attw` against the finished package. The passes must stay SEQUENTIAL: they used to run under one `Promise.all` writing the same CJS entry names, so the published CJS shape was decided by whichever finished last (`emitDtsOnly` suppresses JS for ESM only — CJS declarations are a separate `cjsDts` build). `scripts/check-dts-augment-targets.mjs` fails the bundle if the `types` entry dts loses the lexical declarations or a duplicate appears elsewhere. The type-only import cycle `index ↔ base/router/api` this creates is deliberate. **Gotcha:** the root exports the `Router` / `RouterError` **classes**, which shadow the same-named interfaces; import the `Router` **interface** (factory-param typing) from `@real-router/core/types`, not the root. |

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

Cancellation: Pass `{ signal }` via `NavigationOptions` for external `AbortController` cancellation. `router.stop()`, `router.dispose()`, and concurrent navigation cancel the in-flight navigation automatically. **The FSM is the single owner of cancellation.** Every source routes through FSM `CANCEL` (`stop`/`dispose` → `sendCancelIfPossible`; supersede / external `opts.signal` → `cancelNavigation`) — ⚑ **and since #1684 that sentence is true of the external signal on every arc, not only on one.** The bridge onto `CANCEL` used to be registered inside `finishAsyncNavigation`, so it existed only for a navigation that PARKED; everything that aborted before that (a sync `subscribeLeave` listener, a plugin's `onTransitionStart` / `onTransitionLeaveApprove`, a guard body aborting its own fetch controller — and the leave dispatch of a guard-free navigation, which runs before its own promise gets there, so this was never a "sync arc" condition) reached nobody. `mayCommit` refused the commit without moving the machine and `routeTransitionError` filtered the resulting `TRANSITION_CANCELLED` before any send, so the band sat in `LEAVE_APPROVED` with `isLeaveApproved()` lying and `replace()` a silent no-op until the next navigation. The bridge now stands from the `NAVIGATE` edge's own ACTION — ⚑ **since #1724, which is a step further than "before the announce"**: the action runs after the edge's `update` and before `emitTransitionStart`, so the `onTransitionStart` window is still covered (measured: the bridge fires from inside the announce 4 times across the tier), while a `NAVIGATE` the table REFUSES runs no action and therefore opens nothing. It costs the #307 hot path nothing structurally rather than by care: a navigation carrying a `signal` is `suspendable` by definition, so разрез А can never reach it.

⚑ **The cancellability scope is OPENED and CLOSED by the machine (#1716 + #1724).** Detaching it used to be four settle sites in `executeNavigation` (#1688); the scope travels with the plan, the `NAVIGATE` edge adopts it, and the ACTION of whichever terminal edge the navigation left the band through — `CANCEL`, `FAIL` or `COMPLETE` — closes it. `DISPOSE` is deliberately not in that set: its `update` (`resetState`) zeroes `inflight` before the action would run and it carries no payload, but more to the point it has nothing to close — instrumented over the whole tier, all 230 `DISPOSE` traversals came from `IDLE` or `STARTING`, never from inside the band, because `dispose()` and `stop()` both send `sendCancelIfPossible` FIRST. ⚑ **The pipeline's last closing call is gone too, and it went by moving the OPENING rather than the closing (#1724):** it existed for the navigation the machine never ADOPTED — a `NAVIGATE` that was a table no-op has no edge to close it, and the bridge used to be registered before the send — so opening from the edge's action means a refused edge opens nothing. ⚠ Not to be confused with "`sendNavigate` returned false", which is a wider set: `FSM.send` reports the state after the action AND the listeners, so a navigation whose announce moved the machine lands there too, having opened a scope that the `CANCEL` closes on the way out (measured across the tier: 16 arrivals, of which 7 never ran an action). Registration is still CONDITIONAL, as #1690 made it — asked in the action, of the namespace that holds both listener counts — because registering unconditionally measures **+23…30 %** on the guard-free, listener-free arc. The late registration (the one the pipeline still asks for, since `hasGuards` is unknowable when the edge fires) is REFUSED when the machine has already cancelled the navigation (`plan.cancelReason !== undefined`), because a listener installed after the terminal edge is one nothing would ever remove — measured, it leaked 4 listeners across 4056 passing tests. Pinned by `cancellability-scope-1716.test.ts`, which COUNTS `addEventListener`/`removeEventListener` on the caller's signal per arc — including the arc that reaches BOTH moments, which is what pins the single owner of "is a bridge already standing?" — because a leaked listener changes no outcome, no event and no state.

⚑ **A registration is only as good as the instant it happens, and the window in FRONT of the earliest one is owned by a single inline check right after the announce, not by the registrations (#1704).** `beginTransition` reads `opts.signal` and `opts.forceDeactivate` between the entry pre-check and the announce, and reading `opts` IS a call into application code when it is Proxy-backed (a supported input) — so a getter that aborts there left every bridge standing on a dead signal, and `addEventListener` never fires retroactively. Measured before the fix: `TRANSITION_CANCEL` was lost in TWO of four configurations, the band stayed in `LEAVE_APPROVED` and `clear()`/`replace()` were silent no-ops until the next navigation — the #1030 / #1684 symptom, reachable again through a window nobody owned. The scope now ADOPTS what the signal already says, once, immediately after the announce. **After** is the whole constraint: `CANCEL` is declared on `TRANSITION_STARTED` / `LEAVE_APPROVED` only, so asking beside the registration it protects is a table no-op that fixes nothing (mutationally demonstrated — moving the ask above `startTransition` reds the same six tests as deleting it). A second ask later is harmless for the same reason: `sendCancelIfPossible` is `canCancel()`-guarded, so once the machine is back in `READY` every further cancel of that navigation is refused rather than re-emitted. This also retired the LAST hand-written copy of "`addEventListener` does not fire retroactively" in the bridge path — `bridgeLateIfOnlyGuardsCanAbort` used to carry its own, and the registration never had one; there is one owner now. Pinned by the four-cell matrix in `external-signal-bridge-1684.test.ts`, which counts `TRANSITION_CANCEL` because the navigation's OUTCOME never discriminated (`mayCommit` refused off `opts.signal` either way, which is how 4016 tests stayed green). The `CANCEL` action (`handleCancel`) aborts the in-flight controller — since #1684 by reading `ctx.inflight.controller` off the navigation the machine is already carrying, rather than through an injected effect into a router-level slot — so the invariant **"FSM `CANCEL` ⟹ controller aborted (pipeline woken) + `TRANSITION_CANCEL` emitted"** holds atomically in one place. No source aborts the controller by hand. Aborting it sets `signal.aborted`, which the async pipeline's post-race check (`isCurrentNavigation(plan) && !signal.aborted`) detects regardless of the resulting FSM state (`READY` for external, `IDLE`/`DISPOSED` for stop/dispose, the superseding nav's `TRANSITION_STARTED` for supersede) — the abort is what makes the FSM state irrelevant, which is why the third term this pair used to carry (`deps.isActive()`) was removed at #1734. The external `opts.signal` reason is threaded through `cancelNavigation(reason)` → the controller's `signal.reason` (#943). Before this unification the external-signal path only aborted the controller and left the FSM stuck in `TRANSITION_STARTED`/`LEAVE_APPROVED` (#1030) — `isTransitioning()` stayed true (route-CRUD silently blocked) and `isLeaveApproved()` was falsely true until the next navigation; the cross-source invariant property test (`tests/property/cancellation.properties.ts`) now locks recovery for every source × suspension point — including the `external` × sync-point cells it used to EXCLUDE, on a premise ("its FSM-settle lands a beat after `navigate()` rejects") that was hiding exactly the defect above: there was no later beat, the settle never happened.
**What cancellation stops, and what it deliberately does not (#1687 / #1697).** It stops **guards**: the fence at the head of every guard step asks the same pair the asynchronous half asks — still the navigation in flight, and the controller not aborted — so after `TRANSITION_CANCEL` no guard of that navigation runs, on any source and on any phase. **`aborted` is the term that decides, on every source**, and that is measured rather than asserted: instrumented over the functional and property tiers, 317 refusals, `aborted` true in all 317. Supersede additionally fails the identity term and `stop()`/`dispose()` additionally leave the router inactive, but neither ever gets to be the deciding term, because every source that invalidates them reaches the controller through the same `CANCEL`. An external `opts.signal` fails the identity term not at all — `CANCEL` carries no `update` (#1671) and lands the machine in `READY` — so there the abort is the whole answer.

⚑ **The fence carried a third term, `deps.isActive()`, until #1734, and removing it made the remaining pair LOUDER, not weaker.** It could not decide anything: `STOP` is not declared on `TRANSITION_STARTED` / `LEAVE_APPROVED`, so an in-flight navigation only ever sees a false `isActive()` as a downstream echo of the `CANCEL` that already aborted it — with the terminate path's cancel stripped out, `sendStop()` from the band is a table no-op and the machine never reaches `IDLE` at all, and the one remaining route (the fail-safe band→`DISPOSED` edge) still asks no guard, because `dispose()` has cleared the guard registry by the time the walk could resume. Two-sided: the tier reds the SAME 39 tests with that term and without it once the terminate path stops cancelling, and removing the whole fence reds 13 either way — while removing `aborted` alone went from 7 red to **9**, because the third term had been masking two of them. The identity term is NOT in that category and stayed: strip `abortPreviousNavigation`'s cancel — #1681's documented, unenforced hole, where a `when` on the `CANCEL` edge makes the `NAVIGATE` self-loop reachable — and the tier goes 26 red to 30 without it, the four including the very test #1670 wrote when it moved that invariant off the table and onto this fence. It does **not** stop the `subscribeLeave` dispatch, and that is the contract rather than a residue — a listener whose leave was approved is still called, with `signal.aborted` already `true`, which is exactly what `guardLeaveListener` arm 2 (behind `useRouteExit` in all six adapters) and `dom-utils/view-transitions` key their skip on. Both leave arcs agree on this since #1697 moved the guard-free arc's controller ahead of its announce, and since #1706 a listener registered from INSIDE that announce agrees too — that was the last cell left open.

⚑ **The `aborted` term only works because the controller may not exist yet, and the cancel is recorded anyway (#1706).** Allocation is lazy — разрез А never gets one and the guard fork opens one after `planPhases` — so a `CANCEL` landing in front of the first consumer had nothing to abort: `handleCancel`'s `?.` dropped it, and the controller opened moments later was born UNABORTED, satisfying every term of the fence and letting the whole walk run for a navigation that had already announced its `TRANSITION_CANCEL`. Reachable through an accessor- or Proxy-backed `opts` whose getter aborts the caller's signal between the entry pre-check and the announce — and the outcome was identical either way (the commit gate refuses off that same signal), which is why 4016 tests never saw it. `CANCEL` now writes `cancelReason` onto the navigation BEFORE aborting, and the pipeline opens every controller through one door (`openController`) that aborts on birth from that record. The record is DATA, so nothing extra is allocated: разрез А and the born-dead arcs still count zero controllers, which is what `controller-allocation.test.ts` and `born-dead-navigation-1648.test.ts` pin. Counted, not traced — `cancellation-stops-the-guard-walk-1687.test.ts` asserts ZERO guard invocations after the cancel, because the navigation's outcome does not discriminate.

⚑ **And the commit gate asks that same snapshot, so "was the caller's signal aborted?" has exactly one form of the question everywhere below the entry (#1717).** `mayCommit` read `payload.opts.signal` — a SECOND read of the caller's object, the very thing `finishAsyncNavigation` keeps `nav.externalSignal` to avoid — and it ran inside `FSM.send`, and inside `canSend` a second time. A Proxy-backed `opts` handing back an unrelated aborted signal there refused a commit nothing had cancelled: `navigate()` rejected `TRANSITION_CANCELLED`, no `TRANSITION_CANCEL` was emitted (a `when` refusal moves nothing), the band stayed in `LEAVE_APPROVED` and the caller's own signal read `aborted === false`. The MIRROR of #1684 / #1704, which lose a real abort — the same stuck band, reached from the opposite direction, and the reason it stayed invisible is that #1704 leans on this very read as its correctness backstop. The strip branch in the `COMPLETE` action was the second reader of the same object and flipped the same way, handing plugins the caller's live object instead of a sanitised copy. Both ask `externalSignal` now, and no read of `opts` survives between the entry and the announcement.

Guards receive `signal` as optional 3rd parameter for cooperative cancellation (e.g., `fetch(url, { signal })`).
**Non-cooperative guards are also bounded (#1018):** `finishAsyncNavigation` races the guard completion against the controller's abort — `await Promise.race([guardCompletion, abortRace])`, where `abortRace` resolves on abort and the existing post-race `isActive()` check then rejects with `TRANSITION_CANCELLED`. So an async guard whose Promise **never settles** and ignores `signal` no longer wedges `navigate()` forever: `stop()`/`dispose()`/supersede abort the controller and the navigation rejects instead of hanging. Mirrors the leave-path protection `settleLeavePromises` (#663/#673). Consequence: when an abort precedes a slow guard's own verdict, cancellation wins — the navigation rejects `TRANSITION_CANCELLED` rather than waiting for the guard's `CANNOT_ACTIVATE`.

**Cancellation wins regardless of ORDER, and a cancelled navigation reports nothing (#1609).** The sentence above used to hold only while the abort literally won the race. It did not when the guard's verdict landed FIRST and the supersede a microtask or two later — and it never did for the classic synchronous guard-redirect (`navigate(...)` from inside a guard that then returns `false`), where the verdict always precedes the takeover. Both failure arcs now consult liveness, so **a navigation that is no longer the one in flight is a cancellation, whatever its guard decided**: no `TRANSITION_ERROR`, and `navigate()` rejects `TRANSITION_CANCELLED` carrying the original error as `reason`. The two arcs read liveness from different facts, and the asymmetry is load-bearing — `finishAsyncNavigation` holds its own `controller`, so its `isActive()` is `isCurrentNavigation(nav) && !signal.aborted && deps.isActive()`; the synchronous `handleNavigateError` asks a different question (⚠ until #1684 it also COULD not read the signal — the guard-free leave arc owned its controller locally and had already released it; it can now, and the asymmetry stands on its own merit rather than on availability), so it asks `isCurrentNavigation(nav) && deps.isTransitioning()` — "does the FSM still hold MY transition", which is the actual precondition for sending `FAIL`. `deps.isActive()` alone would be too loose there: a listener that calls `stop()` and then a `start()` parked in an async interceptor bumps no token and leaves the FSM in `STARTING`, where a stale `FAIL` takes `STARTING --FAIL--> IDLE` and kills the restart. Why this matters beyond noise: `FAIL` is a real edge from `TRANSITION_STARTED`/`LEAVE_APPROVED` too, so a stale report moved the machine out from under the LIVE navigation and turned its `COMPLETE` into a table no-op — the state committed and `navigate()` resolved while `TRANSITION_SUCCESS` never fired and no `router.subscribe` consumer was notified. Restating the outcome (rather than only suppressing the report) is the #1197 shape: an outcome that already carries `TRANSITION_CANCELLED` is threaded through untouched so the leave rejection keeps its `reason` (#943). INVARIANTS "Navigation cancellation" #2.
`AbortError` thrown in guards is auto-converted to `TRANSITION_CANCELLED`. A guard may also throw `RouterError(TRANSITION_CANCELLED)` directly to signal a quiet cancel — it is **preserved** (not re-coded to `CANNOT_ACTIVATE`/`CANNOT_DEACTIVATE`), so the navigation rejects with `TRANSITION_CANCELLED` and `onTransitionError` does **not** fire (#933). Any other thrown `RouterError` is still re-coded to the guard's `CANNOT_ACTIVATE`/`CANNOT_DEACTIVATE` — on a **copy** (#1606): the thrown instance itself is never mutated (`segment`/`path`/custom fields/`stack` carry over, `setCode` message semantics apply to the copy), because a rejection propagated out of a guard may be one of the cached error singletons.

## See Also

- [packages/validation-plugin/CLAUDE.md](../validation-plugin/CLAUDE.md) — Validation plugin architecture and validator namespaces
- [src/engine/CLAUDE.md](src/engine/CLAUDE.md) — Routing engine (merged route-tree + path-matcher + search-params, #1510)
- [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md) — Navigation delivery pipeline (canonicalize · buildURL · materialize · RouteResolver)
- [src/channels/CLAUDE.md](src/channels/CLAUDE.md) — Channel-correctness subsystem (guard · defaults · modeGate)
- [src/utils/fsm/CLAUDE.md](src/utils/fsm/CLAUDE.md) — FSM engine internals (lifecycle + navigation state machine)
- [ARCHITECTURE.md](ARCHITECTURE.md) — this package's structure, pipeline wiring, subsystem boundaries
- [INVARIANTS.md](INVARIANTS.md) — property-based invariants per entry point
- [root ARCHITECTURE.md](../../ARCHITECTURE.md) — System design and package structure
- [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) — Infrastructure decisions
