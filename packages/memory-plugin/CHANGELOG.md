# @real-router/memory-plugin

## 0.3.4

### Patch Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Hot-path and code-quality cleanup from audit ([#510](https://github.com/greydragon888/real-router/issues/510), [#511](https://github.com/greydragon888/real-router/issues/511))

  Audit follow-up — items from `packages/memory-plugin/.claude/review-2026-04-22.md`:
  - **`MemoryContext` per-call freeze removed (#8c.1):** `#writeMemoryContext` no
    longer wraps the `{ direction, historyIndex }` literal in `Object.freeze()`
    on every successful transition. The freeze was a half-measure — `state.context`
    itself is intentionally **not** frozen by core (`packages/core/src/helpers.ts`),
    so a consumer can already overwrite `state.context.memory = {...}` regardless.
    Immutability is now expressed at the type level: both fields of
    `MemoryContext` are marked `readonly`. Eliminates one freeze (~18ns) per
    successful navigation on the hot path.
  - **`#go(delta)` promise chain flattened (#8c.2):** `.catch().finally()` was
    replaced with `.then(onResolve, onReject)`. The reject handler now performs
    both the `#index` revert and the `#navigatingFromHistory` flag reset, so the
    observable behaviour is unchanged. Saves one promise + one microtask per
    `back()` / `forward()` / `go(delta)` invocation.
  - **Redundant `Number.isFinite` check dropped ([#9](https://github.com/greydragon888/real-router/issues/9).3):** the guard at the top of
    `#go(delta)` simplified from
    `delta === 0 || !Number.isFinite(delta) || !Number.isInteger(delta)` to
    `!Number.isInteger(delta) || delta === 0`. `Number.isInteger` already returns
    `false` for `NaN`, `±Infinity`, fractional values, and non-numbers, so the
    finite-check was redundant. Existing functional tests for `go(NaN)`,
    `go(Infinity)`, `go(-Infinity)`, `go(0.5)`, `go(-1.7)` continue to pass.

  No public API changes. The frozen-context test
  (`tests/functional/plugin.test.ts` — "context.memory is frozen") was updated
  to assert the structural shape via `toStrictEqual` instead of
  `Object.isFrozen`. If your code branches on `Object.isFrozen(state.context.memory)`,
  update it to rely on the `readonly` typing instead.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Test-suite hardening and new invariants from audit ([#511](https://github.com/greydragon888/real-router/issues/511))

  Audit follow-up — items from `packages/memory-plugin/.claude/review-2026-04-22.md`
  (categories 1, 3, 4, 5, 7, 10-13). No runtime behaviour changes — this is
  exclusively documentation and test coverage work.

  **New property-based invariants (`tests/property/`, [#3](https://github.com/greydragon888/real-router/issues/3)/[#6](https://github.com/greydragon888/real-router/issues/6).3):**
  - `direction === 'navigate'` is written for every successful push (including
    the first one from `router.start()`).
  - `maxHistoryLength=1` idempotency: at cap=1, `canGoBack()`/`canGoForward()`
    are always `false` and `historyIndex === 0` regardless of the action sequence.
  - `N × back()` followed by `N × forward()` (for distinct-path pushes without
    guards) returns to the same `path`.
  - Bi-implication `canGoBack() ⇔ state.context.memory.historyIndex > 0` is
    declared but currently `describe.skip`'d with a TODO referencing [#508](https://github.com/greydragon888/real-router/issues/508) — the
    short-circuit branch leaves `context.memory` stale, so the property does not
    hold until [#508](https://github.com/greydragon888/real-router/issues/508) is fixed.

  `INVARIANTS.md` updated with invariants 12-14 and a new "State Context" section.

  **New stress scenarios (`tests/stress/`, [#4](https://github.com/greydragon888/real-router/issues/4)):**
  - `back-then-navigate-race.stress.ts` (S11) — `back()` in flight + immediate
    `navigate()`: verifies the `#navigatingFromHistory` flag does not leak to
    `true` and subsequent pushes still land.
  - `navigate-replace-overlap.stress.ts` (S12) — two concurrent navigations
    (one with an async guard, one with `{ replace: true }`): verifies the
    second supersedes the first and history stays consistent.
  - `memory-leak.stress.ts` (S13) — 1000 `start → navigate × 5 → stop →
unsubscribe` cycles keep heap growth under 25× the baseline; a single
    long-lived router with 10 000 navigations respects `maxHistoryLength=100`
    exactly (final `historyIndex === 99`, 99 back-steps reachable).
  - `maxhistory-1-cap.stress.ts` (S14) — 1000 successful pushes at cap=1 keep
    index at 0; `back()`/`forward()`/`go(±N)` are always no-ops; alternating
    push + replace never grows the stack past 1 entry.

  **Tautological assertions removed ([#5](https://github.com/greydragon888/real-router/issues/5)):**
  - `expect(typeof router.canGoBack()).toBe("boolean")` and variants in
    `concurrent-back-forward.stress.ts`, `generation-guard-async.stress.ts`,
    `stale-entries.stress.ts` replaced with concrete index-range assertions
    via `state.context.memory.historyIndex`.
  - `expect(activations).toBeGreaterThan(0)` in S9.1 tightened to also assert
    an upper bound (`≤ 10`).

  **Property-test generator tuning ([#11](https://github.com/greydragon888/real-router/issues/11), [#12](https://github.com/greydragon888/real-router/issues/12)):**
  - `NUM_RUNS` now scales with CI: `standard` and `async` bump from 100 to 300
    under `process.env.CI`, `lifecycle` from 50 to 100. Local runs unchanged.
  - `arbRouteWithParams` for the `user` route narrowed from `id: 1-100` to
    `id: 1-3` so the shrinker can explore same-id collisions.
  - New `arbActionSequenceLong` (30-100 actions) exported for marathon scenarios.

  **Documentation ([#7](https://github.com/greydragon888/real-router/issues/7), [#10](https://github.com/greydragon888/real-router/issues/10), [#13](https://github.com/greydragon888/real-router/issues/13)):**
  - The functional test "should update index without navigating when back()
    targets same state" was split into two: (a) short-circuit behavior with
    explicit `vi.spyOn(router, "navigate")` + assertion that `navigate` is
    not called, and (b) a separate test for the different-path back() case.
    The short-circuit test includes a TODO comment referencing [#508](https://github.com/greydragon888/real-router/issues/508) to track
    the stale `context.memory` bug.
  - `CLAUDE.md` gotchas about `go(0)`, `go(NaN)`, `go(±Infinity)`, `go(0.5)`
    merged into a single block. The `.catch()`/`.finally()` gotcha reworded to
    match the new `.then(onResolve, onReject)` wiring. A new gotcha documents
    the short-circuit branch and its stale-context limitation ([#508](https://github.com/greydragon888/real-router/issues/508)).
  - Wiki (`memory-plugin.md`) gets a matching "Short-circuit" section.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix stale `state.context.memory` after short-circuit `back()`/`forward()` ([#508](https://github.com/greydragon888/real-router/issues/508))

  When `back(-1)` or `forward(+1)` lands on a history entry whose `path` equals the current router state path (e.g. history `[home, home]` after a `replace`), `#go(delta)` previously updated `#index` synchronously but left `state.context.memory` unchanged — so `direction` and `historyIndex` reflected the last full transition, not the short-circuit move. UI code relying on `direction` for animation saw stale data, and the bi-implication `canGoBack() ⇔ state.context.memory.historyIndex > 0` broke on those entries.

  The short-circuit branch now rewrites `state.context.memory` in place with the new `historyIndex` and `direction` (`"back"` or `"forward"`). The state object identity is preserved (no full transition), but subscribers observe the correct direction signal. The previously skipped property-based test for the `canGoBack ⇔ historyIndex > 0` bi-implication has been re-enabled.

## 0.3.3

### Patch Changes

- [#491](https://github.com/greydragon888/real-router/pull/491) [`d4678ca`](https://github.com/greydragon888/real-router/commit/d4678ca1855faed40eb110dbbd45eecaba791710) Thanks [@greydragon888](https://github.com/greydragon888)! - Document `MemoryPluginOptions.maxHistoryLength` ([#490](https://github.com/greydragon888/real-router/issues/490))

  Added inline JSDoc for `maxHistoryLength` covering the `0 = unlimited`
  sentinel, the rejected values (negatives, `NaN`, `±Infinity`, fractions),
  and the default (`1000`). The behavior was previously documented only
  in the package's CLAUDE.md.

- Updated dependencies [[`d4678ca`](https://github.com/greydragon888/real-router/commit/d4678ca1855faed40eb110dbbd45eecaba791710), [`d4678ca`](https://github.com/greydragon888/real-router/commit/d4678ca1855faed40eb110dbbd45eecaba791710)]:
  - @real-router/types@0.34.1

## 0.3.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.3.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden input validation and teardown ([#470](https://github.com/greydragon888/real-router/issues/470))

  **Input validation**
  - `memoryPluginFactory({ maxHistoryLength: NaN })`, `Infinity`, or `0.5` now throw at factory time. Previously these slipped through the `typeof === "number"` check and caused subtle history corruption at runtime.
  - `router.go(delta)` now silently returns when `delta` is `NaN`, `Infinity`, or a non-integer (in addition to the existing `delta === 0` short-circuit). Previously non-finite deltas propagated into the history index and produced stuck or out-of-range state.

  **Teardown**
  - `teardown()` is now idempotent via a `#disposed` flag. Double-dispose scenarios (e.g., `router.dispose()` after user-level `unsubscribe()`, or vice versa) no longer double-release the context namespace claim.

  **Internal**
  - Extracted `#writeMemoryContext(toState, direction)` helper — dedupes the two `claim.write(...)` sites in `onTransitionSuccess`.
  - `this.#entries.splice(this.#index + 1)` replaced with `this.#entries.length = this.#index + 1` for cheaper truncation on every forward navigation that invalidates the future.

## 0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

## 0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.1.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

## 0.1.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

## 0.1.0

### Minor Changes

- [#410](https://github.com/greydragon888/real-router/pull/410) [`546706b`](https://github.com/greydragon888/real-router/commit/546706b65af2ba9f46ad33666fada7e6a58ca6f3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix index desync when guard blocks back/forward navigation ([#294](https://github.com/greydragon888/real-router/issues/294))

  `#go(delta)` no longer leaves `#index` out of sync when a guard blocks navigation — `canGoBack()`/`canGoForward()` always reflect the actual router state. Also adds early return for `go(0)`.

  > **Historical note:** a follow-up commit switched the implementation to optimistic-update-with-revert: `#index` is updated synchronously and reverted in the reject handler of the `.then(onResolve, onReject)` navigation promise. `canGoBack()`/`canGoForward()` reflect the **intended target** while navigation is in flight and revert on guard rejection. See `ARCHITECTURE.md` for the current design.
