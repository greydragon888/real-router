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

| looking for                                                            | it lives in                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| namespaces, FSM edges, pipeline, plugins, guards, cloning, performance | [ARCHITECTURE.md](ARCHITECTURE.md)                                                           |
| per-entry-point invariants, the four sides of the input rule           | [INVARIANTS.md](INVARIANTS.md)                                                               |
| public API surface, `getNavigator`, promise semantics                  | [README.md](README.md)                                                                       |
| route table, CRUD during navigation, `subscribeChanges`                | [src/namespaces/RoutesNamespace/CLAUDE.md](src/namespaces/RoutesNamespace/CLAUDE.md)         |
| transition pipeline, cancellation                                      | [src/namespaces/NavigationNamespace/CLAUDE.md](src/namespaces/NavigationNamespace/CLAUDE.md) |
| `canonicalize` / `buildURL` / `materialize`                            | [src/pipeline/CLAUDE.md](src/pipeline/CLAUDE.md)                                             |
| channel correctness, the mode gate                                     | [src/channels/CLAUDE.md](src/channels/CLAUDE.md)                                             |
| matcher, trie, query engine                                            | [src/engine/CLAUDE.md](src/engine/CLAUDE.md)                                                 |
| **which doors exist, and who reaches them**                            | [tests/functional/door-census/](tests/functional/door-census/README.md)                      |

⚑ **Before arguing from "nobody calls this" or "that is not a door", read the
census.** Seven tests DERIVE the door set rather than listing it — what each
handed-out surface contains, what a manifest publishes, who reaches for a
member and which factories shipped code merely calls, what an application fills
on core and on the plugins and adapters, what core takes back from a callback,
and how many there are in total. Its README states the definition of a door in
use and names the two axes it deliberately leaves to other authorities. Every
hand-written answer to these questions in this repository has been wrong at
least once; the derivation is green or it is red.

## Invariant Guards (always active, no plugin required)

Nine, and the criterion for another is **(a)** silent corruption or **(b)** a
deferred crash in a user-facing API. (The count is written as a cardinal, not an
ordinal naming "the next one": it went stale twice as `five`, and an ordinal adds
a second edit to every addition.)

- **`subscribe(listener)`** — `typeof listener === "function"`, so a non-function
  cannot reach the emitter and crash on the next navigation. `subscribeLeave`
  validates the same way, without the `@real-router/rx` hint.
