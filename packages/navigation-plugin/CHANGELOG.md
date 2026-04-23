# @real-router/navigation-plugin

## 0.6.0

### Minor Changes

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix canDeactivate guard contract on browser back/forward ([#524](https://github.com/greydragon888/real-router/issues/524))

  Two related defects made `canDeactivate` guards effectively unusable under `@real-router/navigation-plugin` for the documented "confirm-on-back" dirty-form pattern:

  **A. `forceDeactivate` default flipped from `true` → `false`.**
  Previously every browser back/forward silently bypassed `canDeactivate` guards. The same user code that works under `@real-router/browser-plugin` stopped working under `navigation-plugin` with no visible signal. New default respects guards; apps that need the old bypass behaviour opt in explicitly via `navigationPluginFactory({ forceDeactivate: true })`. Pre-1.0, so this ships as a minor bump; migration is a one-line opt-in.

  **B. `withRecovery` now explicitly syncs URL back on `RouterError`.**
  `navigate-handler.ts` used to silently swallow `RouterError` thrown from `router.navigate()` (`CANNOT_DEACTIVATE`, `CANNOT_ACTIVATE`, `SAME_STATES`, etc.). The intercept handler then returned a resolved promise, and the Navigation API committed the URL change even though the router had rejected the transition — leaving URL and router state desynchronized.

  Now, when `router.navigate()` rejects with `RouterError`, the plugin calls `syncUrlToRouterState` — `browser.navigate({ history: "replace" })` to the current router state — so URL and state stay consistent. `finished` resolves (URL is valid, just back at the previous state); observers that need the rejection get it through the router's existing `TRANSITION_ERROR` / `TRANSITION_CANCEL` events. Manual sync is used instead of relying on Navigation API's built-in rollback on intercept rejection, which leaves a visible "committed-then-reverted" URL window in Chromium headless and some cross-origin setups.

  Non-`RouterError` exceptions still go through the pre-existing `recoverFromNavigateError` path (now refactored to call the same `syncUrlToRouterState` helper + log a critical-error line).

  Four new regression tests under "canDeactivate guard contract — [#524](https://github.com/greydragon888/real-router/issues/524)" in `tests/functional/navigate.test.ts` pin the combined contract:
  - `forceDeactivate default is false (respect guards)`
  - `browser-initiated navigate triggers canDeactivate guard by default`
  - `guard rejection syncs URL back and leaves router state unchanged`
  - `explicit forceDeactivate: true still bypasses guards (opt-in escape hatch)`

  Two existing tests that assumed the old behaviour are updated:
  - `does NOT recover on RouterError (expected behavior)` — clarifies that the crash-recovery logging path stays quiet for `RouterError`; `finished` resolves normally after manual sync.
  - `direction is "unknown" when traversing to the current entry (equal indices)` — asserts the captured meta persists across the `SAME_STATES` rejection path.
  - `recovery itself fails gracefully (double error)` — updated log-message assertion to the new `Failed to sync URL to router state` marker (the helper was renamed during refactor to decouple logging from URL-sync semantics).

  ### Migration

  If your app relied on browser back/forward skipping `canDeactivate` guards, pass `forceDeactivate: true` explicitly:

  ```ts
  router.usePlugin(navigationPluginFactory({ forceDeactivate: true }));
  ```

  Most apps will not need this — the new default aligns with `browser-plugin` and with the `canDeactivate` contract in `@real-router/core`.

### Patch Changes

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractPath` matching non-segment-boundary base prefix ([#446](https://github.com/greydragon888/real-router/issues/446))

  `extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `buildUrl("/", base)` producing trailing-slash index URLs ([#526](https://github.com/greydragon888/real-router/issues/526))

  `buildUrl("/", "/app")` previously returned `"/app/"` (with trailing slash) for the index route under a non-empty base. That disagreed with the canonical form `normalizeBase("/app/") === "/app"` and produced asymmetric URLs in `browser.history`. The function now collapses index-under-base to the bare base (`"/app"`), keeping URLs symmetric. Roundtrip is preserved: `extractPath("/app", "/app") === "/"`.

  Fix is in the shared `browser-env` source (`shared/browser-env/url-utils.ts`) consumed by `browser-plugin`, `hash-plugin`, and `navigation-plugin` via symlink. Each consumer gets its own patch changeset.

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `#pendingTraverseKey` leak when `browser.traverseTo` throws ([#526](https://github.com/greydragon888/real-router/issues/526))

  If `browser.traverseTo` rejected inside `onTransitionSuccess` (e.g., the target entry was evicted by the Navigation API under memory pressure), `#pendingTraverseKey` was left set — the next transition would then replay the traverse against the same broken key. The key is now consumed **before** the call, so any throw at the traverse site cannot poison subsequent transitions. Symmetric with the existing `isSyncingFromRouter` reset in `finally`.

## 0.5.1

### Patch Changes

- [#520](https://github.com/greydragon888/real-router/pull/520) [`3d6ee88`](https://github.com/greydragon888/real-router/commit/3d6ee88e4aa04979d1c44b9e6d251ef9d3b53ae0) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix cross-document reload loop under router-syncing navigation events ([#518](https://github.com/greydragon888/real-router/issues/518))

  When the plugin's `onTransitionSuccess` hook called `browser.navigate()` to sync
  the URL after a successful transition, the dispatched `navigate` event was
  short-circuited by the handler via a bare `return` while `isSyncingFromRouter`
  was `true`. Per the Navigation API spec, a same-origin `canIntercept` event
  with **no** `event.intercept()` call falls back to a cross-document navigation
  (full page reload). In headless Chromium (Playwright + `vite preview`) this
  triggered an infinite loop: every reload re-ran the app bootstrap, which
  re-entered the same `browser.navigate → navigate event → bare return → reload`
  cycle hundreds of times per second. `page.goto()` could never reach the `load`
  event, breaking Playwright e2e for every example that relied on the plugin
  (e.g. `examples/tauri/react-navigation`).

  The handler now calls `event.intercept({ handler: async () => {} })` on the
  syncing branch — cancelling the cross-document fallback without running any
  router logic (state is already committed). Non-syncing events keep their
  previous behaviour.

  The bug was invisible to the existing test suite because `MockNavigation` did
  not model the cross-document fallback — an un-intercepted event was silently
  committed rather than producing the observable reload. `MockNavigation` now
  has an opt-in `enableStrictIntercept()` mode that mirrors Chromium's behaviour,
  and the fix is covered by four new regression tests under `[#518](https://github.com/greydragon888/real-router/issues/518)`.

## 0.5.0

### Minor Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Desktop environments support (Electron, Tauri) ([#496](https://github.com/greydragon888/real-router/issues/496))

  `safeParseUrl` (shared with `browser-plugin`) no longer depends on `globalThis.location.origin` and no longer filters by scheme. The plugin now works in desktop webviews with non-HTTP origins, subject to Navigation API availability (Safari 26.2+, WebKitGTK 2.52+, Chromium-based webviews).

  **What changed**
  - URL parsing is now scheme-agnostic. `matchUrl()`, `peekBack()`, `peekForward()`, `hasVisited()`, `getVisitedRoutes()`, `traverseToLast()`, `canGoBackTo()` work against any `NavigationHistoryEntry.url`, regardless of scheme.
  - `extractPathFromAbsoluteUrl` / `urlToPath` signatures dropped the unused `context` parameter; the parser is total (always returns a string).

  **Migration**

  No source changes required. For developers targeting WKWebView (macOS/iOS ≤ 26.1) or WebKitGTK ≤ 2.50, prefer `@real-router/browser-plugin` — `navigation-plugin` extensions (`peekBack`, `peekForward`, `traverseToLast`, etc.) have no automatic downgrade and will throw at runtime if the Navigation API is missing.

### Patch Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `new URL()` with `safeParseUrl()` on the navigate-event hot path ([#496](https://github.com/greydragon888/real-router/issues/496))

  `handleNavigateEvent` used `new URL(event.destination.url)` to extract
  `pathname` + `search`. The `safeParseUrl` manual parser (already on the
  hot path via `entryToState`) is 4–6× faster and allocates no `URL` object.

  This removes one `URL` construction per browser-initiated navigation
  (back/forward, link click, programmatic `navigation.navigate()`).
  No behavior change — the Navigation API guarantees absolute URLs, and
  `safeParseUrl` returns identical `pathname`/`search` for them.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `replaceHistoryState` hash preservation and guard `isSyncingFromRouter` against stuck state ([#496](https://github.com/greydragon888/real-router/issues/496))

  Two related correctness fixes in the navigation-plugin internals:

  **1. `replaceHistoryState` now preserves `location.hash`** — symmetric with `onTransitionSuccess`.

  ```ts
  // URL before: /home#anchor
  router.replaceHistoryState("users.view", { id: "123" });
  // URL after:  /users/view/123#anchor  (hash preserved)
  ```

  This matches the behavior already documented in `CLAUDE.md` and the wiki.
  Previously the local `createReplaceHistoryState` implementation dropped the
  hash, while the equivalent helper in `browser-plugin` kept it — causing a
  subtle divergence between the two plugins.

  **2. `isSyncingFromRouter` is now released in a `finally` block** at all three
  set-sites (`onTransitionSuccess`, `createReplaceHistoryState`, and the
  navigate-error recovery path). If the internal `browser.navigate` /
  `browser.replaceState` / `browser.traverseTo` call throws, the sync flag
  will no longer get stuck in the `true` state, which previously caused
  all subsequent browser-initiated navigations to be silently ignored.

  This enforces invariant D4 from `INVARIANTS.md` ("isSyncingFromRouter Error
  Recovery") — see `packages/navigation-plugin/INVARIANTS.md`.

## 0.4.0

### Minor Changes

- [#487](https://github.com/greydragon888/real-router/pull/487) [`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** navigate event on unmatched URL in strict mode no longer silently redirects to `defaultRoute` ([#483](https://github.com/greydragon888/real-router/issues/483))

  When `allowNotFound: false` and a navigate event targets a URL that matches no registered route, the plugin used to silently call `router.navigateToDefault()` inside `event.intercept`. This hid the error from logs, analytics, and the `onTransitionError` plugin hook.

  **New behaviour:**
  - `$$error` event is emitted with `ROUTE_NOT_FOUND` — reaches `Plugin.onTransitionError` hooks and `router.addEventListener("$$error", ...)` listeners.
  - `event.intercept()` handler rejects, so the Navigation API automatically rolls back the URL (no manual `browser.navigate()` call needed).
  - Router state is unchanged.

  The `defaultRoute` option now has a single purpose: it is only consulted by an **explicit** `router.navigateToDefault()` call.

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

## 0.3.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.3.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix URL helpers and harden options validation ([#470](https://github.com/greydragon888/real-router/issues/470))

  **URL helpers (from shared `browser-env`)**
  - `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere.
  - `extractPath` now guarantees a leading slash in the no-match branch.
  - `buildUrl` inserts the `/` separator when the path doesn't already start with one.
  - New `extractPathFromAbsoluteUrl(url, base, context)` helper — alias of `urlToPath` with explicit defensive semantics. Used in `entryToState` and the entry URL path to swallow malformed Navigation API URLs as `null` instead of throwing.

  **Plugin behavior**
  - Entry URL parsing (`entryToState`, `#buildEntryUrl`) now uses the defensive `extractPathFromAbsoluteUrl`. Malformed entry URLs (e.g., from mocks, extensions, or non-spec sources) no longer throw from the Navigation API event handler — they resolve to `undefined` / trigger the "no matching route" branch.
  - `browser.navigate(url, options)` now forwards the full `options` object to `nav.navigate` instead of picking only `state` and `history`. Lets callers pass `info`, `downloadRequest`, and any future Navigation API options transparently.
  - `replaceHistoryState` now preserves `location.hash` — symmetric with `onTransitionSuccess`.
  - `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
  - Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.
  - `shouldReplaceHistory` behavior for `{ replace: false, fromState: undefined }` is now confirmed as `false` (explicit user override). The invariant G4 description was rewritten — it no longer claims the function throws.

  **Internal / performance**
  - `onTransitionSuccess` now composes the URL via `buildUrl(toState.path, base)` instead of `router.buildUrl` dispatch — saves one method lookup per navigation. Tests spying on `router.buildUrl` inside `onTransitionSuccess` must spy on the browser-env `buildUrl` instead.
  - The hash-preservation branch skips the `url + ""` concatenation when the hash is empty.
  - Extracted `withRecovery(run)` helper in `navigate-handler.ts` — dedupes the two `try { await ... } catch { recoverFromNavigateError }` blocks.

  **Breaking (pre-1.0):**
  - `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
  - `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.

## 0.2.3

### Patch Changes

- [#458](https://github.com/greydragon888/real-router/pull/458) [`0b58799`](https://github.com/greydragon888/real-router/commit/0b5879966d2ea68e9ad18add8622cfe3cae2a940) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `computeDirection` returning "back" for traverse with equal indices ([#448](https://github.com/greydragon888/real-router/issues/448))

  `computeDirection("traverse", i, i)` now correctly returns `"unknown"` instead of `"back"` when destination and current indices are equal.

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
