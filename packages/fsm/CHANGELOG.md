# @real-router/fsm

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
