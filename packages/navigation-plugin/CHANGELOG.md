# @real-router/navigation-plugin

## 0.7.29

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.7.28

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.7.27

### Patch Changes

- [#1393](https://github.com/greydragon888/real-router/pull/1393) [`ea2d08a`](https://github.com/greydragon888/real-router/commit/ea2d08ae04f527d2e544a09e599aa65d7221b835) Thanks [@greydragon888](https://github.com/greydragon888)! - Strictly-decoded `hash` contract ([#1211](https://github.com/greydragon888/real-router/issues/1211)) — `normalizeHashInput` no longer decodes

  The `hash` option (`navigate({ hash })`, `buildUrl({ hash })`, `replaceHistoryState({ hash })`) is a DECODED fragment and is now encoded verbatim. `normalizeHashInput` previously stripped the leading `#` **and decoded** — a second decode that corrupted literal-percent fragments (`"a%20b"` → `"a b"`, redirect URLs / serialized tokens broken) and split the plugin↔adapter policy. It now strips `#` only. `{ hash: "a%20b" }` is the literal fragment `a%20b` → `#a%2520b` (was `#a%20b`). **Breaking** for callers who passed raw, percent-encoded `location.hash` — pass a decoded fragment. Part of the wave-2 hash cluster FORM axis; the framework adapters' `<Link>` encoder is aligned in their patch.

## 0.7.26

### Patch Changes

- [#1382](https://github.com/greydragon888/real-router/pull/1382) [`3cfa3e8`](https://github.com/greydragon888/real-router/commit/3cfa3e8514799f4f70c6323d7a4d5157baf0ed22) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: factory-pool `stop()`/`dispose()` of an earlier router no longer disconnects the live router's navigate listener ([#1213](https://github.com/greydragon888/real-router/issues/1213))

  When one plugin factory is shared across multiple routers (a pool), the last router to `start()` owns the shared navigate-event listener slot (last-wins, [#758](https://github.com/greydragon888/real-router/issues/758)). But `createNavigateLifecycle`'s `onStop`/`teardown` cleared that slot **unconditionally**, so stopping or disposing an _earlier_ router removed the _active_ router's listener — the live router went deaf to browser navigate events. The lifecycle now captures its own remover at `onStart` and clears the shared slot only while it still owns it. (Confirmed as the third env-plugin instance of the same shared-slot ownership pattern, alongside browser-plugin and hash-plugin.)

## 0.7.25

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.7.24

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.7.23

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.7.22

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.7.21

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.7.20

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3), [`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/types@0.39.0

## 0.7.19

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.7.18

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.7.17

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.7.16

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.7.15

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.7.14

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.7.13

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/types@0.38.0

## 0.7.12

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/types@0.37.0

## 0.7.11

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.7.10

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.7.9

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.7.8

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.7.7

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.7.6

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.7.5

### Patch Changes

- [#695](https://github.com/greydragon888/real-router/pull/695) [`51b993e`](https://github.com/greydragon888/real-router/commit/51b993e7877e2b12f4e6ca0b8078f7ab4629501f) Thanks [@greydragon888](https://github.com/greydragon888)! - Suppress `scroll: "after-transition"` in `event.intercept()` to avoid fighting user scroll on plugin-originated re-emits ([#575](https://github.com/greydragon888/real-router/issues/575))

  `NOOP_INTERCEPT` now passes `scroll: "manual"` alongside the no-op handler. The Navigation API spec defaults `event.intercept({ handler })` to `scroll: "after-transition"`, which auto-scrolls the new URL fragment into view after every navigation. For router-driven re-emits (scroll-spy hash-only nav, scroll-restoration URL sync) the router has already committed the transition and the app owns scroll position — auto-scroll fights against the user's own scroll motion.

  Concrete bug closed: scroll-spy emit during a slow user scroll → viewport jump on every emit. Aligns with `browser-plugin` (History API has no auto-scroll on programmatic URL changes). Apps that want hash-anchor auto-scroll opt in via `createScrollRestoration({ anchorScrolling: true })` — the only `scroll` option of `event.intercept()` is `"manual"` vs `"after-transition"`; richer behaviour belongs in the scroll-restoration utility, not the navigate handler.

  No public API change. Both router-driven and user-driven navigations under `navigation-plugin` now skip the Navigation API's built-in scroll-to-fragment.

## 0.7.4

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.7.3

### Patch Changes

- [#646](https://github.com/greydragon888/real-router/pull/646) [`4d5ef9a`](https://github.com/greydragon888/real-router/commit/4d5ef9a6deaba291a0e791cd0dc2fcca047961dd) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix render-loop in Tauri release build on macOS 26.2 (Safari 26.2 WKWebView) ([#580](https://github.com/greydragon888/real-router/issues/580))

  Root cause was a Safari WKWebView quirk under custom protocols (`tauri://`, `app://`): `navigation.navigate(url, { history: "replace" })` against an effectively-same URL is treated as a **cross-document navigation** that discards the JS context. The plugin's `onTransitionSuccess` issues exactly this call on the initial transition to mark the current history entry with router state — the bootstrap script then re-runs, the plugin re-issues the same call, and the cycle becomes a render-loop the user perceives as flicker (the JS context is born and dies every ~50ms).

  Captured trace from a Tauri release run on macOS 26.2:

  ```
  13ms [#1](https://github.com/greydragon888/real-router/issues/1) init {reinitCount:1, href:"tauri://localhost",  activationType:"push"}
  16ms [#2](https://github.com/greydragon888/real-router/issues/2) router:transitionStart  {to:"/"}
  16ms [#3](https://github.com/greydragon888/real-router/issues/3) router:transitionSuccess {to:"/"}
  16ms [#4](https://github.com/greydragon888/real-router/issues/4) call:nav.navigate {url:"/", history:"replace", info:"…:syncing"}
  70ms [#5](https://github.com/greydragon888/real-router/issues/5) init {reinitCount:2, href:"tauri://localhost/", activationType:"replace"}
  …  // same pattern repeats
  ```

  Between `[#4](https://github.com/greydragon888/real-router/issues/4)` and `[#5](https://github.com/greydragon888/real-router/issues/5)` there is no `event:navigate` — WKWebView did a cross-document reload directly instead of dispatching the event same-document. The previous `SyncingFlag` mechanism (and the `event.info === PLUGIN_SYNC_INFO` short-circuit added in the same PR) cannot help because the handler never runs — the JS context is gone.

  **Fix**: detect "same-URL transition" in `onTransitionSuccess` and write router state via `navigation.updateCurrentEntry({state})` instead of `navigation.navigate(url, {history:"replace"})`. Both leave a single history entry carrying the new state, but `updateCurrentEntry` does not fire a navigate event and (critically for [#580](https://github.com/greydragon888/real-router/issues/580)) does not trigger WKWebView's cross-document fallback.

  The comparison (`isSameHref` in `src/href-utils.ts`) is component-wise — protocol, host, pathname (with empty pathname normalised to `"/"`), search, hash — rather than raw `.href` string equality. This matters for non-special schemes (`tauri://`, `app://`) where the URL parser preserves `pathname === ""` for authority-only URLs: `new URL("tauri://localhost").href === "tauri://localhost"` while `new URL("/", "tauri://localhost").href === "tauri://localhost/"`. A raw `.href` check would have called `nav.navigate` on the first iteration after a cold start, surviving exactly one cross-document reload before the URL stabilised in the trailing-slash form. Component-wise comparison closes that first-iteration hole.

  **Companion change**: replaced the synchronous `SyncingFlag` mechanism (timing-dependent) with an identity-based `event.info === PLUGIN_SYNC_INFO` sentinel. This was the originally hypothesised fix; in practice WKWebView never delivered the event to the handler (cross-document reload, see above), but the sentinel approach is still strictly better than the flag for any future async-delivery edge case on Chromium and removes the implicit dependency on synchronous event dispatch.

  **Internal API removed** (never exported from the package barrel):
  - `SyncingFlag` interface
  - `wrapNavigationBrowserWithSyncing` helper
  - `isSyncingFromRouter` field on `createNavigateHandler` deps

  **Newly exported**: `PLUGIN_SYNC_INFO` constant. Consumers supplying a custom `NavigationBrowser` should pass this value as `info` in their `nav.navigate` / `nav.traverseTo` calls so the handler can recognise plugin-originated events. The built-in factory path does this automatically. See `packages/navigation-plugin/CLAUDE.md` for the full rationale.

  **Behaviour change to be aware of**: a transition that resolves to the same URL (initial transition into a same-path route, `router.navigate(name, params, {reload: true})` to current state, redirects via `forwardTo` that don't change the path) no longer fires a navigate event — the plugin updates state in-place. Consumers branching on navigate events for state-only changes should subscribe to `router.subscribe` instead; `state.context.navigation.navigationType` still reflects the logical type (`reload` / `replace` / etc.).

- [#646](https://github.com/greydragon888/real-router/pull/646) [`4d5ef9a`](https://github.com/greydragon888/real-router/commit/4d5ef9a6deaba291a0e791cd0dc2fcca047961dd) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `normalizeHashInput` non-idempotence on multi-`#` input ([#647](https://github.com/greydragon888/real-router/issues/647))

  `normalizeHashInput` in `shared/browser-env/url-context.ts` previously stripped only the FIRST leading `#`, so `normalize("##") === "#"` while `normalize("#") === ""` — calling it twice on `"##"` produced a different result. Property test G9 (`normalize(normalize(x)) === normalize(x)`) caught this under fast-check seed `-746842783` with counterexample `"##"`. Pre-existing since [#532](https://github.com/greydragon888/real-router/issues/532)/[#567](https://github.com/greydragon888/real-router/issues/567); only surfaced now because the seed had not generated the corner case before.

  `normalizeHashInput` now strips ALL leading `#` characters in a loop. Idempotence holds for every input.

  **Behavioural change for navigation-plugin consumers**:
  - `router.navigate(name, params, { hash: "##foo" })` previously produced fragment `"#foo"`; now produces `"foo"`.
  - `router.buildUrl(name, params, { hash: "##foo" })` and `router.replaceHistoryState(name, params, { hash: "##foo" })` follow the same change.
  - `<Link hash="##foo">` (via React/Preact/Vue/Solid/Svelte/Angular adapters) now resolves to fragment `"foo"`.

  A monorepo grep confirmed zero production or example call sites pass `"##..."` as a hash value, so the behavioural change is empirically inert.

  Updated G10 property test in `tests/property/hash-encoding.properties.ts` — previously documented the old single-strip behaviour, now asserts the new invariant ("ALL leading '#' chars are stripped — the result never starts with '#'"). G9 idempotence passes for all inputs.

## 0.7.2

### Patch Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix duplicate history entry on initial transition ([#642](https://github.com/greydragon888/real-router/issues/642))

  After `router.start()` resolved a cross-document load (URL bar entry, page reload, Playwright `goto`), the plugin pushed a second `navigation.entries()` row for the URL the browser had **already** committed. Result: stack length 2 for a perceived-fresh tab, `canGoBack()` returned `true`, and `peekBack()` resolved to the current route — violating the documented `canGoBack()` contract and breaking smart back-button UIs (`examples/web/react/navigation-api` Scenario 1; `examples/desktop/tauri/react-navigation` canGoBack/canGoForward toggle).

  **Root cause**: the constructor's "Cross-document Activation Priming" ([#531](https://github.com/greydragon888/real-router/issues/531)) sets `#capturedMeta.navigationType` from `navigation.activation.navigationType` — typically `"push"`. In `onTransitionSuccess` the `navigationType !== "push"` check then evaluated to `false`, so the plugin physically pushed instead of replacing.

  **Fix**: when `fromState === undefined` (first transition after start), the plugin now physically `replace`s the entry — the browser's own entry stays as the single stack row. `state.context.navigation.navigationType` metadata is **unchanged** (`"push"` / `"reload"` / `"replace"` continue to flow to consumers) — scroll restoration ([#497](https://github.com/greydragon888/real-router/issues/497)) and direction tracker logic are not affected.

  **Verified**: 236 unit tests + 37/37 react-navigation-api e2e + 8/8 tauri-react-navigation e2e pass.

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.7.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add URL fragment ("hash") support via `state.context.url` ([#532](https://github.com/greydragon888/real-router/issues/532))

  The plugin now publishes a shared `url` namespace under `state.context` containing
  the decoded fragment and a `hashChanged` signal. Subscribers can branch on
  `state.context.url.hashChanged` instead of disambiguating via the overloaded
  `force` flag.
  - `router.buildUrl(name, params, { hash })` accepts an options object with the
    decoded fragment (no leading `#`).
  - `router.replaceHistoryState(name, params, { hash })` mirrors the same widening.
  - `router.navigate(name, params, { hash })` exposes a tri-state `hash` option:
    `undefined` preserves the current fragment, `""` clears it, a non-empty value
    sets it.
  - The `navigate` event handler detects `event.hashChange` and forwards
    `force: true, hashChange: true` so same-path hash-only clicks are not swallowed
    by the SAME_STATES short-circuit.
  - Cross-path navigation now preserves the current fragment by default, fixing
    the previous `shouldPreserveHash` workaround which dropped the hash on every
    path change.
  - Recovery (`syncUrlToRouterState`) reads the fragment from
    `state.context.url.hash` so guard rejection or unmatched URLs do not strip the
    fragment from the visible URL.

## 0.6.3

### Patch Changes

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `api.navigateToState` in the navigate-event handler ([#525](https://github.com/greydragon888/real-router/issues/525))

  `navigate-handler.ts` now hands the `State` produced by `api.matchPath(url)`
  directly to `api.navigateToState(state, opts)` inside `event.intercept(...)`,
  instead of re-deconstructing it as
  `router.navigate(state.name, state.params, opts)`. This avoids running
  `forwardState` and `buildPath` a second time on the navigate-event hot
  path, and (most importantly) preserves the trailing slash from the source
  URL through to `state.path` in `trailingSlash:"preserve"` mode.

  Affected file: `packages/navigation-plugin/src/navigate-handler.ts` —
  `event.intercept(...)` body now calls `api.navigateToState(matched, …)`.

  No public API change for plugin consumers. Inherits the 5–20% reduction
  per navigate event ([#525](https://github.com/greydragon888/real-router/issues/525)).

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/types@0.35.0

## 0.6.2

### Patch Changes

- [#559](https://github.com/greydragon888/real-router/pull/559) [`3dc46c2`](https://github.com/greydragon888/real-router/commit/3dc46c201189ce6d9b916dda2dbed4fdd5326adc) Thanks [@greydragon888](https://github.com/greydragon888)! - Flatten plugin-utils into shared/browser-env ([#527](https://github.com/greydragon888/real-router/issues/527))

  Removed `packages/navigation-plugin/src/plugin-utils.ts` — its `createStartInterceptor` and `createReplaceHistoryState` duplicates now resolve through `shared/browser-env` via the structural `LocationSource` and `ReplaceStateBrowser` types.

  The "syncing" invariant — `navigation.navigate({history:"replace"})` and `navigation.navigate(...)` fire navigate events synchronously, and the plugin's own writes must short-circuit the handler — moved from manual `try/finally` blocks in `plugin.ts` and `navigate-handler.ts` to a `wrapNavigationBrowserWithSyncing` helper applied uniformly in `factory.ts` to any `NavigationBrowser` (built-in or user-supplied). No user-visible behavior change.

## 0.6.1

### Patch Changes

- [#557](https://github.com/greydragon888/real-router/pull/557) [`b85dbb3`](https://github.com/greydragon888/real-router/commit/b85dbb3e4b066674d1726e4447de2e040dcdd81d) Thanks [@greydragon888](https://github.com/greydragon888)! - Report `navigationType` correctly after cross-document load ([#531](https://github.com/greydragon888/real-router/issues/531))

  After F5 (`location.reload()`), browser back/forward across the JS context boundary, or a fresh URL bar entry, the plugin used to emit the initial transition with `state.context.navigation.navigationType === "replace"` regardless of how the document was actually loaded. The fallback in `onTransitionSuccess` derived the type only from `navOptions`, which always resolves to `"replace"` on the very first transition.

  The plugin now reads `navigation.activation.navigationType` ([Baseline 2026](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-navigationactivation-navigationtype): Chrome 123+, Edge 123+, Firefox 147+, Safari 26.2+) in its constructor and primes `state.context.navigation` for the first transition. Affected types correctly reported now: `"reload"`, `"traverse"` (cross-document back/forward), `"push"` (typed URL / external link), `"replace"`. On browsers without `navigation.activation` the plugin falls back to the existing derivation.

  Fixes scroll position restoration after F5 in `createScrollRestoration` (`shared/dom-utils/scroll-restore.ts`) — the `"reload"` branch is now reachable end-to-end, not just under synthetic fake-router tests.

  The new `NavigationBrowser.getActivationType()` method has a no-op SSR fallback returning `undefined`.

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
