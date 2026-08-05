---
"@real-router/core": minor
---

Clearing a guard is bookkeeping, never execution (#1649 #1611 #1626 #1627)

`RouteLifecycleNamespace.#recompileSlot` re-derives a route's compiled
`canActivate` / `canDeactivate` after one origin is cleared. It did that by
INVOKING the surviving factory — application code running inside two
**destructive** operations: `completeTransition`'s post-leave cleanup (one step
before the commit) and `replace()`'s `clearDefinitionGuards` (in the middle of a
tree swap). That single root produced a family of defects — a factory calling
`dispose()` / `stop()` / `navigate()` from there tore the router down under the
operation that invoked it — and each was answered by another guard around the
verdict (#1611, #1626, #1627).

Each factory's compiled form is now stored beside it, split by origin exactly
like the factories themselves, so the re-derivation is a `Map` read. Nothing
extra is compiled to fill those Maps: `#registerHandler` already compiled the
definition factory and discarded the result whenever external won.

**Behaviour change.** A guard factory now runs exactly ONCE per registration per
router. Re-registration, `cloneRouter` and route-CRUD still re-run it; a slot
re-derivation no longer does. If a factory reads a dependency at compile time
(`(router, getDependency) => { const api = getDependency("api"); … }`), it will
no longer silently re-read it when a clear re-derives the slot. That re-read was
never something to rely on — it happened only if a re-derivation occurred at
all, at a moment no caller could predict — and `cloneRouter` remains the
canonical way to re-run factories against fresh dependencies.

Consequences:

- the two commit-gate asks in `completeTransition` collapse into ONE. The
  survivor moves ABOVE the cleanup, which is where it has to be: the cleanup is
  still destructive even though it is now silent, so a refusal arriving after it
  would still let a cancelled navigation unregister the `canDeactivate` of the
  route the user is staying on. Only the SECOND ask lost its subject.
- a navigation that is refused no longer takes the departing route's external
  `canDeactivate` with it.
- `replace()` can no longer be torn down by a guard factory it re-derived. The
  liveness gates added for that are kept — they still cover a router disposed by
  other means — but `replace()` can no longer cause it.
- the two `v8 ignore` blocks that defended `#recompileSlot` against a factory
  throwing (or returning a non-function) on its SECOND call are gone with the
  second call.
