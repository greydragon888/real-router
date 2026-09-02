# NavigationNamespace — the transition pipeline and cancellation

> **How to read this file.** It states what holds TODAY and points at the thing
> that enforces it; history lives in the issue, the changeset and
> `IMPLEMENTATION_NOTES.md`. Loaded on demand when Claude reads files in this
> directory — the package-level [CLAUDE.md](../../../CLAUDE.md) keeps only what
> every core task needs.

What happens between `navigate()` and a committed State, and what cancels it.
The DELIVERY half — `canonicalize` / `buildURL` / `materialize` — belongs to
[../../pipeline/CLAUDE.md](../../pipeline/CLAUDE.md); this file is the namespace
that drives it.

#Transition Pipeline

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

#NavigationNamespace File Structure

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

#When `navigate()`'s Promise resolves vs subscribers

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

#Force Replace from UNKNOWN_ROUTE

Navigating FROM `UNKNOWN_ROUTE` auto-forces `replace: true`, so 404 entries do not
pollute history.

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

## See Also

- [../../CLAUDE.md](../../../CLAUDE.md) — the `@real-router/core` package rules
- [../../pipeline/CLAUDE.md](../../pipeline/CLAUDE.md) — the delivery primitives
- [../../../ARCHITECTURE.md](../../../ARCHITECTURE.md) — "Navigation Pipeline", "FSM → Event Bridge"
