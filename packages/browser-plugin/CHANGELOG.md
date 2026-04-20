# @real-router/browser-plugin

## 0.14.0

### Minor Changes

- [#487](https://github.com/greydragon888/real-router/pull/487) [`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** popstate to unmatched URL in strict mode no longer silently redirects to `defaultRoute` ([#483](https://github.com/greydragon888/real-router/issues/483))

  When `allowNotFound: false` and a popstate event targets a URL that matches no registered route, the plugin used to silently call `router.navigateToDefault({ reload: true, replace: true })`. This hid the error from logs, analytics, and the `onTransitionError` plugin hook, and overloaded `defaultRoute` with two unrelated meanings (explicit target + implicit auto-fallback).

  **New behaviour:**
  - `$$error` event is emitted with `ROUTE_NOT_FOUND` — reaches `Plugin.onTransitionError` hooks and `router.addEventListener("$$error", ...)` listeners.
  - Browser URL is rolled back to the last-known router state (URL↔state consistency preserved).
  - Router state is unchanged.

  The `defaultRoute` option now has a single purpose: it is only consulted by an **explicit** `router.navigateToDefault()` call.

  **Incidental fix:** the same catch now rolls back URL on any `RouterError` (including guard-rejected navigations). Previously, a `canDeactivate: false` on popstate left the browser URL on the new location while router state stayed on the old — an inconsistent observable state that is now resolved.

  **Migration** — if you relied on the silent fallback:

  ```ts
  router.usePlugin(() => ({
    onTransitionError(_toState, _fromState, err) {
      if (err.code === "ROUTE_NOT_FOUND") {
        void router.navigateToDefault({ replace: true });
      }
    },
  }));
  ```

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.13.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.13.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix URL helpers and harden options validation ([#470](https://github.com/greydragon888/real-router/issues/470))

  **URL helpers (from shared `browser-env`)**
  - `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere.
  - `extractPath` now guarantees a leading slash in the no-match branch (`extractPath("users", "/app")` → `"/users"`, previously `"users"`).
  - `buildUrl` inserts the `/` separator when the path doesn't already start with one.

  **Plugin behavior**
  - `replaceHistoryState` now preserves `location.hash` — symmetric with `onTransitionSuccess`.
  - `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
  - Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.

  **Internal / performance**
  - `onTransitionSuccess` now composes the URL via `buildUrl(toState.path, base)` instead of the `router.buildUrl` dispatch — saves one method lookup per navigation. Tests that spied on `router.buildUrl` inside `onTransitionSuccess` must now spy on the browser-env `buildUrl` instead.
  - `BrowserContext` payloads are frozen once at module load (`FROZEN_POPSTATE`, `FROZEN_NAVIGATE`) and reused per transition instead of being recreated and frozen on every write.
  - The hash-preservation branch skips the `url + ""` concatenation when the hash is empty.
  - Internal constant `source` renamed to `POPSTATE_SOURCE` — no public API impact.

  **Breaking (pre-1.0):**
  - `extractPath("", base)` returns `"/"` instead of `""`. In practice this only affects custom callers — production code always passes `url.pathname`, which starts with `/`.
  - `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
  - `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.

## 0.12.2

### Patch Changes

- [#454](https://github.com/greydragon888/real-router/pull/454) [`c835bfa`](https://github.com/greydragon888/real-router/commit/c835bfaec7d4fd6ca64525757e6cfc8092c11969) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractPath` matching non-segment-boundary base prefix ([#446](https://github.com/greydragon888/real-router/issues/446))

  `extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.

- [#452](https://github.com/greydragon888/real-router/pull/452) [`d337422`](https://github.com/greydragon888/real-router/commit/d337422785674a5a0801d44cc1b99647562f0080) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` ([#447](https://github.com/greydragon888/real-router/issues/447))

  Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.

## 0.12.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

## 0.12.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

## 0.11.8

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `browser-env` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `browser-env` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared browser API abstractions now live as bare source files in `shared/browser-env/`, accessed through a git-tracked `src/browser-env` symlink inside this package. Imports use local paths (`./browser-env/index.js`). No API changes, no bundle size difference — end users see no change.

## 0.11.7

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.11.6

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

## 0.11.5

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

## 0.11.4

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

## 0.11.3

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

## 0.11.2

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

## 0.11.1

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

## 0.11.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `meta` from history state, remove `forceId` from popstate restoration ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `state.meta` is no longer written to `history.state` or restored on popstate. `forceId` no longer passed to `makeState`.

  Existing history entries with `meta` are not affected — extra fields are ignored.

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

## 0.10.6

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `areStatesEqual` with path comparison in `shouldReplaceHistory` ([#364](https://github.com/greydragon888/real-router/issues/364))

  Use `toState.path === fromState?.path` instead of `router.areStatesEqual()` to detect same-state reload. Removes `router` parameter dependency from `shouldReplaceHistory`.

- Updated dependencies [[`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e)]:
  - @real-router/core@0.40.1

## 0.10.5

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

## 0.10.4

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

## 0.10.3

### Patch Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `GuardFnFactory` signature in README example ([#298](https://github.com/greydragon888/real-router/issues/298))

  Guard factory receives `(router, getDep)`, not `()`. Updated deactivate guard example to show correct signature.

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

## 0.10.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and fix ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, Router Extensions table, `buildUrl` vs `buildPath` comparison, SSR support section. ARCHITECTURE: fixed FIFO→LIFO interceptor order, added stress test coverage table.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

## 0.10.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `navigateToNotFound()` on popstate when `allowNotFound` is enabled ([#241](https://github.com/greydragon888/real-router/issues/241))

  When `allowNotFound: true` and a popstate event resolves to an unknown route, the plugin now calls `router.navigateToNotFound()` instead of `router.navigateToDefault()`, preserving the unmatched URL for contextual 404 pages.

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

## 0.9.0

### Minor Changes

- [#235](https://github.com/greydragon888/real-router/pull/235) [`9bf5901`](https://github.com/greydragon888/real-router/commit/9bf5901a2ff8ff51428ef15cc90cfd8159b9a379) Thanks [@greydragon888](https://github.com/greydragon888)! - BREAKING: Remove hash routing mode (#234)

  Use `@real-router/hash-plugin` for hash-based routing.
  - Remove `useHash`, `hashPrefix`, `preserveHash` options
  - `BrowserPluginOptions` is now `{ forceDeactivate?, base? }`
  - URL hash fragment (`#section`) is always preserved during navigation
  - Invalid option types now throw `Error` instead of warning and falling back to defaults

## 0.8.0

### Minor Changes

- [#232](https://github.com/greydragon888/real-router/pull/232) [`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate `browser-plugin` to use `extendRouter()` for formal router extension (#231)

  Replaces manual property assignment (`router.buildUrl = ...`) and deletion (`delete router.buildUrl`) with the new `extendRouter()` API. Extensions are now automatically cleaned up via the returned unsubscribe function in `teardown`.

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0

## 0.7.0

### Minor Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove legacy artifacts from Browser interface (#228)

  **BREAKING CHANGE:**
  - `mergeState` option removed from `BrowserPluginOptions`
  - `browser.getState()` removed from `Browser` interface
  - `pushState` / `replaceState` signature changed from `(state, title, path)` to `(state, path)`
  - `HistoryState` type removed
  - `isHistoryState` no longer re-exported
  - `router.lastKnownState` removed (use `router.getState()`)

### Patch Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor into class-based architecture with extracted URL utilities (#225)

  Internal refactoring: replaced monolithic factory closure with `BrowserPlugin` class, extracted URL logic into dedicated `url-utils` module, removed IE/Trident dead code, and simplified popstate handling to use `router.navigate()` through the full core pipeline.

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0

## 0.6.3

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0

## 0.6.0

### Minor Changes

- [#203](https://github.com/greydragon888/real-router/pull/203) [`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `meta.options` from history state and popstate restoration (#202)

  **Breaking Change:** `state.meta.options` is no longer written to `history.state` or restored on popstate.

  Existing history entries with `meta.options` are not affected — extra fields are ignored on spread.

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0

## 0.5.5

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0

## 0.5.3

### Patch Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate internal PluginApi usage to `getPluginApi()` (#170)

  Replaced direct `router.*` PluginApi calls with `api.*` via `getPluginApi(router)` for decoupled plugin architecture. No public API changes.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Adapt plugin function to `PluginFactory` interface change (#184)

  Internal: plugin function parameter now inferred from `PluginFactory` (Router interface) instead of annotated with Router class. Cast to augmented Router for browser-specific properties.

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0

## 0.5.2

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0

## 0.5.0

### Minor Changes

- [#127](https://github.com/greydragon888/real-router/pull/127) [`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `StateMeta.redirected` and `StateMeta.source` writes (#121)

  Internal state construction no longer sets the removed `redirected` and `source` fields on `state.meta`. No public API change — `NavigationOptions.source` and `NavigationOptions.redirected` are unaffected.

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0

## 0.4.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - **Breaking:** Update `navigateToState()` signature (#123)

  Remove `emitSuccess` parameter from the `navigateToState()` override to match the updated core API. Event emission is now driven by FSM transitions.

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/core@0.22.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0

## 0.3.0

### Minor Changes

- [#96](https://github.com/greydragon888/real-router/pull/96) [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7) Thanks [@greydragon888](https://github.com/greydragon888)! - Simplify `start()` override for required path in core (#90)
  - Add `start(path?: string)` overload via module augmentation, so TypeScript allows `router.start()` without arguments when browser-plugin is installed.
  - Remove `StartRouterArguments` type export (**breaking**).
  - The `start()` override now always provides browser location to core when no path is given.

  **Behavioral change:** When browser is at `/` and `router.start()` is called without arguments, the plugin now passes `"/"` to core (previously fell through to `defaultRoute` resolution). If your `defaultRoute` points to a route with a path other than `/`, you may need to add a route for `/` or call `router.start()` then `router.navigateToDefault()` explicitly.

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0

## 0.2.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(browser-plugin)!: adapt to Promise-based navigation API (#45)

  **Breaking Change:** `router.start()` with browser plugin now returns `Promise<State>`.

  ```typescript
  // Before
  router.start("/users", (err, state) => {
    if (err) console.error(err);
  });

  // After
  const state = await router.start("/users");
  ```

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/core@0.17.0

## 0.1.19

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0

## 0.1.18

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0

## 0.1.17

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

## 0.1.16

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0

## 0.1.15

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0

## 0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

## 0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

## 0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

## 0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

## 0.1.7

### Patch Changes

- [`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777) Thanks [@greydragon888](https://github.com/greydragon888)! - Updated to use Plugin Development API

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

## 0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

## 0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

## 0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/logger@0.2.0

## 0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

## 0.1.1

### Patch Changes

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

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - @real-router/core@0.1.0
