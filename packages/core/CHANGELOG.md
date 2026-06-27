# @real-router/core

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
  params are unaffected. Part of the foundation-audit path-matcher hardening
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

  Closes the rootPath mis-routing item of the foundation-audit path-matcher cluster ([#740](https://github.com/greydragon888/real-router/issues/740)).

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
