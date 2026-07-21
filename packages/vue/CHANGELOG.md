# @real-router/vue

## 0.18.4

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0
  - @real-router/sources@0.12.4

## 0.18.3

### Patch Changes

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0
  - @real-router/sources@0.12.3

## 0.18.2

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0
  - @real-router/sources@0.12.2

## 0.18.1

### Patch Changes

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0
  - @real-router/route-utils@0.3.0
  - @real-router/sources@0.12.1

## 0.18.0

### Minor Changes

- [#1511](https://github.com/greydragon888/real-router/pull/1511) [`203ffb1`](https://github.com/greydragon888/real-router/commit/203ffb18ea1cf059068d44b01bd410dca8544d9a) Thanks [@greydragon888](https://github.com/greydragon888)! - Align duplicate `<RouteView.NotFound>` to first-wins, matching `<RouteView.Match>` / `<RouteView.Self>` and the React/Preact/Solid adapters ([#1220](https://github.com/greydragon888/real-router/issues/1220)). Previously, when multiple `<RouteView.NotFound>` siblings were declared in one `RouteView`, the **last** one rendered (`appendFallback` picked `.at(-1)`); now `recordFallback` stores the **first** NotFound VNode (`slots.notFoundVNode ??= child`) and it renders. Prefer a single `<RouteView.NotFound>` per `RouteView`.

  Closes [#1439](https://github.com/greydragon888/real-router/issues/1439).

## 0.17.3

### Patch Changes

- [#1506](https://github.com/greydragon888/real-router/pull/1506) [`fb55d10`](https://github.com/greydragon888/real-router/commit/fb55d10215a73eff485fa29f4ea6b776b2fcd12c) Thanks [@greydragon888](https://github.com/greydragon888)! - Internalize the route-enter/exit window guards: `useRouteEnter`/`useRouteExit` (`injectRouteEnter`/`injectRouteExit`) now delegate to the shared `createRouteEnterGate` / `guardLeaveListener` primitives from `@real-router/sources` ([#1435](https://github.com/greydragon888/real-router/issues/1435)). Behavior-neutral — the public hook signatures are unchanged. Also corrects the exit-hook JSDoc: a rejected handler Promise surfaces the original error + `TRANSITION_ERROR`, not `TRANSITION_CANCELLED`.

- Updated dependencies [[`fb55d10`](https://github.com/greydragon888/real-router/commit/fb55d10215a73eff485fa29f4ea6b776b2fcd12c)]:
  - @real-router/sources@0.12.0

## 0.17.2

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0
  - @real-router/sources@0.11.5

## 0.17.1

### Patch Changes

- [#1495](https://github.com/greydragon888/real-router/pull/1495) [`9124e50`](https://github.com/greydragon888/real-router/commit/9124e50bdebb9a1755f887344d16f2c87cdcccb6) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal `buildHref` DOM helper to a positional hash argument ([#1442](https://github.com/greydragon888/real-router/issues/1442))

  `buildHref(router, name, params, hash?)` now takes the hash fragment positionally instead of wrapping it in an options object, mirroring the existing `navigateWithHash(router, name, params, hash)` signature and removing the `props.hash === undefined ? undefined : { hash }` boilerplate at the `<Link>` call site. Internal-only helper (not a public export) — no public API surface or runtime behavior change; rendered hrefs are identical.

- Updated dependencies [[`996a6da`](https://github.com/greydragon888/real-router/commit/996a6daf9a7092ea1b9878d245d663cbac8f265e)]:
  - @real-router/sources@0.11.4

## 0.17.0

### Minor Changes

- [#1492](https://github.com/greydragon888/real-router/pull/1492) [`983ef1d`](https://github.com/greydragon888/real-router/commit/983ef1d8b41f18040da91f43d8767875a358f8e5) Thanks [@greydragon888](https://github.com/greydragon888)! - Dev-only validation for `<HttpStatusCode>` invalid codes ([#1441](https://github.com/greydragon888/real-router/issues/1441))

  `<HttpStatusCode :code="N">` now logs a `console.error` in development when `code` is not an integer in `[100, 999]` — Node's `res.end()` rejects such values with "Invalid status code", so the warning surfaces the bad value at the source rather than at the response boundary. The value is still written to the sink (informational, not a block); the check is stripped from production via the `process.env.NODE_ENV` guard. Ports the validation that previously existed only in preact.

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

- [#1424](https://github.com/greydragon888/real-router/pull/1424) [`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(vue): gate `useRouteEnter` / `useRouteExit` on `<KeepAlive>` deactivation ([#1221](https://github.com/greydragon888/real-router/issues/1221))

  Under Vue's native `<KeepAlive>` a component is deactivated (not unmounted) when
  navigated away from, and its effect scope stays alive. Neither `useRouteEnter` (a
  `watch(route)`) nor `useRouteExit` (a `subscribeLeave`) gated on
  activated/deactivated state, so a sleeping page's handlers kept running on
  unrelated app navigations — a kept-alive page's analytics fired on foreign navs,
  and worst, a sleeping page's **async** (Promise-returning) exit handler was
  spliced into every navigation's leave cycle and blocked the whole app. Both
  composables now track `onActivated` / `onDeactivated` (which only fire under
  KeepAlive — inert otherwise) and skip the handler while deactivated. A deactivated
  page fires neither enter nor exit; waking a kept-alive page does NOT re-fire enter
  (it was never unmounted, so reactivation is not a mount — use Vue's native
  `onActivated` for a "re-run on show" hook).

- [#1424](https://github.com/greydragon888/real-router/pull/1424) [`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(vue): wire `<Link>` to the shared active-name selector fast path ([#1416](https://github.com/greydragon888/real-router/issues/1416))

  `<Link>` built a per-link `createActiveRouteSource` for every link — the [#1250](https://github.com/greydragon888/real-router/issues/1250)
  fast path landed only in the never-called `useIsActiveRoute` composable, so vue
  was the one adapter where K default-options links held K `router.subscribe`
  handles (a ~10k-link page hit the emitter's listener cap). The shared
  `createActiveSource` fast/slow builder (promoted to `@real-router/sources`, where
  it is now shared with the angular directives too) backs BOTH `<Link>`'s reactive
  `watch` and `useIsActiveRoute`, so a default-options link resolves active state
  through ONE per-router `createActiveNameSelector` subscription. Single source of truth for the fast/slow
  decision, so the two callers can no longer drift (the drift that caused [#1416](https://github.com/greydragon888/real-router/issues/1416)).
  Also adds the missing `routeName !== ""` guard the composable's copy lacked
  (empty name stays on the slow path). A paramless `<Link>` to a param route is now
  name-only active while a param instance is active — aligning vue with the react /
  preact / solid / svelte / angular adapters.

- [#1424](https://github.com/greydragon888/real-router/pull/1424) [`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(vue): isolate a throwing `<Link>` @click handler from navigation ([#1352](https://github.com/greydragon888/real-router/issues/1352))

  `<Link>` invoked the user's `@click` handler(s) with no exception isolation and
  before its own `preventDefault` + navigate, so a throwing handler propagated out
  of `handleClick` and the navigation never ran — a throwing `onClick` silently
  prevented the Link from navigating, and in the array form (Vue's compiled
  multi-handler / `v-on` merge) it also aborted the remaining sibling handlers.
  Each user handler now runs through `invokeUserOnClick` (try/catch →
  `console.error` + continue), matching native `<a>` (logs a throwing click
  listener, still performs the default action) and the codebase's adapter-callback
  isolation norm. The handler's own `preventDefault()` still blocks navigation (it
  runs before any throw), so the `defaultPrevented` contract is unchanged.

- Updated dependencies [[`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85)]:
  - @real-router/sources@0.11.0

## 0.16.15

### Patch Changes

- [#1393](https://github.com/greydragon888/real-router/pull/1393) [`ea2d08a`](https://github.com/greydragon888/real-router/commit/ea2d08ae04f527d2e544a09e599aa65d7221b835) Thanks [@greydragon888](https://github.com/greydragon888)! - Strictly-decoded `<Link hash>` fragment ([#1211](https://github.com/greydragon888/real-router/issues/1211)) — the copy-from-`location.hash` tolerance (E.1) is removed

  `encodeFragmentInline` (the `<Link hash>` fallback-path encoder, used when no URL plugin is present) previously probed for a percent escape and decode+re-encoded it (audit E.1 — "realistic consumers paste hashes out of `location.hash`"). It is now the trivial `encodeURI(s).replace(/#/g, "%23")` — byte-identical to the plugin layer's `encodeHashFragment`, obeying one strict contract. `<Link hash="a%20b">` renders `#a%2520b` (the literal fragment `a%20b`), not `#a%20b`. **Breaking** for consumers who passed raw, percent-encoded `location.hash` — pass a decoded fragment (`hash="a b"`). Part of the wave-2 hash cluster FORM axis.

## 0.16.14

### Patch Changes

- [#1384](https://github.com/greydragon888/real-router/pull/1384) [`7e7610e`](https://github.com/greydragon888/real-router/commit/7e7610e887e14073afae600fdd05088107876fa2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix two `shared/dom-utils` regressions that ship into this adapter ([#1216](https://github.com/greydragon888/real-router/issues/1216), [#1217](https://github.com/greydragon888/real-router/issues/1217))

  - **[#1216](https://github.com/greydragon888/real-router/issues/1216) (scroll-spy):** the container-scoped `MutationObserver` cannot observe its own container's removal (a mutation of the container's parent), so a remounted scroll container was never re-observed. The router-subscribe callback now re-resolves + re-observes on navigation when the tracked container has detached — navigation is exactly when route-tied containers mount/die. Preserves the [#780](https://github.com/greydragon888/real-router/issues/780) container-scoped observation.
  - **[#1217](https://github.com/greydragon888/real-router/issues/1217) (route-announcer):** the shared `aria-live` element + ref-count were not scoped to a generation, so after a host wiped the element without calling `destroy()`, a stale instance's `destroy()` removed the newly-created element (deleted by selector) and drove the ref-count negative. A generation token now gates each instance's teardown, and removal uses the captured element ref.

## 0.16.13

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0
  - @real-router/sources@0.10.13

## 0.16.12

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0
  - @real-router/sources@0.10.12

## 0.16.11

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0
  - @real-router/sources@0.10.11

## 0.16.10

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0
  - @real-router/sources@0.10.10

## 0.16.9

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0
  - @real-router/sources@0.10.9

## 0.16.8

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/sources@0.10.8
  - @real-router/route-utils@0.2.7

## 0.16.7

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0
  - @real-router/sources@0.10.7

## 0.16.6

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0
  - @real-router/sources@0.10.6

## 0.16.5

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0
  - @real-router/sources@0.10.5

## 0.16.4

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0
  - @real-router/sources@0.10.4

## 0.16.3

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0
  - @real-router/sources@0.10.3

## 0.16.2

### Patch Changes

- [#1257](https://github.com/greydragon888/real-router/pull/1257) [`0bcc3e0`](https://github.com/greydragon888/real-router/commit/0bcc3e05e92df549d9bc03764866d670f9f1b274) Thanks [@greydragon888](https://github.com/greydragon888)! - Adopt the `createActiveNameSelector` fast path for `<Link>` active state ([#1250](https://github.com/greydragon888/real-router/issues/1250))

  - `useIsActiveRoute` resolves default-options active state (no custom params, non-strict, `ignoreQueryParams`, no `hash`) through the per-router shared `createActiveNameSelector` — one `router.subscribe` for any number of distinct-`routeName` links — instead of a per-instance `createActiveRouteSource` (a `BaseSource` + its own subscription each). Fewer subscriptions ⇒ lower mount cost and less retained heap, with per-nav active-state notifications unchanged (the selector keeps its `areRoutesRelated` pre-filter + only-changed diff). Direct port of the svelte ([#1101](https://github.com/greydragon888/real-router/issues/1101)) / angular ([#1104](https://github.com/greydragon888/real-router/issues/1104)) / react ([#1248](https://github.com/greydragon888/real-router/issues/1248)) / preact ([#1249](https://github.com/greydragon888/real-router/issues/1249)) fast paths. `useRefFromSource` is narrowed to the `subscribe` + `getSnapshot` methods it actually consumes, so the fast path can bridge a two-method selector wrapper without a dead `destroy`. The full argument surface (custom params, strict, `ignoreQueryParams: false`, hash) still uses `createActiveRouteSource`.

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
  the same addition on `@real-router/react` and `@real-router/preact`.

  ```ts
  h(
    RouterProvider,
    {
      router,
      announceNavigation: {
        getAnnouncementText: (route) => `Now on ${route.name}`,
      },
    },
    { default: () => h(App) },
  );
  ```

## 0.15.14

### Patch Changes

- [#1061](https://github.com/greydragon888/real-router/pull/1061) [`aeda6eb`](https://github.com/greydragon888/real-router/commit/aeda6eb4b7628f63696123f73ebfeebbadb66d8b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix per-request router leak in the `v-link` directive stack under SSR ([#779](https://github.com/greydragon888/real-router/issues/779))

  `RouterProvider` pushed its router onto the module-level `v-link` directive
  stack unconditionally in `setup()`, but the release runs in `onScopeDispose`,
  which never fires during `renderToString` (the canonical per-request SSR flow
  never calls `app.unmount()`). The stack therefore grew by one entry per request
  and strong-referenced every per-request router — a leak `router.dispose()`
  cannot clear. The push is now guarded to the browser (`typeof document`), since
  the directive only ever runs in mounted client DOM; the client and hydration
  contract is unchanged.

## 0.15.13

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

## 0.15.12

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/sources@0.10.1
  - @real-router/route-utils@0.2.5

## 0.15.11

### Patch Changes

- [#1024](https://github.com/greydragon888/real-router/pull/1024) [`2caf59f`](https://github.com/greydragon888/real-router/commit/2caf59fa2e5d71a47349be96e1b93f6276d048c7) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop splitting the active-route source cache key for a no-params `<Link>` ([#776](https://github.com/greydragon888/real-router/issues/776))

  The `<Link>` `routeParams` prop now defaults to `undefined` (not `EMPTY_PARAMS`) before the active-route source call. `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<Link routeName="x">` and a manual `useIsActiveRoute("x")` now share ONE cached source (one router subscription) instead of splitting into two entries (`"{}"` vs `""`). Navigation and href building default to `EMPTY_PARAMS` locally; active-state, href and navigation behaviour are unchanged.

## 0.15.10

### Patch Changes

- [#1022](https://github.com/greydragon888/real-router/pull/1022) [`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(vue): RouterErrorBoundary mounted after an error shows the fallback ([#778](https://github.com/greydragon888/real-router/issues/778))

  `RouterProvider` now eagerly creates the per-router error source at mount, so a navigation error that fires BEFORE a `RouterErrorBoundary` mounts (a lazily-loaded app shell, a failed boot navigation — the ordinary load order) is captured and surfaced once the boundary mounts. Previously the boundary created the error source lazily on mount — after the error had already fired with no subscriber — so the fallback never appeared. Pairs with the [#765](https://github.com/greydragon888/real-router/issues/765) reconnect-reconcile fix: the boundary's `createDismissableError` catches up to the already-captured error on first subscribe.

- Updated dependencies [[`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849)]:
  - @real-router/sources@0.10.0

## 0.15.9

### Patch Changes

- Updated dependencies [[`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7)]:
  - @real-router/sources@0.9.0

## 0.15.8

### Patch Changes

- [#991](https://github.com/greydragon888/real-router/pull/991) [`cbc707f`](https://github.com/greydragon888/real-router/commit/cbc707fde74c3d0091f9b41ef3051a7e247852a6) Thanks [@greydragon888](https://github.com/greydragon888)! - Stabilize `<Link>` `routeParams` by content to cut per-navigation re-render cost ([#990](https://github.com/greydragon888/real-router/issues/990))

  The Vue `<Link>` now collapses structurally-equal `routeParams` to a stable
  reference with `shallowEqual` (Object.is per key, order-insensitive — the same
  contract as the React adapter's `Link` `memo` comparator) instead of hashing
  them with `canonicalJson` on every navigation.

  A parent that hands an inline `:routeParams="{ id }"` literal allocates a fresh
  object on each render; previously every navigation re-ran `canonicalJson`
  (`JSON.stringify` + key sort) **and** recomputed `buildHref`. Now same-shape
  navigations skip both — the `href` and active-class derivations only recompute
  when params content actually changes.

  Measured **+19.3%** navigation throughput on the Link-heavy `vs-tanstack` Vue
  benchmark (168.95 → 201.49 hz, formal `vitest bench` same-session A/B, RME
  ±0.9%; Apple M3 Pro / jsdom), and ~28% on an isolated 20-`Link` micro-bench.

  No public API or behavior change. Nested-object param **values** are compared by
  reference (shallow) rather than deep-serialized, so a parent that mutates a
  nested params object in place — or hands a fresh deep-equal nested object and
  relies on it being treated as unchanged — should stabilize it with a
  `ref`/`computed`, exactly as already documented for the React `Link`.

## 0.15.7

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/sources@0.8.10
  - @real-router/route-utils@0.2.4

## 0.15.6

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0
  - @real-router/sources@0.8.9

## 0.15.5

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0
  - @real-router/sources@0.8.8

## 0.15.4

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0
  - @real-router/sources@0.8.7

## 0.15.3

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0
  - @real-router/sources@0.8.6

## 0.15.2

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/sources@0.8.5
  - @real-router/route-utils@0.2.3

## 0.15.1

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0
  - @real-router/sources@0.8.4

## 0.15.0

### Minor Changes

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll restoration not firing on browser back/forward under navigation-plugin ([#694](https://github.com/greydragon888/real-router/issues/694))

  Since [#657](https://github.com/greydragon888/real-router/issues/657) lifted `replace` into `TransitionMeta`, a history **traversal** (back/forward) under `navigation-plugin` now arrives with `transition.replace === true` — a traversal reuses an existing history entry, which is replace-shaped at the history level. `createScrollRestoration` evaluated its replace-skip guard _before_ the back/traverse restore branch, so every back/forward navigation was swallowed and the saved scroll position was never restored.

  Reordered the restore decision tree so `reload` and `back`/`traverse` restore branches run **before** the genuine in-place-replace skip (`router.navigate({ replace: true })`, `navigateToNotFound` still skip as before).

  Also hardened restore for a custom `scrollContainer` that mounts or lays out a few frames after the navigation settles (heavy routes): restore now re-applies the scroll across a bounded frame budget until the container exists and the position sticks, instead of a single best-effort `scrollTo` that could clamp to 0 against not-yet-laid-out content.

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `scrollSpy` prop to `RouterProvider` — router-coordinated `IntersectionObserver` URL hash spy ([#575](https://github.com/greydragon888/real-router/issues/575))

  New top-level `scrollSpy?: ScrollSpyOptions` prop wires `createScrollSpy(router, options)` from `shared/dom-utils/`. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

  ```vue
  <RouterProvider :router="router" :scroll-spy="{ selector: '[id]:is(h2,h3)' }">
    <!-- Your app -->
  </RouterProvider>
  ```

  Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<Link hash>` ([#532](https://github.com/greydragon888/real-router/issues/532)), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

  Reactive — toggling via ref creates/destroys the utility through the shared `watchToggleableUtility(deps, factory)` helper (now wires four utilities: announcer / scroll-restorer / scroll-spy / view-transitions). Watched by primitive fields (`selector`, `rootMargin`), so inline objects with the same values do not thrash; `scrollContainer` getter is invoked lazily inside the utility and excluded from watched sources.

  Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

  Behaviour identical to the React adapter — see [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).

## 0.14.0

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

## 0.13.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components ([#604](https://github.com/greydragon888/real-router/issues/604))

  Two paired components for opt-in client/server rendering boundaries.
  Built on `ref` + `onMounted` — slots `default` and `fallback` switch
  based on the mount state. Server emits the SSR-side branch, client
  matches it on first paint, then `onMounted` flips the rendered slot.

  ```vue
  <ClientOnly>
    <BrowserApiWidget />
    <template #fallback>
      <Skeleton />
    </template>
  </ClientOnly>
  ```

  Or with the render function:

  ```ts
  import { h } from "vue";
  import { ClientOnly } from "@real-router/vue";

  h(
    ClientOnly,
    {},
    {
      default: () => h(BrowserApiWidget),
      fallback: () => h(Skeleton),
    },
  );
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<HttpStatusCode :code="N"/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` ([#611](https://github.com/greydragon888/real-router/issues/611))

  Render-time HTTP status declaration for SSR. Vue-native idioms (`provide` / `inject` via `InjectionKey`). Sink writer fires in `setup()`, component renders nothing.

  ```vue-html
  <HttpStatusProvider :sink="sink">
    <RouterProvider :router="router">
      <App />
    </RouterProvider>
  </HttpStatusProvider>

  <!-- inside NotFound.vue -->
  <HttpStatusCode :code="404" />
  ```

  ```ts
  const sink = createHttpStatusSink();
  const html = await renderToString(createSSRApp(App));
  response.status(sink.code ?? 200).send(html);
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `defer()` consumers + `/ssr` subpath split ([#611](https://github.com/greydragon888/real-router/issues/611))

  Mirrors the React Stage 1 + Stage 0a roll-out ([#609](https://github.com/greydragon888/real-router/issues/609) / [#610](https://github.com/greydragon888/real-router/issues/610)). Vue ships
  three new SSR-feature exports under `@real-router/vue/ssr`:
  - `useDeferred<T>(key)` — reads the promise published by the loader at
    `state.context.ssrDataDeferred[key]`.
  - `<Await name="key">` — `defineComponent` with `async setup()` and a
    scoped slot exposing the resolved value.
  - `<Streamed fallback>` — alias for native `<Suspense>` matching
    cross-adapter naming.

  Idiom: `defineComponent` + `async setup()` + native `<Suspense>`.

  **`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

  ```diff
  - import { ClientOnly, ServerOnly } from "@real-router/vue";
  + import { ClientOnly, ServerOnly } from "@real-router/vue/ssr";
  ```

  **Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
  `injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

  **Streaming behaviour**: chunked HTTP, `<Suspense>` blocking (no OOO
  placeholders) — 🟡 DX-only — formal API.

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

## 0.12.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
  - @real-router/sources@0.8.1

## 0.12.0

### Minor Changes

- [#569](https://github.com/greydragon888/real-router/pull/569) [`5b1eae9`](https://github.com/greydragon888/real-router/commit/5b1eae9e115f5cdf45f4365f3d0bcf5625297140) Thanks [@greydragon888](https://github.com/greydragon888)! - Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options ([#534](https://github.com/greydragon888/real-router/issues/534))

  `<RouterProvider>` now watches `scrollRestoration?.behavior` and `scrollRestoration?.storageKey` as primitive deps and forwards them to `createScrollRestoration` on remount. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).

## 0.11.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `hash` support to `<Link>` and `useIsActiveRoute` ([#532](https://github.com/greydragon888/real-router/issues/532))
  - `<Link>` accepts an optional `hash?: string` prop that builds a URL with
    the fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
    extension and, on click, calls the `navigateWithHash` helper. The helper
    auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
    route is navigated to with a different fragment, so anchor-style same-path
    links update both URL and `state.context.url.hashChanged`.
  - `useIsActiveRoute(name, params, strict?, ignoreQueryParams?, hash?)` gains
    an optional fifth `hash` argument. When provided, the returned
    `ShallowRef<boolean>` is `true` iff the route matches AND
    `state.context.url.hash` equals the requested fragment exactly — distinct
    hashes get distinct cache entries in `@real-router/sources` (see its
    changeset).

### Patch Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - SSR-safe anchor lookup in `createScrollRestoration` ([#532](https://github.com/greydragon888/real-router/issues/532))

  `createScrollRestoration` now reads the anchor target from
  `state.context.url.hash` (decoded, populated by the URL plugins) when
  available, falling back to `globalThis.location.hash` otherwise. Removes a
  race between the adapter's commit and the browser's hash update.

- Updated dependencies [[`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534)]:
  - @real-router/sources@0.8.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/sources@0.7.3
  - @real-router/route-utils@0.2.2

## 0.10.0

### Minor Changes

- [#555](https://github.com/greydragon888/real-router/pull/555) [`6965977`](https://github.com/greydragon888/real-router/commit/69659772cd4f3c49d570ea1d7a2abec07da7dbed) Thanks [@greydragon888](https://github.com/greydragon888)! - Narrow `useRoute()` ref return so `route.value` is non-nullable; throw a clear error when the router has no active state ([#535](https://github.com/greydragon888/real-router/issues/535))

  `useRoute()` now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before `router.start()` resolves. `route` is typed as `Readonly<Ref<State<P>>>` (non-nullable inner value) so `route.value.params.id` is direct in scripts, `{{ route.params.id }}` in templates. `useRouteNode(name)` is unchanged.

## 0.9.0

### Minor Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteExit` and `useRouteEnter` composables ([#547](https://github.com/greydragon888/real-router/issues/547))

  Vue parity with the React adapter ([#544](https://github.com/greydragon888/real-router/issues/544), [#548](https://github.com/greydragon888/real-router/issues/548)). Identical API surface and types; idiomatic Vue implementation uses `onScopeDispose` and `watch` instead of `useEffect`.
  - **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with reentrant abort pre-check and same-route skip (default `true`). Cleanup is bound to the component's effect scope via `onScopeDispose`.
  - **`useRouteEnter(handler, options?)`** — fires `handler` once when the component mounts as a result of a navigation. Skip-initial via `watch(route)` (`immediate: false` by default), skip-same-route via `route.transition.from === route.name`. Reads from `useRoute()` (`{ route, previousRoute }: ShallowRefs`).

  ```ts
  import { useRouteExit, useRouteEnter } from "@real-router/vue";

  useRouteExit(async ({ signal }) => {
    await api.saveDraft(formState.value, { signal });
  });

  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
  ```

  **Handler-reactivity caveat:** Vue composables run **once** in `setup()`; the handler is captured at hook-call time and is not swapped between renders. To vary behavior over time, read refs/computeds **inside** the handler body. See `packages/vue/CLAUDE.md` for details.

  Types exported: `RouteExitContext`, `RouteExitHandler`, `UseRouteExitOptions`, `RouteEnterContext`, `RouteEnterHandler`, `UseRouteEnterOptions`.

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `viewTransitions` prop on `<RouterProvider>` for View Transitions API integration ([#498](https://github.com/greydragon888/real-router/issues/498))

  Opt in with `<RouterProvider :router="router" :view-transitions="true">` to animate route transitions via the browser's View Transitions API. The prop is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support). Reactive — toggling the prop at runtime creates/destroys the utility.

  Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns.

  The utility lives in `shared/dom-utils/` as `createViewTransitions(router)` — same architectural pattern as `createScrollRestoration` ([#497](https://github.com/greydragon888/real-router/issues/497)).

### Patch Changes

- Updated dependencies [[`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2)]:
  - @real-router/core@0.50.2

## 0.8.0

### Minor Changes

- [#539](https://github.com/greydragon888/real-router/pull/539) [`2f39d54`](https://github.com/greydragon888/real-router/commit/2f39d54f82dfb62da5309d8520d4c7d8281c52d6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<RouteView.Self>` slot for the parent-as-list pattern ([#538](https://github.com/greydragon888/real-router/issues/538))

  `RouteView.Self` is a marker `defineComponent` (mirrors `Match`/`NotFound`)
  that renders its slot content when the active route name equals the parent
  `RouteView`'s `nodeName` and no descendant `Match` is active.

  ```vue
  <RouteView nodeName="users">
    <RouteView.Self>
      <UsersList />
    </RouteView.Self>
    <RouteView.Match segment="profile">
      <UserProfile />
    </RouteView.Match>
  </RouteView>
  ```

  Priority: `Match` → `Self` → `NotFound`. Multiple `Self` follow first-wins.
  Optional `fallback` prop (`VNode | () => VNode`) wraps children in
  `<Suspense>`. Compatible with the existing `keepAlive` modes on the
  parent `RouteView`.

## 0.7.0

### Minor Changes

- [#502](https://github.com/greydragon888/real-router/pull/502) [`dcfd9cc`](https://github.com/greydragon888/real-router/commit/dcfd9cc2578c22449d2653d25d0b09a0fdb74681) Thanks [@greydragon888](https://github.com/greydragon888)! - Add opt-in scroll restoration via `RouterProvider.scrollRestoration` ([#497](https://github.com/greydragon888/real-router/issues/497))

  New `scrollRestoration?: ScrollRestorationOptions` prop on `RouterProvider`. Restores scroll position on back navigation, scrolls to top or hash on push. Supports `manual` / `top` / `restore` modes and a custom scroll container.

  ```vue
  <RouterProvider :router="router" :scroll-restoration="{ mode: 'restore' }">
    <!-- ... -->
  </RouterProvider>
  ```

  Backed by the shared `createScrollRestoration` utility in `shared/dom-utils` — same pattern as `createRouteAnnouncer`. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.

## 0.6.3

### Patch Changes

- [#500](https://github.com/greydragon888/real-router/pull/500) [`6ae6ffa`](https://github.com/greydragon888/real-router/commit/6ae6ffa65205437bd09a92892c182b676fffb3b9) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix per-Match `keepAlive` when used as template boolean shorthand ([#500](https://github.com/greydragon888/real-router/issues/500))

  Template usage like `<RouteView.Match segment="dashboard" keepAlive>` was not
  preserving state across navigation. Vue compiles boolean-shorthand attributes
  to an empty string and only promotes them to `true` when the receiving prop is
  declared with `type: Boolean`. `Match` is a render-null marker — its props are
  inspected directly on the VNode without going through the cast pipeline, so
  the raw `""` reached `RouteView` and failed the strict `=== true` check,
  causing the component to fall through to the non-keepAlive render path.

  `detectPerMatchKA` and `renderWithPerMatchKA` now accept the three values Vue's
  own runtime treats as `true` for Boolean props: `true`, `""`, and the
  hyphenated attribute name. Programmatic `h(RouteView.Match, { keepAlive: true })`
  continues to work unchanged.

## 0.6.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.6.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.value?.params` is typed without `as` casts. `RouteContext<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the composable.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const { route } = useRoute<SearchParams>();
  const q = route.value?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.5.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated internal composables to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — `useRouterTransition` previously created a fresh eager-source per mount (no WeakMap cache), leaking a router subscription on every unmount. Multiple consumers now share one router subscription.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.5.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/vue ([#462](https://github.com/greydragon888/real-router/issues/462))
  - **Nested `<RouterProvider>`:** the `v-link` directive now uses a router stack (LIFO) instead of a single `_router` global. Inner providers push on mount and release on unmount, restoring the outer router for `v-link` instances still mounted in the parent scope. Previously, nested providers left the directive pointing at a torn-down router. New `pushDirectiveRouter(router): () => void` is the preferred API; `setDirectiveRouter(...)` is kept for tests and replaces the top of the stack
  - **`<RouterProvider>` `announceNavigation`:** now reactive. Toggling the prop at runtime creates/destroys the announcer accordingly. Previously the prop was read only inside `onMounted`, so post-mount toggles silently no-op'd
  - **`<Link>`:** set `inheritAttrs: false` and manually invoke `attrs.onClick` inside `handleClick`. Vue's compiled templates pass multiple `@click` handlers as an _array_; the previous implementation only invoked function values and silently dropped array cases, leading to double-invocation when attrs fall-through combined with the explicit `onClick`. Arrays are iterated and the loop exits early on `preventDefault()`
  - **`<Link>`:** `isActive` now drives a local `shallowRef` backed by `createActiveRouteSource` with `flush: "sync"`. Resubscription happens only when `routeName` / `routeParams` / `activeStrict` / `ignoreQueryParams` actually change — the prior `useIsActiveRoute` composable resubscribed on any reactive read inside the source factory
  - **`v-link` directive:** validates the binding value before attaching handlers. Missing `value` or missing `name: string` logs a descriptive error and skips wiring — prevents crashes inside click/keydown handlers. Single `handlers` WeakMap replaces two parallel click/keydown maps
  - **`<RouteView>`:** cache per-Match `keepAlive` detection by slot output identity. Steady-state navigations skip the O(n) `elements.some(...)` scan when the parent has not re-rendered the default slot
  - **`useRouteNode`:** derive `route`/`previousRoute` as `computed` over the source snapshot instead of mirroring through two `shallowRef`s with a sync `watch`. Consumers now see a stable reference when the underlying source emits the same snapshot (idempotent or out-of-node navigation)
  - **`RouteContext` types:** `route` / `previousRoute` are now typed as `Readonly<Ref<State | undefined>>` instead of `ShallowRef<State | undefined>`. `useRoute` still returns `shallowRef`-backed values, while `useRouteNode` returns `computed`-derived ones — both satisfy the new `Readonly<Ref>` contract. Consumers that only read `.value` are unaffected
  - **Shared `setupRouteProvision`:** extracted between `RouterProvider` and `createRouterPlugin` so both paths share identical subscription lifecycle. `createRouterPlugin` now cleans up via Vue 3.5's `app.onUnmount` when available (falls back to GC on older 3.3–3.4)
  - **Stress coverage:** expanded suites for keepalive cycling, link mass rendering, mount/unmount lifecycle, subscription fan-out, `shouldUpdate` cache, transition-hook stress, v-link directive stress

  No runtime behavior change for the documented public API aside from the nested-provider fix and the `announceNavigation` reactivity fix.

## 0.4.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

## 0.4.0

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

## 0.3.6

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

## 0.3.5

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

## 0.3.4

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

## 0.3.3

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

## 0.3.2

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/vue` failed with `ETARGET: No matching version found for dom-utils`.

## 0.3.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

## 0.3.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add per-Match `keepAlive` support to `RouteView` ([#391](https://github.com/greydragon888/real-router/issues/391))

  `<RouteView.Match>` now accepts an optional `keepAlive` prop for granular control over which routes preserve state. Previously, `keepAlive` was only available on the root `<RouteView>` (all-or-nothing). Per-Match keepAlive uses a persistent `<KeepAlive>` instance with wrapper components to maintain Vue's cache across navigations.

  ```vue
  <RouteView nodeName="">
    <RouteView.Match segment="dashboard" keepAlive>
      <Dashboard />  <!-- State preserved -->
    </RouteView.Match>
    <RouteView.Match segment="settings">
      <Settings />  <!-- Unmounts normally -->
    </RouteView.Match>
  </RouteView>
  ```

  Root-level `<RouteView keepAlive>` behavior is unchanged.

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

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

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

  New `defineComponent` that shows a fallback alongside slot children when a navigation error occurs. Uses `watch({ immediate: true })` for `onError` callback, `computed` for visible error, and `shallowRef` for dismissed state. Auto-resets on successful navigation.

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

  ```ts
  h(RouterProvider, { router, announceNavigation: true }, () => [...])
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/vue` — Vue 3 integration for Real-Router ([#291](https://github.com/greydragon888/real-router/issues/291))

  New package providing Vue 3 bindings with composables and components:
  - `RouterProvider`, `Link`, `RouteView` components with `keepAlive` support
  - `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` composables
  - Pure TypeScript implementation using `defineComponent` and `h()`
  - Automatic cleanup via Vue's lifecycle hooks
  - Single entry point

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createRouterPlugin()` for `app.use()` installation ([#329](https://github.com/greydragon888/real-router/issues/329))

  New Vue Plugin factory as an alternative to `<RouterProvider>`. Enables the standard `app.use(createRouterPlugin(router))` pattern.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `RouteView.Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, matched content is automatically wrapped in Vue's `<Suspense>`. Works with both `keepAlive` and non-keepAlive modes.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `v-link` directive for navigation on any DOM element ([#330](https://github.com/greydragon888/real-router/issues/330))

  New `vLink` directive that adds navigation behavior with `shouldNavigate` checks, a11y attributes, Enter key support, and `cursor: pointer`.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` moved from local code into shared private `dom-utils` package.
