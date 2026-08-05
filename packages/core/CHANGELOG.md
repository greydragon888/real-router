# @real-router/core

## 0.88.0

### Minor Changes

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - A navigation's identity is the plan object, and the machine issues it ([#1648](https://github.com/greydragon888/real-router/issues/1648))

  The table could only ever check what it was given. A navigation read the machine's
  epoch back through a DI member right after its own `NAVIGATE` send, kept the number
  on its plan, and hand-stamped it onto every later send; `when: mayCommit` and
  `when: mayFail` then compared that number against the machine's. The honesty of the
  stamp was a convention — nothing structural stopped a site from stamping the wrong
  one, and one already did (below).

  The identity is now the plan **object** itself. `NavigationPlan` — which
  `navigate()` builds anyway — IS the payload for `NAVIGATE` / `LEAVE_APPROVE` /
  `COMPLETE`, and the `NAVIGATE` update adopts it into `RouterFSMContext.inflight`.
  "Is this send stale?" becomes `payload === ctx.inflight`, a question no caller can
  answer dishonestly, because presenting the live navigation means presenting the live
  object. `FAIL` names its navigation the same way, by reference.

  What that removes:

  - `RouterFSMContext.epoch` — gone. `inflight` replaces it **and** `inflightToState`:
    one field is the navigation's identity and its target at once, so two facts about
    one navigation stopped being two fields that can disagree.
  - `NavigationContext.myEpoch`, `NavigationDependencies.getNavigationEpoch` and
    `EventBusNamespace.getNavigationEpoch` — gone with the last reader. There is no
    epoch to read, so no site can stamp a send with the wrong one.
  - The `NAVIGATE`, `LEAVE_APPROVE` and `COMPLETE` payload literals — the plan is
    handed over directly, and `completeTransition` stopped building a commit object
    beside it. Measured on the guard-free arc: **−135.9 B per navigation** (alternating
    processes, median of 31 windows of 200 navigations, A/A floor 0.0 B).

  **A navigation whose `NAVIGATE` never fired is now refused at the seam.** `send()`
  reports the resulting state, so `startTransition` reports whether the edge fired at
  all. It does not, when user code drives the machine out of the transition band
  between `canNavigate()` and the send — a `stop()` from a `forwardState` interceptor
  is the shipped way there. Such a navigation was born dead: never announced, carried
  by nobody, and it used to walk on and get refused at the very end by a coincidence of
  topology (`COMPLETE` is not declared where it had landed). The rejection was already
  `TRANSITION_CANCELLED` and still is; what changes is that a dead navigation stops
  doing the work — pinned by counting the `AbortController` it used to allocate, since
  the outcome cannot discriminate.

  Two things deliberately unchanged: both `when`s stay (a stamp that was honest when
  taken still goes stale across an `await`, so the freshness check is not removable —
  only its currency changed), and `FAIL` keeps its own payload literal, because it
  carries an `error` the plan does not.

### Patch Changes

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - CANCEL and FAIL stop carrying a target their own table already knows ([#1671](https://github.com/greydragon888/real-router/issues/1671))

  RFC-10a §16.6's remainder: `endNavigation` cleared `ctx.inflightToState` in the edge's `update`, which runs _before_ the action — so the actions could not read the target and the payloads had to carry it. Option (г) removes the clearing instead of reordering the engine: the field's validity window is expressed by the machine's STATE, not by its lifetime, and both `CANCEL` edges are declared inside the transition band only.

  The FAIL half needed more than that, and the difference was found by measurement rather than by reading. Its action is registered on **three** edges, and `STARTING --FAIL--> IDLE` is outside the band — a failed `start()` is not a navigation failure and has no target to name. Left to read the context there, it would have reported whatever a previously _cancelled_ navigation left behind, through the public `onTransitionError` hook. So the action is now **split by edge**: the two in-band registrations read `ctx.inflight` — measured identical to what the payload carried on all 206 in-band FAILs across the functional tier — and the `STARTING` one names no route, which is what both of its senders pass today. The distinction moved from a value the caller must remember into the table.

  Consequences worth knowing:

  - `RouterPayloads["CANCEL"]` and `["FAIL"]` lose `toState`; `sendCancel` / `sendFail` / `sendTransitionFail` / `routeTransitionError` lose the parameter, and four call sites stop threading it.
  - `sendCancelIfPossible` no longer reads the context at all, which retires the `|| toState === undefined` clause [#1669](https://github.com/greydragon888/real-router/issues/1669) documented as a type narrowing awaiting this change.
  - `ctx.inflight` is now deliberately allowed to be **stale outside the band** — one object, overwritten by the next navigation. The rule for who may read it, and under which gate, is recorded beside the field, including the one edit it cannot survive silently: declaring `CANCEL` or `FAIL` from a state outside the band.

  No behaviour change: every event carries exactly the states it carried before.

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - Retire `when: hasInflight` from both CANCEL edges — it is a tautology on the band invariant ([#1669](https://github.com/greydragon888/real-router/issues/1669))

  `inflight` is written by exactly one `update` (`beginNavigation`, on the only edges that ENTER the transition band), so inside `TRANSITION_STARTED ∪ LEAVE_APPROVED` it is always defined. (It was also cleared on every exit when this was written; [#1671](https://github.com/greydragon888/real-router/issues/1671) ships in this same release and stops clearing it on CANCEL/FAIL, so it is no longer `undefined` outside the band — the tautology rests on the first half alone) — which is precisely the window where a `CANCEL` edge exists at all. Instrumented over the whole functional tier the predicate is asked **202 times and refuses zero**.

  Unlike the neighbouring `isOwnEpoch` ([#1670](https://github.com/greydragon888/real-router/issues/1670)), this one cannot refuse in **any** configuration: removing its hand-rolled twin in `EventBusNamespace.sendCancelIfPossible` does not even change the number of asks. That is the discriminator between "a tautology" and "a check whose backstop happens to run first", and it is why the two predicates were answered differently.

  The twin itself **stays**, re-documented for what it actually is: a TYPE narrowing, not a second opinion. Semantically it is dead, but `sendCancel` takes a `State` and the compiler cannot see the band invariant; widening that signature would push `undefined` into the public `onTransitionCancel` hook for a payload field [#1671](https://github.com/greydragon888/real-router/issues/1671) deletes outright. It retires there, where the CANCEL action reads `ctx.inflight` and this method stops passing a target at all.

  No behaviour change: the edges fire in exactly the same situations they did before.

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the epoch condition from the LEAVE_APPROVE edge — it could not refuse ([#1670](https://github.com/greydragon888/real-router/issues/1670))

  `when: isOwnEpoch` guarded the `TRANSITION_STARTED --LEAVE_APPROVE--> LEAVE_APPROVED` edge against a stale approval from a superseded navigation. Instrumented over the whole functional tier it was asked **3464 times and refused zero**, and the reason is structural rather than lucky: the asynchronous `LEAVE_APPROVE` arc is exactly one — through `runStep`, where the liveness fence is the first line of the step — and the other two arcs send synchronously right after `beginTransition`, where a reentrant navigate is banned.

  It is **not** inert, and that distinction is what the decision turned on: with the fence deleted the predicate refuses four times, so "no new failing tests when both are removed" meant "no test observes the difference", not "the predicate does nothing". It was removed anyway, because the fence it duplicates is itself pinned — deleting the fence fails the same four tests with the predicate and without it.

  With no reader left, the `epoch` field goes off the `LEAVE_APPROVE` payload and the parameter off `sendLeaveApprove`, so the three senders and the DI closure stop threading a value nobody consults.

  What the predicate would have held is now recorded beside the fence in `guardPhase.ts`, together with a test that names the symptom rather than the cause: without the fence a superseded navigation's approval moves the machine under the dead navigation's payload, `onTransitionLeaveApprove` reports the dead destination, and the survivor's own approval becomes a table no-op — while `navigate()` still resolves and the state still commits. The fence now fails five tests instead of four.

  No behaviour change: the edge fires in exactly the same situations it did before.

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - Re-align the records around the navigation epoch with the code they describe ([#1672](https://github.com/greydragon888/real-router/issues/1672))

  Four records drifted; a fifth was found while fixing them, and one retired itself along the way.

  - **`NavigationContext.myId`** said it lives on that type "because `completeTransition` needs it". `completeTransition` does not mention `myId` at all — [#1626](https://github.com/greydragon888/real-router/issues/1626) was closed by `when: mayCommit` on the COMPLETE edge, not by threading the token. Both readers are inside `executeNavigation`, i.e. the module that owns the plan.
  - **`mayFail`** was right that it cannot refuse (206 asks, 0 refusals, reproduced). What it could not say, and now can: two-sided mutation gives it a **measured residual kill** — removing `asCancellation` alone fails 5 tests, removing it _and_ `mayFail` fails 6, and the sixth is the silent-commit shape from [#1609](https://github.com/greydragon888/real-router/issues/1609). So the division of labour is named rather than assumed: `asCancellation` holds the caller-facing half, `mayFail` the subscriber-facing one.
  - **`mayFail`'s dead disjunct** is now dead by count as well as by argument: all 206 asks carry a live epoch equal to `ctx.epoch`. The same paragraph said "the only no-epoch sender" — there are two, and both take `STARTING --FAIL--> IDLE`.
  - **The edge taxonomy** claimed `canSend` "is read exactly three times in core (NAVIGATE / START / CANCEL)". It is read **five** times: the ask-protocol added COMPLETE (with payload, [#1641](https://github.com/greydragon888/real-router/issues/1641)) and SYSTEM_COMMIT ([#1644](https://github.com/greydragon888/real-router/issues/1644)). The count was written before that protocol existed, and the [#1648](https://github.com/greydragon888/real-router/issues/1648) analysis inherited the number from this comment rather than from the code — a claim that felt doubly confirmed while being one echo.
  - **`hasInflight`'s docstring** described a tautology as if it carried meaning. It retired with the predicate itself in [#1669](https://github.com/greydragon888/real-router/issues/1669); the _reason_ — the band invariant — now lives beside `inflight` in `RouterFSMContext`, where the readers are.
  - **`INVARIANTS.md`** still listed `hasInflight` among the things leaning on committed-state ownership. It now names it as retired, and says the invariant is why.

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - The navigation is counted once, not twice ([#1664](https://github.com/greydragon888/real-router/issues/1664))

  Two mechanisms answered one question. `InFlightNavigation` kept a supersession
  token, handed it to each navigation as `NavigationContext.myId`, and three fences
  asked `inFlight.isCurrent(myId)` — "am I still the navigation in flight?". The
  machine answered the very same question about the very same navigation by
  comparing the plan it had adopted on `NAVIGATE`. A counter beside an identity,
  with a window in which the two could disagree: `begin()` bumped the token before
  the send, so a navigation whose `NAVIGATE` never fired held the token while the
  machine carried somebody else's plan.

  The token is gone. The pipeline asks the machine through one boolean —
  `deps.isCurrentNavigation(plan)` → `ctx.inflight === plan` — so the identity
  still never leaves the machine, and `InFlightNavigation` is left with the one
  thing the machine does not own: a controller to abort. `NavigationContext.myId`,
  `InFlightNavigation.begin()` and `isCurrent()` go with it, along with the
  parameter they were threaded through in `finishAsyncNavigation` and
  `beginTransition`.

  **Behaviour is unchanged, and the equivalence is measured rather than argued.**
  Each of the three fences was mutated to `true` on both sides of the change: the
  guard-pipeline one reds the same four tests before and after (it is the fence the
  `LEAVE_APPROVE` predicate was retired against), and on the other two the token
  conjunct alone killed nothing before the change and the identity conjunct kills
  nothing after — the liveness question each is paired with (`isTransitioning()`,
  the controller's `aborted`) is what those two arcs really stand on. Tiers
  199/3969 functional at 100 % coverage, 44/441 property, 47/153 stress.

- [#1673](https://github.com/greydragon888/real-router/pull/1673) [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161) Thanks [@greydragon888](https://github.com/greydragon888)! - `RouterLifecycleNamespace`'s doc names the surface it actually has ([#1648](https://github.com/greydragon888/real-router/issues/1648))

  The class doc advertised two things it does not own. `stop()` is not a method
  here — the class exposes `setDependencies` and `start`, and stopping is the
  facade sending `STOP`, whose edge `update` (`clearCurrent`) shifts the committed
  pair; a namespace method would be a second writer of state the table owns. And
  `isStarted` has no definition anywhere in `src` other than that sentence — the
  live accessor is `isActive()`, which reads the FSM.

## 0.87.0

### Minor Changes

- [#1667](https://github.com/greydragon888/real-router/pull/1667) [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084) Thanks [@greydragon888](https://github.com/greydragon888)! - The start window is closed by the dispatch rule, not by a precondition of its own ([#1647](https://github.com/greydragon888/real-router/issues/1647))

  `emitRouterStart` was the one router emit that did not raise the dispatch depth.
  That is the whole reason the boot window needed a hand-rolled predicate on the
  facade: `completeStart()` reaches `READY` before the boot navigation commits, so
  a plugin's `onStart` runs on a machine where `NAVIGATE` is declared, and a
  navigation started there ran to completion, announced `TRANSITION_SUCCESS`, and
  was then overwritten by the boot.

  Counting the `$start` dispatch puts that window under the rule the other four
  already use — `Router.#assertNotReentrant`, the same ban a transition listener
  gets ([#1610](https://github.com/greydragon888/real-router/issues/1610) / RFC navigation-cancellation-unification §4). Both facade
  preconditions are gone with it: `Router.#refusesBeforeBootCommit` ([#1661](https://github.com/greydragon888/real-router/issues/1661)) and the
  inline `navigateToNotFound` refusal ([#1644](https://github.com/greydragon888/real-router/issues/1644)). Nothing about WHICH calls are
  refused changed — measured across all five windows, with the ledger of announced
  states unchanged on every one.

  **Migration.** From a plugin's `onStart` hook or a raw `ROUTER_START` listener,
  `navigate` / `navigateToDefault` / `navigateToState` now **throw
  `REENTRANT_NAVIGATION` synchronously** instead of returning a promise that
  rejects `ROUTER_NOT_STARTED`. `navigateToNotFound` already threw there; only its
  code changes, `ROUTER_NOT_STARTED` → `REENTRANT_NAVIGATION`. Inside a hook the
  emitter's `onListenerError` isolation surfaces the throw (visible, non-fatal) and
  the router still starts — which is strictly more than the previous refusal
  offered a fire-and-forget caller, whose rejection was pre-suppressed and silent.

  Defer instead (`queueMicrotask` / `await`), or navigate after `start()` resolves.
  For an auth redirect out of the start route, use a `canActivate` guard on it: a
  guard runs after the announce, outside the dispatch, and superseding the boot
  from there is legal and unchanged.

  Unaffected: a `navigate()` from a **guard** of the start navigation (the classic
  redirect), a `navigateToNotFound` from such a guard (its 404 displaces the boot's
  commit rather than being overwritten), `stop()` / `dispose()` / route CRUD from
  `onStart`, and every arc after `start()` resolves.

  The diagnostics the two preconditions carried did not go with them — they moved
  to the sites that already knew the phase, so a caller inside a start
  **interceptor** (where no emit is on the stack and the refusal is the FSM
  table's) still gets a sentence naming the boot window instead of a bare
  `ROUTER_NOT_STARTED`. An ordinary never-started router keeps the plain message.

### Patch Changes

- [#1667](https://github.com/greydragon888/real-router/pull/1667) [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084) Thanks [@greydragon888](https://github.com/greydragon888)! - The two reentrancy bans carry their remedy instead of a bare code ([#1665](https://github.com/greydragon888/real-router/issues/1665))

  `REENTRANT_NAVIGATION` and `REENTRANT_TREE_MUTATION` were constructed with no
  message, so `error.message` was the code repeated back. Most of core's errors are
  deliberately bare — `ROUTER_DISPOSED`, `SAME_STATES`, `TRANSITION_CANCELLED`
  describe a SITUATION and the remedy follows from the name. These two are the
  other kind: they name a **rule the caller broke**, and "defer it" follows from
  nothing. While that remedy lived only in the docs it produced two issues ([#1203](https://github.com/greydragon888/real-router/issues/1203),
  [#1219](https://github.com/greydragon888/real-router/issues/1219)), both closed by patching prose, which left the error still saying nothing.

  Nothing else changes: same codes, same throw sites, same timing. Only
  `error.message` is new, and consumers branch on `error.code`.

  The navigation ban now says which of its **two** windows you are in, because one
  sentence cannot serve both:

  - from a router event listener (`subscribe`, `subscribeLeave`, a plugin hook,
    a `ROUTER_START` listener) — "the nested navigation would commit a state the
    outer one overwrites";
  - from the pre-start window ([#1610](https://github.com/greydragon888/real-router/issues/1610)) — a `forwardState` / `buildPath` interceptor,
    a route codec, or a `defaultRoute` / `defaultParams` / `defaultSearch` callback
    — "they run while a navigation is being prepared, before it is announced".

  Telling an interceptor author they are "inside an event listener" would be false
  — no emit is on the stack there at all — and reads as a spurious error.

  The tree-mutation ban names the `subscribeChanges` handler and the atomicity it
  protects. Both messages end with the remedy: defer with `queueMicrotask` or
  `await`.

  Locked by an AST scan over `src` (`reentrancy-ban-messages.test.ts`), so a third
  ban added later cannot ship bare — the behavioural pins cannot catch that,
  because a new site arrives without one.

- [#1667](https://github.com/greydragon888/real-router/pull/1667) [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084) Thanks [@greydragon888](https://github.com/greydragon888)! - Nothing commits before the start navigation does — on the navigate family too ([#1661](https://github.com/greydragon888/real-router/issues/1661))

  `completeStart()` sends `STARTED`, leaving `STARTING` for `READY`, **before** the
  boot navigation commits. Every plugin `onStart` hook therefore runs on a `READY`
  machine with `getState() === undefined` and a commit still owed — and `NAVIGATE`
  is declared on `READY`, so a navigation started from there was accepted, ran to
  completion synchronously, announced `TRANSITION_SUCCESS`, and was then overwritten
  by the boot. Subscribers (i.e. every framework adapter) were handed a committed
  state that stopped being true one tick later.

  `navigate()`, `navigateToDefault()` and `getPluginApi(router).navigateToState()`
  now reject with `ROUTER_NOT_STARTED` in that window, with a message naming it.
  This is the same rule `navigateToNotFound` already enforced ([#1644](https://github.com/greydragon888/real-router/issues/1644)) on the
  channels that fix did not sweep; the refusal is a rejection rather than a throw
  because that is how these three already report failure.

  Unchanged on purpose: a `navigate()` from a **guard of the start navigation** —
  the classic redirect — still works. From `onStart` the router has no navigation in
  flight; from a boot guard it does, and that is the only thing separating the two
  (both run on a `READY` machine with nothing committed). An ordinary not-started
  router also keeps its plain `ROUTER_NOT_STARTED` message.

  Also fixes [#1662](https://github.com/greydragon888/real-router/issues/1662) — with the nested navigation refused, a `start()` whose boot route
  the hook targeted no longer rejects `SAME_STATES`.

## 0.86.0

### Minor Changes

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - The FSM context owns the committed state ([#1641](https://github.com/greydragon888/real-router/issues/1641))

  `state.current` / `state.previous` moved out of `StateNamespace` and into the
  router FSM's context, where they are written by four transition-table edges and
  by nothing else: `COMPLETE` (a navigation commit), `SYSTEM_COMMIT` (the two
  commits that are not transitions — `navigateToNotFound` and the `replace()`
  revalidation), `STOP` and `DISPOSE`. Because an edge's `update` runs only after
  the machine has decided the transition fires, "committed" and "announced" can no
  longer come apart: the silent-commit shape behind [#1609](https://github.com/greydragon888/real-router/issues/1609) / [#1611](https://github.com/greydragon888/real-router/issues/1611) / [#1626](https://github.com/greydragon888/real-router/issues/1626) — state
  written, `TRANSITION_SUCCESS` never emitted, no subscriber notified — stops
  being expressible rather than being guarded against after the fact.

  Nothing on the public surface changes shape: `getState()`, `getPreviousState()`,
  `isActive()` and `isLeaveApproved()` keep their signatures and semantics, and
  `@real-router/sources` and the six framework adapters are untouched.

  **One deliberate behaviour change, and it is why this is a `minor`.** Zeroing
  the committed pair now rides the `DISPOSE` edge, which fires several steps
  earlier in `dispose()` than the old `#state.reset()` — that call sat almost last,
  _after_ `plugins.disposeAll()`. The accessor this is observable through is
  **`getPreviousState()`**: a plugin's `teardown()` that reads it now sees
  `undefined` where it used to see the state the router was disposed from.
  (`getState()` is unaffected — it was already `undefined` in `teardown()`, because
  `dispose()` routes through `stop()`, which has always cleared the current state
  before the plugin teardown step.) No `teardown()` body in this repository reads
  either one and core does not touch the state in that window, but `teardown` is
  public API. If yours needs the final state, capture it in `onTransitionSuccess`
  instead of reading it during teardown.

  Two smaller consequences of the same move:

  - `READY --FAIL--> READY` is gone. Its only senders were reports to observers
    (the plugin-facing `emitTransitionError`, and early refusals such as
    `ROUTE_NOT_FOUND` that never announced a transition to fail); they emit
    `TRANSITION_ERROR` directly, so a stale `FAIL` in `READY` is now a table no-op
    structurally. `STARTING --FAIL--> IDLE` is unchanged — that one is how a failed
    `start()` unwinds.
  - The generic FSM engine backing this (`utils/fsm`, internal) gained guarded and
    context-writing edges (`{ target, when?, update? }`) beside the existing bare
    `target` form, with the table pre-normalized once per table object so the
    dispatch path stays monomorphic.

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - `navigateToNotFound` asks `canDeactivate` before leaving ([#1643](https://github.com/greydragon888/real-router/issues/1643))

  A `canDeactivate` guard blocked `navigate()` and did not block
  `navigateToNotFound()`, which was never asked at all — the one departure the
  guard could not see, and the guard exists to stop exactly this.

  It mattered because the primitive is not exotic: the shipped URL plugins call it
  whenever the browser hands them a URL that no longer matches a route. So the
  user journey was ordinary — an editor with unsaved changes, press Back, land on
  a URL whose route was removed — and the confirm dialog the app registered never
  appeared. The state was gone with no event the app could veto.

  Now the current route's `canDeactivate` guards are consulted. A refusal throws
  `RouterError(CANNOT_DEACTIVATE)`, emits `TRANSITION_ERROR` and leaves the
  committed state untouched. That is what the surrounding handlers already expect:
  the matched-route branch beside it rejects on a blocking guard and its `catch`
  rolls the URL back, and the strict-mode branch throws for the same purpose — the
  `allowNotFound` branch was the only one that could not refuse, and that asymmetry
  was the defect. No plugin change is needed.

  **An async guard resolves to refuse.** A synchronous primitive returning a
  `State` cannot await one, and for a guard whose job is preventing loss "cannot
  ask" has to mean "do not leave". This mirrors `canNavigateTo`, which resolves an
  async guard to `false` for the same reason. If you rely on `navigateToNotFound`
  committing while an async `canDeactivate` is registered on the current route, it
  will now throw — make the guard synchronous, or catch the refusal.

  Unchanged: `start()` with `allowNotFound` (nothing is committed yet, so the
  consult short-circuits), a router with no `canDeactivate` guards at all, and
  `replace()`'s revalidation, which opts out on EVERY arm ([#1652](https://github.com/greydragon888/real-router/issues/1652), same PR): a tree
  swap is an operation the application performed, not a departure the user chose,
  and it has no "stay" branch to offer — after the swap the old route may not
  exist, or may live at another path.

  Related to [#524](https://github.com/greydragon888/real-router/issues/524), which was this contract broken one layer up, in
  `navigation-plugin`'s `forceDeactivate` default. That fix restored confirm-on-back
  only on the arc where the URL still matches a route; this closes the other one.

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - `navigateToNotFound` refuses before the start navigation commits, and the system commit says why it refused ([#1644](https://github.com/greydragon888/real-router/issues/1644))

  Two defects with one root. The state-ownership slice replaced
  `navigateToNotFound`'s liveness gate — `!isActive()`, i.e. IDLE or DISPOSED —
  with the transition table's `canSend(SYSTEM_COMMIT)`, which is true on `READY`
  alone. Those are different questions ("is the router alive?" versus "is the
  machine in the one phase that commits?"), and the wider one kept the narrower
  one's error code.

  **A 404 committed before `start()` has committed anything is a phantom.** Call
  `router.navigateToNotFound(path)` from a plugin's `onStart` hook and it
  committed `UNKNOWN_ROUTE` — then the boot's own commit overwrote it a tick
  later, so every `router.subscribe` consumer saw a `TRANSITION_SUCCESS` for a
  state that never survived. That is the shape [#1610](https://github.com/greydragon888/real-router/issues/1610) removed from the other
  pre-start windows; this one was reachable on both sides of the slice. It now
  throws `ROUTER_NOT_STARTED`, and the boot announces exactly one commit.

  The refusal is deliberately narrow: it fires only when nothing is committed AND
  no navigation is in flight. A `navigateToNotFound` from a guard of the start
  navigation still commits, because the primitive aborts that navigation first —
  its 404 displaces the boot's commit instead of being overwritten by it, so it is
  the final word rather than a phantom.

  **The refusal now reports the reason it refused.** `ROUTER_DISPOSED` is kept for
  a router that really was disposed (the [#1186](https://github.com/greydragon888/real-router/issues/1186) / [#1627](https://github.com/greydragon888/real-router/issues/1627) contract, unchanged); a
  router that is merely starting, stopped or mid-transition gets
  `ROUTER_NOT_STARTED` with a message naming the phase. Previously all of them
  claimed disposal on a router whose own `isActive()` returned `true` — including
  `replace()`'s revalidation when application code left a navigation in flight
  across it.

  If you catch by code around either primitive: a stopped or starting router that
  used to surface as `DISPOSED` now surfaces as `NOT_STARTED`. `DISPOSED` still
  means what it says.

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - `replace()` revalidation no longer asks `canDeactivate` — and no longer evicts to 404 on its refusal ([#1652](https://github.com/greydragon888/real-router/issues/1652))

  When `getRoutesApi(router).replace(routes)` left the user's URL owned by a
  **different** route, the revalidation consulted `canNavigateTo`, which collapses
  two opposite questions into one boolean — "can you ENTER the new route" and "can
  you LEAVE the current one" — and routed every `false` to `navigateToNotFound`.

  That reading is right for the first and exactly backwards for the second. A
  `canDeactivate` saying "do not leave" was answered by eviction to
  `UNKNOWN_ROUTE`, which is the worst outcome available and the very thing the
  guard exists to prevent. Measured on the four-cell matrix: with **no**
  `canDeactivate` the user landed on the new route; with a **refusing** one, on
  `UNKNOWN_ROUTE`. A guard that could not be honoured was making the result worse
  than no guard at all.

  The arm now consults the **activation** half only, which is the half it can
  honour. Two consequences:

  - A refusing `canDeactivate` no longer changes the outcome of a tree swap — the
    user lands wherever they would have landed without it.
  - The activation guards are now always evaluated. The deactivation refusal used
    to short-circuit before them, so "may the user be on the new route" went
    unasked.

  **This is a subtraction, not a new mechanism.** The other two revalidation arms
  already declined to consult `canDeactivate`, each with its reason — survivor:
  the user was legitimately here ([#1201](https://github.com/greydragon888/real-router/issues/1201)); vanished route: the route whose guard
  would speak no longer exists. Route-identity change was the odd one out; all
  three now agree.

  Migration: if you relied on a `canDeactivate` guard to protect unsaved work
  across a `replace()`, that protection never worked — it produced a 404 rather
  than keeping the user. **Check for unsaved work before calling `replace()`.** A
  tree swap is an operation your application performs, not a departure the user
  chose, and the router does not veto its own API on a route guard's behalf.

  Unchanged: `navigate`, `navigateToState` and the public `navigateToNotFound`
  ([#1643](https://github.com/greydragon888/real-router/issues/1643)) all still ask and still refuse — user-initiated departures are exactly
  where the guard has a "stay" branch to offer.

  Closes [#1652](https://github.com/greydragon888/real-router/issues/1652)

### Patch Changes

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - The FSM's dispatch pair stops allocating a rest array per call ([#1641](https://github.com/greydragon888/real-router/issues/1641))

  `send` and `canSend` declared their payload as a conditional rest tuple, which
  is the only way to express the payload/event correlation their types promise —
  but a rest parameter materialises an array on every call, and these are the
  router's hottest entry points.

  The tuple now lives in the overload and the implementation takes the payload
  positionally, so the types are byte-for-byte what they were and the array is
  gone. Measured **−88 B per navigation** (alloc probe, 200-op window, median of
  31 windows, interleaved processes, A/A control at zero drift), with the p90 tail
  collapsing from 2384 to 2133 B — the array was intermittently escaping. Timing is
  a wash at 733 vs 734 ns, so this is purely GC pressure.

  `@real-router/event-emitter` already made this exact trade (`emit(name, a?, b?,
c?, d?)` rather than `...args`); the FSM engine had simply never received it.

  Nothing changes for callers: `send("A", payloadForB)` is still a type error, a
  payload event still requires its payload, and a no-payload event still rejects
  one.

## 0.85.1

### Patch Changes

- [#1639](https://github.com/greydragon888/real-router/pull/1639) [`2fa8aa1`](https://github.com/greydragon888/real-router/commit/2fa8aa1af2652a2d5bb49187060bf13ced540d5e) Thanks [@greydragon888](https://github.com/greydragon888)! - Do not commit over a nested navigation that has not finished yet ([#1626](https://github.com/greydragon888/real-router/issues/1626))

  A guard factory recompiled inside `completeTransition` may start a nested
  navigation. When that navigation ran to completion, [#1611](https://github.com/greydragon888/real-router/issues/1611) already refused the
  outer commit; when it is still **in flight**, the outer navigation committed on
  top of it — `navigate()` resolved with success, `TRANSITION_SUCCESS` was emitted
  for a navigation the FSM had already cancelled, and the nested navigation's
  result was silently lost.

  `isTransitioning()` cannot tell the two apart: with a nested navigation parked in
  an async guard the machine _is_ in a transition — somebody else's. The commit now
  also asks the supersession token (`inFlight.isCurrent(nav.myId)`), and neither
  half subsumes the other: the token is unmoved when a factory merely `dispose()`s
  the router, and the machine is still transitioning when the supersede is another
  navigation. A superseded navigation now rejects `TRANSITION_CANCELLED` and the
  nested result stands.

- [#1639](https://github.com/greydragon888/real-router/pull/1639) [`2fa8aa1`](https://github.com/greydragon888/real-router/commit/2fa8aa1af2652a2d5bb49187060bf13ced540d5e) Thanks [@greydragon888](https://github.com/greydragon888)! - Do not commit `replace()`'s revalidation on a router torn down mid-call ([#1627](https://github.com/greydragon888/real-router/issues/1627))

  `replace()` calls `clearDefinitionGuards()`, which recompiles the compiled guard
  slot from a surviving **external** factory ([#1192](https://github.com/greydragon888/real-router/issues/1192)) — application code, running
  after `replace()`'s entry `throwIfDisposed()`. A `dispose()` or `stop()` from
  there did not stop the swap: it finished, revalidated the URL and committed on a
  dead router, emitting nothing at all (dispose had already cleared the listeners),
  so no subscriber, plugin or adapter ever learned of the state it was left with.

  The revalidation commit now re-asks liveness on the same side of that user code
  as the commit itself, and throws `ROUTER_DISPOSED`. This also removes an
  asymmetry: the third revalidation arm (URL no longer matches) was never exposed,
  because it routes through `navigateToNotFound`, whose own liveness gate already
  throws — all three arms now refuse the same way with the same code.

## 0.85.0

### Minor Changes

- [#1624](https://github.com/greydragon888/real-router/pull/1624) [`9df8c95`](https://github.com/greydragon888/real-router/commit/9df8c95d243a56c548be367390513400585e2e6b) Thanks [@greydragon888](https://github.com/greydragon888)! - Never mutate a caught RouterError — re-code a copy; freeze the cached rejection singletons ([#1606](https://github.com/greydragon888/real-router/issues/1606))

  `rethrowAsRouterError` used to rewrite the caught error's `code` (and message) in place via `error.setCode(...)`. The three cached rejection errors (`SAME_STATES`, `ROUTE_NOT_FOUND`, `ROUTER_NOT_STARTED`) are module-level singletons, so a guard that merely awaited a navigation rejecting with one of them permanently poisoned that error's code for the whole process — every later consumer (user `.catch()`, every plugin's `onTransitionError`), across routers and SSR per-request clones, observed `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` instead of the real code.

  - A guard-thrown (or guard-propagated) `RouterError` is now re-coded on a **copy**: same `setCode` message semantics, `segment` / `path` / custom fields / `stack` carried over. The instance the guard threw is left untouched; the [#933](https://github.com/greydragon888/real-router/issues/933) carve-out (`RouterError(TRANSITION_CANCELLED)` passes through as-is) is unaffected.
  - **Breaking change (pre-1.0).** The three cached rejection errors are now `Object.freeze`d as a backstop: an in-place write to one of them (e.g. `err.retried = true` in a `.catch()`) throws a `TypeError` in strict mode instead of silently corrupting the error every other consumer in the process sees. Treat caught navigation errors as read-only.

## 0.84.0

### Minor Changes

- [#1619](https://github.com/greydragon888/real-router/pull/1619) [`f8ae8a6`](https://github.com/greydragon888/real-router/commit/f8ae8a6b34e587180dcdcfb0a21c5387309325f5) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): `clear()` refuses while a state is committed, instead of resetting it silently ([#1612](https://github.com/greydragon888/real-router/issues/1612))

  **Breaking change (pre-1.0).** `getRoutesApi(router).clear()` now throws `RouterError(ROUTER_NOT_STOPPED)` when `router.getState() !== undefined`. It is legal before `start()` and after `stop()`.

  `clear()` used to drop the committed state to `undefined` and tell nobody: every `router.subscribe` consumer — `@real-router/sources` and all six framework adapters through `useSyncExternalStore` / signals — kept rendering a route the router had already discarded. It also left the router in `isActive() === true` with no state, a shape that otherwise exists only _during_ `start()`; an always-on guard already misreads it, with path-less `navigateToNotFound()` answering `ROUTER_NOT_STARTED` on a started router.

  Announcing the reset instead (making `clear()` behave like `replace([])`) was measured and rejected. It would make route CRUD emit a transition event as a **rule** — `replace()` is deliberately the one structural mutation that emits one — and it would not remove the shape, only make it prettier. It is also not the same operation: `replace([])` preserves external guards, `clear()` destroys them. Refusing removes the crossing outright: `clear()` stops writing into state it does not own.

  **Migration.** To swap the tree on a **running** router use `replace(routes)` — atomic, one tree rebuild, notifies subscribers, and preserves external guards:

  ```diff
  - routesApi.clear();
  - routesApi.add(newRoutes);
  + routesApi.replace(newRoutes);
  ```

  To genuinely tear the router down, stop it first:

  ```diff
  + router.stop();
    routesApi.clear();
  ```

  The pre-existing "navigation in progress" precondition is unchanged and still logs-and-no-ops; the two hand over to each other, since it now applies only in the window where a navigation is in flight and no state is committed yet — the initial `start()`.

  Also records `clear()`'s atomicity contract, which was never written down: unlike `replace` / `add` / `update` (prepare-then-commit, pre-flighted, declared), `clear()`'s is **structural** — three consecutive steps that hold together only because no user code runs in them. `INVARIANTS.md` now states it with its class named, backed by a post-condition property test (tree, guards and BOTH state cells go empty together), so a callback landing in one of those steps is recognised as a contract break rather than a refactor.

  New error code: `errorCodes.ROUTER_NOT_STOPPED` (`"NOT_STOPPED"`).

## 0.83.1

### Patch Changes

- [#1617](https://github.com/greydragon888/real-router/pull/1617) [`56bf406`](https://github.com/greydragon888/real-router/commit/56bf40623c3bc60425df34f8e52268a045301d0b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): a router torn down mid-commit no longer gets the commit ([#1611](https://github.com/greydragon888/real-router/issues/1611))

  `completeTransition` runs exactly one piece of application code before `setState`: the post-leave cleanup clears the external `canDeactivate` guard, and when a **definition** factory survives that clear the slot is recompiled by invoking it. A factory that calls `router.dispose()` or `router.stop()` is violating its documented contract (guard factories must be side-effect-free with respect to the router), but the failure mode was silent state corruption rather than an error: `setState` proceeded, `navigate()` **resolved with success**, and `COMPLETE` from `DISPOSED` / `IDLE` is a table no-op — so no `TRANSITION_SUCCESS` ever reached subscribers. The router ended up holding a state it committed after it was terminated, and nothing was told.

  The [#1169](https://github.com/greydragon888/real-router/issues/1169) commit-gate could not see it: it sits _before_ `completeTransition`, i.e. on the far side of that user code, and is gated on `suspendable` while this reproduces on the uncancellable `completeImmediate` arc ([#1588](https://github.com/greydragon888/real-router/issues/1588)) — which `forceDeactivate: true` selects. The defect is positional, not arc-specific: the check happened on one side of the user code and the commit on the other.

  The commit is now re-checked on the same side as the user code, and the navigation rejects with `TRANSITION_CANCELLED` — the same outcome a caller already gets when a listener stops the router mid-flight. The question asked is `isTransitioning()` rather than `isActive()`, which additionally covers a factory that starts a **nested navigation**: that runs to completion and leaves the FSM in `READY`, so the outer commit used to silently overwrite the nested one's result. The check is gated on whether anything was actually cleared, so a navigation that runs no factory pays a boolean on the `[#307](https://github.com/greydragon888/real-router/issues/307)` hot path, and the arc allocates no `AbortController` — verified by counting.

  Two adjacent cells are deliberately out of this fix and remain open: a nested navigation still _in flight_ (the FSM is inside its transition, so the question answers for somebody else), and the `replace()`-revalidation commit path, which has no liveness check of its own.

## 0.83.0

### Minor Changes

- [#1615](https://github.com/greydragon888/real-router/pull/1615) [`585f435`](https://github.com/greydragon888/real-router/commit/585f4358d1beec9dccae8688d3878f5d589fad89) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard the pre-start window — a nested navigation from an interceptor or a codec is refused ([#1610](https://github.com/greydragon888/real-router/issues/1610))

  **Breaking change (pre-1.0).** Calling `navigate()` / `navigateToDefault()` / `navigateToState()` / `navigateToNotFound()` from **inside the code that prepares a navigation** now throws `RouterError(REENTRANT_NAVIGATION)` synchronously, before anything is committed.

  That window is everything the router runs before it announces a transition: the `forwardState` and `buildPath` interceptor chains, a route's `encodeParams` / `decodeParams`, and the `defaultRoute` / `defaultParams` / `defaultSearch` callbacks resolved by `navigateToDefault()`. It was the one hole between the two bans that already existed — `REENTRANT_NAVIGATION` for transition listeners and `REENTRANT_TREE_MUTATION` ([#1032](https://github.com/greydragon888/real-router/issues/1032)) for `subscribeChanges` handlers — because both key off the event emitter's dispatch depth, and an interceptor runs before any emit.

  A nested navigation there used to run to completion, with two observable consequences:

  - **The outer navigation's `fromState` shifted under it.** Asking to go from `home`, the transition reported starting from wherever the nested navigation had left the router.
  - **The nested navigation got a full `TRANSITION_SUCCESS` that was overwritten a tick later** — subscribers saw a committed state that stopped being true immediately.

  What is unchanged: a guard runs _after_ the announce, so the classic guard-redirect (`navigate(...)` then `return false`) is still an ordinary supersede. `matchPath()` runs the same `buildPath` chain but prepares no navigation, so navigating from its interceptors stays allowed. Deferred navigation is unaffected.

  **Migration:** defer the navigation so it runs once the preparing call has returned.

  ```diff
    api.addInterceptor("forwardState", (next, name, params) => {
  -   if (shouldRedirect(name)) router.navigate("login");
  +   if (shouldRedirect(name)) queueMicrotask(() => router.navigate("login"));
      return next(name, params);
    });
  ```

  Also records the invariant this protects — _a navigation departs from the state committed when it was requested_ — in `INVARIANTS.md` with a property test over all three pre-start windows.

## 0.82.3

### Patch Changes

- [#1613](https://github.com/greydragon888/real-router/pull/1613) [`eb128af`](https://github.com/greydragon888/real-router/commit/eb128af7057b3c1379ef5b0a5fff3807dc8d9b7b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): a superseded navigation no longer reports its failure into the live FSM ([#1609](https://github.com/greydragon888/real-router/issues/1609))

  A navigation that had already been cancelled could still send `FAIL` into the router's state machine, because the failure paths reported by error CODE alone and `CANNOT_ACTIVATE` is not `TRANSITION_CANCELLED`. Reached two ways:

  - **A rejecting async guard.** `finishAsyncNavigation` consulted liveness only where its guard/abort race RESOLVES; a rejection threw straight past that check into the `catch`. When the guard's rejection won a 1–2 microtask race against the abort that was meant to silence it, the dead navigation reported anyway.
  - **The classic synchronous guard-redirect** — a guard that calls `navigate(...)` elsewhere and returns `false` — hit it on **every** invocation, not as a race: the guard's `CANNOT_ACTIVATE` was reported after the redirect target had already committed.

  Two outcomes, depending on where the FSM was when the stale `FAIL` landed. With the FSM in `READY` it was observability noise — `[START, CANCEL, START, SUCCESS, ERROR]`, i.e. two mutually exclusive terminal outcomes for one navigation (the shape [#1197](https://github.com/greydragon888/real-router/issues/1197) fixed on the no-guards path). With a navigation still in flight it was **silent state corruption**: `TRANSITION_STARTED --FAIL--> READY` moved the machine out from under the live navigation, so its later `COMPLETE` became a table no-op — the state committed and `navigate()` resolved, while `TRANSITION_SUCCESS` never fired and no `router.subscribe` consumer (`@real-router/sources` and every framework adapter) was notified.

  Both failure arcs now report only while the navigation is still the one in flight, and restate a lost-liveness failure as the cancellation it actually was — so the caller's promise agrees with the `TRANSITION_CANCEL` the navigation already emitted instead of carrying a guard verdict nobody is waiting for. A value that already carries `TRANSITION_CANCELLED` is threaded through untouched, so [#1197](https://github.com/greydragon888/real-router/issues/1197)'s canonicalized leave rejection keeps its `reason` ([#943](https://github.com/greydragon888/real-router/issues/943)). Genuine failures of a live navigation are unchanged.

  Behaviour change worth noting: `navigate()` for a superseded navigation now rejects with `RouterError(TRANSITION_CANCELLED)` (carrying the original error as `reason`) instead of the stale guard verdict, and emits no `TRANSITION_ERROR`. Both codes are in `SUPPRESSED_ERROR_CODES`, so fire-and-forget calls stay silent either way.

## 0.82.2

### Patch Changes

- [#1604](https://github.com/greydragon888/real-router/pull/1604) [`72d2a48`](https://github.com/greydragon888/real-router/commit/72d2a4849df47bbe9b001ae82323cf15f33d3ef0) Thanks [@greydragon888](https://github.com/greydragon888)! - The navigation pipeline is cut by cancellability, and driven by one phase program ([#1588](https://github.com/greydragon888/real-router/issues/1588))

  Internal refactor — no public behaviour changes, and the cancellation property
  suite that pins them is green and untouched.

  Two cuts. **By cancellability:** a navigation that nothing can cancel and nothing
  in which can suspend — no guards, no `subscribeLeave` listener, no caller
  `signal`, no pre-commit plugin listener — now runs through a path where the
  cancellation machinery is not skipped but ABSENT. No `AbortController`, no
  liveness closure, no commit-gate, and a plain `State` return. Being unable to
  suspend became a property of the code rather than a fact to remember.

  **By program and interpreter:** the guard pipeline was three orchestrators and
  two copies of the guard loop, differing in one branch, each wired to its own
  continuation. It is now one program of three fixed phases walked by a cursor of
  two numbers, with a synchronous interpreter that stops when a step hands back a
  Promise and an asynchronous one that settles it and hands the cursor straight
  back. Switching between them is a single act rather than four bespoke tails.

  The payoff is not speed or size — both came out at parity, as predicted. It is
  that **eight cancellation checks became one, and that one is observable.** Five
  of the eight were mutationally unkillable: neutralising them left the whole suite
  green, which means their _breakage_ was as invisible as their removal, because a
  navigation reaching them was already covered by the liveness check one layer up.
  The single check that replaces them sits where nothing else guards it — removing
  it now fails four tests.

- [#1604](https://github.com/greydragon888/real-router/pull/1604) [`72d2a48`](https://github.com/greydragon888/real-router/commit/72d2a4849df47bbe9b001ae82323cf15f33d3ef0) Thanks [@greydragon888](https://github.com/greydragon888)! - A guard on a route the transition never walks no longer arms the cancellation machinery ([#1588](https://github.com/greydragon888/real-router/issues/1588))

  `hasGuards` was read from the router-wide guard Maps (`size > 0`), so a single
  `canActivate` on an admin page sent **every** navigation down the guarded branch:
  an `AbortController`, the `isCurrentNav` closure and a three-phase interpreter
  walk that found no guard on any of its steps. The predicate now asks about the
  segments this transition actually walks, mirroring what the interpreter would do
  (a phase whose short-circuit is false runs no step, so `forceDeactivate` disarms
  it too).

  Measured on the production bundle, same-session A/B with an A/A control: a
  navigation that never touches the guarded route went from **+97.7 ns / +643 B**
  over the guard-free path to **+4.7 ns / +24 B** — −12% time and −29% allocations
  on that navigation. Routers with no guards are unaffected (one `Map.size` load).

  No behaviour change: the two branches were already equivalent, which is why the
  waste was invisible to the suite. Pinned by counting allocated controllers
  (`guards-off-path.test.ts`), not by timing.

- [#1604](https://github.com/greydragon888/real-router/pull/1604) [`72d2a48`](https://github.com/greydragon888/real-router/commit/72d2a4849df47bbe9b001ae82323cf15f33d3ef0) Thanks [@greydragon888](https://github.com/greydragon888)! - Fire-and-forget suppression moves to the producer, and the `lastSync*` side channel is gone ([#1588](https://github.com/greydragon888/real-router/issues/1588))

  Internal refactor. `navigate` / `navigateToDefault` and the `navigateToState`
  plugin primitive still return `Promise<State>`, still suppress the same expected
  rejections, and still hand back the same cached rejection singletons by identity.

  One measurable timing change, in the only place the widened return type reaches
  an `async` caller: `router.start()` now settles **two microtask ticks earlier**
  on the sync-commit path, because `RouterLifecycleNamespace.start` returns a bare
  `State` instead of a thenable it has to adopt. Only ever earlier, never later,
  and the committed state is identical — but if you order work against `start()`
  by microtask position rather than by `await`, that is the one thing to re-check.

  What changed underneath: `NavigationNamespace` exposed two mutable public fields,
  `lastSyncResolved` / `lastSyncRejected`, that the facade read in three identical
  blocks to decide whether to attach a suppressing `.catch()`. That is a side
  channel for something a return type can say, and it had already produced two bugs
  ([#721](https://github.com/greydragon888/real-router/issues/721)) by going out of sync with reality.

  Now the namespace answers with `State | Promise<State>` — a synchronously settled
  navigation says so by returning a `State`, which is what `lastSyncResolved`
  announced — and it suppresses its own rejections at one checkpoint per public
  method, recognising its pre-suppressed singletons by identity instead of by flag.
  The three facade blocks collapse to a single `Promise` wrap.

  The two mechanisms cost the same (measured: ~5 ns either way), but they fail in
  opposite directions: a missed identity costs one redundant `.catch()`, while a
  flag left stale skips suppression on a _later_ navigation and leaks the
  rejection — [#721](https://github.com/greydragon888/real-router/issues/721) exactly. The suppression policy itself (`SUPPRESSED_ERROR_CODES`)
  is now shared rather than duplicated: `start()` classifies its own failures by it
  too.

- [#1604](https://github.com/greydragon888/real-router/pull/1604) [`72d2a48`](https://github.com/greydragon888/real-router/commit/72d2a4849df47bbe9b001ae82323cf15f33d3ef0) Thanks [@greydragon888](https://github.com/greydragon888)! - Decompose NavigationNamespace — the per-navigation state first, the orchestration after ([#1607](https://github.com/greydragon888/real-router/issues/1607))

  `NavigationNamespace.ts` was 962 lines, and almost all of it belonged there: 13
  of its 19 members need the DI bag, which is the namespace's reason to exist. The
  exception was a coherent sub-domain with a tiny owner set — `#currentController`
  and `#navigationId`, the lifecycle of one in-flight navigation.

  Naming that state as `InFlightNavigation` (`begin` / `isCurrent` / `adopt` /
  `release` / `abort`, one instance per router) is what let the orchestration
  follow: `executeNavigation`, the two-pass prologue, `finishAsyncNavigation` and
  `handleNoGuardsLeave` are now functions over `(deps, inFlight, plan)` in
  `transition/executeNavigation.ts`. `navigateToNotFound` — the one commit
  primitive that is not a transition — and `resolveAsyncGuard` moved to their own
  homes too. The namespace is 327 lines and holds the entry points, their
  fire-and-forget checkpoint, and the DI bag.

  Internal only: no public API, no behaviour change. Verified with a zero
  test-delta pathspec (positive control), 3840 functional / 432 property / 153
  stress green, coverage 100%, and allocations bit-identical against the
  production bundle across alternating OLD/NEW runs.

- [#1604](https://github.com/greydragon888/real-router/pull/1604) [`72d2a48`](https://github.com/greydragon888/real-router/commit/72d2a4849df47bbe9b001ae82323cf15f33d3ef0) Thanks [@greydragon888](https://github.com/greydragon888)! - `start()` no longer leaks an unhandledRejection when called twice without `await` ([#1605](https://github.com/greydragon888/real-router/issues/1605))

  `Router.start()` attached its fire-and-forget suppressor at the BOTTOM of the
  method, below an early `return Promise.reject(CACHED_ALREADY_STARTED_ERROR)`. So
  the one rejection that leaves `start()` first was the one nothing covered: a
  second, unawaited `start()` raised an `unhandledRejection`, which under Node
  22+'s default `--unhandled-rejections=throw` **terminates the process** — with a
  stack pointing at the cached error's module constant rather than at the caller.
  `canStart()` is also false during `STARTING`, so this covered two _concurrent_
  `start()` calls, not only sequential ones — the shape a double mount, a React
  StrictMode double effect, or an HMR reload produces.

  It was the only uncovered rejection site in the package: the seven in
  `NavigationNamespace` go through its `#settle` checkpoint, the three cached
  rejection singletons carry a module-load `.catch()`, and the remaining two in
  `Router.start()` land in `internalStart`, which already had two handlers.

  Fixed the way the navigate family was fixed — **one checkpoint per public
  method** rather than a `.catch()` remembered at each `return` site, because a
  remembered one can be forgotten and a forgotten one is invisible until it leaks.
  `start()` is now a wrapper that suppresses whatever `#start()` returns, so no
  future early return can reopen the hole.

  `ROUTER_ALREADY_STARTED` joins `SUPPRESSED_ERROR_CODES`, so the safety net stays
  silent for it: calling `start()` twice reports "already done", exactly as
  `SAME_STATES` does for `navigate()`, and reporting a caller's own no-op as an
  internal fault would be the wrong answer. Awaiting callers are unaffected —
  `start()` still rejects with `ROUTER_ALREADY_STARTED`. Nothing changes on the
  navigation side; `navigate()` cannot produce that code.

## 0.82.1

### Patch Changes

- [#1597](https://github.com/greydragon888/real-router/pull/1597) [`3798458`](https://github.com/greydragon888/real-router/commit/3798458dc7305105aff51ac6a3cb0a9695e6c1fc) Thanks [@greydragon888](https://github.com/greydragon888)! - perf: the path channel is frozen where it is published, not where it is merged ([#1598](https://github.com/greydragon888/real-router/issues/1598))

  `canonicalize`'s fast path froze the params bag on every call — including the
  calls that never publish it. `buildPath` returns a string, `isActiveRoute` returns
  a boolean, and both discarded the frozen bag on the next line, so the freeze was
  paid by every `<Link>` render for a guarantee only a committed state needs.

  The freeze moves to `materialize`, the one place a `Canonical` becomes something
  user code can hold — before its `skipFreeze` branch, which defers the state SHELL
  and never the channels, so guards on the navigate path still see immutable bags.

  `params` only. `canonical.query` is already frozen on every path (the
  `EMPTY_SEARCH` singleton on the fast one, `admittedSearch`'s own result on the
  slow one), and re-freezing a frozen object is not free — freezing both regressed
  `isActiveRoute-exact` by 9.8 % where freezing one wins.

  Measured against pre-pipeline `0fed89b`, medians of 9 alternating single-module
  processes, A/A floor ≤ 1 %: `buildPath` −14.6 % params / −9.3 % static / −7.9 % on
  a `?`-declaring route, `canNavigateTo` −6.9 % (now **0.99×** of pre-pipeline — that
  predicate's pipeline cost is fully paid back), `isActiveRoute-parent` −6.8 %.
  `isActiveRoute-exact` is flat by construction: it publishes a state, so it pays the
  same freeze one line later.

  The `Canonical`-level contract narrows accordingly and is restated in
  `INVARIANTS.md`: channels are frozen by PUBLICATION rather than by merge. That is
  safe because a `Canonical` has exactly two consumers — `buildURL`, which reads, and
  `materialize`, which publishes — and the brand is unexported, so there can be no
  third.

- [#1597](https://github.com/greydragon888/real-router/pull/1597) [`3798458`](https://github.com/greydragon888/real-router/commit/3798458dc7305105aff51ac6a3cb0a9695e6c1fc) Thanks [@greydragon888](https://github.com/greydragon888)! - perf: `canonicalize`'s fast-path gate reads two values, not three ([#1589](https://github.com/greydragon888/real-router/issues/1589))

  The gate that decides "nothing to merge, nothing to gate" read `defaultParams`,
  `defaultSearch` and `queryNames` on every call — three port hops per `<Link>`
  render — and discarded all three on the fast path.

  The third term was redundant. The gate's other half already establishes that the
  caller brought no query bag, and the merged query bag has exactly two sources
  (`defaultSearch` and the caller's own), so an empty bag has nothing for the mode
  gate to drop however many `?names` the route declares. That is established rather
  than argued: the term survives all 3808 tests, and a 33-probe × 3-mode matrix
  over a `?`-declaring route with no defaults is byte-identical without it. It cost
  ~12 ns per call, because `getQueryParams` is a four-frame chain to a cached Map
  rather than a Map read — and dropping it widens the fast path to routes that
  declare query params but carry no defaults.

  The two remaining reads stay above the gate on purpose: they are its route half
  AND the slow path's first input, so the fast path pays two hops and the slow path
  pays nothing extra. A variant collapsing them into one `mergesNothing()`
  predicate was built and measured — indistinguishable on the fast arms, +10.6 % on
  the defaults path — and dropped.

  No behaviour change. Measured against pre-pipeline `0fed89b` as medians of 9
  alternating single-module processes, A/A floor ≤ 0.7 %: `isActiveRoute` −12.2 % /
  −12.8 %, `buildPath` −16.8 % static / −13.7 % params / −19.9 % on a `?`-declaring
  route, `canNavigateTo` −8.2 % (now 1.06× of pre-pipeline — parity), and −0.3 % on
  the defaults path.

- [#1597](https://github.com/greydragon888/real-router/pull/1597) [`3798458`](https://github.com/greydragon888/real-router/commit/3798458dc7305105aff51ac6a3cb0a9695e6c1fc) Thanks [@greydragon888](https://github.com/greydragon888)! - perf: `isActiveRoute` stops touching the forward maps in a tree that has no `forwardTo` ([#1595](https://github.com/greydragon888/real-router/issues/1595))

  `isActiveRoute`'s second arm ([#1573](https://github.com/greydragon888/real-router/issues/1573)) is gated on "does this route forward?", asked
  as two lookups in `config.forwardMap` / `config.forwardFnMap`. Both are
  `Object.create(null)` objects, which V8 keeps in **dictionary mode** whatever their
  size — empty ones included — and the pair measured ~14 ns. That was paid by every
  route in the tree for a feature only forwarding routes use, on the shape that
  reaches the gate: an **inactive** link, which is most links on a page.

  The gate now asks a tree-wide question first: `RoutesStore.hasAnyForward`, one
  boolean load. A tree with no `forwardTo` never touches the maps; a tree that has
  one falls through to the same per-route check as before.

  The cost was **not** the `Object.hasOwn` form — replacing it with a plain property
  read measured identical — but touching the dictionaries at all. Two other
  candidate mechanisms were built and measured null before this one: extracting the
  arm's tail into its own method, and giving each arm a monomorphic
  `#matchesActiveState` call site.

  `hasAnyForward` is derived state, and a stale `false` would silently switch the arm
  off — a `<Link>` to a forwarding route rendering inactive again, the defect [#1573](https://github.com/greydragon888/real-router/issues/1573)
  exists to fix. It is therefore maintained only alongside `resolvedForwardMap`,
  through a single `adoptForwardState` helper, and pinned across `add` / `update` /
  `replace` / `clear` / dynamic-callback / never-forwards by six cases in
  `isActiveRoute.test.ts` (mutationally validated: pinning the flag fails four of
  them).

  Measured against pre-pipeline `0fed89b` as medians of 9 alternating single-module
  processes, A/A floor ≤ 1 %: `isActiveRoute` on an inactive link 44.3 → 32.9 ns
  (−25.7 %), which is 1.75× → 1.29× of its pre-pipeline cost. No other arm moved.

- [#1597](https://github.com/greydragon888/real-router/pull/1597) [`3798458`](https://github.com/greydragon888/real-router/commit/3798458dc7305105aff51ac6a3cb0a9695e6c1fc) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: name the owner of state immutability, and guard it per producer ([#1599](https://github.com/greydragon888/real-router/issues/1599))

  "States are deeply frozen" was true but owned by nobody. The depth is assembled
  from four unrelated places — `canonicalize`'s fast path, `mergeWithDefault`,
  `admittedSearch`'s drop branch, and a shell freeze — and two of them were guarded
  by no test at all: deleting the `canonicalize` freeze left the entire suite green,
  and the mode gate's freeze was reachable only under a non-`loose` mode with one
  query key dropped and one admitted.

  No behaviour change. What changed is that the policy is now stated and pinned:

  - `INVARIANTS.md` gains **State immutability (who freezes what)** — every object
    is frozen once, at its origin, with the measured reason not to centralise into a
    recursive walk (re-freezing an already-frozen object costs ~8 ns, so a walk pays
    per node for work the producers already did).
  - A black-box producer matrix in `tests/functional/error/helpers.test.ts` covers
    `navigate` (path params / query channel / route defaults), `makeState` with and
    without params, `navigateToNotFound`, `replace()` revalidation, and a non-`loose`
    mode with a dropped key. Mutationally validated against all four freeze sites.
  - The `canonicalize` freeze property now crosses **both** paths — it used to pass a
    fresh query bag on every run, so it only ever exercised the slow one.
  - `freezeStateInPlace` → `freezeStateShell`: the old name promised a depth it never
    delivered, and `CLAUDE.md` described a recursive traversal that had been gone for
    some time. Internal, never exported from the package.

## 0.82.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Let a caller's value outrank a forwardTo chain default in either bag ([#1570](https://github.com/greydragon888/real-router/issues/1570))

  Layering a chain default into the channel the TARGET declares ([#1570](https://github.com/greydragon888/real-router/issues/1570)) split the
  default and the caller's value across DIFFERENT bags whenever the caller named
  the key in `params` while the target declares it with `?`. Nothing ranks two
  values in two channels, and the channel-separation seam spreads `search` last —
  so the DEFAULT won and the caller's value was lost, silently:

  ```ts
  createRouter([
    {
      name: "src",
      path: "/src",
      forwardTo: "dst",
      defaultParams: { lang: "fr" },
    },
    { name: "dst", path: "/dst?lang" },
  ]);

  router.navigate("src", { lang: "de" }); // committed /dst?lang=fr — "de" gone
  ```

  `forwardState` now splits the chain defaults ALONE and layers each half under the
  caller in its own channel, declining to default a slot the caller already filled
  in either bag. Nothing moves between channels — the caller's key stays where the
  caller put it — so channel correctness remains the producer's contract.

  Two fixes for the price of one: the same code path used a spread to merge the
  query half, which copied an explicit `undefined` over and DELETED the default.
  `undefined` is absence on both sides of a merge ([#1550](https://github.com/greydragon888/real-router/issues/1550) / [#1551](https://github.com/greydragon888/real-router/issues/1551)), so
  `navigate("src", {}, { lang: undefined })` now keeps `lang: "fr"` — symmetric
  with a route-level `defaultSearch`, where the rule already held.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Give `buildNavigationState` a `search?` slot ([#1571](https://github.com/greydragon888/real-router/issues/1571))

  `getPluginApi().buildNavigationState(name, params)` was the ONE pipeline entry
  point that could not express a query intent — `navigate`, `buildPath`,
  `canNavigateTo`, `isActiveRoute` and `makeState` all take a query channel
  (verified individually). A caller could only reach `state.search` by riding
  declared keys in the `params` bag, which is exactly the shape the always-on
  channel guard is meant to reject.

  ```ts
  buildNavigationState(name, params?, search?)   // third slot, additive
  ```

  The argument flows THROUGH the `forwardState` seam rather than past it, so it
  picks up the same semantics the other five have: an explicit value beats a
  declared twin the caller rode in `params`, and a `search-schema` interceptor
  sees the query channel. Left undefined it stays undefined — the frozen
  empty-search singleton is applied downstream, so the two-argument form allocates
  exactly as before.

  Purely additive: every existing two-argument call keeps its behaviour. Measured
  acceptance — the one-call form now reproduces, byte for byte, the double-call
  workaround its only consumer (`shared/browser-env`'s `createReplaceHistoryState`)
  uses today, across a plain intent, a params-bag twin, a `defaultSearch` route, a
  `forwardTo` resolution and an empty bag. Dropping that workaround is its own
  step ([#1574](https://github.com/greydragon888/real-router/issues/1574)).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Apply a route's query defaults in `buildPath` when the caller names no search channel ([#1578](https://github.com/greydragon888/real-router/issues/1578))

  Routing a route's own defaults by channel ([#1549](https://github.com/greydragon888/real-router/issues/1549)) had to spare one caller: a v1
  single-bag call (`buildPath(name, { page })`) rides the declared query key in the
  params bag and depends on the matcher's `search ?? params` fallback to print it.
  Defining `search` switches that fallback off, so the split was skipped whenever
  the `search` argument was absent.

  That test was one step too wide. "Absent `search` argument" also covers the caller
  who names no query channel at **all** — which is the arm every adapter's `<Link>`
  takes, since `buildHref` forwards an absent search prop verbatim. Those calls lost
  the route's `defaultSearch` from the URL, leaving `buildPath` the only producer
  disagreeing with `navigate`, `makeState` and the `matchPath` rebuild:

  ```ts
  // Route: { name: "x", path: "/x?page", defaultSearch: { page: "1" } }
  router.buildPath("x"); // "/x?page=1"  (was: "/x")
  router.buildPath("x", {}); // "/x?page=1"  (was: "/x")
  (await router.navigate("x", {})).path; // "/x?page=1" — unchanged
  ```

  So `<Link to="x">` rendered `href="/x"` while the click committed `/x?page=1`, and
  the round trip broke in the sharp direction: `buildPath` emitted a URL `matchPath`
  immediately rewrote into a different one. SSG manifests (`getStaticPaths`) dropped
  the same queries.

  The exemption now keys on the caller's **bag** rather than on the absence of the
  argument — it applies only when a route-declared query name actually rides in
  `params`, which is the single-bag shape the fallback exists to serve. Unchanged
  and re-probed after the fix: a params-twin still outranks the default
  (`buildPath("x", { page: "9" })` → `/x?page=9`), a route with no query default
  keeps `search` `undefined` so the fallback still prints an undeclared key in
  `loose`, and the `/coll/:id?id` collision stays path-owned ([#843](https://github.com/greydragon888/real-router/issues/843) / [#1549](https://github.com/greydragon888/real-router/issues/1549)).

  The property tier gained the block that was missing: every other block reaches the
  URL through a state builder that merges `defaultSearch` itself, which is why the
  file's own measured map recorded "`buildPath` stops merging `defaultSearch` →
  kills none". Block 8 draws the arm with no builder in front of `buildPath` and
  dies on both mutations alone.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Route `buildPath` through the nav pipeline, retiring its single-bag query form (nav-pipeline Phase 2, step 2-1)

  `buildPath` composed its URL by hand and leaned on the matcher's `search ?? params`
  fallback, which printed a query string out of the PATH bag. That made it the one
  producer disagreeing with `navigate`, `makeState` and the `matchPath` rebuild on
  the same intent. It now runs stage ③ and the mode gate through `canonicalize` in
  its LITERAL form — `{ resolveForward: false }`, the first growth of the pipeline's
  API — and prints the query from the canonical query channel alone.

  **Behaviour changes.** The query string is no longer printed from the params bag:

  ```ts
  // Route: /x?page
  buildPath("x", { page: "2" }); // "/x"          (was "/x?page=2")
  buildPath("x", {}, { page: "2" }); // "/x?page=2"   unchanged

  // Route: /t (loose mode) — an undeclared key
  buildPath("t", { foo: "1" }); // "/t"          (was "/t?foo=1")
  buildPath("t", {}, { foo: "1" }); // "/t?foo=1"    unchanged

  // Route: /items/:id?id — the [#843](https://github.com/greydragon888/real-router/issues/843) collision
  buildPath("i", { id: "V" }); // "/items/V"    (was "/items/V?id=V")

  // Route: /s with defaultParams { theme: "dark" } — an ARBITRARY default
  buildPath("s"); // "/s"          (was "/s?theme=dark")
  ```

  Every one of these is what `navigate` already committed for the same intent, so
  the step removes divergence rather than adding it. An arbitrary default (declared
  by neither a path slot nor `?name`) is app-level data living in `state.params`,
  exactly as documented — only `buildPath` used to print it.

  `forwardTo` is still NOT resolved here (A.5): `buildPath("src")` stays `/src`.

  **The route's default never replaces a value you supplied.** With the seam out of
  the picture there is nothing to enforce "a default is never applied to a slot the
  caller already filled — in EITHER bag" (INVARIANTS canonicalize [#6](https://github.com/greydragon888/real-router/issues/6)), so the
  literal form enforces it itself: on `defaultSearch { page: "5" }`,
  `buildPath("x", { page: "9" })` prints `/x`, not `/x?page=5`. The key you spelled
  in the path bag is not printed — that is the single-bag retirement — but the
  default does not take its place, which would be the very priority inversion the
  channel split exists to remove.

  Plugins are unaffected: `persistent-params` already injects into the search
  channel in its own `buildPath` interceptor, and that interceptor zone is untouched
  ([#1231](https://github.com/greydragon888/real-router/issues/1231)).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Answer `false` from `canNavigateTo` for a mis-channelled params bag ([#1576](https://github.com/greydragon888/real-router/issues/1576))

  `canNavigateTo` is a capability predicate in parity with `navigate` — it answers
  whether that navigation would work. Since the channel guard's P1 became a throw
  ([#1572](https://github.com/greydragon888/real-router/issues/1572)), a declared query key handed in the `params` bag made `navigate` throw a
  synchronous `TypeError` while the predicate still answered `true`: an adapter got
  a green light for a link whose click throws.

  The predicate already had a written policy for exactly this situation and honoured
  it for the other rejection reason — a missing required path param returns `false`
  rather than letting `buildPath` throw ([#725](https://github.com/greydragon888/real-router/issues/725)). It now mirrors the channel rejection
  the same way, reading the RAW caller bag against the RAW route name, so it is
  neither stricter nor laxer than the verb:

  ```ts
  // Route: { name: "search", path: "/search?q" }
  router.canNavigateTo("search", { q: "shoes" }); // false (was: true)
  router.navigate("search", { q: "shoes" }); // throws — unchanged
  router.canNavigateTo("search", {}, { q: "shoes" }); // true — unchanged
  ```

  Still navigable, in the predicate and in `navigate` alike: a name occupying both
  a path slot and a query declaration (`/items/:id?id`) is legitimately path-owned
  ([#843](https://github.com/greydragon888/real-router/issues/843) / [#1549](https://github.com/greydragon888/real-router/issues/1549)), and an `undefined` value is the removal marker, not a value in
  the wrong channel ([#1550](https://github.com/greydragon888/real-router/issues/1550) / [#1551](https://github.com/greydragon888/real-router/issues/1551)).

  `false` rather than a rethrow: a predicate answers, it never throws, and it runs
  on every `<Link>` render across six adapters — which is why P1 deliberately does
  not instrument the predicates. Not instrumented does not mean blind.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Layer a `forwardTo` chain's defaults into the channel the TARGET declares ([#1570](https://github.com/greydragon888/real-router/issues/1570))

  A forwarding hop can only spell a default in `defaultParams` — that is the single
  slot a route config gives it. But the **channel** belongs to the resolved target:
  when the target declares that key with `?`, the value is a query value, and
  `forwardState` was layering it into the path bag regardless.

  ```ts
  // src → dst,  src.defaultParams = { lang: "fr" },  dst = "/dst?lang"
  // stage ① before:  { name: "dst", params: { lang: "fr" }, search: {} }   ← wrong channel
  // stage ① now:     { name: "dst", params: {},             search: { lang: "fr" } }
  ```

  The split reuses `separateChannels` over `getQueryParams` — the same classifier
  and the same printing registry the URL build reads ([#1556](https://github.com/greydragon888/real-router/issues/1556)) — so no second
  derivation of "which channel is this key" is introduced. A name that also
  occupies a path slot (`/dst/:id?id`) stays path-owned, inheriting the [#843](https://github.com/greydragon888/real-router/issues/843) /
  [#1549](https://github.com/greydragon888/real-router/issues/1549) carve-out rather than re-deciding it. An explicit caller value still beats
  the layered default, in **both** channels.

  **Observable only to `forwardState` interceptors.** The committed state is
  byte-identical: channel separation at the seam moved the key one line later, so
  `state.params` / `state.search` / `state.path` were already correct end-to-end.
  What changes is what a plugin's `forwardState` interceptor reads from `next(...)`
  — which is the point: stage ① is now channel-correct at the producer, and core
  stops being the one producer its own channel contract could not cover.

  The whole suite stays green with no test migrated.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Add the always-on channel guard — reject a mis-channelled State, warn on a mis-channelled argument ([#1572](https://github.com/greydragon888/real-router/issues/1572))

  Core gains a fifth always-on invariant guard. The predicate is one line —
  `params ∩ queryNames(name) ≠ ∅` — and it is a **detector, never a normaliser**:
  the key is not moved. Moving it is what channel separation does, and the
  nav-pipeline design removes that stage precisely so channel-correctness becomes
  the producer's contract instead of a repair performed behind everyone's back.

  The two positions cover different populations, and — measured — they are not the
  same kind of problem, so they ship with different reactions.

  **P3 — `navigateToState` REJECTS.** It is the one producer that takes a
  ready-made `State`, so the predicate reads `state.params ∩ queryNames(state.name)`.
  There is no working form behind it: a hand-made State in the pre-M2 layout
  commits silently corrupt — the key sits in `state.params` and never reaches
  `state.path`, so `getState()` disagrees with the URL. The rejection mirrors the
  `ROUTE_NOT_FOUND` guard beside it (rejected promise + `TRANSITION_ERROR`) rather
  than throwing synchronously, because URL plugins call this from popstate
  handlers and a new sync throw would change an existing method's failure shape.
  `start()` commits through the same primitive, so the guard covers every start
  including SSR hydration — at zero cost, since a state produced by core is
  channel-correct by construction.

  **P1 — `navigate` / `makeState` / `buildNavigationState` WARN**, on the caller's
  raw argument, before interceptors. Behaviour is unchanged: the legacy single-bag
  form still works on `navigate` and `buildNavigationState` (channel separation
  moves the key one line downstream), and it is pinned today by a benchmark, a
  stress test, a property and an INVARIANTS row. Announcing the contract first
  lets every call site identify itself in the logs; promoting it to a throw is a
  deliberate break with its own test migration and ships separately.

  One position is not merely an announcement: a **direct `makeState`** has no
  channel separation upstream of it, so the key stays in `params`, never reaches
  the URL, and the warning reports a state that is already inconsistent with its
  own path.

  The guard is `undefined`-blind (the documented persistent-key removal marker is
  not a mis-channel), inherits the `/items/:id?id` carve-out from the same
  declaration registry the URL build prints from ([#1556](https://github.com/greydragon888/real-router/issues/1556)) rather than re-deriving
  it, short-circuits on a route with no query declarations, and **never becomes
  the thing that throws**: a bag backed by an accessor that throws is left to the
  consumer that actually needed the value, so a diagnostic cannot move the origin
  of an existing failure.

  New error code: `WRONG_CHANNEL`.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Promote the channel guard's P1 from warn to throw ([#1572](https://github.com/greydragon888/real-router/issues/1572))

  The warn-first step announced the contract so every call site could identify
  itself in the logs. This is the promotion it announced.

  `navigate` / `makeState` / `buildNavigationState` now throw a **`TypeError`,
  synchronously**, when a key the route declares with `?name` arrives in the
  `params` bag:

  ```ts
  navigate("products", { lang: "en" }); // ✗ TypeError
  navigate("products", {}, { lang: "en" }); // ✓
  ```

  Synchronous even on `navigate`, which otherwise reports failure through a
  rejected promise: this is an ARGUMENT-SHAPE defect at the API boundary, caught
  before any interceptor or transition exists — the same class as the `subscribe`
  / `start` guards. Rejecting instead would let a `.catch()` written for
  navigation failures swallow a programming error.

  **Unchanged, deliberately:**

  - **P3 (`navigateToState`) keeps REJECTING** with `WRONG_CHANNEL`. It takes a
    ready-made `State` from a popstate handler, where a new synchronous throw
    would change an existing method's failure shape.
  - **The predicates (`buildPath` / `isActiveRoute` / `canNavigateTo`) are NOT
    guarded.** They run on every `<Link>` render, their answer is read immediately
    and corrupts nothing, and throwing inside a render across six adapters is not
    a trade this guard is worth. The single-bag form still works there, and an
    explicit `search` still beats a params-bag twin.
  - An UNDECLARED key is not a mis-channel — the guard only fires on names the
    route declares with `?`. `undefined` stays the documented removal marker.

  **INVARIANTS #2a reworded.** It used to state the precedence between an explicit
  `search` and a params-bag twin "in every one" of the six entry points. A
  producer can no longer SPELL that collision, so the precedence is now stated for
  the predicates only — the rule did not change, its domain did.

  The `navigate/search-single-bag` benchmark measured a form that now throws (and
  would have taken the whole perf harness down with it). Replaced by
  `navigate/channel-guard-clean`, which measures what every caller actually pays:
  the guard's scan on a healthy call, against the widest declaration list in the
  file.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Layer the defaults of every hop on a `forwardTo` chain ([#1566](https://github.com/greydragon888/real-router/issues/1566))

  `forwardState` consulted the `defaultParams` of the **entered** route only, while
  the chain had already been collapsed to its terminal — so a default declared on
  an _intermediate_ hop never reached the target:

  ```ts
  createRouter([
    { name: "m1", path: "/m1", forwardTo: "m2" },
    { name: "m2", path: "/m2", forwardTo: "m3", defaultParams: { p: "P2" } },
    { name: "m3", path: "/m3/:p" },
  ]);

  await router.navigate("m1");
  // before: rejects — [SegmentMatcher.buildPath] Missing required param 'p'
  // now:    "/m3/P2"
  ```

  The URL direction failed differently and silently: `matchPath("/m1")` committed a
  state naming the resolved target but carrying the **source** URL and an empty
  params bag (`name: "m3"`, `path: "/m1"`, `params: {}`). `canNavigateTo` simply
  returned `false`. Both are consistent now.

  Every forwarding hop's defaults are layered in walk order, so an **earlier** hop
  wins over a later one and the caller wins over all of them. The terminal route is
  still excluded — its own defaults are merged downstream by the state builder
  ([#1549](https://github.com/greydragon888/real-router/issues/1549)), unchanged.

  Covers all three chain kinds: static, dynamic (`forwardTo: () => "…"`), and mixed
  static→dynamic — the dynamic resolver now reports the hops it walked instead of
  only the terminal. Single-hop chains and the query channel (`defaultSearch`, which
  has no source-layering by design) are unaffected.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Light up a `<Link>` whose route forwards elsewhere ([#1573](https://github.com/greydragon888/real-router/issues/1573))

  `isActiveRoute` compared the given name against the committed state and never
  resolved `forwardTo`, so a link pointing at a forwarding route was dark on the
  very page it navigates to:

  ```ts
  // s2 → d2,  s2.defaultParams = { z: "5" },  d2 = "/d2/:z"
  await router.navigate("s2", {}); // commits /d2/5
  router.isActiveRoute("s2", {}); // false  ← the link the user just clicked
  ```

  It gains a second arm — `literal || destination` — where the destination repeats
  **the same predicate** on the full output of stage ①: the resolved terminal name
  together with the chain's defaults layered into the target's channels.

  Three measured reasons it is that shape and not a simpler one:

  - **A fallback, not a pre-resolution.** Resolving before comparing would send a
    section link (`users` forwarding to `users.list`) to the leaf and darken it
    while a sibling descendant (`users.profile`) is active. The literal arm is
    what keeps that link lit.
  - **The predicate is repeated on ①'s OUTPUT, not on a substituted name.** The
    chain's `defaultParams` live on the forwarding SOURCE and are layered by
    `forwardState` ([#1566](https://github.com/greydragon888/real-router/issues/1566)/[#1570](https://github.com/greydragon888/real-router/issues/1570)) — never by the forward map — so substituting only
    the name still compares an empty bag against a committed `{z:"5"}`. It also
    carries no `search`, which is where ① routes a hop default whose key the
    target declares with `?`.
  - **A dynamic `forwardTo` is not in the forward map at all**, so name
    substitution is a no-op there; going through stage ① resolves it.

  Cost is gated: a route that does not forward pays one `Object.hasOwn` and
  returns, so the six adapters calling this on every `<Link>` render are
  unaffected. The arm calls the namespace primitive rather than the interceptable
  seam, so no plugin interceptor chain runs per render. A dynamic `forwardTo`
  callback that throws is caught — the predicate answers `false` and logs, it
  never throws from inside a render (same policy as `canNavigateTo` on a throwing
  guard, [#959](https://github.com/greydragon888/real-router/issues/959)).

  Unchanged on purpose: `buildPath("s2")` still prints `/s2`, not the destination
  — href-is-not-destination for `forwardTo` is a separate, deliberate decision.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Route `isActiveRoute` through the nav pipeline and retire its single-bag query form (nav-pipeline Phase 2, step 2-5)

  The last entry point that owned a channel-separation stage of its own. Both arms
  now build their comparison target through `canonicalize` in the LITERAL form
  (`{ resolveForward: false }`) and compare channel by channel. The `forwardTo` arm
  keeps running through the NON-interceptable namespace primitive — the literal
  form never touches the port, so a plugin's interceptor chain still does not run
  once per `<Link>` per render — and the safe barrier around the whole predicate
  ([#1577](https://github.com/greydragon888/real-router/issues/1577)) is untouched.

  This is the one step of the phase that genuinely removes stage ② from a point:
  `matchPath`, `canNavigateTo` and `buildNavigationState` reach ② through the seam
  their port calls, and keep it until Phase 4. `isActiveRoute` had its own
  `separateChannels` call, and it is gone.

  **Three behaviour changes.**

  1. A declared query key handed in the `params` bag is no longer re-routed to the
     query channel before comparison, so the v1 single-bag spelling stops matching:
     `isActiveRoute("x", { page: "2" }, undefined, false, false)` answers `false`
     where it answered `true`. Spell it in the query slot instead. (On the EXACT
     arm the default `ignoreQueryParams: true` is unaffected — it compares path
     slots only. The DESCENDANT arm is a different story; see 2 below.)
     `persistent-params` is unaffected: it injects into `search` itself.
  2. The descendant arm now obeys `ignoreQueryParams`, the same flag the exact arm
     hands to `areStatesEqual`. It could not before: it folded query into the path
     bag before matching, so an ancestor link compared its query even when the
     caller asked to ignore it — the two arms disagreed about the flag. **This one
     lands on the DEFAULT flag**, and it is the visible half of the change: on an
     active `/kid?tab=1`, `isActiveRoute("p", {}, { tab: "9" })` answered `false`
     and now answers `true`, because the caller asked for query to be ignored.
     Monotonicity (INVARIANTS isActiveRoute [#6](https://github.com/greydragon888/real-router/issues/6)) still holds — ignoring query can
     only make a route more active.
  3. `undefined` in the params bag is ABSENCE, not a value to match against
     ([#1550](https://github.com/greydragon888/real-router/issues/1550) / [#1551](https://github.com/greydragon888/real-router/issues/1551)). `isActiveRoute("users", { id: undefined })` now answers
     `true` for an active `users.view`, and an `undefined` no longer "overrides" a
     route default. This predicate was the last place in core where `undefined`
     meant something other than absence; sharing `canonicalize` with every other
     producer aligns it.

  `paramsMatchExcluding` and the namespace's `makeState` dependency lost their last
  callers and are gone — the canonical target already carries each default merged
  under the caller's value, in the channel the route declares it in.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep query decimals that `String()` cannot reproduce as strings ([#1565](https://github.com/greydragon888/real-router/issues/1565))

  `numberFormat: "auto"` states round-trip stability as its acceptance criterion —
  a value is coerced only if the router can print it back unchanged — but enforced
  that criterion with two hand-written special cases (`-0` and unsafe integers)
  instead of measuring it. Decimals slipped through both, so `matchPath` rebuilt a
  URL different from the one it had just matched:

  ```ts
  const router = createRouter([{ name: "t", path: "/t?page" }]);

  getPluginApi(router).matchPath("/t?page=2.0");
  // before: search { page: 2 },     path "/t?page=2"     ← the user's URL was rewritten
  // now:    search { page: "2.0" }, path "/t?page=2.0"
  ```

  The criterion is now enforced directly — `String(Number(value)) === value` — which
  subsumes the old negative-zero guard and closes the whole family it left open:
  trailing zeros (`2.0`, `2.10`, `0.50`, `100.00`, `0.0`, `-2.0`) and precision loss
  (`1.0000000000000000001`, `9007199254740993.5`, `12345678901234567890.5`). Under a
  URL plugin the rewritten string reached the address bar, so this was visible, not
  just structural.

  **Behaviour change:** such a value now arrives as its exact text instead of a
  number. `?page=2.5` and `?page=42` are unaffected — they print back identically
  and are still coerced. Reading a lossy decimal as a number is a deliberate opt-in:
  use `@real-router/search-schema-plugin` with `z.coerce.number()`, or convert at
  the call site.

  Values that already stayed strings are unchanged: leading zeros (`007`), exponent
  notation (`1e5`), `-0`, and unsafe **integer** magnitudes (`9007199254740992` —
  these round-trip textually but lose arithmetic precision, so the safe-integer
  guard stays on top of the new predicate).

  Locked by engine INVARIANT [#16](https://github.com/greydragon888/real-router/issues/16), generated through `arbNonCanonicalNumericString`,
  so every property that consumes it now covers the family too.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Build the URL a splat-with-child route actually matches ([#1568](https://github.com/greydragon888/real-router/issues/1568))

  A splat node's children are matched at the splat's **own** position, so the splat
  captures nothing for them — that is INVARIANTS Matching [#24](https://github.com/greydragon888/real-router/issues/24), shipped and stress-
  tested. `buildPath` did not mirror it: it demanded a value for the splat and
  printed it, producing a URL that could not resolve back to the route it was built
  for. The route named in the invariant's own example could not be built at all:

  ```ts
  createRouter([
    {
      name: "n",
      path: "/n",
      children: [
        {
          name: "all",
          path: "/*rest",
          children: [{ name: "edit", path: "/edit" }],
        },
      ],
    },
  ]);

  router.buildPath("n.all.edit", {});
  // before: throws — Missing required param 'rest'
  // now:    "/n/edit"   ← the URL Matching [#24](https://github.com/greydragon888/real-router/issues/24) says resolves to n.all.edit
  ```

  With a value supplied the built URL silently resolved to the **parent**:
  `buildPath("n.all.edit", { rest: "x" })` gave `/n/x/edit`, which the wildcard
  swallowed whole (`n.all`, `rest: "x/edit"`).

  **The rule is now one line: a splat binds only as the final segment of a route's
  assembled path; every earlier one builds as empty.** "Assembled" spans the route's
  own path (`/a/*rest/b` → `/a/b`), the parent chain (a child under a splat parent),
  and `setRootPath("/app/*rest")` — all three produced the same defect and all three
  round-trip now. A terminal splat is untouched: `buildPath("n.all", { rest: "x/y" })`
  is still `/n/x/y`.

  **Behaviour change:** such a route no longer requires the splat param, and a value
  passed for it is no longer placed in the path (under `queryParamsMode: "loose"` it
  becomes a query extra, the same treatment any non-slot param gets). Nothing in the
  repo built such a URL except one test asserting the broken string.

  Locked by a name-roundtrip property (`roundtrip.properties.ts`) — "matches
  something" is too weak, because the broken build _did_ match, just the wrong route.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `Options` generic over the router's dependencies ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  The three resolver callbacks receive a `getDependency` accessor at runtime, but
  `Options` was not parameterised, so it defaulted to `object` — whose `keyof` is
  `never`. Every key was rejected, and the form the wiki documents did not compile:

  ```ts
  createRouter<MyDeps>(routes, {
    defaultParams: (getDependency) => ({ id: getDependency("currentUserId") }),
  });
  // error TS2345: Argument of type '"currentUserId"' is not assignable
  //               to parameter of type 'never'
  ```

  `Options<Dependencies>` fixes all three (`defaultRoute`, `defaultParams`,
  `defaultSearch`), and an unknown key is still rejected — both directions are
  pinned by a type-level test.

  The parameter deliberately does not spread. Consumers that RESOLVE callbacks
  take `Options<D>`; consumers that merely READ configuration — `PluginApi.getOptions`,
  the matcher, the URL builders — take the new `AnyOptions` (`= Options<never>`,
  which accepts every instantiation by contravariance, unlike `Options<object>`
  which accepts none). Measured before choosing that split: no plugin in the repo
  reads `defaultRoute` / `defaultParams` / `defaultSearch` at all — they read
  `allowNotFound` and `limits`. All 16 packages type-check unchanged.

  `Dependencies` defaults to `DefaultDependencies`, so every existing `Options`
  reference keeps compiling; `AnyOptions` and `DefaultSearchCallback` are exported
  alongside the existing option types.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Compare param values independently of provenance ([#1554](https://github.com/greydragon888/real-router/issues/1554))

  `areStatesEqual` and `isActiveRoute` no longer depend on **where** a value came from. The URL direction parses query values (`?page=2` → `2`, `?a=1&a=2` → `[1, 2]`, a path slot is always a string) while the intent direction keeps whatever the caller supplied (`{ page: "2" }` stays a string) — so two states describing the SAME location (byte-identical `state.path`) compared as **unequal**, and an active link rendered inactive.

  **Behavior change** (pre-1.0, hence `minor`): values that print into the same URL now compare equal.

  ```diff
    await router.start("/x?page=2");            // state.search = { page: 2 }
  - router.isActiveRoute("x", {}, { page: "2" }, false, false);   // false
  + router.isActiveRoute("x", {}, { page: "2" }, false, false);   // true

    await router.navigate("users.view", { id: "123" });
  - router.isActiveRoute("users.view", { id: 123 });              // false
  + router.isActiveRoute("users.view", { id: 123 });              // true
  ```

  Scope of the tolerance: `string` / `number` / `boolean` compare by printed form, arrays element-wise under the same rule, and a singleton array against a bare scalar (`["1"]` and `1` both print `?a=1`). `null`, `undefined` and objects keep strict semantics — they print differently (`?a` vs `?a=` vs nothing), so tolerating them would equate genuinely different URLs. Value **storage** is unchanged: `state.search` keeps the mixed domain; comparison is the single place that knows the two domains describe one location.

  Both `isActiveRoute` branches are covered — the exact branch (via `areStatesEqual`) and the hierarchical one, whose raw `!==` loop now shares the same predicate.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `PluginApi.buildState` ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  **Breaking Change:** `getPluginApi(router).buildState(name, params)` has been removed. After the RFC-4 M2 forwardState channel canonicalization it silently dropped the ENTIRE query channel — including user-supplied values riding in the params bag (`buildState("x", { page: "2" })` on an `/x?page` route returned `{ params: {}, search: {} }`) — while its full-composition sibling already exists.

  **Migration:**

  ```diff
  - const routeInfo = api.buildState(name, params);       // RouteTreeState | undefined
  + const state = api.buildNavigationState(name, params); // State | undefined
  ```

  `buildNavigationState` resolves forwardTo the same way and returns `undefined` for unknown routes; unlike `buildState` it also applies route defaults and carries the query channel (`state.search`, `state.path`).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Refuse a mis-channelled params bag instead of repairing it ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  The `forwardState` seam used to run `separateChannels` (stage ②) over whatever
  came out of the interceptor chain: a key the resolved route declares with `?`,
  sitting in the params bag, was silently moved into the query channel. That
  repair is gone. The seam now applies the same centralized check the facade
  already used and throws.

  Three things were wrong with moving it:

  - **The producer kept believing its own bag shipped.** A decoder that returned
    `{ params: { ...params, tag } }` published a state it never wrote.
  - **It laundered values past validation.** `search-schema-plugin` documented the
    leak with a test literally named `LEAKS`: an interceptor registered after the
    schema injected into `params`, the seam moved it into `search`, and an
    unvalidated value landed in the very channel the schema owns. That test now
    pins the refusal; the composition hazard is structurally gone.
  - **It inverted caller precedence.** A caller's mis-channelled key and a chain
    default's query half ended up in different bags, where no merge ranks them,
    and the repair (spreading `search` last) handed the win to the DEFAULT —
    the [#1570](https://github.com/greydragon888/real-router/issues/1570) defect, which needed a withholding rule to work around.

  **Migration.** Pass a query value in `search`, which is knowable without reading
  the target's config. The error names the key, the route, and — when a
  `forwardTo` chain resolved elsewhere — the route you actually called, because a
  caller who wrote `navigate("src", { lang })` looked at `src`, where `lang` is
  undeclared and legitimate.

  What did NOT change: a route's own defaults are still routed by the DECLARING
  route ([#1549](https://github.com/greydragon888/real-router/issues/1549) / [#1570](https://github.com/greydragon888/real-router/issues/1570)), in `canonicalize`, `makeState` and the chain fold. That
  is core producing two channels out of a config slot whose owner may be resolved
  dynamically — not a repair of somebody else's bag, and the one case where the
  author genuinely cannot know the channel.

  Measured radius before and after: 7 tests across 13 packages, all in core and
  `search-schema-plugin`; every other package (browser, hash, navigation,
  persistent-params, sources, memory, preload, ssr-utils, ssr-data, rsc-server)
  was already channel-correct and needed no change.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Substitute a param declared on the root path ([#1567](https://github.com/greydragon888/real-router/issues/1567))

  `setRootPath("/app/:tenant")` registered and **matched** fine, but the build side
  never substituted the slot — the literal `:tenant` stayed in every URL and the
  value leaked into the query string as a loose extra:

  ```ts
  getPluginApi(router).setRootPath("/app/:tenant");

  router.buildPath("home", { tenant: "t1" });
  // before: "/app/:tenant/home?tenant=t1"
  // now:    "/app/t1/home"
  ```

  Because matching _did_ extract the param, the broken string was committed:
  `matchPath("/app/t1/home")` and `start(...)` both produced `state.path ===
"/app/:tenant/home"`, which under a URL plugin reached the address bar. A missing
  value was not reported either — `buildPath("home", {})` returned the literal
  instead of throwing `Missing required param`. Both are correct now.

  Same root-blindness as **[#1556](https://github.com/greydragon888/real-router/issues/1556)**, one layer over: the root node is deliberately
  absent from a route's `matchSegments`, so anything derived from a segment walk
  misses it. [#1556](https://github.com/greydragon888/real-router/issues/1556) fixed the query-declaration side; the build template gathered its
  param names the same way, found none, and took the "no params here" fast path that
  emits the whole path as static text. The root's path params (and splat names, so a
  root splat keeps its separators instead of percent-encoding them) now travel
  alongside its query declarations into registration.

  Static root paths (`setRootPath("/app")`) and routes with their own params are
  unaffected.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Classify a root-declared query key into the query channel ([#1556](https://github.com/greydragon888/real-router/issues/1556))

  Channel separation now reads the **same** declaration registry the query-string
  build reads, so a key declared on the root path — `setRootPath("?lang&theme")`,
  which is how `@real-router/persistent-params-plugin` declares its keys — is
  finally recognised as the query param it already printed as.

  Previously the two disagreed: the matcher unions the root node's
  `?`-declarations into each route's declared query params (that is why they print,
  even under `queryParamsMode: "strict"`), but core derived its own list by walking
  the route's match segments — which never contain the root node. A root-declared
  key was therefore classified as a **path** param:

  ```ts
  const router = createRouter([{ name: "g", path: "/g" }]);
  getPluginApi(router).setRootPath("?lang");

  await router.start("/g?lang=en");
  // before: params { lang: "en" }, search {}   ← wrong channel
  // now:    params {},             search { lang: "en" }

  await router.navigate("g", { lang: "fr" });
  // before: path "/g"          ← the declared key vanished from the URL
  // now:    path "/g?lang=fr"
  ```

  It also broke active-link detection in **both** spellings: after
  `start("/g?lang=en")`, `isActiveRoute("g", { lang: "en" })` and
  `isActiveRoute("g", {}, { lang: "en" })` were both `false`, so a `<Link>` carrying
  a persistent param rendered inactive on the very page it pointed at. Both now
  return `true`.

  **Behaviour change:** a persisted / root-declared key moves from `state.params`
  to `state.search`. This is the channel the plugin's own contract already
  documents; read it from `state.search` (or, channel-independently, from
  `state.context.persistentParams`). A route that repeats the declaration itself
  (`/route/:id?lang`) was already correct and is unaffected.

  The path/query name collision carve-out is unchanged: on `/items/:id?id` the
  params-bag `id` stays path-owned and only an explicit `search` twin reaches the
  query channel ([#843](https://github.com/greydragon888/real-router/issues/843) / [#1549](https://github.com/greydragon888/real-router/issues/1549)).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Route a route's own defaults into the channel it declares ([#1549](https://github.com/greydragon888/real-router/issues/1549))

  A default is spelled in one of two slots, and the router now reads both the same
  way in both positions — on a terminal route and on a forwarding hop.

  Before, each slot worked in exactly one position:

  |                | `defaultParams`                                                                                      | `defaultSearch`      |
  | -------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
  | forwarding hop | routed into the target's channel ([#1570](https://github.com/greydragon888/real-router/issues/1570)) | **silently ignored** |
  | terminal route | **left in the path bag**                                                                             | routed correctly     |

  The terminal half had escalated past mis-channelling: because `start()` commits
  through `navigateToState`, the always-on channel guard's P3 position rejected
  core's own state, so a route as ordinary as
  `{ path: "/x?page", defaultParams: { page: "5" } }` made `start()` throw
  `WRONG_CHANNEL`. Through `navigate()` the same config committed silently wrong —
  the key in `state.params`, absent from `state.path`.

  Both halves were fixed with the primitive already used for hop defaults
  (`separateChannels` over the route's declared query names), applied at every
  place a route's own defaults are merged: `pipeline/canonicalize`,
  `StateNamespace.makeState`, `RoutesNamespace.buildPath` and the `matchPath` URL
  rebuild. All four were needed — the URL builders run _before_ the state builders
  split, so fixing only the latter would have published a `state.search` its own
  `state.path` contradicts (INVARIANTS makeState [#6](https://github.com/greydragon888/real-router/issues/6)).

  ⚠ **Superseded within this same release — see `core-slot-is-the-channel`.** That
  change deletes `separateChannels` and all four call sites: the router no longer
  routes a default by declaration at all. The SLOT is the channel, and the config
  this entry describes as re-channelled (`{ path: "/x?page", defaultParams: { page:
"5" } }`) is now **refused at registration**, with the error naming the slot to
  move it to. Read the paragraphs below as the reason the routing existed, not as
  the shipped behaviour.

  `defaultSearch` is spread last and so outranks the query half of
  `defaultParams`; an explicit caller value still outranks both. Unchanged by
  construction: a name occupying both a path slot and a query declaration
  (`/coll/:id?id`) stays path-owned, an arbitrary default (`{ theme: "dark" }` on
  a static route) keeps its v1 home in `state.params`, and a path default stays in
  `state.params`.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Add the `defaultSearch` router option — the query channel of the default route ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `RouterOptions` carried `defaultParams` with no query twin, so the default
  route's query defaults could be spelled only in the path bag:

  ```ts
  createRouter([{ name: "list", path: "/list?tab" }], {
    defaultRoute: "list",
    defaultParams: { tab: "a" }, // the only slot there was
  });
  ```

  That reached the URL only because the `forwardState` seam still re-separates
  channels on the way through — stage ②, the repair the navigation pipeline is
  designed to remove. Measured by neutralising that stage: a route's own
  `defaultParams` and a `forwardTo` hop's both survive it (their split lives in
  the pipeline, [#1549](https://github.com/greydragon888/real-router/issues/1549) / [#1570](https://github.com/greydragon888/real-router/issues/1570)), but the router option did not — `navigateToDefault`
  passed `undefined` in the query slot, so the key stayed in `state.params` and
  never printed. No error, no correct spelling to migrate to, and no test to catch
  it: the existing coverage uses only undeclared keys, which legitimately stay in
  `params`.

  ```ts
  createRouter([{ name: "list", path: "/list?tab&sort" }], {
    defaultRoute: "list",
    defaultSearch: { tab: "a", sort: "z" }, // → /list?tab=a&sort=z
  });
  ```

  Static value or a dependency-resolved callback, symmetric with `defaultRoute` /
  `defaultParams` — the default route can itself be chosen dynamically, so its
  query defaults have to be able to follow. Defaults to `{}`, so nothing changes
  for a router that does not set it. `DefaultSearchCallback` is exported
  alongside `DefaultParamsCallback`.

  Also corrects the `Route.defaultParams` docstring, which claimed a
  query-declared name placed there "is NOT routed to the query string" — the
  opposite of what [#1549](https://github.com/greydragon888/real-router/issues/1549) deliberately ships.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - The slot IS the channel — `params` and `search` now meet only in the URL ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `separateChannels` is deleted. The router no longer moves a key between the two
  channels anywhere: `defaultParams` is the path channel and `defaultSearch` the
  query channel, on a terminal route and on a forwarding hop alike, and the two
  bags meet in exactly one place — the printed URL.

  The argument that kept the defaults split ("a hop can only spell a default in
  `defaultParams`") was false: the chain fold reads `defaultSearch` two lines
  above. And the routing hurt the author it claimed to help — a hop could not tell
  which channel its own config would land in without reading a target that a
  `forwardTo` CALLBACK may not determine until navigation time.

  Two checks replace it, split by what is knowable when:

  - **Registration** — a route's own `defaultParams` naming a key it declares with
    `?` is refused at `createRouter` / `add` / `replace` / `update` /
    `setRootPath`, prepare-then-commit, so a rejected batch leaves the store
    untouched. Without it the router builds a state out of config it accepted and
    its own always-on channel guard rejects it: `start()` throwing `WRONG_CHANNEL`
    about a bag you never passed.
  - **Resolution** — a hop's `defaultParams` naming a key only the resolved TARGET
    declares is refused at the `forwardState` seam, with both route names in the
    message.

  **Migration.** Move query defaults to `defaultSearch`. The error names the route,
  the key and the slot.

  Two pieces of machinery fell out as dead once nothing was split: the
  cross-channel withholding loop in the chain fold ([#1570](https://github.com/greydragon888/real-router/issues/1570) needed it only because
  the split scattered a caller's value and its default across bags no merge
  ranks), and `search-schema-plugin`'s own copy of the split.

  Measured radius: 29 tests across 3 packages (core, `search-schema-plugin`,
  `browser-plugin`); the other 14 packages needed no change.

  ⚠ The first count said 28, and it was measured wrong rather than merely stale:
  it came from `pnpm -F <pkg> test` alone, which runs the unit config. The property
  tier is a separate config and a separate script, so a green `test` says nothing
  about it — `search-schema-plugin`'s `pipeline.properties.ts` built a route whose
  `defaultParams` named its own `?`-declared keys and stayed red, unseen, until it
  was run directly.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Offer an opt-in diagnostic for a param key the route declares nowhere ([#1579](https://github.com/greydragon888/real-router/issues/1579))

  A key named neither by a path slot nor with `?` has no channel to own it, so it
  stays in `state.params` as app-level data — documented behaviour, and the reason
  the state does not round-trip through its own `state.path`. That asymmetry was
  the complaint behind [#1553](https://github.com/greydragon888/real-router/issues/1553).

  **Core's behaviour is deliberately unchanged.** Dropping the key was the original
  proposal and was rejected on measurement, not on taste: a temporary detector on
  the `navigate` facade (positive control fired) reddened **52 tests across 6
  packages**, and the "declared nowhere" predicate cannot separate a typo from a
  legitimate `navigate("users", { id })` on a parent route whose CHILD declares
  `:id`. Dropping would have retired a shipped, documented capability to fix an
  asymmetry that is mostly a documentation problem.

  Instead the port grows an opt-in sink, `reportUndeclaredParamKey`, in the shape
  the mode gate already uses ([#1575](https://github.com/greydragon888/real-router/issues/1575)): absent unless `validation-plugin` is
  installed, so bare core checks one `undefined` and never walks the bag.

  The diagnostic is opted into by the **committing producers** (`navigate`,
  `buildNavigationState`) rather than inferred from the compositional form. That
  distinction is measured too: `canNavigateTo` resolves `forwardTo`, so a
  form-based test caught it and warned — on a predicate that runs on every `<Link>`
  render, which is precisely the flood the channel guard avoids by not
  instrumenting predicates at all. Every predicate now stays silent, pinned.

  `RouteResolver` also gains `pathNames` — the other half of "is this declared
  anywhere?", which `queryNames` alone cannot answer.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Gate the query channel on `queryParamsMode`: a key the mode does not print no longer becomes state ([#1575](https://github.com/greydragon888/real-router/issues/1575))

  One rule, all three modes, both directions: **a key the active
  `queryParamsMode` does not PRINT does not enter the canonical query channel.**

  The URL build has always printed declared names only under `default` / `strict`.
  Both the parse side and the intent side kept an undeclared key in `state.search`
  anyway, so those modes published states whose own `path` contradicted their own
  `search` — measured:

  | mode      | `navigate("t", {}, { foo: "1" })` | before               | after       |
  | --------- | --------------------------------- | -------------------- | ----------- |
  | `loose`   | `search` / `path`                 | `{foo}` / `/t?foo=1` | unchanged   |
  | `default` | `search` / `path`                 | `{foo}` / **`/t`**   | `{}` / `/t` |
  | `strict`  | `search` / `path`                 | `{foo}` / **`/t`**   | `{}` / `/t` |

  and on the URL side `matchPath("/d?dec=1&foo=2")` under `default` returned
  `search {dec, foo}` beside `path "/d?dec=1"`.

  The acquired invariant is `keys(state.search) ⊆ keys(matchPath(state.path).search)`
  in every mode — operationalised by KEYS, since values stay a mixed domain by
  decision (`{page: 2}` from a URL, `{page: "2"}` from an intent).

  What does NOT change: `default` still MATCHES a URL carrying an undeclared key —
  that is exactly what separates it from `strict` — it just does not keep it.
  `strict`'s parse-side rejection is untouched. `loose` is untouched end to end,
  and short-circuits, so the repo default pays nothing.

  It is a DROP, not a move: the key does not fall back into `state.params`.
  Re-channelling it there would re-create the per-entry-point ambiguity the step
  exists to remove.

  The gate runs AFTER the default merge, so a `defaultSearch` declared for a key
  the route does not carry as `?name` is dead config under `default` / `strict` —
  the side edge is deliberate, not an oversight.

  Wired at the three terminals that produce a canonical query bag — the pipeline's
  `canonicalize` (the navigate path), `makeState` (the other intent producers), and
  the `matchPath` rebuild (the URL direction). The pipeline reads it through one
  boolean port accessor, `admitsUndeclaredQuery()`, rather than learning the mode.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Treat `undefined` as absence on both sides of the default merge ([#1550](https://github.com/greydragon888/real-router/issues/1550), [#1551](https://github.com/greydragon888/real-router/issues/1551))

  A route default is merged UNDER the caller's value; `undefined` on either side now means "this key was not given", so it can never reach the committed state.

  **[#1550](https://github.com/greydragon888/real-router/issues/1550) — the caller side.** An explicitly-`undefined` query value used to outrank `defaultSearch` and survive as an `undefined`-valued own key in the frozen `state.search`. It now behaves like the path channel always did:

  ```diff
    // route: { name: "x", path: "/x?page", defaultSearch: { page: "1" } }
    const state = await router.navigate("x", {}, { page: undefined });
  - state.search; // { page: undefined }   → own key, default killed
  - state.path;   // "/x"
  + state.search; // { page: "1" }         → default keeps the slot
  + state.path;   // "/x?page=1"
  ```

  **[#1551](https://github.com/greydragon888/real-router/issues/1551) — the default side.** A default that itself carries `undefined` (`defaultSearch: { q: undefined }`, `defaultParams: { extra: undefined }`) leaked that own key into every produced state — through `navigate`, `matchPath`, `makeState`, a route codec's input, and `forwardState`'s source-layering. Such an entry now behaves exactly like no entry; a genuinely missing required path param still fails with the same `Missing required param` error, for the right reason.

  **Behavior change** (pre-1.0, hence `minor`): code that passed `{ key: undefined }` to clear a route default must omit the key — or wait for an explicit reset semantics, which is deliberately not `undefined` (RFC-4 M2 §10.12).

  Implementation: one `mergeDefined` helper in `src/helpers.ts` replaces four spread-based merges (`makeState`'s channel merge, `buildPath`'s `defaultParams`, `forwardState`'s source `defaultParams`, `buildPath`'s `defaultSearch`), so the rule is a property of the merge rather than of the order in which a normalize step happens to run.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - RFC-4 M2: `Route.defaultSearch` — explicit query-channel defaults ([#1549](https://github.com/greydragon888/real-router/issues/1549))

  Adds `Route.defaultSearch?: SearchParams` (and `RouteConfigUpdate.defaultSearch`)
  as the query-channel twin of `defaultParams`, completing the params/search split
  ([#1548](https://github.com/greydragon888/real-router/issues/1548)) for route defaults. `defaultParams` now owns the **path + arbitrary**
  channel only, `defaultSearch` owns the **query** channel — the two are
  independent and can coexist for a colliding name (`/coll/:id?id` →
  `defaultParams.id` fills the path slot, `defaultSearch.id` the query twin).

  Core no longer **infers** a default's channel from the route's `?`-declaration.
  Defaults route by FIELD: `defaultParams → state.params`, `defaultSearch →
state.search`, in `makeState`, `buildPath`, `forwardState`, the `matchPath` URL
  rebuild, and `isActiveRoute`. The inference machinery is removed
  (`routeDefaultsByChannel` / `#mergeQueryDefaults` / `getNonQueryDefaultKeys` /
  `stripQueryDefaults` / `applySearchWinsForDeclaredQuery` / `splitParamsBySearch`).

  **Breaking (pre-1.0, minor):**

  - A query-declared default MUST now live in `defaultSearch` to reach
    `state.search` / the URL query cleanly. A query-declared name left in
    `defaultParams` is treated as an arbitrary params-channel default (it lands in
    `state.params`).
  - On the v1 single-bag `navigate(name, params)` path, an **undeclared** caller
    key now routes to `state.params` (RFC §2.2 п.5, align-to-RFC), not the URL
    query — pass it via the `search` argument (`navigate(name, params, search)`)
    or declare `?key` to put it in the query.

  The `matchPath` URL rebuild also now derives `state.path` from the
  forwardState-returned query (`forwardedSearch`), not the raw matched query, so a
  recovering/validating `forwardState` interceptor keeps `state.path` in step with
  `state.search` (closes the URL/state divergence behind the search-schema
  recovery e2e). The rebuild additionally routes a declared `?key` that rides in
  the params bag — a plugin's `forwardState` injection (persistent-params on
  `start()`), a decoder-injected query key — into the rebuilt URL query, matching
  the channel `makeState` commits it to (previously such a key reached
  `state.search` but not `state.path` on the initial match).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - RFC-4 M2: forwardState carries the query channel ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `forwardState(name, params, search?)` gains a third `search` argument and now
  returns `{ name, params, search }`. `matchPath` threads `matchResult.search`
  through it (marking the URL→State path), so a `forwardState` interceptor can
  observe and validate the query on route matching, not only on navigate. Both
  interceptable methods (`buildPath`, `forwardState`) are now three-argument via
  `createTernaryInterceptable`; the unused two-argument `createBinaryInterceptable`
  helper is removed. All first-party interceptors (persistent-params, search-schema)
  register the full three-argument form; a shorter-arity third-party interceptor
  stays type-valid (TS allows fewer params, and `next(a, b)` leaves the search slot
  `undefined`).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Route defaults are routed by channel ([#1549](https://github.com/greydragon888/real-router/issues/1549), RFC-4 M2 §4 follow-up) — superseded within this release by "the slot IS the channel" ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  ⚠ **Read the `core-slot-is-the-channel` entry first; it revises everything
  below.** This change routed a route's own `defaultParams` by the route's
  `?`-declaration, so a default spelled for a query name landed in `state.search`.
  A later commit in the same release removed the routing entirely: the SLOT is the
  channel, and a `defaultParams` naming a key the route declares with `?` is now
  **refused at registration** rather than re-channelled. The migration is therefore
  not "read it from `state.search`" but "spell it in `defaultSearch`".

  What survives from this change, because it is about the merge and not the
  routing:

  - The `matchPath` URL rebuild resolves declared query names search-first, so
    `state.path` honours the URL's query value over a query default
    (`match("/x?page=9")` no longer rebuilds `/x?page=5`).
  - `buildPath(name, params, search)` merges query defaults into the query string
    instead of silently dropping them (`buildPath("x", {}, { sort: "asc" })` →
    `/x?page=5&sort=asc`); an explicitly-passed value still wins.
  - Colliding names (`/items/:id?id`) stay path-owned — the [#843](https://github.com/greydragon888/real-router/issues/843) precedence is
    untouched.
  - An **arbitrary** (declared-nowhere) default keeps its home in `state.params`.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - RFC-4 M2: two-channel `encodeParams` / `decodeParams` — codecs see both the path and query channels ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  Per-route codecs move from the params-only signature to a two-channel one, so a
  codec can read and reshape the query channel as well as the path channel. This
  restores v1's reach: v1 ran the whole (path + query) bag through both callbacks,
  which the M2 params-only interim had silently narrowed to path-only.

  **Breaking (pre-1.0):**

  - `Route.encodeParams` / `Route.decodeParams` (and their `RouteConfigUpdate`
    twins) change from `(params) => params` to
    `({ params, search }) => ({ params, search })`. The callback now receives one
    argument `{ params, search }` and must return `{ params, search }` — transform
    whichever channel you own and **pass the other through explicitly**.
  - New `ParamsSearch` type exported from `@real-router/core` (and `/types`) for
    typing these callbacks.

  **Migration:**

  ```ts
  // before (params-only)
  decodeParams: (params) => ({ ...params, id: Number(params.id) }),
  encodeParams: ({ one, two }) => ({ param1: one, param2: two }),

  // after (two-channel) — wrap the old result in `params`, return `search` as-is
  decodeParams: ({ params, search }) => ({
    params: { ...params, id: Number(params.id) },
    search,
  }),
  encodeParams: ({ params: { one, two }, search }) => ({
    params: { param1: one, param2: two },
    search,
  }),
  ```

  A codec that only touches path params returns `search` unchanged (the common
  case). A query-aware codec may now reshape `search` too — the returned `search`
  lands in `state.search` (on decode) and the built query string (on encode).

  **Order / semantics:** `decodeParams` runs inside `matchPath` (the engine),
  **before** any search-schema plugin validation on the `forwardState` seam
  (engine → plugin, the v1 order). On the write path (`buildPath` / `navigate`) the
  encoder's returned `params` fills the path slots and its returned `search` builds
  the query string. A nullish return from a user codec falls back to the input
  channels (unchanged from v1's `?? params` leniency). The `matchPath` URL rebuild
  still folds the encoded query into a single bag (an explicit two-channel rebuild
  there awaits the `defaultParams` field-split, a later milestone) — the committed
  `state.params` / `state.search` split is exact.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - RFC-4 M2: remove the per-State meta sidecar; read route param ownership from the live matcher ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  The internal `stateMetaStore` WeakMap that carried each state's per-segment
  param-source map (`{ segment: { param: "url" | "query" } }`) is removed. That map
  is 1:1 with the route name, so `getTransitionPath` now looks it up from the live
  matcher by `state.name` (via a `RouteMetaLookup` callback → `getMetaForState`)
  instead of storing a per-State copy.

  **Breaking (pre-1.0):**

  - `PluginApi.makeState` drops its trailing `meta` argument — the signature is now
    `makeState(name, params?, search?, path?)`. A plugin that called `makeState` with a
    fifth `meta` / `StateMetaInput` argument must drop it; the param-source map is
    derived from the route name automatically.
  - The `StateMetaInput` type is no longer exported from `@real-router/core` (or its
    `/types` subpath).

  Internal-only (not part of any public surface): `getStateMetaParams` /
  `setStateMetaParams` and `stateMetaStore.ts` are gone. Behavior is unchanged for
  every in-tree route name; a state whose route was removed from the tree (e.g. via
  `replace()`) resolves to a full-reload transition path, exactly as the WeakMap-keyed
  form did.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - RFC-4 M2: split navigation into path (`params`) and query (`search`) channels ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `State.params` now carries **only** path params; query params move to the new
  `State.search` channel (always present — a frozen `{}` when empty). Match results,
  `makeState`, and the navigate/build pipeline are search-aware end to end.

  **Breaking (pre-1.0, positional slot-shift):**

  - `navigate` gains two equal-standing forms — descriptor `navigate(target, opts?)`
    (where `target: NavigationTarget = { name, params?, search? }`) and positional
    `navigate(name, params?, search?, opts?)`. The v1 `navigate(name, params, opts)`
    form is gone: options move from position 3 to position 4.
  - `isActiveRoute(name, params?, search?, strictEquality?, ignoreQueryParams?)` —
    the query channel is inserted at position 3; `strictEquality` / `ignoreQueryParams`
    shift to 4 / 5.

  **Additive:**

  - `buildPath(route, params?, search?)` and `canNavigateTo(name, params?, search?)`
    accept an explicit query channel. `buildPath` is now search-aware, so a colliding
    declaration `/items/:id?id` builds `/items/5?id=7` (path and a same-named query
    param keep their own slots — the killed [#843](https://github.com/greydragon888/real-router/issues/843) precedence).
  - New `NavigationTarget<P, S>` type exported from `@real-router/core` (and `/types`).
  - New `createTernaryInterceptable`; the `buildPath` interceptable is now
    three-argument (search-aware). Legacy two-arg `buildPath`/`forwardState`
    interceptors remain valid.

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Compose `buildNavigationState` through the nav pipeline (nav-pipeline Phase 2, step 2-4)

  The last of the four state-producing entry points moves onto the shared
  composition: `canonicalize` → existence check → `buildURL` → `materialize`, from
  the same `RouteResolver` port `navigate`, `matchPath`, `buildPath` and
  `canNavigateTo` now use. Behaviour is unchanged, verified byte-for-byte across 14
  fixtures covering both channels, route defaults in either slot, `forwardTo`
  (including a chain default and a chain resolving to a target that does not
  exist), the `/coll/:id?id` collision, an unknown route, a missing required param,
  and an undeclared key in `loose`.

  The order inside the entry point is load-bearing and preserved: existence is
  checked BEFORE the URL is built, because `buildURL` prints through the matcher,
  which throws on an unknown route, whereas this entry point answers `undefined`
  for one. P1 (`throwOnMisChanneledKey`) still runs first, on the caller's raw
  argument.

  `RouterInternals` gains a lazy `port()` accessor — a closure rather than a value,
  because the port is created during wiring while `registerInternals` runs before
  it, the same shape the interceptable methods already use.

  Also re-anchored: the comment in `shared/browser-env/plugin-utils.ts` explaining
  why an explicit query value outranks a `forwardTo` hop's default. It credited the
  spread order inside `separateChannels` — stage ②, which Phase 4 removes. The
  guarantee actually comes from [#1570](https://github.com/greydragon888/real-router/issues/1570)'s rule (a default is never applied to a slot
  the caller already filled, in either bag), which is a property of the merge and
  survives the seam's removal. The two agree today, which is exactly why the wrong
  one was easy to write down.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix the contracts of the two bypass entry points (nav-pipeline Phase 2, step 2-7)

  `navigateToState` was already under the channel guard's P3 position since 0b-2 —
  re-verified: a hand-made state carrying a declared query key in `state.params` is
  rejected with `WRONG_CHANNEL`, while the channel-correct one commits.

  `navigateToNotFound` is declared an EXCEPTION to the pipeline, and recorded as an
  INVARIANT rather than a "we skip it": `params` AND `search` are both `{}` for
  every input — including a URL carrying a query string or a fragment — with the
  whole URL living in `state.path` as a string, query included. Measured across
  `/nope?a=1&b=2`, `/other?x=9#frag` and `/plain`.

  It has no channels BY CONSTRUCTION, not by omission: it does not build a state
  from an intent, it wraps a string. A `materialize` special form would either run
  empty channels through machinery that exists to merge them, or require a
  `Canonical` with no intent — at which point the brand stops meaning "canonical
  intent". Two other systems already treat it the same way (no FSM transition, no
  guard phase, only `TRANSITION_SUCCESS`), so a third is consistency rather than a
  gap.

  Pinned in `tests/functional/navigation/navigateToNotFound.test.ts` over all three
  URL shapes, and stated in `INVARIANTS.md` → navigateToNotFound [#2](https://github.com/greydragon888/real-router/issues/2), so the next
  audit does not reopen the question.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Compose `canNavigateTo` through the nav pipeline (nav-pipeline Phase 2, step 2-3)

  The predicate resolved the route, normalised the params, built the URL and made
  the state in four hand-written steps. It now runs `canonicalize` → `buildURL` →
  `materialize`, from the same read-model `navigate`, `matchPath` and `buildPath`
  use. Behaviour is unchanged, verified byte-for-byte across 11 fixtures covering
  both channels, route defaults in either slot, `forwardTo`, the `/coll/:id?id`
  collision, a missing required param, an undeclared key in `loose`, and the
  mis-channelled bag the predicate answers `false` for ([#1576](https://github.com/greydragon888/real-router/issues/1576)).

  Both `try` boundaries are preserved deliberately, and they mean different things:
  resolution runs USER code and must be logged when it throws ([#1577](https://github.com/greydragon888/real-router/issues/1577) / [#959](https://github.com/greydragon888/real-router/issues/959)), while
  an unbuildable path is a normal "unreachable with this input" answer and stays
  silent ([#725](https://github.com/greydragon888/real-router/issues/725)). The predicate remains total — it answers, it never throws.

  This step also settles the `materialize` fork the milestone left open: it does
  NOT grow a port argument. With both deferred consumers finally on the table the
  answer is that neither needs one — `canNavigateTo` builds the URL through
  `buildURL` (safe here, since this point is not the one the port prints through),
  and `isActiveRoute` passes `path: ""` because `areStatesEqual` compares channels
  and never reads the URL.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop charging every producer for a merge that has nothing to merge ([#1589](https://github.com/greydragon888/real-router/issues/1589))

  The nav pipeline made every producer share one implementation. It also made every
  producer run the whole pass whether or not the route has anything to merge, and
  the core benchmark suite prices that at 10–78 % against master.

  `canonicalize` now returns early when the route has no `defaultParams`, no
  `defaultSearch` and no `?`-declaration and the caller named no query channel: the
  whole tail is provably identity there — `withholdFilledSlots` short-circuits on an
  undefined default, both merges collapse to their empty singletons, and the mode
  gate cannot drop a key from a query channel that is empty in every mode. Channels
  stay frozen, so the invariant is untouched.

  `mergeWithDefault` gains an internal `valueIsOwned` flag, used only by
  `canonicalize`'s path channel: with no default it used to freeze a defensive COPY
  of the bag, which is right in general (the caller's bag must never be frozen) but
  wasteful for the object `normalizeParams` minted one line earlier. The path bag
  was being copied twice per producer call, on every entry point.

  No behaviour change: the same channels, the same freezing, the same diagnostics.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Channel correctness becomes a subsystem, not a corner of `helpers.ts`

  The rule "`params` is the path channel, `search` the query channel, and the
  router moves nothing between them" was enforced from two files both named
  `helpers.ts` — the bag check in `src/helpers.ts`, the config check in
  `namespaces/RoutesNamespace/helpers.ts`. That split is how [#1584](https://github.com/greydragon888/real-router/issues/1584)'s existence
  precondition came to land on one half and not the other. Both halves now live in
  `src/channels/`: `guard` (the predicate, the assert, the message), `defaults`
  (the registration-time check and the caller-beats-default precedence rule) and
  `modeGate`.

  A subsystem rather than a namespace method because the rule has no owning
  module. The other four always-on guards each do — `subscribe` belongs to
  `EventBusNamespace`, `start(path)` to `RouterLifecycleNamespace`,
  `navigateToNotFound` to the facade, `claimContextNamespace` to `getPluginApi` —
  while this one runs from the facade, from `internals`, from the `forwardState`
  seam, from the `decodeParams` boundary, from `updateRoute` and from four
  registration entry points. A cross-cutting invariant with five callers in four
  modules is a subsystem; a file named "helpers" is what let it drift.

  `src/channels/` imports nothing from the namespaces, the engine or the pipeline —
  the same inversion `src/pipeline` makes with its `RouteResolver` port. Declared
  query names arrive as DATA (`readonly string[]`, or a `queryNamesOf` accessor),
  never as a matcher, so a second derivation of the one registry that both
  classifies and prints ([#1556](https://github.com/greydragon888/real-router/issues/1556)) cannot grow inside it. The config check took the
  matcher before; it now takes the accessor, and
  `RoutesNamespace/helpers.assertRouteDefaultChannelsFor` is the five-line adapter
  that supplies it — with the caches local to the attempt, which is what the four
  entry points need, since each validates PREPARED artifacts before any swap. The
  boundary is enforced by `no-restricted-imports`, verified to fail on a
  deliberately added `../engine` import.

  No behaviour change. `src/helpers.ts` drops 580 -> 318 lines and is now merge,
  comparison and state-freeze semantics only.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate a route decoder's output again on the `matchPath` path ([#1582](https://github.com/greydragon888/real-router/issues/1582))

  `matchPath` builds a state out of whatever a route's `decodeParams` returns, and
  that return value is USER code — external input, not a router-produced
  intermediate. The check on it went missing when the entry point moved onto the
  nav pipeline ([#1548](https://github.com/greydragon888/real-router/issues/1548), step 2-2): it lived inside a `forwardState` dependency
  wrapper the migration deleted, and its removal was justified as dropping a check
  on "the bags `matchPath` had just produced itself (matcher output + decoder
  output)". That reading is right about the matcher and wrong about the decoder.

  Bare core is unaffected — it was, and remains, tolerant here (measured
  byte-for-byte across seven return shapes). What came back is the opt-in
  diagnostic: with `@real-router/validation-plugin` installed, six shapes that had
  started committing silently throw an actionable `TypeError` again.

  ```ts
  // decodeParams returning …          bare core (unchanged)   with the plugin
  ["a"]; // params { "0": "a" }     TypeError
  ("oops"); // params { "0": "o", … }  TypeError
  new Map([["a", "1"]]); // params {}               TypeError
  new Custom(); // params { a: "1" }       TypeError
  Object.create({ inherited: "x" }); // params {}               TypeError
  ```

  Two things are better than before the regression, not merely restored:

  - The message names **`matchPath`**. The pre-pipeline call reported
    `[router.forwardState] Invalid routeParams` for a fault raised on the
    `matchPath` path, because that is the wrapper it happened to sit in.
  - It runs **only when a decoder actually ran**. The matcher's own output on the
    same line is router-produced and plain by construction, so validating it was
    the internal-intermediate check the migration was right to drop.

  `RoutesDependencies` gains `getValidator` — the same per-call closure EventBus,
  RouteLifecycle and Plugins already receive, so the validator stays resolved at
  call time (absent before registration, absent again after teardown).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Say nothing about the params when the route does not exist ([#1584](https://github.com/greydragon888/real-router/issues/1584))

  Both opt-in diagnostics answer "does route X declare this key?", and both read a
  declaration registry that returns `[]` for a route with no declarations AND for
  a route with no existence. So for a misspelled route name every key in the
  caller's bag was announced as "declared nowhere on route X" — blaming the params
  for a typo in the ROUTE name, which is the most misleading direction available.
  Return values were always right (`buildNavigationState` answers `undefined`,
  `navigate` rejects `ROUTE_NOT_FOUND`); only the diagnostics lied.

  Second-order, and reachable within one router: each bogus report took a slot in
  the per-`route + key` de-dup cache, so the genuine warning was suppressed if that
  name later became real.

  `RouteResolver.pathNames` now answers `readonly string[] | undefined`, where
  `undefined` means "no such route" — restoring information the matcher already
  computes (`getSegmentsByName`) and this port member used to discard. `queryNames`
  deliberately keeps its `[]`: its other two consumers (the default merge, the mode
  gate's drop) want an empty list for a missing route, and only the diagnostics ask
  a question that presupposes existence.

  The **mode gate's** diagnostic had the identical defect and is fixed with it —
  found by sweeping this file's port consumers, not named in the issue. Both drops
  and both refusals are unchanged; only the reports are now gated.

  Dev-only either way: bare core installs neither sink and never pays the lookup.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Compose `matchPath` through the navigation pipeline (nav-pipeline Phase 2, step 2-2)

  `matchPath` built its state by hand: call the `forwardState` seam, split the
  route's own defaults by channel, merge them under the user's, apply the mode
  gate, then rebuild the URL. Every one of those steps already exists inside
  `canonicalize`, which `navigate` has used since milestone 1 — so the two
  producers were maintaining the same composition twice.

  The entry point now reads `canonicalize` → rebuild → `materialize`, from the same
  `RouteResolver` port `navigate` uses. Behaviour is unchanged, verified byte-for-byte
  across 35 fixtures covering both channels, route defaults in either slot, the
  `/coll/:id?id` collision, `forwardTo`, decoders and encoders (including an
  encoder that throws, [#1157](https://github.com/greydragon888/real-router/issues/1157)), all three `queryParamsMode` values, every
  `trailingSlash` mode, `rewritePathOnMatch: false`, a `forwardState` interceptor
  injection, `setRootPath`, and the unmatched path.

  Two supporting changes ride along:

  - `materialize` is now generic (`materialize<P, S>`), so the public chain
    `matchPath<P>` → `materialize<P>` → `State<P>` keeps the caller's param type.
    Without it the chain collapsed to `State<Params>` and a consumer's typed
    assignment failed to compile. Pinned by a type-level test.
  - The port is created once in `wireNamespaces` rather than inside
    `wireNavigation`, because `navigate` is no longer its only consumer.

  Note for anyone reading the RFC alongside this: stage ② (channel separation) does
  **not** leave `matchPath`'s path here, and could not — `separateChannels` lives in
  the `forwardState` seam, which the port itself calls. Measured: a `forwardState`
  interceptor injecting a declared query key into `result.params` lands in
  `state.search` both before and after this change, identically to `navigate`. The
  channel guard's P2 position therefore stays dormant until the seam's wrapper is
  removed.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Correct the `reload` JSDoc examples to the four-slot `navigate` signature ([#1586](https://github.com/greydragon888/real-router/issues/1586))

  `NavigationOptions.reload`'s examples still taught the pre-M2 spelling
  `router.navigate(name, params, { reload: true })`. Slot 3 has been the query
  channel since RFC-4 M2 ([#1548](https://github.com/greydragon888/real-router/issues/1548)), so that form lands `{ reload: true }` in
  `search`: no reload happens, and the page's own query is rebuilt from an object
  that does not contain it. Measured on `/search?term=react`:

  ```
  default mode:  → /search              search {}
  loose mode:    → /search?reload=true  search { reload: true }
  ```

  Both examples now pass the query at slot 3 and the options at slot 4.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Add the phase lock: entry points of one compositional form agree on one intent (nav-pipeline Phase 2, step 2-8)

  The final step of the phase, and the reason the phase is a unit rather than seven
  unrelated refactors. The property needs ≥2 migrated points per class, so after
  milestone 1 it could not be written at all — class ① held only `navigate`. With
  all seven points on the pipeline it can, and what it locks is not "each point
  still works" but "no two points can drift apart again": a divergence is now a
  property failure instead of a bug someone has to notice.

  Two classes, deliberately NOT interchangeable — `navigate` / `matchPath` /
  `buildNavigationState` resolve `forwardTo`, while `buildPath` / `makeState` /
  `isActiveRoute`'s first arm take the literal form. A forwarding route is exactly
  where the two must DISAGREE, so a third property asserts the divergence: without
  it the first two would both pass on a router that ignored `resolveForward`
  entirely, which is the one regression the lock exists to catch.

  Verified mutationally, per property — and the SITE of the mutation is part of the
  claim, because the two classes reach `buildPath` through different depths.
  Dropping the query at the FACADE (`Router.buildPath`, the argument surface M2's
  slot shift moved) reddens the LITERAL class and nothing else; the same drop deep
  in the namespace method reddens class ① instead, via the `matchPath` re-parse.
  Ignoring the literal form reddens the divergence property and nothing else.

  All four caveats from the parent RFC's §5 are carried and documented in the file,
  including the one an earlier revision lost: `canNavigateTo` returns a `boolean`,
  so its `Canonical` is observable only from inside the module — asserting it
  through the public return would be a tautology, and it is deliberately not
  asserted structurally here.

  Also confirmed by scan, with a positive control on the detector: no test in the
  suite pins the INTERMEDIATE shape of a composition any more. The two remaining
  interceptor-based reads are contracts, not pins — `captureStageOne` is the only
  place channel classification is observable at all, and the `matchPath` interceptor
  test pins that interceptors run ([#525](https://github.com/greydragon888/real-router/issues/525)).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix four defects an RFC review found in nav-pipeline Phase 2 ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  **`buildPath` disagreed with every other producer again.** Step 2-1's
  `withholdFilledSlots` — the rule that stops a route default replacing a value the
  caller supplied — applied to any key, not only to a name the route declares with
  `?`. Only a declared query name can HAVE a params-bag twin, so on anything else
  it withheld a default nobody was competing for:

  ```ts
  // Route: /u with defaultSearch { theme: "dark" }  (theme declared nowhere)
  buildPath("u", { theme: "X" }); // "/u"  — every other producer commits "/u?theme=dark"

  // Route: /items/:id?id with defaultSearch { id: "D" }  (the [#843](https://github.com/greydragon888/real-router/issues/843) carve-out)
  buildPath("coll", { id: "V" }); // "/items/V"  — navigate commits "/items/V?id=D"
  ```

  That is the [#1552](https://github.com/greydragon888/real-router/issues/1552)/[#1578](https://github.com/greydragon888/real-router/issues/1578) class the step set out to close, and round-trip broke in
  the sharp direction: `matchPath` rewrote the printed href into a different URL on
  the spot. The rule is now scoped to `?`-declared names, so the documented
  single-bag retirement is unchanged (`buildPath("x", { page: "9" })` on
  `defaultSearch { page: "5" }` still prints `/x`, not `/x?page=5`).

  **`state.search` could be unfrozen.** The mode gate's drop branch is the one
  place a channel is rebuilt after `mergeWithDefault` froze it. Every pre-Phase-2
  consumer re-merged downstream in `makeState` and re-froze it by accident;
  `materialize` deliberately does not, so a state whose query the gate had touched
  shipped with a mutable `search`, against "states are deeply frozen".

  **A route codec could no longer edit its `search` argument.** `buildPath` copied
  `canonical.path` before handing it to `encodeParams` but passed `canonical.query`
  through verbatim — and the canonical channels are frozen, so a codec that edits
  in place silently lost its query edit (or threw, under ESM). Both channels are
  copied now.

  **The [#1579](https://github.com/greydragon888/real-router/issues/1579) diagnostic's opt-in gate did nothing.** `port.reportUndeclaredParamKey`
  was a closure forwarding into an optional-chained validator, so it was always
  truthy: the "absent unless `validation-plugin` is installed" gate read as taken
  and bare core walked the caller's params bag on every commit. It is a getter
  returning `undefined` while no validator is installed, which is what the port's
  own contract said all along.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - `makeState` IS the pipeline's literal form — one terminal, not two (nav-pipeline Phase 4, [#1548](https://github.com/greydragon888/real-router/issues/1548))

  `StateNamespace.makeState` carried its own copy of stage ③ (merge each channel's
  route default UNDER the caller's value) and of the mode gate — a second
  canonicalisation living outside `src/pipeline`. It now calls
  `canonicalize(…, { resolveForward: false })` + `materialize`, the same form
  `buildPath` and `isActiveRoute`'s literal arm take, which is exactly this
  method's documented contract: `forwardTo` is not resolved, but the NAMED route's
  defaults are applied (forwardState invariants [#7](https://github.com/greydragon888/real-router/issues/7)/[#8](https://github.com/greydragon888/real-router/issues/8)).

  Two terminals for one rule was never a style problem. [#1584](https://github.com/greydragon888/real-router/issues/1584)'s existence
  precondition — "do not name a route that does not exist" — landed on the
  pipeline's terminal and not on this one, because it was found by sweeping
  `canonicalize`'s PORT consumers and this method read its own dependency bag
  instead. That is now structurally impossible: there is one implementation, and
  its mutant reddens both arms of the gate's test file.

  **No behaviour change**, verified rather than argued: a 71-cell before/after
  snapshot (three `queryParamsMode` values × 23 shapes — both default slots,
  overrides, `undefined` on either side, the `/coll/:id?id` collision, an
  `Object.prototype` key, an undeclared key, a nonexistent route, explicit vs
  derived path, singleton identity, frozen-ness) is byte-identical. The literal
  form additionally applies `withholdFilledSlots`, and that is unreachable here
  rather than new: the only door to this method is `PluginApi.makeState`, whose P1
  channel guard refuses the bag that would trigger it on the _same_ predicate —
  own key, defined value, `?`-declared.

  Two pieces of dead surface fell out, both found by coverage rather than by
  reading:

  - **`makeState`'s `skipFreeze` parameter is gone.** It died when Phase 2 moved
    its last two callers (`canNavigateTo`, `isActiveRoute`) onto
    `materialize({ skipFreeze: true })`; the old body hid the death by forwarding
    `undefined` into a slot that needs no branch. The public `PluginApi.makeState`
    type never had it.
  - **`StateNamespaceDependencies` drops seven of its eight members** — both
    default maps, `getQueryParams`, `hasRoute`, `admitsUndeclaredQuery`,
    `getDropReporter` and `buildPath` existed only to feed the duplicate. One
    arrives (the port); `getUrlParams` survives, for `areStatesEqual`.

  A new test pins the merge's own-key guard through the QUERY channel: the path
  channel is filtered by `normalizeParams` before the merge for every producer
  now, so the query side is the only one that still reaches it — and it needs a
  route that HAS a `defaultSearch`, since the merge short-circuits without one.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep the render-path predicates total against hostile input ([#1577](https://github.com/greydragon888/real-router/issues/1577))

  `canNavigateTo` and `isActiveRoute` both document that they answer rather than
  throw — a predicate running on every `<Link>` render must not raise into a
  render. Both leaked an exception when user code ran while they answered:

  - `canNavigateTo` called `forwardState` outside its `try`, so a dynamic
    `forwardTo` callback, a plugin's `forwardState` interceptor, or the caller's
    own bag (channel separation walks it with `Object.entries`, so an
    accessor-backed key throws there) escaped to the caller;
  - `isActiveRoute` had wrapped only the destination arm ([#1573](https://github.com/greydragon888/real-router/issues/1573)). Its literal arm
    splits the caller's bags and its ancestor branch recombines them, so both
    still read a hostile `Proxy` / getter / reactive object unprotected.

  Both now answer `false` and log a `logger.warn` — never silent, because user
  code crashing is an operational fault rather than a route that legitimately
  blocks (the split [#959](https://github.com/greydragon888/real-router/issues/959) already drew for a throwing guard), and never
  propagated. `isActiveRoute` takes one boundary around the whole walk rather than
  a `try` per read, the shape `isParams` took for the same class of input ([#1052](https://github.com/greydragon888/real-router/issues/1052)).

  `buildPath` is deliberately unchanged: it is a builder with a documented
  throwing contract, which is exactly why `canNavigateTo` wraps its call to it.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Pin the contracts of `forwardState` and `makeState` (nav-pipeline Phase 2, step 2-6)

  With every entry point now composing through the pipeline, the two primitives are
  reached only from the plugin surface — so what they promise is worth stating
  rather than inferring. Both contracts were measured, not assumed, and are now
  pinned by tests and recorded as INVARIANTS forwardState [#7](https://github.com/greydragon888/real-router/issues/7) and [#8](https://github.com/greydragon888/real-router/issues/8).

  - **`forwardState` is stage ① alone.** It resolves the `forwardTo` chain and
    layers each HOP's defaults, and stops there: the TERMINAL route's own defaults
    are not applied. On `src → dst` where `dst` declares `defaultSearch { tab: "new" }`,
    `forwardState("src", {})` returns `{ name: "dst", params: {}, search: {} }`,
    while `navigate("src")` — ① then ③ — commits `/dst?tab=new`. That split is what
    makes the primitive composable.
  - **`makeState` is the literal form.** It never resolves `forwardTo`
    (`makeState("src")` stays on `"src"`, path `/src`), but it does apply ③ for the
    route it was NAMED (`defaultSearch { page: "5" }` → `?page=5`). Equivalent to
    `canonicalize(..., { resolveForward: false })`, the same form `buildPath` and
    `isActiveRoute` take — which is why a plugin can build a state for an alias
    without being teleported off it.

  Also corrected: INVARIANTS isActiveRoute [#9](https://github.com/greydragon888/real-router/issues/9) still described the predicate's two
  branches as "the exact branch splits them (`separateChannels`), the descendant
  branch spreads them into one". Step 2-5 removed both of those; the totality
  guarantee it documents is unchanged, only the mechanism it names.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Three fixes the Phase 2 code review found ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  **`replace()` no longer erases definition guards on a refused batch.** The
  config-time channel check (`assertRouteDefaultChannels`, shipped with "the slot
  IS the channel") ran inside `adoptRouteArtifacts`, one line before the swap.
  That is early enough for `add` and too late for `replace`, which calls
  `clearDefinitionGuards()` first: a batch the check refused left the tree intact
  and the old definition guards GONE, so a route whose `canActivate` was blocking
  became freely activatable — with nothing in the error saying access control had
  just been dropped. Measured: `canNavigateTo("guarded")` `false` → **`true`**
  after a rejected `replace`. The check moved into both callers' PREPARE phases,
  beside the [#1046](https://github.com/greydragon888/real-router/issues/1046) handler-limit and [#1193](https://github.com/greydragon888/real-router/issues/1193) guard-compile hoists that closed the
  same fail-open twice before; `adoptRouteArtifacts` is now genuinely throw-free,
  which is what its "atomic swap" contract already claimed.

  **The mode gate's diagnostic is silent about a nonexistent route at BOTH
  terminals ([#1584](https://github.com/greydragon888/real-router/issues/1584)).** The existence precondition landed only in
  `pipeline/canonicalize`, because it was found by sweeping that file's PORT
  consumers — a sweep that cannot see `StateNamespace.makeState`, which reads its
  own dependency bag. `makeState` with an explicit `path` is exactly how a URL
  plugin rebuilds a state from a serialized history entry, so it does not fail on
  its own the way the navigate arm does; it reported `Query key "q" is not declared
on route "nope"` about a name that is not a route. The de-dup cache is shared by
  both terminals, so each bogus report also burnt the slot that would have carried
  the genuine warning once that name became real.

  **A `defaultSearch` whose key is an `Object.prototype` name is applied again.**
  The withholding rule ("a default is not applied to a slot the caller already
  filled") read the caller's bag with a bare `params[key]`, which walks the
  prototype — so on an EMPTY bag `toString` / `constructor` / `valueOf` read as
  filled. The rule runs only in the literal form, so `buildPath` and
  `isActiveRoute` withheld while `navigate` / `makeState` applied: one producer out
  of agreement, printing an href its own route does not reproduce — the [#1552](https://github.com/greydragon888/real-router/issues/1552)/[#1578](https://github.com/greydragon888/real-router/issues/1578)
  shape the rule exists to close. Guarded with `Object.hasOwn`, as the sibling
  `findMisChanneledKey` already was.

  Also: `port.reportDroppedQueryKey` is a getter, like its sibling
  `reportUndeclaredParamKey` — a plain closure is always truthy, so the pipeline's
  optional-chain never gated anything and bare core paid [#1584](https://github.com/greydragon888/real-router/issues/1584)'s `pathNames`
  existence lookup once per dropped key with no sink behind it. Both sinks now
  report their absence honestly, and the two comments that asserted this gate are
  true rather than aspirational.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Route `navigate()` through the nav pipeline (`src/pipeline/`, milestone 1) — no behaviour change ([#1569](https://github.com/greydragon888/real-router/issues/1569))

  The transformation "navigation intent → committed state + URL" was spread across
  eight entry points, each re-composing the same operations in its own order. This
  introduces the module that owns it: three primitives over one opaque type, and
  switches the first entry point onto them.

  ```ts
  canonicalize(port, name, params, search); // ① forwardTo + ③ route defaults → Canonical
  buildURL(canonical, port); // ⑤a — the URL of that intent
  materialize(canonical, opts); // ⑤b — the State of that intent
  ```

  `Canonical` carries a `unique symbol` brand that is never exported, so
  `materialize({ name, path, query })` does not compile. "Build a URL or a State out
  of un-defaulted channels" becomes unrepresentable rather than a bug to remember —
  `buildURL` prints the query from `canonical.query` alone, never from a
  `search ?? params` fallback.

  **Pure refactor: `navigate()` behaves as before on every ordinary input.** The
  whole existing suite passes with no test edited (182 files / 3702 tests), which is
  this step's acceptance criterion — any test that needed changing would mean
  semantics moved, and that belongs to the follow-up steps, not here.

  One measured exception, on an input class no test covers: stage ③ now runs inside
  `canonicalize`, i.e. **before** the route-existence check, so on an **unknown**
  route a `search` bag whose property access throws now surfaces that throw instead
  of rejecting with `ROUTE_NOT_FOUND` (plain bags, and every bag on a route that
  exists, are unaffected).

  Two implementation details are deliberate and load-bearing, both measured rather
  than assumed:

  - The port's `resolveForward` is wired to the `forwardState` **seam**
    (interceptors + the channel-separation wrapper), so channel separation stays
    in the port implementation and never enters the pipeline module. The module is
    already in its target shape; the seam is what changes later.
  - The port's `buildPath` is wired to the **interceptable** `ctx.buildPath`,
    because one `navigate()` runs both the `forwardState` and the `buildPath`
    interceptor today. Calling the engine's matcher directly would have silently
    stopped running `persistent-params`' `buildPath` interceptor on the navigate
    path.

  Stage ③ now has two callers (`makeState` and `canonicalize`), so the merge helper
  and the state-object constructor moved to shared helpers — one source of truth for
  "route default under the caller's value" and one state shape, instead of two
  copies free to drift.

  Locked by five properties on `canonicalize` as a pure function
  (`canonicalize.properties.ts`, mutation-validated): caller beats default on both
  channels, `undefined` is absence on both sides, channels are never re-split,
  channels are frozen at merge time while the caller's bag is not, and stage ③ is
  idempotent.

## 0.81.0

### Minor Changes

- [#1546](https://github.com/greydragon888/real-router/pull/1546) [`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca) Thanks [@greydragon888](https://github.com/greydragon888)! - Normalize a missing leading slash in route paths at the tree-build boundary ([#1407](https://github.com/greydragon888/real-router/issues/1407))

  A route path without a leading `/` — a relative segment (`foo`, `:id`), or an absolute `~foo` written without the slash — was silently mis-registered as a dead route (`buildPath` emitted a URL its own `match` rejected) or threw a cryptic "Empty parameter name". `createNode` now prepends `/` after the `~`-strip, so:

  - a relative child (`:id`, `foo`) no longer fuses onto its parent across the segment boundary (`/a` + `:id` → `/a/:id`, not the dead `/a:id`);
  - a slash-less absolute (`~dashboard`) becomes `/dashboard` and round-trips;
  - a relative path ending in a bare marker (`a:`) registers as the static `/a:` instead of throwing.

  A leading-`/`, `~/`, `?query`, or empty root path is untouched. This aligns with every major router (TanStack/Vue/React all forgive a missing slash) and makes `validateRoutePath`'s already-documented "relative segments / `~path` are valid" contract actually true.

## 0.80.0

### Minor Changes

- [#1544](https://github.com/greydragon888/real-router/pull/1544) [`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the `@real-router/core/utils` subpath — moved to `@real-router/ssr-utils` ([#1543](https://github.com/greydragon888/real-router/issues/1543))

  **Breaking Change:** SSR/SSG/hydration helpers (`serializeState`,
  `serializeRouterState`, `hydrateRouter`, `getStaticPaths`,
  `createRequestScope`) are no longer available under `@real-router/core/utils`.

  **Migration:**

  ```diff
  - import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
  + import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
  ```

  `SerializedRouterState` is now defined directly in `@real-router/core/types`
  (and re-exported from `@real-router/ssr-utils`) — no import change needed for
  consumers already importing it from `@real-router/core` or
  `@real-router/core/types`.

## 0.79.1

### Patch Changes

- [#1541](https://github.com/greydragon888/real-router/pull/1541) [`ad30aff`](https://github.com/greydragon888/real-router/commit/ad30aff08e6dbe5b72cf20c01170b13fb6049214) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix plugin `StateContext` / `NavigationOptions` module augmentation being silently dropped for external consumers resolving `dist` ([#1540](https://github.com/greydragon888/real-router/issues/1540))

  `declare module "@real-router/core/types"` merges only when the resolved module is the interface's lexical declaration-site — a re-export barrel of any form is a silent no-op ([#1519](https://github.com/greydragon888/real-router/issues/1519)). The bundled dts hoisted `StateContext` / `NavigationOptions` into a shared chunk (regressed by the utils fold, [#1520](https://github.com/greydragon888/real-router/issues/1520)), so every plugin's typed `state.context.<namespace>` and `NavigationOptions` extension degraded to `{}` for dist-resolving consumers, while `src`-resolving monorepo CI stayed green.

  The fix is two-fold and does not change the JS output at all:

  - the augment-target interfaces are now declared lexically in `src/types/index.ts` (the `@real-router/core/types` entry) instead of `types/base.ts`;
  - core's build is split into two phases — JS stays bundled (package shape and weight unchanged), dts is emitted unbundled (`preserveModules`), so `dist/*/types.d.*` IS the entry module with the lexical declarations.

  A post-bundle check (`scripts/check-dts-augment-targets.mjs`) now fails the build if the types entry ever becomes a re-export barrel again or a duplicate declaration splits the type into two symbols.

## 0.79.0

### Minor Changes

- [#1527](https://github.com/greydragon888/real-router/pull/1527) [`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0) Thanks [@greydragon888](https://github.com/greydragon888)! - Simplify the route-path grammar to three tokens — `static`, `:param`, `*splat` ([#1516](https://github.com/greydragon888/real-router/issues/1516), URL model v2 / milestone 1)

  Optional params (`:tab?`, `*rest?`) and regex constraints (`:id<\d+>`) are **removed** from the path grammar. A path using either form is now rejected at registration with an actionable replacement recipe:

  - **Optional params** → declare two sibling routes instead (the route hierarchy already expresses optionality): `"/profile/:tab?"` becomes `"/profile"` + `"/profile/:tab"`.
  - **Regex constraints** (`<`/`>` are now reserved in path segments) → match the segment as a plain string and validate the value in a guard (`canActivate`) or app code.

  The demolition collapses this axis's largest cluster of grammar edge-cases (unbalanced/empty/fused constraints, optional-before-splat, optional-splat) into two clear rejections. Bare core carries a short recipe; `@real-router/validation-plugin` surfaces the rich, route-contextual recipe (with computed sibling paths) — the heavy validation stays plugin-gated, off the hot path.

## 0.78.0

### Minor Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Fold `@real-router/types` into `@real-router/core` ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The standalone `@real-router/types` package is dissolved: its types now ship **with**
  `@real-router/core`. Import them from the package root (`import type { State, Params } from
"@real-router/core"`), and augment typed `state.context` namespaces via the new
  `@real-router/core/types` subpath:

  ```ts
  declare module "@real-router/core/types" {
    interface StateContext {
      myPlugin: { … };
    }
  }
  ```

  **Breaking for external augmentors:** retarget `declare module "@real-router/types"` →
  `declare module "@real-router/core/types"`. Note the root exports the `Router` / `RouterError`
  **classes**; import the `Router` **interface** (e.g. for typing a `PluginFactory` param) from
  `@real-router/core/types`. Folding types into core also ties their identity to the core
  version, eliminating the two-copies / split-brain-augmentation drift class.

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the unused public `Config` type ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The `Config` interface (exported from `@real-router/core/types`) is removed. It was a
  vestigial public export consumed by nothing — not `@real-router/core` internally, and not
  a single adapter, plugin, or example across the monorepo — and merely duplicated four
  fields of the internal `RouteConfig` (which additionally carries `forwardFnMap`).

  **Breaking only for external code that imported `Config` from `@real-router/core/types`.**
  There is no public replacement: the per-route config shape (decoders / encoders /
  `defaultParams` / `forwardMap`) is an internal concern with no supported public type.
  Nothing needs it — the export never had a consumer.

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal: fold the FSM engine and the `event-emitter` primitive into `@real-router/core` at `src/utils/` — no public API or behavior change. ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  `event-emitter` (private) is dissolved and its package removed. `@real-router/fsm` (published to npm by mistake, unpublish blocked) is frozen and no longer a dependency of core — core now builds its router state machine on an in-tree copy, so consumers no longer receive `@real-router/fsm` as a transitive dependency.

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Dissolve `@real-router/logger` into core as a per-router `RouterLogger` ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The standalone `@real-router/logger` package has been folded into `@real-router/core`
  (`core/src/utils/logger/`). The former process-global **singleton** logger is
  replaced by a **per-router `RouterLogger` instance**, built from `options.logger` in the
  `Router` constructor and stored on the router's internal context. So
  `createRouter(routes, { logger })` now configures **only that router's** logger and its
  `configure()` no longer leaks across routers (previously the last `createRouter` /
  `cloneRouter` in the process won). The public API is unchanged — the `options.logger`
  shape and the `log` / `warn` / `error` / callback semantics are identical, and
  `RouterLogger` still writes to `console`.

  The `@real-router/logger` package is deleted and is no longer a (transitive) dependency of
  `@real-router/core`. The logger contract types (`RouterLogger`, `LoggerConfig`, `LogLevel`,
  `LogLevelConfig`, `LogCallback`) now live in `@real-router/types` and are re-exported from
  `@real-router/core`.

## 0.77.4

### Patch Changes

- [#1513](https://github.com/greydragon888/real-router/pull/1513) [`e50042a`](https://github.com/greydragon888/real-router/commit/e50042ac53276b637f49f709d8f5b9e483bc28e5) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal: merge the routing-engine trio (search-params + path-matcher + route-tree) into a single private `engine` package ([#1510](https://github.com/greydragon888/real-router/issues/1510))

  Iteration 1 of the engine-merge RFC. The three internal utils packages fold into one zero-dependency `engine` package (former `route-tree` facade at the src root; `path-matcher` and `search-params` as internal layers), which core bundles exactly as it bundled `route-tree` before. No public API or behaviour change — core's exports and dist shape are unchanged (tree-shaking already kept the layers internal to the bundle).

## 0.77.3

### Patch Changes

- [#1508](https://github.com/greydragon888/real-router/pull/1508) [`0f6b98a`](https://github.com/greydragon888/real-router/commit/0f6b98ab267a8f8f93774db2dd7b0eaae9ec7024) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal: remove dead `parse`/`getSearch` and phantom grammar re-exports from the routing engine ([#1505](https://github.com/greydragon888/real-router/issues/1505))

  `search-params.parse` (a path-accepting wrapper orphaned by [#1292](https://github.com/greydragon888/real-router/issues/1292), when `createMatcher` moved to `parseQuery`) and `getSearch` (its only consumer) had no runtime caller; `path-matcher`'s `PARAM_NAME_PATTERN` / `CONSTRAINT_BODY_PATTERN` stayed defined as internal grammar atoms but their package-index re-exports had none. Removed the dead code and migrated the affected tests to `parseQuery` — 100% coverage and mutation score preserved. Pre-step of the engine-merge (A.0). No public API or behavior change: the internal trio bundles into `@real-router/core`.

## 0.77.2

### Patch Changes

- [#1503](https://github.com/greydragon888/real-router/pull/1503) [`c885b7c`](https://github.com/greydragon888/real-router/commit/c885b7c18b85515f5b83726e94fee7f70f4fefba) Thanks [@greydragon888](https://github.com/greydragon888)! - Isolate an async (rejecting) plugin hook so it no longer leaks a Node `unhandledRejection` ([#1412](https://github.com/greydragon888/real-router/issues/1412))

  - The internal `EventEmitter` caught only **synchronous** listener throws; a plugin hook (`onStart`, `onTransitionSuccess`, …) is a raw listener, so an `async` hook that rejects escaped as an unhandled promise rejection — fatal under `--unhandled-rejections=strict` (the Node 22+ default).
  - The emitter now inspects each listener's return value and routes a rejected thenable to the same `onListenerError` sink a sync throw flows through — centrally, so every listener kind is isolated symmetrically. The router still starts / completes the transition; the rejection surfaces via `logger.error` instead of crashing the process.
  - Folds in `subscribe`'s per-site async isolation ([#944](https://github.com/greydragon888/real-router/issues/944)): the `EventBusNamespace` wrapper now just returns the listener's value to the emitter's central isolation. Symmetric with `subscribeLeave`, which isolates via `Promise.allSettled`. No public API change.

## 0.77.1

### Patch Changes

- [#1501](https://github.com/greydragon888/real-router/pull/1501) [`898b44f`](https://github.com/greydragon888/real-router/commit/898b44fe8ccdabc327aeacbe4a41c0ee85909fbb) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject cleanly when a `start` interceptor never calls next() ([#1411](https://github.com/greydragon888/real-router/issues/1411))

  A `start` interceptor that returned without calling `next()` (a non-thenable, typically `undefined`) made `Router.start()` throw a raw synchronous `TypeError: Cannot read properties of undefined (reading 'catch')` — the returned promise never settled and the FSM stuck in `STARTING` (`isActive()` stayed `true`), pointing the crash at internal code instead of the offending plugin. `Router.start()` now detects a non-thenable interceptor-chain result and rejects with an actionable `TypeError` (`a \`start\` interceptor returned without calling next()`), so the router unwinds through the existing failed-start recovery and `start()`honors its`Promise<State>` contract. Same deferred-crash class as the [#939](https://github.com/greydragon888/real-router/issues/939) start-path guard.

## 0.77.0

### Minor Changes

- [#1499](https://github.com/greydragon888/real-router/pull/1499) [`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden `claimContextNamespace` against a `"__proto__"` namespace ([#1191](https://github.com/greydragon888/real-router/issues/1191))

  `claim("__proto__").write(state, value)` previously ran `state.context["__proto__"] = value`, which dispatches into the inherited `Object.prototype.__proto__` setter and swaps the prototype of `state.context` instead of creating an own entry — the plugin's data then silently vanished from `Object.keys` and the SSR transport (`serializeRouterState` emitted `context: {}`). The write now uses `Object.defineProperty` for the `"__proto__"` key (mirroring `@real-router/search-params`), so it becomes a genuine own property; normal names keep the plain-assignment fast path with zero behavior change.

  `serializeRouterState`'s `excludeContext` path — exposed by the above fix — now builds its filtered context on a `null`-prototype object so a preserved `"__proto__"` namespace survives the filter too.

  `claimContextNamespace` also now rejects a non-string or empty namespace with a `TypeError`, symmetric with the other always-on invariant guards (`subscribe` / `start` / `navigateToNotFound`). This is a contract tightening — a previously-accepted `claim("")` / `claim(42)` now throws.

## 0.76.0

### Minor Changes

- [#1471](https://github.com/greydragon888/real-router/pull/1471) [`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d) Thanks [@greydragon888](https://github.com/greydragon888)! - Call the validator's listener-count threshold from `subscribe` / `addEventListener` ([#1188](https://github.com/greydragon888/real-router/issues/1188))

  `EventBusNamespace` now reads the per-event listener count and calls the opt-in `RouterValidator.eventBus.validateCountThresholds` on each `subscribe` / `addEventListener`, mirroring the plugins / lifecycle / dependencies counters. The new interface method and `wireEventBus` accessor are additive; without `@real-router/validation-plugin` the accessor returns `null` and the call is a no-op, so the bare-core hot path and the emitter's bare-`Error` hard cap are unchanged.

## 0.75.0

### Minor Changes

- [#1443](https://github.com/greydragon888/real-router/pull/1443) [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): thread `parentName` into the `RouterValidator.routes.validateRoutes` type ([#1224](https://github.com/greydragon888/real-router/issues/1224))

  `RouterValidator.routes.validateRoutes` gained an optional `parentName?: string`
  third argument, threaded from the `add({ parent })` call site (`getRoutesApi.ts`).
  Without it the validation plugin validated a parented batch "from the root" and
  false-rejected a `forwardTo` whose target needs the parent's path params — an add
  that bare core accepts and runs correctly. Additive, non-breaking (optional
  param); pre-1.0 `minor` for the public type surface. Bare core is unchanged (the
  validator is `null` without the plugin).

- [#1443](https://github.com/greydragon888/real-router/pull/1443) [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor(core): drop orphaned `RouterValidator` entries + the dead `validateDependencyLimit` call ([#1226](https://github.com/greydragon888/real-router/issues/1226))

  Removes validation-plugin mirror-drift left after [#960](https://github.com/greydragon888/real-router/issues/960): the never-called
  `RouterValidator` interface methods `routes.validateExistingRoutes`,
  `routes.validateForwardToConsistency`, `options.validateLimitValue`,
  `options.validateLimits`, `dependencies.validateDependencyLimit`,
  `dependencies.validateDependenciesStructure`, and `eventBus.validateEventName`
  (core never invoked any of them — the plugin calls its own file-scope versions),
  plus the dead `ctx.validator?.dependencies.validateDependencyLimit(...)` call in
  `getDependenciesApi` (the dependency-count limit is enforced by
  `validateDependencyCount`). Public type-surface removal (pre-1.0 `minor`); no
  runtime behavior change — bare core never called these.

## 0.74.9

### Patch Changes

- [#1428](https://github.com/greydragon888/real-router/pull/1428) [`53a315c`](https://github.com/greydragon888/real-router/commit/53a315c56f329c37c3fa396dafd4b81b29c2b4a7) Thanks [@greydragon888](https://github.com/greydragon888)! - Derive route definitions from the tree on demand — drop the third retained copy of the route table ([#1426](https://github.com/greydragon888/real-router/issues/1426))

  `RoutesStore.definitions` is now a getter over `routeTreeToDefinitions(store.tree)` (the lossless inverse `cloneRouter` already relies on) instead of a permanently-retained parallel array. Browser CDP A/B on the 10k-route table: **−0.229 MB (−3.6 %) retained heap** — cumulatively −30 % with [#1379](https://github.com/greydragon888/real-router/issues/1379)/[#1414](https://github.com/greydragon888/real-router/issues/1414)/[#1415](https://github.com/greydragon888/real-router/issues/1415). The derived array is a fresh snapshot per access (cold CRUD/plugin-registration paths only); behavior is unchanged and the internals surface consumed by `@real-router/validation-plugin` is preserved.

## 0.74.8

### Patch Changes

- [#1420](https://github.com/greydragon888/real-router/pull/1420) [`227fa83`](https://github.com/greydragon888/real-router/commit/227fa83f567afb1c124b7882ff7f9d2ecd94b110) Thanks [@greydragon888](https://github.com/greydragon888)! - Retain one shared frozen `EMPTY_PARAM_META` for fully-static route nodes ([#1415](https://github.com/greydragon888/real-router/issues/1415))

  The route tree no longer keeps a fresh 6-field `ParamMeta` wrapper per fully-static node (all collections were already shared [#1009](https://github.com/greydragon888/real-router/issues/1009) sentinels; the wrapper carried no information). Browser CDP A/B on the 10k-route table: **−0.340 MB retained heap** on top of [#1414](https://github.com/greydragon888/real-router/issues/1414) — combined **−18.7 %** (7.725 → 6.279 MB @10k). Observable shape note: on fully-static nodes of the public `RouteTree`, `paramMeta` is identity-shared and its `pathPattern` is `""` (the node's own `path` is the pattern).

- [#1420](https://github.com/greydragon888/real-router/pull/1420) [`227fa83`](https://github.com/greydragon888/real-router/commit/227fa83f567afb1c124b7882ff7f9d2ecd94b110) Thanks [@greydragon888](https://github.com/greydragon888)! - Skip empty per-route meta records — one shared frozen `EMPTY_ROUTE_META` sentinel ([#1414](https://github.com/greydragon888/real-router/issues/1414))

  `buildMeta` no longer allocates a fresh `{ [routeName]: {} }` record per fully-static route — route-unique keys degrade into per-object hidden classes (first ~1k) and dictionary-mode objects (the rest) at scale. Browser CDP A/B on the 10k-route table: **−1.106 MB (−14.3 %) retained heap**. Observable shape note: empty entries no longer appear in the meta reachable via `PluginApi.buildState()` — a missing entry is equivalent to an empty one for every consumer.

## 0.74.7

### Patch Changes

- [#1401](https://github.com/greydragon888/real-router/pull/1401) [`ad96c2e`](https://github.com/greydragon888/real-router/commit/ad96c2e3190873916a0a398c78407b7315ae1b16) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `EventEmitter.on()` leaving an orphan record when a rejection throws ([#1167](https://github.com/greydragon888/real-router/issues/1167))

  `on()` created and stored the per-event record before its rejection checks, so a
  negative `maxListeners` (the limit check is already met at size 0) threw on the
  first registration of a new name while retaining an empty `Set` — an unbounded,
  `listenerCount`-invisible heap leak. `on()` now validates before mutating: the
  record is created only after every check passes, so a rejected registration
  leaves nothing behind.

- [#1401](https://github.com/greydragon888/real-router/pull/1401) [`ad96c2e`](https://github.com/greydragon888/real-router/commit/ad96c2e3190873916a0a398c78407b7315ae1b16) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a throwing `onListenerWarn` burning the warn latch ([#1168](https://github.com/greydragon888/real-router/issues/1168))

  In `EventEmitter.on()` the warn latch was set before the (user-supplied)
  `onListenerWarn` hook ran, so a throwing hook failed the registration but left
  the latch spent — the next successful (W+1)th registration then stayed silent.
  The hook is now invoked before the latch is set, so a throw leaves the latch
  unspent and the next registration warns as documented.

## 0.74.6

### Patch Changes

- [#1400](https://github.com/greydragon888/real-router/pull/1400) [`f668898`](https://github.com/greydragon888/real-router/commit/f668898188e19b5ce7eae5987c259ea37320ef36) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `EventEmitter.clearAll()` lifting the in-flight re-entrancy guard ([#1164](https://github.com/greydragon888/real-router/issues/1164))

  `clearAll()` called from inside a listener cleared the per-event `#dispatching`
  guard held by the live `emit` frame, so a re-entrant same-event `emit()` was no
  longer coalesced and re-entered — violating the [#1033](https://github.com/greydragon888/real-router/issues/1033) depth-≤-1 contract
  (empirically reached depth 5). The guard is owned by the active emit frame and
  self-releases in its `finally`; `clearAll()` no longer touches it.

## 0.74.5

### Patch Changes

- [#1397](https://github.com/greydragon888/real-router/pull/1397) [`01017d0`](https://github.com/greydragon888/real-router/commit/01017d02d6deaf0822fe58cff0aaf2ac7c6d81d8) Thanks [@greydragon888](https://github.com/greydragon888)! - Drop the unreachable non-splat branch of the splat param encoder ([#860](https://github.com/greydragon888/real-router/issues/860))

  `encodeParam` is now splat-only: `registration/buildParts.ts` routes only SPLAT param
  slots through it (a non-splat param is encoded by `ENCODING_METHODS[encoding]` directly),
  so its former `!isSpatParam` fast path was unreachable dead code — surfaced when the
  path-matcher encoding unit tests were migrated to exercise the public `buildPath` / `match`
  surface, and dropped. Behaviour is unchanged (that branch never ran): the encoding /
  splat property suites and the build∘match inverse round-trip stay green. `DECODING_METHODS.none`
  is likewise never reached through `match` (the matcher special-cases `urlParamsEncoding
=== "none"` to skip decoding entirely), so it is kept only for the map's type completeness
  (asserted by the exempt encoding property test) and marked unreachable.

- [#1397](https://github.com/greydragon888/real-router/pull/1397) [`01017d0`](https://github.com/greydragon888/real-router/commit/01017d02d6deaf0822fe58cff0aaf2ac7c6d81d8) Thanks [@greydragon888](https://github.com/greydragon888)! - Drop an unreachable `?`-after-marker branch in the parse-segment tokenizer ([#1324](https://github.com/greydragon888/real-router/issues/1324))

  `parseSegment` no longer special-cases a `?` immediately following a bare marker
  inside a static segment (`a:?`). That shape never reaches the tokenizer through a
  real route path — a `?` after a bare marker is not a valid `:name?` optional, so the
  query mask strips it before `/`-segmentation — so the arm was unreachable dead code,
  surfaced by migrating the path-matcher unit tests to exercise the public API.
  Behaviour is unchanged on every real route: the `parseSegment ≡ parsers` equivalence
  property and the route-tree gate↔backstop parity both still hold. Only a direct
  `findSegmentGrammarError("/a:?b")` call — which no consumer makes — now reports
  `fused-marker` instead of `undefined`.

## 0.74.4

### Patch Changes

- [#1396](https://github.com/greydragon888/real-router/pull/1396) [`3ba28bc`](https://github.com/greydragon888/real-router/commit/3ba28bc83c7556b39e793aed94b603f7c5446d68) Thanks [@greydragon888](https://github.com/greydragon888)! - Align the gate's optional-before-splat reject reason with the registerTree backstop ([#1287](https://github.com/greydragon888/real-router/issues/1287))

  `validateRoutePath` now checks `hasMultipleOptionalsBeforeSplat` ([#1287](https://github.com/greydragon888/real-router/issues/1287)) BEFORE
  `hasUnconstrainedOptionalBeforeSplat` ([#1264](https://github.com/greydragon888/real-router/issues/1264)), matching the order the path-matcher
  `registerTree` backstop uses (`registerNode` runs the [#1287](https://github.com/greydragon888/real-router/issues/1287) predicate before
  `markOptionalFork`'s [#1264](https://github.com/greydragon888/real-router/issues/1264) throw). A path that triggers both — `/:a?/:b?/*rest` (two
  optionals, the inner one unconstrained before the splat) — previously reported the
  [#1264](https://github.com/greydragon888/real-router/issues/1264) reason from the gate but the [#1287](https://github.com/greydragon888/real-router/issues/1287) reason from the backstop: the same
  accept/reject verdict (both reject) but a different, misleading message. The [#1264](https://github.com/greydragon888/real-router/issues/1264)
  hint ("add a constraint") is a dead end for this shape — `/:a<c>?/:b<c>?/*rest` is
  still rejected by [#1287](https://github.com/greydragon888/real-router/issues/1287) — so the gate now reports [#1287](https://github.com/greydragon888/real-router/issues/1287)'s actionable "split into two
  routes, or drop the '?' on one". Accept/reject is unchanged; only the reject message
  on this already-rejected malformed family moves.

## 0.74.3

### Patch Changes

- [#1379](https://github.com/greydragon888/real-router/pull/1379) [`ada0ce7`](https://github.com/greydragon888/real-router/commit/ada0ce70e5510657eb652f984ba390ee48cac0b8) Thanks [@greydragon888](https://github.com/greydragon888)! - perf: share a frozen empty sentinel for trie `staticChildren` ([#1379](https://github.com/greydragon888/real-router/issues/1379))

  Every trie node used to allocate its own `Object.create(null)` for
  `staticChildren`, but the leaf-majority (one node per registered route) never
  gains a static child — so each held an empty null-proto object purely to answer
  the match-path `key in node.staticChildren` read. Registration now shares one
  frozen empty sentinel across every fresh node and copies-on-write to a fresh
  mutable map on the first static child; the match path is unchanged. Cross-router
  `table-heap` (react, 10k routes, same-session CDP A/B): 8.59 → 7.71 MB (~10 %
  less retained heap).

## 0.74.2

### Patch Changes

- [#1359](https://github.com/greydragon888/real-router/pull/1359) [`88008ce`](https://github.com/greydragon888/real-router/commit/88008ce6118faee4e3b1c446e5fbdb9035633c1e) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject duplicate names and reserved `@@` names in `createRouter([...])` initial routes ([#1351](https://github.com/greydragon888/real-router/issues/1351))

  The constructor / initial-routes path silently last-wins a duplicate-name sibling — dropping the first route, so its deep-link commits `UNKNOWN_ROUTE` — and accepts reserved `@@` route names, while `add()` / `replace()` already throw in bare core ([#953](https://github.com/greydragon888/real-router/issues/953) / [#968](https://github.com/greydragon888/real-router/issues/968) / [#954](https://github.com/greydragon888/real-router/issues/954)). `createRoutesStore` now runs `assertNoInternalNamesInBatch` + `assertNoDuplicateNamesInBatch` before building, giving the constructor parity with the other two route-population entry points (duplicate paths are already rejected by the path-matcher backstop, [#1153](https://github.com/greydragon888/real-router/issues/1153)). Shipped as `patch` for parity with [#953](https://github.com/greydragon888/real-router/issues/953) / [#968](https://github.com/greydragon888/real-router/issues/968), which shipped this same silently-kept-last → throw change as a patch (it restores the intended uniqueness invariant, not a new feature).

## 0.74.1

### Patch Changes

- [#1348](https://github.com/greydragon888/real-router/pull/1348) [`a875256`](https://github.com/greydragon888/real-router/commit/a875256d38517817c3eecdb1177819cecfe73041) Thanks [@greydragon888](https://github.com/greydragon888)! - Clear interceptors on `dispose()` so a leaked interceptor no longer runs ([#1199](https://github.com/greydragon888/real-router/issues/1199))

  `dispose()` had dispose safety-nets for `routerExtensions` and `contextClaimRecords` but never cleared `ctx.interceptors` — the third per-plugin registration channel. Since `buildPath` is not method-swapped by `dispose()` and reads the interceptor Map live, an interceptor a plugin failed to remove in `teardown` still ran on the disposed router. `dispose()` now clears the interceptor Map alongside the other two safety-nets.

- [#1348](https://github.com/greydragon888/real-router/pull/1348) [`a875256`](https://github.com/greydragon888/real-router/commit/a875256d38517817c3eecdb1177819cecfe73041) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `subscribeLeave`'s unsubscribe idempotent ([#1349](https://github.com/greydragon888/real-router/issues/1349))

  `subscribeLeave` stored the listener directly in `#leaveListeners` and spliced by `indexOf(listener)` with no `removed` flag — the exact sibling of [#1198](https://github.com/greydragon888/real-router/issues/1198) (`addInterceptor`), in a channel the `Unsubscribe` contract explicitly names as idempotent. With the same `fn` registered twice, calling the first unsubscribe twice removed a second registration, silently deactivating another subscriber's leave handler. A `removed` flag now short-circuits repeat calls (mirroring `addInterceptor` / `extendRouter`). Unlike `subscribe` / `subscribeChanges`, `subscribeLeave` does not wrap the listener in a fresh closure, so it needed the explicit guard. The misleading "irrelevant in practice" note in the JSDoc is corrected.

- [#1348](https://github.com/greydragon888/real-router/pull/1348) [`a875256`](https://github.com/greydragon888/real-router/commit/a875256d38517817c3eecdb1177819cecfe73041) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `addInterceptor`'s unsubscribe idempotent ([#1198](https://github.com/greydragon888/real-router/issues/1198))

  `addInterceptor`'s unsubscribe spliced by `list.indexOf(fn)` with no guard, so calling the first unsubscribe twice — documented as safe by the `Unsubscribe` contract — removed a SECOND registration of the same `fn` (e.g. a shared module-level interceptor helper used by two plugin instances), silently deactivating another plugin's interceptor. A `removed` flag now short-circuits repeat calls, mirroring `extendRouter`.

- [#1348](https://github.com/greydragon888/real-router/pull/1348) [`a875256`](https://github.com/greydragon888/real-router/commit/a875256d38517817c3eecdb1177819cecfe73041) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a pre-bound `usePlugin` reference registering a zombie plugin after `dispose()` ([#1196](https://github.com/greydragon888/real-router/issues/1196))

  A `usePlugin` reference captured before `dispose()` (`const up = router.usePlugin`) bypassed the post-dispose method swap and reached the real implementation, so the factory ran on the disposed router (real side effects), listeners landed in the cleared emitter, and `teardown` never fired. It now throws `ROUTER_DISPOSED` like every other mutating method — mirroring the [#946](https://github.com/greydragon888/real-router/issues/946) guard for `subscribe` / `subscribeLeave`.

## 0.74.0

### Minor Changes

- [#1346](https://github.com/greydragon888/real-router/pull/1346) [`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910) Thanks [@greydragon888](https://github.com/greydragon888)! - Make guard clearing origin-explicit so a route-config guard is never wiped by an external-guard operation ([#1171](https://github.com/greydragon888/real-router/issues/1171))

  The internal guard-clear primitive defaulted to clearing BOTH origin slots (route-config + external), so several operations silently erased a route-config guard they should have left alone. Guard clearing now names its origin lane explicitly (no origin-blind default), fixing two observable behaviors:

  - **Post-leave auto-cleanup is external-only.** A route-config `canDeactivate` was one-shot — the first permitted leave erased it, so re-entry was unguarded (e.g. an unsaved-changes confirmation silently broke on the second visit), `getRoutesApi().get(name).canDeactivate` became `undefined`, and a `cloneRouter` taken after the leave never received it. Now only the external, component-managed guard is auto-cleaned; a config guard lives as long as the route is in the tree, symmetric with `canActivate`.
  - **`removeActivateGuard` / `removeDeactivateGuard` are external-only.** They are the inverse of `addActivateGuard` / `addDeactivateGuard` (which register external guards), so they now clear only the external guard and leave a route-config guard intact. To remove a config guard, use `getRoutesApi(router).update(name, { canActivate: null })` / `{ canDeactivate: null }`.

  Route removal and `dispose()` still clear both origins (the route/router is gone).

  Note: because a route-config `canDeactivate` now persists, it counts toward the per-type handler tally the way a config `canActivate` always has — so under `@real-router/validation-plugin`'s `maxLifecycleHandlers`, a config `canDeactivate` occupies a slot for the life of the route instead of freeing it on first leave.

## 0.73.1

### Patch Changes

- [#1344](https://github.com/greydragon888/real-router/pull/1344) [`55057b2`](https://github.com/greydragon888/real-router/commit/55057b26980674205bccf44d0bb59c8d492461e0) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): update() of a nonexistent route is a true no-op in bare core ([#1205](https://github.com/greydragon888/real-router/issues/1205))

  Without `@real-router/validation-plugin`, `update("ghost", …)` for a route that does not exist used to silently seed `config.defaultParams` + compile/register the guard factory and emit a lying `TREE_CHANGED` `"update"` event for a route `get()`/`has()` cannot see — and a later `add({ name: "ghost" })` inherited the phantom config + a blocking guard (`navigate` rejected `CANNOT_ACTIVATE` out of the box). It is now a genuine no-op: the commit and the emit are skipped when the route is absent. No throw is added (validation stays opt-in — the validation-plugin already throws a `ReferenceError` here).

## 0.73.0

### Minor Changes

- [#1342](https://github.com/greydragon888/real-router/pull/1342) [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): guard resolution is now external-wins, fixing cloneRouter guard divergence ([#1174](https://github.com/greydragon888/real-router/issues/1174))

  When a route holds both a definition guard (route-config `canActivate`/`canDeactivate`) and an external guard (`addActivateGuard`/`addDeactivateGuard`), the compiled guard is now the **external** one regardless of registration order. Previously registration was last-add-wins, which `cloneRouter` inverted: it re-registers guards in a fixed definition→external order, so a clone of a base whose effective guard was a definition (added after an external) silently ran the _external_ guard instead — a security divergence in SSR multi-tenancy, where the per-request clone is the authorization boundary.

  Committing to external-wins in `#registerHandler` (matching `#recompileSlot` / `clearDefinitionGuards`, external-wins since [#1192](https://github.com/greydragon888/real-router/issues/1192)) resolves the latent register↔recompile policy split, makes the clone's fixed replay yield the source's effective guard with no extra tracking, and keeps app-added guards authoritative over config defaults.

  **Breaking:** a definition guard registered while an external guard is live on the same route no longer overrides it (registration order is now irrelevant — external always wins).

### Patch Changes

- [#1342](https://github.com/greydragon888/real-router/pull/1342) [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): cloneRouter carries the source rootPath ([#1175](https://github.com/greydragon888/real-router/issues/1175))

  `rootPath` lives in the routes store (not options/config), and neither `routeTreeToDefinitions` nor `getCloneState()` include it — so `cloneRouter` constructed every clone with `rootPath = ""`. A base configured via `setRootPath("/app")` matched `/app/...`, while its clones silently built and matched `/...`, resolving every `/app/...` URL to `UNKNOWN_ROUTE`. In SSR (one clone per request), a sub-path deployment 404'd on every request.

  cloneRouter now carries `sourceStore.rootPath` onto the clone (when non-empty) right after the config copy, so the clone's tree rebuilds under the same sub-path. The rebuild is only paid when a rootPath is actually set.

## 0.72.3

### Patch Changes

- [#1340](https://github.com/greydragon888/real-router/pull/1340) [`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): canonicalize the cancellation outcome of an external abort during an async subscribeLeave ([#1197](https://github.com/greydragon888/real-router/issues/1197))

  When a navigation carrying an external `opts.signal` was parked on an async `subscribeLeave` listener and the signal aborted, the no-guards pipeline misclassified the cancellation: `navigate()` rejected with the **raw** abort reason (a plain `Error`/`DOMException`, so `err.code !== TRANSITION_CANCELLED`) and a spurious `TRANSITION_ERROR` was emitted after `TRANSITION_CANCEL` — two mutually exclusive outcomes for one navigation, plus an error-level "Unexpected navigation error" log for a routine user cancel.

  The abort now rejects with `RouterError(TRANSITION_CANCELLED)` carrying the external reason, matching the guard path exactly (no raw reject, no spurious error). Internal cancel sources (supersede / `stop()` / `dispose()`), whose reason is already a `RouterError(TRANSITION_CANCELLED)`, are threaded through unchanged so the leave signal's `reason` ([#943](https://github.com/greydragon888/real-router/issues/943)) is preserved.

- [#1340](https://github.com/greydragon888/real-router/pull/1340) [`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): liveness-gate the internal navigateToNotFound commit primitive ([#1186](https://github.com/greydragon888/real-router/issues/1186))

  `dispose()` called while a `start()` interceptor was parked (FSM already `DISPOSED`) could still commit an `UNKNOWN_ROUTE` state on the disposed router: when the interceptor resumed, `matchPath` missed the cleared route tree and the default `allowNotFound: true` path routed into the internal `navigateToNotFound` primitive, which had no liveness gate — so `start()` resolved successfully with a phantom state on a disposed instance.

  `navigateToNotFound` now throws `RouterError(ROUTER_DISPOSED)` when the router is no longer active, so the disposed-router branch rejects like the matched-route branch (which was already protected by the `canNavigate()` gate). No state is committed after `dispose()`.

- [#1340](https://github.com/greydragon888/real-router/pull/1340) [`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): actionable error for a path-less navigateToNotFound() during the STARTING window ([#1172](https://github.com/greydragon888/real-router/issues/1172))

  `router.navigateToNotFound()` with no explicit path derived the default path from the committed state via a non-null assertion (`state.get()!.path`), justified by "isActive() guarantees state exists". That assumption is false during the router's two-phase start: while a start navigation is pending (async guard / start interceptor), `isActive()` is `true` but `getState()` is still `undefined`, so a path-less call crashed with a cryptic, code-less `TypeError: Cannot read properties of undefined (reading 'path')`.

  It now throws `RouterError(ROUTER_NOT_STARTED)` with an actionable message ("cannot derive the path before the start navigation commits — pass an explicit path") — the same always-on invariant-guard class as the `start(path)` type guard ([#939](https://github.com/greydragon888/real-router/issues/939)). The misleading non-null assertion is removed; a provided path is used directly.

- [#1340](https://github.com/greydragon888/real-router/pull/1340) [`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): cancel in-flight navigation on stop()/dispose()/abort from a transition listener ([#1169](https://github.com/greydragon888/real-router/issues/1169))

  A synchronous `stop()`, `dispose()`, or external `opts.signal` abort issued from inside a transition listener (`subscribeLeave`, or a plugin's `onTransitionStart`) no longer commits the superseded navigation. Previously such a navigation could resolve with `TRANSITION_SUCCESS` — and, after `dispose()`, resurrect the FSM out of its terminal `DISPOSED` state into a zombie router (`isActive() === true` on a disposed instance).

  The fix has two structural parts: the three hot navigation transitions (`NAVIGATE`/`LEAVE_APPROVE`/`COMPLETE`) now go through the FSM transition table (`send()`) instead of the `forceState()` bypass, so a transition from an invalid state is a table no-op that emits nothing — the FSM table is the sole authority over state and cannot be resurrected. A pre-commit liveness gate (active only when a listener window is reachable) then refuses the `setState` that precedes it, so the navigation rejects with `RouterError(TRANSITION_CANCELLED)` and the router stays stopped/disposed. `forceState()` is no longer called anywhere in core.

  Performance note: this trades a hot-path micro-optimization for a structural determinism guarantee — routing the three transitions through the table costs roughly +15–20% on the `navigate/*` benchmarks (still sub-microsecond) and one small transition-payload allocation per navigation. The router's cancellation correctness is now enforced by the state machine rather than by scattered re-checks.

- [#1340](https://github.com/greydragon888/real-router/pull/1340) [`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(core): stop() during the STARTING window now cancels the start ([#1185](https://github.com/greydragon888/real-router/issues/1185))

  `router.stop()` called while `start()` is parked in an async start-interceptor (before it calls `next()`, FSM = STARTING) was a silent no-op: the facade's early return fired (STARTING is neither ready nor transitioning), `STARTING` accepted neither STOP nor CANCEL, and when the interceptor resumed the pipeline completed normally — the router ended up READY with a committed state, breaking the documented "stop() during start cancels the transition" contract (wiki/start.md) and the "after stop(), isActive() === false" invariant.

  The FSM table now accepts `STARTING --STOP--> IDLE`; the facade's `stop()` sends STOP when the router is starting; and `RouterLifecycleNamespace.start` (the start-interceptor target) re-checks `isIdle()` after the interceptor chain, rejecting with `TRANSITION_CANCELLED` when a stop() cancelled the start mid-window — mirroring the guard phase, which already cancels from TRANSITION_STARTED. A `dispose()` in the same window is unaffected: it leaves the FSM DISPOSED, which the commit primitives' liveness gate still rejects as `ROUTER_DISPOSED` ([#1186](https://github.com/greydragon888/real-router/issues/1186)), so a stop and a dispose stay distinguishable.

- Updated dependencies [[`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e)]:
  - @real-router/fsm@0.6.0

## 0.72.2

### Patch Changes

- [#1338](https://github.com/greydragon888/real-router/pull/1338) [`785dd91`](https://github.com/greydragon888/real-router/commit/785dd91db7fbab08cd3188ee87817cd014c4979c) Thanks [@greydragon888](https://github.com/greydragon888)! - `clearDefinitionGuards()` recompiles the surviving external guard for both-slot routes ([#1192](https://github.com/greydragon888/real-router/issues/1192))

  When a route held **both** a definition and an external guard, `replace()`'s `clearDefinitionGuards()` skipped the compiled-function slot on the false premise "external already won at registration." Registration is **last-add-wins**, so if the definition guard was registered AFTER the external one (`addActivateGuard()` then `update(name, { canActivate })`, or an `add()` batch landing after an external), the compiled function WAS the definition guard — and clearing the definition factory left it running: `navigate()` / `canNavigateTo()` executed a guard present in no factory store (a zombie), silently shadowing the surviving external guard, with introspection (`get(name).canActivate`) disagreeing with behavior. The slot is now recompiled from the surviving external factory. The two now-false comments (the class-level "external wins at compile time" and the `clearDefinitionGuards` premise) are corrected, and a property test locks arbitrary def-after-ext interleavings.

- [#1338](https://github.com/greydragon888/real-router/pull/1338) [`785dd91`](https://github.com/greydragon888/real-router/commit/785dd91db7fbab08cd3188ee87817cd014c4979c) Thanks [@greydragon888](https://github.com/greydragon888)! - `navigateToState()` preserves route-meta so popstate does not re-run ancestor guards ([#1170](https://github.com/greydragon888/real-router/issues/1170))

  Route-meta lives in a `WeakMap` keyed by state-object reference. `navigateToState()` — which backs `start()` and **every popstate under a URL plugin** — built a fresh writable shell of the `matchPath` state without carrying the binding over. So once two consecutive `navigateToState` commits happened, both `toState` and `fromState` were meta-less and `getTransitionPath` fell into its full-reload fallback: shared ancestor guards **re-ran** and browser-back could **reject** a transition that `navigate()` resolves (e.g. an ancestor guard that flips to `false` while inside its subtree). The meta binding is now carried across the writable-shell copy, restoring `navigate()` parity — ancestor guards stay mounted and popstate `transition.segments` become deltas again.

- [#1338](https://github.com/greydragon888/real-router/pull/1338) [`785dd91`](https://github.com/greydragon888/real-router/commit/785dd91db7fbab08cd3188ee87817cd014c4979c) Thanks [@greydragon888](https://github.com/greydragon888)! - A failed `replace()` no longer erases the old definition guards ([#1193](https://github.com/greydragon888/real-router/issues/1193))

  `replace()` ran `clearDefinitionGuards()` **before** the [#956](https://github.com/greydragon888/real-router/issues/956) pre-swap guard compile (which lived inside `adoptRouteArtifacts`). So a new batch carrying a guard factory that throws on compile (or returns a non-function) aborted the swap with the tree intact — **but the old definition guards were already cleared**: a route-config `canActivate` that blocked before the failed `replace()` silently _allowed_ after it, a security-flavored fail-open. The window was also untested (the [#956](https://github.com/greydragon888/real-router/issues/956) tests cover the `add` path only). The compile is now hoisted into `replace()`'s PREPARE phase, before `clearDefinitionGuards`, so a malformed batch aborts with **both** the tree AND the old definition guards intact (mirroring [#1046](https://github.com/greydragon888/real-router/issues/1046)'s handler-limit hoist). `add()` is unaffected — it has no clear step and still compiles inside `adoptRouteArtifacts`.

- [#1338](https://github.com/greydragon888/real-router/pull/1338) [`785dd91`](https://github.com/greydragon888/real-router/commit/785dd91db7fbab08cd3188ee87817cd014c4979c) Thanks [@greydragon888](https://github.com/greydragon888)! - `replace()` revalidation preserves a surviving route's `state.context` ([#1236](https://github.com/greydragon888/real-router/issues/1236))

  When `getRoutesApi(router).replace(...)` revalidates the active state and the route **survives** (same name + path), it rebuilt the state from `matchPath` with a fresh, empty `context` — silently dropping every value plugins wrote into `state.context.<namespace>` (SSR data, rsc, navigation, any `claimContextNamespace` consumer). Revalidation runs neither the loader nor the `start` interceptor, so the data did not come back on its own. The surviving route's prior `context` is now carried over, symmetric with the `transition` carry-over already in place.

- [#1338](https://github.com/greydragon888/real-router/pull/1338) [`785dd91`](https://github.com/greydragon888/real-router/commit/785dd91db7fbab08cd3188ee87817cd014c4979c) Thanks [@greydragon888](https://github.com/greydragon888)! - `replace()` revalidation consults guards on a route-identity change ([#1201](https://github.com/greydragon888/real-router/issues/1201))

  `getRoutesApi(router).replace(...)` revalidates the active state against the new tree ([#950](https://github.com/greydragon888/real-router/issues/950)). It committed whatever `matchPath(currentPath)` returned **without consulting guards** — so after a role-based `replace()` a user sitting on a URL that the new set maps to a different, `canActivate`-blocked route (or a `forwardTo` target) had that route silently activated with its guard skipped.

  Revalidation is now hybrid:

  - A **surviving** route (the URL still maps to the same route name) is kept without re-running guards — the user reached it via a real navigation, and `replace()` is not a navigation they performed (parity with `update()`, which never revalidates the active state).
  - A **route-identity change** (an ownership reshuffle, or a newly-added `forwardTo` that teleports the state) runs the new route's activation guards exactly as `navigate` would: it commits on pass and routes to `navigateToNotFound(currentPath)` on a block — or on an async guard that cannot be evaluated synchronously.

  The revalidation `TRANSITION_SUCCESS` now carries a distinguishable `revalidate: true` marker so a plugin's `onTransitionSuccess` can special-case a revalidation vs a real navigation (both otherwise carry only `replace: true`).

- Updated dependencies [[`785dd91`](https://github.com/greydragon888/real-router/commit/785dd91db7fbab08cd3188ee87817cd014c4979c)]:
  - @real-router/types@0.39.2

## 0.72.1

### Patch Changes

- [#1336](https://github.com/greydragon888/real-router/pull/1336) [`4c348d1`](https://github.com/greydragon888/real-router/commit/4c348d1f752c277d1eef8a581b72ad9428fd96ea) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial-route guard factories now see a fully-built router ([#1331](https://github.com/greydragon888/real-router/issues/1331))

  `canActivate` / `canDeactivate` factories from initial route definitions were compiled and executed mid-construction, on a half-assembled router — a factory calling `router.buildPath()`, `isActiveRoute()`, or `usePlugin()` threw a misleading `Invalid router instance — not found in internals registry` (only `getState()` worked). The pending-guard flush now runs as the final step of the constructor, so factories see a fully wired, registered, and bound router. As a hygiene follow-on, the validator is injected as a plain deps field, dropping the construction-time `try/catch` getter.

  Hardening from the review of this fix:

  - A factory that **throws** during the flush now disposes the instance before the constructor rethrows — a router reference leaked from an earlier factory is fail-closed (`ROUTER_DISPOSED`) instead of a live router with the remaining guards silently unregistered.
  - `cloneRouter` copies the route config (encoders/decoders/defaultParams/custom fields) **before** re-compiling definition guards, so a factory re-executed on the clone observes the same fully-built instance it saw on the base.
  - Side-effectful calls (`navigate`, `usePlugin`, route-CRUD) remain **out of contract** for guard factories — factories re-execute on `cloneRouter` and on guard-slot recompilation, duplicating any side effect. As defense-in-depth, `cloneRouter` skips replaying a plugin that a contract-violating factory already registered on the clone.

- [#1336](https://github.com/greydragon888/real-router/pull/1336) [`4c348d1`](https://github.com/greydragon888/real-router/commit/4c348d1f752c277d1eef8a581b72ad9428fd96ea) Thanks [@greydragon888](https://github.com/greydragon888)! - Collapse `RouterWiringBuilder` into plain wiring functions ([#1334](https://github.com/greydragon888/real-router/issues/1334))

  Internal refactor, no behavior change. The single-call-site `RouterWiringBuilder` class + `wireRouter` director collapse into module-level `wire*` functions over a shared `NamespaceBag`, removing the namespace field list that was repeated three times. `createCompileFactory` is deduped into one shared factory for both guard and plugin compilation, and its `getDependency` accessor is now allocated once per router instead of once per compile call.

- Updated dependencies [[`4c348d1`](https://github.com/greydragon888/real-router/commit/4c348d1f752c277d1eef8a581b72ad9428fd96ea)]:
  - @real-router/types@0.39.1

## 0.72.0

### Minor Changes

- [#1332](https://github.com/greydragon888/real-router/pull/1332) [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject two optional params directly before a splat in the validation gate too ([#1287](https://github.com/greydragon888/real-router/issues/1287))

  path-matcher's `registerTree` already rejected a path with ≥2 optional params directly before a splat (`/:a<c>?/:b<c>?/*rest`) — a single trie slot carries one optional→splat fork, so the omit-outer/take-inner form silently reshapes into the splat. But route-tree's validation gate (`validateRoutePath`, used by `@real-router/validation-plugin`) did not, so a validation-plugin user got a raw `registerTree` throw instead of the gate's route-contextual error — the last cross-segment gate↔backstop drift. The gate now rejects it with a route-contextual message. The `hasMultipleOptionalsBeforeSplat` predicate is single-sourced in path-matcher and imported by both layers, so — like `isConstraintBalanced` — the two can no longer drift.

- [#1332](https://github.com/greydragon888/real-router/pull/1332) [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject a trailing parameter marker (`/:y*`, `/:y:`, `/*y:`) at route registration ([#1324](https://github.com/greydragon888/real-router/issues/1324))

  A param or splat name ending in a bare `:`/`*` marker was silently registered as a dead route by bare core — `buildPath` then threw `Missing required param 'y'` — while the validation plugin's gate rejected it: a gate↔backstop grammar divergence. The route-path grammar is now single-sourced through one `parseSegment` tokenizer, so the trie backstop and the gate agree — such a path is rejected at registration with a clear `Trailing parameter marker …` error instead of compiling an unmatchable route. A mid-name marker (`/:a:b` → param `a:b`) is unaffected.

  Two further validation-plugin gate edge cases now match bare core's backstop (they previously diverged, in both directions): a marker-less segment with a trailing `?` (`/faq?` — an optional modifier with no param name) is now rejected by the gate too, matching the registration error it always produced; and a static segment ending in a lone bare marker (`/a:`, `/a*` — a valid literal segment) is now accepted by the gate, matching the route bare core always registered.

- [#1332](https://github.com/greydragon888/real-router/pull/1332) [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33) Thanks [@greydragon888](https://github.com/greydragon888)! - Route registration decides every per-segment grammar rejection through the shared `parseSegment` tokenizer ([#1324](https://github.com/greydragon888/real-router/issues/1324))

  `registerTree`'s bare-core backstop previously spread its grammar rejections across separate char-scans: three whole-path constraint guards (`hasFusedConstraintSuffix`, `hasConstraintInStaticSegment`, and an `<>` literal check), a `FUSED_MARKER_RGX` in the trie's static branch, and per-branch throws in `extractParamName` / the optional fork. These collapse into a single `parseSegment` pass in `registerNode` — the SAME tokenizer the validation-plugin gate reads — so the backstop and the gate can no longer drift on any per-segment grammar form (name-less, fused marker, trailing marker, optional splat, empty / fused-suffix / constraint-in-static). The one whole-path check a per-segment scan cannot make — an unbalanced or stray `<`/`>` — stays as `isConstraintBalanced`.

  The set of accepted vs rejected route paths is unchanged (verified path-by-path across the grammar), and every accepted route's params / match / buildPath is byte-identical. What changes is the error MESSAGE on some malformed paths: because the tokenizer decides per segment left-to-right, an empty constraint filling a static segment (`/foo<>`) now reports `Constraint '<...>' in a static segment` instead of `Empty constraint`, and a path with multiple grammar errors reports the first by left-to-right scan rather than the old guard order. Only code that registers a malformed route and asserts the exact rejection message is affected.

### Patch Changes

- [#1332](https://github.com/greydragon888/real-router/pull/1332) [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33) Thanks [@greydragon888](https://github.com/greydragon888)! - Surface an invalid-regex constraint body through the validation gate's route-contextual error ([#1324](https://github.com/greydragon888/real-router/issues/1324))

  The invalid-constraint-body fix made `buildParamMeta` reject a body that is not a valid regular expression (`/:id<*x>`, `/:id<(>`, `/:id<[>`) with a plain `Error` instead of a raw V8 `SyntaxError`. But route-tree's validation gate (`validateRoutePath`, used by `@real-router/validation-plugin`) calls `buildParamMeta` early, so that plain `Error` leaked straight through the gate — the one malformed-path class that escaped the gate's contract, where every other reject throws a route-contextual `TypeError` (`[router.add] Invalid path for route "x": …`). The gate now wraps the `buildParamMeta` call, so an invalid-regex constraint body surfaces as the same route-contextual `TypeError` as every other malformed path, carrying the route name and method. A valid body (`<\d+>`, `<[a-z]+>`) is unaffected.

- [#1332](https://github.com/greydragon888/real-router/pull/1332) [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject an invalid `<...>` constraint body with a clear error instead of a raw RegExp crash ([#1324](https://github.com/greydragon888/real-router/issues/1324))

  A route whose constraint body is not a valid regular expression — `/:id<*x>`, `/:id<(>`, `/:id<[>` — previously crashed with a raw V8 `SyntaxError` ("Invalid regular expression: /^(*x)$/: Nothing to repeat") thrown deep inside route-tree building or the validation gate (both compile the constraint through `buildParamMeta`). It now fails fast at the single compile site with a clear `[buildParamMeta] Invalid constraint '<*x>' on parameter 'id': the body between '<' and '>' must be a valid regular expression …` message. A valid body (`<\d+>`, `<[a-z]+>`) is unaffected. Pre-existing, independent of the parse-segment tokenizer work.

- [#1332](https://github.com/greydragon888/real-router/pull/1332) [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33) Thanks [@greydragon888](https://github.com/greydragon888)! - Route build-path compilation now derives its param slots from the shared `parseSegment` tokenizer ([#1324](https://github.com/greydragon888/real-router/issues/1324))

  `compileBuildParts` (the L2 build layer) previously ran its own `paramRgx` to pull param names and optional markers out of a route path — the last layer still parsing the path grammar in parallel with the trie (L3), `buildParamMeta` (L1), and the validation gate (L4). It now walks the path through the same `parseSegment` tokenizer those layers use, so build's param name can no longer drift from the trie's: the `build ≠ match` class ([#1050](https://github.com/greydragon888/real-router/issues/1050)/[#1150](https://github.com/greydragon888/real-router/issues/1150)) is closed structurally, not merely caught after the fact by the inverse-pair round-trip property. Behavior-preserving — `buildPath` output is byte-identical for every accepted route, with one benign exception: the degenerate `/:a??` (an optional param immediately followed by an empty query separator) now builds `/v0` instead of `/v0?`, dropping a spurious trailing `?`. Both forms round-trip (the empty query is stripped on match), so matching is unaffected and `/v0` is the cleaner output. Malformed paths remain rejected downstream at `registerTree` exactly as before.

## 0.71.0

### Minor Changes

- [#1329](https://github.com/greydragon888/real-router/pull/1329) [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2) Thanks [@greydragon888](https://github.com/greydragon888)! - search-params: fail fast on an unknown query-params format ([#1318](https://github.com/greydragon888/real-router/issues/1318)).

  A JS consumer passing a typo'd `queryParams` format (`arrayFormat: "bracket"` instead of `"brackets"`, `booleanFormat: "empty_true"` instead of `"empty-true"`, …) previously indexed the strategy map to `undefined`, deferring a cryptic `TypeError` to first encode/decode — which the router's `SegmentMatcher.#mergeQueryParams` catch-all then masked as `UNKNOWN_ROUTE` for **every** query URL, with zero diagnostics. `resolveStrategies` now throws a named `TypeError` at options-resolution time, naming the bad field, its value, and the allowed set. TS consumers are unaffected (the union types already forbid the typo).

### Patch Changes

- [#1329](https://github.com/greydragon888/real-router/pull/1329) [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2) Thanks [@greydragon888](https://github.com/greydragon888)! - search-params: type-doc sync and an index-scalar behavior lock ([#1319](https://github.com/greydragon888/real-router/issues/1319)).

  No runtime change. The `numberFormat: "auto"` JSDoc on `NumberFormat` (shipped in the `.d.ts`) now notes that `-0` is rejected — the grammar regex matches it, but an `Object.is` guard keeps it a string so `parse(build(x)) === x` holds ([#898](https://github.com/greydragon888/real-router/issues/898)). Internal docs corrected alongside: ARCHITECTURE cited `parse()` where `route-tree` injects `parseQuery` ([#1292](https://github.com/greydragon888/real-router/issues/1292)), and INVARIANT [#17](https://github.com/greydragon888/real-router/issues/17) + a functional test now lock that an indexed group displaces a bare scalar for the same key (`parse("a=1&a[0]=x", { arrayFormat: "index" })` → `{ a: ["x"] }`).

## 0.70.2

### Patch Changes

- [#1327](https://github.com/greydragon888/real-router/pull/1327) [`9ad2d55`](https://github.com/greydragon888/real-router/commit/9ad2d551d868344a1b5cdf4afedb9198bc825715) Thanks [@greydragon888](https://github.com/greydragon888)! - Totalize URL encoding on lone surrogates + fix quadratic key-only query parse ([#1314](https://github.com/greydragon888/real-router/issues/1314) [#1315](https://github.com/greydragon888/real-router/issues/1315) [#1316](https://github.com/greydragon888/real-router/issues/1316)).

  `build` / `buildPath` no longer throw `URIError` on a lone (unpaired) UTF-16 surrogate — a value `parse` / `match` accept but `encodeURIComponent` rejects (e.g. user text sliced on an emoji surrogate-pair boundary, or a programmatically built URL). Both `search-params` (`safeEncode`, single-sourced across the scalar and array-element encode sites) and `path-matcher` (all three encoding modes: `default` / `uri` / `uriComponent`) now sanitize it to U+FFFD via `toWellFormed`, keeping `range(parse) ⊆ dom(build)` total. Consequently `start()` no longer stores a state whose later `buildPath` throws (the poisoned-state path), and `navigate()` with such user text resolves instead of rejecting. The sanitize is lossy on that already non-round-trippable input — the surrogate becomes `�` on the first round-trip, then stable — documented like the `-0` loss.

  Also: `parse` is now O(n) on key-only query chunks (`?a&a&…`) — the per-chunk `indexOf("=")` no longer rescans to the end of the string (was O(n²) on a forgeable URL, [#1316](https://github.com/greydragon888/real-router/issues/1316)). The over-encoded number/boolean coercion asymmetry (`?a=4%32` → number `42`, `?a=%74rue` → string `"true"`) is now locked and documented as an intentional raw-vs-decoded contract ([#1317](https://github.com/greydragon888/real-router/issues/1317)), not changed.

## 0.70.1

### Patch Changes

- [#1322](https://github.com/greydragon888/real-router/pull/1322) [`744280a`](https://github.com/greydragon888/real-router/commit/744280a8850bd76246929131d750699d8d6cfd88) Thanks [@greydragon888](https://github.com/greydragon888)! - Single-source `hasFusedConstraintSuffix` + `INVALID_QUERY_NAME_RGX` in path-matcher's `constraint-grammar.ts` ([#1320](https://github.com/greydragon888/real-router/issues/1320) Tier 1). The route-tree `validateRoutePath` gate and the path-matcher `registerTree` backstop previously each carried a byte-identical copy of the fused-constraint-suffix char-scan (a jscpd clone) and the invalid-query-name regex; both now import the one definition (like `isConstraintBalanced` / `hasConstraintInStaticSegment`), so the gate and backstop can't drift. No behaviour change; each layer keeps its own throw/message.

## 0.70.0

### Minor Changes

- [#1313](https://github.com/greydragon888/real-router/pull/1313) [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject a `<...>` constraint in a clean static segment ([#1311](https://github.com/greydragon888/real-router/issues/1311)). `/foo<bar>` / `/a<b>` — a constraint filling a STATIC segment (no `:`/`*` marker) — was silently stripped to `/foo` / `/a` at registration, reshaping the route with no signal ([#1150](https://github.com/greydragon888/real-router/issues/1150) caught only a constraint fused with TRAILING text, e.g. `/:id<\d+>x`; one cleanly ending a static segment slipped through). Now rejected at the route-tree validation gate (route-contextual message) + the path-matcher `registerTree` backstop — the sibling of [#1050](https://github.com/greydragon888/real-router/issues/1050) / [#1150](https://github.com/greydragon888/real-router/issues/1150) on the static-segment axis. A constraint on a param (`/:id<\d+>`) is unaffected.

### Patch Changes

- [#1313](https://github.com/greydragon888/real-router/pull/1313) [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the write-only `depth` field from path-matcher's `CompiledRoute` ([#1310](https://github.com/greydragon888/real-router/issues/1310)). It was assigned at registration but never read on any production path — only a unit test pinned the dead value. Internal cleanup, no behaviour change.

## 0.69.0

### Minor Changes

- [#1308](https://github.com/greydragon888/real-router/pull/1308) [`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3) Thanks [@greydragon888](https://github.com/greydragon888)! - Wire opt-in case-insensitive routing via `caseSensitive` ([#1303](https://github.com/greydragon888/real-router/issues/1303))

  The engine already implemented `caseSensitive` end-to-end, but the option was severed at the core seam — `Options` had no field and `deriveMatcherOptions` never mapped it, so `createRouter({ caseSensitive: false })` was silently ignored. `caseSensitive` is now a public router option, mapped through to the matcher. **Default stays `true` (case-sensitive, spec-correct per RFC 3986 §6.2.2.1)** — case-insensitive is an explicit opt-in (`caseSensitive: false`) for server-less / hash / static-hosted / legacy routing. Only static literal segments are compared case-insensitively; dynamic param values keep their case. Note the divergence from React Router v7 / TanStack / vue-router, which default to case-insensitive.

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/types@0.39.0

## 0.68.2

### Patch Changes

- [#1306](https://github.com/greydragon888/real-router/pull/1306) [`7680079`](https://github.com/greydragon888/real-router/commit/768007933af11f52af233ee9df14ed970a767e89) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove core-unreachable API ([#1302](https://github.com/greydragon888/real-router/issues/1302)): `createRouteTree` now inlines the former standalone `createRouteTreeBuilder` (removed) and always freezes — the `skipFreeze` `TreeBuildOptions` is gone and `computeCaches` loses its `freeze` param. Also drops the phantom option types `MatchOptions` / `BuildOptions` / `BasePathOptions` / `TrailingSlashMode` (+ orphaned `QueryParamsMode`), which described options that were never implemented. Deliberate surface reduction of this private package.

- [#1306](https://github.com/greydragon888/real-router/pull/1306) [`7680079`](https://github.com/greydragon888/real-router/commit/768007933af11f52af233ee9df14ed970a767e89) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `omit()` / `keep()` (+ private helpers and `OmitResponse` / `KeepResponse` types) — API unreachable from `@real-router/core` ([#1302](https://github.com/greydragon888/real-router/issues/1302)). Deliberate surface reduction of this private package; the functions were tested but had no core consumer.

## 0.68.1

### Patch Changes

- [#1304](https://github.com/greydragon888/real-router/pull/1304) [`2b63604`](https://github.com/greydragon888/real-router/commit/2b636041aa136f4e4e36bda88cb1c7ad8bc33cee) Thanks [@greydragon888](https://github.com/greydragon888)! - Re-export `validateRoute` (+ `Matcher` / `RouteTree` types) from the `@real-router/core/validation` subpath ([#1301](https://github.com/greydragon888/real-router/issues/1301))

  So `@real-router/validation-plugin` reaches the batch route validator through core instead of importing the utils `route-tree` package directly — keeping core the sole consumer of the routing engine. Plumbing on the plugin-facing subpath (off the main public index); no runtime behaviour change.

## 0.68.0

### Minor Changes

- [#1299](https://github.com/greydragon888/real-router/pull/1299) [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject an index child under a MID-PATH optional parent ([#1294](https://github.com/greydragon888/real-router/issues/1294))

  The [#1242](https://github.com/greydragon888/real-router/issues/1242) §5.4 gate rejected an index route (`path: "/"`) under a parent whose LAST segment is an optional param or splat, but checked only that last segment — so a parent with an optional param in a MID-path position (`/a/:b?/c`) registered silently while the index bound only the take form (`/a/x/c/` → index, `/a/c/` → parent). The gate now rejects an optional param in ANY position of the parent path, matching the form-consistency it already promised. A required-param parent (`/users/:id`, `/a/:b/c`) has a single form and stays allowed. Follow-up of [#1242](https://github.com/greydragon888/real-router/issues/1242) §5.4.

### Patch Changes

- [#1299](https://github.com/greydragon888/real-router/pull/1299) [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep a "**proto**" query key as an own param ([#1293](https://github.com/greydragon888/real-router/issues/1293))

  search-params materializes a literal "**proto**" query key as a real own property ([#855](https://github.com/greydragon888/real-router/issues/855)), but `SegmentMatcher.#mergeQueryParams` folded the parsed query into the params accumulator with a plain `params[key] = …` assign — which for the literal key "**proto**" invokes the inherited setter and silently drops the param one layer up (a string value vanishes; an array value swaps the local prototype). The merge now writes each key with `Object.defineProperty`, so a legal (if exotic) "**proto**" query param survives. No prototype pollution either way.

- [#1299](https://github.com/greydragon888/real-router/pull/1299) [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep a legal "?" inside a query value ([#1292](https://github.com/greydragon888/real-router/issues/1292))

  `SegmentMatcher` already splits the URL at the first "?" before handing the query substring to the search-params parser, but `parse()` re-ran `getSearch()` and split it again — so a "?" inside a query value (legal per RFC 3986) silently dropped the parameter, and under `queryParamsMode: "strict"` unmatched the whole URL (`matchPath("/r?x=a?b")` → `{ b: null }`; strict `matchPath("/s?q=a?b")` → `undefined`). search-params now exposes `parseQuery` (parse an already-extracted query, without `getSearch`), and route-tree's matcher wires that into the DI — so the URL is split exactly once and the value keeps its "?".

## 0.67.1

### Patch Changes

- [#1297](https://github.com/greydragon888/real-router/pull/1297) [`686a894`](https://github.com/greydragon888/real-router/commit/686a8942d427af8238956c78203f906124502fa4) Thanks [@greydragon888](https://github.com/greydragon888)! - Resolve param+splat junctions by a validated sub-traverse ([#1288](https://github.com/greydragon888/real-router/issues/1288))

  At a trie node carrying both a param child and a splat sibling, `match` no longer commits to the param branch on the strength of the current segment alone. The branch is tried on a scratch traversal and commits only when it structurally completes AND the reached route's constraints hold on the decoded scratch values; otherwise the splat sibling captures the remainder. One uniform rule — "param wins if its branch can complete" — replaces the former per-signal carve-outs and closes the remaining dead-deep-link family:

  - a branch that dead-ends BELOW the junction now falls to the catch-all (`/*rest` + `/:v<v\d+>/edit` on `/v1/nope` was UNMATCH while `buildPath` emitted it);
  - a constraint failing DEEPER in the branch now falls back too (`/*rest` + `/:v<v\d+>/:id<\d+>` on `/v1/abc`), including the multi-constraint slot where the disjunction passes but the reached route's own constraint fails (`/user/abc/a`);
  - an UNCONSTRAINED param with a splat sibling — the former documented greedy carve-out — now also falls back when its branch cannot complete (`/user/:id/profile` + `/user/*rest` on `/user/x/settings`);
  - the splat's specific-child candidate (`INVARIANTS` Matching [#24](https://github.com/greydragon888/real-router/issues/24)) is constraint-validated before committing: `/files/*any` + child `/:id<\d+>` on `/files/xx` fell nowhere (the child won structurally, its constraint then killed the whole match) — it now falls back to the wildcard capture.

  A completing take stays present-first, so every previously-matching URL keeps its exact result; the change is strictly match-widening. Nested junctions stay polynomial (a 32-level chain ≈ 85 µs, failures fall back locally — no cascades), and non-junction param hops never enter the new code path.

  Closes [#1288](https://github.com/greydragon888/real-router/issues/1288)

## 0.67.0

### Minor Changes

- [#1295](https://github.com/greydragon888/real-router/pull/1295) [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject two optional params directly before a splat ([#1287](https://github.com/greydragon888/real-router/issues/1287))

  Two constrained optionals directly before a splat (`/:a<c1>?/:b<c2>?/*rest`) registered silently, but a single trie slot carries only one optional→splat fork — the outer optional's mark overwrote the inner's, so the omit-outer/take-inner form silently reshaped into the splat (`/ab/x` → `{ rest: "ab/x" }` instead of `{ b: "ab", rest: "x" }`), a `range(buildPath) ⊄ dom(match)` desync with no error. `registerTree` now rejects the shape; split into separate routes or drop the `?` on one. A single constrained optional→splat ([#1264](https://github.com/greydragon888/real-router/issues/1264) A1) and two optionals before a non-splat tail are unaffected.

### Patch Changes

- [#1295](https://github.com/greydragon888/real-router/pull/1295) [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a same-name constrained sibling dying under a splat sibling ([#1284](https://github.com/greydragon888/real-router/issues/1284))

  [#1266](https://github.com/greydragon888/real-router/issues/1266) marked every constrained required param with `fork.constraint ??= <pattern>` — the constraint of the FIRST-registered route owning the trie slot. When a splat sibling was present, `match` used that single pattern as the slot-wide validity signal, so a value matching a LATER route's constraint failed the fork and fell to the catch-all — silently killing that route, registration-order dependent (`/user/:id<\d+>/a` + `/user/:id<[a-f]+>/b` + `/user/*rest` → `/user/abc/b` went to the catch-all). The fork now carries the DISJUNCTION of all constraints on the slot (composite of the anchored sources, one `.test`); `match` skips to the splat only when EVERY constraint fails, and post-traverse per-route validation still filters the correct winner.

- [#1295](https://github.com/greydragon888/real-router/pull/1295) [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a try-take-if-valid fork dead-ending on the last segment ([#1283](https://github.com/greydragon888/real-router/issues/1283))

  The A1 ([#1264](https://github.com/greydragon888/real-router/issues/1264)) / required-param ([#1266](https://github.com/greydragon888/real-router/issues/1266)) try-take-if-valid fork skipped to the splat sibling only when the constraint FAILED. A constraint-SATISFYING segment that is also the LAST one, whose take-node is a dead terminal (no route, only a would-be-empty splat child), committed into a dead end — `match("/v1")` returned `undefined` for `/:v<v\d+>?/*rest` (and for `/*rest` + `/:v<v\d+>/*rest`) while `buildPath` emitted `/v1`, a dead deep-link (the exact `range(buildPath) ⊄ dom(match)` class the fork was built to close). `match` now also skips to the splat when the take would dead-end on the last segment; a take-node with a terminal route still takes (present-first preserved).

- [#1295](https://github.com/greydragon888/real-router/pull/1295) [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3) Thanks [@greydragon888](https://github.com/greydragon888)! - Restore registerTree throughput after the [#1263](https://github.com/greydragon888/real-router/issues/1263)/[#1264](https://github.com/greydragon888/real-router/issues/1264)/[#1266](https://github.com/greydragon888/real-router/issues/1266) batch ([#1285](https://github.com/greydragon888/real-router/issues/1285))

  That batch added two per-segment costs to every registered route: `markConstrainedParamFork` ran an `extractParamName` regex on every param segment, and `hasNonAsciiSegment` iterated code points (for-of) on every static segment — a stable +5–10% on `registerTree`, which is ~58% of the per-request SSR `cloneRouter` tax. `markConstrainedParamFork` now short-circuits on `!hasConstraints` (the common unconstrained route) before the regex, and `hasNonAsciiSegment` uses a `charCodeAt` index loop (identical result — a surrogate is itself ≥ 0x80). Behaviour-identical; measured back to parity with the pre-batch baseline.

## 0.66.1

### Patch Changes

- [#1280](https://github.com/greydragon888/real-router/pull/1280) [`eec6f8d`](https://github.com/greydragon888/real-router/commit/eec6f8dbd98f2d690c91ef09eff81044de1bf783) Thanks [@greydragon888](https://github.com/greydragon888)! - Make a `/*rest` catch-all reachable next to a constrained `/:v<c>/*rest` sibling ([#1266](https://github.com/greydragon888/real-router/issues/1266))

  Two plain routes — a `/*rest` catch-all and a constrained `/:v<v\d+>/*rest` sibling — left the catch-all entirely unreachable: any URL whose first segment failed the constraint (`/users`, `/a/b`) entered the `:v` param branch and died there (the constraint is validated only after the full traverse, with no backtrack) instead of falling back to the splat sibling. `buildPath("all", …)` then emitted URLs its own `match` rejected — dead deep-links. No `optional` param anywhere.

  `match` now applies the same _try-take-if-valid_ mechanism it already used for the constrained-optional→splat fork ([#1264](https://github.com/greydragon888/real-router/issues/1264)) to a constrained **required** param that shares its trie level with a splat sibling (`markConstrainedParamFork`): when the first segment fails the constraint on its decoded value, the splat sibling captures it. Registration-order independent; the versioned form (`/v1/users`) still resolves to the constrained param. This generalizes the [#1263](https://github.com/greydragon888/real-router/issues/1263)/[#1264](https://github.com/greydragon888/real-router/issues/1264) root — "a param greedily commits before a splat sibling without a validity-driven fallback."

## 0.66.0

### Minor Changes

- [#1278](https://github.com/greydragon888/real-router/pull/1278) [`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject three more malformed route configs at registration ([#1242](https://github.com/greydragon888/real-router/issues/1242))

  The wave-3 registration-hardening batch — malformed configs that registered silently but produced dead or aliased routes now throw with a route-contextual message, like the [#858](https://github.com/greydragon888/real-router/issues/858)/[#1050](https://github.com/greydragon888/real-router/issues/1050)/[#1150](https://github.com/greydragon888/real-router/issues/1150)/[#1151](https://github.com/greydragon888/real-router/issues/1151)/[#1154](https://github.com/greydragon888/real-router/issues/1154) rejects:

  - A **query-param name that leaked a constraint** via a reverse-order modifier typo (`/a/:b?<\d+>` — the `?` parses as the query start, so `<\d+>` becomes the query name) (§5.1).
  - A **path-param ↔ query-param name collision** (`/a/:tab?tab`), where `buildPath` emitted the value twice (`/a/x?tab=x`) (§5.3).
  - An **index route (`path: "/"`) under an optional-param or splat parent** (`/a/:b?`, `/files/*rest`), which was unreachable or inconsistent. A required-param parent's index is unaffected (§5.4).

  Two findings were resolved without a behaviour change: `<…>` in a static segment (§5.5) is already caught by [#1150](https://github.com/greydragon888/real-router/issues/1150), and `?name=value` in a route definition (§5.2) is left tolerated — bare core accepts it and it never declared a default — both documented.

## 0.65.1

### Patch Changes

- [#1271](https://github.com/greydragon888/real-router/pull/1271) [`3b6b14d`](https://github.com/greydragon888/real-router/commit/3b6b14df51825bb36d897a005b212475dcc595e3) Thanks [@greydragon888](https://github.com/greydragon888)! - Clearer rejection message for a name-less parameter marker or modifier ([#1241](https://github.com/greydragon888/real-router/issues/1241))

  Registering a static segment with a trailing `?` (`/faq?`) — which the optional fork routes through the same name-less check as a bare `:`/`*` — threw `Empty parameter name: a bare ':' marker …`, naming a `:` the segment does not contain. The message is now marker-agnostic (`a parameter marker (':' or '*') or an optional '?' must be followed by a name …`), so it is accurate for the bare `:`/`*`, the modifier-only (`:?`, `:<\d+>`), and the trailing-`?`-on-static cases alike. The rejection itself is unchanged.

## 0.65.0

### Minor Changes

- [#1269](https://github.com/greydragon888/real-router/pull/1269) [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject two routes that compile to the same effective path at registration ([#1153](https://github.com/greydragon888/real-router/issues/1153))

  Two routes resolving to the same URL — a flat `/a/b` and a nested `a` → `b`, trailing-slash variants `/x` and `/x/`, or two routes both at `/` — silently shadowed each other: the later's full insertion overwrote the earlier's trie terminal, so the shadowed route stayed alive by name but its deep link resolved to the wrong route (`buildPath(first)` then emitted a URL matching the second). The existing sibling-path duplicate gate compared only raw path strings among direct siblings, so it never saw collisions that materialize only in the compiled trie. Registration now throws `Duplicate route path`: a STRONG (full-insertion) terminal write rejects a second strong write by a different route, while a WEAK (optional-omit fallback) owner is legitimately displaced and a same-route revisit is idempotent — neither throws.

- [#1269](https://github.com/greydragon888/real-router/pull/1269) [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject a duplicate param name within one route at registration ([#1151](https://github.com/greydragon888/real-router/issues/1151))

  `/:id/:id` (the same name twice), a param+splat clash `/:x/*x`, or a parent's param reused by a child bound two trie positions under **one** name: at match time the later capture silently overwrote the earlier, and `rewritePathOnMatch` then rewrote the user's URL from the single survivor (`/1/2` → `/2/2`, with no error). The [#736](https://github.com/greydragon888/real-router/issues/736) conflict guard only fires on _differently_-named params at one position, so this same-name case slipped through. Registration now throws `Duplicate parameter name`. route-tree's gate catches the same-route case (`@real-router/validation-plugin`'s `addRoute` too) with a route-contextual message; path-matcher's `registerTree` backstop additionally catches the cross-level case.

- [#1269](https://github.com/greydragon888/real-router/pull/1269) [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject static text fused to a constraint at registration instead of shipping a silent dead route ([#1150](https://github.com/greydragon888/real-router/issues/1150))

  A `:name<…>` constraint immediately followed by static text in the same segment — `/:year<\d+>-archive`, `/post/:id<\d+>.html` — passed every gate but compiled to an unreachable route: `buildPath` threw `Missing required param` and `match` returned `undefined`. The build side re-extracts the param name greedily and fused the post-`>` text onto it (name `year-archive`), desyncing from meta (name `year`). Registration now throws with a hint (`use "/:id<...>/rest", not "/:id<...>rest"`) — the mirror of the fused-marker ([#1050](https://github.com/greydragon888/real-router/issues/1050)) / optional-splat ([#1149](https://github.com/greydragon888/real-router/issues/1149)) rejections, on the other side of the param. `@real-router/validation-plugin`'s `addRoute` rejects it too, with a route-contextual message.

- [#1269](https://github.com/greydragon888/real-router/pull/1269) [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject a non-ASCII static segment at registration instead of shipping a dead route ([#1154](https://github.com/greydragon888/real-router/issues/1154))

  A raw non-ASCII static segment — `/café`, `/меню`, `/新闻` — registered but could never match: `match` rejects any non-ASCII input byte (its single-pass scanner) and compares static trie keys raw (never percent-decoded), so `buildPath` emitted `/café` — a URL its own `match` rejects. Registration now throws with the workaround (`percent-encode it, e.g. "/caf%C3%A9", or use a param`); the percent-encoded form already works today. A non-ASCII **param name** or **constraint body** (`:id<[а-я]+>`, matched against the _decoded_ value) is unaffected — only static text is compared raw. `@real-router/validation-plugin`'s `addRoute` rejects it too, with a route-contextual message.

## 0.64.0

### Minor Changes

- [#1267](https://github.com/greydragon888/real-router/pull/1267) [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8) Thanks [@greydragon888](https://github.com/greydragon888)! - Match an optional param directly followed by a required param ([#1263](https://github.com/greydragon888/real-router/issues/1263))

  `/:a?/:b` bound a single-segment URL under the optional's name (`match("/x")` → `{ a: "x" }`) instead of the successor's (`{ b: "x" }`), and `/:a<\d+>?/:b` was unmatchable when the optional was omitted — `buildPath` emitted a dead deep-link. The omit form is now disambiguated by segment count: because it is one segment shorter, on the LAST segment the optional is omitted and the segment binds under the successor's name. The optional's own constraint is validated only when it is present (≥2 segments). Consecutive optionals (`/:a?/:b?/…`) are unchanged.

- [#1267](https://github.com/greydragon888/real-router/pull/1267) [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8) Thanks [@greydragon888](https://github.com/greydragon888)! - Support a constrained optional before a splat; reject the unconstrained form ([#1264](https://github.com/greydragon888/real-router/issues/1264))

  `/:v<c>?/*rest` — a constrained optional before a splat, e.g. a versioned-API (`/:v<v\d+>?/*rest`) or preview-mode (`/:mode<(preview|draft)>?/*path`) prefix — was unmatchable when the optional was omitted (`buildPath` emitted a dead deep-link). It now matches via try-take-if-valid: the segment is taken as the optional only if its **decoded** value satisfies the constraint (so `/%76%31/users` → `{ v: "v1" }`), otherwise the splat captures it.

  An **unconstrained** optional before a splat (`/:v?/*rest`) is now rejected at registration with a hint to add a constraint. Without one there is no signal to disambiguate "take the optional" from "let the splat capture", so every multi-segment value has two readings and matching would silently reshape half the input space. Add a constraint (`:v<…>?`) or model it as two routes.

## 0.63.3

### Patch Changes

- [#1262](https://github.com/greydragon888/real-router/pull/1262) [`d431c3e`](https://github.com/greydragon888/real-router/commit/d431c3ec9bfb326b537dfcacfeeedaf0c9fba196) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `buildPath` emitting `//…` when a leading optional param is omitted ([#1147](https://github.com/greydragon888/real-router/issues/1147))

  For a route whose FIRST segment is an optional param (`/:lang?/home` — the optional-locale-prefix pattern), omitting it made `#buildUrlPath` produce `//home`: the trailing-slash trim only fired for `result.length > 1`, so the lone leading `/` was never trimmed before appending the next `/`-prefixed part. That URL is one the matcher itself rejects (double slash), and `rewritePathOnMatch` then wrote the unmatchable `//home` into `state.path`, silently replacing a valid input URL with an invalid one.

  Fix: at an optional-omit point the leading-slash case (`result === "/"`) now drops the lone slash when the next part starts with `/`, so exactly one separator is emitted (`/home`). Mid/trailing optional omits (`/a/:b?/c` → `/a/c`, `/home/:x?` → `/home`) and a route that is only a leading optional (`/:lang?` → `/`) are unchanged.

- [#1262](https://github.com/greydragon888/real-router/pull/1262) [`d431c3e`](https://github.com/greydragon888/real-router/commit/d431c3ec9bfb326b537dfcacfeeedaf0c9fba196) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix constraint on an omitted optional param being tested against `undefined` ([#1148](https://github.com/greydragon888/real-router/issues/1148))

  `route.constraintPatterns` is collected across all segments, including optional params. On the omit branch the param is never captured, so `#validateConstraints` ran `constraint.pattern.test(params[paramName])` with `params[paramName] === undefined` → coerced to the string `"undefined"`. Whether the omit form of the route matched then depended on whether the constraint regex happened to match `"undefined"`: `/search/:query<\d+>?` matching `/search` returned `undefined` (unroutable), while `<\w+>?` matched by accident.

  Fix: `#validateConstraints` now skips a constraint when its param is absent from `params` (`Object.hasOwn`), so an omitted optional is not constraint-checked — symmetric with the build side (`#validateBuildConstraints` already skipped absent params). The constraint still applies when the param is present.

- [#1262](https://github.com/greydragon888/real-router/pull/1262) [`d431c3e`](https://github.com/greydragon888/real-router/commit/d431c3ec9bfb326b537dfcacfeeedaf0c9fba196) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject optional splat `*name?` at registration instead of silently building unmatchable URLs ([#1149](https://github.com/greydragon888/real-router/issues/1149))

  `*path?` (optional splat) desynced three ways: `buildParamMeta`/`compileBuildParts` classified it as a splat (multi-segment, `/`-preserving encoder) while the trie's optional fork compiled a plain single-segment param. `buildPath({ path: "a/b" })` emitted `/files/a/b`, which `match()` rejected — a deep-link to a router-built URL was dead (`UNKNOWN_ROUTE`), and navigate-then-reload diverged. The exact class of [#858](https://github.com/greydragon888/real-router/issues/858) (name-less marker) / [#1050](https://github.com/greydragon888/real-router/issues/1050) (fused marker).

  Fix (product decision — reject, not support): the shape only ever "worked" for 0–1 segments, so it is rejected at registration like its [#858](https://github.com/greydragon888/real-router/issues/858)/[#1050](https://github.com/greydragon888/real-router/issues/1050) siblings. `path-matcher`'s `registerTree` throws `Optional splat … is not supported` (the bare-core backstop, covering `createRouter`), and `route-tree`'s validation gate throws a route-contextual `optional splat ('*name?') is not supported …` first on the plugin `add`/`replace` paths. A required splat `*name` (incl. `*path?query`, where `?` is the query separator) is unaffected.

## 0.63.2

### Patch Changes

- [#1245](https://github.com/greydragon888/real-router/pull/1245) [`5953297`](https://github.com/greydragon888/real-router/commit/59532971e86a695d292f216974e1c08410034adf) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden `matchPath`: a throw from the post-match path rewrite no longer escapes as a crash ([#1157](https://github.com/greydragon888/real-router/issues/1157))

  `matchPath` rebuilds `state.path` after a successful match (`rewritePathOnMatch`, on by default) via `buildPath` → the query codec. A throw there — e.g. a custom `encodeParams` handing the codec an unserialisable value — propagated as a raw `TypeError` out of `matchPath`, crashing `router.start()` / `navigate()` on a forgeable URL (the concrete [#1155](https://github.com/greydragon888/real-router/issues/1155) trigger; this is the defense-in-depth companion).

  Fix: the rewrite is wrapped so a throw keeps the source path un-rewritten — the match already succeeded (route found, params decoded), only the cosmetic re-canonicalisation failed, so a valid match is preserved instead of discarded. This is the opposite policy to the parse side ([#737](https://github.com/greydragon888/real-router/issues/737), "match() must never throw → treat URL as unmatched"): there a throw means the URL can't be understood; here it was understood and matched. A `decodeParams` throw (which runs while producing the state, before the match is finalized) still propagates, unchanged.

- [#1245](https://github.com/greydragon888/real-router/pull/1245) [`5953297`](https://github.com/greydragon888/real-router/commit/59532971e86a695d292f216974e1c08410034adf) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `search-params` `parse`→`build` inverse-pair crash: null array elements now round-trip instead of throwing ([#1155](https://github.com/greydragon888/real-router/issues/1155))

  `parse` produced `null` array elements (a key-only chunk on a repeated/bracketed key: `parse("a&a=1")` → `{a:[null,1]}`) that `build`'s `encodeArray` rejected with a raw `TypeError`. Because core glues `parse`→`build` on every match (`rewritePathOnMatch` + `queryParamsMode: "loose"`), an external URL like `/x?a&a=1` crashed `router.start()` with an unhandled `TypeError` (SSR 500, single-request, unauthenticated).

  Fix (encode side — close the domains): a `null` array element now encodes to the same wire token a scalar null does, per array format — the bare key under `nullFormat: "default"` (`none`→`name`, `brackets`→`name[]`, `index`→`name[i]`), dropped under `nullFormat: "hidden"`. `comma` has no per-element bare form, so a null element (reachable only via a bracketed chunk under comma config) is dropped. `range(parse) ⊆ dom(build)` now holds.

  The blind zone that let three audit waves + [#1037](https://github.com/greydragon888/real-router/issues/1037) miss this is closed by construction: a new grammar-first property (`tests/property/inversePair.properties.ts`) generates query strings from the wire grammar (key-only / repeats / brackets / empty chunks), not from `build`, and asserts `build(parse(qs))` never throws over the full option matrix.

- [#1245](https://github.com/greydragon888/real-router/pull/1245) [`5953297`](https://github.com/greydragon888/real-router/commit/59532971e86a695d292f216974e1c08410034adf) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `search-params` `parse` injecting a junk `""` param from empty query chunks ([#1156](https://github.com/greydragon888/real-router/issues/1156))

  An empty chunk — a `&&`, a leading `&`, or a trailing `&` — was parsed as an empty name with a missing value, injecting `{ "": null }` (and `[null, …]` on repeats): `parse("&a=1")` → `{ "": null, a: "1" }`, `parse("x=1&&&x=2")` → `{ "": [null, null], x: [1, 2] }`.

  Fix: empty chunks (a zero-length span) are skipped in `parseIntoInternal`. An intentional empty-key chunk still carries an `=` (`parse("=1")` → `{ "": "1" }`), so its span is non-empty and it is unaffected.

## 0.63.1

### Patch Changes

- [`6926d4f`](https://github.com/greydragon888/real-router/commit/6926d4fb4453aeb0d884f9683e3e56441050f200) Thanks [@greydragon888](https://github.com/greydragon888)! - Sync INVARIANTS.md with the shipped behavior and fix the stale FAST PATH 3 comment ([#1173](https://github.com/greydragon888/real-router/issues/1173))

  Documentation/tests only — no behavior change:

  - INVARIANTS.md Router Lifecycle [#7](https://github.com/greydragon888/real-router/issues/7): "all 8 mutating methods" → 9 (`subscribeLeave` was added by [#946](https://github.com/greydragon888/real-router/issues/946)); the property test's `blockedMethods` list now includes it too.
  - INVARIANTS.md errorCodes [#1](https://github.com/greydragon888/real-router/issues/1): "all 11 required keys" → 14 (`CONTEXT_NAMESPACE_ALREADY_CLAIMED`, `REENTRANT_NAVIGATION`, `REENTRANT_TREE_MUTATION`).
  - INVARIANTS.md subscribeChanges [#3](https://github.com/greydragon888/real-router/issues/3): documented the dispose-mid-dispatch carve-out (a handler that disposes the router is not a CRUD op, so the [#1032](https://github.com/greydragon888/real-router/issues/1032) reentrancy ban does not apply — later handlers of the same emit observe the torn-down tree) + a pinning test.
  - `transitionPath.ts` FAST PATH 3 comment: dropped the closed-[#970](https://github.com/greydragon888/real-router/issues/970) `canNavigateTo` paragraph (it builds its toState WITH meta since [#970](https://github.com/greydragon888/real-router/issues/970)) and named the real meta-less producers (`navigateToState` / `replace()` revalidation, tracked as [#1170](https://github.com/greydragon888/real-router/issues/1170)).

## 0.63.0

### Minor Changes

- [#1122](https://github.com/greydragon888/real-router/pull/1122) [`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject unbalanced and empty `<>` constraint delimiters at route registration ([#804](https://github.com/greydragon888/real-router/issues/804))

  `createRouter` / `addRoute` now throw for a route path whose `<...>` constraint
  delimiters are unbalanced (`/x/:id<\d+`, a stray `>`, `/x/:id<`) or empty
  (`/x/:id<>`). Previously bare core built such routes silently and `buildPath`
  later emitted a garbage URL (`/x/1<\d+`), while an empty `<>` compiled to a
  never-matching `^()$` param — the "silent at registration, cryptic later" flow.
  The rejection now happens loudly at `registerTree`, mirroring the existing
  name-less ([#858](https://github.com/greydragon888/real-router/issues/858)) and fused-marker ([#1050](https://github.com/greydragon888/real-router/issues/1050)) guards, so it covers the
  `createRouter`-first flow for every consumer, not only under
  `@real-router/validation-plugin`.

  Internally this lands the constraint-`<...>` grammar single source of truth: a
  single `CONSTRAINT_BODY_PATTERN` atom now backs every match/strip/build regex
  (reconciling a latent `+`/`*` desync), and a single `isConstraintBalanced`
  predicate backs both the route-tree gate and the path-matcher backstop —
  completing the [#738](https://github.com/greydragon888/real-router/issues/738) single-sourcing on the constraint axis.

## 0.62.3

### Patch Changes

- [#1087](https://github.com/greydragon888/real-router/pull/1087) [`9e64939`](https://github.com/greydragon888/real-router/commit/9e64939b063d128eacf05235ea7980397a98772d) Thanks [@greydragon888](https://github.com/greydragon888)! - Cut large route-table memory via shared empty per-route collections ([#1009](https://github.com/greydragon888/real-router/issues/1009))

  For large route tables the segment matcher allocated a fresh empty `Set`/`Map`/array per route (query params, constraints, build slots) and added `cachedResult` after construction, making every `CompiledRoute` megamorphic. Both now reuse shared frozen sentinels and a single hidden class (extending the `EMPTY_CHILDREN_MAP` pattern already used for tree children). At 10 000 routes this is the bulk of a ~14.4 → ~9.0 MB drop (~1.2 → ~0.67 KB/route), with no change to the O(1) match (matcher CPU stays flat) or any observable behavior.

- [#1087](https://github.com/greydragon888/real-router/pull/1087) [`9e64939`](https://github.com/greydragon888/real-router/commit/9e64939b063d128eacf05235ea7980397a98772d) Thanks [@greydragon888](https://github.com/greydragon888)! - Drop redundant matcher indexes for large route tables ([#1010](https://github.com/greydragon888/real-router/issues/1010))

  The segment matcher kept two per-route `Map`s (`segmentsByName` / `metaByName`) duplicating references already held in `routesByName`; the `getSegmentsByName` / `getMetaByName` getters now derive from `routesByName` and the two maps are removed. At 10 000 routes this trims retained heap a further ~0.4 MB on top of [#1009](https://github.com/greydragon888/real-router/issues/1009) (~9.0 → ~8.5 MB, ~0.63 KB/route), with no behavior or match-speed change.

## 0.62.2

### Patch Changes

- [#1056](https://github.com/greydragon888/real-router/pull/1056) [`a98c390`](https://github.com/greydragon888/real-router/commit/a98c390acf70812f8e474914fab272b59b4467bd) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject a `:`/`*` marker fused to a static prefix within a segment ([#1050](https://github.com/greydragon888/real-router/issues/1050))

  A marker glued to a static prefix inside one segment (`/a:b`, `/users/x:id`, `/a*b`) was parsed inconsistently: `buildPath`/`buildParamMeta` extracted it as a param (their marker regex is unanchored) while the trie honored a marker only at segment start and compiled the whole segment as a static literal. The two disagreed — `buildPath` emitted a URL its own `match` rejected, and the validation gate passed it through. `createRouter` / `addRoute` / `replaceRoutes` / `updateRoute` now reject such a path at registration (route-tree validation gate with a route-contextual error, path-matcher `registerTree` backstop), the sibling of the name-less marker rejection ([#858](https://github.com/greydragon888/real-router/issues/858)/[#863](https://github.com/greydragon888/real-router/issues/863)). Use a boundary marker (`/a/:b`) instead. A marker-led segment whose name itself contains `:`/`*` (`/:a:b` → param `a:b`) is unaffected.

## 0.62.1

### Patch Changes

- [#1053](https://github.com/greydragon888/real-router/pull/1053) [`5fc3652`](https://github.com/greydragon888/real-router/commit/5fc3652ddb72fc1ce31fefdce5ab287a5a471177) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal refactor: extract `update()`'s field-patch commit into `commitRouteUpdate` ([#1049](https://github.com/greydragon888/real-router/issues/1049))

  Co-locates `updateRoute`'s PREPARE/COMMIT logic in `routesStore.ts` beside the other three route-CRUD commit cores (`adoptRouteArtifacts`, `commitTreeChanges`, `resetStore`). `update` stays an O(1) field-patch (no tree rebuild), core reads each user `updates` getter exactly once, and all atomicity / guard-origin / custom-field semantics are unchanged. No public API or behavior change.

- [#1053](https://github.com/greydragon888/real-router/pull/1053) [`5fc3652`](https://github.com/greydragon888/real-router/commit/5fc3652ddb72fc1ce31fefdce5ab287a5a471177) Thanks [@greydragon888](https://github.com/greydragon888)! - Pre-flight the lifecycle handler-limit check ([#961](https://github.com/greydragon888/real-router/issues/961)) into the route-CRUD PREPARE phase so `add`/`replace`/`update` stay atomic ([#1046](https://github.com/greydragon888/real-router/issues/1046)). Previously, with `@real-router/validation-plugin` installed and the per-type handler count at `maxLifecycleHandlers`, a CRUD op that registered a new guard slot threw the limit `RangeError` _after_ the tree/config swap — leaving a partial mutation (`update`'s `forwardTo` committed, `add`'s routes in the swapped tree, `replace`'s old tree destroyed). The limit is now projected per type before any store write (against surviving external guards for `replace`'s clear-then-register), so a limit-exceeding op aborts with the prior state fully intact.

- [#1053](https://github.com/greydragon888/real-router/pull/1053) [`5fc3652`](https://github.com/greydragon888/real-router/commit/5fc3652ddb72fc1ce31fefdce5ab287a5a471177) Thanks [@greydragon888](https://github.com/greydragon888)! - Restore always-on (bare-core) route-name hardening parity across the mutating CRUD ops ([#1047](https://github.com/greydragon888/real-router/issues/1047)). `add` rejected reserved `@@`-prefixed names ([#954](https://github.com/greydragon888/real-router/issues/954)) and in-batch duplicate paths ([#955](https://github.com/greydragon888/real-router/issues/955)) without the validation-plugin, but `replace` only rejected duplicate names (reserved-name + dup-path were plugin-only) and `remove`/`update` accepted reserved `@@` names entirely (a regression of [#238](https://github.com/greydragon888/real-router/issues/238), which originally protected all four mutators before the validation-extraction demoted the checks to the opt-in plugin). Bare core now rejects these on `replace`/`remove`/`update` too — with the same error messages as the validation-plugin — closing silent-shadow (`replace` dup-path) and reserved-name-mutation gaps. The `replace` guards run before the build/swap, so a rejected batch leaves the existing tree intact.

## 0.62.0

### Minor Changes

- [#1035](https://github.com/greydragon888/real-router/pull/1035) [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5) Thanks [@greydragon888](https://github.com/greydragon888)! - Unify the event-reentrancy model: coalesce re-entrant emits; remove `RecursionDepthError` and `maxEventDepth` ([#1033](https://github.com/greydragon888/real-router/issues/1033))

  **Breaking change (pre-1.0).** The internal event emitter no longer bounds recursion with a configurable `maxEventDepth` that throws `RecursionDepthError`. Instead, a re-entrant emit of an event already being dispatched is **coalesced** to a no-op — an event can never re-enter its own dispatch (depth ≤ 1), so recursion is structurally impossible (no stack-overflow path).

  - `RecursionDepthError` is **no longer exported** from `@real-router/core` — it can never throw now. Remove any `instanceof RecursionDepthError` checks: re-entrant route-CRUD throws `REENTRANT_TREE_MUTATION` ([#1032](https://github.com/greydragon888/real-router/issues/1032)) and re-entrant navigation throws `REENTRANT_NAVIGATION` ([#1030](https://github.com/greydragon888/real-router/issues/1030)), both synchronously at the call site before mutating.
  - The `maxEventDepth` limit is removed from `RouterOptions.limits` (see `@real-router/types`).
  - Observable effect: `replace()` (or `navigateToNotFound()`) called from inside a transition listener no longer emits a nested `TRANSITION_SUCCESS` — its `setState` still updates the active state; only the redundant nested re-notification is coalesced. `replace()` from outside a dispatch is unaffected.

- [#1035](https://github.com/greydragon888/real-router/pull/1035) [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5) Thanks [@greydragon888](https://github.com/greydragon888)! - Ban synchronous reentrant route-CRUD from `subscribeChanges` handlers ([#1032](https://github.com/greydragon888/real-router/issues/1032))

  **Breaking change (pre-1.0).** A route-CRUD op — `add()` / `remove()` / `update()` / `clear()` / `replace()` on `getRoutesApi(router)` — called from **inside a `subscribeChanges` handler** (while a `TREE_CHANGED` event is being dispatched) now throws `RouterError(REENTRANT_TREE_MUTATION)` synchronously, **before mutating the tree**, instead of nesting a recursive `TREE_CHANGED` cascade.

  This removes a class of non-atomic, causally-inconsistent behaviour: previously a reentrant cascade was bounded only by `maxEventDepth`, throwing `RecursionDepthError` mid-cascade and leaving a **partially-mutated tree** (a throwing `add()` had already committed routes), and downstream listeners observed events **out of causal order** (the reentrant-triggered event arrived before the triggering one). Mirrors the reentrant-`navigate` ban (`REENTRANT_NAVIGATION`).

  Inside a handler the throw is surfaced by the emit's `onListenerError` isolation (visible, non-fatal), so the outer op still completes. Deferred CRUD is unaffected, and CRUD from a _transition_ listener (`router.subscribe`, not a `TREE_CHANGED` dispatch) remains allowed.

  **Migration:** defer the mutation so it runs after the dispatch settles:

  ```diff
  - routes.subscribeChanges(() => { routes.add({ name: "x", path: "/x" }); });
  + routes.subscribeChanges(() => { queueMicrotask(() => routes.add({ name: "x", path: "/x" })); });
  ```

- [#1035](https://github.com/greydragon888/real-router/pull/1035) [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5) Thanks [@greydragon888](https://github.com/greydragon888)! - Ban synchronous reentrant navigation from transition listeners ([#1030](https://github.com/greydragon888/real-router/issues/1030))

  **Breaking change (pre-1.0).** A synchronous `navigate()` / `navigateToDefault()` / `navigateToState()` / `navigateToNotFound()` called from **inside a transition-event listener** (a `subscribe` callback, `subscribeLeave` listener, or plugin `onTransition*` hook) while a transition is being dispatched now throws `RouterError(REENTRANT_NAVIGATION)` instead of self-feeding or superseding the in-flight navigation. Inside a listener the throw is surfaced by the emit's `onListenerError` isolation — visible, non-fatal.

  Deferred navigation from a listener is unaffected: `await navigate(...)`, an `async` listener, `queueMicrotask(...)`, or `navigate(...).catch(...)` all run after the transition settles and remain allowed. Route-CRUD from a transition listener is also unaffected — this ban is scoped to navigation.

  This removes a class of state-corruption bugs ([#308](https://github.com/greydragon888/real-router/issues/308)) and the defensive `RecursionDepthError`-suppression machinery ([#945](https://github.com/greydragon888/real-router/issues/945)) on the navigation path, and makes every cancellation path return the FSM to a consistent `READY`/`IDLE` state — subsuming the interim [#1030](https://github.com/greydragon888/real-router/issues/1030) external-`opts.signal` recovery fix.

  **Migration:** defer the navigation so it runs after the transition settles, or move it to the call site:

  ```diff
  - router.subscribe(() => { router.navigate("orders"); });
  + router.subscribe(() => { queueMicrotask(() => void router.navigate("orders").catch(() => {})); });
  + // or at the call site: await router.navigate("users"); router.navigate("orders");
  ```

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/types@0.38.0

## 0.61.14

### Patch Changes

- [#1028](https://github.com/greydragon888/real-router/pull/1028) [`fac6afa`](https://github.com/greydragon888/real-router/commit/fac6afae8f8971b1c930e14b46b452739bd2c58e) Thanks [@greydragon888](https://github.com/greydragon888)! - Reuse the `EMPTY_PARAMS` singleton for empty-params navigations ([#1027](https://github.com/greydragon888/real-router/issues/1027))

  `normalizeParams` now returns the shared frozen `EMPTY_PARAMS` singleton when the result is empty (empty input, or every value `undefined`) instead of always allocating a fresh `{}`. This lets `makeState`'s `params === EMPTY_PARAMS` reuse branch fire, so a navigation to a route with no params (and no `defaultParams`) allocates zero transient objects instead of two.

  Behavior-preserving: `state.params` is still an empty frozen object and the `undefined`-strip contract is unchanged.

## 0.61.13

### Patch Changes

- [#1021](https://github.com/greydragon888/real-router/pull/1021) [`615d75b`](https://github.com/greydragon888/real-router/commit/615d75bf4dcdcbd3d27960679c2a8933c52f07e9) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `router.navigate()` hanging forever on a non-cooperative async guard ([#1018](https://github.com/greydragon888/real-router/issues/1018))

  - An async `canActivate`/`canDeactivate` guard whose Promise never settles **and** ignores its `signal` no longer wedges the navigation. Previously `stop()`, `dispose()`, and a superseding `navigate()` could not cancel such a navigation and its Promise stayed pending forever (leaking the navigation Promise, its `AbortController`, and the guard closure — notably per request under SSR). `#finishAsyncNavigation` now races the guard completion against the controller's abort, so these all reject the parked navigation with `TRANSITION_CANCELLED`. This mirrors the leave-path protection added in [#663](https://github.com/greydragon888/real-router/issues/663)/[#673](https://github.com/greydragon888/real-router/issues/673).
  - Consequence: when an abort (`stop()`/`dispose()`/supersede) precedes a slow guard's own verdict, cancellation now wins — the navigation rejects `TRANSITION_CANCELLED` rather than waiting for the guard's `CANNOT_ACTIVATE`/`CANNOT_DEACTIVATE`. This matches the documented "stop() during guard → TRANSITION_CANCELLED" contract.

## 0.61.12

### Patch Changes

- [#1002](https://github.com/greydragon888/real-router/pull/1002) [`ee8c8b9`](https://github.com/greydragon888/real-router/commit/ee8c8b9d1b8d161aeb42986dc0ebf83c5f2834ec) Thanks [@greydragon888](https://github.com/greydragon888)! - Throw `ROUTER_DISPOSED` from a bound `subscribeChanges()` reference used after `dispose()` ([#982](https://github.com/greydragon888/real-router/issues/982))

  A `getRoutesApi(router).subscribeChanges()` reference captured before `dispose()` — `const s = routes.subscribeChanges.bind(routes)` — reached the unguarded `EventBusNamespace.subscribeTreeChanged`, the internal route-tree counterpart of the `subscribe`/`subscribeLeave` channels fixed in [#946](https://github.com/greydragon888/real-router/issues/946). Since `dispose()` had already run `clearAll()`, `emitter.on` recreated the `TREE_CHANGED` listener `Set` and added the listener — which could then NEVER fire (the FSM is `DISPOSED` and the route tree is torn down, no future emit): a silent no-op. Core now enforces the disposed state inside `subscribeTreeChanged` itself, completing the guard across all three subscription primitives (`subscribe`/`subscribeLeave`/`subscribeTreeChanged`), so a pre-bound `subscribeChanges` reference throws `RouterError(ROUTER_DISPOSED)` — consistent with the sibling `getRoutesApi` methods (`add`/`remove`/`update`/`clear`) and with a direct post-dispose call.

## 0.61.11

### Patch Changes

- [#1000](https://github.com/greydragon888/real-router/pull/1000) [`2b6aa28`](https://github.com/greydragon888/real-router/commit/2b6aa287fb1a29cf5deb8d98ec57f7635cb2a917) Thanks [@greydragon888](https://github.com/greydragon888)! - Assert per-instance options immutability in `RoutesNamespace.#getBuildPathOptions` ([#957](https://github.com/greydragon888/real-router/issues/957))

  `#getBuildPathOptions` caches its result on the first call and returns it on every subsequent call, ignoring the `options` argument. This is safe because the sole caller (`Router.buildPath`) always passes the same immutable, deep-frozen per-instance options (`this.#options.get()`). A dev-build assertion now logs a warning if a future caller passes a differing `options` reference, making the cache-ignores-argument contract explicit and catchable. No behavior change for supported usage.

- [#1000](https://github.com/greydragon888/real-router/pull/1000) [`2b6aa28`](https://github.com/greydragon888/real-router/commit/2b6aa287fb1a29cf5deb8d98ec57f7635cb2a917) Thanks [@greydragon888](https://github.com/greydragon888)! - Inline `Object.freeze` for `REPLACE_OPTS` ([#941](https://github.com/greydragon888/real-router/issues/941))

  Combine the split declaration + `Object.freeze` of `REPLACE_OPTS` in `RouterLifecycleNamespace` into a single `const … = Object.freeze(…)` form (matching the `REVALIDATE_OPTS` house style in `api/getRoutesApi.ts`), removing the window where a future edit could insert a mutation between declaration and freeze. Behaviorally inert — the constant was already frozen at runtime.

- [#1000](https://github.com/greydragon888/real-router/pull/1000) [`2b6aa28`](https://github.com/greydragon888/real-router/commit/2b6aa287fb1a29cf5deb8d98ec57f7635cb2a917) Thanks [@greydragon888](https://github.com/greydragon888)! - Inline `Object.freeze` for `FROZEN_ACTIVATED` / `FROZEN_REPLACE_OPTS` ([#937](https://github.com/greydragon888/real-router/issues/937))

  Combine the split declaration + `Object.freeze` of the module-level constants in `NavigationNamespace` into a single `const … = Object.freeze(…)` form, removing the window where a future edit could insert a mutation between declaration and freeze. Behaviorally inert — both constants were already frozen at runtime.

## 0.61.10

### Patch Changes

- [#997](https://github.com/greydragon888/real-router/pull/997) [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee) Thanks [@greydragon888](https://github.com/greydragon888)! - Log `start()` failures under the `router.start` category, not `router.navigate` ([#931](https://github.com/greydragon888/real-router/issues/931))

  A `start()` rejection that is not a suppressed `RouterError` — a start interceptor that throws after `next()` committed (the SSR/RSC loader window), or a cryptic path `TypeError` — was logged by the fire-and-forget safety net under the `router.navigate` category, so operators filtering production logs for start failures missed them. The suppressor is now split per call-site: `navigate` / `navigateToDefault` / `navigateToState` log under `router.navigate`, `start()` under `router.start`.

  Also removed false `Stryker disable … unreachable` comments on the suppressor log lines. Both are reachable — a `subscribeLeave` listener throw or a Symbol path-param `TypeError` reaches the navigate line, an interceptor throw reaches the start line — and are now covered by killing tests asserting the log category.

- [#997](https://github.com/greydragon888/real-router/pull/997) [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract start-pipeline FSM recovery into `#unwindFailedStart` ([#940](https://github.com/greydragon888/real-router/issues/940))

  Internal refactor, no behavior change: the `start()` facade's inline `.catch` recovery (the two-branch FSM unwind) moves into a documented `#unwindFailedStart` method, and a comment records why the start FSM bookkeeping is deliberately split between the facade (`sendStart` before the interceptor chain, plus recovery) and `RouterLifecycleNamespace` (the `completeStart` commit). `sendStart` stays in the facade on purpose: moving it into the namespace (the interceptor target) would skip the STARTING state on a pre-`next()` interceptor throw, silently dropping the TRANSITION_ERROR that STARTING's FAIL action emits for `onTransitionError` plugins — a [#668](https://github.com/greydragon888/real-router/issues/668) regression.

- [#997](https://github.com/greydragon888/real-router/pull/997) [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard `start()` against a non-string path with an actionable error ([#939](https://github.com/greydragon888/real-router/issues/939))

  `start(undefined)` without a browser-plugin reached `matchPath(undefined)` and threw a cryptic, code-less `TypeError: Cannot read properties of undefined (reading 'codePointAt')` deep inside path-matcher.

  Core now validates `typeof path === "string"` in `RouterLifecycleNamespace.start` — **after** the start interceptor chain, so a browser-plugin that injects the location (`next(path ?? getLocation())`) is unaffected; the guard only fires when nothing supplied a path. The rejection is now a clear `TypeError("[router.start] path must be a string, got undefined")`, symmetric with the `subscribe` / `navigateToNotFound` invariant guards. The FSM still recovers (STARTING → IDLE) so a subsequent well-formed `start()` succeeds.

## 0.61.9

### Patch Changes

- [#995](https://github.com/greydragon888/real-router/pull/995) [`a70833c`](https://github.com/greydragon888/real-router/commit/a70833cfcba7a0a9e493b9ec52a7885af775d46b) Thanks [@greydragon888](https://github.com/greydragon888)! - Drive cloneRouter/cloneConfig config copy by a single enumeration ([#965](https://github.com/greydragon888/real-router/issues/965))

  Internal refactor — no public API or behavior change. The per-route
  `RouteConfig` sub-maps were copied with one `Object.assign` per field in two
  places (`cloneRouter` and `cloneConfig`), so a newly added sub-field could be
  silently missed at either site. Both now go through a shared
  `assignConfigEntries(target, source)` helper that enumerates the config keys, so
  a new sub-field is carried over automatically.

- [#995](https://github.com/greydragon888/real-router/pull/995) [`a70833c`](https://github.com/greydragon888/real-router/commit/a70833cfcba7a0a9e493b9ec52a7885af775d46b) Thanks [@greydragon888](https://github.com/greydragon888)! - Consolidate `cloneRouter` clone-state into a single `getCloneState()` accessor ([#964](https://github.com/greydragon888/real-router/issues/964))

  Internal refactor — no public API or behavior change. `cloneRouter` previously
  read its clone snapshot through three separate `RouterInternals` methods
  (`cloneOptions`, `cloneDependencies`, `getPluginFactories`). These collapse into
  one `getCloneState()` returning `{ options, dependencies, pluginFactories }`, so a
  new clone-relevant subsystem is wired in a single place. The general-purpose
  `routeGetStore` accessor is unchanged.

- [#995](https://github.com/greydragon888/real-router/pull/995) [`a70833c`](https://github.com/greydragon888/real-router/commit/a70833cfcba7a0a9e493b9ec52a7885af775d46b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `createRequestScope` close-listener leak when `cloneRouter` throws ([#969](https://github.com/greydragon888/real-router/issues/969))

  `createRequestScope` (the SSR per-request helper) attached the Node `"close"`
  listener to the request _before_ calling `cloneRouter`. If `cloneRouter` threw
  (e.g. `ROUTER_DISPOSED` on an already-disposed base), the helper exited via the
  exception without returning a scope handle, so the listener could never be
  detached — it leaked on the request object. The listener is now attached only
  after `cloneRouter` succeeds (clone-before-attach); `cloneRouter` is synchronous,
  so no `"close"` event can fire in the gap. The Web (`RequestLike`) branch is
  unaffected — it never attaches a listener.

## 0.61.8

### Patch Changes

- [#992](https://github.com/greydragon888/real-router/pull/992) [`22aa1e4`](https://github.com/greydragon888/real-router/commit/22aa1e42fcc53dcabeb786d48a7bef59f923cd23) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: `add()` / `replace()` are now atomic for a guard factory that throws on compile ([#956](https://github.com/greydragon888/real-router/issues/956))

  A guard factory passed via route config to `add`/`replace` that threw on compile (or returned a non-function) used to throw **after** the tree/config swap in `adoptRouteArtifacts`, leaving the store torn — the new route(s) were already in the tree even though the call rejected. `adoptRouteArtifacts` now compiles every pending guard factory **before** the swap, so a malformed factory aborts the mutation with the store untouched — completing the prepare-then-commit atomicity of [#698](https://github.com/greydragon888/real-router/issues/698) (previously atomic only for core build errors, not for guard factories). Guards are compiled once: the pre-compiled function is installed without re-invoking the factory, so a factory with compile-time side effects still runs exactly once.

- [#992](https://github.com/greydragon888/real-router/pull/992) [`22aa1e4`](https://github.com/greydragon888/real-router/commit/22aa1e42fcc53dcabeb786d48a7bef59f923cd23) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: `update(name, { canActivate: null })` no longer clears an external guard (origin-selective clear) ([#952](https://github.com/greydragon888/real-router/issues/952))

  `clearCanActivate` / `clearCanDeactivate` were origin-blind — they deleted both the definition-sourced and the external guard for a route. So `update(name, { canActivate: null })` (which only manages the route-config / definition guard) also wiped a guard registered independently via `getLifecycleApi().addActivateGuard()`. Both clear methods now take a `definitionOnly` flag, and `update`'s `canActivate: null` / `canDeactivate: null` branches pass it — clearing only the definition slot and recompiling the surviving external guard. Route removal / `clearAll` keep clearing both slots (the default).

- [#992](https://github.com/greydragon888/real-router/pull/992) [`22aa1e4`](https://github.com/greydragon888/real-router/commit/22aa1e42fcc53dcabeb786d48a7bef59f923cd23) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: guard registration rollback preserves the previously-valid guard on overwrite-then-throw ([#963](https://github.com/greydragon888/real-router/issues/963))

  Registering a guard onto a slot that already held one, with a factory that throws on compile, used to leave the slot empty — the rollback ran `targetMap.delete(name)` + `functions.delete(name)`, silently dropping the still-valid previous guard. `#registerHandler` now captures the slot's prior factory before the overwrite and, on a compile throw, restores it (recompiling its function via `#recompileSlot`) instead of clearing the slot. A failed overwrite via `addActivateGuard` / `addDeactivateGuard` now leaves the previously-registered guard intact.

- [#992](https://github.com/greydragon888/real-router/pull/992) [`22aa1e4`](https://github.com/greydragon888/real-router/commit/22aa1e42fcc53dcabeb786d48a7bef59f923cd23) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: `replace()` notifies `router.subscribe` listeners when it revalidates the active state ([#950](https://github.com/greydragon888/real-router/issues/950))

  `getRoutesApi(router).replace(routes)` revalidated the currently-active state at the end of the swap by writing it directly (`setState` / `clearState`) without emitting a transition event — only the internal `TREE_CHANGED` fired. So `router.subscribe` / `useSyncExternalStore` adapters kept rendering the pre-replace state. Revalidation now emits `TRANSITION_SUCCESS`: when the active path still matches it commits the revalidated state and emits; when the active route was dropped it routes through `navigateToNotFound` (commits `UNKNOWN_ROUTE`, emits) instead of silently clearing.

  **Behavior change:** after a `replace()` that drops the active route, `getState()` is now `UNKNOWN_ROUTE` (was `undefined`), and plugins' `onTransitionSuccess` fires for a `replace()` revalidation. `clear()` stays a silent structural reset (the asymmetry is intentional — `clear` has no next state for adapters to render; `replace` does).

- [#992](https://github.com/greydragon888/real-router/pull/992) [`22aa1e4`](https://github.com/greydragon888/real-router/commit/22aa1e42fcc53dcabeb786d48a7bef59f923cd23) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: `update(name, { forwardTo })` rejects an async callback at update time (parity with add/replace) ([#967](https://github.com/greydragon888/real-router/issues/967))

  `add` / `replace` reject an async `forwardTo` callback at registration (`assertForwardToNotAsync` → "forwardTo callback cannot be async for route …"), but `update`'s path stored it silently — the failure then surfaced at navigation as a generic `TypeError: forwardTo callback must return a string, got object`. `updateForwardTo` now runs the same `assertForwardToNotAsync` check first, so `update(name, { forwardTo: async () => … })` throws the actionable, route-named error at registration, matching `add`/`replace`.

- [#992](https://github.com/greydragon888/real-router/pull/992) [`22aa1e4`](https://github.com/greydragon888/real-router/commit/22aa1e42fcc53dcabeb786d48a7bef59f923cd23) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: `update()` is now atomic across its whole field set (prepare-then-commit) ([#951](https://github.com/greydragon888/real-router/issues/951))

  `update(name, updates)` applied its fields sequentially, so a throw partway through left a partial update — most notably a `forwardTo` committed first, then a guard-factory registration threw, leaving the new `forwardTo` live while the guard change was not (and likewise a custom field committed before a rejected async `forwardTo`). `update()` now runs a PREPARE phase that computes and validates every field into locals — an async/cyclic `forwardTo` ([#967](https://github.com/greydragon888/real-router/issues/967)), a guard factory that throws on compile, and a throwing custom-field getter all surface here — followed by a COMMIT phase of pure, non-throwing writes. A failing `update()` therefore leaves the route's prior config fully intact. Guard factories are compiled once during PREPARE and installed without re-invoking (reusing the [#956](https://github.com/greydragon888/real-router/issues/956) compile-then-install seam), so a factory side effect still runs exactly once.

## 0.61.7

### Patch Changes

- [#987](https://github.com/greydragon888/real-router/pull/987) [`fceb05e`](https://github.com/greydragon888/real-router/commit/fceb05e6c521481ad46d9351d822de8d9a77a573) Thanks [@greydragon888](https://github.com/greydragon888)! - Clear `EventBusNamespace` pending-error fields after emit ([#949](https://github.com/greydragon888/real-router/issues/949))

  `#emitPendingError()` read `#pendingToState` / `#pendingFromState` / `#pendingError` to emit
  `TRANSITION_ERROR` but did not clear them, leaving the last error's `State` / `RouterError`
  pinned on the instance until the next `sendFail()` / `sendCancel()` overwrote them. The
  fields are now cleared once consumed. State hygiene only — every consumer already overwrites
  the fields before re-reading, so there is no observable behaviour change.

- [#987](https://github.com/greydragon888/real-router/pull/987) [`fceb05e`](https://github.com/greydragon888/real-router/commit/fceb05e6c521481ad46d9351d822de8d9a77a573) Thanks [@greydragon888](https://github.com/greydragon888)! - Preserve a guard-thrown `RouterError(TRANSITION_CANCELLED)` instead of re-coding it ([#933](https://github.com/greydragon888/real-router/issues/933))

  A route guard that throws `RouterError(TRANSITION_CANCELLED)` to quietly cancel a
  transition was observed by the caller as `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE`.
  `handleGuardError` only special-cased a `DOMException` `AbortError`, so an explicit
  cancellation `RouterError` fell through to `rethrowAsRouterError`, whose `setCode`
  overwrote the code — turning the intended quiet cancel into a reported transition
  error (`onTransitionError` fired, `routeTransitionError` emitted a fail).

  `handleGuardError` now preserves a thrown `RouterError` whose code is already
  `TRANSITION_CANCELLED`, mirroring the existing `AbortError` → `TRANSITION_CANCELLED`
  handling. Other thrown `RouterError`s (e.g. `TRANSITION_ERR`) are still re-coded as
  before.

- [#987](https://github.com/greydragon888/real-router/pull/987) [`fceb05e`](https://github.com/greydragon888/real-router/commit/fceb05e6c521481ad46d9351d822de8d9a77a573) Thanks [@greydragon888](https://github.com/greydragon888)! - Document `EventBusNamespace.sendFailSafe()` semantics and state-branching ([#948](https://github.com/greydragon888/real-router/issues/948))

  Add JSDoc clarifying that the "Safe" suffix means the error event is never dropped
  regardless of FSM state — not that the method catches every error (errors thrown inside a
  `TRANSITION_ERROR` listener are isolated separately via the `EventEmitter`'s
  `onListenerError` sink). Also document why the method reads its own FSM state to choose
  between the FSM-routed `FAIL` action (in `READY`) and a direct `TRANSITION_ERROR` emit
  (otherwise). No behaviour change.

- [#987](https://github.com/greydragon888/real-router/pull/987) [`fceb05e`](https://github.com/greydragon888/real-router/commit/fceb05e6c521481ad46d9351d822de8d9a77a573) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop a guard-thrown thenable from making the wrapped `RouterError` thenable ([#947](https://github.com/greydragon888/real-router/issues/947))

  When a transition step (e.g. a route guard) throws a thenable — a non-`Error` object
  exposing a `then` method — `wrapSyncError()` spread its own-enumerable properties onto the
  `RouterError` metadata, filtering only the reserved keys `code` / `segment` / `path`. `then`
  was not filtered, so the produced `RouterError` carried a `then` function and was itself
  thenable: a consumer that `await`ed it (or passed it through `Promise.resolve`, or returned
  it from an `async` function) had it assimilated as a Promise instead of treated as a plain
  rejection reason.

  `wrapSyncError()` now also excludes `then` from the spread. Other own properties are still
  copied onto the error metadata.

## 0.61.6

### Patch Changes

- [#979](https://github.com/greydragon888/real-router/pull/979) [`d160e0b`](https://github.com/greydragon888/real-router/commit/d160e0b1618ef169aea2894688b889c6f7beea4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `canNavigateTo` over-checking shared-ancestor guards that `navigate` skips ([#970](https://github.com/greydragon888/real-router/issues/970))

  `canNavigateTo` built its `toState` without route-meta, so `getTransitionPath` took its meta-less fast path and (de)activated the entire route chain — including ancestor segments shared with the current route, which `navigate` leaves mounted and never re-guards. A guard on a shared parent (e.g. a `canDeactivate` "block on unsaved changes" on a section route) therefore made `canNavigateTo` return `false` for an intra-section navigation that `navigate` would resolve — a false-negative ("Link disabled though the click would succeed"). `canNavigateTo` now builds `toState` the same way `navigate` does (with route-meta and normalized params), restoring strict parity with `navigate`'s guard set. This also fixes the documented innermost-first deactivation guard order and the `normalizeParams` drift that exposed an `{ x: undefined }` key to guards.

- [#979](https://github.com/greydragon888/real-router/pull/979) [`d160e0b`](https://github.com/greydragon888/real-router/commit/d160e0b1618ef169aea2894688b889c6f7beea4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Log a warning when a sync guard throws in `canNavigateTo` ([#959](https://github.com/greydragon888/real-router/issues/959))

  A guard that threw inside `canNavigateTo` was caught and converted to `false` with no log, event, or re-throw — a crashed guard was indistinguishable from one that legitimately blocked the navigation. `navigate()` surfaces the same throw via `handleGuardError` → `TRANSITION_ERROR`, but the synchronous predicate has no error channel, so core now logs the throw directly via `logger.warn` (an operational signal, distinct from the opt-in `@real-router/validation-plugin` DX warnings) before returning `false`.

## 0.61.5

### Patch Changes

- [#980](https://github.com/greydragon888/real-router/pull/980) [`6cc8376`](https://github.com/greydragon888/real-router/commit/6cc83768cce9e7cdab952bebe2394ac589e6f1cb) Thanks [@greydragon888](https://github.com/greydragon888)! - Isolate async `subscribe` listener rejections instead of leaking them ([#944](https://github.com/greydragon888/real-router/issues/944))

  An `async` `router.subscribe()` listener whose Promise rejected leaked a Node `unhandledRejection` — process-fatal under `--unhandled-rejections=strict` (the Node 22+ default). The subscribe wrapper discarded the listener's return value, and the `EventEmitter`'s per-listener `try/catch` isolates only **synchronous** throws. The wrapper now attaches a `.catch` that routes a rejection to the same `onListenerError` sink a synchronous throw flows through — symmetric with `subscribeLeave`, which isolates rejections via `Promise.allSettled`. `subscribe` stays fire-and-forget: the listener's return value is ignored and `navigate()` does not await it.

- [#980](https://github.com/greydragon888/real-router/pull/980) [`6cc8376`](https://github.com/greydragon888/real-router/commit/6cc83768cce9e7cdab952bebe2394ac589e6f1cb) Thanks [@greydragon888](https://github.com/greydragon888)! - Throw `ROUTER_DISPOSED` from a bound `subscribe`/`subscribeLeave` reference used after `dispose()` ([#946](https://github.com/greydragon888/real-router/issues/946))

  A subscription reference captured before `dispose()` — `const s = router.subscribe.bind(router)` — bypassed the facade's `#markDisposed` swap (which replaces only `router.subscribe`, not a copy already bound out of it) and reached the live `EventBusNamespace`. Since `dispose()` had already run `clearAll()`, `emitter.on` simply recreated the listener `Set` and added the listener — which could then NEVER fire (the FSM is `DISPOSED`, no future emit): a silent no-op / stuck-UI hazard. Core now enforces the disposed state inside `EventBusNamespace.subscribe` and `subscribeLeave` themselves, so a pre-bound reference throws `RouterError(ROUTER_DISPOSED)` — consistent with a direct post-dispose call. Applied symmetrically to both end-user subscription surfaces.

- [#980](https://github.com/greydragon888/real-router/pull/980) [`6cc8376`](https://github.com/greydragon888/real-router/commit/6cc83768cce9e7cdab952bebe2394ac589e6f1cb) Thanks [@greydragon888](https://github.com/greydragon888)! - Suppress a reentrant `subscribe`-navigate's `RecursionDepthError` instead of leaking it ([#945](https://github.com/greydragon888/real-router/issues/945))

  A `router.navigate()` called fire-and-forget from inside a `router.subscribe()` listener self-feeds nested `TRANSITION_SUCCESS` emits until the `EventEmitter`'s `maxEventDepth` ceiling throws `RecursionDepthError`. Left un-`.catch()`ed, that rejection leaked as a Node `unhandledRejection` — process-fatal under `--unhandled-rejections=strict` (the Node 22+ default) — for two reasons: the optimistic `lastSyncResolved` flag, set _before_ `completeTransition`, was left stale-`true` when the synchronous emit threw, so the facade skipped its safety-net `.catch`; and `RecursionDepthError` was not a suppressed rejection. Core now sets `lastSyncResolved` only _after_ `completeTransition` returns (a throw routes to the suppressing `.catch`) and suppresses the bounded `RecursionDepthError` in the fire-and-forget safety net — symmetric with `subscribeLeave`, whose reentrant navigate rejects with the already-suppressed `TRANSITION_CANCELLED`. The chain stays bounded and the router stays functional afterwards.

## 0.61.4

### Patch Changes

- [#977](https://github.com/greydragon888/real-router/pull/977) [`13f621e`](https://github.com/greydragon888/real-router/commit/13f621ede714893a2eaed5cbe08b2d3475575cdc) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject duplicate route names within a single `add()` batch ([#953](https://github.com/greydragon888/real-router/issues/953))

  `getRoutesApi(router).add([...])` now throws `[router.addRoute] Duplicate route "<name>" in batch` when two routes in the same call resolve to the same full name, instead of silently keeping the last one and dropping the first (whose path became unreachable via `matchPath`). This closes the within-batch gap left by the existing `assertAddable` guard, which only checked names against the already-registered tree. The guard runs before any tree/config swap, so a rejected batch leaves the store untouched (atomic). Mirrors the message `@real-router/validation-plugin` already produces, so the error is identical with or without the plugin installed.

- [#977](https://github.com/greydragon888/real-router/pull/977) [`13f621e`](https://github.com/greydragon888/real-router/commit/13f621ede714893a2eaed5cbe08b2d3475575cdc) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject sibling routes sharing a path within a single `add()` batch ([#955](https://github.com/greydragon888/real-router/issues/955))

  `getRoutesApi(router).add([...])` now throws `[router.addRoute] Path "<path>" is already defined` when two routes at the same parent level in one call share a `path`, instead of silently letting the matcher resolve the collision last-wins — which left the earlier route addressable by name (`has` / `buildPath`) but unreachable by URL (`matchPath` returned the later route). The guard runs before any build (atomic) and mirrors `@real-router/validation-plugin`'s message. Scoped to within-batch collisions (the case [#955](https://github.com/greydragon888/real-router/issues/955) describes); a path colliding with an already-registered route is unchanged here and still covered by the validation plugin.

- [#977](https://github.com/greydragon888/real-router/pull/977) [`13f621e`](https://github.com/greydragon888/real-router/commit/13f621ede714893a2eaed5cbe08b2d3475575cdc) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject reserved `@@`-prefixed route names in `add()` even without the validation plugin ([#954](https://github.com/greydragon888/real-router/issues/954))

  `getRoutesApi(router).add({ name: "@@router/…", … })` now throws `[router.addRoute] Route name "…" uses the reserved "@@" prefix…` instead of silently registering the route. Previously this rejection lived only in `@real-router/validation-plugin`, so core accepted a reserved name in the production default (no plugin). That was silent corruption: a route named `@@router/UNKNOWN_ROUTE` makes a real URL `matchPath` to a state whose `name === UNKNOWN_ROUTE`, indistinguishable from the not-found sentinel and breaking the public `state.name === UNKNOWN_ROUTE` check. The guard runs before any tree build (atomic) and mirrors the plugin's message, so the error is identical with or without the plugin.

- [#977](https://github.com/greydragon888/real-router/pull/977) [`13f621e`](https://github.com/greydragon888/real-router/commit/13f621ede714893a2eaed5cbe08b2d3475575cdc) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject duplicate route names within a single `replace()` batch ([#968](https://github.com/greydragon888/real-router/issues/968))

  `getRoutesApi(router).replace([...])` now throws `[router.addRoute] Duplicate route "<name>" in batch` when two routes in the new set resolve to the same full name, instead of silently keeping the last and dropping the first (parallel to the `add()` fix in [#953](https://github.com/greydragon888/real-router/issues/953)). The check runs before the tree is built or swapped, so a rejected `replace()` leaves the existing routes intact (atomic). The `addRoute` method label matches `@real-router/validation-plugin`, which already reports `addRoute` for replace batches — so the error is identical with or without the plugin.

## 0.61.3

### Patch Changes

- [#978](https://github.com/greydragon888/real-router/pull/978) [`4753d17`](https://github.com/greydragon888/real-router/commit/4753d17aeeb0a5313f2484bbe7dc4c5448c8a2e2) Thanks [@greydragon888](https://github.com/greydragon888)! - Correct the `subscribeLeave` contract: departures are approved, not confirmed ([#932](https://github.com/greydragon888/real-router/issues/932))

  `subscribeLeave` fires in the `LEAVE_APPROVED` phase — after all `canDeactivate` guards pass, but **before** activation guards run — so the departure is **approved (tentative), not committed**: an activation (`canActivate`) guard can still reject, or the target route be removed mid-transition, leaving the user on the current route. The docs previously described this as a "confirmed" departure, which is misleading. Corrected the JSDoc, the core API reference, and the README to describe the departure as tentative and to point at the payload `signal` (now informative on failure — see [#943](https://github.com/greydragon888/real-router/issues/943)) as the rollback channel. Behavior is unchanged — documentation fix.

- [#978](https://github.com/greydragon888/real-router/pull/978) [`4753d17`](https://github.com/greydragon888/real-router/commit/4753d17aeeb0a5313f2484bbe7dc4c5448c8a2e2) Thanks [@greydragon888](https://github.com/greydragon888)! - Bound synchronous reentrant `subscribeLeave` navigation ([#935](https://github.com/greydragon888/real-router/issues/935))

  A sync `subscribeLeave` listener that calls `navigate()` re-enters the leave dispatch on the same call stack, nesting one navigation pipeline per hop. Unbounded, it overflowed the C stack (~615 deep) with a `RangeError` that escaped the fire-and-forget suppression net and could leak as an unhandled rejection or wedge the worker.

  The leave dispatch is now depth-bounded by `maxEventDepth` (default 5) — the same limit the event emitter already applies to the plugin `onTransitionLeaveApprove` path — raising a controlled `RecursionDepthError` before the stack overflows, so both reentrancy routes are bounded identically. **Async** reentrant `subscribeLeave` navigation is unaffected (it unwinds the stack at each `await`), and `maxEventDepth: 0` opts out of the bound (mirroring the emitter).

- [#978](https://github.com/greydragon888/real-router/pull/978) [`4753d17`](https://github.com/greydragon888/real-router/commit/4753d17aeeb0a5313f2484bbe7dc4c5448c8a2e2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `subscribeLeave` `signal.reason` on the failure path ([#943](https://github.com/greydragon888/real-router/issues/943))

  When a navigation fails after the `LEAVE_APPROVED` phase — a sync `subscribeLeave` listener throws, or an activation guard rejects — the leave `signal` now aborts with the originating error as `signal.reason`: a `RouterError` (e.g. `CANNOT_ACTIVATE`) or the exact value the listener threw, instead of a generic `DOMException [AbortError]`. This makes the failure path consistent with the cancellation path, which already aborts with `RouterError(TRANSITION_CANCELLED)`. A listener that stashes the `signal` and inspects `reason` asynchronously can now tell _why_ the departure was reverted.

## 0.61.2

### Patch Changes

- [#974](https://github.com/greydragon888/real-router/pull/974) [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the write-only `#limits` twin from `PluginsNamespace` ([#960](https://github.com/greydragon888/real-router/issues/960))

  - Identical dead-code pattern to the `RouteLifecycleNamespace` field removed for [#960](https://github.com/greydragon888/real-router/issues/960): `PluginsNamespace.#limits` was assigned in `setLimits()` but read only through `void this.#limits`, never consumed. Plugin-limit enforcement reads the limit elsewhere (the validator / `options.limits`), not this field. Removes the field, `setLimits()`, the dead `wireLimits()` call, and the unused imports + TS/eslint/Stryker suppressions.

- [#974](https://github.com/greydragon888/real-router/pull/974) [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache the boolean-shorthand guard factories ([#962](https://github.com/greydragon888/real-router/issues/962))

  - `booleanToFactory` allocated a fresh factory + closure on every boolean-shorthand guard registration (`addActivateGuard(name, true | false)` or route-config `canActivate: true`). Since the shorthand has only two values, both now reuse one of two module-level cached factories. No behavior change — guards still resolve to the same boolean.

- [#974](https://github.com/greydragon888/real-router/pull/974) [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606) Thanks [@greydragon888](https://github.com/greydragon888)! - Enforce the lifecycle-handler limit on route-config guards ([#961](https://github.com/greydragon888/real-router/issues/961))

  - The `maxLifecycleHandlers` hard limit was enforced only on the programmatic path (`getLifecycleApi.addActivateGuard` / `addDeactivateGuard`); guards registered via route config (`getRoutesApi.add` / `update`) bypassed it and only emitted an approaching-limit warning.
  - Enforcement is centralized at the `RouteLifecycleNamespace` registration choke point, so every registration path is bounded uniformly and reads the limit from a single source. The hard throw still requires `@real-router/validation-plugin`; without it, behavior is unchanged.

- [#974](https://github.com/greydragon888/real-router/pull/974) [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove dead write-only `#limits` field from `RouteLifecycleNamespace` ([#960](https://github.com/greydragon888/real-router/issues/960))

  - The field was assigned in `setLimits` but read only through `void this.#limits` (a TS6133 suppression) and never consumed. Handler-limit enforcement already reads the live limits from `dependenciesStore` via `getLifecycleApi`, so router behavior is unchanged.
  - Drops the redundant second copy of the limits — its `setLimits` method, the dead wiring call, and the TS/eslint/Stryker suppressions that only existed to prop up the unused field — removing a latent divergence risk between the two stores.

## 0.61.1

### Patch Changes

- [#929](https://github.com/greydragon888/real-router/pull/929) [`76be2cb`](https://github.com/greydragon888/real-router/commit/76be2cbbcb41c4574cbf9b0ae7fa39f40189e461) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden the internal `route-tree` dependency via mutation testing ([#928](https://github.com/greydragon888/real-router/issues/928))

  Test-only and runtime-no-op changes to `route-tree` (consumed by `@real-router/core`): kill surviving mutants with targeted tests, remove dead write-only `MutableRouteNode` fields, and document/disable proven-equivalent mutants — raising its mutation score from 94.62% to 98.90%. No observable behavior change in `@real-router/core`.

## 0.61.0

### Minor Changes

- [#926](https://github.com/greydragon888/real-router/pull/926) [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal: dead-code removal and equivalent-mutant annotations from the core mutation audit ([#925](https://github.com/greydragon888/real-router/issues/925))

  No public API or behaviour change. Removes internal dead code surfaced by mutation testing — the `reverseArray` helper, the dead `getLifecycleFactories` RouterInternals accessor (no production caller — clone rebuilds from definitions), and the unreachable `config === null`, `!state`, and `buildNameFromSegments` fallback guards (all replaced by gated non-null assertions where TypeScript needs the narrowing) — and annotates proven-equivalent mutants with `// Stryker disable`.

- [#926](https://github.com/greydragon888/real-router/pull/926) [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove unused public API surface surfaced by the mutation audit (YAGNI) ([#925](https://github.com/greydragon888/real-router/issues/925))

  - `RouterError` no longer accepts or exposes `redirect`. The field was never produced or consumed by any router code path — guards cannot redirect (`GuardFn` returns `boolean` only), and the supported redirect mechanism is declarative route-config `forwardTo`. A thrown object with a `redirect` key is now carried as plain metadata instead of being rejected. Migration: if you constructed `new RouterError(code, { redirect })`, pass it as a plain custom field (e.g. `{ redirectTo }`).
  - `getDependenciesApi(router).setDependency(...)` now returns `void` instead of an always-`true` `boolean` — the return value was never meaningful.
  - Drops the internal `deepFreezeState` helper (its only caller was the redirect path) and the dead `origin` parameter on the internal `clearCanActivate` / `clearCanDeactivate`.

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/types@0.37.0

## 0.60.2

### Patch Changes

- [#921](https://github.com/greydragon888/real-router/pull/921) [`440c510`](https://github.com/greydragon888/real-router/commit/440c5102a4262bea95d1cd4d5282e0b24b334008) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `getStaticPaths` crashing with `RangeError` on a large static route section ([#920](https://github.com/greydragon888/real-router/issues/920))

  `getStaticPaths` enumerated a subtree's leaf routes via
  `result.push(...getLeafRouteNames(child))`. The spread passes one argument per
  leaf, and V8 caps spread/apply arguments (~124k on Node 24), so a section with
  more static leaf routes than that limit threw
  `RangeError: Maximum call stack size exceeded` — a cryptic failure that reads
  like infinite recursion, not "too many routes". Leaf collection now accumulates
  into a shared array (no spread), which also removes the per-subtree
  intermediate-array allocation. Enumeration order and output are unchanged.

## 0.60.1

### Patch Changes

- [#918](https://github.com/greydragon888/real-router/pull/918) [`13c8b67`](https://github.com/greydragon888/real-router/commit/13c8b672ccff188b1b90214fcc0ac7e0a0b27c99) Thanks [@greydragon888](https://github.com/greydragon888)! - Unify circular `forwardTo` error message ([#916](https://github.com/greydragon888/real-router/issues/916))

  The dynamic forward resolver (`#resolveDynamicForward`) threw `Circular forwardTo detected: …` while the static resolver (`resolveForwardChain`) threw `Circular forwardTo: …`. Both paths now use the same `Circular forwardTo: …` wording. Cosmetic only — no API change; both already threw an `Error` matching `/Circular forwardTo/`.

## 0.60.0

### Minor Changes

- [#907](https://github.com/greydragon888/real-router/pull/907) [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove dead validation machinery ([#906](https://github.com/greydragon888/real-router/issues/906))

  Removes three never-used pieces of validation scaffolding surfaced by the architecture review (finding 2.1):

  - `RouteLifecycleNamespace.#registering` — a `Set` written (`.add`/`.delete`) but never read
  - `RouterValidator.lifecycle.validateNotRegistering` — interface member never called by core
  - `PluginsNamespace.validateNoDuplicatePlugins` static method — never called (the live duplicate check is the `RouterValidator.plugins.validateNoDuplicatePlugins` member, left untouched)

  **Breaking (type-only):** the `validateNotRegistering` member is removed from the exported `RouterValidator` interface. No runtime behavior changes — none of the removed code was on an execution path.

- [#907](https://github.com/greydragon888/real-router/pull/907) [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove dead `BuildStateResultWithSegments` type + internal cleanups ([#911](https://github.com/greydragon888/real-router/issues/911))

  - **Breaking (type-only):** removed the unused public `BuildStateResultWithSegments` type — it had zero consumers across the monorepo despite its `@internal` "used internally" note.
  - Renamed the internal logger-config guard `isLoggerConfig` → `assertLoggerConfig` with an `asserts config is LoggerConfig` signature: it validates-and-throws, so the `is`-predicate name was misleading.
  - Documented the intentional module-global `transitionPath` caches (shared across routers, bounded by route-name vocabulary, not per-router so not cleared on dispose).

### Patch Changes

- [#907](https://github.com/greydragon888/real-router/pull/907) [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache `getRoutesApi` per router ([#910](https://github.com/greydragon888/real-router/issues/910))

  `getRoutesApi(router)` now returns a stable, per-router cached instance (keyed by a `WeakMap`), mirroring `getPluginApi` / `getNavigator`. Avoids re-allocating the API closure bag on repeat calls and gives callers a stable object identity.

- [#907](https://github.com/greydragon888/real-router/pull/907) [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove dead `store.treeOperations` indirection ([#909](https://github.com/greydragon888/real-router/issues/909))

  `getRoutesApi` now calls `commitTreeChanges` / `resetStore` / `nodeToDefinition` via direct static imports instead of a per-store `treeOperations` object. The indirection's stated rationale (avoid static `route-tree` import chains) no longer held — `route-tree` is always bundled into core. Internal only; no API or behavior change.

## 0.59.6

### Patch Changes

- [#899](https://github.com/greydragon888/real-router/pull/899) [`b0d6790`](https://github.com/greydragon888/real-router/commit/b0d6790b8e8052cf23c831d51c686b8241b2b179) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep negative-zero query values as strings under `numberFormat: "auto"` ([#898](https://github.com/greydragon888/real-router/issues/898))

  `search-params` decoded `"-0"` / `"-0.0"` to the number `-0`, which is not round-trippable: `String(-0) === "0"` and `build(-0)` emits `"0"`, so the leading sign was silently dropped (`?q=-0` → `q: -0` → re-serializes as `"0"`). The `auto` strategy now rejects negative zero (`Object.is(num, -0)`), keeping `"-0"` a string — the same non-round-trippable class already excluded for leading-zero / unsafe-int / exponent ([#742](https://github.com/greydragon888/real-router/issues/742)). Fixes a seed-dependent flake in the core query-roundtrip property test.

## 0.59.5

### Patch Changes

- [#893](https://github.com/greydragon888/real-router/pull/893) [`acc8e7d`](https://github.com/greydragon888/real-router/commit/acc8e7da82fbaccc9058fc9d350868ba57cc0d6e) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `routes.update()` silently dropping plugin-defined custom route fields ([#797](https://github.com/greydragon888/real-router/issues/797))

  `getRoutesApi(router).update(name, patch)` previously applied only the
  structural/guard subset of the patch and silently discarded custom
  (plugin-defined) fields — lifecycle hooks, `preload`, `searchSchema`, etc. — so
  `getPluginApi(router).getRouteConfig(name)` kept returning stale values after an
  update. `update` now persists custom fields into the store, symmetric with
  `add`/`replace`.

  Semantics mirror the structural fields:

  - Shallow-merge by patch key — sibling custom fields are preserved.
  - `null` removes a single field; emptying the record drops it entirely
    (`getRouteConfig` returns `undefined`, as after `add` with no custom fields).
  - `undefined` is a no-op (leaves the field untouched).

  Custom-field writes are applied **before** the structural config, so a throwing
  custom-field getter aborts the update before any store write (atomic), mirroring
  a throwing structural getter. Each merge writes a fresh record, so a previously
  cloned router stays isolated from later updates on the source. A custom-field-only
  patch emits no `TREE_CHANGED` event — consumers read custom fields lazily via
  `getRouteConfig`, so the next read observes the new value (the event stays
  structural-only by design).

  The public API surface is unchanged: `RouteConfigUpdate` stays a closed
  interface, and plugins opt into typed custom-field updates by augmenting it (see
  `@real-router/lifecycle-plugin`, `@real-router/preload-plugin`,
  `@real-router/search-schema-plugin`).

- Updated dependencies [[`acc8e7d`](https://github.com/greydragon888/real-router/commit/acc8e7da82fbaccc9058fc9d350868ba57cc0d6e)]:
  - @real-router/types@0.36.1

## 0.59.4

### Patch Changes

- [#889](https://github.com/greydragon888/real-router/pull/889) [`c6560a1`](https://github.com/greydragon888/real-router/commit/c6560a1c7326df939edda51f86fd0c1952d7a5dd) Thanks [@greydragon888](https://github.com/greydragon888)! - Accept the full `LoggerConfig` surface in `createRouter` options ([#789](https://github.com/greydragon888/real-router/issues/789))

  `isLoggerConfig` rejected `level: "none"` and the `callbackIgnoresLevel` key, so `createRouter(routes, { logger: { level: "none" } })` and `createRouter(routes, { logger: { callbackIgnoresLevel: true, callback } })` — both documented in the wiki and supported by `@real-router/logger` — threw a `TypeError` from the constructor. The guard now accepts the complete `LoggerConfig` surface (`"none"` level plus `callbackIgnoresLevel`, validated as a boolean), aligning core with the logger package, the validation plugin, and the wiki. Widens accepted input; not breaking.

## 0.59.3

### Patch Changes

- Updated dependencies [[`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78), [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78), [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78), [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78)]:
  - @real-router/fsm@0.5.0

## 0.59.2

### Patch Changes

- [#883](https://github.com/greydragon888/real-router/pull/883) [`0c668db`](https://github.com/greydragon888/real-router/commit/0c668db717f1716a674feefb766e4615749a74d0) Thanks [@greydragon888](https://github.com/greydragon888)! - Speed up single-listener event dispatch on the depth-tracking emit path ([#751](https://github.com/greydragon888/real-router/issues/751))

  The internal event emitter (bundled into core) special-cased a single listener — skipping the `[...set]` snapshot allocation for a direct call — only on its fast path (`maxEventDepth = 0`). The router runs exclusively on the depth-tracking path (`maxEventDepth = 5`), so single-subscriber events never got the shortcut and allocated a one-element array on every emit. Mirroring the `set.size === 1` shortcut into `#emitWithDepthTracking` makes single-listener emits ~10% faster (measured via mitata A/B, bracketed against run-to-run drift) — every navigation event with a single subscriber benefits. Behavior is unchanged (snapshot-of-one semantics preserved).

- [#883](https://github.com/greydragon888/real-router/pull/883) [`0c668db`](https://github.com/greydragon888/real-router/commit/0c668db717f1716a674feefb766e4615749a74d0) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix heap leak in the internal event emitter for dynamic event names ([#750](https://github.com/greydragon888/real-router/issues/750))

  The internal event emitter (bundled into core) retained a per-event-name record after the last listener was removed: `off()` deleted the listener from its `Set` but never released the now-empty `Set`, and the depth-tracking `emit()` path left a `{name → 0}` entry behind. The only release point was `clearAll()`, so a consumer with **dynamic event names** accumulated one record per name unbounded — `listenerCount()` returned 0, masking the growth.

  `off()` now releases the record (and its warn latch) once the last listener is gone, and the depth-tracking `emit()` path deletes its entry when recursion unwinds to zero. The router uses a fixed set of event names, so it was only latently affected; the primitive is now leak-free for any naming pattern. Adds heap-stress coverage (healthy ~0.03 MB vs pre-fix ~40 MB).

- [#883](https://github.com/greydragon888/real-router/pull/883) [`0c668db`](https://github.com/greydragon888/real-router/commit/0c668db717f1716a674feefb766e4615749a74d0) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix RecursionDepthError being swallowed on the event emitter's fast path ([#751](https://github.com/greydragon888/real-router/issues/751))

  The internal event emitter (bundled into core) documents that `RecursionDepthError` is **always** re-thrown from `emit()`, but the fast path (`maxEventDepth === 0`) routed it to `onListenerError` like an ordinary listener error, while the depth-tracking path re-threw it — a contract divergence between the two paths.

  Both paths now share a single error-handling helper that re-throws the sentinel unconditionally, so a `RecursionDepthError` bubbling up from a nested depth-tracked emitter propagates to the caller regardless of the outer emitter's `maxEventDepth`. The router configures `maxEventDepth = 5` (depth-tracking path) after wiring, so it was unaffected; the fix restores the contract for the generic primitive.

- [#883](https://github.com/greydragon888/real-router/pull/883) [`0c668db`](https://github.com/greydragon888/real-router/commit/0c668db717f1716a674feefb766e4615749a74d0) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix spurious and duplicate listener-limit warnings ([#752](https://github.com/greydragon888/real-router/issues/752))

  The internal event emitter (bundled into core) violated the documented "exactly once" contract for its listener-limit warning. Two cases are fixed:

  - **No warning for a failed registration** — the hard `maxListeners` limit is now checked **before** the warning, so a registration that throws `"Listener limit"` (e.g. when `limits.warnListeners === limits.maxListeners`) no longer emits the "possible memory leak" warning.
  - **Warn exactly once per event** — the warning is latched per emitter+event, so off/on listener churn around the threshold no longer re-fires it. `clearAll()` resets the latch.

## 0.59.1

### Patch Changes

- [#881](https://github.com/greydragon888/real-router/pull/881) [`c2e0392`](https://github.com/greydragon888/real-router/commit/c2e03921f54fd88743ab76d12a589731c5ed436b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `canNavigateTo()` throwing instead of returning a boolean on missing required params ([#725](https://github.com/greydragon888/real-router/issues/725))

  `router.canNavigateTo(name, params?)` is typed as a `boolean` predicate but threw a raw `Error` from `SegmentMatcher.buildPath` when the target route had required path params that were not supplied (e.g. `canNavigateTo("user", {})` for `"/u/:id"`). Building the target state is now guarded: if the path can't be built from the given params, the route is unreachable with that input and the predicate returns `false` instead of throwing. Complete params behave exactly as before (the guards decide the result).

- [#881](https://github.com/greydragon888/real-router/pull/881) [`c2e0392`](https://github.com/greydragon888/real-router/commit/c2e03921f54fd88743ab76d12a589731c5ed436b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `subscribeLeave` signal aborting on successful navigation and never aborting on the no-guards path ([#722](https://github.com/greydragon888/real-router/issues/722))

  The `signal` in the `subscribeLeave` payload now aborts **only** when the navigation is cancelled — superseded by a newer `navigate()`, `stop()`, `dispose()`, or an external `opts.signal` abort — and **never** on successful completion, consistently across both the guard and no-guards pipeline paths.

  - **Guard path (over-abort):** the internal `AbortController` was aborted unconditionally on every settle (including success), so a listener that captured the signal saw `aborted === true` after a navigation that actually succeeded.
  - **No-guards path (under-abort):** the sync-listener branch never tracked its controller, so the signal never aborted — not even when the navigation was superseded mid-leave.

  Cleanup now distinguishes successful completion from cancellation: on success the controller is released without aborting, and the no-guards path is routed through the same cancellation-aware cleanup as the guard path. The external-`opts.signal` bridge is detached explicitly so it cannot leak onto a reused signal.

- [#881](https://github.com/greydragon888/real-router/pull/881) [`c2e0392`](https://github.com/greydragon888/real-router/commit/c2e03921f54fd88743ab76d12a589731c5ed436b) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop the `Router` constructor from mutating the caller's `options` object ([#724](https://github.com/greydragon888/real-router/issues/724))

  The constructor extracted the logger config with `delete options.logger`, mutating the object the caller passed in — so reusing the same `options` (e.g. to build a second router or read it back) silently lost the `logger` key. The logger config is now read via a non-mutating destructure; the caller's object is left untouched and can be reused across routers.

  Note: `@real-router/logger` remains a process-global singleton — `options.logger` configures one shared logger for the whole process and the last `configure()` wins across routers/`cloneRouter()` (now documented in `RouterOptions`). Per-router logger isolation is out of scope for this fix.

- [#881](https://github.com/greydragon888/real-router/pull/881) [`c2e0392`](https://github.com/greydragon888/real-router/commit/c2e03921f54fd88743ab76d12a589731c5ed436b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix stale `areStatesEqual` / `isActiveRoute` after route-tree mutations ([#723](https://github.com/greydragon888/real-router/issues/723))

  The per-route-name URL-param cache that backs `areStatesEqual()` and `isActiveRoute()` was invalidated only on `dispose()`, so a route-tree mutation that changed a route's param shape (e.g. `getRoutesApi(router).replace(...)` turning `/item/:id` into `/item/:id/:tab`) left both comparisons frozen to the pre-mutation shape.

  The cache now lives at the routes layer (next to `getUrlParams`, where it is derived from the matcher) and is cleared on every matcher rebuild — covering `add` / `remove` / `replace` / `clear` through both the in-place rebuild and the prepare-then-commit (`replace`) paths. This keeps the comparisons in lock-step with the current tree without subscribing to `TREE_CHANGED` (which would defeat the listener-gated diff optimization).

## 0.59.0

### Minor Changes

- [#867](https://github.com/greydragon888/real-router/pull/867) [`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep the committed state when a `start` interceptor rejects after commit ([#763](https://github.com/greydragon888/real-router/issues/763))

  A `start` interceptor that throws _after_ `next(path)` already committed the state and emitted `TRANSITION_SUCCESS` — the window where the SSR/RSC loader plugins run their loader — no longer rolls the router back to IDLE. Subscribers had already observed the success, so retracting it left a "phantom success": the event fired, then `getState()` went back to `undefined`.

  - Post-commit interceptor rejection: the committed state stands, `isActive()` stays `true`, and the loader error surfaces only through the rejected `start()` promise (the "Loader errors propagate" contract is preserved).
  - Pre-commit failures (route not found, a blocked activation guard, a sync interceptor throw before `next()`) are unchanged — the half-started FSM still unwinds to IDLE (two-phase start).

  Breaking for code that relied on a rejected `start()` always leaving the router un-started: after a post-commit interceptor failure the router is now started, so a retry must `stop()` first (a second `start()` rejects with `ROUTER_ALREADY_STARTED`).

## 0.58.1

### Patch Changes

- [#866](https://github.com/greydragon888/real-router/pull/866) [`3f9d3cf`](https://github.com/greydragon888/real-router/commit/3f9d3cfcc54cfecc543d6ed2c2378e1088fabde8) Thanks [@greydragon888](https://github.com/greydragon888)! - Suppress spurious "Unexpected navigation error" logs for guard-blocked fire-and-forget navigation ([#721](https://github.com/greydragon888/real-router/issues/721))

  Add `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` to the fire-and-forget unhandled-rejection safety net's suppressed-error set. A guard returning `false` — or a plugin's guard-blocked `back()` / `forward()` routed through `navigateToState()` — is an expected navigation outcome, not an internal bug, yet such fire-and-forget calls previously emitted a misleading `logger.error("router.navigate", "Unexpected navigation error", …)`. Awaiting callers and `onTransitionError` plugins still receive the rejection.

- [#866](https://github.com/greydragon888/real-router/pull/866) [`3f9d3cf`](https://github.com/greydragon888/real-router/commit/3f9d3cfcc54cfecc543d6ed2c2378e1088fabde8) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix fire-and-forget unhandled rejection on `navigateToState()` and `navigateToDefault()` ([#721](https://github.com/greydragon888/real-router/issues/721))

  Restore the documented fire-and-forget safety invariant for two navigation entry points that leaked an `unhandledRejection` when the returned promise was not awaited:

  - `getPluginApi(router).navigateToState(state)` with a route no longer in the tree — the fresh `ROUTE_NOT_FOUND` rejection wrongly set the "skip suppression" flag reserved for pre-suppressed cached rejections, so the facade never attached its `.catch()`.
  - `router.navigateToDefault()` with no `defaultRoute`, called after `router.start()` — the method did not reset the sync-resolution flag on entry, so it read the stale `true` left by `start()` and took the "already resolved" branch, skipping suppression.

  Awaiting callers are unaffected: the rejection is still observable via `await`/`.catch()`.

## 0.58.0

### Minor Changes

- [#861](https://github.com/greydragon888/real-router/pull/861) [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `booleanFormat: "empty-true"` losing `false` to a string ([#743](https://github.com/greydragon888/real-router/issues/743))

  With `booleanFormat: "empty-true"`, `build({ flag: false })` emits `"flag=false"`
  but `parse` returned the string `"false"` instead of boolean `false`, so the value
  did not round-trip. The strategy's decode now recognizes both `"true"` and `"false"`
  as booleans, mirroring its encoding.

  - `parse("flag=false", { booleanFormat: "empty-true" })` → `{ flag: false }` (was `{ flag: "false" }`)
  - Array elements carry explicit values (`"a=true&a=false"`); both now decode back
    to booleans, removing the `false`→bool / `true`→string asymmetry
  - Scalar `true` is still key-only (`?flag`) and decodes to `true`

  Breaking for code that relied on `empty-true` params being read as the strings
  `"true"`/`"false"`.

- [#861](https://github.com/greydragon888/real-router/pull/861) [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `numberFormat: "auto"` type asymmetry for negative numbers ([#742](https://github.com/greydragon888/real-router/issues/742))

  Under the default `numberFormat: "auto"`, negative numeric query params parsed from
  a URL stayed strings (`/x?n=-5` → `"-5"`) while the same value passed programmatically
  via `navigate("x", { n: -5 })` was stored as a number. The two code paths now agree:
  canonical negatives decode to `Number`, so a param keeps the same type regardless of
  how it arrives.

  - `parse("n=-5", { numberFormat: "auto" })` → `{ n: -5 }` (was `{ n: "-5" }`)
  - `build({ n: -5 })` → `"n=-5"` now round-trips back to the number `-5`
  - Non-canonical negatives (leading-zero `"-007"`, unsafe-int `"-9007199254740992"`)
    and exponent notation still stay strings, preserving their exact text

  Breaking for code that relied on negative URL params staying strings under `auto`.

### Patch Changes

- [#861](https://github.com/greydragon888/real-router/pull/861) [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix route constraints being validated against the raw (pre-decode) URL segment ([#857](https://github.com/greydragon888/real-router/issues/857))

  `SegmentMatcher.match()` checked a route's constraint regex on the raw path segment
  before percent-decoding it, but returned (and constrained `buildPath` on) the decoded
  value — so the constraint described a different string than the one delivered.

  Constraints are now validated **after** decoding, on the value the consumer receives:

  - `/users/%35` (decodes to `5`) now matches `/:id<\d+>` instead of resolving to
    UNKNOWN_ROUTE — a legitimately over-encoded value is no longer wrongly rejected.
  - A raw form that satisfied the regex but decoded to a value that did not (`/%41`
    under `/:n<.{3}>` → `"A"`) is now rejected instead of being returned (violating the
    route's own constraint) and crashing `start()` via `rewritePathOnMatch → buildPath`.

  `build → match` round-trips are unaffected (`buildPath` already emits canonical
  values). Found in the 2026-06-18 path-matcher architecture review.

- [#861](https://github.com/greydragon888/real-router/pull/861) [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `arrayFormat: "index"` ignoring the bracket index when parsing ([#856](https://github.com/greydragon888/real-router/issues/856))

  `parse` accumulated bracketed elements in insertion order and ignored the numeric
  index in `a[n]`, so an out-of-order indexed query was returned in arrival order:

  - `parse("a[2]=z&a[0]=x&a[1]=y", { arrayFormat: "index" })` → `{ a: ["z","x","y"] }`
    (now `{ a: ["x","y","z"] }`)

  `parse` now orders index-format elements by their bracket index. Indices are sorted
  and the array is compacted, so a huge index (`a[1000000]`) does not allocate a
  sparse array; non-numeric/empty brackets (`a[]`, `a[x]`) fall back to insertion
  order. `build → parse` is unchanged (build already emits indices in order).

- [#861](https://github.com/greydragon888/real-router/pull/861) [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix query keys that shadow `Object.prototype` members corrupting parsed params ([#855](https://github.com/greydragon888/real-router/issues/855))

  A query parameter whose name matched an inherited `Object.prototype` member
  (`valueOf`, `constructor`, `toString`, `hasOwnProperty`, …) was mis-detected as a
  pre-existing value during parsing, corrupting the result into
  `{ valueOf: [<function>, "x"] }`. A literal `__proto__` key was silently dropped.

  Collision detection now uses `Object.hasOwn`, and assignment uses `defineProperty`
  for `__proto__`, so such keys decode to plain own properties:

  - `?constructor=x` → `{ constructor: "x" }` (was `{ constructor: [<fn>, "x"] }`)
  - `?__proto__=x` → `{ __proto__: "x" }` as an own property (was dropped)

  Found via property-based testing of key encoding.

- [#861](https://github.com/greydragon888/real-router/pull/861) [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject a name-less route marker (bare `:` or `*`) at registration ([#858](https://github.com/greydragon888/real-router/issues/858))

  A marker with no name — `/files/*`, `/users/:`, or one carrying only a modifier
  (`:?`, `:<\d+>`) — compiled to a phantom empty-named slot: `match()` captured the
  value under an empty key (`{ "": "x" }`) while `buildPath()` emitted a literal
  `:`/`*` and `buildParamMeta` reported no param at all — a three-way match/build/meta
  desync of the same class as [#736](https://github.com/greydragon888/real-router/issues/736)/[#738](https://github.com/greydragon888/real-router/issues/738). `createRouter` now throws a descriptive
  `[SegmentMatcher.registerTree] Empty parameter name …` at registration for both
  markers, at every child-creation site (param branch, optional fork, splat).

## 0.57.2

### Patch Changes

- [#853](https://github.com/greydragon888/real-router/pull/853) [`30da63d`](https://github.com/greydragon888/real-router/commit/30da63d6c467b537174aa628cb99f43293e44fc6) Thanks [@greydragon888](https://github.com/greydragon888)! - Freeze nested `paramMeta` on the route tree ([#747](https://github.com/greydragon888/real-router/issues/747))

  The route tree is documented as immutable, but the nested `paramMeta` object and
  its `urlParams`/`queryParams`/`spatParams` arrays were left mutable — a tree
  reachable from the public API (`getPluginApi(router).getTree()`) could be
  mutated via e.g. `node.paramMeta.urlParams.push(...)`. They are now frozen,
  closing the immutability contract (invariant CC1).

  `constraintPatterns` is a `Map`, which `Object.freeze` cannot make read-only; it
  stays protected at the type level via `ReadonlyMap` and is documented as an
  explicit CC1 exception.

- [#853](https://github.com/greydragon888/real-router/pull/853) [`30da63d`](https://github.com/greydragon888/real-router/commit/30da63d6c467b537174aa628cb99f43293e44fc6) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the dead `staticPath` cache from `RouteTree` ([#748](https://github.com/greydragon888/real-router/issues/748))

  Internal cleanup. `RouteTree.staticPath` was computed at build time but read by no
  runtime consumer — the matcher recomputes its own static paths — and it held a
  wrong value for a static route nested under a pathless grouping node (e.g.
  `b.staticPath` was `"/b"` instead of `"/a/b"` for `/a` → `""` → `/b`). Matching
  never read it, so runtime behavior is unchanged; the unused, latent-buggy field
  is gone.

  The field is removed from the `RouteTree` type exposed via
  `getPluginApi(router).getTree()`. Nothing reads it in practice; if you derived a
  URL from `node.staticPath`, build it from `node.path` / the route chain or use
  `router.buildPath(name)`. Also drops `computeStaticPath`/`joinPaths` per-build
  work and a few hundred bundle bytes, and retires invariant CC1.

## 0.57.1

### Patch Changes

- [`7f63a6d`](https://github.com/greydragon888/real-router/commit/7f63a6dbd2b04fcbf8f53b8deb7c1364a5571a08) Thanks [@greydragon888](https://github.com/greydragon888)! - Set `RouterError.name` to `"RouterError"`

  `RouterError` previously inherited `error.name` as `"Error"` from the base
  `Error` class (subclasses don't auto-set it). It now sets
  `this.name = "RouterError"` in the constructor, so `error.name`-based checks —
  logging, serialization, and cross-bundle `instanceof`-free detection
  (`error.name === "RouterError"`) — work correctly. This mirrors the existing
  `RecursionDepthError` pattern.

  `toJSON()` output is unchanged: `name` is excluded as class metadata (like
  `stack`), so serialized errors keep their existing shape.

## 0.57.0

### Minor Changes

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject an empty required param value at build time ([#740](https://github.com/greydragon888/real-router/issues/740))

  `buildPath` treated `""` for a **required** param as a valid value and produced a
  collapsed segment that silently matched the parent route:

  ```js
  buildPath("users.profile", { id: "" }); // → "/users/" (matched parent "users", not "users.profile")
  ```

  It now throws, the same way a missing (`undefined`/`null`) required param does:

  ```
  [SegmentMatcher.buildPath] Missing required param 'id' (empty string)
  ```

  **Breaking (pre-1.0 → minor):** code that relied on the previous silent
  collapse must pass a non-empty value (or use a splat/optional param). Optional
  params are unaffected. Part of the utils-audit path-matcher hardening
  cluster ([#740](https://github.com/greydragon888/real-router/issues/740)).

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject param-name aliasing at registration instead of corrupting matches ([#736](https://github.com/greydragon888/real-router/issues/736))

  **Breaking Change (pre-1.0):** Two routes that share a parametric (`:name`) or splat (`*name`) **position** in the URL trie under **different** names are now rejected at registration with a clear error, instead of silently capturing the parameter under the first-registered route's name.

  Previously a config like:

  ```js
  createRouter([
    { name: "user", path: "/user/:id" },
    {
      name: "userP",
      path: "/user/:slug",
      children: [{ name: "profile", path: "/profile" }],
    },
  ]);
  ```

  would compile, then crash on `start("/user/joe/profile")` with a misleading `Missing required param 'slug'` — because the shared `/user/:…` position bound the value under `id` (first registration wins), and `rewritePathOnMatch` then rebuilt the path under `slug`.

  Now this throws immediately at `createRouter()` / route registration:

  ```
  [SegmentMatcher.registerTree] Parameter name conflict at the same path position:
  ':id' and ':slug'. A parametric URL segment binds to a single name across every
  route that shares that position …
  ```

  **Migration:** use one agreed name for the shared position (e.g. `:id` in both routes). A single route's own consecutive optional params (`/a/:b?/:c?/d`) are unaffected — only cross-route collisions are rejected.

### Patch Changes

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Unify build-path and match-path param grammars ([#738](https://github.com/greydragon888/real-router/issues/738))

  The build-path param grammar was narrower than the match-path grammar, so
  `matchPath` accepted patterns/names that `buildPath` then rejected with
  `Missing required param` — crashing `router.start()` on valid configs via
  `rewritePathOnMatch`. Two mechanisms, one root cause (no single source of truth
  for "what a parameter is / how it is named"):

  ```js
  // (a) lazy quantifier '?' inside a constraint
  await createRouter([{ name: "a", path: "/a/:id<\\d?>" }]).start("/a/5");
  // before: throws "Missing required param 'id'"  →  now: matches, id="5"

  // (b) hyphen (or '.', '~', …) in a param name
  await createRouter([{ name: "h", path: "/h/:my-param" }]).start("/h/v");
  // before: throws "Missing required param 'my'"  →  now: matches, "my-param"="v"
  ```

  - **(a)** `buildParamMeta` now detects the query separator on a length-preserving
    mask that neutralizes `?` inside `<...>` constraints (and the optional-param
    marker), so a constraint's lazy quantifier no longer truncates `pathPattern`
    or drops the constraint.
  - **(b)** The build-path name class is derived from a single `PARAM_NAME_PATTERN`
    shared with the match-path grammar, so a name that matches always builds under
    the same key. The canonical param-name set is now any char except `/`, `?`,
    `<` (not just `\w`).

  Non-breaking: existing `\w` names and constraints are unaffected; only
  previously-crashing configs now work.

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop `start()` crashing on valid-hex/invalid-UTF-8 percent sequences ([#737](https://github.com/greydragon888/real-router/issues/737))

  `SegmentMatcher.match()` threw a `URIError` on a percent sequence that is
  syntactically valid (`%XX` with hex digits) but semantically invalid UTF-8
  (e.g. `%E0%41`, `%C0%80`, `%FF`). `validatePercentEncoding` only checks `%XX`
  syntax, so `decodeURIComponent` later threw — and through core, `router.start()`
  crashed and left the router inactive instead of resolving the unmatched URL.

  ```js
  const r = createRouter([
    { name: "users", path: "/users", children: [{ name: "p", path: "/:id" }] },
  ]);
  await r.start("/users/%E0%41"); // before: throws URIError; after: ROUTE_NOT_FOUND / UNKNOWN_ROUTE
  ```

  `match()` now honors its never-throw contract: a `URIError` during param
  decoding (`#decodeParams`) or query parsing (`#buildResult`) makes `match()`
  return `undefined`, so the router resolves to `UNKNOWN_ROUTE` (with
  `allowNotFound`) or rejects with the normal `ROUTE_NOT_FOUND` instead of
  crashing. The query path (`?x=%E0%41`) had the same gap via the injected
  parser and is fixed too. Behavior is unchanged for all valid URLs.

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Parse an optional param immediately followed by a query string ([#741](https://github.com/greydragon888/real-router/issues/741))

  `buildParamMeta` mis-parsed a route whose optional param marker is directly
  followed by a query — e.g. `/users/:id??tab` (`:id?` optional + `?tab` query).
  The optional `?` was taken as the query separator, yielding `queryParams: ["?tab"]`
  (a spurious `?`) and a `pathPattern` that lost the optional marker, so the route
  registered and matched incorrectly.

  The optional-marker regex now treats a following query `?` as a valid marker
  boundary, so `/users/:id??tab` parses as optional param `id` + query param `tab`.
  Same class as [#738](https://github.com/greydragon888/real-router/issues/738) (marker-vs-query-separator); surfaced by a new model-based
  property suite for `buildParamMeta`.

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix O(2^N) trie registration for consecutive optional params ([#849](https://github.com/greydragon888/real-router/issues/849))

  Registering a route with N consecutive optional params (e.g.
  `/x/:a?/:b?/.../:z?`) took exponential time: every optional forked the trie
  insertion into a take-the-param and a skip-the-param branch, and those branches
  re-explored the same `(node, position)` pairs without memoization (N=22 ≈ 475 ms,
  doubling per added optional). The resulting trie was small — only the work blew
  up — so a pathological route config could hang router startup.

  `insertIntoTrieFrom` now records visited `(node, start)` pairs per insertion and
  skips repeats. Inserting from a given `(node, start)` is deterministic and its
  side effects are idempotent, so this is behavior-preserving (same trie, same
  matches) and collapses the fan-out to polynomial — N=40 now registers in well
  under a millisecond. A stress guard locks the sub-second ceiling.

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Strip a URL fragment that appears after a query string ([#842](https://github.com/greydragon888/real-router/issues/842))

  `SegmentMatcher.match()` did not strip a fragment (`#…`) when it followed a
  query string: the single-pass scanner returns at the first `?`, so a later `#`
  was folded into the query string and parsed into a param value — e.g.
  `/users/v?ref=1#section` captured `ref: "1#section"` instead of `ref: "1"`,
  corrupting both declared and undeclared query params (reachable via
  `router.start(url)`). This violated the documented hash-stripping contract
  (INVARIANTS Path Rejection [#3](https://github.com/greydragon888/real-router/issues/3)).

  `#preparePath` now strips the fragment from the query substring with a native
  `indexOf("#")` (only when a query exists, ~free), so a fragment is removed
  before query parsing regardless of whether it follows the path or a query.
  The hash-stripping property test previously only built query-less paths, so the
  bug survived the whole suite; a `path?query#fragment` property + unit tests were
  added.

- [#832](https://github.com/greydragon888/real-router/pull/832) [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16) Thanks [@greydragon888](https://github.com/greydragon888)! - Match rootPath only at a segment boundary ([#740](https://github.com/greydragon888/real-router/issues/740))

  With a configured `rootPath`, `SegmentMatcher.match()` stripped the prefix with a
  bare `startsWith` and no boundary check, then lost the leading `/` of the
  remainder. A path that merely shared the prefix string mis-routed: under root
  `/app`, `/apple` matched the route `/e` (the `l` was silently eaten as a phantom
  leading slash).

  `match()` now accepts a rooted path only when it equals the root or continues it
  at a `/` segment boundary, and the stripped remainder always keeps its leading
  `/` — for roots declared with or without a trailing slash. Prefix-only paths
  (`/apple` under `/app`) now correctly return `undefined`.

  Closes the rootPath mis-routing item of the utils-audit path-matcher cluster ([#740](https://github.com/greydragon888/real-router/issues/740)).

## 0.56.0

### Minor Changes

- [#717](https://github.com/greydragon888/real-router/pull/717) [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the dead `add` interceptable wrapper ([#702](https://github.com/greydragon888/real-router/issues/702))

  **Breaking change:** `getRoutesApi(router).add` is no longer wrapped in the
  interceptor chain — `addInterceptor("add", fn)` has no effect (the `add` key was
  removed from `InterceptableMethodMap`). The sole consumer migrated to
  `subscribeChanges`. `add()` now calls the internal `addRoutes` directly, removing
  the per-call interceptor lookup. No change to `add()`'s public behavior or
  signature.

- [#717](https://github.com/greydragon888/real-router/pull/717) [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae) Thanks [@greydragon888](https://github.com/greydragon888)! - Emit `TREE_CHANGED` on route-tree mutations via `getRoutesApi().subscribeChanges` ([#702](https://github.com/greydragon888/real-router/issues/702))

  `getRoutesApi(router)` now exposes `subscribeChanges(handler)` — a single,
  fire-and-forget channel for observing **structural** route-tree mutations. It is
  emitted post-commit by `add` / `remove` / `replace` / `clear`, and by `update`
  only when the patch contains a structural field (`forwardTo` / `defaultParams` /
  `encodeParams` / `decodeParams`); guard-only and empty patches stay silent.

  ```typescript
  const routes = getRoutesApi(router);
  const unsubscribe = routes.subscribeChanges((event) => {
    switch (event.op) {
      case "add":
        event.added.forEach(register);
        break;
      case "remove":
        event.removedSubtree.forEach((r) => cache.delete(r.name));
        break;
      // update / replace / clear ...
    }
  });
  ```

  The channel reuses the router's existing `EventEmitter`, so recursion-depth
  protection (`maxEventDepth`) and per-listener error isolation apply
  automatically. `RecursionDepthError` (from `@real-router/event-emitter`) is now
  re-exported from `@real-router/core` so callers can `instanceof`-check the one
  error that escapes a `subscribeChanges` handler.

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/types@0.36.0

## 0.55.0

### Minor Changes

- [#700](https://github.com/greydragon888/real-router/pull/700) [`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `getRoutesApi` route mutations atomic ([#698](https://github.com/greydragon888/real-router/issues/698))

  `add`, `replace`, and `update` previously mutated the route store before running
  steps that can throw (circular/async `forwardTo`, invalid path constraint) and had
  no rollback, so without `@real-router/validation-plugin` a failed call left a torn
  store: a duplicate name silently overwrote a live route, a failed `replace` lost the
  whole tree, and a cycle-creating `update({ forwardTo })` poisoned the forward map so a
  later unrelated `add` threw.

  `add` and `replace` now build the new tree, config, and forward map into local
  structures and only swap them into the store once the build has fully succeeded — so
  a rejected call throws and leaves the existing routes untouched. `update({ forwardTo })`
  resolves the forward chain on a candidate map before committing, so a cycle no longer
  corrupts state. Adding a route whose name already exists, or under a missing `parent`,
  now throws a clear error instead of silently overwriting a live route or crashing with
  a `TypeError`, regardless of whether the validation plugin is installed.

## 0.54.6

### Patch Changes

- [#678](https://github.com/greydragon888/real-router/pull/678) [`e876dca`](https://github.com/greydragon888/real-router/commit/e876dca7d721ed216b03573fe2624773c2c2bee0) Thanks [@greydragon888](https://github.com/greydragon888)! - Snapshot leave-listeners before emit and freeze the leave payload ([#662](https://github.com/greydragon888/real-router/issues/662))

  Two one-line fixes in `EventBusNamespace.awaitLeaveListeners`:
  1. `for (const listener of [...this.#leaveListeners])` — a listener that
     reentrantly calls `subscribeLeave(newFn)` or its own `unsubscribe()` no
     longer affects the current emit cycle. Symmetric with the EventEmitter
     snapshot invariant landed in [#659](https://github.com/greydragon888/real-router/issues/659)/[#666](https://github.com/greydragon888/real-router/issues/666).
  2. `Object.freeze(leaveState)` — the `{ route, nextRoute, signal }` payload
     passed to leave listeners is now frozen. Mutation attempts on the wrapper
     (`payload.extra = …`, `payload.route = null`) throw in strict mode.
     `payload.route` / `payload.nextRoute` were already deep-frozen via the
     State immutability invariant; this closes the wrapper-mutation gap.

  JSDoc on `EventBusNamespace.subscribe` / `subscribeLeave` / `addEventListener`
  documents the duplicate-registration contract:
  - `addEventListener` (plugin API) — strict, throws on same-reference duplicate.
  - `subscribe` (end-user) — independent, fires N times for N registrations.
  - `subscribeLeave` (end-user) — independent registrations; `unsubscribe` uses
    `indexOf` semantics so net effect is correct but physical slot ordering
    differs from call order (irrelevant unless you reflect on the internal array).

  Wiki pages (`subscribe.md`, `leave.md`, `addEventListener.md`) updated to
  match. No behaviour change for `subscribe` or `addEventListener`.

## 0.54.5

### Patch Changes

- [#676](https://github.com/greydragon888/real-router/pull/676) [`acbacc7`](https://github.com/greydragon888/real-router/commit/acbacc7f38d6995e7a272eb6176f6d31e4ce1395) Thanks [@greydragon888](https://github.com/greydragon888)! - Lift guard origin to a primary invariant in `RouteLifecycleNamespace` ([#661](https://github.com/greydragon888/real-router/issues/661))

  `RouteLifecycleNamespace` previously stored canActivate / canDeactivate
  factories in a single Map per kind and tracked "is this guard from a
  route definition vs added externally" via auxiliary `Set<string>`
  collections. Origin was a derived, Set-tracked property that the public
  API had to reconstruct, with a handful of subtle consequences for
  `removeActivateGuard`, `replace()`, and `cloneRouter`.

  Storage is now split per origin: `#definitionActivateFactories` /
  `#externalActivateFactories` (and symmetric pair for deactivate). The
  compiled-function view preserves the pre-refactor "last add wins"
  runtime semantic; on partial clear it falls back to whichever origin
  Map still holds the slot.

  Behavioural changes:
  - `clearCanActivate(name, origin?)` / `clearCanDeactivate(name, origin?)`
    accept an optional `origin` filter (`"definition"` / `"external"`).
    Default behaviour (no filter) is unchanged — both slots cleared.
  - `getFactoriesByOrigin()` added for `cloneRouter` consumption — returns
    `{ definition: [deactivate, activate], external: [deactivate, activate] }`
    so clones re-register guards with the original origin flag preserved.
    `replace()` on the clone now correctly strips inherited definition
    guards via `clearDefinitionGuards()`.
  - `getFactories()` retains its `[deactivate, activate]` flat shape with
    external winning over definition for the same slot — backward compatible
    with `getRoutesApi` and the route-removal cleanup path.

  Non-goals: this refactor does not address closure-sharing across
  clones (`base.deps` / `base.externalGuards` shared by reference — see
  [#664](https://github.com/greydragon888/real-router/issues/664) for the documented SSR usage rule: singletons → base, per-request
  → clone via the override slot or `createRequestScope`).

- [#673](https://github.com/greydragon888/real-router/pull/673) [`98a85e2`](https://github.com/greydragon888/real-router/commit/98a85e2e19ac48a43b06f351a02760b1c3ce1681) Thanks [@greydragon888](https://github.com/greydragon888)! - Unblock navigation pipeline when a `subscribeLeave` listener ignores its abort signal ([#663](https://github.com/greydragon888/real-router/issues/663))

  `EventBusNamespace.awaitLeaveListeners` awaited leave-listener promises via
  `Promise.allSettled` without observing the abort signal. A
  `subscribeLeave(() => new Promise(() => {}))` (or any listener that ignores
  `payload.signal`) hung the pipeline forever — concurrent `router.navigate`
  calls aborted the controller but `allSettled` kept waiting, so no
  navigation could complete.

  `settleLeavePromises` now races `Promise.allSettled` against the abort
  signal: when the signal aborts, the returned Promise rejects with
  `signal.reason` and the navigation pipeline unwinds via the normal
  `TRANSITION_CANCELLED` path. The abort event listener is cleaned up on
  natural completion to avoid leaking handlers.

  **Semantic note for plugin authors:** listeners that have not settled by
  abort time are **abandoned** — their Promises may still resolve in the
  background and hold references via closure until they do. Long-running
  leave listeners must respect `payload.signal` for cooperative cleanup. The
  router cannot synchronously force a hung Promise to resolve.

## 0.54.4

### Patch Changes

- [#674](https://github.com/greydragon888/real-router/pull/674) [`dd6e19a`](https://github.com/greydragon888/real-router/commit/dd6e19a05285518975b7225dfe45e5e21d60960e) Thanks [@greydragon888](https://github.com/greydragon888)! - Document `cloneRouter` shallow-merge dependency semantics for SSR multi-tenancy ([#664](https://github.com/greydragon888/real-router/issues/664))

  Clarifies in JSDoc and `IMPLEMENTATION_NOTES.md` that
  `base.dependencies` values are shared by reference between the base
  router and every clone (singleton services like DB clients depend on
  this). Per-request mutable state — `currentUser`, `traceId`,
  `sessionId` — must flow through the `cloneRouter` override parameter
  or `createRequestScope`, never `base.dependencies`. No behaviour
  change.

## 0.54.3

### Patch Changes

- [#670](https://github.com/greydragon888/real-router/pull/670) [`516906f`](https://github.com/greydragon888/real-router/commit/516906f401c264179117d40b643381b65c781e17) Thanks [@greydragon888](https://github.com/greydragon888)! - Recover FSM from STARTING when start pipeline throws ([#668](https://github.com/greydragon888/real-router/issues/668))

  `Router.start()` advanced the FSM `IDLE → STARTING` before running the
  start-interceptor pipeline, but the `.catch` block only recovered from
  `READY`. A sync-throwing or async-rejecting start interceptor left the FSM
  stuck in `STARTING` with no FAIL emitted: subsequent `start()` calls rejected
  with `ROUTER_ALREADY_STARTED` forever, `stop()` was a no-op, and the only
  escape was `dispose()`.

  `start()` now wraps the interceptor pipeline so sync throws become
  rejections, and the `.catch` block also recovers from `STARTING` by emitting
  `sendFail()` to return the FSM to `IDLE`. A misbehaving start interceptor
  no longer bricks the router — the caller can drop the bad plugin and retry.

## 0.54.2

### Patch Changes

- [#669](https://github.com/greydragon888/real-router/pull/669) [`a80ef22`](https://github.com/greydragon888/real-router/commit/a80ef226b83417bbd2927bed7c031d236cc09945) Thanks [@greydragon888](https://github.com/greydragon888)! - Settle FSM at DISPOSED regardless of pre-dispose state ([#660](https://github.com/greydragon888/real-router/issues/660))

  `routerFSM` only declared `DISPOSE → DISPOSED` from `IDLE`. If the FSM was
  stuck in `STARTING` (e.g. the start pipeline threw between `sendStart()` and
  `sendStarted()/sendFail()` — typically a misbehaving start interceptor),
  the subsequent `sendDispose()` was a no-op and `isActive()` / `isDisposed()`
  returned stale truth after `router.dispose()`. Mutating methods were already
  guarded by `#markDisposed()`, but the state-query API leaked the stuck-FSM
  state.

  `DISPOSE → DISPOSED` is now wired from `STARTING`, `READY`,
  `TRANSITION_STARTED`, and `LEAVE_APPROVED` so `dispose()` always settles the
  FSM at `DISPOSED`. Healthy flows are unaffected — the facade still routes
  through `IDLE` via `stop()`/`sendCancelIfPossible()`.

## 0.54.1

### Patch Changes

- [#666](https://github.com/greydragon888/real-router/pull/666) [`a12a9de`](https://github.com/greydragon888/real-router/commit/a12a9de6c9dd3c100af601995d5450a9fc9f9d0d) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix EventEmitter snapshot invariant when depth tracking is enabled and only one listener exists ([#659](https://github.com/greydragon888/real-router/issues/659))

  `#emitWithDepthTracking` skipped the snapshot copy for listener sets of size 1
  and iterated the live `Set` directly, so a listener registered reentrantly
  inside the lone listener fired in the current emit cycle instead of waiting
  for the next one. Since core uses `maxEventDepth: 5`, this affected every
  reentrant `router.subscribe(...)` call made while only one subscriber was
  registered for the same event.

## 0.54.0

### Minor Changes

- [#658](https://github.com/greydragon888/real-router/pull/658) [`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `state.transition.replace` for portable push/replace discrimination across URL plugins ([#658](https://github.com/greydragon888/real-router/issues/658))

  `TransitionMeta` gains an optional `replace?: boolean` field, written in three places — symmetric with the existing `reload` / `redirected` flags:
  - `completeTransition()` lifts `opts.replace` from `NavigationOptions` (including the result of `forceReplaceFromUnknown()`, Invariant 12)
  - `navigateToNotFound()` writes `replace: true` inline, mirroring the `FROZEN_REPLACE_OPTS` plugins already see via `onTransitionSuccess`'s 3rd argument (Invariant 7)
  - `DEFAULT_TRANSITION` is unchanged

  Subscribers can now portably discriminate replace transitions under any URL plugin (browser, hash, navigation, memory, or no plugin):

  ```ts
  router.subscribe(({ route }) => {
    if (route.transition.replace) return; // skip programmatic redirects / corrections / auto-replace from UNKNOWN_ROUTE
    analytics.pageView(route.path);
  });
  ```

  Existing usage of `state.context.navigation.navigationType === "replace"` (navigation-plugin only) continues to work — the two signals complement each other. See `packages/core/CLAUDE.md` → "Core vs plugin signals" for the side-by-side comparison.

  The new field is additive, optional, and zero API-breaking on the core type level. It is stripped from `serializeRouterState` along with the rest of `transition` (per-navigation meta is meaningless after hydration).

## 0.53.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createRequestScope(req, base, deps)` SSR helper ([#603](https://github.com/greydragon888/real-router/issues/603))

  New utility export from `@real-router/core/utils` that bundles the four-step
  per-request boilerplate every server entry repeats:
  1. `new AbortController()` per request
  2. `req.on("close", () => controller.abort())`
  3. `cloneRouter(base, { ...deps, abortSignal: signal })`
  4. `try { ... } finally { router.dispose() }`

  ```typescript
  import { createRequestScope } from "@real-router/core/utils";

  export async function render(url: string, req: IncomingMessage) {
    const scope = createRequestScope(req, baseRouter, { currentUser });
    try {
      scope.router.usePlugin(ssrDataPluginFactory(loaders));
      return await renderShell(scope.router, url);
    } finally {
      await scope.dispose();
    }
  }
  ```

  Accepts both Node `IncomingMessage` (subscribes to its `"close"` event) and
  Web `Request` shapes (uses `request.signal` directly). The injected
  `abortSignal` is available to loaders via `getDep("abortSignal")` for
  cooperative cancellation.

  The scope also implements `Symbol.asyncDispose`, so `await using scope = …`
  is supported on Node 24+, Bun, Deno, and modern browsers (Chrome/Edge 127+,
  Firefox 141+). On Node 22 LTS the well-known symbol is unavailable, so the
  bundled SSR examples use the explicit `try/finally` form shown above for
  maximum compatibility — see JSDoc for the full runtime matrix.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `serialize` / `deserialize` options to SSR helpers for non-JSON types ([#606](https://github.com/greydragon888/real-router/issues/606))

  `serializeState`, `serializeRouterState`, and `hydrateRouter` now accept an
  optional user-supplied serializer pair. The defaults remain `JSON.stringify`
  and `JSON.parse` — pass `devalue.stringify` / `devalue.parse` (or
  `superjson.stringify` / `superjson.parse`) to round-trip non-JSON types
  (`Date` / `Map` / `Set` / `RegExp` / `BigInt`) through SSR transport.

  The custom serializer's output is still XSS-escaped (`<` / `>` / `&` →
  `<` / `>` / `&`) before embedding into the inline `<script>`
  tag — XSS safety remains a property of `serializeState`, independent of
  which serializer produced the JSON.

  `devalue` and `superjson` are not bundled — install whichever you prefer as
  a peer dependency.

  ```typescript
  // Server
  import * as devalue from "devalue";
  import { serializeRouterState } from "@real-router/core/utils";

  const json = serializeRouterState(state, { serialize: devalue.stringify });
  const html = `<script>window.__SSR_STATE__=${json}</script>`;

  // Client
  import { hydrateRouter } from "@real-router/core/utils";

  await hydrateRouter(router, window.__SSR_STATE__, {
    deserialize: devalue.parse,
  });
  ```

  New types exported from `@real-router/core/utils`:
  - `Serialize` — `(data: unknown) => string`
  - `Deserialize` — `(json: string) => unknown`
  - `SerializeStateOptions` — `{ serialize?: Serialize }`
  - `HydrateRouterOptions` — `{ deserialize?: Deserialize }`

  `SerializeRouterStateOptions` gains an optional `serialize` field alongside
  the existing `excludeContext`. Both are non-breaking — existing call sites
  without options continue to use `JSON.stringify` / `JSON.parse` unchanged.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Eliminate post-hydration loader re-run via one-shot hydration scratchpad ([#596](https://github.com/greydragon888/real-router/issues/596))

  `hydrateRouter()` now deposits the parsed `SerializedRouterState` (incl. plugin
  context namespaces) onto a one-shot internal scratchpad before delegating to
  `router.start(parsed.path)`, then clears it in `finally`. SSR loader plugins
  read the scratchpad via a monorepo-internal helper to skip their loader call
  when the server-resolved value is already present — avoiding the duplicate
  loader fire on first paint.

  The new `SerializedRouterState` type is exported from `@real-router/core/utils`
  to give consumers a stable name for the parsed-state shape produced by
  `serializeRouterState()`.

## 0.52.0

### Minor Changes

- [#572](https://github.com/greydragon888/real-router/pull/572) [`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `excludeContext` option to `serializeRouterState` for non-JSON-serializable plugin namespaces ([#566](https://github.com/greydragon888/real-router/issues/566))

  New optional second parameter `{ excludeContext?: readonly string[] }` strips named namespaces from the serialized JSON. Required by `@real-router/rsc-server-plugin` (which writes `ReactNode` to `state.context.rsc`), but useful for any plugin publishing non-JSON-serializable values.

  Backward compatible: omitting the second argument preserves existing behavior.

## 0.51.0

### Minor Changes

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - core: SSR hydration helpers — serializeRouterState + hydrateRouter ([#563](https://github.com/greydragon888/real-router/issues/563))

  Two new utilities in `@real-router/core/utils` for the SSR transport layer:

  **`serializeRouterState(state)`** — XSS-safe JSON serialization of a router State for SSR → client transport. Strips `state.transition` (per-navigation `TransitionMeta` — meaningless after hydration; the client's transition is regenerated on commit). Keeps `name`, `params`, `path`, and `context` (so `state.context.<namespace>` payloads from plugin claims survive transport).

  ```ts
  // Server
  const state = await router.start(req.url);
  const html = `<script>window.__SSR_STATE__=${serializeRouterState(state)}</script>`;
  ```

  **`hydrateRouter(router, source)`** — convenience helper accepting either a JSON string or a `{ path: string }` object. Internally extracts `state.path` and delegates to `router.start(state.path)` — the canonical URL is the source of truth on hydration. No new Router method, no overload of `start()`.

  ```ts
  // Client
  declare global {
    interface Window {
      __SSR_STATE__?: { path: string };
    }
  }

  const router = createAppRouter();
  router.usePlugin(browserPluginFactory());

  const ssrState = window.__SSR_STATE__;
  if (ssrState) {
    await hydrateRouter(router, ssrState);
  } else {
    await router.start();
  }
  ```

  **Why path-only:** `state.path` is the canonical URL produced by the server's full pipeline. When the client calls `router.start(state.path)`, `matchPath` resolves the same name + params, and (URL-deterministic) `forwardState`/`buildPath` interceptors reproduce identical state. Bypassing those interceptors on hydration would mask non-idempotent interceptor design rather than fix it. The `transition` strip is the only structural concession needed for SSR transport — everything else is application-level data flow.

  For server-side `state.context.<namespace>` payloads (e.g. `ssr-data-plugin`'s `state.context.data`): read them from `window.__SSR_STATE__` directly in app code (data-layer concern: TanStack Query `dehydrate`/`hydrate`, store rehydration, etc.). The router doesn't carry context across hydration — plugins write context on the client during their own lifecycle hooks.

  See `SSR-Hydration` wiki page for the full pattern.

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - Add plugin-only `getPluginApi(router).navigateToState(state, opts)` ([#525](https://github.com/greydragon888/real-router/issues/525))

  New navigation primitive on `PluginApi`: takes a fully-built `State`
  (typically from `getPluginApi(router).matchPath(url)`) and skips the
  redundant `forwardState`+`buildPath` round-trip that
  `router.navigate(name, params)` runs inside `buildNavigateState`. The
  committed `state.path` is the matched path verbatim, fixing the
  `trailingSlash:"preserve"` divergence where the URL bar said `/users/`
  but `state.path` got canonicalized to `/users` ([#525](https://github.com/greydragon888/real-router/issues/525), Q2).
  - Plugin-only — NOT exposed on the public `Router` or `Navigator`
    interfaces. Plugin internal hot path, deliberately hidden from userland
    autocomplete.
  - `forwardState` and `buildPath` interceptors do NOT run on this path —
    matchPath already applied `forwardState`, and the URL the user
    navigated to is the source of truth (no buildPath rewrite). For
    programmatic navigation that must apply interceptors (e.g.
    `persistent-params-plugin` injecting query params), use
    `router.navigate(name, params)` as before.
  - `getPluginApi(router)` is now WeakMap-cached per router (mirrors
    `getNavigator`) so `vi.spyOn(getPluginApi(router), "navigateToState")`
    attaches to the same object the plugin instance holds. Avoids repeated
    closure-bag allocations.
  - `start(path)` migrated to commit `matchPath(path)` via the new
    primitive, sharing the same code path as URL plugin popstate handlers.

  Benchmark on the `popstate-roundtrip.bench.ts` fixtures (Apple silicon,
  Node 24): `api.navigateToState` is **0.13–0.83 µs faster per call** than
  the old `router.navigate(matched.name, matched.params)` round-trip across
  flat / nested-4 / search-params / forwardTo / defaultParams /
  trailingSlash:"preserve" fixtures (5–20% reduction).

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/types@0.35.0

## 0.50.2

### Patch Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix two `isActiveRoute` bugs in the hierarchical (ancestor) branch ([#536](https://github.com/greydragon888/real-router/issues/536), [#537](https://github.com/greydragon888/real-router/issues/537))
  - **`ignoreQueryParams` is now honored symmetrically** with the exact-match
    branch. When a parent route declares query-typed `defaultParams` (e.g.
    `path: "/products?sort"`, `defaultParams: { sort: "asc" }`) and a descendant
    state lacks the query value (e.g. `/products/6` → `params: { id: "6" }`), an
    ancestor link `<Link routeName="products" />` now correctly resolves as
    active under the default `ignoreQueryParams=true`. URL-typed defaults are
    still enforced; passing `ignoreQueryParams=false` keeps the strict behavior
    unchanged.
  - **Descendant-of-active links no longer spuriously match.** When the link's
    `routeName` is a descendant of the active route name (e.g. you are on
    `/users`, the link points to `users.settings`), the link is no longer
    reported as active — it is a navigation option, not an active state.
    Standard ancestor-match semantics apply; only exact match and
    ancestor-of-active relations resolve to `true`.

## 0.50.1

### Patch Changes

- [#522](https://github.com/greydragon888/real-router/pull/522) [`204b00f`](https://github.com/greydragon888/real-router/commit/204b00f07165561b05c8446a94d382d6f10142aa) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `shouldUpdateNode("")` to always return `true`, matching the documented "Root — ALL route changes" contract ([#519](https://github.com/greydragon888/real-router/issues/519))

  Root node `""` has no route-level identity — it represents the whole tree. Every adapter's docs state `useRouteNode("")` returns "ALL route changes"; the implementation, however, skipped updates when a transition's intersection was non-root (e.g. `users → users.user`, intersection = `"users"`). This was correct for nested-pattern layouts (each subtree has its own `useRouteNode("users")`) but wrong for flat patterns and for any code subscribing to `useRouteNode("")` directly for logging or cross-cutting concerns.

  Symptom: root-level `<RouteView nodeName="">` with dot-notated Match segments like `<Match segment="users.user" exact>` never switched the active Match on parent→child, sibling-subtree, or child→parent transitions, even though the URL and `useRoute()` both updated correctly. Reproducible under every adapter (React, Preact, Solid, Vue, Svelte, Angular) and every plugin (browser-plugin, navigation-plugin, hash-plugin).

  The fix is a two-line change in core `RoutesNamespace.shouldUpdateNode`: when `nodeName === DEFAULT_ROUTE_NAME`, return `true` unconditionally (instead of only on initial navigation). All adapter `RouteView` implementations receive the fix automatically via their shared `createRouteNodeSource` subscription. Two existing core tests that encoded the buggy behaviour as the contract are updated; adapter tests continue to pass unchanged.

  No public API change. Consumers of `useRouteNode("")` may observe more re-renders per navigation, but each adapter's source already applies `stabilizeState` by `path`, so no-op transitions (identical URL) still deduplicate. This is a correctness fix aligning behaviour with the documented contract.

  Verified end-to-end: `examples/tauri/react-navigation` e2e 8/8 (was 0/8), `examples/tauri/react` parent→child render works with browser-plugin (was broken).

## 0.50.0

### Minor Changes

- [#487](https://github.com/greydragon888/real-router/pull/487) [`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `PluginApi.emitTransitionError(error)` ([#483](https://github.com/greydragon888/real-router/issues/483))

  Plugins can now emit `$$error` events without going through the navigation pipeline. Delegates to `eventBus.sendFailSafe` internally with the current router state as `fromState` and `toState: undefined`. Safe to call at any FSM state.

  Used by `@real-router/browser-plugin`, `@real-router/navigation-plugin`, and `@real-router/hash-plugin` to surface strict-mode errors (`ROUTE_NOT_FOUND` on unmatched URL) through the standard `onTransitionError` hook instead of silently falling back to `navigateToDefault()`.

## 0.49.0

### Minor Changes

- [#484](https://github.com/greydragon888/real-router/pull/484) [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23) Thanks [@greydragon888](https://github.com/greydragon888)! - Honor `Promise<State>` contract for `navigateToDefault()` synchronous errors ([#471](https://github.com/greydragon888/real-router/issues/471))

  `navigateToDefault()` is declared to return `Promise<State>`, but synchronous exceptions thrown by `deps.resolveDefault()` (e.g., a `DefaultRouteCallback` that throws, or a validator that rejects a callback's return value) escaped the Promise chain and surfaced as uncaught sync exceptions on the call site.

  The body of `navigateToDefault()` now wraps `resolveDefault()` in a try/catch and converts synchronous throws into `Promise.reject`, so callers can uniformly handle errors via `.catch()` / `await`.

  Internal hook for `@real-router/validation-plugin`: new `RouterValidator.options.validateResolvedDefaultRoute(routeName, store)`, invoked from `resolveDefault()` when `options.defaultRoute` is a callback.

### Patch Changes

- [#484](https://github.com/greydragon888/real-router/pull/484) [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23) Thanks [@greydragon888](https://github.com/greydragon888)! - Honor `trailingSlash: "preserve"` when `rewritePathOnMatch` is active ([#471](https://github.com/greydragon888/real-router/issues/471))

  Previously `trailingSlash: "preserve"` was silently overridden by `rewritePathOnMatch: true` (the default): the matcher built the canonical path with the trailing slash stripped, ignoring whether the source URL had one. Since both options are default-on, every user hitting a URL like `/users/` ended up with `state.path === "/users"` even though `"preserve"` promised the opposite.

  `matchPath()` now re-attaches a trailing slash to the rewritten path when the source had one and `trailingSlash: "preserve"` is set. Rewrite semantics (forwardTo, encoders, defaultParams merging) are unchanged — only trailing-slash handling is respected per the option's documented meaning.

## 0.48.1

### Patch Changes

- [#481](https://github.com/greydragon888/real-router/pull/481) [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f) Thanks [@greydragon888](https://github.com/greydragon888)! - Document the public `params` contract in README ([#465](https://github.com/greydragon888/real-router/issues/465))

  Added explicit documentation of how `navigate()` and `buildPath()` handle each value type in `params`:
  - `undefined` → stripped (documented contract, not implementation detail)
  - `null` → `?key` (key-only)
  - `""` → `?key=` (explicit empty value, distinct from `null`)
  - Falsy-but-defined values (`0`, `false`, `""`) preserved
  - Number and boolean auto-coercion on parse

  Tables for input (`params` object) and output (URL → `state.params`) semantics.

  Cross-references to `search-params` and `search-schema-plugin` README for configuration and schema integration.

- [#481](https://github.com/greydragon888/real-router/pull/481) [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f) Thanks [@greydragon888](https://github.com/greydragon888)! - Lock `undefined` params contract at core boundary ([#465](https://github.com/greydragon888/real-router/issues/465))

  `router.navigate(name, { x: undefined })` and `router.buildPath(name, { x: undefined })` are now guaranteed to produce URLs without `x` **by core itself**, not transitively through the query-string engine. Plugin interceptors that introduce `undefined` values into `forwardState` output are also normalized away before they reach URL and `state.params`.

  **Behavior change:** `state.params` no longer contains keys whose values are `undefined` after navigation — `"x" in state.params` is `false`, not `true` with `state.params.x === undefined`. The serialized URL is unchanged; only the in-memory `state.params` shape is tightened.

  **Internal:** `defaultQueryString` fallback removed from `path-matcher` (dead code, internal package). `SegmentMatcher` now requires `parseQueryString`/`buildQueryString` as mandatory options; `search-params` remains the only engine used by the public API.

  Groundwork for the query-param semantics contract defined in the RFC (`packages/core/.claude/rfc/rfc-query-param-semantics.md`).

## 0.48.0

### Minor Changes

- [#445](https://github.com/greydragon888/real-router/pull/445) [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `PluginApi.claimContextNamespace()` and shallow-freeze refactor ([#434](https://github.com/greydragon888/real-router/issues/434))

  New `claimContextNamespace(namespace)` helper on `PluginApi` — follows the same architectural model as the existing `extendRouter()` API: closure-based ownership, manual `release()` in plugin teardown, dispose safety net for forgotten releases. Uses `Set<string>` for O(1) conflict detection, registration, release, and safety-net clear.

  ```typescript
  const myPlugin: PluginFactory = (router) => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("navigation");

    return {
      onTransitionSuccess(toState, fromState) {
        claim.write(toState, {
          direction: detectDirection(fromState, toState),
        });
      },
      teardown() {
        claim.release();
      },
    };
  };

  // Later, in components:
  route.context.navigation?.direction;
  ```

  `claim.write(state, value)` is a literal one-line property assignment — zero overhead on the hot path (no validator dispatch, no optional chain, no runtime checks). `claim.release()` is naturally idempotent via `Set.delete`.

  Core enforces one runtime invariant: `CONTEXT_NAMESPACE_ALREADY_CLAIMED` — a namespace can be held by at most one active claim. Double-claiming throws a `RouterError` with this code. Orphaned claims (plugin forgot to release in teardown) are cleaned up by the dispose safety net.

  **Freeze pipeline refactored from recursive to targeted shallow freezing.** Previously, `freezeStateInPlace()` deep-froze every nested object on every navigation. Now the producers of each nested structure freeze at creation time (`params` in `makeState`, `segments`/`transition` in `buildTransitionMeta`, `deactivated`/`activated` arrays), and the final step is a single shallow `Object.freeze(state)`. `state.context` is **intentionally not frozen** so plugins can publish data after state creation. `deepFreezeState()` is unchanged (still used by `RouterError.redirect`).

  **New error code:** `CONTEXT_NAMESPACE_ALREADY_CLAIMED`.

  **Plugin authors:** if you want to protect your payload from subscriber mutation, freeze it yourself at the call site (`claim.write(state, Object.freeze(payload))`). Same model as `extendRouter()`.

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/types@0.34.0

## 0.47.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/fsm@0.4.0
  - @real-router/logger@0.3.0
  - @real-router/types@0.33.0

## 0.46.0

### Minor Changes

- [#432](https://github.com/greydragon888/real-router/pull/432) [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1) Thanks [@greydragon888](https://github.com/greydragon888)! - Support async `subscribeLeave` listeners for exit animations and View Transitions ([#391](https://github.com/greydragon888/real-router/issues/391))

  Leave listeners move from EventEmitter to separate array with `Promise.allSettled` error handling. Independent listeners survive each other's failures. `AbortSignal` enables cooperative cancellation on concurrent navigation.

### Patch Changes

- [#432](https://github.com/greydragon888/real-router/pull/432) [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize navigate hot path for async leave overhead ([#391](https://github.com/greydragon888/real-router/issues/391))

  Skip `AbortController.abort()` on sync leave path, defer `NavigationContext` to async branch, move `isCurrentNav` closure to guards block. Benchmarks vs master: 0 listeners −29%, 1 sync listener −7%, 3 sync listeners −11%.

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/types@0.32.0

## 0.45.3

### Patch Changes

- Updated dependencies [[`15e7758`](https://github.com/greydragon888/real-router/commit/15e7758ed2ef4536bf332ac30cdace880951acea)]:
  - @real-router/fsm@0.3.0

## 0.45.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/fsm@0.2.4
  - @real-router/logger@0.2.3
  - @real-router/types@0.31.2

## 0.45.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/fsm@0.2.3
  - @real-router/logger@0.2.2
  - @real-router/types@0.31.1

## 0.45.0

### Minor Changes

- [#406](https://github.com/greydragon888/real-router/pull/406) [`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add interceptable `add` method for route addition hooks ([#406](https://github.com/greydragon888/real-router/issues/406))

  The `add` method in `getRoutesApi()` is now interceptable via `addInterceptor("add", fn)`. Plugins can hook into dynamic route additions to perform validation or side effects when routes are added at runtime.

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/types@0.31.0

## 0.44.2

### Patch Changes

- [#400](https://github.com/greydragon888/real-router/pull/400) [`a42f2ed`](https://github.com/greydragon888/real-router/commit/a42f2ed0bcc046103d075e8b5634ac50ba6a613e) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize path-matcher hot path: splat backtracking, static result caching, property access ([#386](https://github.com/greydragon888/real-router/issues/386))
  - Skip splat backtracking when splat node has no children (-36% splat match)
  - Pre-compute frozen `MatchResult` for static routes — zero-alloc fast path (-12% static match)
  - Cache `caseSensitive` and decode function on instance to avoid per-segment property chain (-13% dynamic match)

## 0.44.1

### Patch Changes

- [#398](https://github.com/greydragon888/real-router/pull/398) [`0d64c34`](https://github.com/greydragon888/real-router/commit/0d64c34d826a2941921ebaa2ca029d6c51a318b4) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix comma array format decode — `parse("items=a,b,c", {arrayFormat: "comma"})` now returns array ([#396](https://github.com/greydragon888/real-router/issues/396))

- [#398](https://github.com/greydragon888/real-router/pull/398) [`0d64c34`](https://github.com/greydragon888/real-router/commit/0d64c34d826a2941921ebaa2ca029d6c51a318b4) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `numberFormat: "auto"` lossy roundtrip for leading zeros and unsafe integers ([#396](https://github.com/greydragon888/real-router/issues/396))

  `"00"`, `"007"` now stay as strings instead of being parsed as `0`, `7`. Integers beyond `Number.MAX_SAFE_INTEGER` also stay as strings to prevent precision loss.

## 0.44.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `LEAVE_APPROVED` FSM state, `TRANSITION_LEAVE_APPROVE` event, `router.subscribeLeave()` ([#391](https://github.com/greydragon888/real-router/issues/391))

  New FSM state `LEAVE_APPROVED` between deactivation and activation guard phases.
  New event `TRANSITION_LEAVE_APPROVE` fires when deactivation is confirmed but before state changes.
  New public API `router.subscribeLeave(listener)` for leave side-effects (scroll save, analytics, cleanup).
  New query `router.isLeaveApproved()` to distinguish deactivation-passed sub-phase.
  Renamed FSM state `TRANSITIONING` → `TRANSITION_STARTED`.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/types@0.30.0

## 0.43.0

### Minor Changes

- [#389](https://github.com/greydragon888/real-router/pull/389) [`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780) Thanks [@greydragon888](https://github.com/greydragon888)! - Change default `booleanFormat` and `numberFormat` to `"auto"` ([#387](https://github.com/greydragon888/real-router/issues/387))

  **Breaking Change:** Default query parameter options now auto-detect types:
  - `booleanFormat`: `"none"` → `"auto"` (`"true"`/`"false"` parsed as booleans)
  - `numberFormat`: `"none"` → `"auto"` (numeric strings parsed as numbers)

  Use `{ booleanFormat: "none", numberFormat: "none" }` to restore previous behavior.

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/types@0.29.0

## 0.42.0

### Minor Changes

- [#384](https://github.com/greydragon888/real-router/pull/384) [`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `numberFormat` option to router query params ([#383](https://github.com/greydragon888/real-router/issues/383))

  New `numberFormat` option (`"none"` | `"auto"`) in `queryParams` configuration. When set to `"auto"`, numeric query parameter values (e.g. `?page=1&price=12.5`) are automatically parsed as numbers instead of strings. Defaults to `"none"` (no behavior change).

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/types@0.28.0

## 0.41.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Internalize `State.meta`, remove `forceId` pipeline, optimize `areStatesEqual` ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `State.meta` is no longer part of the public API. `forceId` parameter removed from `makeState`.
  - `reload` and `redirected` flags moved to `state.transition`
  - `transitionPath` accepts optional `opts` parameter for reload detection
  - `shouldUpdateNode` reads `reload` from `state.transition` instead of `state.meta.options`
  - Removed `EMPTY_OPTIONS` constant, `cleanOpts` helper, `getUrlParamsFromMeta` helper
  - Removed `meta.id`, `#stateId` counter, `forceId` parameter (dead code — nobody read `meta.id`)
  - Route param type mapping stored in `WeakMap<State, Params>` (no wrapper object)
  - `areStatesEqual` uses cached `#urlParamsCache` instead of WeakMap lookup
  - `freezeStateInPlace` no longer freezes internal meta
  - `areStatesEqual` and `areParamValuesEqual` use `for` loops instead of `.every()`

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/types@0.27.0

## 0.40.1

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `areStatesEqual` with path comparison in `isSameNavigation` ([#364](https://github.com/greydragon888/real-router/issues/364))

  Use `fromState.path === toState.path` instead of O(n) param iteration to detect duplicate navigations. Path is the canonical representation of (name, params) — single string comparison on every `navigate()` call.

## 0.40.0

### Minor Changes

- [#362](https://github.com/greydragon888/real-router/pull/362) [`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `getStaticPaths()` utility for SSG pre-rendering ([#335](https://github.com/greydragon888/real-router/issues/335))

  New `getStaticPaths(router, entries?)` function in `@real-router/core/utils` enumerates all leaf routes from the router tree and builds their URLs. For dynamic routes (`:id`), accepts an `entries` map providing parameter sets to pre-render.

  ```typescript
  import { getStaticPaths } from "@real-router/core/utils";

  const paths = await getStaticPaths(router, {
    "users.profile": async () => [{ id: "1" }, { id: "2" }],
  });
  // → ["/", "/users", "/users/1", "/users/2"]
  ```

  Also exports `StaticPathEntries` type for the `entries` parameter.

## 0.39.0

### Minor Changes

- d1ebff8: `usePlugin()` silently skips `false`, `null`, and `undefined` values (#341)

  Enables inline conditional plugin registration:

  ```typescript
  router.usePlugin(
    browserPlugin(),
    __DEV__ && loggerPlugin(),
    hasConsent && analyticsPlugin(),
  );
  ```

  Falsy values are filtered before validation. If all values are falsy, returns a noop unsubscribe function.

- d1ebff8: Breaking: remove `noValidate` option — validation is now opt-in via plugin (#334)

  The `noValidate: true` router option has been removed. Validation is now disabled by default and enabled by registering `@real-router/validation-plugin`.

  **Before:**

  ```typescript
  const router = createRouter(routes, { noValidate: true }); // disable validation
  ```

  **After:**

  ```typescript
  const router = createRouter(routes); // validation off by default
  router.usePlugin(validationPlugin()); // opt in
  ```

  Core now ships with lightweight crash guards only (`guardDependencies`, `guardRouteStructure`). Full DX validation (descriptive errors, argument shape checks, forwardTo cycle detection) requires the plugin.

  The `resolveForwardChain` function is now always used in `refreshForwardMap` (previously conditional on `noValidate`). This is a behavioral change: forward chain resolution now always runs, which is the correct behavior.

### Patch Changes

- d1ebff8: Extract remaining DX validators behind `ctx.validator` and remove `type-guards` from bundle (#334)

  Phase 2 of validation extraction: 17 new `RouterValidator` slots, setter injection for `PluginsNamespace` and `RouteLifecycleNamespace`, `type-guards` removed from `noExternal` (no longer bundled). Core bundle reduced by ~3.6 kB (brotli).

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/types@0.26.0

## 0.38.0

### Minor Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/core/utils` subpath with `serializeState()` ([#298](https://github.com/greydragon888/real-router/issues/298))

  New subpath export `@real-router/core/utils` with XSS-safe JSON serialization for embedding data in HTML `<script>` tags during SSR.

  ```typescript
  import { serializeState } from "@real-router/core/utils";

  const json = serializeState(data);
  const html = `<script>window.__STATE__=${json}</script>`;
  ```

  Escapes `<`, `>`, and `&` to Unicode equivalents to prevent `</script>` injection.

## 0.37.0

### Minor Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `getRouteConfig` from `getRoutesApi` to `getPluginApi` ([#320](https://github.com/greydragon888/real-router/issues/320))

  **Breaking Change:** `getRouteConfig()` is no longer available on the object returned by `getRoutesApi(router)`. Use `getPluginApi(router).getRouteConfig(routeName)` instead.

  `getRouteConfig` reads custom route config fields — a tool for **plugins**, not for route CRUD operations. Moving it to `getPluginApi` reflects its actual purpose: enabling config-driven plugins that read `title`, `loadData`, and other custom fields from route definitions.

  **Migration:**

  ```diff
  - import { getRoutesApi } from "@real-router/core/api";
  - const config = getRoutesApi(router).getRouteConfig("users");
  + import { getPluginApi } from "@real-router/core/api";
  + const config = getPluginApi(router).getRouteConfig("users");
  ```

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: unified structure with npm/bundlejs badges, compact API tables, tree-shakeable API section with `getRouteConfig` in `getPluginApi`. ARCHITECTURE: reduced from 983 to 430 lines — removed API reference (now in README/wiki), added Boundaries, fixed FIFO→LIFO, added stress test coverage table.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/fsm@0.2.2
  - @real-router/logger@0.2.1
  - @real-router/types@0.24.0

## 0.36.2

### Patch Changes

- [#316](https://github.com/greydragon888/real-router/pull/316) [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize navigate() — 6x speedup, 5x fewer allocations ([#307](https://github.com/greydragon888/real-router/issues/307))

  Optimistic sync execution eliminates async overhead when no guards are registered.
  Systematic allocation reduction across the navigate pipeline: merged state construction,
  single-pass freeze chain, cached error paths, segment array reuse, FSM dispatch bypass.
  Guard pipeline refactored from three-function coroutine to flat loop with zero sync-path regression.

- Updated dependencies [[`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836), [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836)]:
  - @real-router/fsm@0.2.1
  - @real-router/types@0.23.1

## 0.36.1

### Patch Changes

- [#309](https://github.com/greydragon888/real-router/pull/309) [`ac442b7`](https://github.com/greydragon888/real-router/commit/ac442b7813339946839a77012e1709866b2c6c77) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix reentrant `navigate()` in event listener wiping `#currentToState` ([#308](https://github.com/greydragon888/real-router/issues/308))

  `sendComplete()`, `sendFail()`, and `sendCancel()` now use reentrancy-aware cleanup: `#currentToState` is only cleared if no reentrant `navigate()` set a new value during `fsm.send()`. Prevents `undefined` being passed as `toState` to `TRANSITION_CANCEL` listeners when `router.stop()` is called after a reentrant navigation with async guards.

## 0.36.0

### Minor Changes

- [#303](https://github.com/greydragon888/real-router/pull/303) [`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c) Thanks [@greydragon888](https://github.com/greydragon888)! - Move standalone API getters to `@real-router/core/api` subpath export ([#297](https://github.com/greydragon888/real-router/issues/297))

  **Breaking Change:** `getPluginApi`, `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `cloneRouter` and types `PluginApi`, `RoutesApi`, `DependenciesApi`, `LifecycleApi` are no longer exported from `@real-router/core`.

  **Migration:**

  ```diff
  - import { createRouter, getPluginApi } from "@real-router/core";
  - import type { Router, PluginApi } from "@real-router/core";
  + import { createRouter } from "@real-router/core";
  + import { getPluginApi } from "@real-router/core/api";
  + import type { Router } from "@real-router/core";
  + import type { PluginApi } from "@real-router/core/api";
  ```

## 0.35.2

### Patch Changes

- [#278](https://github.com/greydragon888/real-router/pull/278) [`e826769`](https://github.com/greydragon888/real-router/commit/e82676983e5711a73e115e7e19e0833556a18a4a) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache `getNavigator()` result per router via `WeakMap` ([#271](https://github.com/greydragon888/real-router/issues/271))

  `getNavigator()` no longer allocates a new frozen object on every call. A module-level `WeakMap<Router, Navigator>` cache ensures one navigator per router instance. `WeakMap` does not prevent garbage collection of the router.

## 0.35.1

### Patch Changes

- [#245](https://github.com/greydragon888/real-router/pull/245) [`5d00dd5`](https://github.com/greydragon888/real-router/commit/5d00dd52894687ac884a625a450e6c8ad8b989ff) Thanks [@greydragon888](https://github.com/greydragon888)! - Simplify error routing and consolidate namespace DI ([#244](https://github.com/greydragon888/real-router/issues/244))

  Internal refactoring with no public API changes:
  - Merge `sendTransitionBlocked` + `sendTransitionError` into single `sendTransitionFail`
  - Apply `send*`/`emit*` naming convention to EventBusNamespace methods
  - Eliminate `TransitionDependencies` interface, merge into `NavigationDependencies`
  - Replace `setRouter()` + `getDependency` with `compileFactory` in RouteLifecycle and Plugins namespaces
  - Extract `throwIfDisposed` to shared `api/helpers.ts`
  - Move guard-checking loop from `Router.canNavigateTo()` to `RouteLifecycleNamespace.canNavigateTo()`
  - Merge `resolveDefaultRoute` + `resolveDefaultParams` into `resolveDefault()`

- [#245](https://github.com/greydragon888/real-router/pull/245) [`5d00dd5`](https://github.com/greydragon888/real-router/commit/5d00dd52894687ac884a625a450e6c8ad8b989ff) Thanks [@greydragon888](https://github.com/greydragon888)! - Abort in-flight transition when `navigateToNotFound()` is called ([#244](https://github.com/greydragon888/real-router/issues/244))

  Previously, calling `navigateToNotFound()` during an active async transition left two concurrent state mutations racing against each other. Now `navigateToNotFound()` aborts the in-flight transition via `AbortController` and sends FSM CANCEL event before setting state.

## 0.35.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `navigateToNotFound()` method and export `UNKNOWN_ROUTE` constant ([#241](https://github.com/greydragon888/real-router/issues/241))

  New synchronous `router.navigateToNotFound(path?: string): State` method that replaces the current state with `UNKNOWN_ROUTE` without changing the URL. Emits a transition success event with full transition metadata (deactivated/activated segments) for contextual 404 pages.

  ```typescript
  import { UNKNOWN_ROUTE } from "@real-router/core";

  const state = router.navigateToNotFound("/missing-page");
  // state.name === UNKNOWN_ROUTE
  // state.path === "/missing-page"
  // state.params === {}
  // state.transition.segments.deactivated — previously active segments
  ```

  **Breaking Change:** `start()` with an unknown path now produces `state.params === {}` instead of `state.params === { path: "/..." }`. The path is available via `state.path`.

### Patch Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Eliminate cyclic wiring by delegating `start()` to `navigate()` ([#241](https://github.com/greydragon888/real-router/issues/241))

  Internal refactoring: `RouterLifecycleNamespace.start()` now calls `deps.navigate()` instead of directly invoking `navigateToState()`. This removes `wireCyclicDeps()` entirely, moves `setCanNavigate` into `wireNavigationDeps()`, and extracts `buildSuccessState`, `stripSignal`, and `routeTransitionError` to standalone functions. Adds `fromState &&` fast-path guard in `navigate()` to skip `areStatesEqual` on first navigation.

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0

## 0.34.1

### Patch Changes

- [#239](https://github.com/greydragon888/real-router/pull/239) [`4f20885`](https://github.com/greydragon888/real-router/commit/4f20885cb9b07c67848c45c79f5624e079cb9f42) Thanks [@greydragon888](https://github.com/greydragon888)! - Block public API mutations on internal `@@`-prefixed routes ([#238](https://github.com/greydragon888/real-router/issues/238))

  Routes with the `@@` prefix (e.g. `@@router/UNKNOWN_ROUTE`) are reserved for internal use. Previously, `validateRouteName` bypassed all validation for `@@` names, allowing users to add, remove, update, or replace system routes through the public API.

  Added `throwIfInternalRoute` and `throwIfInternalRouteInArray` validators that throw when CRUD operations target `@@`-prefixed routes. Read operations and guard registration remain allowed. `noValidate: true` bypasses the check for internal callers.

## 0.34.0

### Minor Changes

- [#232](https://github.com/greydragon888/real-router/pull/232) [`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b) Thanks [@greydragon888](https://github.com/greydragon888)! - Implement `extendRouter()` in `getPluginApi()` with conflict detection and dispose cleanup (#231)

  `getPluginApi(router).extendRouter(extensions)` adds properties to the router instance and returns an unsubscribe function that removes them. Throws `PLUGIN_CONFLICT` if any key already exists on the router. `router.dispose()` automatically cleans up any extensions that plugins failed to remove in their `teardown`.

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0

## 0.33.0

### Minor Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace per-method interceptor APIs with universal `addInterceptor` (#224)

  **BREAKING CHANGE:** `addBuildPathInterceptor`, `setForwardState`, and `getForwardState` have been replaced with a single `addInterceptor(method, fn)` API. New interceptable method `start` added for browser-plugin to call `router.start()` without arguments.

  **Migration:**

  ```diff
  - api.addBuildPathInterceptor(fn);
  + api.addInterceptor('buildPath', (next, route, params) => next(route, modifiedParams));

  - api.setForwardState(fn);
  + api.addInterceptor('forwardState', (next, name, params) => next(name, params));
  ```

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `navigateToState` from public `PluginApi` (#227)

  **BREAKING CHANGE:** `navigateToState` is no longer available in the plugin API. Plugins should use `router.navigate()` instead, which goes through the full navigation pipeline including middleware, guards, and interceptors.

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0

## 0.32.0

### Minor Changes

- [#221](https://github.com/greydragon888/real-router/pull/221) [`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `addBuildPathInterceptor` to `PluginApi` (#220)

  Plugins can now register buildPath param interceptors via `getPluginApi(router).addBuildPathInterceptor()`. Multiple interceptors execute in FIFO registration order. Each returns an `Unsubscribe` function for safe teardown.

  ```typescript
  const api = getPluginApi(router);
  const unsubscribe = api.addBuildPathInterceptor((routeName, params) => {
    return { ...params, lang: getCurrentLang() };
  });
  ```

  All `buildPath` call paths (facade, wiring, plugins) go through the interceptor pipeline via `RouterInternals`.

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0

## 0.31.0

### Minor Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `nameToIDs` from public API (#214)

  **Breaking Change:** `nameToIDs` is no longer exported from `@real-router/core`.

  **Migration:** Use `RouteUtils.getChain()` from `@real-router/route-utils` instead:

  ```diff
  - import { nameToIDs } from "@real-router/core";
  - const chain = nameToIDs("users.profile");
  + import { getPluginApi } from "@real-router/core";
  + import { getRouteUtils } from "@real-router/route-utils";
  + const utils = getRouteUtils(getPluginApi(router).getTree());
  + const chain = utils.getChain("users.profile");
  ```

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Override `PluginApi.getTree()` return type to `RouteTree` and re-export `RouteTree` (#214)

  `getPluginApi(router).getTree()` now returns properly typed `RouteTree` instead of `unknown`.
  `RouteTree` type is also re-exported from `@real-router/core` for convenience.

  This is a type-only change — no runtime behavior changed.

## 0.30.0

### Minor Changes

- [#212](https://github.com/greydragon888/real-router/pull/212) [`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `Router.start()` to suppress unhandled rejections for fire-and-forget usage, matching `navigate()` and `navigateToDefault()` behavior.
  Calling `void router.start(path)` is now safe and will not produce `UnhandledPromiseRejectionWarning` for expected errors (`TRANSITION_CANCELLED`, `ROUTE_NOT_FOUND`).
  Fixes #211.

## 0.29.0

### Minor Changes

- [#203](https://github.com/greydragon888/real-router/pull/203) [`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `State.meta.options` storage, move `reload`/`redirected` to `TransitionMeta` (#202)

  **Breaking Change:** Navigation options are no longer stored in `state.meta.options`.
  - `reload` and `redirected` flags are now available on `state.transition` after successful navigation
  - `transitionPath` accepts optional `opts` parameter for reload detection
  - `shouldUpdateNode` reads `reload` from `state.transition` instead of `state.meta.options`
  - Removed `EMPTY_OPTIONS` constant and `cleanOpts` helper

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/types@0.19.0

## 0.28.0

### Minor Changes

- [#196](https://github.com/greydragon888/real-router/pull/196) [`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `routesApi.replace()` for atomic route replacement (#195)

  Combines `clear + add` into a single operation with one tree rebuild, state preservation via `matchPath` revalidation, and selective guard cleanup (`isFromDefinition` tracking). Designed for HMR use cases.

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/types@0.18.0

## 0.27.0

### Minor Changes

- [#192](https://github.com/greydragon888/real-router/pull/192) [`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097) Thanks [@greydragon888](https://github.com/greydragon888)! - Integrate AbortController API into `router.navigate()` (#188)

  Each navigation creates an internal `AbortController`. Pass an external `signal` via `NavigationOptions` to cancel navigations from userland:

  ```typescript
  const controller = new AbortController();

  const promise = router.navigate("users", {}, { signal: controller.signal });

  controller.abort(); // rejects with TRANSITION_CANCELLED
  ```

  Key behaviors:
  - Pre-aborted signal rejects immediately without starting a transition
  - Concurrent navigation aborts the previous navigation's signal
  - `router.stop()` and `router.dispose()` abort in-flight navigations
  - Guards receive `signal` as optional third parameter for cooperative cancellation
  - `AbortError` thrown in guards is auto-converted to `TRANSITION_CANCELLED`
  - Signal is stripped from `state.meta.options` (non-serializable)

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097), [`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/types@0.17.0

## 0.26.0

### Minor Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Switch `cloneRouter` to standalone via WeakMap and remove `CloneNamespace` from Router (#173)

  **Breaking Change:** `Router.clone()` instance method removed. Use `cloneRouter(router, deps?)` instead.

  **Removed:** `CloneNamespace` class (3 files), `Router.clone()` method, clone wiring in `RouterWiringBuilder`.

  **Migration:**

  ```diff
  - const cloned = router.clone({ api: newApi });
  + import { cloneRouter } from "@real-router/core";
  + const cloned = cloneRouter(router, { api: newApi });
  ```

  `cloneRouter` collects all router data (routes, options, dependencies, guards, plugins, forwardTo, rootPath, middleware) via WeakMap internals and creates a fresh router instance.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Switch `getDependenciesApi` to standalone via WeakMap and remove DI methods from Router (#172)

  **Breaking Change:** DI methods removed from the `Router` class. Use `getDependenciesApi(router)` instead.

  **Removed methods:** `setDependency`, `setDependencies`, `removeDependency`, `resetDependencies`, `hasDependency`, `getDependency`, `getDependencies`.

  **Migration:**

  ```diff
  - router.setDependency("api", apiService);
  - const dep = router.getDependency("api");
  + import { getDependenciesApi } from "@real-router/core";
  + const deps = getDependenciesApi(router);
  + deps.set("api", apiService);
  + const dep = deps.get("api");
  ```

  `getDependency` remains available internally via factory injection (`PluginFactory`, `GuardFnFactory`, `ForwardToCallback`).

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `DependenciesNamespace` class with plain `DependenciesStore` and inline CRUD logic into `getDependenciesApi` (#187)

  **Breaking Change:** `RouterInternals` dependency entries replaced with single `dependenciesGetStore()` accessor. Plugins using `getInternals()` must migrate.

  **What changed:**
  - New `DependenciesStore<D>` interface — plain data object (`dependencies` + `limits`)
  - `DependenciesNamespace` class eliminated — `createDependenciesStore()` factory replaces `new DependenciesNamespace()`
  - CRUD logic (`set`, `setMultiple`, `checkDependencyCount`) moved into `getDependenciesApi.ts` as module-private functions
  - `RouterInternals` reduced from 9 `dependency*` entries + `maxDependencies` to one `dependenciesGetStore()`
  - Wiring accesses store directly (`dependenciesStore.dependencies[key]`) instead of class methods

  **Migration (plugins using `getInternals()`):**

  ```diff
    const ctx = getInternals(router);
  - const value = ctx.dependencyGet("myDep");
  - const all = ctx.dependencyGetAll();
  - ctx.dependencySet("myDep", value);
  - const count = ctx.dependencyCount();
  + const store = ctx.dependenciesGetStore();
  + const value = store.dependencies["myDep"];
  + const all = { ...store.dependencies };
  + store.dependencies["myDep"] = value;
  + const count = Object.keys(store.dependencies).length;
  ```

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Add factory functions and WeakMap internals for modular plugin access (#170, #171)

  **Breaking Change:** PluginApi methods removed from the `Router` class. Use `getPluginApi(router)` instead.

  **Removed methods:** `makeState`, `buildState`, `forwardState`, `matchPath`, `setRootPath`, `getRootPath`, `navigateToState`, `addEventListener`, `getOptions`.

  **Migration:**

  ```diff
  - const state = router.matchPath("/home");
  + import { getPluginApi } from "@real-router/core";
  + const api = getPluginApi(router);
  + const state = api.matchPath("/home");
  ```

  **New exports:**
  - `getPluginApi(router)` — returns `PluginApi` with `makeState`, `buildState`, `matchPath`, `navigateToState`, `addEventListener`, etc.
  - `getRoutesApi(router)` — returns `RoutesApi` with `add`, `remove`, `update`, `clear`, `has`
  - `getDependenciesApi(router)` — returns `DependenciesApi` with `get`, `set`, `remove`, `reset`, `has`, etc.
  - `cloneRouter(router, deps?)` — clones router for SSR

  Internally, `getPluginApi` uses a WeakMap-based internals mechanism for decoupled access to router state.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract guard management methods into `getLifecycleApi` (#183)

  **Breaking Change:** Guard registration methods removed from the `Router` class. Use `getLifecycleApi(router)` instead.

  **Removed methods:** `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard`.

  **Migration:**

  ```diff
  - router.addActivateGuard("admin", guardFactory);
  - router.removeActivateGuard("admin");
  + import { getLifecycleApi } from "@real-router/core";
  + const lifecycle = getLifecycleApi(router);
  + lifecycle.addActivateGuard("admin", guardFactory);
  + lifecycle.removeActivateGuard("admin");
  ```

  `canNavigateTo` remains on the Router class — it is a sync UI query method used in hot-path rendering.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `addEventListener` and `buildNavigationState` from Router to `getPluginApi()` (#182)

  **Breaking Change:** `router.addEventListener()` and `router.buildNavigationState()` are removed from the Router class. Use `getPluginApi(router)` instead.

  **Migration:**

  ```diff
  - router.addEventListener("transitionSuccess", handler);
  + import { getPluginApi } from "@real-router/core";
  + getPluginApi(router).addEventListener("transitionSuccess", handler);
  ```

  ```diff
  - const state = router.buildNavigationState("users", { id: "123" });
  + import { getPluginApi } from "@real-router/core";
  + const state = getPluginApi(router).buildNavigationState("users", { id: "123" });
  ```

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `ActivationFn` and `ActivationFnFactory` re-exports (#187)

  **Breaking Change:** `ActivationFn` and `ActivationFnFactory` are no longer exported. Use `GuardFn` and `GuardFnFactory` instead.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Switch `getRoutesApi` to standalone via WeakMap and remove Route CRUD methods from Router (#174)

  **Breaking Change:** Route CRUD methods removed from the `Router` class. Use `getRoutesApi(router)` instead.

  **Removed methods:** `addRoute`, `removeRoute`, `updateRoute`, `clearRoutes`, `getRoute`, `getRouteConfig`, `hasRoute`.

  **Migration:**

  ```diff
  - router.addRoute({ name: "users", path: "/users" });
  - router.removeRoute("users");
  + import { getRoutesApi } from "@real-router/core";
  + const routes = getRoutesApi(router);
  + routes.add({ name: "users", path: "/users" });
  + routes.remove("users");
  ```

  Internally, CRUD logic extracted from `RoutesNamespace` into standalone `routesCrud.ts` for tree-shaking — only included in the bundle when `getRoutesApi()` is imported. Static validator delegates removed from `RoutesNamespace` in favor of direct imports from `validators.ts`.

  Heavy operations (`commitTreeChanges`, `rebuildTreeInPlace`, `refreshForwardMap`, `registerAllRouteHandlers`, `nodeToDefinition`, `validateRoutes`) injected via `RoutesStore.ops` — breaks the static import chain `routesCrud.ts → routeTreeOps.ts → route-tree`, reducing `getRoutesApi` standalone bundle from 10.17 kB to 4.04 kB brotli (-60%).

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Introduce `RoutesStore`, consolidate clone internals and reduce `RouterInternals` surface (#180)

  **Breaking Change:** `RouterInternals` route-related entries replaced with single `routeGetStore()` accessor. Plugins using `getInternals()` must migrate.

  **What changed:**
  - New `RoutesStore<D>` interface — plain data object holding all route state (~13 fields previously spread across `RoutesNamespace` private properties)
  - `RoutesNamespace` now owns a single `#store: RoutesStore` instead of ~13 private fields and ~11 accessor methods
  - `RouterInternals` reduced from ~20 individual `route*` entries to one `routeGetStore()` — eliminates `RoutesDataContext` assembly boilerplate
  - `RouterInternals<D>` is now generic — removes `as unknown as` type casts in `cloneRouter`, `getRoutesApi`, `getDependenciesApi`
  - `cloneRouter()` operates directly on `RoutesStore` — removes `applyClonedConfig()`, `cloneRoutes()`, and related accessor methods
  - `getRoutesApi()` passes store directly instead of assembling `RoutesDataContext` per call

  **Migration (plugins using `getInternals()`):**

  ```diff
    const ctx = getInternals(router);
  - const tree = ctx.routeGetTree();
  - const definitions = ctx.routeDefinitions;
  - const config = ctx.routeConfig;
  - const matcher = ctx.routeGetMatcher();
  + const store = ctx.routeGetStore();
  + const tree = store.tree;
  + const definitions = store.definitions;
  + const config = store.config;
  + const matcher = store.matcher;
  ```

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Re-export consolidated types from `@real-router/types` (#184)
  - Replace factory type and route config definitions in `types.ts` with re-exports from `@real-router/types`
  - Replace API interface definitions in `api/types.ts` with re-exports
  - Standalone API functions (`getPluginApi`, `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getNavigator`) now accept `Router` interface instead of class — enables passing interface-typed router values
  - `PluginApi.getTree()` returns `unknown` (was `RouteTree`)

  All existing imports from `@real-router/core` continue working via re-exports.

### Patch Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Update documentation for modular architecture (#187)
  - **core/README.md**: Rewrite API reference — Promise-based navigation, standalone API functions (`getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getPluginApi`, `cloneRouter`), remove callback-based examples, add `dispose()`, update error codes
  - **ARCHITECTURE.md**: Update package dependency diagram, split internal packages (bundled vs separate), add standalone API section, update SSR example to `cloneRouter()`
  - **IMPLEMENTATION_NOTES.md**: Update namespace structure (Router.ts ~640 lines, `api/` folder, store pattern), add "Standalone API Extraction" section
  - **README.md**: Update React example (`useRouteNode` instead of `useRoute`)

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/types@0.16.0

## 0.25.4

### Patch Changes

- [#154](https://github.com/greydragon888/real-router/pull/154) [`0d03ed2`](https://github.com/greydragon888/real-router/commit/0d03ed23cd6a28dbc0f66ffaf95d96328b5cf89e) Thanks [@greydragon888](https://github.com/greydragon888)! - Pre-compute `buildParamNamesSet` at route registration time (#142)

  Eliminate per-call `Set` and `Array` allocations in `buildPath()` loose mode by pre-computing URL param names during route registration.

## 0.25.3

### Patch Changes

- [#152](https://github.com/greydragon888/real-router/pull/152) [`5a4ef0d`](https://github.com/greydragon888/real-router/commit/5a4ef0dcd57176b635ecea7d20fc3791c31affb1) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache getTransitionPath result by state reference (#145)

  Add single-entry reference cache to `getTransitionPath()` eliminating redundant computations when multiple `shouldUpdateNode` predicates are called with the same state pair during a single navigation.

## 0.25.2

### Patch Changes

- [#150](https://github.com/greydragon888/real-router/pull/150) [`f56c0a6`](https://github.com/greydragon888/real-router/commit/f56c0a6f112438c1363558ff60627e63d248a1a7) Thanks [@greydragon888](https://github.com/greydragon888)! - Compare segment params in-place without intermediate objects (#141)

  Replace `extractSegmentParams()` + object comparison with direct `segmentParamsEqual()` that compares parameters from state objects without creating intermediate `SegmentParams` objects.
  Eliminates 2×N object allocations per navigation where N = common ancestor depth.

## 0.25.1

### Patch Changes

- [#148](https://github.com/greydragon888/real-router/pull/148) [`a431100`](https://github.com/greydragon888/real-router/commit/a431100935bcd1eefa8991b58a0ca4f828d4c431) Thanks [@greydragon888](https://github.com/greydragon888)! - Eliminate duplicate `nameToIDs()` calls in transition cleanup phase (#138)

  Reuse `toDeactivate`/`toActivate` arrays from `getTransitionPath()` result instead of calling `nameToIDs()` again during guard cleanup.
  Removes redundant code and 2 array allocations per navigation.

## 0.25.0

### Minor Changes

- [#136](https://github.com/greydragon888/real-router/pull/136) [`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove middleware layer (#133)

  **Breaking Change:** Middleware has been removed as an architectural concept.
  - Removed `router.useMiddleware()`
  - Removed `maxMiddleware` from `Limits`

  **Migration:**

  Side effects → `plugin.onTransitionSuccess` + `router.getRouteConfig()`:

  ```typescript
  // Before
  router.useMiddleware((router) => (toState) => {
    const config = router.getRouteConfig(toState.name);
    if (config?.title) document.title = config.title;
  });

  // After
  router.usePlugin((router) => ({
    onTransitionSuccess: (toState) => {
      const config = router.getRouteConfig(toState.name);
      if (config?.title) document.title = config.title;
    },
  }));
  ```

  Redirects → `forwardTo` in route config:

  ```typescript
  // Before
  router.useMiddleware((router) => (toState) => {
    if (toState.name === "old") return router.makeState("new");
  });

  // After
  const routes = [{ name: "old", path: "/old", forwardTo: "new" }];
  ```

  Cancellation → `canActivate` / `canDeactivate` guards:

  ```typescript
  // Before
  router.useMiddleware(() => (toState) => {
    if (!isAuthenticated()) return false;
  });

  // After
  router.addActivateGuard("admin", () => () => isAuthenticated());
  ```

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/types@0.15.0

## 0.24.0

### Minor Changes

- [#134](https://github.com/greydragon888/real-router/pull/134) [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Introduce `GuardFn` type, remove `ActivationFn` from guards (#130)

  **Breaking Change:** Guards now must return `boolean | Promise<boolean>` only.
  Returning `State`, `void`, or `undefined` from guards is no longer supported.

  **Migration:**
  - Guards returning `true`/`false` → no changes needed
  - Guards returning `undefined`/`void` → add explicit `return true`
  - Guards returning `State` → move logic to middleware

- [#134](https://github.com/greydragon888/real-router/pull/134) [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `isPromise` re-export (#130)

  `isPromise` type guard is no longer exported from `@real-router/core`.

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/types@0.14.0

## 0.23.1

### Patch Changes

- [#131](https://github.com/greydragon888/real-router/pull/131) [`50d2dc7`](https://github.com/greydragon888/real-router/commit/50d2dc7a6e885aa83af0a96489bfbf6ca735d806) Thanks [@greydragon888](https://github.com/greydragon888)! - Align PluginsNamespace and MiddlewareNamespace patterns (#129)

  Internal consistency refactoring across the two extension namespaces:
  - **`validateNoDuplicates`**: Middleware now uses callback pattern (`has`) instead of allocating a `Set` from array on every call
  - **Error messages**: Plugins now include index in args validation and counts in limit errors, using `getTypeDescription()` instead of raw `typeof`
  - **Threshold warnings**: Plugin warnings now include actionable context (hard limit value, guidance), matching middleware style
  - **Logger context**: Middleware logger context extracted to a `LOGGER_CONTEXT` constant in `constants.ts`
  - **`disposeAll` / `clearAll`**: Added JSDoc documenting the semantic distinction between the two operations

## 0.23.0

### Minor Changes

- [#127](https://github.com/greydragon888/real-router/pull/127) [`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `source` parameter from `matchPath()` (#121)

  **Breaking change:** `matchPath()` no longer accepts a second `source` argument.

  **Migration:**

  ```diff
  - router.matchPath('/users/123', 'popstate')
  + router.matchPath('/users/123')
  ```

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/types@0.13.0

## 0.22.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - **Breaking:** Remove `router.cancel()` method (#123)

  The `cancel()` method has been removed. Its functionality is now handled internally:
  - `stop()` and `dispose()` automatically cancel in-flight transitions
  - Concurrent `navigate()` calls cancel the previous navigation

  **Migration:**

  ```diff
  - router.cancel();
  + router.stop(); // or just call router.navigate() which cancels previous
  ```

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `router.dispose()` for permanent router termination (#123)

  New method that permanently terminates the router. Unlike `stop()`, a disposed router cannot be restarted. All mutating methods throw `RouterError(ROUTER_DISPOSED)` after disposal. Read-only methods (`getState`, `isActive`, `getOptions`, `buildPath`) remain functional. Idempotent — safe to call multiple times.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - **Breaking:** Remove `emitSuccess` parameter from `navigateToState()` (#123)

  The `emitSuccess` parameter has been removed from `navigateToState()`. Event emission is now driven by FSM transitions and is no longer optional.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `state.transition` (TransitionMeta) after every navigation (#123)

  After every successful navigation, `router.getState()` includes a deeply frozen `transition` field with: `phase` (last pipeline phase reached), `from` (previous route name), `reason` (`"success"` for resolved navigations), and `segments` (`deactivated`, `activated`, `intersection`).

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add configurable `warnListeners` limit (#123)

  New `limits.warnListeners` option (default: 1000, 0 to disable) warns about potential memory leaks when event listener count exceeds the threshold. Previously the warning threshold was hardcoded.

### Patch Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize EventEmitter emit() hot path (#123)

  Three optimizations to the internal event-emitter `emit()`:
  1. Replace `Function.prototype.apply.call` with switch by args.length (direct calls for 0-3 args)
  2. Separate fast path when `maxEventDepth === 0` — skips depth tracking, try/finally, and depthMap operations
  3. Inline `#checkRecursionDepth` + `#getDepthMap` into depth-tracking path, eliminating 2 method calls

  Benchmark results vs baseline: emit() 3 args 1 listener **-36%** (30→19 ns), full navigation cycle **-8%** (175→161 ns), 1000 emits **-38%** (30.5→19.1 μs).

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal: FSM-driven lifecycle, EventBusNamespace, wiring extraction (#123)

  All router state (`#started`, `#active`, `#navigating` booleans) replaced by a single RouterFSM — lifecycle events are consequences of FSM transitions via typed actions. `ObservableNamespace` removed; generic event-emitter logic extracted into private `event-emitter` package; FSM + EventEmitter + `#currentToState` encapsulated in `EventBusNamespace`. `#setupDependencies()` extracted into `RouterWiringBuilder` (Builder+Director pattern). Guard registration logic moved from Router facade into `RouteLifecycleNamespace`. Router.ts reduced from 1585 to 1176 lines.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize hot paths: cached error callback, Set replaced with includes (#123)

  Cache `.catch()` callback as `static #onSuppressedError` (one allocation per class, not per `navigate()` call). Replace `new Set(activeSegments)` with `Array.includes()` for segment cleanup (1-5 elements — linear search is faster than Set construction).

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix bare logger imports causing double bundle inline (#123)

  Replace `import { logger } from "logger"` with `from "@real-router/logger"` in `executeMiddleware.ts` and `executeLifecycleHooks.ts` to prevent the logger module from being inlined twice in the bundle.

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/fsm@0.2.0
  - @real-router/types@0.12.0

## 0.21.0

### Minor Changes

- [#102](https://github.com/greydragon888/real-router/pull/102) [`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING CHANGE**: Remove dot-notation support from route names (#93)

  Dots are now banned in the route `name` field. Use children syntax or the new `{ parent }` option in `addRoute()` instead.

  **Before:**

  ```typescript
  const routes = [
    { name: "users", path: "/users" },
    { name: "users.profile", path: "/:id" }, // ❌ No longer allowed
  ];
  ```

  **After (children syntax):**

  ```typescript
  const routes = [
    {
      name: "users",
      path: "/users",
      children: [{ name: "profile", path: "/:id" }],
    },
  ];
  ```

  **After ({ parent } option):**

  ```typescript
  router.addRoute({ name: "users", path: "/users" });
  router.addRoute({ name: "profile", path: "/:id" }, { parent: "users" });
  ```

  **Note:** Dots in fullName references (e.g., `navigate("users.profile")`) remain valid and unchanged.

  **Changes:**
  - Ban dots in route `name` field (throws TypeError with clear message)
  - Add `addRoute(route, { parent: "users" })` option for lazy loading
  - Remove ~170 lines of complex recursive dot-notation parsing code
  - Simplify route tree building from two-pass to single-pass algorithm

## 0.20.0

### Minor Changes

- [#100](https://github.com/greydragon888/real-router/pull/100) [`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57) Thanks [@greydragon888](https://github.com/greydragon888)! - feat!: remove `clearMiddleware()` method (#91)

  BREAKING CHANGE: `clearMiddleware()` has been removed. Use the `Unsubscribe` function returned by `useMiddleware()` instead.

  Before:

  ```ts
  router.useMiddleware(myMiddleware);
  // later...
  router.clearMiddleware();
  ```

  After:

  ```ts
  const unsub = router.useMiddleware(myMiddleware);
  // later...
  unsub();
  ```

## 0.19.0

### Minor Changes

- [#98](https://github.com/greydragon888/real-router/pull/98) [`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `getOption()` method (#92)

  **Breaking Change:** `getOption()` has been removed. Use `getOptions()` instead — options are immutable after `createRouter()`, so property access is equivalent.

  **Migration:**

  ```diff
  - router.getOption("defaultRoute")
  + router.getOptions().defaultRoute
  ```

## 0.18.0

### Minor Changes

- [#96](https://github.com/greydragon888/real-router/pull/96) [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `path` a required argument in `router.start()` (#90)

  **Breaking Change:** `router.start()` now requires a path string argument.

  **Migration:**

  ```diff
  - await router.start();
  + await router.start("/home");
  ```

  Browser-plugin users are unaffected — the plugin injects browser location automatically.

### Patch Changes

- [#96](https://github.com/greydragon888/real-router/pull/96) [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix plugin interception not working during `router.start()` (#90)

  `RoutesNamespace.matchPath()` called `this.forwardState()` at the namespace level, bypassing facade plugin wrappers. Injected facade's `forwardState` into `RoutesDependencies` so plugins (e.g. `persistent-params-plugin`) can intercept during startup.

## 0.17.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(core)!: Promise-based navigation API (#45)

  **Breaking Change:** `navigate()`, `navigateToDefault()`, `start()` now return `Promise<State>` instead of `CancelFn`/`this`.

  ```typescript
  // Before (callback-based)
  router.navigate("users", { id: "123" }, {}, (err, state) => {
    if (err) console.error(err);
    else console.log(state);
  });

  // After (Promise-based)
  const state = await router.navigate("users", { id: "123" });
  ```

  - `start()` no longer accepts `State` parameter (only `string` path)
  - `parseNavigateArgs()`, `safeCallback()` removed
  - Guards no longer receive `done` callback — return values directly

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/types@0.11.0

## 0.16.0

### Minor Changes

- [#88](https://github.com/greydragon888/real-router/pull/88) [`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `canDeactivate` support to `Route` and `RouteConfigUpdate` interfaces (#84)

  Added `canDeactivate` support to `Route` and `RouteConfigUpdate` interfaces, closing the API asymmetry with `canActivate`. Routes can now declare deactivation guards declaratively at `addRoute()` and dynamically via `updateRoute()`.

## 0.15.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract `getNavigator` into standalone function (#83)

  Extract `getNavigator` into standalone function. BREAKING: `Router.getNavigator()` method removed. Use `import { getNavigator } from '@real-router/core'` and call `getNavigator(router)` instead.

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/types@0.10.0

## 0.14.0

### Minor Changes

- [#80](https://github.com/greydragon888/real-router/pull/80) [`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d) Thanks [@greydragon888](https://github.com/greydragon888)! - Rename guard API and add route accessibility checks (#42)

  ## New Methods
  - **`addActivateGuard(name, guard)`** — Registers activation guard for a route.
  - **`addDeactivateGuard(name, guard)`** — Registers deactivation guard for a route.
  - **`removeActivateGuard(name)`** — Removes previously registered activation guard.
  - **`removeDeactivateGuard(name)`** — Removes previously registered deactivation guard.
  - **`canNavigateTo(name, params?)`** — Synchronously checks if navigation to a route would be allowed by guards. Returns `boolean`.

  ## Removed (Breaking)
  - **`canActivate(name, guard)`** — Removed. Use `addActivateGuard()` instead.
  - **`canDeactivate(name, guard)`** — Removed. Use `addDeactivateGuard()` instead.

  ## Enhanced
  - **`getNavigator()`** — Navigator now includes `canNavigateTo` as 5th method.

  ## Migration

  ```diff
  - router.canActivate('admin', guard)
  + router.addActivateGuard('admin', guard)

  - router.canDeactivate('editor', guard)
  + router.addDeactivateGuard('editor', guard)
  ```

  **Note:** Route config field `canActivate` in route definitions does NOT change.

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/types@0.9.0

## 0.13.0

### Minor Changes

- [#78](https://github.com/greydragon888/real-router/pull/78) [`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `buildNavigationState()` and remove `skipTransition` option (#44)

  **Breaking Change:** The `skipTransition` option has been removed from `NavigationOptions`.

  **New API:**

  ```typescript
  // Pure function — returns State without navigating
  const state = router.buildNavigationState("users.view", { id: 123 });
  if (state) {
    console.log(state.path); // '/users/view/123'
  }
  // Returns undefined if route not found
  ```

  **Migration from `skipTransition`:**

  ```typescript
  // Before
  router.navigate('route', params, { skipTransition: true }, (err, state) => { ... });

  // After
  const state = router.buildNavigationState('route', params);
  ```

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/types@0.8.0

## 0.12.0

### Minor Changes

- [#75](https://github.com/greydragon888/real-router/pull/75) [`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95) Thanks [@greydragon888](https://github.com/greydragon888)! - Add dynamic `forwardTo` callback support (#43)

  `forwardTo` now accepts `string | ForwardToCallback<Dependencies>` — a sync callback receiving `(getDependency, params)` that returns a target route name at navigation time. Enables role-based routing, feature flags, A/B testing, and tenant-specific routing.
  - Separate storage: `forwardMap` (static, O(1) cached) + `forwardFnMap` (dynamic, resolved per-navigation)
  - Mixed chain support: static-to-dynamic, dynamic-to-static, dynamic-to-dynamic
  - Runtime validation: return type, target existence, cycle detection (visited Set, max depth 100)
  - Sync-only enforcement: async callbacks rejected at registration (even with `noValidate: true`)
  - Full support in `addRoute`, `updateRoute`, `removeRoute`, `clearRoutes`, `clone`, `matchPath`, `buildState`

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/types@0.7.0

## 0.11.0

### Minor Changes

- [#72](https://github.com/greydragon888/real-router/pull/72) [`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5) Thanks [@greydragon888](https://github.com/greydragon888)! - Support dynamic `defaultRoute` and `defaultParams` via callback functions (#39)

  `defaultRoute` and `defaultParams` options now accept callback functions that receive `getDependency` for dynamic value computation based on router dependencies. Callbacks are resolved at point of use (`start()`, `navigateToDefault()`), never cached.

  **Breaking Type Change**: `router.getOptions().defaultRoute` now returns `string | DefaultRouteCallback` (was `string`). Similarly, `router.getOptions().defaultParams` now returns `Params | DefaultParamsCallback` (was `Params`). Code that assigns these values to typed variables may need type assertions or `typeof` checks.

  **Behavior Note**: A callback returning empty string `""` in `navigateToDefault()` returns noop (no navigation). In `start()` without path, it produces `ROUTE_NOT_FOUND` error (not `NO_START_PATH_OR_STATE`).

  ```typescript
  const router = createRouter(routes, {
    defaultRoute: (getDep) =>
      getDep("userRole") === "admin" ? "admin.dashboard" : "home",
    defaultParams: (getDep) => ({ userId: getDep("currentUserId") }),
  });
  ```

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/types@0.6.0

## 0.10.0

### Minor Changes

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `setOption()`, make options immutable (#63)

  **Breaking Change:** Router options are now immutable after construction. The `setOption()` method has been removed along with the `lock()`/`unlock()` lifecycle.

  Options that were previously changeable after `start()` (`defaultRoute`, `defaultParams`) must now be set in the constructor:

  ```diff
  - const router = createRouter(routes);
  - router.setOption('defaultRoute', 'home');
  - router.start();
  + const router = createRouter(routes, { defaultRoute: 'home' });
  + router.start();
  ```

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace rou3 with custom Segment Trie path matcher (#63)

  The internal path matching engine has been replaced from rou3's radix tree to a custom Segment Trie matcher. Each trie edge represents an entire URL segment (not per-character prefix), enabling hierarchical named routing with static cache, pre-computed `buildPath` templates, and zero-allocation match.

  The public API (`matchPath`, `buildPath`, `buildState`) is unchanged.

### Patch Changes

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize `matchPath` by inlining `buildPath` and skipping `defaultParams` re-merge (#63)

## 0.9.0

### Minor Changes

- [#61](https://github.com/greydragon888/real-router/pull/61) [`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate routing engine to rou3 and optimize path building (#40)

  **BREAKING CHANGES:**
  - Encoding mode `legacy` has been removed. Use `uri` instead (1:1 equivalent).
  - `children.values()` iteration order now follows definition order instead of routing priority order. This affects `routeTreeToDefinitions()` output order. Matching behavior is unchanged (handled by rou3 radix tree).

  **Performance improvements:**
  - Migrated to rou3 radix tree for 1000x+ faster route matching
  - Optimized path building with standalone services (inject, validateConstraints, encodeParam)
  - Replaced parser metadata access with lightweight paramMeta structure
  - Removed dead sorting code (~50 lines) — no longer needed with rou3

  **Migration:**

  ```typescript
  // Before:
  buildPath(tree, "route", params, { urlParamsEncoding: "legacy" });

  // After:
  buildPath(tree, "route", params, { urlParamsEncoding: "uri" });
  ```

## 0.8.0

### Minor Changes

- [#59](https://github.com/greydragon888/real-router/pull/59) [`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `router[Symbol.observable]()` from core — Observable API moved to `@real-router/rx` (#41)

  **Breaking Change:** `router[Symbol.observable]()` and `router["@@observable"]()` are removed from core.

  **Migration:**

  ```typescript
  // Before
  router[Symbol.observable]().subscribe(observer);

  // After
  import { observable } from "@real-router/rx";
  observable(router).subscribe(observer);

  // Or with state stream
  import { state$ } from "@real-router/rx";
  state$(router).subscribe((state) => console.log(state));
  ```

  **Why:** Achieves zero bundle cost for users who don't need reactive streams (~2KB savings).

## 0.7.0

### Minor Changes

- [#57](https://github.com/greydragon888/real-router/pull/57) [`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add configurable limits via `options.limits` (#38)

  All router limits are now centralized into a single configuration object. Previously, limits were hardcoded in individual namespaces.

  ```typescript
  const router = createRouter(routes, {
    limits: {
      maxDependencies: 150,
      maxPlugins: 75,
    },
  });

  // Read-only access
  console.log(router.limits);
  // { maxDependencies: 150, maxPlugins: 75, maxMiddleware: 50, ... }
  ```

  **Available limits:**

  | Limit                  | Default | Description                                |
  | ---------------------- | ------- | ------------------------------------------ |
  | `maxDependencies`      | 100     | Maximum registered dependencies            |
  | `maxPlugins`           | 50      | Maximum registered plugins                 |
  | `maxMiddleware`        | 50      | Maximum middleware functions               |
  | `maxListeners`         | 10000   | Maximum event listeners per event type     |
  | `maxEventDepth`        | 5       | Maximum nested event propagation depth     |
  | `maxLifecycleHandlers` | 200     | Maximum canActivate/canDeactivate handlers |

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/types@0.5.0

## 0.6.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `getNavigator()` method (#37)

  New `Router.getNavigator()` method returns a frozen, cached `Navigator` instance with safe subset of router methods for UI components.

  ```typescript
  const navigator = router.getNavigator();
  navigator.navigate("home");
  navigator.getState();
  navigator.isActiveRoute("home");
  navigator.subscribe(listener);
  ```

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/types@0.4.0

## 0.5.0

### Minor Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `noValidate` option to disable validation in production (#53)

  New configuration option for performance-critical environments:

  ```typescript
  const router = createRouter(routes, {
    noValidate: process.env.NODE_ENV === "production",
  });
  ```

  When enabled, skips argument validation in ~40 public methods.
  Constructor always validates options object itself.

### Patch Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Make middleware unsubscribe function idempotent (#53)

  Calling unsubscribe multiple times no longer throws an error.

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize `usePlugin()` for single-plugin calls (#53)

  Skip array/Set allocation when registering a single plugin.

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/types@0.3.0

## 0.4.0

### Minor Changes

- [#46](https://github.com/greydragon888/real-router/pull/46) [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572) Thanks [@greydragon888](https://github.com/greydragon888)! - ## Public API Audit — Remove Legacy Internal Methods

  ### Breaking Changes

  **Removed methods:**
  - `isStarted()` — use `isActive()` instead
  - `isNavigating()` — track via middleware/events if needed
  - `forward()` — use `forwardTo` option in route config
  - `setState()` — internal only, use `navigate()` or `navigateToState()`
  - `areStatesDescendants()` — use `state2.name.startsWith(state1.name + ".")`
  - `clearCanActivate()` — override with `canActivate(name, true)`
  - `clearCanDeactivate()` — override with `canDeactivate(name, true)`
  - `removeEventListener()` — use unsubscribe function from `addEventListener()`
  - `makeNotFoundState()` — use `navigateToDefault()` or handle in middleware
  - `getPlugins()` — track plugins in application code if needed
  - `invokeEventListeners()` — internal only
  - `hasListeners()` — internal only
  - `getLifecycleFactories()` — internal only
  - `getLifecycleFunctions()` — internal only
  - `getMiddlewareFactories()` — internal only
  - `getMiddlewareFunctions()` — internal only

  **Plugin Development API:**

  The following methods are now documented for plugin authors:
  - `matchPath()` — match URL path to route state
  - `makeState()` — create State with custom `meta.id`
  - `buildState()` — validate route and build state
  - `forwardState()` — resolve forwarding and merge default params
  - `navigateToState()` — navigate with pre-built State
  - `setRootPath()` — dynamically modify router base path
  - `getRootPath()` — read current base path

  ### Internal Changes
  - Moved validation logic from namespaces to Router facade
  - Namespace methods now trust validated input from facade

  Closes #36

## 0.3.0

### Minor Changes

- [`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal architecture to namespace-based design (#34)

  Internal refactoring from functional decorator composition to class-based namespace architecture:
  - 11 namespace classes with true encapsulation via private fields (`#`)
  - Clean separation of concerns (Options, Dependencies, State, Routes, Navigation, etc.)
  - Improved maintainability and testability

  **No breaking changes** — public API remains 100% backward compatible.

- [#34](https://github.com/greydragon888/real-router/pull/34) [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Move Router-dependent types from `@real-router/types` to `@real-router/core` (#31)

  Types moved to `@real-router/core`:
  - `Router` (class replaces interface)
  - `Route`
  - `RouteConfigUpdate`
  - `ActivationFnFactory`
  - `MiddlewareFactory`
  - `PluginFactory`
  - `BuildStateResultWithSegments`

  **Migration:** If you import these types from `@real-router/types`, change your imports to `@real-router/core`:

  ```diff
  - import type { Router, Route, PluginFactory } from "@real-router/types";
  + import type { Router, Route, PluginFactory } from "@real-router/core";
  ```

  This change eliminates circular type dependencies between packages.

### Patch Changes

- Updated dependencies [[`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/types@0.2.0

## 0.2.4

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

## 0.2.3

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

## 0.2.2

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/logger@0.2.0

## 0.2.1

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

## 0.2.0

### Minor Changes

- [#11](https://github.com/greydragon888/real-router/pull/11) [`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add internal isomorphic logger package for centralized logging

  ### New Features

  **Isomorphic Logger** — works in browser, Node.js, and environments without `console`:
  - Three severity levels: `log`, `warn`, `error`
  - Four threshold configurations: `all`, `warn-error`, `error-only`, `none`
  - Safe console access (checks `typeof console !== "undefined"`)
  - Optional callback for custom log processing (error tracking, analytics, console emulation)
  - `callbackIgnoresLevel` option to bypass level filtering for callbacks

  **Router Configuration:**

  ```typescript
  const router = createRouter(routes, {
    logger: {
      level: "error-only",
      callback: (level, context, message) => {
        if (level === "error") Sentry.captureMessage(message);
      },
      callbackIgnoresLevel: true,
    },
  });
  ```

  ### Changes by Package

  **@real-router/core:**
  - Add `options.logger` configuration support in `createRouter()`
  - Migrate all internal `console.*` calls to centralized logger

  **@real-router/browser-plugin:**
  - Migrate warning messages to centralized logger

  **@real-router/logger-plugin:**
  - Use internal logger instead of direct console output

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - core-types@0.1.0
  - route-tree@0.1.0
