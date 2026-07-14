# @real-router/solid

## 0.16.18

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0
  - @real-router/sources@0.11.2

## 0.16.17

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0
  - @real-router/sources@0.11.1

## 0.16.16

### Patch Changes

- [#1430](https://github.com/greydragon888/real-router/pull/1430) [`598b369`](https://github.com/greydragon888/real-router/commit/598b36909c581dd9b8401a84202cf1832078ccca) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(solid): `<Link routeName="">` is inactive, matching `router.isActiveRoute("")` ([#1427](https://github.com/greydragon888/real-router/issues/1427))

  Solid's `<Link>` resolved default-options active state through the per-router
  `routeSelector` (`createSelector` + `isRouteActive`), whose unstarted sentinel
  (`routeSignal().route?.name ?? ""`) makes `isRouteActive("", "") === true` — so a
  misused empty-name Link lit up **before `router.start()`**, diverging from the
  canonical `router.isActiveRoute("") === false`. (A started router was already
  correct — `isRouteActive("", "<route>")` is `false` — so this closes only the
  unstarted/stopped window.) `useFastPath` now guards `routeName !== ""`, routing an
  empty name to the slow `createActiveRouteSource`, which reads
  `router.isActiveRoute("")` in every router state. This aligns solid with the other
  five adapters ([#1416](https://github.com/greydragon888/real-router/issues/1416)/[#1424](https://github.com/greydragon888/real-router/issues/1424) · [#1427](https://github.com/greydragon888/real-router/issues/1427)). The `isRouteActive` helper and its property
  locks are unchanged. No change for any non-empty name.

## 0.16.15

### Patch Changes

- Updated dependencies [[`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85)]:
  - @real-router/sources@0.11.0

## 0.16.14

### Patch Changes

- [#1393](https://github.com/greydragon888/real-router/pull/1393) [`ea2d08a`](https://github.com/greydragon888/real-router/commit/ea2d08ae04f527d2e544a09e599aa65d7221b835) Thanks [@greydragon888](https://github.com/greydragon888)! - Strictly-decoded `<Link hash>` fragment ([#1211](https://github.com/greydragon888/real-router/issues/1211)) — the copy-from-`location.hash` tolerance (E.1) is removed

  `encodeFragmentInline` (the `<Link hash>` fallback-path encoder, used when no URL plugin is present) previously probed for a percent escape and decode+re-encoded it (audit E.1 — "realistic consumers paste hashes out of `location.hash`"). It is now the trivial `encodeURI(s).replace(/#/g, "%23")` — byte-identical to the plugin layer's `encodeHashFragment`, obeying one strict contract. `<Link hash="a%20b">` renders `#a%2520b` (the literal fragment `a%20b`), not `#a%20b`. **Breaking** for consumers who passed raw, percent-encoded `location.hash` — pass a decoded fragment (`hash="a b"`). Part of the wave-2 hash cluster FORM axis.

## 0.16.13

### Patch Changes

- [#1384](https://github.com/greydragon888/real-router/pull/1384) [`7e7610e`](https://github.com/greydragon888/real-router/commit/7e7610e887e14073afae600fdd05088107876fa2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix two `shared/dom-utils` regressions that ship into this adapter ([#1216](https://github.com/greydragon888/real-router/issues/1216), [#1217](https://github.com/greydragon888/real-router/issues/1217))

  - **[#1216](https://github.com/greydragon888/real-router/issues/1216) (scroll-spy):** the container-scoped `MutationObserver` cannot observe its own container's removal (a mutation of the container's parent), so a remounted scroll container was never re-observed. The router-subscribe callback now re-resolves + re-observes on navigation when the tracked container has detached — navigation is exactly when route-tied containers mount/die. Preserves the [#780](https://github.com/greydragon888/real-router/issues/780) container-scoped observation.
  - **[#1217](https://github.com/greydragon888/real-router/issues/1217) (route-announcer):** the shared `aria-live` element + ref-count were not scoped to a generation, so after a host wiped the element without calling `destroy()`, a stale instance's `destroy()` removed the newly-created element (deleted by selector) and drove the ref-count negative. A generation token now gates each instance's teardown, and removal uses the captured element ref.

## 0.16.12

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0
  - @real-router/sources@0.10.13

## 0.16.11

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0
  - @real-router/sources@0.10.12

## 0.16.10

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0
  - @real-router/sources@0.10.11

## 0.16.9

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0
  - @real-router/sources@0.10.10

## 0.16.8

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0
  - @real-router/sources@0.10.9

## 0.16.7

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/sources@0.10.8
  - @real-router/route-utils@0.2.7

## 0.16.6

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0
  - @real-router/sources@0.10.7

## 0.16.5

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0
  - @real-router/sources@0.10.6

## 0.16.4

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0
  - @real-router/sources@0.10.5

## 0.16.3

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0
  - @real-router/sources@0.10.4

## 0.16.2

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0
  - @real-router/sources@0.10.3

## 0.16.1

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0
  - @real-router/sources@0.10.2

## 0.16.0

### Minor Changes

- [#1086](https://github.com/greydragon888/real-router/pull/1086) [`f0d9c7a`](https://github.com/greydragon888/real-router/commit/f0d9c7a23a30a8a6e0f4f080b7901c735a4a9072) Thanks [@greydragon888](https://github.com/greydragon888)! - Expose announcer options on `RouterProvider`'s `announceNavigation` prop ([#1065](https://github.com/greydragon888/real-router/issues/1065))

  `announceNavigation` now accepts `boolean | RouteAnnouncerOptions`. Pass an
  object — `{ prefix?, getAnnouncementText? }` — to customize the screen-reader
  announcement text; the callback falls back to the default `h1 → title →
route-name` chain when it returns an empty string or throws. `true` keeps the
  previous default behavior, so the change is fully backward compatible. Mirrors
  the same addition on `@real-router/react`, `@real-router/preact`, and
  `@real-router/vue`.

  ```tsx
  <RouterProvider
    router={router}
    announceNavigation={{
      getAnnouncementText: (route) => `Now on ${route.name}`,
    }}
  >
    <App />
  </RouterProvider>
  ```

## 0.15.6

### Patch Changes

- [#1097](https://github.com/greydragon888/real-router/pull/1097) [`02c81c3`](https://github.com/greydragon888/real-router/commit/02c81c358b5b9d348832e34293c2d01e028a1803) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `RouteView` deep-nesting composition cost and per-navigation subtree remount ([#1094](https://github.com/greydragon888/real-router/issues/1094))

  `RouteView` now selects the winning marker with a winner-keyed `createMemo`
  (`pickWinner` + `winnersEqual`) and materializes its children only when the
  winner actually changes. Two problems are fixed:

  - **Correctness:** the active subtree is preserved across navigations that keep
    the same `<Match>` winner (e.g. `users.list` → `users.view`). Previously every
    navigation re-materialized the winning subtree, disposing and recreating the
    child components and silently losing their local state — divergent from the
    React and Vue adapters, which preserve it.
  - **Performance:** the `CandidateLookup` cache is now keyed by `routeName` alone
    (its content never depended on `nodeName`), so a deeply nested `RouteView`
    chain no longer rebuilds an identical candidate set at every level — removing
    the O(depth²) substring work that made deep-nesting navigation cost grow
    super-linearly with depth.

  No public API change. Marker precedence (Match > Self > NotFound) is unchanged
  and remains locked by the RouteView property-based suite.

## 0.15.5

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

## 0.15.4

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/sources@0.10.1
  - @real-router/route-utils@0.2.5

## 0.15.3

### Patch Changes

- [#1024](https://github.com/greydragon888/real-router/pull/1024) [`2caf59f`](https://github.com/greydragon888/real-router/commit/2caf59fa2e5d71a47349be96e1b93f6276d048c7) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop splitting the active-route source cache key on the slow-path `<Link>` ([#776](https://github.com/greydragon888/real-router/issues/776))

  The `<Link>` slow path (taken for custom `activeStrict` / `ignoreQueryParams` / `hash`) now passes the raw `routeParams` (possibly `undefined`) into `createActiveRouteSource` instead of the merged `EMPTY_PARAMS` (`{}`) default. A no-params slow-path Link therefore shares ONE cached source with a manual `createActiveRouteSource(router, name, undefined)` (key `""`) instead of keying `"{}"`. The `routeSelector` fast path and navigation/href behaviour are unchanged.

## 0.15.2

### Patch Changes

- [#1022](https://github.com/greydragon888/real-router/pull/1022) [`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(solid): RouterErrorBoundary mounted after an error shows the fallback ([#778](https://github.com/greydragon888/real-router/issues/778))

  `RouterProvider` now eagerly creates the per-router error source at mount, so a navigation error that fires BEFORE a `RouterErrorBoundary` mounts (a lazily-loaded app shell, a failed boot navigation — the ordinary load order) is captured and surfaced once the boundary mounts. Previously the boundary created the error source lazily on mount — after the error had already fired with no subscriber — so the fallback never appeared. Pairs with the [#765](https://github.com/greydragon888/real-router/issues/765) reconnect-reconcile fix: the boundary's `createDismissableError` catches up to the already-captured error on first subscribe.

- Updated dependencies [[`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849)]:
  - @real-router/sources@0.10.0

## 0.15.1

### Patch Changes

- Updated dependencies [[`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7)]:
  - @real-router/sources@0.9.0

## 0.15.0

### Minor Changes

- [#1011](https://github.com/greydragon888/real-router/pull/1011) [`307bef8`](https://github.com/greydragon888/real-router/commit/307bef8074bd2e0a6e2983c999bc78a6ab235c9a) Thanks [@greydragon888](https://github.com/greydragon888)! - Ship the `use:link` directive's `JSX.Directives` augmentation in the published types ([#976](https://github.com/greydragon888/real-router/issues/976))

  The `JSX.Directives.link` augmentation previously lived in a standalone `directives.d.ts` that `tsc` never re-emitted, so it never reached `dist/`. Consumers got no type-checking for `use:link` and the runtime-broken accessor form `use:link={() => options}` slipped through `tsc`. The augmentation now lives in `src/directives/link.tsx` (inside the entry's import graph), so `rollup-plugin-dts` bundles it into the published declarations.

  - `use:link` is now type-checked for consumers as `LinkDirectiveOptions | undefined`. The canonical **object** form `use:link={{ routeName }}` is accepted; the **accessor** form `use:link={() => ({ routeName })}` is rejected with TS2322 — it double-wraps into `() => (() => options)`, so the directive receives a function and builds no `href`/navigation. This matches the package's own tests and removes the example-vs-package type inconsistency.
  - Migration: replace any `use:link={() => (options)}` with `use:link={options}`.

## 0.14.7

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/sources@0.8.10
  - @real-router/route-utils@0.2.4

## 0.14.6

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0
  - @real-router/sources@0.8.9

## 0.14.5

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0
  - @real-router/sources@0.8.8

## 0.14.4

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0
  - @real-router/sources@0.8.7

## 0.14.3

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0
  - @real-router/sources@0.8.6

## 0.14.2

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/sources@0.8.5
  - @real-router/route-utils@0.2.3

## 0.14.1

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0
  - @real-router/sources@0.8.4

## 0.14.0

### Minor Changes

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll restoration not firing on browser back/forward under navigation-plugin ([#694](https://github.com/greydragon888/real-router/issues/694))

  Since [#657](https://github.com/greydragon888/real-router/issues/657) lifted `replace` into `TransitionMeta`, a history **traversal** (back/forward) under `navigation-plugin` now arrives with `transition.replace === true` — a traversal reuses an existing history entry, which is replace-shaped at the history level. `createScrollRestoration` evaluated its replace-skip guard _before_ the back/traverse restore branch, so every back/forward navigation was swallowed and the saved scroll position was never restored.

  Reordered the restore decision tree so `reload` and `back`/`traverse` restore branches run **before** the genuine in-place-replace skip (`router.navigate({ replace: true })`, `navigateToNotFound` still skip as before).

  Also hardened restore for a custom `scrollContainer` that mounts or lays out a few frames after the navigation settles (heavy routes): restore now re-applies the scroll across a bounded frame budget until the container exists and the position sticks, instead of a single best-effort `scrollTo` that could clamp to 0 against not-yet-laid-out content.

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `scrollSpy` prop to `RouterProvider` — router-coordinated `IntersectionObserver` URL hash spy ([#575](https://github.com/greydragon888/real-router/issues/575))

  New top-level `scrollSpy?: ScrollSpyOptions` prop wires `createScrollSpy(props.router, props.scrollSpy)` from `shared/dom-utils/`. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

  ```tsx
  <RouterProvider router={router} scrollSpy={{ selector: "[id]:is(h2,h3)" }}>
    {props.children}
  </RouterProvider>
  ```

  Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<Link hash>` ([#532](https://github.com/greydragon888/real-router/issues/532)), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

  Wired through a dedicated `onMount` block (not the shared `mountFeature` helper) so the `selector === ""` opt-out branches before the spy factory runs. Read once on mount — Solid `onMount` is non-reactive, consistent with `scrollRestoration` / `viewTransitions`.

  Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

  Behaviour identical to the React adapter — see [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## 0.13.0

### Minor Changes

- [#658](https://github.com/greydragon888/real-router/pull/658) [`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING CHANGE (behaviour):** scroll-restoration disambiguation under `browser-plugin` ([#658](https://github.com/greydragon888/real-router/issues/658))

  `createScrollRestoration` (used by `<RouterProvider scrollRestoration>`) now disambiguates push, replace, and reload transitions under `@real-router/browser-plugin` using the portable `state.transition.replace` / `state.transition.reload` flags introduced in `@real-router/core`. Before this release the utility had no portable way to read `replace` under browser-plugin, so it called `scrollToHashOrTop` on **every** transition. After this release:
  - Programmatic replace (`navigate(..., { replace: true })`, OAuth callbacks, params canonicalization, `navigateToNotFound()`, auto-force-from-`UNKNOWN_ROUTE`) → **skip** (scroll position preserved)
  - Programmatic reload (`navigate(..., { reload: true })`) → **restore** from `sessionStorage`
  - Forward push (`<Link>` without `replace`), browser back/forward (popstate), F5 cross-document → `scrollToHashOrTop` (unchanged)

  Under `@real-router/navigation-plugin` there is no behaviour change — every existing branch (`replace` / `reload` / `traverse` / `direction === "back"`) remains active.

  Opt-out for the legacy snap-on-every-transition behaviour: `scrollRestoration={{ mode: "top" }}`.

  This release also bundles the updated `transition.replace` core field; existing code reading `state.context.navigation.navigationType` is unaffected.

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0
  - @real-router/sources@0.8.3

## 0.12.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components ([#604](https://github.com/greydragon888/real-router/issues/604))

  Two paired components for opt-in client/server rendering boundaries.
  Built on `createSignal` + `onMount` — `onMount` is SSR-safe and never
  fires on the server, so the initial render emits the SSR-side branch.
  After hydration, the signal flips and `<Show>` swaps the branch.

  ```tsx
  import { ClientOnly, ServerOnly } from "@real-router/solid";

  <ClientOnly fallback={<Skeleton />}>
    <BrowserApiWidget />
  </ClientOnly>;
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<HttpStatusCode code={N}/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` ([#611](https://github.com/greydragon888/real-router/issues/611))

  Render-time HTTP status declaration for SSR. Mirror of `@real-router/react/ssr`, Solid-native idioms (`createContext` + `useContext`).

  ```tsx
  import { renderToString } from "solid-js/web";
  import {
    createHttpStatusSink,
    HttpStatusProvider,
  } from "@real-router/solid/ssr";

  const sink = createHttpStatusSink();
  const html = renderToString(() => (
    <HttpStatusProvider sink={sink}>
      <App />
    </HttpStatusProvider>
  ));
  response.status(sink.code ?? 200).send(html);
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `defer()` consumers + `/ssr` subpath split ([#611](https://github.com/greydragon888/real-router/issues/611))

  Mirrors the React Stage 1 + Stage 0a roll-out ([#609](https://github.com/greydragon888/real-router/issues/609) / [#610](https://github.com/greydragon888/real-router/issues/610)). Solid ships
  three new SSR-feature exports under `@real-router/solid/ssr`:
  - `useDeferred<T>(key)` — returns `Accessor<Promise<T>>` reading the
    promise published by the loader at `state.context.ssrDataDeferred[key]`.
  - `<Await name="key">{(value) => …}</Await>` — wraps `createResource` for
    ergonomic deferred-payload rendering.
  - `<Streamed fallback={…}>{children}</Streamed>` — alias for native
    `<Suspense>` matching cross-adapter naming.

  Idiom: `createResource` + native `<Suspense>`.

  **`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

  ```diff
  - import { ClientOnly, ServerOnly } from "@real-router/solid";
  + import { ClientOnly, ServerOnly } from "@real-router/solid/ssr";
  ```

  **Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
  `injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

  **Streaming behaviour**: true OOO via splice scripts — 🟢 capability + DX.

  **Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
  removed from main entry.

### Patch Changes

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

  The helper is inlined from `shared/dom-utils/link-utils.ts` via the symlink
  graph, so this adapter receives the fix in lockstep with the other 5
  adapters.

  User-visible effect: `<Link routeParams={{ a: undefined }} />` no longer
  compares equal to `<Link routeParams={{ b: undefined }} />` — re-render now
  matches the documented `shallowEqual` contract (key-order-insensitive,
  `Object.is` per key).

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0
  - @real-router/sources@0.8.2

## 0.11.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
  - @real-router/sources@0.8.1

## 0.11.0

### Minor Changes

- [#569](https://github.com/greydragon888/real-router/pull/569) [`5b1eae9`](https://github.com/greydragon888/real-router/commit/5b1eae9e115f5cdf45f4365f3d0bcf5625297140) Thanks [@greydragon888](https://github.com/greydragon888)! - Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options ([#534](https://github.com/greydragon888/real-router/issues/534))

  `scrollRestoration` prop now accepts `behavior?: ScrollBehavior` and `storageKey?: string`. Solid forwards the entire `props.scrollRestoration` object to `createScrollRestoration`, so no provider-side changes were needed. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).

## 0.10.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `hash` support to `<Link>` and `useIsActiveRoute` ([#532](https://github.com/greydragon888/real-router/issues/532))
  - `<Link>` accepts an optional `hash?: string` prop that builds a URL with
    the fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
    extension and, on click, calls the `navigateWithHash` helper. The helper
    auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
    route is navigated to with a different fragment, so anchor-style same-path
    links update both URL and `state.context.url.hashChanged`.
  - `useIsActiveRoute(name, params, strict?, ignoreQueryParams?, hash?)` gains
    an optional fifth `hash` argument. When provided, the hook is `true` iff
    the route matches AND `state.context.url.hash` equals the requested
    fragment exactly — distinct hashes get distinct cache entries in
    `@real-router/sources` (see its changeset).

### Patch Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - SSR-safe anchor lookup in `createScrollRestoration` ([#532](https://github.com/greydragon888/real-router/issues/532))

  `createScrollRestoration` now reads the anchor target from
  `state.context.url.hash` (decoded, populated by the URL plugins) when
  available, falling back to `globalThis.location.hash` otherwise. Removes a
  race between the adapter's commit and the browser's hash update.

- Updated dependencies [[`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534)]:
  - @real-router/sources@0.8.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/sources@0.7.3
  - @real-router/route-utils@0.2.2

## 0.9.0

### Minor Changes

- [#555](https://github.com/greydragon888/real-router/pull/555) [`6965977`](https://github.com/greydragon888/real-router/commit/69659772cd4f3c49d570ea1d7a2abec07da7dbed) Thanks [@greydragon888](https://github.com/greydragon888)! - Narrow `useRoute()` accessor return so `route` is non-nullable; throw a clear error when the router has no active state ([#535](https://github.com/greydragon888/real-router/issues/535))

  `useRoute()` now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before `router.start()` resolves. The accessor return type narrows so `state().route.name` is direct — no `?.`, no `<Show when={state().route}>` wrapper. `useRouteNode(name)` and `useRouteStore()` are unchanged — node-scoped nullability is intentional.

## 0.8.0

### Minor Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteExit` and `useRouteEnter` hooks ([#547](https://github.com/greydragon888/real-router/issues/547))

  Solid parity with the React adapter ([#544](https://github.com/greydragon888/real-router/issues/544), [#548](https://github.com/greydragon888/real-router/issues/548)). API surface and types are identical; idiomatic Solid implementation uses `createEffect` + `onCleanup` instead of `useEffect`.
  - **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the component via `onCleanup`.
  - **`useRouteEnter(handler, options?)`** — fires `handler` once when the component mounts as a result of a navigation. Skip-initial via `route.transition.from`, skip-same-route default. Reads from `useRoute()` (`Accessor<RouteState>`) inside `createEffect`.

  ```tsx
  import { useRouteExit, useRouteEnter } from "@real-router/solid";

  useRouteExit(async ({ signal }) => {
    await api.saveDraft(formState, { signal });
  });

  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
  ```

  **Handler-reactivity caveat:** Solid components run **once**; the handler is captured at hook-call time and is not swapped between renders. To vary behavior over time, read signals **inside** the handler body. See `packages/solid/CLAUDE.md` for details.

  Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `viewTransitions` prop on `<RouterProvider>` for View Transitions API integration ([#498](https://github.com/greydragon888/real-router/issues/498))

  Opt in with `<RouterProvider router={router} viewTransitions>` to animate route transitions via the browser's View Transitions API. The prop is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support).

  Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

  The utility lives in `shared/dom-utils/` as `createViewTransitions(router)` — same architectural pattern as `createScrollRestoration` ([#497](https://github.com/greydragon888/real-router/issues/497)).

### Patch Changes

- Updated dependencies [[`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2)]:
  - @real-router/core@0.50.2

## 0.7.0

### Minor Changes

- [#539](https://github.com/greydragon888/real-router/pull/539) [`2f39d54`](https://github.com/greydragon888/real-router/commit/2f39d54f82dfb62da5309d8520d4c7d8281c52d6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<RouteView.Self>` slot for the parent-as-list pattern ([#538](https://github.com/greydragon888/real-router/issues/538))

  `RouteView.Self` renders its children when the active route name equals the
  parent `RouteView`'s `nodeName` and no descendant `Match` is active.

  ```tsx
  <RouteView nodeName="users">
    <RouteView.Self>
      <UsersList />
    </RouteView.Self>
    <RouteView.Match segment="profile">
      <UserProfile />
    </RouteView.Match>
  </RouteView>
  ```

  Implemented as a Symbol-based marker object (`SELF_MARKER`), symmetric to the
  existing `Match`/`NotFound` markers. Priority: `Match` → `Self` → `NotFound`.
  Multiple `Self` follow first-wins. Optional `fallback` prop wraps children in
  Solid's `<Suspense>`.

## 0.6.0

### Minor Changes

- [#502](https://github.com/greydragon888/real-router/pull/502) [`dcfd9cc`](https://github.com/greydragon888/real-router/commit/dcfd9cc2578c22449d2653d25d0b09a0fdb74681) Thanks [@greydragon888](https://github.com/greydragon888)! - Add opt-in scroll restoration via `RouterProvider.scrollRestoration` ([#497](https://github.com/greydragon888/real-router/issues/497))

  New `scrollRestoration?: ScrollRestorationOptions` prop on `RouterProvider`. Restores scroll position on back navigation, scrolls to top or hash on push. Supports `manual` / `top` / `restore` modes and a custom scroll container.

  ```tsx
  <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
    {/* ... */}
  </RouterProvider>
  ```

  Backed by the shared `createScrollRestoration` utility in `shared/dom-utils` — same pattern as `createRouteAnnouncer`. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.

## 0.5.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.5.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. Returns `Accessor<RouteState<P>>`. The generic is erased at compile time — no runtime change.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const routeState = useRoute<SearchParams>();
  const q = routeState().route?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.4.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: unified node/active source caches moved to `@real-router/sources` ([#467](https://github.com/greydragon888/real-router/issues/467))
  - Migrated `useRouterError`/`useRouterTransition` to `getErrorSource` / `getTransitionSource` — removed local WeakMap caches.
  - Removed local `sharedNodeSource` helper — `createRouteNodeSource` in `@real-router/sources` now caches per `(router, nodeName)` natively.
  - Removed `Link` slow-path `activeSourceCache` + `getOrCreateActiveSource` — `createActiveRouteSource` now caches per `(router, name, params, options)` natively.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.4.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/solid ([#462](https://github.com/greydragon888/real-router/issues/462))
  - Share the `createRouteNodeSource` WeakMap cache between `useRouteNode` and `useRouteNodeStore` via a new internal `sharedNodeSource` helper.
  - Export internal `isRouteActive` / `isSegmentMatch` helpers so property-based tests exercise the production functions instead of inline replicas.
  - Replace the inline IIFE in `<RouterErrorBoundary>` with a `<Show>` boundary.
  - Drop redundant `String(...)` wrappers from the Link slow-path cache key (no behavioral change).
  - Document the `createRouteAnnouncer` options, Safari-ready delay, and the full `RouterContext` shape (`{ router, navigator, routeSelector }`) in CLAUDE.md and the Wiki integration guide.
  - Expand test coverage: gotcha [#2](https://github.com/greydragon888/real-router/issues/2) (Never Destructure Props), gotcha [#9](https://github.com/greydragon888/real-router/issues/9) (No keepAlive disposal), every click modifier for `shouldNavigate`, Navigator surface (`subscribeLeave`, `isLeaveApproved`), `RouterErrorBoundary` `onError` reassignment, and a new 10 000-navigation long-lived subscription stress test (L1).
  - **Security fix**: `RouteView.Match` / `RouteView.NotFound` markers now use local `Symbol()` instead of `Symbol.for()`. The global-registry Symbol was spoofable — any object with `$$type: Symbol.for("RouteView.Match")` would pass the marker check inside `RouteView`. Added regression tests rejecting spoofed markers.
  - Gotcha-coverage negative tests: `activeStrict=true` ancestor rejection ([#10](https://github.com/greydragon888/real-router/issues/10)), `useFastPath` decision frozen at init ([#13](https://github.com/greydragon888/real-router/issues/13)).
  - `buildActiveClassName` in `shared/dom-utils/link-utils.ts` now deduplicates tokens via a shared `parseTokens` helper; new dedupe/merge tests in `packages/dom-utils`.
  - New stress tests: `RouteView` lazy-component switching with Suspense, Link modifier-keys under load, async-guards race (fast navigate during slow guard), `replaceHistoryState` during an active transition, and `getRoutesApi.remove()` mid-session with mounted Links (including 50-link burst removal).
  - Fix Wiki examples: `use:link` directive value must be an accessor function (`() => ({ ... })`), not an options object — documented behavior clarified in `Solid-Integration.md`.

## 0.3.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

## 0.3.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/route-utils@0.2.0
  - @real-router/sources@0.5.0

## 0.2.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

## 0.2.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

## 0.2.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link rest props type compatibility with solid-js 1.9.12 ([#418](https://github.com/greydragon888/real-router/issues/418))

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

## 0.2.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link rest props type compatibility with solid-js 1.9.12 ([#418](https://github.com/greydragon888/real-router/issues/418))

  Added type assertion for `rest` spread on `<a>` element to satisfy `exactOptionalPropertyTypes` constraint introduced in solid-js 1.9.12.

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

## 0.2.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies`. Rollup already inlines `dom-utils` via `nodeResolve`, but the dependency declaration caused `npm install @real-router/solid` to fail with `ETARGET: No matching version found for dom-utils`.

## 0.2.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

## 0.2.5

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

## 0.2.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

## 0.2.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

## 0.2.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component and `use:link` directive crash with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

  `use:link` directive also fixed — replaced direct `router.buildPath()` with `buildHref()`, which also adds `buildUrl` support (browser-plugin) previously missing from the directive.

## 0.2.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

## 0.2.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New component that shows a fallback alongside children when a navigation error occurs. Uses Solid signals (`createSignal`, `createMemo`, `createEffect`) for fine-grained reactivity. Auto-resets on successful navigation.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

## 0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - dom-utils@0.2.1
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6

## 0.1.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```tsx
  <RouterProvider router={router} announceNavigation>
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/solid` — Solid.js integration for Real-Router ([#290](https://github.com/greydragon888/real-router/issues/290))

  New package providing Solid.js bindings with reactive primitives:
  - `RouterProvider`, `Link`, `RouteView` components
  - `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` hooks
  - Built on Solid.js signals for fine-grained reactivity (no re-renders)
  - Automatic cleanup via Solid's reactive scope
  - Single entry point

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `use:link` directive for navigation on any DOM element ([#327](https://github.com/greydragon888/real-router/issues/327))

  New `link` directive that turns any element into a router link with active class tracking, href on `<a>` elements, a11y attributes, and `shouldNavigate` checks.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteStore()` and `useRouteNodeStore()` for granular property-level reactivity ([#326](https://github.com/greydragon888/real-router/issues/326))

  New store-based hooks using `createStore` + `reconcile` from `solid-js/store`. Components reading specific nested properties (e.g., `state.route?.params.id`) only re-run when those properties change — not on every navigation.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, matched content is automatically wrapped in `<Suspense>` from `solid-js`.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` moved from local code into shared private `dom-utils` package.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize active route detection with `createSelector` for O(1) updates ([#328](https://github.com/greydragon888/real-router/issues/328))

  `Link` components now use a shared `createSelector` from `RouterProvider` instead of per-link subscriptions. On navigation, only the previously-active and newly-active links update — all other links skip computation entirely.
