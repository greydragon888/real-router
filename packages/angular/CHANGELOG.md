# @real-router/angular

## 0.16.5

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0
  - @real-router/sources@0.12.4

## 0.16.4

### Patch Changes

- [#1544](https://github.com/greydragon888/real-router/pull/1544) [`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427) Thanks [@greydragon888](https://github.com/greydragon888)! - Update SSR helper import to `@real-router/ssr-utils` ([#1543](https://github.com/greydragon888/real-router/issues/1543))

  Internal refactor — `provideRealRouterFactory`'s use of `hydrateRouter` /
  `serializeRouterState` now comes from the new `@real-router/ssr-utils`
  package instead of the removed `@real-router/core/utils` subpath. No public
  API change; `@real-router/ssr-utils` is added as a runtime dependency.

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427), [`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0
  - @real-router/ssr-utils@0.1.0
  - @real-router/sources@0.12.3

## 0.16.3

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0
  - @real-router/sources@0.12.2

## 0.16.2

### Patch Changes

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0
  - @real-router/route-utils@0.3.0
  - @real-router/sources@0.12.1

## 0.16.1

### Patch Changes

- [#1517](https://github.com/greydragon888/real-router/pull/1517) [`65cfd52`](https://github.com/greydragon888/real-router/commit/65cfd525f217722682280e45257269079022138e) Thanks [@greydragon888](https://github.com/greydragon888)! - Cover RouteView fallback resolution with real AOT unit tests, drop the `v8 ignore` ([#1512](https://github.com/greydragon888/real-router/issues/1512))

  No runtime changes (comment-only edit in `RouteView.ts`). The package's vitest config now runs two projects in one pass — the existing JIT suite plus a new `tests/aot/` project compiled by `@analogjs/vite-plugin-angular` — so the Self/NotFound fallback arms and the [#1439](https://github.com/greydragon888/real-router/issues/1439) first-wins duplicate-marker semantics are executed and asserted for real (mutation-validated), instead of being excluded from coverage.

## 0.16.0

### Minor Changes

- [#1511](https://github.com/greydragon888/real-router/pull/1511) [`203ffb1`](https://github.com/greydragon888/real-router/commit/203ffb18ea1cf059068d44b01bd410dca8544d9a) Thanks [@greydragon888](https://github.com/greydragon888)! - Align duplicate `routeNotFound` templates to first-wins, matching `routeMatch` / `routeSelf` and the React/Preact/Solid/Vue adapters ([#1220](https://github.com/greydragon888/real-router/issues/1220)). Previously, when multiple `<ng-template routeNotFound>` markers were projected into one `<route-view>`, the **last** one rendered (`notFounds().at(-1)`); now the **first** does (`notFounds().at(0)`).

  This removes the previously-documented ability to override an inherited `routeNotFound` template by re-declaring it lower in the projected content — prefer a single `routeNotFound` per `<route-view>`.

  Closes [#1439](https://github.com/greydragon888/real-router/issues/1439).

## 0.15.0

### Minor Changes

- [#1506](https://github.com/greydragon888/real-router/pull/1506) [`fb55d10`](https://github.com/greydragon888/real-router/commit/fb55d10215a73eff485fa29f4ea6b776b2fcd12c) Thanks [@greydragon888](https://github.com/greydragon888)! - Internalize the route-enter/exit window guards: `injectRouteEnter` / `injectRouteExit` now delegate to the shared `createRouteEnterGate` / `guardLeaveListener` primitives from `@real-router/sources` ([#1435](https://github.com/greydragon888/real-router/issues/1435)). The public function signatures are unchanged.

  This also **fixes a spurious `injectRouteEnter` re-fire** unique to Angular: because Angular's `effect()` tracks signals read inside the handler, a handler-read signal changing _without_ a navigation previously re-ran the effect and re-invoked the enter handler for the same route — contrary to the documented "fire once per nav-driven mount" contract. The enter dispatch is now wrapped in `untracked(...)` so the effect depends only on the route source and no longer re-runs (nor re-fires the handler) on a handler-read signal change — bringing Angular to once-per-mount parity with the other five adapters (minor bump: an observable runtime behavior change, though it only affects handlers that both read a signal and relied on the out-of-contract re-fire).

  Also corrects the exit-hook JSDoc: a rejected handler Promise surfaces the original error + `TRANSITION_ERROR`, not `TRANSITION_CANCELLED`.

### Patch Changes

- Updated dependencies [[`fb55d10`](https://github.com/greydragon888/real-router/commit/fb55d10215a73eff485fa29f4ea6b776b2fcd12c)]:
  - @real-router/sources@0.12.0

## 0.14.2

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0
  - @real-router/sources@0.11.5

## 0.14.1

### Patch Changes

- [#1495](https://github.com/greydragon888/real-router/pull/1495) [`9124e50`](https://github.com/greydragon888/real-router/commit/9124e50bdebb9a1755f887344d16f2c87cdcccb6) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal `buildHref` DOM helper to a positional hash argument ([#1442](https://github.com/greydragon888/real-router/issues/1442))

  `buildHref(router, name, params, hash?)` now takes the hash fragment positionally instead of wrapping it in an options object, mirroring the existing `navigateWithHash(router, name, params, hash)` signature and simplifying the `RealLink` href `computed`. Internal-only helper — the git-tracked `src/dom-utils/` copy is kept byte-identical to `shared/dom-utils/`. No public API surface or runtime behavior change; rendered hrefs are identical.

- Updated dependencies [[`996a6da`](https://github.com/greydragon888/real-router/commit/996a6daf9a7092ea1b9878d245d663cbac8f265e)]:
  - @real-router/sources@0.11.4

## 0.14.0

### Minor Changes

- [#1492](https://github.com/greydragon888/real-router/pull/1492) [`983ef1d`](https://github.com/greydragon888/real-router/commit/983ef1d8b41f18040da91f43d8767875a358f8e5) Thanks [@greydragon888](https://github.com/greydragon888)! - Dev-only validation for `<http-status-code>` invalid codes ([#1441](https://github.com/greydragon888/real-router/issues/1441))

  `<http-status-code [code]="N">` now logs a `console.error` in development when `code` is not an integer in `[100, 999]` — Node's `res.end()` rejects such values with "Invalid status code", so the warning surfaces the bad value at the source rather than at the response boundary. The value is still written to the sink (informational, not a block); the check is gated by `isDevMode()` rather than `process.env.NODE_ENV`, which ng-packagr does not replace (`process` is undefined in the browser). Ports the validation that previously existed only in preact.

## 0.13.20

### Patch Changes

- [#1490](https://github.com/greydragon888/real-router/pull/1490) [`6b150c2`](https://github.com/greydragon888/real-router/commit/6b150c2a2c86310604c9476cbf8ca7012cf7cf38) Thanks [@greydragon888](https://github.com/greydragon888)! - Prime the per-request error source in `provideRealRouterFactory` (SSR/SSG) ([#1232](https://github.com/greydragon888/real-router/issues/1232))

  `provideRealRouterFactory` did not eagerly create the per-request error source, so a navigation error firing after a successful `start()` but before a lazily-rendered `RouterErrorBoundary` mounts was invisible — the boundary created its error source lazily on init, after the error, and stayed silent. `provideRealRouter` (SPA) already primed it ([#778](https://github.com/greydragon888/real-router/issues/778)); the factory path lacked the symmetric call. The prime now runs inside the async bootstrap initializer (not a `provideEnvironmentInitializer`) so a router-clone failure — e.g. a disposed `baseRouter` — stays on the Option-A async-reject path instead of becoming a synchronous bootstrap throw.

## 0.13.19

### Patch Changes

- [#1487](https://github.com/greydragon888/real-router/pull/1487) [`1b928b3`](https://github.com/greydragon888/real-router/commit/1b928b37cf6f88908799120535364cd443a3a596) Thanks [@greydragon888](https://github.com/greydragon888)! - Route `injectIsActiveRoute` through the shared `createActiveSource` fast/slow builder ([#1437](https://github.com/greydragon888/real-router/issues/1437))

  `injectIsActiveRoute` called `createActiveRouteSource` directly, so a default-options call always took the slow per-`(router, name)` cached source with its own router subscription — instead of the shared per-router `createActiveNameSelector` fast path the directives (`RealLink`, `RealLinkActive`) already use. Routing it through `createActiveSource` gives the fast path (one shared subscription for any number of distinct-name consumers); the active-state result is identical. Also removes the now-unused `internal/buildActiveRouteOptions.ts`. ([#1437](https://github.com/greydragon888/real-router/issues/1437))

## 0.13.18

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0
  - @real-router/sources@0.11.2

## 0.13.17

### Patch Changes

- [#1469](https://github.com/greydragon888/real-router/pull/1469) [`6e6dbf8`](https://github.com/greydragon888/real-router/commit/6e6dbf88597cd0a951ef3d7ebb1c43a42eaf3d99) Thanks [@greydragon888](https://github.com/greydragon888)! - perf(angular): commit route-reactive UI synchronously to remove the ~0.6-0.9 ms felt-wall nav latency ([#1466](https://github.com/greydragon888/real-router/issues/1466))

  Under zoneless change detection the router notifies synchronously from `router.navigate()`, but any route state read in a template only re-renders on Angular's **asynchronously scheduled** CD flush — a ~0.6-0.9 ms idle gap between the click and the DOM commit (`navMsWall ≫ navMsTask`). `@angular/router` avoids it by activating its `<router-outlet>` imperatively in-task; the adapter deferred.

  Two commits close it by rendering in the click task (the source callbacks fire outside Angular CD, so a local `detectChanges()` is safe — the same philosophy as `RealLink`'s existing direct-DOM write):

  - **`RouteView`** — `detectChanges()` after the route-node source updates, so the `@if (activeTemplate())` outlet swap commits in-task (route-switch navigations).
  - **`injectRoute` / `injectRouteNode`** — sync-commit the consuming component on route change, so route-state displays (`{{ params.id }}`, active content, route name) commit in-task even when the outlet template doesn't swap (same-route param changes, RouteView-less views). Uses the cached route source (a shared subscription) and an optional `ChangeDetectorRef` (environment-context usage stays deferred).

  Same-session A/B on the cross-router benchmark (Apple M3 Pro): `navMsWall` collapses to ≈ its CPU cost across every per-nav scenario — nav-latency **0.97 → 0.07 (~13×)**, active-links **0.73 → 0.08 (~9×)**, param-nav **0.77 → 0.10 (~8×)**, nested-switch **0.84 → 0.12 (~7×)**, nav-churn **1.02 → 0.08 (~13×)**. real-router now leads `@angular/router` on felt nav latency by ~3-13× (it was up to ~4× behind on the plain-link case). The route-view/leaf render simply lands in-task now, so CPU-metric sweeps tick up a few µs while staying 3-11× ahead. Behaviour is otherwise identical.

## 0.13.16

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0
  - @real-router/sources@0.11.1

## 0.13.15

### Patch Changes

- [#1424](https://github.com/greydragon888/real-router/pull/1424) [`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor(angular): import `createActiveSource` from `@real-router/sources` ([#1416](https://github.com/greydragon888/real-router/issues/1416))

  The fast/slow active-source builder moved to `@real-router/sources` (one shared
  copy for all adapters). `RealLink` and `RealLinkActive` now import
  `createActiveSource` from there; the local `internal/createActiveSource.ts` copy
  (and its test) is removed. No behavior change — the builder's logic and signature
  are unchanged (`buildActiveRouteOptions` stays for `injectIsActiveRoute`).

- Updated dependencies [[`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85)]:
  - @real-router/sources@0.11.0

## 0.13.14

### Patch Changes

- [#1393](https://github.com/greydragon888/real-router/pull/1393) [`ea2d08a`](https://github.com/greydragon888/real-router/commit/ea2d08ae04f527d2e544a09e599aa65d7221b835) Thanks [@greydragon888](https://github.com/greydragon888)! - Strictly-decoded `<Link hash>` fragment ([#1211](https://github.com/greydragon888/real-router/issues/1211)) — the copy-from-`location.hash` tolerance (E.1) is removed

  `encodeFragmentInline` (the `<Link hash>` fallback-path encoder, used when no URL plugin is present) previously probed for a percent escape and decode+re-encoded it (audit E.1 — "realistic consumers paste hashes out of `location.hash`"). It is now the trivial `encodeURI(s).replace(/#/g, "%23")` — byte-identical to the plugin layer's `encodeHashFragment`, obeying one strict contract. `<Link hash="a%20b">` renders `#a%2520b` (the literal fragment `a%20b`), not `#a%20b`. **Breaking** for consumers who passed raw, percent-encoded `location.hash` — pass a decoded fragment (`hash="a b"`). Part of the wave-2 hash cluster FORM axis.

## 0.13.13

### Patch Changes

- [#1384](https://github.com/greydragon888/real-router/pull/1384) [`7e7610e`](https://github.com/greydragon888/real-router/commit/7e7610e887e14073afae600fdd05088107876fa2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix two `shared/dom-utils` regressions that ship into this adapter ([#1216](https://github.com/greydragon888/real-router/issues/1216), [#1217](https://github.com/greydragon888/real-router/issues/1217))

  - **[#1216](https://github.com/greydragon888/real-router/issues/1216) (scroll-spy):** the container-scoped `MutationObserver` cannot observe its own container's removal (a mutation of the container's parent), so a remounted scroll container was never re-observed. The router-subscribe callback now re-resolves + re-observes on navigation when the tracked container has detached — navigation is exactly when route-tied containers mount/die. Preserves the [#780](https://github.com/greydragon888/real-router/issues/780) container-scoped observation.
  - **[#1217](https://github.com/greydragon888/real-router/issues/1217) (route-announcer):** the shared `aria-live` element + ref-count were not scoped to a generation, so after a host wiped the element without calling `destroy()`, a stale instance's `destroy()` removed the newly-created element (deleted by selector) and drove the ref-count negative. A generation token now gates each instance's teardown, and removal uses the captured element ref.

## 0.13.12

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0
  - @real-router/sources@0.10.13

## 0.13.11

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0
  - @real-router/sources@0.10.12

## 0.13.10

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0
  - @real-router/sources@0.10.11

## 0.13.9

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0
  - @real-router/sources@0.10.10

## 0.13.8

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0
  - @real-router/sources@0.10.9

## 0.13.7

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/sources@0.10.8
  - @real-router/route-utils@0.2.7

## 0.13.6

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0
  - @real-router/sources@0.10.7

## 0.13.5

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0
  - @real-router/sources@0.10.6

## 0.13.4

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0
  - @real-router/sources@0.10.5

## 0.13.3

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0
  - @real-router/sources@0.10.4

## 0.13.2

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0
  - @real-router/sources@0.10.3

## 0.13.1

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0
  - @real-router/sources@0.10.2

## 0.13.0

### Minor Changes

- [#1086](https://github.com/greydragon888/real-router/pull/1086) [`f0d9c7a`](https://github.com/greydragon888/real-router/commit/f0d9c7a23a30a8a6e0f4f080b7901c735a4a9072) Thanks [@greydragon888](https://github.com/greydragon888)! - Expose announcer options on the `<navigation-announcer>` component ([#1065](https://github.com/greydragon888/real-router/issues/1065))

  `<navigation-announcer>` now accepts optional `prefix` and `getAnnouncementText`
  signal inputs — `[prefix]="'Page: '"` and `[getAnnouncementText]="fn"` — to
  customize the screen-reader announcement text, matching the `announceNavigation`
  options on the react/preact/vue/solid/svelte adapters. `getAnnouncementText`
  falls back to the default `h1 → title → route-name` chain when it returns an
  empty string or throws. Without either input the announcer keeps speaking the
  default `"Navigated to <route.name>"`, so the change is fully backward
  compatible. Options are read once in `ngOnInit` (after the input bindings fire),
  mirroring the SSR `<http-status-code>` component.

  ```html
  <navigation-announcer [prefix]="'Page: '" [getAnnouncementText]="announce" />
  ```

## 0.12.1

### Patch Changes

- [#1104](https://github.com/greydragon888/real-router/pull/1104) [`ebd2dbb`](https://github.com/greydragon888/real-router/commit/ebd2dbbc03f8be881d01c972685bac3cc8722f21) Thanks [@greydragon888](https://github.com/greydragon888)! - Speed up `RealLink` / `RealLinkActive` mount via a shared active-name selector fast path ([#1103](https://github.com/greydragon888/real-router/issues/1103))

  A default-options `RealLink` / `RealLinkActive` (a non-empty `routeName`, no
  custom `routeParams`, non-strict, query params ignored, no `hash`) now resolves
  its active state through the per-router `createActiveNameSelector` — a single
  shared `router.subscribe` handle for any number of distinct-`routeName` links —
  instead of allocating a per-link `createActiveRouteSource` (a `BaseSource` plus
  its own router subscription for every link). Because `activeClassName` defaults
  to `"active"`, _every_ `RealLink` tracked active state by default, so a
  link-heavy page opened one router subscription per link.

  The path decision lives in the new internal `createActiveSource` helper; the
  selector is wrapped as a `RouterSource<boolean>` so the directives' existing
  `subscribeSourceToSignal` pipeline is unchanged. This ports the Svelte adapter's
  fix ([#1101](https://github.com/greydragon888/real-router/pull/1101)) to Angular.
  On the `link-build` benchmark (mount 1000 links) it removes the per-link source
  setup — ~14.8 → ~12.9 ms / 1000 links — and collapses 1000 router subscriptions
  to one.

  Active-class semantics are unchanged (non-strict, query-ignoring, name-only
  matching is exactly what the default `createActiveRouteSource` did). Any
  deviation from the defaults — custom `routeParams`, `activeStrict`,
  `ignoreQueryParams: false`, hash-aware ([#532](https://github.com/greydragon888/real-router/issues/532)), **or an empty `routeName`** (a
  misuse where the selector's root-active semantics would differ) — keeps the
  full-fidelity per-link slow path.

## 0.12.0

### Minor Changes

- [#1093](https://github.com/greydragon888/real-router/pull/1093) [`42fb94a`](https://github.com/greydragon888/real-router/commit/42fb94a6edbb47c901cae3d2757fa80adf4c87cd) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate the Angular runtime from v21 to v22 ([#1078](https://github.com/greydragon888/real-router/issues/1078))

  The adapter now targets Angular 22. Runtime `@angular/*` devDependencies,
  `ng-packagr`, and `@analogjs/vitest-angular` are bumped to the v22 line, and the
  `peerDependencies` range widens to `@angular/core` / `@angular/common`
  `>=22.0.0`.

  Angular 22 requires **TypeScript 6.0** (already the repo baseline) and
  **Node.js 22+**. The adapter's public API is unchanged — it depends only on
  stable Angular APIs (signals, `inject`/`DestroyRef`, `afterNextRender`,
  `makeEnvironmentProviders`, `TransferState`), none of which are affected by the
  v22 breaking changes (which land in `@angular/router`, `@angular/forms`,
  `HttpClient` — none of which the adapter uses).

  Consumers on Angular 21 should stay on the previous `@real-router/angular`
  release and upgrade Angular to 22 before taking this version.

## 0.11.13

### Patch Changes

- [#1055](https://github.com/greydragon888/real-router/pull/1055) [`772ab91`](https://github.com/greydragon888/real-router/commit/772ab9131a73289adde9ee277159a08346d166f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix route announcer silencing other providers on teardown — ref-count the shared aria-live element ([#783](https://github.com/greydragon888/real-router/issues/783))

  `createRouteAnnouncer` reuses a single shared `[data-real-router-announcer]` aria-live element across all instances, but `destroy()` removed it **unconditionally**. With more than one `RouterProvider` in the same document (micro-frontends — the same multi-provider scenario `scroll-restore`'s `storageKey` exists for), the first provider's `destroy()` detached the shared element while the remaining providers kept writing `textContent` to the now-orphaned node → screen-reader silence, with no signal.

  A module-scoped instance counter now removes the shared element only when the last holder is destroyed. `destroy()` also gained an idempotency guard so repeated calls decrement the count exactly once.

- [#1055](https://github.com/greydragon888/real-router/pull/1055) [`772ab91`](https://github.com/greydragon888/real-router/commit/772ab9131a73289adde9ee277159a08346d166f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll restoration writing a foreign position when two navigations land in one frame ([#782](https://github.com/greydragon888/real-router/issues/782))

  `createScrollRestoration` captures the `previousRoute` scroll position synchronously inside `router.subscribe`, but the snap/restore effect runs a frame later in `requestAnimationFrame`. When two navigations commit in the same frame (`await router.navigate(b); await router.navigate(c)` — a typical programmatic redirect under optimistic sync), the second `subscribe` ran before the first navigation's rAF snapped the viewport to the top, so it read the position of the route **before** `previousRoute` and stored it under `previousRoute`'s key — overwriting `previousRoute`'s honest value. A later back to that route then landed at the wrong position.

  A `scrollSettled` flag now marks the window between `TRANSITION_SUCCESS` and the matching rAF as unsettled; capture is skipped while unsettled, so `previousRoute`'s previously-stored position survives the transit. A genuine user scroll captured in that sub-frame window is physically impossible, so nothing real is lost.

- [#1055](https://github.com/greydragon888/real-router/pull/1055) [`772ab91`](https://github.com/greydragon888/real-router/commit/772ab9131a73289adde9ee277159a08346d166f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll-spy `scrollContainer` pinned at creation — late-mounted/changed containers now honoured ([#780](https://github.com/greydragon888/real-router/issues/780))

  `createScrollSpy`'s `scrollContainer` getter resolved the `IntersectionObserver` root and `MutationObserver` target **once at construction**, despite the option doc claiming resolution "on every event". A container that mounted after the spy was created — the canonical "scroll-spy on a separate route" config, and **always** the case under Angular (the spy is wired at bootstrap, before any component renders) — was never picked up: `root` stayed at the window viewport forever, so the spy computed the active zone against the wrong geometry and wrote the wrong hash to the URL.

  `reconcile()` now compares the resolved container against the one the current observer pair was built with; on a change it rebuilds the `IntersectionObserver` (new root) and re-points the `MutationObserver` (new target), re-scanning anchors under the new scope. The getter is consulted at creation and re-consulted on every reconcile (DOM mutation), so late-mounted and swapped containers are honoured.

- [#1055](https://github.com/greydragon888/real-router/pull/1055) [`772ab91`](https://github.com/greydragon888/real-router/commit/772ab9131a73289adde9ee277159a08346d166f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix View Transitions: a stale success resolver no longer clobbers the next navigation's transition ([#781](https://github.com/greydragon888/real-router/issues/781))

  `createViewTransitions` schedules the `TRANSITION_SUCCESS` deferred-resolver via `setTimeout(0)`, which unconditionally set `currentVT = null` when it ran. If the next navigation started in the task-queue window after success (e.g. `await router.navigate(b); router.navigate(c)`), its leave opened a new view transition and set `currentVT` to it — then the previous success's stale `setTimeout` fired and reset the reference back to `null`. A subsequent cancellation then read `null` and skipped nothing, so a stale animation (old DOM snapshot → cancelled state) leaked; `destroy()` in that window also could not skip it.

  The resolver now captures the transition it belongs to and only clears `currentVT` when it is still that same transition (`if (currentVT === scheduledVT)`), so a concurrent navigation's transition survives. Router behaviour is unchanged — the deferred still resolves; only the harmful visual clobber is removed.

## 0.11.12

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/sources@0.10.1
  - @real-router/route-utils@0.2.5

## 0.11.11

### Patch Changes

- [#1024](https://github.com/greydragon888/real-router/pull/1024) [`2caf59f`](https://github.com/greydragon888/real-router/commit/2caf59fa2e5d71a47349be96e1b93f6276d048c7) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop splitting the active-route source cache key for no-params `realLink` / `realLinkActive` ([#776](https://github.com/greydragon888/real-router/issues/776))

  The `routeParams` input on the `RealLink` and `RealLinkActive` directives now defaults to `undefined` (not `{}`). `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<a realLink>` / `[realLinkActive]` and a manual `injectIsActiveRoute(name)` now share ONE cached source (one router subscription) instead of splitting into two entries (`"{}"` vs `""`). Navigation and href building default to a frozen empty-params object locally; active-state, href and navigation behaviour are unchanged.

## 0.11.10

### Patch Changes

- [#1022](https://github.com/greydragon888/real-router/pull/1022) [`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(angular): RouterErrorBoundary instantiated after an error shows the error ([#778](https://github.com/greydragon888/real-router/issues/778))

  `provideRealRouter` now eagerly creates the per-router error source at bootstrap (via a `provideEnvironmentInitializer`), so a navigation error that fires BEFORE a `RouterErrorBoundary` is instantiated (a lazily-rendered error region, a failed boot navigation — the ordinary load order) is captured and surfaced once the boundary is created. Previously the boundary created the error source lazily on init — after the error had already fired with no subscriber — so it never rendered. Pairs with the [#765](https://github.com/greydragon888/real-router/issues/765) reconnect-reconcile fix: the boundary's `createDismissableError` catches up to the already-captured error on first subscribe.

- Updated dependencies [[`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849)]:
  - @real-router/sources@0.10.0

## 0.11.9

### Patch Changes

- Updated dependencies [[`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7)]:
  - @real-router/sources@0.9.0

## 0.11.8

### Patch Changes

- [#1006](https://github.com/greydragon888/real-router/pull/1006) [`13776df`](https://github.com/greydragon888/real-router/commit/13776df00a9a2498f3dd1311d7a149b5d95f8cd9) Thanks [@greydragon888](https://github.com/greydragon888)! - Content-stabilize `RealLink` / `RealLinkActive` route params ([#988](https://github.com/greydragon888/real-router/issues/988))

  The directives created their active-route source inside a constructor `effect()` (the [#630](https://github.com/greydragon888/real-router/issues/630) reactivity fix) that read `routeParams()` directly. Angular re-allocates an inline `[routeParams]="{ id: 1 }"` literal on every change detection, so the raw signal input changed identity each navigation even when the param content was unchanged — re-running the effect, tearing down and re-creating the cached active-route source (`canonicalJson` cache-key churn + sub/unsub) and re-running `buildHref`, once per navigation per directive.

  A new internal `createStableParams` helper collapses structurally-equal params to a reference-stable value via `shallowEqual` (the same contract as the Vue `<Link>` fix and the React `Link` `memo` comparator), so the source-creation effect and the `href` computed only re-run on real content change. Behavior is unchanged — the stabilized params are always content-equal to the input; binding a stable reference still produces zero churn.

## 0.11.7

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/sources@0.8.10
  - @real-router/route-utils@0.2.4

## 0.11.6

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0
  - @real-router/sources@0.8.9

## 0.11.5

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0
  - @real-router/sources@0.8.8

## 0.11.4

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0
  - @real-router/sources@0.8.7

## 0.11.3

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0
  - @real-router/sources@0.8.6

## 0.11.2

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/sources@0.8.5
  - @real-router/route-utils@0.2.3

## 0.11.1

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0
  - @real-router/sources@0.8.4

## 0.11.0

### Minor Changes

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll restoration not firing on browser back/forward under navigation-plugin ([#694](https://github.com/greydragon888/real-router/issues/694))

  Since [#657](https://github.com/greydragon888/real-router/issues/657) lifted `replace` into `TransitionMeta`, a history **traversal** (back/forward) under `navigation-plugin` now arrives with `transition.replace === true` — a traversal reuses an existing history entry, which is replace-shaped at the history level. `createScrollRestoration` evaluated its replace-skip guard _before_ the back/traverse restore branch, so every back/forward navigation was swallowed and the saved scroll position was never restored.

  Reordered the restore decision tree so `reload` and `back`/`traverse` restore branches run **before** the genuine in-place-replace skip (`router.navigate({ replace: true })`, `navigateToNotFound` still skip as before).

  Also hardened restore for a custom `scrollContainer` that mounts or lays out a few frames after the navigation settles (heavy routes): restore now re-applies the scroll across a bounded frame budget until the container exists and the position sticks, instead of a single best-effort `scrollTo` that could clamp to 0 against not-yet-laid-out content.

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `scrollSpy` option to `provideRealRouter` / `provideRealRouterFactory` — router-coordinated `IntersectionObserver` URL hash spy ([#575](https://github.com/greydragon888/real-router/issues/575))

  New `scrollSpy?: ScrollSpyOptions` field on `RealRouterOptions` / `RealRouterFactoryOptions` wires `createScrollSpy(router, options)` from `shared/dom-utils/` via `provideEnvironmentInitializer` + the new shared `installScrollSpy` helper. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<a realLink [hash]>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

  ```typescript
  bootstrapApplication(AppComponent, {
    providers: [
      provideRealRouter(router, {
        scrollSpy: { selector: "[id]:is(h2,h3)" },
      }),
    ],
  });
  ```

  Available on both `provideRealRouter` (SPA) and `provideRealRouterFactory` (SSR / SSG); on the SSR path the utility correctly NOOP's on the server pass (`document` is undefined). Teardown wired through `inject(DestroyRef)`. Options are a snapshot at bootstrap — not reactive to runtime changes.

  Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<a realLink [hash]>` ([#532](https://github.com/greydragon888/real-router/issues/532)), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

  Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

  The `dom-utils` git-tracked copy now also includes `scroll-spy.ts` (re-materialised from `shared/dom-utils/` via the `prebundle` script — ng-packagr does not follow symlinks).

  See [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## 0.10.0

### Minor Changes

- [#658](https://github.com/greydragon888/real-router/pull/658) [`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING CHANGE (behaviour):** scroll-restoration disambiguation under `browser-plugin` ([#658](https://github.com/greydragon888/real-router/issues/658))

  `createScrollRestoration` (used by `provideRealRouter({ scrollRestoration })`) now disambiguates push, replace, and reload transitions under `@real-router/browser-plugin` using the portable `state.transition.replace` / `state.transition.reload` flags introduced in `@real-router/core`. Before this release the utility had no portable way to read `replace` under browser-plugin, so it called `scrollToHashOrTop` on **every** transition. After this release:
  - Programmatic replace (`navigate(..., { replace: true })`, OAuth callbacks, params canonicalization, `navigateToNotFound()`, auto-force-from-`UNKNOWN_ROUTE`) → **skip** (scroll position preserved)
  - Programmatic reload (`navigate(..., { reload: true })`) → **restore** from `sessionStorage`
  - Forward push (`realLink` without `replace`), browser back/forward (popstate), F5 cross-document → `scrollToHashOrTop` (unchanged)

  Under `@real-router/navigation-plugin` there is no behaviour change — every existing branch (`replace` / `reload` / `traverse` / `direction === "back"`) remains active.

  Opt-out for the legacy snap-on-every-transition behaviour: `scrollRestoration={{ mode: "top" }}`.

  This release also bundles the updated `transition.replace` core field; existing code reading `state.context.navigation.navigationType` is unaffected.

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0
  - @real-router/sources@0.8.3

## 0.9.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Angular post-hydration loader skip via TransferState bridge ([#599](https://github.com/greydragon888/real-router/issues/599))

  `provideRealRouterFactory` now bridges Angular's `TransferState` to the
  hydration scratchpad established by [#596](https://github.com/greydragon888/real-router/issues/596):
  - **Server pass** — after `await router.start(path)` resolves, the
    resulting state is serialized via `serializeRouterState(state)` and
    written to `TransferState` under `@real-router/angular:ssrState`.
    Angular's standard SSR pipeline (`provideClientHydration()` +
    `provideServerRendering()`) embeds the entry as `<script id="ng-state"
type="application/json">…</script>` in the response body.
  - **Client pass** — the same `provideAppInitializer` callback reads
    `TransferState`, finds the seeded JSON, and calls
    `hydrateRouter(router, ssrJson)` instead of `router.start(path)`.
    `hydrateRouter` deposits the parsed state into the one-shot
    scratchpad on `RouterInternals.hydrationState`, and `ssr-data-plugin`'s
    start interceptor reuses the server-resolved `state.context.data`
    without invoking the loader on first paint — parity with the other 5
    adapters that consume `<script>window.__SSR_STATE__</script>` in their
    `entry-client.tsx`.
  - **Pure CSR** — no TransferState seed and `inject(REQUEST, { optional:
true })` returns null; falls back to `router.start(path)` with no write.

  The TransferState key is internal — no public API surface change. Existing
  8 Angular examples (basic, combined, dynamic-routes, hash-routing,
  lazy-loading, nested-routes, persistent-params, animation-examples/\*)
  continue to use `provideRealRouter` for SPA scenarios; the bridge applies
  only to apps using `provideRealRouterFactory` together with
  `provideClientHydration()`.

  Verified end-to-end by `post-hydration loader skip ([#599](https://github.com/greydragon888/real-router/issues/599))` e2e in both
  `examples/web/angular/ssr-examples/ssr/` and
  `examples/web/angular/ssr-examples/ssr-streaming/` — counter on
  `window.__LOADER_CALLS__` stays empty after deep-link navigation, parity
  with the 5 cross-adapter baselines.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `provideRealRouterFactory` for SSR support ([#582](https://github.com/greydragon888/real-router/issues/582))

  New `provideRealRouterFactory({ baseRouter, plugins, deps })` API enables per-request router scope for Angular SSR (`@angular/ssr` + `outputMode: "server"`) and SSG build-time render via `renderApplication` + `platformProviders` `REQUEST` mock.

  The factory uses `useFactory` to clone the base router per request via Angular's `REQUEST: InjectionToken<Request | null>` token, runs `router.start(url)` through `provideAppInitializer`, and disposes the per-request router via `DestroyRef.onDestroy`. Conditional `plugins` function form supports browser-plugin server/client separation.

  Existing `provideRealRouter(router)` is unchanged — backward compatible. Both APIs ship in parallel; pick one for the entire application.

  See `packages/angular/CLAUDE.md` SSR Support section and RFC `.claude/rfc-angular-ssr-factory-ru.md`. Related parent issue: [#581](https://github.com/greydragon888/real-router/issues/581).

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<client-only>` and `<server-only>` SSR-aware components ([#604](https://github.com/greydragon888/real-router/issues/604))

  Two paired components for opt-in client/server rendering boundaries.
  Built on `signal()` + `afterNextRender` — `afterNextRender` is a no-op on
  the server, so SSR emits the SSR-side branch (fallback for `<client-only>`,
  projected children for `<server-only>`). After the first browser render the
  signal flips and the `@if` branch swaps. `fallback` is a `TemplateRef`
  input rendered through `<ng-container [ngTemplateOutlet]>`.

  Imported from the new `/ssr` subpath (`@real-router/angular/ssr`, ng-packagr
  secondary entry-point) — see the Stage 2 `defer()` changeset for the
  cross-adapter `/ssr` migration.

  ```ts
  import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";
  ```

  ```html
  <ng-template #loadingTpl>
    <span>Loading…</span>
  </ng-template>

  <client-only [fallback]="loadingTpl">
    <browser-api-widget />
  </client-only>

  <server-only>
    <seo-help-strip />
  </server-only>
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<http-status-code [code]="N"/>` + `provideHttpStatusSink()` + `createHttpStatusSink()` to `/ssr` ([#611](https://github.com/greydragon888/real-router/issues/611))

  Render-time HTTP status declaration for SSR. Angular 21 idioms — DI token `HTTP_STATUS_SINK` provided via `provideHttpStatusSink(sink)` env-providers helper, optional `inject(HTTP_STATUS_SINK, { optional: true })` in the component. The sink write happens in `ngOnInit` (after the input binding is bound), template renders nothing.

  ```ts
  // entry-server.ts
  import { bootstrapApplication } from "@angular/platform-browser";
  import {
    createHttpStatusSink,
    provideHttpStatusSink,
  } from "@real-router/angular/ssr";

  const sink = createHttpStatusSink();
  await bootstrapApplication(AppRoot, {
    providers: [
      provideRealRouterFactory({ ... }),
      provideHttpStatusSink(sink),
    ],
  });
  response.status(sink.code ?? 200).send(html);
  ```

  ```html
  <!-- inside not-found.component.ts template -->
  <http-status-code [code]="404" />
  ```

  `code` is declared as optional `input<number>()` rather than `input.required<number>()` to keep the JIT/TestBed test path safe (`NG0950` would fire otherwise) — the `ngOnInit` body skips the write when the value is `undefined`.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `defer()` consumers + `/ssr` subpath split ([#611](https://github.com/greydragon888/real-router/issues/611))

  Mirrors the React Stage 1 + Stage 0a roll-out ([#609](https://github.com/greydragon888/real-router/issues/609) / [#610](https://github.com/greydragon888/real-router/issues/610)). Angular ships
  via ng-packagr secondary entry-point at `packages/angular/ssr/`:
  - `injectDeferred(key)` — returns `Signal<T | undefined>` reading the
    promise published by the loader at `state.context.ssrDataDeferred[key]`.

  No `<Await>` / `<Streamed>` — Angular uses different control flow
  (`@if` / `async` pipe + signals).

  Idiom: Signals + `effect()` + `@if` / `async` pipe.

  **`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

  ```diff
  - import { ClientOnly, ServerOnly } from "@real-router/angular";
  + import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";
  ```

  The 3-SSR-feature-export threshold (per `.claude/SSR_FEATURE_GAPS_RU.md`
  §8) is reached with `injectDeferred` + `ClientOnly` + `ServerOnly` —
  triggers the subpath split for Angular.

  **Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
  `injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

  **Streaming behaviour**: no server-streaming, incremental hydration on
  the client — 🟡 DX-only — `injectDeferred` ready for future framework
  streaming.

  **Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
  removed from main entry; `injectDeferred` lives at `/ssr` only.

### Patch Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `<a [realLink]="signal()">` active state not reacting to signal input changes in AOT ([#630](https://github.com/greydragon888/real-router/issues/630))

  `RealLink`, `RealLinkActive`, and `RouteView` previously captured signal-input values once in `ngOnInit` — `createActiveRouteSource` / `createRouteNodeSource` was bound to the initial `routeName` / `routeParams` / `hash` / `routeNode` values and never recreated when those inputs changed reactively. In AOT (where signal-input template bindings work), `href` updated correctly (it's a `computed`), but `.active` class kept tracking the original values — asymmetric reactivity, real bug.

  **Fix**: source-creation setup moved from `ngOnInit` into `effect((onCleanup) => …)` from the constructor. Reading signal inputs inside the effect makes the setup reactive to Angular's signal graph — any input change re-runs the effect, `onCleanup` tears down the previous source (no-op for cached sources from `@real-router/sources`), and a new source is created with the current input values. Effect cleanup auto-registers with the injection-context `DestroyRef`.

  **Behavioral parity with React/Preact**: `<Link>` in those adapters re-renders on every prop change and re-evaluates `useIsActiveRoute(routeName, params)` each time. Angular now matches that behavior in AOT.

  **JIT note**: full reactive-input verification requires AOT compilation — JIT rejects signal-input template bindings with `NG0303`. The fix is structurally correct in JIT (existing JIT tests continue to pass) but the asymmetric-reactivity scenario itself can only be reproduced under AOT. CLAUDE.md gotcha updated with the new pattern and testing limitation.

  **No public API change** — the `OnInit` interface and `ngOnInit` method were internal implementation details. Consumers' templates continue to work unchanged.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard against throwing `getAnnouncementText` in `createRouteAnnouncer` ([#628](https://github.com/greydragon888/real-router/issues/628))

  A user-provided `getAnnouncementText` callback that throws was propagating
  the exception up through `router.subscribe`'s listener loop, tearing down
  sibling listeners and breaking navigation tracking elsewhere. The shared
  `resolveText` helper now wraps the callback in try/catch, logs the error
  via `console.error` with a `[real-router]` prefix, and falls through to
  the built-in resolution chain (`<h1>` textContent → `document.title` →
  route name → pathname).

  User-visible effect: a buggy custom announcer resolver no longer breaks
  router subscriptions — the announcer announces the fallback text and
  logs the underlying error so the bug surfaces in dev tools.

  Discovered during the React audit (`review-2026-05-10` §5.7, MED
  severity). Applied to `shared/dom-utils/route-announcer.ts` and the
  git-tracked Angular copy.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `shallowEqual` asymmetry on disjoint-key records ([#627](https://github.com/greydragon888/real-router/issues/627))

  `shallowEqual({ a: undefined }, { b: "" })` returned `true` while
  `shallowEqual({ b: "" }, { a: undefined })` returned `false`. The inner loop
  read missing keys via bracket access as `undefined` and falsely matched
  `prev[key] === undefined`. Added a `hasOwnProperty` guard mirroring React's
  own `shallowEqual` (`packages/shared/shallowEqual.js`).

  Angular consumes a git-tracked copy of `dom-utils` (ng-packagr does not
  follow symlinks); the fix was applied to both `shared/dom-utils/link-utils.ts`
  and `packages/angular/src/dom-utils/link-utils.ts` and verified identical.

  User-visible effect: `<a realLink [routeParams]="{ a: undefined }">` no
  longer compares equal to `[routeParams]="{ b: undefined }"` in directive
  memoization paths — re-render now matches the documented `shallowEqual`
  contract (key-order-insensitive, `Object.is` per key).

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0
  - @real-router/sources@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
  - @real-router/sources@0.8.1

## 0.8.0

### Minor Changes

- [#569](https://github.com/greydragon888/real-router/pull/569) [`5b1eae9`](https://github.com/greydragon888/real-router/commit/5b1eae9e115f5cdf45f4365f3d0bcf5625297140) Thanks [@greydragon888](https://github.com/greydragon888)! - Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options ([#534](https://github.com/greydragon888/real-router/issues/534))

  `provideRealRouter(router, { scrollRestoration })` now accepts `behavior?: ScrollBehavior` and `storageKey?: string`. The git-tracked `packages/angular/src/dom-utils/scroll-restore.ts` copy is synced with `shared/dom-utils/`. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).

## 0.7.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `hash` support to `[realLink]` and `injectIsActiveRoute` ([#532](https://github.com/greydragon888/real-router/issues/532))
  - The `realLink` directive exposes a signal `hash` input
    (`input<string | undefined>(undefined)`) that builds a URL with the
    fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
    extension and, on click, calls the `navigateWithHash` helper. The helper
    auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
    route is navigated to with a different fragment, so anchor-style same-path
    links update both URL and `state.context.url.hashChanged`.
  - `injectIsActiveRoute(name, params, { strict?, ignoreQueryParams?, hash? })`
    accepts an optional `hash` field. When provided, the returned
    `Signal<boolean>` is `true` iff the route matches AND
    `state.context.url.hash` equals the requested fragment exactly — distinct
    hashes get distinct cache entries in `@real-router/sources` (see its
    changeset).

  ```html
  <a realLink routeName="docs" hash="section">Docs</a>
  ```

### Patch Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - SSR-safe anchor lookup in `createScrollRestoration` ([#532](https://github.com/greydragon888/real-router/issues/532))

  `createScrollRestoration` now reads the anchor target from
  `state.context.url.hash` (decoded, populated by the URL plugins) when
  available, falling back to `globalThis.location.hash` otherwise. Removes a
  race between the adapter's commit and the browser's hash update.

- Updated dependencies [[`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534)]:
  - @real-router/sources@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/sources@0.7.3
  - @real-router/route-utils@0.2.2

## 0.6.0

### Minor Changes

- [#555](https://github.com/greydragon888/real-router/pull/555) [`6965977`](https://github.com/greydragon888/real-router/commit/69659772cd4f3c49d570ea1d7a2abec07da7dbed) Thanks [@greydragon888](https://github.com/greydragon888)! - Narrow `injectRoute()` signal return so `routeState().route` is non-nullable; throw a clear error when the router has no active state ([#535](https://github.com/greydragon888/real-router/issues/535))

  `injectRoute()` now throws `"injectRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when called before `router.start()` resolves. The `routeState` signal narrows to `Signal<{ route: State<P>; previousRoute?: State }>` — templates use `routeState().route.name` directly. `injectRouteNode(name)` is unchanged.

## 0.5.0

### Minor Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `injectRouteExit` and `injectRouteEnter` ([#547](https://github.com/greydragon888/real-router/issues/547))

  Angular parity with the React adapter ([#544](https://github.com/greydragon888/real-router/issues/544), [#548](https://github.com/greydragon888/real-router/issues/548)). Identical context types and option shapes; idiomatic Angular implementation uses `inject(DestroyRef)` (for the leave subscription) and `effect()` (for the enter watcher). Both must be called within an injection context.
  - **`injectRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the injection context's `DestroyRef`.
  - **`injectRouteEnter(handler, options?)`** — fires `handler` once when the component is created as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default. Reads from `injectRoute()` (`{ routeState, navigator }`) inside `effect()`; cleanup wired through the active context's `DestroyRef`.

  ```ts
  @Component({ ... })
  class FormComponent {
    constructor() {
      injectRouteExit(async ({ signal }) => {
        await this.api.saveDraft(this.form, { signal });
      });

      injectRouteEnter(({ route, previousRoute }) => {
        analytics.track("page_enter", { route: route.name, from: previousRoute.name });
      });
    }
  }
  ```

  **Handler-reactivity caveat:** `inject*` functions run **once** during component construction; the handler is captured at injection time. The common Angular pattern is to pass a class method whose identity is stable across change detection. To vary behavior over time, read signals **inside** the handler body. See `packages/angular/CLAUDE.md` for details.

  Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `viewTransitions` option to `provideRealRouter()` for View Transitions API integration ([#498](https://github.com/greydragon888/real-router/issues/498))

  Opt in with `provideRealRouter(router, { viewTransitions: true })` to animate route transitions via the browser's View Transitions API. The option is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support).

  ```ts
  import { provideRealRouter } from "@real-router/angular";

  bootstrapApplication(AppComponent, {
    providers: [provideRealRouter(router, { viewTransitions: true })],
  });
  ```

  Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns (hero morph, per-area transitions, direction-aware animations).

  Teardown is wired through `DestroyRef` — same architectural pattern as the existing `scrollRestoration` option ([#497](https://github.com/greydragon888/real-router/issues/497)).

### Patch Changes

- Updated dependencies [[`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2)]:
  - @real-router/core@0.50.2

## 0.4.0

### Minor Changes

- [#539](https://github.com/greydragon888/real-router/pull/539) [`2f39d54`](https://github.com/greydragon888/real-router/commit/2f39d54f82dfb62da5309d8520d4c7d8281c52d6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouteSelf` directive (`<ng-template routeSelf>`) for the parent-as-list pattern ([#538](https://github.com/greydragon888/real-router/issues/538))

  `RouteSelf` is a structural directive (mirrors `RouteMatch`/`RouteNotFound`)
  that marks an `ng-template` as the "self" slot for `<route-view>`. The
  template is rendered when the active route name equals the parent
  `<route-view>`'s `routeNode` input and no descendant `RouteMatch` is active.

  ```html
  <route-view [routeNode]="'users'">
    <ng-template routeSelf>
      <users-list />
    </ng-template>
    <ng-template routeMatch="profile">
      <user-profile />
    </ng-template>
  </route-view>
  ```

  Priority: `RouteMatch` (descendant) → `RouteSelf` (active equals `routeNode`)
  → `RouteNotFound` (`UNKNOWN_ROUTE`). Multiple `RouteSelf` instances follow
  first-wins (declaration order from `contentChildren`). Exported as `RouteSelf`
  from `@real-router/angular`.

## 0.3.0

### Minor Changes

- [#502](https://github.com/greydragon888/real-router/pull/502) [`dcfd9cc`](https://github.com/greydragon888/real-router/commit/dcfd9cc2578c22449d2653d25d0b09a0fdb74681) Thanks [@greydragon888](https://github.com/greydragon888)! - Add opt-in scroll restoration via `provideRealRouter(router, { scrollRestoration })` ([#497](https://github.com/greydragon888/real-router/issues/497))

  `provideRealRouter` now accepts an optional options bag. When `scrollRestoration` is provided, the adapter creates a `createScrollRestoration` instance via `provideEnvironmentInitializer`; teardown is wired through `DestroyRef`.

  ```ts
  import { provideRealRouter } from "@real-router/angular";

  bootstrapApplication(AppComponent, {
    providers: [
      provideRealRouter(router, { scrollRestoration: { mode: "restore" } }),
    ],
  });
  ```

  Supports `manual` / `top` / `restore` modes and a custom scroll container. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.

## 0.2.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.2.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `injectRoute<P>()` / `RouteSignals<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `injectRoute<P>()` now accepts an optional generic so `routeState().route?.params` is typed without `as` casts. `RouteSignals<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the function.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const route = injectRoute<SearchParams>();
  const q = route.routeState().route?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.1.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `injectRouterTransition` / `RouterErrorBoundary` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated `injectRouterTransition` and `RouterErrorBoundary` to `getTransitionSource` / `getErrorSource` from `@real-router/sources`. The cached shared wrapper ignores external `destroy()` — safe alongside `sourceToSignal.destroy()` that runs in `DestroyRef.onDestroy`.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.1.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial Angular 21 adapter for Real-Router ([#462](https://github.com/greydragon888/real-router/issues/462))

  New package `@real-router/angular` — signal-based, zoneless-compatible bindings for Angular 21+. Built with ng-packagr (partial Ivy compilation, FESM2022 ESM-only output).

  **Public API:**
  - `provideRealRouter(router)` — environment providers for DI
  - Injection tokens: `ROUTER`, `NAVIGATOR`, `ROUTE`
  - `inject*` functions: `injectRouter`, `injectNavigator`, `injectRoute`, `injectRouteNode`, `injectRouteUtils`, `injectRouterTransition`, `injectIsActiveRoute`
  - Components: `RouteView`, `RouterErrorBoundary`, `NavigationAnnouncer`
  - Directives: `RouteMatch`, `RouteNotFound`, `RealLink`, `RealLinkActive`
  - `sourceToSignal(source)` — bridge for RouterSource to Angular Signal

  **Features:**
  - Signal-first reactive state via `sourceToSignal` (no RxJS dependency)
  - Declarative route matching with `<route-view>` + `ng-template routeMatch="..."` / `ng-template routeNotFound`
  - WCAG-compliant navigation announcements via `NavigationAnnouncer` component
  - Link shipped with `shallowEqual`-based props equality from day 1 (same hot-path optimization as the other adapters)
  - Shared `dom-utils` (link utilities, route announcer) materialized from `shared/dom-utils/` via `prebundle` script — ng-packagr does not follow symlinks the same way tsdown does

  **Coverage threshold 94/84/94/94 (statements/branches/functions/lines)** — JIT TestBed does not bind signal `input()` in templates, so directive callbacks and `contentChildren` paths are unreachable without AOT. See `packages/angular/CLAUDE.md` for the full list of lines excluded from JIT coverage.

  **Peer dependencies:** `@angular/core >= 21.0.0`, `@angular/common >= 21.0.0`.
