# RoutesNamespace — route table, CRUD and mutation events

> **How to read this file.** It states what holds TODAY and points at the thing
> that enforces it; history lives in the issue, the changeset and
> `IMPLEMENTATION_NOTES.md`. Loaded on demand when Claude reads files in this
> directory — the package-level [CLAUDE.md](../../../CLAUDE.md) keeps only what
> every core task needs.

The route table's own rules: how a route NAME is treated, what CRUD may do while a
navigation is in flight, and what `subscribeChanges` promises.

#A route name is read as a property key (#1876 / #1881)

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
  Each answers what a **stably**-coercing value's `toString` named — the only
  shape the criterion is about; read counts and answers are pinned by
  `tests/functional/canonical-name-read-once-1883.test.ts`.
  ⚠ A DRIFTING `toString` is outside that criterion: measured at
  `isActiveRoute`, a bag whose FIRST read names a route with no `forwardTo` at
  all still answers `true` for a later read's forward target.
  `@real-router/validation-plugin` refuses every door in this bullet at 0 reads
  (`packages/validation-plugin/tests/functional/route-name-doors.test.ts`).
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

#A route NAME carries no dot (#1763)

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

#Atomic Route Replacement: replace()

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

#Route CRUD during active navigation

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

#`update()` does not revalidate the active state

`update(name, ...)` mutates config in place and does **not** rebuild the tree or
recompute the current state, so updating the currently-active route's codecs or
defaults leaves `getState().path` built by the OLD config until the next
navigation. By design — `update` is O(1), not a re-navigation. Use
`navigate(name, params, undefined, { reload: true })` if you need the path
rebuilt.

#Routes Mutation Events (`subscribeChanges`)

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

#Recommended pattern: declarative reactive cache invalidation

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

## The store is a transport, not inert data

**Store pattern:** `RoutesStore` and `DependenciesStore` are data-holder
interfaces, not classes. `RoutesStore` deliberately carries cross-namespace
references set during wiring, so the standalone CRUD helpers reach the lifecycle
namespace without threading a parameter through every helper. It is the api/
layer's transport channel, not inert data.

## See Also

- [../../CLAUDE.md](../../../CLAUDE.md) — the `@real-router/core` package rules
- [../../../ARCHITECTURE.md](../../../ARCHITECTURE.md) — where this namespace sits
- [../../../INVARIANTS.md](../../../INVARIANTS.md) — "Route Management (getRoutesApi)"
