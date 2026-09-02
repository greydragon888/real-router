# @real-router/core

> **How to read this file.** It states what holds TODAY and points at the thing
> that enforces it. It carries no history: why a rule looks the way it does lives
> in the issue, the changeset and `IMPLEMENTATION_NOTES.md`, and a second copy
> here would go stale on its own schedule while sitting next to the code. It also
> carries as few numbers as possible — a count written twice rots twice, so where
> a test owns one, the test is named instead.

**One subject, one owner.** This file keeps what every core task needs: the
always-on guards, the input contract, the traps and the conventions. Everything
that describes STRUCTURE or a single subsystem lives with that subsystem and
loads only when you read files there.

| looking for | it lives in |
| --- | --- |
| namespaces, FSM edges, pipeline, plugins, guards, cloning, performance | [ARCHITECTURE.md](ARCHITECTURE.md) |
| per-entry-point invariants, the four sides of the input rule | [INVARIANTS.md](INVARIANTS.md) |
| public API surface, `getNavigator`, promise semantics | [README.md](README.md) |
| route table, CRUD during navigation, `subscribeChanges` | [src/namespaces/RoutesNamespace/CLAUDE.md](src/namespaces/RoutesNamespace/CLAUDE.md) |
| transition pipeline, cancellation | [src/namespaces/NavigationNamespace/CLAUDE.md](src/namespaces/NavigationNamespace/CLAUDE.md) |
| `canonicalize` / `buildURL` / `materialize` | [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md) |
| channel correctness, the mode gate | [src/channels/CLAUDE.md](src/channels/CLAUDE.md) |
| matcher, trie, query engine | [src/engine/CLAUDE.md](src/engine/CLAUDE.md) |

## Invariant Guards (always active, no plugin required)

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

The rule has four sides — READ, WRITE, HAND-OUT and ENTRY — each enforced by a
DERIVED guard rather than a list. INVARIANTS "Supported input shapes" states them
and names the guards.

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

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — this package's structure and subsystem boundaries
- [INVARIANTS.md](INVARIANTS.md) — property-based invariants per entry point
- [README.md](README.md) — the public API surface
- [src/namespaces/RoutesNamespace/CLAUDE.md](src/namespaces/RoutesNamespace/CLAUDE.md) — route table, CRUD, mutation events
- [src/namespaces/NavigationNamespace/CLAUDE.md](src/namespaces/NavigationNamespace/CLAUDE.md) — transition pipeline, cancellation
- [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md) — navigation delivery pipeline
- [src/channels/CLAUDE.md](src/channels/CLAUDE.md) — channel-correctness subsystem, the mode gate
- [src/engine/CLAUDE.md](src/engine/CLAUDE.md) — routing engine
- [src/utils/fsm/CLAUDE.md](src/utils/fsm/CLAUDE.md) — FSM engine internals
- [packages/validation-plugin/CLAUDE.md](../validation-plugin/CLAUDE.md) — validator namespaces
- [root ARCHITECTURE.md](../../ARCHITECTURE.md) · [IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) — system design, and the home of every "why it is this way"