- **`RoutesApi.subscribeChanges(handler)`** — `typeof handler === "function"`
  (#2246). The SAME emitter as the two above, reached on an internal-only
  `TREE_CHANGED` key — tree mutations, not transitions — with the same isolation,
  so an unguarded non-function registers cleanly, hands back a working
  `Unsubscribe`, and logs on every structural mutation for the life of the router
  while the mutation itself reports success. No rx hint either, and for a sharper
  reason than `subscribeLeave`'s: rx exposes the Observable pattern for
  transitions, and a tree change is not one.
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
- **`addEventListener(eventName, cb)`** — refuses both arguments. The name is
  checked against the set the emitter can dispatch (#1888); the callback against
  `typeof` (#2088), because the emitter stores whatever it is handed and isolates
  the call, so a non-function logs `cb is not a function` on every emit of that
  event for the life of the router — a registration that reported success and
  never works. Both wordings are mirrored by `@real-router/validation-plugin` and
  pinned against it by `bare-core-message-parity.test.ts`.
- **`addInterceptor(method, fn)`** — refuses both arguments (#2088), because the
  door meets BOTH halves of the criterion at once: a name no seam reads registers
  cleanly, never fires and hands back a working `Unsubscribe` (a), and a
  non-function is admitted here and thrown from whichever navigation reaches the
  seam first (b). Membership is asked of `SEAM` in `internals.ts` — the object the
  three `create*Interceptable` call sites take their own names from, so the set
  that decides is the set that acts. `satisfies { [K in keyof
InterceptableMethodMap]: K }` ties it to the type in both directions: a seam
  added to the map fails the object to compile, and a value drifting from its key
  is an error rather than a silent alias. ⚠ Nothing COERCES the name — `hasOwn`
  performs `ToPropertyKey`, and the message renders a non-string by its type
  rather than through `String()`, so neither half runs the caller's `toString`.
- **`extendRouter(extensions)`** — the argument must be a plain object (#2243).
  Criterion **(a)**, and the refused write lands on the router ITSELF rather than
  in an internal registry: own enumerable keys are copied onto the live router,
  and a string's are `"0"`, `"1"`, … — names a router does not hold, so the
  loop assigns them. The predicate is `isPlainBag`, shared with the dependency
  door, so `Object.create(null)` is admitted at both and an array at neither.
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
  - ⚠ It does **not** run on the predicates, and the reason is the ANSWER rather
    than the cost. `buildPath` prints exactly what the caller's bag means and
    `isActiveRoute` judges the location that bag builds, so a declared query name
    carrying a value there is not a silence to break: wiring the guard reddens the
    location-predicate pin in `tests/functional/utils.test.ts`, and #1978 is the
    bug where a location predicate answering `false` for the URL the user is
    already on broke `<Link hash>`.
  - ⚠ Cost is NOT what keeps it out, and the figure is recorded so the question is
    not re-argued from shape: wired at both doors it costs **+8 to +30 ns per
    call** across the render-path arms of `benchmarks/seam-rig` (A/A floor
    ≤ 1.9 %) — 0.019 % of a 16 ms frame at a hundred `<Link>`s. The dominant term
    is the `getQueryParams` lookup; the predicate itself reads the route's cached
    query names and short-circuits on a route that declares none, so it never
    walks the caller's bag.
  - `canNavigateTo` is not blind regardless — it consults the same predicate and
    answers `false`.

**Param-value type validation stays opt-in.** Bare core tolerantly accepts values
that cannot round-trip through a URL path (a `Symbol` path param, a lossy
`BigInt`, a percent-encoded control char). These are exotic programmer errors, so
the plugin rejects them rather than core paying a per-navigate value scan.

### Two doors deliberately left unguarded (#2303)

The surface census walked every member of every handed-out surface and found no
guard worth removing. It found two members carrying none, and the criterion above
is honestly not met by either — recorded here so the question is answered rather
than re-opened.

- **`getInternals(router).logger` is handed out bare.** It is the one member of
  that surface with neither a guard nor a recorded carve-out, and overwriting it
  is accepted. Its radius is diagnostics: nothing routing reads it, so a hijack
  silences messages instead of steering a navigation. Neither (a) nor (b).
- **`PluginApi.emitTransitionError`'s argument is checked by no tier.** Core
  asserts nothing and `RouterValidator` has no member for it, so the plugin
  cannot cover it either; every shape reaches `$$error` subscribers verbatim.
  ⚠ Its sibling `navigateToNotFound` distrusts its own declared type at the same
  layer — the asymmetry is real, and it is this door that is the exception.

### Who refuses — core or the analyser (#2322)

> **Core refuses an input only when it cannot keep working correctly without
> refusing, or when the input never reaches the analyser. Otherwise core stays
> neutral — it falls back, tolerates, or prints what it was given — and
> `@real-router/validation-plugin` is what refuses.**
>
> — owner decision, 2026-09-14. It is the boundary rule; the guard criterion
> above is what selects the exceptions on core's side of it.

⚑ **The analyser's REACH is the discriminator, and it is mechanical.** `logger`
is consumed and stripped at construction (#724), so the retrospective pass at
`usePlugin` never sees it — core refuses an unknown key there because nothing
else can, and a `validateLoggerOption` in the plugin was dead on the live path
and removed (#789). `queryParams` IS in what that pass reads, so core stays
neutral and the plugin names a mis-spelled option — the `⚠` in
`src/namespaces/OptionsNamespace/adoption.ts` states that slot's side of this
and names the test that pins the reach.

⚠ **Neutral is not the same as silently broken.** What bare core prints on a
value it cannot round-trip is still readable by core itself — its own
`matchPath` matches the path its own `buildPath` produced. `@real-router/validation-plugin`
› _Unsafe path-param value rejection_ owns the per-input table.

⚠ **The rule LICENSES a divergence; it cannot predict one.** Which inputs a
door refuses with the plugin installed differs door by door, so a per-door
table is the only honest form — `predicate-totality-2245.test.ts` derives the
doors that claim totality from INVARIANTS and pins both arms for them.

⚠ **A dev-only refusal is a dev-only signal.** The documented posture is
`__DEV__ && validationPlugin()`, so a door that refuses with the plugin and
answers without it diverges between the build the author tests and the build
the user runs. That is the intended shape — the analyser is stricter — and it
is the reason a refusal belongs to the plugin only where core can keep working.

⚑ **Worked application — the four plugin-facing doors of #2247, closed by this
rule.** That issue asked whether `RouterValidator` should grow a member for each;
the rule above was decided after it was written and answers all four without one.
Recorded here so the question is answered rather than re-opened.

| door                              | outcome                                          | measured reason                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PluginApi.addInterceptor`        | always-on, already there                         | `assertInterceptableSeam` — core cannot run a seam it cannot call                                                                                                                         |
| `PluginApi.claimContextNamespace` | always-on, already there                         | a non-string or empty namespace would key the claim registry on nothing, so core cannot keep working                                                                                      |
| `PluginApi.getRouteConfig`        | neither — core stays neutral                     | `hasRoute` gates before the lookup, so `__proto__`, `constructor`, `toString`, a Symbol, `42`, `null` and an unknown name all answer `undefined`. Nothing to corrupt and nothing to print |
| `PluginApi.emitTransitionError`   | neither — the record is the `#2303` bullet above | —                                                                                                                                                                                         |

⚠ **`claim.write(state, value)`'s VALUE is unchecked by every tier, and that is
the same shape as the door above it rather than a fifth case.** Measured: a
function, a `Symbol`, `undefined` and a `__proto__`-carrying bag are all accepted
and stored BY REFERENCE. `Object.prototype` is not reached — the bag lands as
data in `state.context`, the documented plugin carve-out — so the radius is the
writing plugin's own namespace, which is what the `#2303` criterion turns on.

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

⚠ **What the TARGET is still decides, and a `Proxy` cannot talk its way out of
it (#2282).** The shape gates read the prototype, which a proxy traps, so a
proxy over an ARRAY presented itself as plain and had its indices copied. The
predicates therefore ask `Array.isArray` as well — the one question the spec
makes a proxy answer for its target. A proxy over a plain object is unaffected;
a proxy over a class instance, a `Map` or a `Date` is still admitted and still
inert, because none of them has own enumerable keys to copy except the fields
the instance's own author declared.

⚠ **The `queryParams` CONFIG bag is exempt, deliberately.** Its format names are
read by NAME rather than spread, so the lookup walks the prototype chain and one
config layered over another is supported input there. `snapshotQueryParams`
collapses that to plain own data at construction, and
`query-strategy-formats-1796.test.ts` owns what the door reads.

⚠ **A class instance is the shape that bites.** `new VM("7")` with a `get q()` on
the prototype and the constructor argument stored as an own field prints the
internal field, not the accessor. The migration is one line — return an own-keyed
object — and it applies to what a route's **codecs RETURN**, the one source that
reaches the matcher without passing through the normaliser. The caller's own bags
never accepted an inherited key.

⚠ **A route DEFINITION is the one place this is REFUSED rather than degraded.**
`guardRouteStructure` asks the caller's own object whether it is a plain object
and whether it carries accessors, on every registration door, always-on — so a
class instance or a `{ get name() }` definition throws instead of being read. It
has to run there because a spread answers both questions the same way whatever it
was made from — which is why that walk judges the caller's value and RETURNS its
own snapshot in the same visit, rather than a guard pass followed by a copy pass
over the container a second time (#2139). A `Proxy` reports an ordinary data descriptor and is admitted, which
is what the snapshot is left to answer for.

The rule has four sides — READ, WRITE, HAND-OUT and ENTRY — each enforced by a
DERIVED guard rather than a list. INVARIANTS "Supported input shapes" states them
and names the guards.

⚑ **The WRITE side has a reflex, and it is the one a fixer reaches for wrongly.**
A write under a key core did not choose goes through `putField` / `copyFields`
(`@real-router/core/utils`) — never a spread, and never `dst[k] = v` with the one
name skipped: the skip converts a `[[DefineOwnProperty]]` into a `[[Set]]`, which
is the OTHER axis of the same class and throws on an inherited accessor under an
ordinary name (#1856). `computed-key-write-authority-1852` derives the site set
and owns the rule; `shared/` is held by one `authority-1838` guard per directory,
in that directory's coverage owner (#1838).

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

⚠ **Omitting a guard needs OWNERSHIP, not reachability.** "No foreign input can
get here" is a claim about an object core does not own, and two of them have
already been wrong. "Every bag this site is handed is one core BUILT" survives a
hole upstream and is checkable from the call graph. Write the second reason or
write the guard.

### `RouterInternals` promises what its guarded sibling promises (#2259)

`@real-router/core/validation` ships `getInternals` and the `RouterInternals`
type. That is a **published surface** — a plugin author reaches for it — and the
decision recorded here is what it promises relative to `PluginApi`.

**It promises the same refusals.** A door reachable both ways refuses the same
values from either side. `RouterInternals` is not a trusted fast path and must
not be documented as one.

⚠ **The guards belong in the `RouterInternals` ADAPTER, not in the namespace
primitive.** The chain is three layers — `PluginApi` holds the guards, the
adapter in `Router.ts` is a thin arrow onto a namespace method, and the namespace
method is the primitive. Guarding the adapter costs its callers (the facade,
`getRoutesApi`'s revalidation, and plugin authors); guarding the primitive would
also charge the navigation pipeline, which reaches `matchPath` through a
DIFFERENT adapter in `wiring/wireNamespaces.ts` and must not pay for a
caller-facing check.

⚠ **`forwardState` is the exception, and it is one because core reaches that
seam itself.** `matchPath` resolves a forward through it, so a guard on the
adapter fires `validateStateBuilderArgs` on an internal intermediate — which
`tests/functional/routes/matchPath.test.ts` pins as deliberately NOT validated.
Its guards stay on the facade and the divergence is RECORDED in the parity
ledger rather than closed. Where a door is reached internally, the adapter is
not a boundary.

⚠ **A "deliberately unguarded tier" was refused on evidence, not taste.** Most
facade guards are `ctx.validator?.…`, so the gap WIDENS when an application
installs `@real-router/validation-plugin` — a tier whose contract changes with a
plugin is not a contract. Measured: three doors diverge in bare core, seven with
the plugin installed.

⚑ **Three outcomes, and only the first is a defect.** A door may BYPASS (the
guarded side refuses, the internal side accepts), be a PLAIN ALIAS (`X: ctx.X`,
one function, nothing to diverge), or differ only in failure SHAPE (a synchronous
throw against an asynchronous rejection — the asymmetry `internals.ts` already
records for `navigateToState`). A census that does not separate the three reports
the last two as work.

⚠ **The set is derived, never listed.** A list read off the source was wrong twice
while this was being decided — once too wide, once too narrow — because a door
that refuses one bad input can still accept another. `#2258` owns the derivation;
until it lands, treat any hand-written set as a sample.

### What earns a member a place on `PluginApi` (#2339)

> **A member belongs on `PluginApi` when BOTH hold: (a) shipped code outside core
> reaches it, and (b) its signature is expressible in already-published types.**

Derived from the surface as it stands, not invented. Designing a member for
`PluginApi` out of one that fails (b) is the same work as choosing a published
type for it — measured when #2339 slice 1 had to publish `AdoptedOrigins` before
`getAdoptedOrigins` could move.

**(b) is derived by `door-census/membership.test.ts`** (#2350): it asks the
compiler which types every member of every handed-out surface references, and
which of them a subpath publishes. That cell owns the verdict and the
counter-example — the `RouterInternals` members carrying a type no subpath
publishes — so neither is restated here.

**(a) is derived by `door-census/consumers.test.ts`** (#2383): a typed census
asks the compiler what each receiver IS, so the idiom a surface arrives by — a
local, a typed parameter, a class field, a field of a dependency bag — stops
deciding whether its reach is seen. The cell owns the verdict for `PluginApi`.

⚠ **Two columns in that file answer different questions, and only one is the
clause.** The reverse column is `src ∪ tests`, so a member only a test reaches
counts as reached there; the clause asks about shipped code alone. And the
syntactic walk beside the typed one still undercounts — what it cannot see is
asserted as a difference rather than described, so a new invisible idiom is an
event rather than a silence.

⚠ **No refusal has ever been recorded, and that is the gap.** The rule describes
the surface that exists; it has never turned a member away. A criterion with no
negative example is indistinguishable from a description of the current set, so
the first member that satisfies both clauses and is still refused is the one that
makes this a rule — write that refusal down when it happens.

### Before adding an aggregating entity, ask what could REFUSE a member

> **An interface, bag, store or vocabulary that cannot refuse a proposed member
> will accrete. Name what refuses, or the entity grows by default rather than by
> decision.**

Derived from a census, not asserted: measured 2026-09-16, every aggregating type
in shipped source carrying eight members or more was checked for members the
declaring package never uses — the mechanical form of "it landed because someone
else needed it". The majority came back clean, and the clean ones all have a
construction that can say no: a dependency bag admits nothing without a call site
that reads it, a store admits only state its namespace owns, a validator method
needs a door to guard.

⚠ **Size is not the signal, and neither is a member with one reader.** Both were
tried and both failed: `NavigationDependencies` carries 26 members with half of
them read exactly once, which is the CORRECT shape for an injected dependency,
and `RoutesStore` has no unread member at all. What separates an accreting entity
from a large one is the absence of a refusal.

⚠ **The two that accreted are the two that had no rule.** `RouterInternals`,
whose members landed by default rather than by decision (#2339), and `PluginApi`,
which gets its first criterion in the section above. A declared VOCABULARY is the
same shape and fails the same way — #2362 and #2363 are values a public type
promises and nothing produces.

## Gotchas

### Guards Cannot Redirect

All guards are `GuardFn` (`boolean | Promise<boolean>`) — no State return. Both
route config and `addActivateGuard` / `addDeactivateGuard` accept a
`GuardFnFactory`, whose signature is `(router, getDependency) => GuardFn`.

⚠ **The async half is a THENABLE, not `Promise.prototype` (#2251).** A promise
from another realm — a `vm` context, an iframe, a worker bridge, a federated
module — is awaited exactly as a native one is, and a `then` that throws on read
fails the navigation the way a throwing guard does rather than reading as
"allowed". `INVARIANTS.md` guard row 5 owns the rule.

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

⚑ **The rule reaches the RETURN VALUES too, not only the surfaces.** A member of
`getInternals(router)` that hands back a cached object is bound by it for the
same reason — one write rewires every consumer — and a member that mints a fresh
object per call is not, because a freeze there would certify nothing.
`adopted-origins-handout-2195.test.ts` owns that table and states which side each
member falls on.

⚠ **Frozen is not the same as current, and the name registries are the shape
where that bites (#2255).** `getQueryParams` and its siblings hand back a
SNAPSHOT taken when the tree was last built, so a caller that stores the array
keeps describing the route as it was. Every tree rebuild mints a new one:
`replace`, `add`, `remove`, `clear` and `setRootPath` all hand back a different
object afterwards, and `update` — which rebuilds nothing — hands back the same
one. **Reference identity is therefore an exact rebuild signal**, so a consumer
either re-reads per use or memoises on `===`; copying per call would destroy
that signal rather than repair the staleness. ⚑ All six announce themselves —
`setRootPath` through its own `op: "rootPath"` (#1752), which is the one member
of the union carrying no routes, because it leaves every route in place and
sends every one of them to a new URL.

⚑ **That member REVERSES a recorded decision, and the reason is dated.**
`.claude/rfc-tree-mutation-event.md` closed О-6 with "no emission", on the ground
that `TREE_CHANGED` consumers want to know WHICH routes changed rather than where
the base moved — true of every consumer on 2026-06-06, and false from 2026-06-28,
when #805 shipped `preload-plugin`'s `default` branch whose contract is the
opposite: **any** structural mutation restales its href-keyed cache. That plugin
is the measured victim, and it needed no edit — its `default` absorbs the new
`op`. ⚠ О-6 prescribed a separate `ROOT_PATH_CHANGED` channel instead; a member
was taken because the separate channel loses that free repair and grows a public
subscription door for one consumer, while the union's own docblock already tells
consumers to tolerate future ops.

⚑ **What `setRootPath` still does NOT do is rebuild the state the router is
already on, and that is a recorded decision rather than an omission (#1752 gap
B).** A path-half change on a started router leaves `getState().path` holding a
URL the router no longer routes — `matchPath(state.path)` answers nothing while
`isActiveRoute(name)` still answers `true`, because the NAME survived and only
the PATH moved. The next navigation rebuilds under the new root and the state is
consistent again, so it is a window rather than corruption; what does not heal is
the history entry a URL plugin already wrote from `toState.path`.

⚠ **Revalidating it like `replace()` would be worse, not better.** That
revalidation re-matches the OLD path, and under a root move EVERY committed path
fails to match — it would commit `UNKNOWN_ROUTE` for states whose routes are
alive. Rebuilding from the committed NAME instead is correct and buys nothing
measured: all three shipped call sites declare a query-only root, which moves no
paths at all, so the commit would change nothing on every call. And the
in-flight gate already refuses the path-half change everywhere except on an idle
router, which is the only shape that reaches this at all.

⚠ **A test that stubbed a member of these surfaces belongs on
`getInternals(router)`** — but not uniformly, and the three classes are derived by
`plugin-api-stub-seam-authority-1805.test.ts`: a member that CALLS `ctx.<name>()`
is intercepted whenever the spy stands; one that ALIASES it captures the reference
when the cached surface is BUILT, so a spy installed afterwards is missed; and one
that composes locally has no seam at all.

### areStatesEqual ignores query params by default

Query params live in `state.search`; `ignoreQueryParams` (default `true`) controls
whether that channel participates. `state.params` participates on both arms — but
⚠ the DEFAULT arm compares the route's declared SLOTS, not the whole bag, so an
own key the route declares nowhere is invisible there and visible only with
`ignoreQueryParams: false`. `areStatesEqual.test.ts` owns both arms.

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

**One source of declarations, and two questions asked of it.** The matcher's
`declaredQueryParams` is the only registration. `getQueryParams` subtracts the
route's `urlParams` and answers **which channel owns a key** — a name that also
occupies a path slot (`/items/:id?id`) stays path-owned, so only an explicit
`search` twin reaches the query channel. The mode gate asks whether the build
will PRINT a key, and reads the declarations UNSUBTRACTED because the
query-string build does (#1932); the two answers differ on exactly that collision
shape. Both views are **frozen where they live** (#2137) — a mutation would edit
the tables the guard and the gate consult, not a copy.

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

**Message prefixes:** name the facade call the message comes from, not the class
raising it — `[router.buildPath]`, or bare `[router]` where several doors reach
one raiser. `tests/functional/message-prefix-authority-1845.test.ts` derives the
rule and owns the one exception, which is a REGISTER rather than a carve-out.

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
