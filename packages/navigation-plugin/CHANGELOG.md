# @real-router/navigation-plugin

## 0.2.2

### Patch Changes

- [#454](https://github.com/greydragon888/real-router/pull/454) [`c835bfa`](https://github.com/greydragon888/real-router/commit/c835bfaec7d4fd6ca64525757e6cfc8092c11969) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractPath` matching non-segment-boundary base prefix ([#446](https://github.com/greydragon888/real-router/issues/446))

  `extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.

- [#453](https://github.com/greydragon888/real-router/pull/453) [`27e788a`](https://github.com/greydragon888/real-router/commit/27e788a4b240657205a6abea473b310bfc2287fe) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix entryToState discarding query string and remove redundant shouldReplaceHistory call ([#449](https://github.com/greydragon888/real-router/issues/449), [#450](https://github.com/greydragon888/real-router/issues/450))

  **Bug fix ([#449](https://github.com/greydragon888/real-router/issues/449)):** `entryToState` now includes `url.search` when matching history entries, aligning with `traverseToLast` and `handleNavigateEvent` which already preserved query strings. Previously, history extensions like `peekBack`, `hasVisited`, `canGoBackTo`, and `getVisitedRoutes` would fail to match entries whose URLs contained query parameters.

  **Performance ([#450](https://github.com/greydragon888/real-router/issues/450)):** `onTransitionSuccess` no longer calls `shouldReplaceHistory()` a second time — the push/replace decision is derived from the already-computed `navigationType` on `capturedMeta`.

- [#452](https://github.com/greydragon888/real-router/pull/452) [`d337422`](https://github.com/greydragon888/real-router/commit/d337422785674a5a0801d44cc1b99647562f0080) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` ([#447](https://github.com/greydragon888/real-router/issues/447))

  Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.

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

## 0.1.1

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `browser-env` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `browser-env` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared browser API abstractions now live as bare source files in `shared/browser-env/`, accessed through a git-tracked `src/browser-env` symlink inside this package. Imports use local paths (`./browser-env/index.js`). `type-guards` added to devDependencies (previously transitive via browser-env). No API changes, no bundle size difference — end users see no change.

## 0.1.0

### Minor Changes

- [#436](https://github.com/greydragon888/real-router/pull/436) [`8103290`](https://github.com/greydragon888/real-router/commit/8103290e7931c219ac0157423c51a2b85d98f156) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(navigation-plugin): Navigation API browser plugin

  Drop-in replacement for `@real-router/browser-plugin` that uses the Navigation API instead of History API. Same compatible extensions (buildUrl, matchUrl, replaceHistoryState, start) plus exclusive route-level history extensions: peekBack, peekForward, hasVisited, getVisitedRoutes, getRouteVisitCount, traverseToLast, getNavigationMeta, canGoBack, canGoForward, canGoBackTo.

  Ref: [#293](https://github.com/greydragon888/real-router/issues/293)
