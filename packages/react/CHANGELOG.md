# @real-router/react

## 0.29.2

### Patch Changes

- [#1497](https://github.com/greydragon888/real-router/pull/1497) [`3b6174d`](https://github.com/greydragon888/real-router/commit/3b6174d8dc5e68a6f81bc0abe1e8be010632e368) Thanks [@greydragon888](https://github.com/greydragon888)! - Isolate a throwing `<Link>` onClick handler from navigation ([#1436](https://github.com/greydragon888/real-router/issues/1436))

  `<Link>` invoked the user's `onClick` handler with no exception isolation and before its own `preventDefault` + navigate, so a throwing handler propagated out of the click handler and silently aborted navigation. Native `<a>` logs a throwing click listener and still performs the default action; the handler is now wrapped in try/catch (logged via `console.error`), matching the codebase's consumer-callback isolation norm (vue's [#1352](https://github.com/greydragon888/real-router/issues/1352), `InkLink` [#799](https://github.com/greydragon888/real-router/issues/799)). The handler's own `preventDefault()` still blocks navigation (it runs before any throw), so the `defaultPrevented` contract is unchanged.

## 0.29.1

### Patch Changes

- [#1495](https://github.com/greydragon888/real-router/pull/1495) [`9124e50`](https://github.com/greydragon888/real-router/commit/9124e50bdebb9a1755f887344d16f2c87cdcccb6) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal `buildHref` DOM helper to a positional hash argument ([#1442](https://github.com/greydragon888/real-router/issues/1442))

  `buildHref(router, name, params, hash?)` now takes the hash fragment positionally instead of wrapping it in an options object, mirroring the existing `navigateWithHash(router, name, params, hash)` signature and removing the `hash === undefined ? undefined : { hash }` boilerplate at the `<Link>` call site. Internal-only helper (not a public export) — no public API surface or runtime behavior change; rendered hrefs are identical.

- Updated dependencies [[`996a6da`](https://github.com/greydragon888/real-router/commit/996a6daf9a7092ea1b9878d245d663cbac8f265e)]:
  - @real-router/sources@0.11.4

## 0.29.0

### Minor Changes

- [#1492](https://github.com/greydragon888/real-router/pull/1492) [`983ef1d`](https://github.com/greydragon888/real-router/commit/983ef1d8b41f18040da91f43d8767875a358f8e5) Thanks [@greydragon888](https://github.com/greydragon888)! - Dev-only validation for `<HttpStatusCode>` invalid codes ([#1441](https://github.com/greydragon888/real-router/issues/1441))

  `<HttpStatusCode code={N}>` now logs a `console.error` in development when `code` is not an integer in `[100, 999]` — Node's `res.end()` rejects such values with "Invalid status code", so the warning surfaces the bad value at the source rather than at the response boundary. The value is still written to the sink (informational, not a block); the check is stripped from production via the `process.env.NODE_ENV` guard. Ports the validation that previously existed only in preact.

## 0.28.24

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0
  - @real-router/sources@0.11.2

## 0.28.23

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0
  - @real-router/sources@0.11.1

## 0.28.22

### Patch Changes

- [#1430](https://github.com/greydragon888/real-router/pull/1430) [`598b369`](https://github.com/greydragon888/real-router/commit/598b36909c581dd9b8401a84202cf1832078ccca) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(react): `useIsActiveRoute("")` is inactive, matching `router.isActiveRoute("")` ([#1427](https://github.com/greydragon888/real-router/issues/1427))

  `useIsActiveRoute` kept an inline copy of the fast/slow active-source decision
  whose predicate lacked the `routeName !== ""` guard, so an empty `routeName` took
  the name-selector fast path — where `isActive("") === true` (the root is every
  route's ancestor) — and wrongly reported active, diverging from the canonical
  `router.isActiveRoute("") === false`. The hook now delegates to the shared
  `createActiveSource` builder from `@real-router/sources`, whose guard routes an
  empty name to the slow path. No change for any non-empty name — the fast/slow
  decision and behaviour are otherwise identical (the `[#1248](https://github.com/greydragon888/real-router/issues/1248)` fast path is now the
  one in the shared builder).

## 0.28.21

### Patch Changes

- Updated dependencies [[`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85)]:
  - @real-router/sources@0.11.0

## 0.28.20

### Patch Changes

- [#1393](https://github.com/greydragon888/real-router/pull/1393) [`ea2d08a`](https://github.com/greydragon888/real-router/commit/ea2d08ae04f527d2e544a09e599aa65d7221b835) Thanks [@greydragon888](https://github.com/greydragon888)! - Strictly-decoded `<Link hash>` fragment ([#1211](https://github.com/greydragon888/real-router/issues/1211)) — the copy-from-`location.hash` tolerance (E.1) is removed

  `encodeFragmentInline` (the `<Link hash>` fallback-path encoder, used when no URL plugin is present) previously probed for a percent escape and decode+re-encoded it (audit E.1 — "realistic consumers paste hashes out of `location.hash`"). It is now the trivial `encodeURI(s).replace(/#/g, "%23")` — byte-identical to the plugin layer's `encodeHashFragment`, obeying one strict contract. `<Link hash="a%20b">` renders `#a%2520b` (the literal fragment `a%20b`), not `#a%20b`. **Breaking** for consumers who passed raw, percent-encoded `location.hash` — pass a decoded fragment (`hash="a b"`). Part of the wave-2 hash cluster FORM axis.

## 0.28.19

### Patch Changes

- [#1384](https://github.com/greydragon888/real-router/pull/1384) [`7e7610e`](https://github.com/greydragon888/real-router/commit/7e7610e887e14073afae600fdd05088107876fa2) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix two `shared/dom-utils` regressions that ship into this adapter ([#1216](https://github.com/greydragon888/real-router/issues/1216), [#1217](https://github.com/greydragon888/real-router/issues/1217))

  - **[#1216](https://github.com/greydragon888/real-router/issues/1216) (scroll-spy):** the container-scoped `MutationObserver` cannot observe its own container's removal (a mutation of the container's parent), so a remounted scroll container was never re-observed. The router-subscribe callback now re-resolves + re-observes on navigation when the tracked container has detached — navigation is exactly when route-tied containers mount/die. Preserves the [#780](https://github.com/greydragon888/real-router/issues/780) container-scoped observation.
  - **[#1217](https://github.com/greydragon888/real-router/issues/1217) (route-announcer):** the shared `aria-live` element + ref-count were not scoped to a generation, so after a host wiped the element without calling `destroy()`, a stale instance's `destroy()` removed the newly-created element (deleted by selector) and drove the ref-count negative. A generation token now gates each instance's teardown, and removal uses the captured element ref.

## 0.28.18

### Patch Changes

- [#1377](https://github.com/greydragon888/real-router/pull/1377) [`08a5716`](https://github.com/greydragon888/real-router/commit/08a5716340c9036b5ab727070e94840311a69cff) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: duplicate `<RouteView.NotFound>` is now first-wins, symmetric with `<Self>` ([#1220](https://github.com/greydragon888/real-router/issues/1220))

  `recordFallback` assigned `slots.notFoundChildren` unconditionally, so multiple `<RouteView.NotFound>` under one `<RouteView>` were **last-wins** — a later duplicate silently overwrote the earlier one. This contradicted the documented Self-symmetric first-wins contract (the `<Self>` slot has always been guarded by `selfFound`). Added a matching `notFoundFound` first-wins guard, so the **first** `<RouteView.NotFound>` now contributes and subsequent duplicates are ignored. Locked by a converted functional regression and a new duplicate-NotFound property invariant (both mutation-validated).

## 0.28.17

### Patch Changes

- [#1374](https://github.com/greydragon888/real-router/pull/1374) [`c19bc95`](https://github.com/greydragon888/real-router/commit/c19bc95258b1f9456eedc90374ec09c1af2d802f) Thanks [@greydragon888](https://github.com/greydragon888)! - Un-ignore the reachable `useRouteEnter` `previousRoute` guard + lifecycle doc corrections ([#1218](https://github.com/greydragon888/real-router/issues/1218), [#1219](https://github.com/greydragon888/real-router/issues/1219))

  The mount-side `!previousRoute` guard in `useRouteEnter` was marked StrictMode-only and v8-ignored, but it is reachable and load-bearing on two real paths — a `RouterProvider` mounted after a navigation, and a React `<Activity>` catch-up reconcile — where the reconciled snapshot carries `previousRoute: undefined` and firing the handler would violate the non-nullable `RouteEnterContext.previousRoute` contract. The guard is now un-ignored and locked by regressions (PC1 functional, PC2 integration); behavior is unchanged.

  Doc corrections ([#1219](https://github.com/greydragon888/real-router/issues/1219)): the stale "`createRouteSource` does not reconcile on re-subscribe" caveat is rewritten (the [#765](https://github.com/greydragon888/real-router/issues/765) reconnect reconcile landed, so `RouterProvider` under `<Activity>` reconciles on re-show — the placement note is now a style recommendation, not a footgun). Added a `useRouteExit` reentrancy note (a synchronous `navigate()` from an exit handler throws `REENTRANT_NAVIGATION` — defer past the sync dispatch) and an INVARIANTS pointer to the reactive-lifecycle regressions.

## 0.28.16

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0
  - @real-router/sources@0.10.13

## 0.28.15

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0
  - @real-router/sources@0.10.12

## 0.28.14

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0
  - @real-router/sources@0.10.11

## 0.28.13

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0
  - @real-router/sources@0.10.10

## 0.28.12

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0
  - @real-router/sources@0.10.9

## 0.28.11

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/sources@0.10.8
  - @real-router/route-utils@0.2.7

## 0.28.10

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0
  - @real-router/sources@0.10.7

## 0.28.9

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0
  - @real-router/sources@0.10.6

## 0.28.8

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0
  - @real-router/sources@0.10.5

## 0.28.7

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0
  - @real-router/sources@0.10.4

## 0.28.6

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0
  - @real-router/sources@0.10.3

## 0.28.5

### Patch Changes

- [#1259](https://github.com/greydragon888/real-router/pull/1259) [`3af2214`](https://github.com/greydragon888/real-router/commit/3af221443129bac63d9f594bf514253f577dbd69) Thanks [@greydragon888](https://github.com/greydragon888)! - Decouple `RouteView` keepAlive tracking to memoize the render walk ([#1251](https://github.com/greydragon888/real-router/issues/1251))

  - `<RouteView>`'s `buildRenderList` no longer re-walks its `<Match>` children on every render. Previously `processMatch` mutated the keepAlive `hasBeenActivated` Set inline, coupling the pure winner/`rendered` computation to a side effect — so a parent (or ancestor) re-render with no route change re-walked every Match and re-diffed the identical output (preact, whose `buildRenderList` is a 3-arg pure function, already memoized here). The walk is now a pure function memoized on `[elements, routeName, nodeName]`, and the activation is committed to the Set in a post-render effect. This also makes keepAlive tracking safe under concurrent rendering: a render React discards no longer records a phantom activation that would later render an un-committed match as a hidden keepAlive subtree. Existing precedence and keepAlive behavior is unchanged (covered by the RouteView functional + pipeline property tests).

## 0.28.4

### Patch Changes

- [#1257](https://github.com/greydragon888/real-router/pull/1257) [`0bcc3e0`](https://github.com/greydragon888/real-router/commit/0bcc3e05e92df549d9bc03764866d670f9f1b274) Thanks [@greydragon888](https://github.com/greydragon888)! - Adopt the `createActiveNameSelector` fast path for `<Link>` active state ([#1248](https://github.com/greydragon888/real-router/issues/1248))

  - `useIsActiveRoute` resolves default-options active state (no custom params, non-strict, `ignoreQueryParams`, no `hash`) through the per-router shared `createActiveNameSelector` — one `router.subscribe` for any number of distinct-`routeName` links — instead of a per-instance `createActiveRouteSource` (a `BaseSource` + its own subscription each). Fewer subscriptions ⇒ lower mount cost (link-build ~9.9 → ~8.5 ms per 1000 links, directional n=5) with per-nav active-state notifications unchanged (the selector keeps its `areRoutesRelated` pre-filter + only-changed diff). Direct port of the svelte ([#1101](https://github.com/greydragon888/real-router/issues/1101)) / angular ([#1104](https://github.com/greydragon888/real-router/issues/1104)) fast paths; the full argument surface (custom params, strict, `ignoreQueryParams: false`, hash) still uses `createActiveRouteSource`.

## 0.28.3

### Patch Changes

- [#1125](https://github.com/greydragon888/real-router/pull/1125) [`526fe9e`](https://github.com/greydragon888/real-router/commit/526fe9edc87d7fcb818b0046590db60a55a48d37) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep dead dom-utils code out of the `/ink` chunk ([#800](https://github.com/greydragon888/real-router/issues/800))

  `InkRouterProvider` now composes a DOM-free `RouterProviderCore` (Router/Route/Navigator contexts + `useSyncExternalStore` wiring) instead of the full `RouterProvider`. The scroll-spy / view-transitions / route-announcer / scroll-restore factories are imported and called only by `RouterProvider`, so the chunk behind `dist/esm/ink.mjs` no longer carries their implementations — no `IntersectionObserver` wiring, `startViewTransition`, `aria-live` announcer, or scroll-capture code lands in the terminal bundle where none of it can run. Public API and runtime behavior are unchanged; the DOM `RouterProvider` keeps every feature prop (`announceNavigation` / `scrollRestoration` / `scrollSpy` / `viewTransitions`).

## 0.28.2

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0
  - @real-router/sources@0.10.2

## 0.28.1

### Patch Changes

- [#1114](https://github.com/greydragon888/real-router/pull/1114) [`98884f0`](https://github.com/greydragon888/real-router/commit/98884f0ab25fdca87e33ea1ac006bbb04949b704) Thanks [@greydragon888](https://github.com/greydragon888)! - Isolate a throwing `onSelect` in `InkLink` ([#799](https://github.com/greydragon888/real-router/issues/799))

  A throwing `onSelect` on `<InkLink>` no longer swallows the navigation nor escapes into ink's `useInput` stdin handler — an `uncaughtException` there would crash a real CLI, since Node has no browser-style event-listener isolation. The callback is now wrapped in try/catch: the error is logged via `console.error` and navigation still proceeds, mirroring `route-announcer`'s consumer-callback isolation.

## 0.28.0

### Minor Changes

- [#1086](https://github.com/greydragon888/real-router/pull/1086) [`f0d9c7a`](https://github.com/greydragon888/real-router/commit/f0d9c7a23a30a8a6e0f4f080b7901c735a4a9072) Thanks [@greydragon888](https://github.com/greydragon888)! - Expose announcer options on `RouterProvider`'s `announceNavigation` prop ([#1065](https://github.com/greydragon888/real-router/issues/1065))

  `announceNavigation` now accepts `boolean | RouteAnnouncerOptions`. Pass an
  object — `{ prefix?, getAnnouncementText? }` — to customize the screen-reader
  announcement text; the callback falls back to the default `h1 → title →
route-name` chain when it returns an empty string or throws. `true` keeps the
  previous default behavior, so the change is fully backward compatible.

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

## 0.27.12

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

## 0.27.11

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/sources@0.10.1
  - @real-router/route-utils@0.2.5

## 0.27.10

### Patch Changes

- [#1024](https://github.com/greydragon888/real-router/pull/1024) [`2caf59f`](https://github.com/greydragon888/real-router/commit/2caf59fa2e5d71a47349be96e1b93f6276d048c7) Thanks [@greydragon888](https://github.com/greydragon888)! - Stop splitting the active-route source cache key for a no-params `<Link>` / `<InkLink>` ([#776](https://github.com/greydragon888/real-router/issues/776))

  `<Link>` and `<InkLink>` no longer default `routeParams` to `EMPTY_PARAMS` (`{}`) before calling the active-route source. `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<Link routeName="x">` and a manual `useIsActiveRoute("x")` now resolve the SAME cached source — one router subscription, not two distinct entries (`"{}"` vs `""`). Navigation and href building still default to `EMPTY_PARAMS` locally where a concrete object is required; active-state, href and navigation behaviour are unchanged.

## 0.27.9

### Patch Changes

- [#1022](https://github.com/greydragon888/real-router/pull/1022) [`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(react): RouterErrorBoundary mounted after an error shows the fallback ([#778](https://github.com/greydragon888/real-router/issues/778))

  `RouterProvider` now eagerly creates the per-router error source at mount, so a navigation error that fires BEFORE a `RouterErrorBoundary` mounts (a lazily-loaded app shell, a failed boot navigation — the ordinary load order) is captured and surfaced once the boundary mounts. Previously the boundary created the error source lazily on mount — after the error had already fired with no subscriber — so the fallback never appeared. Pairs with the [#765](https://github.com/greydragon888/real-router/issues/765) reconnect-reconcile fix: the boundary's `createDismissableError` catches up to the already-captured error on first subscribe.

- Updated dependencies [[`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849)]:
  - @real-router/sources@0.10.0

## 0.27.8

### Patch Changes

- Updated dependencies [[`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7), [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7)]:
  - @real-router/sources@0.9.0

## 0.27.7

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/sources@0.8.10
  - @real-router/route-utils@0.2.4

## 0.27.6

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0
  - @real-router/sources@0.8.9

## 0.27.5

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0
  - @real-router/sources@0.8.8

## 0.27.4

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0
  - @real-router/sources@0.8.7

## 0.27.3

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0
  - @real-router/sources@0.8.6

## 0.27.2

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/sources@0.8.5
  - @real-router/route-utils@0.2.3

## 0.27.1

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0
  - @real-router/sources@0.8.4

## 0.27.0

### Minor Changes

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix scroll restoration not firing on browser back/forward under navigation-plugin ([#694](https://github.com/greydragon888/real-router/issues/694))

  Since [#657](https://github.com/greydragon888/real-router/issues/657) lifted `replace` into `TransitionMeta`, a history **traversal** (back/forward) under `navigation-plugin` now arrives with `transition.replace === true` — a traversal reuses an existing history entry, which is replace-shaped at the history level. `createScrollRestoration` evaluated its replace-skip guard _before_ the back/traverse restore branch, so every back/forward navigation was swallowed and the saved scroll position was never restored.

  Reordered the restore decision tree so `reload` and `back`/`traverse` restore branches run **before** the genuine in-place-replace skip (`router.navigate({ replace: true })`, `navigateToNotFound` still skip as before).

  Also hardened restore for a custom `scrollContainer` that mounts or lays out a few frames after the navigation settles (heavy routes): restore now re-applies the scroll across a bounded frame budget until the container exists and the position sticks, instead of a single best-effort `scrollTo` that could clamp to 0 against not-yet-laid-out content.

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `scrollSpy` prop to `RouterProvider` — router-coordinated `IntersectionObserver` URL hash spy ([#575](https://github.com/greydragon888/real-router/issues/575))

  New top-level `scrollSpy?: ScrollSpyOptions` prop wires `createScrollSpy(router, options)` from `shared/dom-utils/`. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<Link hash>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

  ```tsx
  <RouterProvider router={router} scrollSpy={{ selector: "[id]:is(h2,h3)" }}>
    {/* Your app */}
  </RouterProvider>
  ```

  Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — the same write API as `<Link hash>` ([#532](https://github.com/greydragon888/real-router/issues/532)) with `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting` guard around own emit). Wired through `useEffect` with primitive deps so inline `scrollSpy={{ selector: "[id]" }}` doesn't thrash on parent re-renders.

  Requires `browser-plugin` or `navigation-plugin` for `state.context.url` claim. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

  See [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy) and the [`examples/web/react/hash-examples/scroll-spy/`](https://github.com/greydragon888/real-router/tree/master/examples/web/react/hash-examples/scroll-spy) dogfood example (12 sections, TOC sidebar, plugin & spy-mode switchers, 10 e2e scenarios).

## 0.26.0

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

## 0.25.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components ([#604](https://github.com/greydragon888/real-router/issues/604))

  Two paired components for opt-in client/server rendering boundaries that
  formalize the `useState`/`useEffect` "isMounted" idiom every SSR app
  re-implements:
  - `<ClientOnly fallback={…}>{children}</ClientOnly>` — server emits
    `fallback` (or nothing), client matches it on first paint, then a single
    post-mount effect swaps in `children`. Use for browser-API consumers
    (window/document/intersection observers), ad slots, or third-party widgets
    that hydrate to the right shape without a hydration mismatch.
  - `<ServerOnly fallback={…}>{children}</ServerOnly>` — server emits
    `children`, client matches them on first paint, then swaps to `fallback`
    (or hides). Use for SEO-only meta strips, zero-JS sections inside an
    otherwise-hydrated page.

  Both components are exported from `@real-router/react`, `@real-router/react/legacy`,
  and re-exported as types under the `react-server` condition.

  ```tsx
  import { ClientOnly, ServerOnly } from "@real-router/react";

  <ClientOnly fallback={<Skeleton />}>
    <BrowserApiWidget />
  </ClientOnly>

  <ServerOnly>
    <SeoHelpStrip />
  </ServerOnly>
  ```

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<HttpStatusCode code={N}/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` ([#610](https://github.com/greydragon888/real-router/issues/610))

  Render-time HTTP status declaration for SSR. Mount inside a route component (typical use case: a glob `*` route's NotFound page) when the status is decided by the rendered tree rather than a loader. Server reads `sink.code` after `renderToString` / `renderToReadableStream` and applies it to the HTTP response.

  Exports from `@real-router/react/ssr` (and `@real-router/react/legacy/ssr`):
  - `<HttpStatusCode code={404}/>` — writes `code` to the nearest sink during render, returns `null`. Last write wins.
  - `<HttpStatusProvider sink={...}>` — provides the sink via context.
  - `createHttpStatusSink(): HttpStatusSink` — factory; sink is `{ code: number | undefined }`.
  - Type-only exports under the `react-server` condition.

  ```tsx
  // entry-server.tsx
  import { renderToString } from "react-dom/server";
  import {
    createHttpStatusSink,
    HttpStatusProvider,
  } from "@real-router/react/ssr";

  const sink = createHttpStatusSink();
  const html = renderToString(
    <HttpStatusProvider sink={sink}>
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    </HttpStatusProvider>,
  );
  response.status(sink.code ?? 200).send(html);
  ```

  No-op on the client when no provider is mounted — the same component tree hydrates without touching the DOM. Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; this component covers render-time decisions only.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `useDeferred()` hook + `<Await>` and `<Streamed>` components for consuming `defer()` payloads ([#610](https://github.com/greydragon888/real-router/issues/610))

  Three new exports paired with `defer()` in `@real-router/ssr-data-plugin`:
  - `useDeferred<T>(key)` — reads the promise published by the loader at
    `state.context.ssrDataDeferred[key]`. Stable promise reference across
    renders within one navigation; integrates with React 19's `use(promise)`
    for native Suspense streaming. Returns a never-resolving promise (forever
    fallback) when the key is missing — surfaces consumer/loader key drift
    as a visible loading state.
  - `<Await name="key">{(value) => …}</Await>` — ergonomic wrapper around
    `useDeferred(name)` + `use(promise)`, mirrors the SvelteKit `{#await}` /
    Solid `<Await/>` pair for cross-framework naming consistency. Main entry
    only — `use()` requires React 19.
  - `<Streamed fallback={…}>{children}</Streamed>` — alias for
    `<Suspense fallback>` matching the cross-adapter "Streamed" naming.
    Available in both main and `/legacy` entries (legacy only ships
    `<Streamed>` + `useDeferred`, not `<Await>`).

  `useDeferred` and `<Streamed>` ship in both the main entry and `/legacy`
  (React 18+) entries. `<Await>` ships in the main entry only. The
  `react-server` condition entry exposes the prop / option types only
  (no client runtime).

  ```tsx
  import { Streamed, Await, useDeferred } from "@real-router/react";

  // High-level — cross-adapter naming
  <Streamed fallback={<Spinner />}>
    <Await<Review[]> name="reviews">
      {(reviews) => <ReviewList items={reviews} />}
    </Await>
  </Streamed>

  // Low-level — React-native primitives
  <Suspense fallback={<Spinner />}>
    <Reviews />
  </Suspense>

  function Reviews() {
    const reviews = use(useDeferred<Review[]>("reviews"));
    return <ReviewList items={reviews} />;
  }
  ```

  Pairs with `injectDeferredScripts` from `@real-router/ssr-data-plugin/server`
  for the server-side wire format. Non-breaking addition — existing
  `<Suspense>` + `use(promise)` patterns continue to work unchanged.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `react-server` export condition for RSC bundler compatibility ([#574](https://github.com/greydragon888/real-router/issues/574))

  Adds a thin type-only re-export entry resolved under the `react-server` export condition. RSC bundlers (`@vitejs/plugin-rsc`, `react-server-dom-{webpack,turbopack,parcel}`) now resolve `@real-router/react` imports to a server-safe subset when bundling Server Component code, preventing accidental inclusion of client-only hooks/components/`RouterProvider` in server bundles.

  The exposed surface is intentionally type-only — all hooks, components, and `RouterProvider` remain client-exclusive. Future server-safe utilities (pure functions without React state) can be added without breaking the contract.

  Per-request RSC data loading is handled by [`@real-router/rsc-server-plugin`](https://www.npmjs.com/package/@real-router/rsc-server-plugin), not this entry. Mirrors the thin re-export pattern from [TanStack Router PR #7183](https://github.com/TanStack/router/pull/7183) and `react-router@7.x`.

  ```tsx
  // In a Server Component file (resolved under `react-server` condition):
  import type { Navigator, LinkProps } from "@real-router/react";
  // → resolves to server-safe types only, no runtime client code
  ```

  Additive change, no breaking. See [RSC Integration wiki guide](https://github.com/greydragon888/real-router/wiki/RSC-Integration).

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `/ssr` and `/legacy/ssr` subpath split for SSR-feature exports ([#609](https://github.com/greydragon888/real-router/issues/609))

  All SSR-aware components and hooks have moved out of the main entry into a
  dedicated `/ssr` subpath:

  | Was                                                | Now                                                    |
  | -------------------------------------------------- | ------------------------------------------------------ |
  | `import { ClientOnly } from "@real-router/react"`  | `import { ClientOnly } from "@real-router/react/ssr"`  |
  | `import { ServerOnly } from "@real-router/react"`  | `import { ServerOnly } from "@real-router/react/ssr"`  |
  | `import { Await } from "@real-router/react"`       | `import { Await } from "@real-router/react/ssr"`       |
  | `import { Streamed } from "@real-router/react"`    | `import { Streamed } from "@real-router/react/ssr"`    |
  | `import { useDeferred } from "@real-router/react"` | `import { useDeferred } from "@real-router/react/ssr"` |

  For React 18 (`/legacy`) consumers, the corresponding subset lives at
  `@real-router/react/legacy/ssr` (omits `<Await>` since it depends on React
  19's `use(promise)`).

  **Why split now**: the `<ClientOnly>`/`<ServerOnly>` pair ([#604](https://github.com/greydragon888/real-router/issues/604)) plus the
  `defer()` consumer trio (`<Await>`, `<Streamed>`, `useDeferred`) reaches the
  ≥3 SSR-feature-component threshold defined in `.claude/SSR_FEATURE_GAPS_RU.md`
  §8. Splitting in this PR avoids a future double migration when the same
  work lands across the remaining 5 adapters ([#611](https://github.com/greydragon888/real-router/issues/611), Stage 2).

  **Why this matters**:
  - **Type isolation** — server-only prop types (`AwaitProps`, `StreamedProps`,
    etc.) no longer leak into the client TypeScript context for app code that
    doesn't touch SSR.
  - **DX clarity** — `import {…} from '@real-router/react/ssr'` self-documents
    the SSR-pipeline intent.
  - **`react-server` condition** — the `/ssr` subpath has its own type-only
    RSC entry, so Server Components can import the prop types without pulling
    client-only runtime into their bundle.
  - **Future-proofing** — server-render utilities (`<HttpStatusCode>`, etc.)
    slot into `/ssr` without re-shaping the main entry.

  **Breaking change** (pre-1.0, allowed in `minor` per `.changeset/README.md`):
  re-import the five exports from `/ssr` (or `/legacy/ssr` for React 18).
  Bundle cost is ≈ 0 thanks to `"sideEffects": false` + tree-shaking — the
  split is about API surface design, not bytes.

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

  Discovered by a new property-based symmetry test in
  `tests/property/shallowEqual.properties.ts` after fast-check shrunk the
  counterexample to `[{"a":undefined},{"b":""}]` over 200 runs.

  User-visible effect: `<Link routeParams={{ a: undefined }} />` no longer
  compares equal to `<Link routeParams={{ b: undefined }} />` — re-render now
  matches the documented `shallowEqual` contract (key-order-insensitive,
  `Object.is` per key).

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0
  - @real-router/sources@0.8.2

## 0.24.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
  - @real-router/sources@0.8.1

## 0.24.0

### Minor Changes

- [#569](https://github.com/greydragon888/real-router/pull/569) [`5b1eae9`](https://github.com/greydragon888/real-router/commit/5b1eae9e115f5cdf45f4365f3d0bcf5625297140) Thanks [@greydragon888](https://github.com/greydragon888)! - Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options ([#534](https://github.com/greydragon888/real-router/issues/534))

  `createScrollRestoration` (`shared/dom-utils/`) gains three changes:
  - **Mode rename `manual` → `native`** for clarity. The previous name was misleading because it had the OPPOSITE meaning of DOM `history.scrollRestoration === "manual"`: utility's mode meant "utility does nothing, browser handles natively", while DOM `"manual"` means "browser does nothing, app handles". Renamed to `"native"` to match the actual semantic ("hand off to browser-native restore").
  - **`behavior?: ScrollBehavior`** — forwarded to `scrollTo({ behavior })` and `scrollIntoView({ behavior })`. Values: `"auto"` (default), `"instant"`, `"smooth"`. See [MDN ScrollToOptions.behavior](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions/behavior).
  - **`storageKey?: string`** — sessionStorage key for scroll-store, default `"real-router:scroll"`. Override for namespace-isolation between independent `RouterProvider` instances (micro-frontends, embedded widgets, testing setups).

  `RouterProvider` now forwards all three options. Default behavior unchanged.

## 0.23.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `hash` support to `<Link>` and `useIsActiveRoute` ([#532](https://github.com/greydragon888/real-router/issues/532))
  - `<Link>` accepts an optional `hash?: string` prop that builds a URL with
    the fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
    extension and, on click, calls the new `navigateWithHash` helper. The
    helper auto-bypasses SAME_STATES (`force: true, hashChange: true`) when
    the same route is navigated to with a different fragment, so anchor-style
    same-path links update both URL and `state.context.url.hashChanged`.
  - `useIsActiveRoute(name, params, strict?, ignoreQueryParams?, hash?)` gains
    an optional fifth `hash` argument. When provided, the hook is `true` iff
    the route matches AND `state.context.url.hash` equals the requested
    fragment exactly — distinct hashes get distinct cache entries in
    `@real-router/sources` (see its changeset).

### Patch Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - SSR-safe anchor lookup in `createScrollRestoration` ([#532](https://github.com/greydragon888/real-router/issues/532))

  `createScrollRestoration` now reads the anchor target from
  `state.context.url.hash` (decoded, populated by the URL plugins) rather than
  `globalThis.location.hash`, falling back to the DOM only when no URL plugin
  is installed. This avoids race conditions between React's commit and the
  browser's hash update.

- Updated dependencies [[`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534)]:
  - @real-router/sources@0.8.0

## 0.22.1

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/sources@0.7.3
  - @real-router/route-utils@0.2.2

## 0.22.0

### Minor Changes

- [#555](https://github.com/greydragon888/real-router/pull/555) [`6965977`](https://github.com/greydragon888/real-router/commit/69659772cd4f3c49d570ea1d7a2abec07da7dbed) Thanks [@greydragon888](https://github.com/greydragon888)! - Narrow `useRoute()` return type so `route` is non-nullable; throw a clear error when the router has no active state ([#535](https://github.com/greydragon888/real-router/issues/535))

  `useRoute()` previously returned `{ route: State | undefined }`, forcing every consumer to write `route?.x` or `if (!route) return null` — defensive code for a case that is unreachable once `await router.start()` has resolved. The hook now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before start (or after stop/dispose), and the return type narrows so consumers can read `route.params.id` directly. `useRouteNode(name)` is unchanged — `route === undefined` there is a legitimate "node inactive" business state.

## 0.21.0

### Minor Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteEnter` hook ([#548](https://github.com/greydragon888/real-router/issues/548))

  Symmetric counterpart to `useRouteExit` ([#544](https://github.com/greydragon888/real-router/issues/544)). Fires `handler` once when the component mounts as a result of a navigation, with the mount-time `{ route, previousRoute }` snapshot.

  ```tsx
  import { useRouteEnter } from "@real-router/react";

  useRouteEnter(({ route, previousRoute }) => {
    analytics.track("page_enter", {
      route: route.name,
      from: previousRoute.name,
    });
  });
  ```

  What the hook covers that ad-hoc `useEffect` + `useRoute()` doesn't:
  - **Skip-initial** — handler is skipped when there is no `previousRoute` (i.e. first-load mount). Most consumers want to fire side effects only on real navigations, not on hydration.
  - **StrictMode double-mount immunity** — in dev, React's StrictMode runs every effect twice to surface bugs. Without a guard, analytics fire twice, animations restart, focus jumps. The hook tracks the last-handled `route` reference and short-circuits the second pass.
  - **Latest-handler ref** — handler can change identity on every render without re-running the effect.
  - **Mount-time snapshot** — handler receives the values that were live at the moment of mount, not the latest ones.

  Common scenarios covered: direction-aware entry animation (read `route.context.browser?.direction`), source-aware focus management (`route.context.browser?.source === "navigate"`), analytics page-enter events, request cancellation tied to navigation.

  Race-safety: `useRoute()` is wired through `useSyncExternalStore` from `@real-router/sources`, so by the time the new component's effect runs, the snapshot is the post-commit one. The hook does not need a separate centralised buffer or new context — it consumes `useRoute()` directly.

  Replication to Preact / Vue / Solid / Svelte / Angular tracked in [#547](https://github.com/greydragon888/real-router/issues/547).

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteExit` hook ([#544](https://github.com/greydragon888/real-router/issues/544))

  New React-side primitive for animation and side-effect coordination during the leave window.

  **`useRouteExit(handler, options?)`** — wraps `router.subscribeLeave` with the universal guards: reentrant abort pre-check, same-route skip (`route.name === nextRoute.name`, opt-out via `skipSameRoute: false`), latest-handler ref so handler identity can change without resubscribing.

  ```tsx
  import { useRouteExit } from "@real-router/react";

  useRouteExit(async ({ signal }) => {
    await api.saveDraft(formState, { signal });
  });
  ```

  The hook is general-purpose — animation is one case. Other scenarios: auto-save form drafts, cancel inflight requests, capture scroll position, optimistic-UI rollback, library-coordinated exit (motion's `AnimatePresence onExitComplete`).

  Companion utility shipped alongside in `shared/dom-utils`:
  - **`createDirectionTracker(router)`** — popstate-driven `data-nav-direction` on `<html>` for direction-aware CSS / library state. Must be installed **before** `router.usePlugin(browserPluginFactory())` due to popstate listener ordering. Used in `examples/web/react/animation-examples/route-animations`.

  **Breaking (pre-1.0):** `createRouteAnimator` and the internal `awaitElementAnimations` helper are removed from `shared/dom-utils`. The single consumer (`route-animations` example) was rewritten as a presence-only React component (`<PageAnimator />`) built on top of `useRouteExit`, symmetric with `<HeroMorph />` and `<ListFlip />` already in that example. The 4-line CSS-class exit recipe (style flush + `Element.getAnimations()` + `Promise.allSettled`) is inlined where it runs — pedagogically clearer than a separate utility, no abstraction tax.

  Migration if you used `createRouteAnimator(router, { exitClass, selector })` directly: write a small React component that calls `useRouteExit` with the same recipe. See `examples/web/react/animation-examples/route-animations/src/animations/PageAnimator.tsx` for the canonical 30-line implementation.

  Replication to Preact / Vue / Solid / Svelte / Angular tracked in [#547](https://github.com/greydragon888/real-router/issues/547).

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `viewTransitions` prop on `<RouterProvider>` for View Transitions API integration ([#498](https://github.com/greydragon888/real-router/issues/498))

  Opt in with `<RouterProvider router={router} viewTransitions>` to animate route transitions via the browser's View Transitions API. The prop is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support).

  Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns (hero morph, per-area transitions, direction-aware animations).

  The utility lives in `shared/dom-utils/` as `createViewTransitions(router)` — same architectural pattern as `createScrollRestoration` ([#497](https://github.com/greydragon888/real-router/issues/497)) and `createRouteAnnouncer`. It uses only the public `subscribeLeave` + `subscribe` router API.

### Patch Changes

- Updated dependencies [[`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2)]:
  - @real-router/core@0.50.2

## 0.20.0

### Minor Changes

- [#539](https://github.com/greydragon888/real-router/pull/539) [`2f39d54`](https://github.com/greydragon888/real-router/commit/2f39d54f82dfb62da5309d8520d4c7d8281c52d6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<RouteView.Self>` slot for the parent-as-list pattern ([#538](https://github.com/greydragon888/real-router/issues/538))

  `RouteView.Self` renders its children when the active route name equals the
  parent `RouteView`'s `nodeName` and no descendant `Match` is active. This
  closes the API gap that previously forced imperative
  `route.name === ...` ternaries when a parent route IS the listing of its
  children.

  ```tsx
  <RouteView nodeName="users">
    <RouteView.Self>
      <UsersList />
    </RouteView.Self>
    <RouteView.Match segment="profile">
      <UserProfile />
    </RouteView.Match>
    <RouteView.Match segment="settings">
      <UserSettings />
    </RouteView.Match>
  </RouteView>
  ```

  Priority order: `Match` (descendant of `nodeName`) → `Self` (active equals
  `nodeName`) → `NotFound` (`UNKNOWN_ROUTE`). At most one slot renders. Multiple
  `Self` instances follow the first-wins rule (mirrors `NotFound`). `Self`
  accepts an optional `fallback` prop that wraps children in `<Suspense>`.

## 0.19.0

### Minor Changes

- [#502](https://github.com/greydragon888/real-router/pull/502) [`dcfd9cc`](https://github.com/greydragon888/real-router/commit/dcfd9cc2578c22449d2653d25d0b09a0fdb74681) Thanks [@greydragon888](https://github.com/greydragon888)! - Add opt-in scroll restoration via `RouterProvider.scrollRestoration` ([#497](https://github.com/greydragon888/real-router/issues/497))

  New `scrollRestoration?: ScrollRestorationOptions` prop on `RouterProvider`. Restores scroll position on back navigation, scrolls to top or hash on push. Supports `manual` / `top` / `restore` modes and a custom scroll container.

  ```tsx
  <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
    {/* ... */}
  </RouterProvider>
  ```

  Backed by the shared `createScrollRestoration` utility in `shared/dom-utils` — same pattern as `createRouteAnnouncer`. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.

## 0.18.0

### Minor Changes

- [#494](https://github.com/greydragon888/real-router/pull/494) [`b0cdc41`](https://github.com/greydragon888/real-router/commit/b0cdc410ee97b3b8b7012216f863756be832d729) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/react/ink` subpath export for Ink (terminal UI) ([#493](https://github.com/greydragon888/real-router/issues/493))

  New third entry alongside `main` and `/legacy`, targeting React 19.2+ & Ink 7+. Ships all shared hooks plus two terminal-specific pieces:
  - **`InkRouterProvider`** — wrapper around the shared `RouterProvider` that omits `announceNavigation` (no DOM, no aria-live).
  - **`InkLink`** — focusable text link built on Ink's `useFocus` + `useInput`. Joins the focus ring (Tab to move, Enter to navigate). Props mirror `Link`: `routeName`, `routeParams`, `routeOptions`, `activeStrict`, `ignoreQueryParams`. DOM-only props (`className`, `target`, `onClick`) are replaced with terminal equivalents (`activeColor`, `focusColor`, `inverse`/`activeInverse`/`focusInverse`, `onSelect`).

  ```tsx
  import {
    InkLink,
    InkRouterProvider,
    useRouteNode,
  } from "@real-router/react/ink";

  <InkRouterProvider router={router}>
    <InkLink routeName="home" focusColor="cyan" activeColor="green" autoFocus>
      Home
    </InkLink>
  </InkRouterProvider>;
  ```

  `ink` is added as an **optional** peer dependency (`peerDependenciesMeta.ink.optional = true`) — existing DOM consumers don't need to install it. The main and `/legacy` entries are unchanged.

## 0.17.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.17.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.17.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. The generic is erased at compile time — no runtime change. `RouteContext<P>` is likewise generic, defaulting to `Params`.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const { route } = useRoute<SearchParams>();

  route?.params.q; // typed as string — no cast needed
  route?.params.sort; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.16.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated internal hooks to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — multiple consumers now share one router subscription per router instance instead of creating fresh WeakMap caches locally. Removed duplicated `useStableValue` helper (params stabilization is now canonical inside `createActiveRouteSource`).

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: remove redundant `routeUtilsCache` WeakMap in `useRouteUtils` ([#467](https://github.com/greydragon888/real-router/issues/467))

  `getRouteUtils` from `@real-router/route-utils` is already WeakMap-cached
  per `RouteTreeNode`, so the extra per-router cache in the React adapter
  was redundant — the same `RouteUtils` instance is returned across renders
  by the internal cache. Aligns React with the 5 other adapters (Preact,
  Solid, Vue, Svelte, Angular) that rely on the shared cache directly.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.16.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace JSON-based deep equality with `shallowEqual` in Link memo comparator ([#462](https://github.com/greydragon888/real-router/issues/462))

  `Link`'s `areLinkPropsEqual` previously called `stableSerialize` (JSON.stringify with sorted keys) on `routeParams` and `routeOptions` twice per comparator invocation — ~850 ns per Link per parent re-render. Replaced with `shallowEqual` (Object.is per key, order-insensitive) — ~40 ns, a ~20× speed-up on the comparator hot path.
  - `shallowEqual` exported from `@real-router/react` dom-utils barrel (via `shared/dom-utils/link-utils.ts`)
  - Correctness improvements alongside the speed-up:
    - `{id: 1n}` vs `{id: 1n}` now correctly treated as equal (`Object.is` handles BigInt)
    - `{a: undefined}` vs `{}` now correctly treated as NOT equal (previous JSON-based path treated them as equal, masking structural differences)
    - Circular references and Symbol keys no longer trigger fallback paths
  - Trade-off: nested objects/arrays in `routeParams` with equal content but different references now trigger a re-render. Stabilize via `useMemo` if needed — standard React pattern. In practice `routeParams` is almost always a flat `Record<string, primitive>`.

  No public API change; gotcha documentation in `CLAUDE.md` updated.

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/react ([#462](https://github.com/greydragon888/real-router/issues/462))
  - **Hot path:** cache `createTransitionSource` per router via `WeakMap` — `useRouterTransition` no longer recreates the source on every render/router-ref change
  - **Hot path:** cache `RouteUtils` per router via `WeakMap` in `useRouteUtils` — drops repeated `getPluginApi().getTree()` lookups on re-render
  - **Hot path:** `RouterProvider` / `useRouteNode` now keep the raw `useSyncExternalStore` snapshot as the memo dependency instead of destructuring `{ route, previousRoute }`. `stabilizeState` guarantees the snapshot identity is preserved across idempotent navigations — consumers no longer re-render when the route did not change
  - **Hot path:** `useRouteNode` drops the redundant `useMemo` wrapper around `getNavigator(router)` — `getNavigator` is already WeakMap-cached in core
  - **`<RouteView>`:** memoize the flattened `Match`/`NotFound` element list on `children` identity. Steady-state navigations skip the `Children.toArray` + `collectElements` traversal; only re-traverse when the parent re-renders with a new `children` node. `ref` is lazy-initialized to avoid per-render `new Set()` allocation
  - **`<RouteView>`:** `isSegmentMatch` now early-returns `false` for empty-string `fullSegmentName` — prevents a literal route named `""` from matching against `activeStrict=false` prefix logic
  - **`useStableValue`:** rewritten as a pure `useRef` pattern with order-insensitive recursive JSON serialization via `stableSerialize`. Gracefully falls back to identity (`Object.is`) comparison when serialization throws (BigInt, circular refs, Symbol, function). Previously threw on BigInt and treated key-order permutations as different values
  - **Stress coverage:** new suites for dynamic routes, error boundary teardown, Suspense + transition, link-mass-rendering, mount/unmount lifecycle, transition-hook stress
  - **Performance tests:** new coverage for `useIsActiveRoute`, `useNavigator`, `useRouteUtils`, `useRouter` to lock in the WeakMap/cache invariants
  - **Property tests:** shared `linkUtils.properties.ts` now exercises the real `dom-utils` exports (`shouldNavigate`, `buildActiveClassName`, etc.) instead of inline replicas
  - **Docs:** README / ARCHITECTURE / CLAUDE brought back in sync with source — gotcha table updated to reflect the new stable-snapshot behavior

  No public API change.

## 0.15.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

## 0.15.0

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

## 0.14.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

## 0.14.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

## 0.14.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

## 0.14.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

## 0.14.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/react` failed with `ETARGET: No matching version found for dom-utils`.

## 0.14.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

## 0.14.5

### Patch Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add eslint-disable comments for intentional ref patterns ([#391](https://github.com/greydragon888/real-router/issues/391))

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

## 0.14.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

## 0.14.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

## 0.14.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

## 0.14.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

## 0.14.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New component that shows a fallback **alongside** children when a navigation error occurs (guard rejection, route not found). Auto-resets on successful navigation. Supports manual dismiss via `resetError()` and side-effect logging via `onError` callback. Available from both `@real-router/react` and `@real-router/react/legacy`.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

## 0.13.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

## 0.13.1

### Patch Changes

- Updated dependencies [[`d1ebff8`](https://github.com/greydragon888/real-router/commit/d1ebff8065cc85356a1701ba744c3b0a2d6a2669)]:
  - @real-router/core@0.39.0
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6
  - dom-utils@0.2.1

## 0.13.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```tsx
  <RouterProvider router={router} announceNavigation>
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `RouteView.Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, children are automatically wrapped in `<Suspense>`. Works with both `keepAlive` (Activity) and non-keepAlive modes.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName` moved from local `utils.ts` into shared private `dom-utils` package.

## 0.12.4

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0
  - @real-router/sources@0.2.5

## 0.12.3

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, hooks table with re-render behavior, `useNavigator` added, React 18 migration section. ARCHITECTURE: added `useRouterTransition` to codemap and subscription patterns, added performance test coverage table, removed stale Pending Changes section.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0
  - @real-router/route-utils@0.1.5
  - @real-router/sources@0.2.4

## 0.12.2

### Patch Changes

- [#305](https://github.com/greydragon888/real-router/pull/305) [`ab5d8f5`](https://github.com/greydragon888/real-router/commit/ab5d8f5b27c7901632645c53367b5e42e5e765cf) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `use()` with `useContext()` in hooks for React 18 compatibility ([#288](https://github.com/greydragon888/real-router/issues/288))

  `useRouter`, `useRoute`, and `useNavigator` used React 19's `use()` API, breaking the `@real-router/react/legacy` entry point on React 18. Replaced with `useContext()` which is available in both React 18 and 19.

## 0.12.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0
  - @real-router/sources@0.2.3

## 0.12.0

### Minor Changes

- [#299](https://github.com/greydragon888/real-router/pull/299) [`89351ba`](https://github.com/greydragon888/real-router/commit/89351ba3633087f488d30ea478c38c6de8f6b36e) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove raw Context exports from public API ([#283](https://github.com/greydragon888/real-router/issues/283))

  **Breaking Change:** `RouterContext`, `RouteContext`, and `NavigatorContext` are no longer exported from `@real-router/react` or `@real-router/react/legacy`. Use the corresponding hooks instead.

  **Migration:**

  ```diff
  - import { RouterContext } from "@real-router/react";
  - const router = useContext(RouterContext);
  + import { useRouter } from "@real-router/react";
  + const router = useRouter();
  ```

  ```diff
  - import { RouteContext } from "@real-router/react";
  - const routeState = useContext(RouteContext);
  + import { useRoute } from "@real-router/react";
  + const { route, previousRoute } = useRoute();
  ```

  ```diff
  - import { NavigatorContext } from "@real-router/react";
  - const navigator = useContext(NavigatorContext);
  + import { useNavigator } from "@real-router/react";
  + const navigator = useNavigator();
  ```

## 0.11.0

### Minor Changes

- [#281](https://github.com/greydragon888/real-router/pull/281) [`84d5831`](https://github.com/greydragon888/real-router/commit/84d5831384fccacf0f91e02d17a4f79abcaa7975) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `useIsActiveRoute` from public API ([#280](https://github.com/greydragon888/real-router/issues/280))

  **Breaking Change:** `useIsActiveRoute` is no longer exported from `@real-router/react` or `@real-router/react/legacy`. The hook remains as an internal utility used by `<Link>`.

  **Migration:**

  ```diff
  - import { useIsActiveRoute } from "@real-router/react";
  - const isActive = useIsActiveRoute("users.profile", { id });

  + import { useRouteNode } from "@real-router/react";
  + const { route } = useRouteNode("users");
  + const isActive = route?.name === "users.profile";
  ```

  Or use `<Link>` which handles active state automatically via render props.

## 0.10.0

### Minor Changes

- [#274](https://github.com/greydragon888/real-router/pull/274) [`d254b69`](https://github.com/greydragon888/real-router/commit/d254b690624e6000b9f4bd6b139309943e405ca3) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `keepAlive` prop to `<RouteView.Match>` ([#261](https://github.com/greydragon888/real-router/issues/261))

  New `keepAlive` prop on `<RouteView.Match>` uses React 19.2 `<Activity>` API to hide deactivated matches instead of unmounting them, preserving DOM and React state:

  ```tsx
  <RouteView nodeName="">
    <RouteView.Match segment="users" keepAlive>
      <UsersPage />
    </RouteView.Match>
  </RouteView>
  ```

- [#274](https://github.com/greydragon888/real-router/pull/274) [`d254b69`](https://github.com/greydragon888/real-router/commit/d254b690624e6000b9f4bd6b139309943e405ca3) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `<RouteView>` to React 19.2+ only entry point ([#261](https://github.com/greydragon888/real-router/issues/261))

  **BREAKING CHANGE:** `<RouteView>` is no longer available via `@real-router/react/legacy`.

  **Migration:** Use `useRouteNode` + conditional rendering in React 18:

  ```tsx
  const { route } = useRouteNode("");
  if (startsWithSegment(route.name, "users")) return <UsersPage />;
  ```

  Or upgrade to React 19.2+ and import from `@real-router/react`.

## 0.9.0

### Minor Changes

- [#272](https://github.com/greydragon888/real-router/pull/272) [`a54d5f9`](https://github.com/greydragon888/real-router/commit/a54d5f9907dea7025af41eff21d1dde6d42ecf29) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<RouteView>` declarative routing component ([#260](https://github.com/greydragon888/real-router/issues/260))

  Declarative compound component for view-level routing. Replaces imperative if/switch patterns with JSX:

  ```tsx
  <RouteView nodeName="">
    <RouteView.Match segment="users">
      <UsersPage />
    </RouteView.Match>
    <RouteView.Match segment="settings">
      <SettingsPage />
    </RouteView.Match>
    <RouteView.NotFound>
      <NotFoundPage />
    </RouteView.NotFound>
  </RouteView>
  ```

## 0.8.0

### Minor Changes

- [#268](https://github.com/greydragon888/real-router/pull/268) [`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouterTransition` hook ([#259](https://github.com/greydragon888/real-router/issues/259))

  New hook for tracking router transition state. Returns `RouterTransitionSnapshot`
  with `isTransitioning`, `toRoute`, and `fromRoute`. Useful for progress bars,
  loading overlays, and disabling navigation during async guards.

  Available in both entry points (`@real-router/react` and `@real-router/react/legacy`).

### Patch Changes

- Updated dependencies [[`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358)]:
  - @real-router/sources@0.2.0

## 0.7.0

### Minor Changes

- [#266](https://github.com/greydragon888/real-router/pull/266) [`9c759cb`](https://github.com/greydragon888/real-router/commit/9c759cbafb1334e10d4987bf48b0fb3165dafb73) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Consolidate Link components — remove `BaseLink` and `ConnectedLink` ([#258](https://github.com/greydragon888/real-router/issues/258))
  - `Link` now subscribes to active state via `useIsActiveRoute` — re-renders only when its own active status changes
  - `BaseLink` removed — `Link` takes router from context automatically
  - `ConnectedLink` removed — `Link` provides the same granular reactivity with less overhead
  - `BaseLinkProps` type replaced by `LinkProps<P>`
  - Removed: `data-route` and `data-active` HTML attributes
  - Fix: `routeOptions` (reload, replace) now correctly passed to navigation (previously silently dropped by `Link` and `ConnectedLink`)

## 0.6.0

### Minor Changes

- [#263](https://github.com/greydragon888/real-router/pull/263) [`7cdb227`](https://github.com/greydragon888/real-router/commit/7cdb2271f765a1839efc3e1fe6f1a20301ded408) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `./legacy` subpath export for React 18+ compatibility ([#257](https://github.com/greydragon888/real-router/issues/257))

  **BREAKING:** Main entry point (`@real-router/react`) now targets React 19.2+. React 18 users must switch to the legacy entry.

  **Migration:**

  ```diff
  - import { RouterProvider, useRouteNode, Link } from '@real-router/react';
  + import { RouterProvider, useRouteNode, Link } from '@real-router/react/legacy';
  ```

  Both entry points share the same code and export the same API. The `/legacy` entry excludes future React 19.2-only components (e.g., `ActivityRouteNode`).

## 0.5.5

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0
  - @real-router/sources@0.1.4
  - @real-router/route-utils@0.1.4

## 0.5.4

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0
  - @real-router/sources@0.1.3
  - @real-router/route-utils@0.1.3

## 0.5.3

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0
  - @real-router/sources@0.1.2
  - @real-router/route-utils@0.1.2

## 0.5.2

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0
  - @real-router/sources@0.1.1
  - @real-router/route-utils@0.1.1

## 0.5.1

### Patch Changes

- [#218](https://github.com/greydragon888/real-router/pull/218) [`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor React hooks to use `@real-router/sources` (#217)

  Internal refactoring: `useRouteNode`, `useIsActiveRoute`, and `RouterProvider` now delegate
  subscription logic to `@real-router/sources`. No public API changes.

- Updated dependencies [[`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8)]:
  - @real-router/sources@0.1.0

## 0.5.0

### Minor Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteUtils()` hook (#214)

  New hook providing direct access to `RouteUtils` instance without manual initialization:

  ```typescript
  import { useRouteUtils } from "@real-router/react";

  function Breadcrumbs() {
    const utils = useRouteUtils();
    const chain = utils.getChain(route.name);
    // ...
  }
  ```

  Internally calls `getRouteUtils(getPluginApi(router).getTree())` — returns a cached, pre-computed instance.

### Patch Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate `areRoutesRelated` import from `@real-router/helpers` to `@real-router/route-utils` (#214)

  Internal dependency change — no API changes for consumers.

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0
  - @real-router/route-utils@0.1.0

## 0.4.12

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0
  - @real-router/helpers@0.1.34

## 0.4.11

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0
  - @real-router/helpers@0.1.33

## 0.4.10

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0
  - @real-router/helpers@0.1.32

## 0.4.9

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0
  - @real-router/helpers@0.1.31

## 0.4.8

### Patch Changes

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0
  - @real-router/helpers@0.1.30

## 0.4.7

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0
  - @real-router/helpers@0.1.28

## 0.4.6

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0
  - @real-router/helpers@0.1.27

## 0.4.5

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0
  - @real-router/helpers@0.1.26

## 0.4.4

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/browser-plugin@0.4.0
  - @real-router/core@0.22.0
  - @real-router/helpers@0.1.25

## 0.4.3

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0
  - @real-router/browser-plugin@0.3.3
  - @real-router/helpers@0.1.24

## 0.4.2

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0
  - @real-router/browser-plugin@0.3.2
  - @real-router/helpers@0.1.23

## 0.4.1

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0
  - @real-router/browser-plugin@0.3.1
  - @real-router/helpers@0.1.22

## 0.4.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(react)!: remove callback props from BaseLink (#45)

  **Breaking Change:** `successCallback` and `errorCallback` props removed from `BaseLink`/`Link`/`ConnectedLink`.

  ```typescript
  // Before
  <Link routeName="users" successCallback={(state) => ...} errorCallback={(err) => ...} />

  // After
  <Link routeName="users" />
  ```

  Use `router.addEventListener(events.TRANSITION_SUCCESS, ...)` for navigation tracking.

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5), [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/browser-plugin@0.2.0
  - @real-router/core@0.17.0
  - @real-router/helpers@0.1.20

## 0.3.1

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0
  - @real-router/browser-plugin@0.1.19
  - @real-router/helpers@0.1.19

## 0.3.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Update to use standalone `getNavigator` function (#83)

  Update to use standalone `getNavigator` function. Fix `useRouteNode` navigator memoization bug.

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0
  - @real-router/browser-plugin@0.1.18
  - @real-router/helpers@0.1.18

## 0.2.8

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0
  - @real-router/browser-plugin@0.1.17
  - @real-router/helpers@0.1.17

## 0.2.7

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0
  - @real-router/browser-plugin@0.1.16
  - @real-router/helpers@0.1.16

## 0.2.6

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0
  - @real-router/browser-plugin@0.1.15
  - @real-router/helpers@0.1.15

## 0.2.5

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0
  - @real-router/browser-plugin@0.1.14
  - @real-router/helpers@0.1.14

## 0.2.4

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0
  - @real-router/browser-plugin@0.1.13
  - @real-router/helpers@0.1.13

## 0.2.3

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0
  - @real-router/browser-plugin@0.1.12
  - @real-router/helpers@0.1.12

## 0.2.2

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0
  - @real-router/browser-plugin@0.1.11
  - @real-router/helpers@0.1.11

## 0.2.1

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0
  - @real-router/browser-plugin@0.1.10
  - @real-router/helpers@0.1.10

## 0.2.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useNavigator()` hook and update React bindings (#37)

  **New:**
  - `useNavigator()` hook for direct Navigator access
  - `NavigatorContext` for providing Navigator to components

  **BREAKING CHANGE:**
  - `useRoute()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`
  - `useRouteNode()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`

  **Migration:**

  ```tsx
  // Before
  const { router, route } = useRoute();
  router.navigate("home");

  // After
  const { navigator, route } = useRoute();
  navigator.navigate("home");

  // For full Router access:
  const router = useRouter();
  ```

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0
  - @real-router/browser-plugin@0.1.9
  - @real-router/helpers@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0
  - @real-router/browser-plugin@0.1.8
  - @real-router/helpers@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [[`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777), [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/browser-plugin@0.1.7
  - @real-router/core@0.4.0
  - @real-router/helpers@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0
  - @real-router/browser-plugin@0.1.6
  - @real-router/helpers@0.1.6

## 0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4
  - @real-router/browser-plugin@0.1.5
  - @real-router/helpers@0.1.5

## 0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3
  - @real-router/browser-plugin@0.1.4
  - @real-router/helpers@0.1.4

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
  - @real-router/browser-plugin@0.1.3
  - @real-router/helpers@0.1.3

## 0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1
  - @real-router/browser-plugin@0.1.2
  - @real-router/helpers@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0
  - @real-router/browser-plugin@0.1.1
  - @real-router/helpers@0.1.1

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0
