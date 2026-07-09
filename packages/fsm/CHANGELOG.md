# @real-router/fsm

## 0.6.1

### Patch Changes

- [#1361](https://github.com/greydragon888/real-router/pull/1361) [`2d27b44`](https://github.com/greydragon888/real-router/commit/2d27b44ee4aecfa38813ad31d998df39deca212e) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard transition-table closure against dangling targets ([#1159](https://github.com/greydragon888/real-router/issues/1159))

  The engine guarded three state-entry-points against undeclared states (`forceState` [#754](https://github.com/greydragon888/real-router/issues/754), constructor `initial` + `on()` `from` [#885](https://github.com/greydragon888/real-router/issues/885)) but left a fourth unguarded: the transition-table **values** applied by `send()` (`this.#transitions[nextState]`). A table with a dangling target — a value that is not itself a declared state key — passed the constructor, then a `send()` into it entered an undeclared state (violating Validity [#1](https://github.com/greydragon888/real-router/issues/1)) and bricked the next `canSend()` / `send()` with a cryptic `TypeError` (violating No-bricking [#10](https://github.com/greydragon888/real-router/issues/10)). The property suite stayed green because `arbFSMConfig` encodes targets as state indices, so it structurally cannot generate a non-closed table.

  The constructor now runs a one-pass O(states×events) closure check (cold path, reusing the shared `requireDeclared` guard and its message), so a dangling target fails loud with `[FSM.constructor] state "…" is not declared in config.transitions` instead of bricking. Explicit `undefined` values are the declared "no transition" no-op and are skipped; post-construction mutation of the shared table stays a documented GIGO boundary (Edge [#5](https://github.com/greydragon888/real-router/issues/5)). Typed callers with a narrow state union are unaffected (the type forbids a dangling target); this hardens `string`-typed / JS / cast callers. Dormant for `@real-router/core` (`routerFSM`'s table is static and closed).

  Shipped as `patch` for parity with [#885](https://github.com/greydragon888/real-router/issues/885) / [#754](https://github.com/greydragon888/real-router/issues/754) — the same guard class (a construction/entry-point rejection that previously bricked), same reachability profile, which shipped as patch.

## 0.6.0

### Minor Changes

- [#1340](https://github.com/greydragon888/real-router/pull/1340) [`feac3b5`](https://github.com/greydragon888/real-router/commit/feac3b5c0e7316ccdd9d74c40ac4595a4ab5624e) Thanks [@greydragon888](https://github.com/greydragon888)! - remove(fsm): drop the forceState() escape hatch ([#1169](https://github.com/greydragon888/real-router/issues/1169))

  `FSM.forceState(state)` — the direct `#state`/`#currentTransitions` write that bypassed actions and listeners — existed solely as core's navigate hot-path optimization. The [#1169](https://github.com/greydragon888/real-router/issues/1169) commit-gate refactor routed the three hot transitions (NAVIGATE/LEAVE_APPROVE/COMPLETE) through the FSM transition table via `send()`, making the table the sole authority over state; `forceState` was left with zero consumers.

  Removing it makes "the FSM table cannot be bypassed" a compiler-enforced guarantee rather than a convention — the exact resurrection vector behind [#1169](https://github.com/greydragon888/real-router/issues/1169) no longer exists in the engine. The shared `requireDeclared` declared-state guard stays (still used by the constructor's `initial` and `on`'s `from`, [#885](https://github.com/greydragon888/real-router/issues/885)).

  Breaking (a public method is removed) — `minor` per the pre-1.0 policy.

## 0.5.0

### Minor Changes

- [#887](https://github.com/greydragon888/real-router/pull/887) [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78) Thanks [@greydragon888](https://github.com/greydragon888)! - Type-correlate `send()` payload to the specific event ([#753](https://github.com/greydragon888/real-router/issues/753))

  `send()` now indexes the payload by the specific event instead of the full event union, making it symmetric with `on()`. Previously `send(event: TEvents, payload?: TPayloadMap[TEvents])` collapsed to `payload?: unknown`, so a payload typed for a different event — or no payload at all — compiled without error.

  **Breaking (type-level only — runtime is unchanged):**

  - A payload event now **requires** its correctly-typed payload: `send("FETCH", { wrongShape })` and `send("FETCH")` (missing payload) are type errors.
  - A no-payload event rejects any payload: `send("START", {})` is a type error.

  ```diff
  - send(event: TEvents, payload?: TPayloadMap[TEvents]): TStates
  + send<E extends TEvents>(
  +   event: E,
  +   ...args: E extends keyof TPayloadMap ? [TPayloadMap[E]] : [undefined?]
  + ): TStates
  ```

  Dormant for `@real-router/core` (`RouterPayloads` is empty — all router events are payload-free).

- [#887](https://github.com/greydragon888/real-router/pull/887) [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78) Thanks [@greydragon888](https://github.com/greydragon888)! - Correlate `TransitionInfo.payload` to the event ([#886](https://github.com/greydragon888/real-router/issues/886))

  `onTransition` listeners can now narrow `info.payload` by `info.event`: `TransitionInfo` is a distributive (discriminated) union over the event instead of a flat interface, so under `if (info.event === "FETCH")` the payload narrows to that event's type — the same correlation `send`/`on` already provide ([#753](https://github.com/greydragon888/real-router/issues/753)). This completes the payload-correlation contract across input (`send`), action (`on`), and output (`onTransition`).

  **Breaking (type-level only — runtime is unchanged):** `TransitionInfo` is now a `type` (distributive union), not an `interface` — code that interface-merges it or manually constructs a flat `TransitionInfo` value may need adjustment. Listeners that destructure `{ from, to, event, payload }` are unaffected. Dormant for `@real-router/core` (`RouterPayloads` is empty, so every event's payload is `undefined`).

### Patch Changes

- [#887](https://github.com/greydragon888/real-router/pull/887) [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard `constructor` and `on()` against undeclared states ([#885](https://github.com/greydragon888/real-router/issues/885))

  Extends the `forceState` guard ([#754](https://github.com/greydragon888/real-router/issues/754)) to the engine's two other state-entry-points via a shared `requireDeclared` check, so an undeclared state fails loud with an explicit error instead of bricking the FSM or silently dead-registering an action:

  - `new FSM({ initial, … })` with an undeclared `initial` now throws `[FSM.constructor] state "…" is not declared in config.transitions` instead of bricking the next `canSend`/`send` with a cryptic `TypeError`.
  - `on(from, …)` with an undeclared `from` now throws `[FSM.on] state "…" is not declared in config.transitions` instead of silently registering an action that can never fire.

  Typed callers with a narrow state union are unaffected (the type forbids an undeclared state); this hardens `string`-typed / JS / cast callers. Dormant for `@real-router/core` (the router uses declared states throughout). Runtime guard only — `forceState`'s message and behavior are unchanged.

- [#887](https://github.com/greydragon888/real-router/pull/887) [`db4e2e4`](https://github.com/greydragon888/real-router/commit/db4e2e4aa3faa4e1cb44557ed355913095117a78) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard `forceState()` against undeclared states ([#754](https://github.com/greydragon888/real-router/issues/754))

  `forceState()` now throws an explicit error when given a state that is not declared in `config.transitions`, instead of silently leaving the FSM unable to transition — previously the next `canSend`/`send` threw a cryptic `TypeError: Cannot read properties of undefined`. The guard reuses the existing transition lookup and throws **before** mutating `#state`, so the FSM is left untouched on rejection. Typed callers are unaffected (`state: TStates` already forbids undeclared states); this hardens JS / cast callers, mirroring how `send()` is already defensive on unknown input.

## 0.4.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

## 0.3.0

### Minor Changes

- [#429](https://github.com/greydragon888/real-router/pull/429) [`15e7758`](https://github.com/greydragon888/real-router/commit/15e7758ed2ef4536bf332ac30cdace880951acea) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(fsm): on() unsubscribe no longer deletes overwritten action ([#427](https://github.com/greydragon888/real-router/issues/427))

## 0.2.4

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

## 0.2.3

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

## 0.2.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: rewritten as internal package style — Purpose, Consumers, Key Design Decisions. ARCHITECTURE: added `forceState()` documentation — architecturally significant method for router's navigate hot path.

## 0.2.1

### Patch Changes

- [#316](https://github.com/greydragon888/real-router/pull/316) [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize FSM for navigate hot path ([#307](https://github.com/greydragon888/real-router/issues/307))

  Replace `...args` rest parameter with optional `payload?` in `send()` to eliminate V8 array allocation.
  Add `forceState()` method for direct state transitions bypassing dispatch overhead.
  Use nested Map for transition lookups instead of template literal key concatenation.

## 0.2.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `canSend()` for O(1) event validity check (#123)

  New `canSend(event): boolean` method checks if an event is valid in the current state. Uses cached `#currentTransitions` for O(1) lookup without triggering any transitions or side effects.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add typed `on(from, event, action)` for transition actions (#123)

  New `on(from, event, action)` method registers a type-safe action for a specific `(from, event)` pair. Actions fire before `onTransition` listeners. Lazy `#actions` Map — zero-cost when not used. Returns an unsubscribe function.

## 0.1.0

### Minor Changes

- [#111](https://github.com/greydragon888/real-router/pull/111) [`fd84735`](https://github.com/greydragon888/real-router/commit/fd847353f413a4c6727751cfdc6e078abef7c14d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/fsm` package — universal synchronous FSM engine (#110)

  New package providing a zero-dependency, fully typed finite state machine with O(1) transition lookup, type-safe payloads via `TPayloadMap`, and listener management with null-slot reuse pattern.
