# @real-router/hash-plugin

## 0.8.24

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0

## 0.8.23

### Patch Changes

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0

## 0.8.22

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0

## 0.8.21

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source the `isState` re-export from the local browser-env state guard ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The `isStateStrict as isState` re-export now comes from `shared/browser-env/state-guard.ts` (a byte-identical twin) instead of the dissolved `type-guards` package. Internal refactor — the public `isState` export and its `history.state` validation behaviour are unchanged.

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source types from `@real-router/core` (was the now-folded `@real-router/types`) ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
  module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
  (wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0

## 0.8.20

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0

## 0.8.19

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.8.18

### Patch Changes

- [#1464](https://github.com/greydragon888/real-router/pull/1464) [`1943598`](https://github.com/greydragon888/real-router/commit/1943598f80136f0f91595f9bed6c7792cce0936d) Thanks [@greydragon888](https://github.com/greydragon888)! - Collapse a not-found popstate storm to a single navigation ([#1448](https://github.com/greydragon888/real-router/issues/1448))

  A back/forward popstate that resolves to the `UNKNOWN_ROUTE` already committed
  for the exact same path is now a no-op, instead of re-committing an identical
  not-found state and re-notifying subscribers. This restores parity with the
  matched-route branch, where a same-state popstate is already suppressed by
  `navigateToState`'s `SAME_STATES` check — `navigateToNotFound` bypasses the
  navigate pipeline, so the popstate handler now guards the redundant call itself.
  A different not-found path still navigates; the short-circuit is path-specific.

## 0.8.17

### Patch Changes

- [#1447](https://github.com/greydragon888/real-router/pull/1447) [`e8203b2`](https://github.com/greydragon888/real-router/commit/e8203b2f9995ea1c77445dc98e4159e5727e9205) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(hash-plugin): reset the popstate/hashchange dedup on a macrotask, not a microtask ([#1228](https://github.com/greydragon888/real-router/issues/1228))

  A hash-changing back/forward fires the `popstate`+`hashchange` pair in one browser task, but a **microtask checkpoint runs between the two listeners** (verified in Chromium: `[popstate, microtask, hashchange, macrotask]`). The dedup's `queueMicrotask` reset therefore cleared its guard flags before the pair's second event, which was then handled as an independent navigation to the same location → a phantom `SAME_STATES` `$$error` on **every** hash back/forward (leaking to `$$error` subscribers — error boundaries, reporting, devtools — and doing a redundant `replaceState`). The `saw*` flags now reset on a `setTimeout(0)` macrotask, which fires **after** the pair completes, so the guard spans the whole pair. State, URL, and the type-scoped / order-independent dedup semantics are unchanged.

- [#1447](https://github.com/greydragon888/real-router/pull/1447) [`e8203b2`](https://github.com/greydragon888/real-router/commit/e8203b2f9995ea1c77445dc98e4159e5727e9205) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(hash-plugin): preserve the typed URL on a 404 popstate ([#1229](https://github.com/greydragon888/real-router/issues/1229))

  `onTransitionSuccess` rebuilt the address-bar URL from `buildUrl(toState.name, toState.params)`; for `UNKNOWN_ROUTE` `buildPath` returns `""`, so the URL collapsed to the bare prefix (`#!`) and the typed 404 path was lost — a refresh then re-started from `#!` and silently landed on `home`. It now builds from `toState.path` (already final, and for matched routes identical to `buildPath(name, params)`), so the typed URL survives and a refresh is idempotent to the same 404 state. Also drops one `buildPath` per successful navigation (parity with browser-plugin).

- [#1447](https://github.com/greydragon888/real-router/pull/1447) [`e8203b2`](https://github.com/greydragon888/real-router/commit/e8203b2f9995ea1c77445dc98e4159e5727e9205) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(hash-plugin): warn+ignore `{ hash }` in `replaceHistoryState` instead of splicing a fragment ([#1230](https://github.com/greydragon888/real-router/issues/1230))

  `replaceHistoryState(name, params, { hash: "x" })` spliced the fragment into the hash-route URL (`#!/about#x`) with no warning — unlike `buildUrl`/`navigate`, which warn once and ignore it (`#` is the route delimiter, so URL fragments are structurally unsupported). The shared `createReplaceHistoryState`'s explicit-hash branch runs independently of the `preserveHash` flag, so hash-plugin's `preserveHash=false` did not suppress it. hash-plugin now wraps the extension: it emits the same one-time warn and drops `{ hash }` before delegating, completing the warn+ignore contract across all three hash-accepting methods. browser-plugin / navigation-plugin (which legitimately support tri-state `{ hash }`) are unaffected.

## 0.8.16

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.8.15

### Patch Changes

- [#1382](https://github.com/greydragon888/real-router/pull/1382) [`3cfa3e8`](https://github.com/greydragon888/real-router/commit/3cfa3e8514799f4f70c6323d7a4d5157baf0ed22) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: factory-pool `stop()`/`dispose()` of an earlier router no longer disconnects the live router's listeners ([#1213](https://github.com/greydragon888/real-router/issues/1213))

  When one plugin factory is shared across multiple routers (a pool), the last router to `start()` owns the shared combined popstate+hashchange remover (last-wins, [#758](https://github.com/greydragon888/real-router/issues/758)). But `createHashSyncLifecycle`'s `onStop`/`teardown` cleared that slot **unconditionally**, so stopping or disposing an _earlier_ router removed the _active_ router's listeners — the live router went deaf to back/forward and fragment changes. The lifecycle now captures its own combined remover at `onStart` and clears the shared slot only while it still owns it.

## 0.8.14

### Patch Changes

- [#1354](https://github.com/greydragon888/real-router/pull/1354) [`bd26591`](https://github.com/greydragon888/real-router/commit/bd26591a68905dc7267db9c68160e17ec93992f8) Thanks [@greydragon888](https://github.com/greydragon888)! - Skip the redundant popstate-success `replaceState` on back/forward when it is provably a no-op ([#1353](https://github.com/greydragon888/real-router/issues/1353))

  On a browser back/forward the engine has already restored the target entry's `{name, params, path}` and URL before firing `popstate`, so re-writing them via `replaceState` was a value-level no-op that still fired a second `updateForSameDocumentNavigation` Blink event per navigation. The plugin now skips the write when the resolved target deep-equals the live `history.state` (same path + `areStatesEqual`). Every load-bearing case keeps the write: redirect/normalization (path or params differ), corrupted or missing `history.state`, and custom `Browser` implementations without a state reader.

## 0.8.13

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.8.12

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.8.11

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.8.10

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.8.9

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.8.8

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3), [`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/types@0.39.0

## 0.8.7

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.8.6

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.8.5

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.8.4

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.8.3

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.8.2

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.8.1

### Patch Changes

- [#1081](https://github.com/greydragon888/real-router/pull/1081) [`362f24d`](https://github.com/greydragon888/real-router/commit/362f24d1b57b88d5f01bc078e84e2b384b3811b1) Thanks [@greydragon888](https://github.com/greydragon888)! - Clarify the `getRouteFromEvent` matchPath-fallback JSDoc in shared `popstate-utils` — name hash-plugin's `buildHashLocation(location.hash, ...)` mechanism so the comment (read by both URL plugins' maintainers) correctly explains why the fallback resolves the hash route ([#760](https://github.com/greydragon888/real-router/issues/760))

## 0.8.0

### Minor Changes

- [#1064](https://github.com/greydragon888/real-router/pull/1064) [`ff1a29e`](https://github.com/greydragon888/real-router/commit/ff1a29e076a9c2f7af50ac736a9bcfb89db0a646) Thanks [@greydragon888](https://github.com/greydragon888)! - Sync the router on external URL fragment changes ([#759](https://github.com/greydragon888/real-router/issues/759))

  hash-plugin now listens to `hashchange` in addition to `popstate`, so external fragment changes — a native `<a href="#/x">`, a manual address-bar hash edit, or `location.hash = "..."` from app/third-party code — synchronize the router. Previously only programmatic navigation (`<Link>` / `router.navigate`) and back/forward (popstate) were tracked; an external hash mutation updated the URL while the router stayed on the old route.

  A hash-changing back/forward fires both `popstate` and `hashchange`; the two are deduped (order-independent, microtask-scoped) so exactly one navigation runs — never a double-navigate.

  **Type note:** the exported `Browser` interface now requires `addHashChangeListener`. Code that supplies a hand-written `Browser` via the (test-only) `browser` factory argument must add this method.

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

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate deeply-nested `history.state` without overflowing the call stack ([#901](https://github.com/greydragon888/real-router/issues/901))

  The re-exported `isState` guard (bundled `type-guards`) validated nested params with a recursive walk that threw `RangeError: Maximum call stack size exceeded` on objects nested past ~2.4k levels — reachable from an adversarial `history.state` on `popstate`. The walk is now iterative, so `isState` returns a boolean at any nesting depth instead of crashing the navigation.

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - `isState` accepts params with shared references / diamonds ([#786](https://github.com/greydragon888/real-router/issues/786))

  The re-exported `isState` guard (bundled `type-guards`) rejected fully serializable params that reuse the same object or array under multiple keys (a diamond / DAG, not a cycle), reachable from a `history.state` carrying shared references. The guard now accepts them; genuine circular references are still rejected.

## 0.7.9

### Patch Changes

- [#872](https://github.com/greydragon888/real-router/pull/872) [`f1c8148`](https://github.com/greydragon888/real-router/commit/f1c814891312de5cc4cda90511df6153dfffc655) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a deferred null-state popstate landing on the wrong route after a concurrent navigation ([#757](https://github.com/greydragon888/real-router/issues/757))

  When a back/forward event was deferred behind an in-flight async-guarded navigation and that event carried a `null`/invalid `history.state`, the shared popstate handler resolved its route via `matchPath(browser.getLocation())` at replay time — after the in-flight navigation's `onTransitionSuccess → replaceState` had already overwritten the live hash location. The router landed on the earlier target instead of the entry the user actually navigated to, and the visible URL desynced.

  The handler now snapshots the location the instant each popstate event fires and resolves the deferred event against that snapshot, so the last back/forward entry wins. The same snapshot also feeds the `navigateToNotFound` and strict-mode `ROUTE_NOT_FOUND` paths.

## 0.7.8

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.7.7

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.7.6

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.7.5

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.7.4

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.7.3

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.7.2

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.7.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Document URL fragment limitation with one-time runtime warning ([#532](https://github.com/greydragon888/real-router/issues/532))

  `hash-plugin` uses `#` as the route delimiter, so URL fragments are
  structurally incompatible. The plugin now accepts the `hash` option on
  `buildUrl` / `navigate` for typing parity with `@real-router/browser-plugin`
  and `@real-router/navigation-plugin`, ignores it at runtime, and emits a
  single `console.warn` the first time any consumer surfaces a hash through
  either entry point.

  Use `@real-router/browser-plugin` or `@real-router/navigation-plugin` if you
  need URL fragment support.

## 0.6.3

### Patch Changes

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `api.navigateToState` for popstate-driven navigation ([#525](https://github.com/greydragon888/real-router/issues/525))

  The popstate handler now hands the `State` produced by `api.matchPath(url)`
  directly to `api.navigateToState(state, opts)` instead of re-deconstructing
  it as `router.navigate(state.name, state.params, opts)`. This avoids
  running `forwardState` and `buildPath` a second time on the popstate hot
  path, and (most importantly) preserves the trailing slash from the source
  URL through to `state.path` in `trailingSlash:"preserve"` mode.

  Affected file: `shared/browser-env/popstate-handler.ts` (shared with
  `browser-plugin` via symlink). `getRouteFromEvent` now returns a `State`
  (built via `api.makeState` from `evt.state` when present, or
  `api.matchPath` otherwise); the popstate path uses `api.navigateToState`
  to commit it.

  No public API change for plugin consumers. Inherits the 5–20% reduction
  per popstate event ([#525](https://github.com/greydragon888/real-router/issues/525)).

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0

## 0.6.2

### Patch Changes

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `buildUrl("/", base)` producing trailing-slash index URLs ([#526](https://github.com/greydragon888/real-router/issues/526))

  `buildUrl("/", "/app")` previously returned `"/app/"` (with trailing slash) for the index route under a non-empty base. That disagreed with the canonical form `normalizeBase("/app/") === "/app"` and produced asymmetric URLs in `browser.history`. The function now collapses index-under-base to the bare base (`"/app"`), keeping URLs symmetric. Roundtrip is preserved: `extractPath("/app", "/app") === "/"`.

  Fix is in the shared `browser-env` source (`shared/browser-env/url-utils.ts`) consumed by `browser-plugin`, `hash-plugin`, and `navigation-plugin` via symlink. Each consumer gets its own patch changeset.

## 0.6.1

### Patch Changes

- [#514](https://github.com/greydragon888/real-router/pull/514) [`42691aa`](https://github.com/greydragon888/real-router/commit/42691aaa39d1ffa11db3beae6548c2d5afd18ab1) Thanks [@greydragon888](https://github.com/greydragon888)! - Deduplicate `getLocation` callback into `buildHashLocation` helper ([#506](https://github.com/greydragon888/real-router/issues/506))

  Extracted the hash-path-plus-query construction logic shared by the
  production factory and two test helpers into a single pure function in
  `hash-utils.ts`:

  ```ts
  export function buildHashLocation(
    hash: string,
    search: string,
    prefixRegex: RegExp | null,
  ): string {
    const hashPath = safelyEncodePath(extractHashPath(hash, prefixRegex));
    return hashPath.includes("?") ? hashPath : hashPath + search;
  }
  ```

  Previously the same two-line sequence (strip prefix → encode → append
  outer `search` unless hash already carries a `?`) was copied verbatim in
  three places, with no structural guard against divergence:
  - `packages/hash-plugin/src/factory.ts` — production `createSafeBrowser`
    callback.
  - `packages/hash-plugin/tests/helpers/mockPlugins.ts` — functional-test
    mock browser.
  - `packages/hash-plugin/tests/stress/helpers.ts` — stress-test router
    factory.

  The "no double `?`" regression fixed in `url.test.ts` — "well-formed
  path (no double '?')" was a direct consequence of the duplication: a
  patch landed in production but the mocks fell behind until the test was
  added. Consolidating into one helper prevents the class of regression.

  Internal refactor only — no public API changes. `buildHashLocation` is
  not exported from the package; it lives in `src/hash-utils.ts` alongside
  the other hash-URL primitives.

  Direct unit tests added in `tests/functional/hash-utils.test.ts` — 13
  cases covering the "no double `?`" contract, the hashPrefix strip, URL
  encoding of non-ASCII paths, malformed percent-sequence passthrough, and
  composition agreement with `extractHashPath` / `hashUrlToPath`. The
  regression previously surfaced only through an end-to-end router test
  (`url.test.ts` — "well-formed path (no double '?')"); unit coverage now
  pins the helper directly so future edits to `buildHashLocation` fail at
  the helper level before they corrupt the router flow.

## 0.6.0

### Minor Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Desktop environments support (Electron, Tauri) ([#496](https://github.com/greydragon888/real-router/issues/496))

  `safeParseUrl` (shared with `browser-plugin` and `navigation-plugin`) no longer depends on `globalThis.location.origin` and no longer filters by scheme. Hash routing now works uniformly in Electron `file://` mode (where `location.origin === "null"` previously caused `TypeError`), Tauri webviews, and any other webview that may ship with non-HTTP origins.

  **What changed**
  - `hashUrlToPath` now returns `string` (never `null`) — the parser is total.
  - Scheme whitelist removed. Any URL with a hash fragment is parsed, regardless of scheme.

  **Migration**

  No source changes required. `hash-plugin` remains the safest option for Electron apps that cannot configure a custom protocol handler — hash routing never hits the `SecurityError` that History API triggers on `file://`.

### Patch Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal refactors: filter explicit `undefined` option values and remove `router.buildUrl` indirection ([#511](https://github.com/greydragon888/real-router/issues/511))
  - **Bug fix**: `hashPluginFactory({ hashPrefix: undefined })` now correctly falls back to the default `""` instead of producing `urlPrefix: "#undefined"`. Previously, explicit `undefined` values leaked through `{ ...defaults, ...opts }` spread because `undefined` is a legitimate enumerable own property.
  - **Refactor**: the popstate-handler `buildUrl` callback now uses the pre-computed `pluginBuildUrl` closure directly instead of going through `router.buildUrl(name, params)` wrapper (removes one level of indirection on the error-recovery path).
  - **Refactor**: `loggerContext` in `createPopstateHandler` now references the `LOGGER_CONTEXT` constant from `src/constants.ts` instead of a duplicated string literal.

  No public API changes.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Reduce per-call allocation in `router.replaceHistoryState()` ([#470](https://github.com/greydragon888/real-router/issues/470))

  Shared `createReplaceHistoryState` helper in `browser-env` now reuses a
  mutable `{ name, params, path }` buffer via `createUpdateBrowserState()`
  across calls instead of allocating a fresh literal per invocation. Hash
  plugin benefits transparently — no API change.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractHashPath("#", regex)` returning `"#"` when `hashPrefix` is configured ([#504](https://github.com/greydragon888/real-router/issues/504))

  A bare `#` or empty hash now consistently resolves to `"/"` regardless of the configured `hashPrefix`. Previously, when a non-null `prefixRegex` was compiled (e.g. from `hashPrefix: "!"`), a bare `#` was returned verbatim because the regex did not match, and the `path || "/"` fallback was never triggered.

  **Impact:** `router.matchUrl("https://example.com/#")` now correctly matches the index route instead of returning `undefined` when a non-empty `hashPrefix` is configured.

  ```diff
    export function extractHashPath(hash: string, prefixRegex: RegExp | null): string {
  +   if (hash === "" || hash === "#") {
  +     return "/";
  +   }
      const path = prefixRegex ? hash.replace(prefixRegex, "") : hash.slice(1);
      return path || "/";
    }
  ```

## 0.5.0

### Minor Changes

- [#487](https://github.com/greydragon888/real-router/pull/487) [`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** popstate to unmatched hash in strict mode no longer silently redirects to `defaultRoute` ([#483](https://github.com/greydragon888/real-router/issues/483))

  Same change as `@real-router/browser-plugin` — hash-plugin reuses the shared `popstate-handler` from `browser-env`, so the fix propagates automatically.

  When `allowNotFound: false` and a popstate targets a hash that matches no registered route, the plugin used to silently call `router.navigateToDefault({ reload: true, replace: true })`. This is removed.

  **New behaviour:**
  - `$$error` event with `ROUTE_NOT_FOUND` — observable via `onTransitionError` hook.
  - Browser URL is rolled back to the last-known router state.
  - Router state is unchanged.

  **Migration** — same as browser-plugin:

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

## 0.4.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.4.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix URL helpers and harden options validation ([#470](https://github.com/greydragon888/real-router/issues/470))

  **Base path normalization (from shared `browser-env`)**
  - `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere. Affects hash-plugin because the factory passes `base` through `normalizeBase`.

  **Plugin behavior**
  - `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
  - `hashPrefix` option is now validated against `/`, `#`, `?`, and control characters (via the new shared `safeHashPrefixRule`). Previously `hashPrefix: "/"` silently produced `#//path` URLs and broke `matchPath` on `getLocation()` because `extractHashPath` stripped the leading `/`.
  - `matchUrl` no longer concatenates the outer query (`?a=1` before `#`) with the inner hash query — inner wins. Previously `matchUrl("example.com/?a=1#/users?page=2")` produced the malformed path `/users?page=2?a=1`. Same fix applied to the default `getLocation` closure the factory builds.
  - Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.
  - `replaceHistoryState` explicitly opts out of the new shared hash-preservation behavior (passes `preserveHash: false`) — hash already encodes the route.

  **Breaking (pre-1.0):**
  - `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
  - `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.
  - `hashPrefix: "/"`, `"#"`, `"?"`, or values with control characters now throw at factory time.

## 0.3.2

### Patch Changes

- [#452](https://github.com/greydragon888/real-router/pull/452) [`d337422`](https://github.com/greydragon888/real-router/commit/d337422785674a5a0801d44cc1b99647562f0080) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` ([#447](https://github.com/greydragon888/real-router/issues/447))

  Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.

## 0.3.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

## 0.3.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

## 0.2.15

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `browser-env` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `browser-env` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared browser API abstractions now live as bare source files in `shared/browser-env/`, accessed through a git-tracked `src/browser-env` symlink inside this package. Imports use local paths (`./browser-env/index.js`). No API changes, no bundle size difference — end users see no change.

## 0.2.14

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.2.13

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

## 0.2.12

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

## 0.2.11

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

## 0.2.10

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

## 0.2.9

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

## 0.2.8

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

## 0.2.6

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `areStatesEqual` with path comparison in `shouldReplaceHistory` ([#364](https://github.com/greydragon888/real-router/issues/364))

  Use `toState.path === fromState?.path` instead of `router.areStatesEqual()` to detect same-state reload. Removes `router` parameter dependency from `shouldReplaceHistory`.

- Updated dependencies [[`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e)]:
  - @real-router/core@0.40.1

## 0.2.5

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

## 0.2.4

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

## 0.2.3

### Patch Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `GuardFnFactory` signature in README example ([#298](https://github.com/greydragon888/real-router/issues/298))

  Guard factory receives `(router, getDep)`, not `()`. Updated deactivate guard example to show correct signature.

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

## 0.2.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, Router Extensions table, `buildUrl` vs `buildPath` comparison, Form Protection and SSR sections. Unified structure with browser-plugin README.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

## 0.2.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `navigateToNotFound()` on popstate when `allowNotFound` is enabled ([#241](https://github.com/greydragon888/real-router/issues/241))

  When `allowNotFound: true` and a popstate event resolves to an unknown route, the plugin now calls `router.navigateToNotFound()` instead of `router.navigateToDefault()`, preserving the unmatched hash URL for contextual 404 pages.

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

## 0.1.0

### Minor Changes

- [#235](https://github.com/greydragon888/real-router/pull/235) [`9bf5901`](https://github.com/greydragon888/real-router/commit/9bf5901a2ff8ff51428ef15cc90cfd8159b9a379) Thanks [@greydragon888](https://github.com/greydragon888)! - Standalone hash-based routing plugin (#234)

  New `@real-router/hash-plugin` package for hash-based routing (`example.com/#/path`).

  ```typescript
  import { hashPluginFactory } from "@real-router/hash-plugin";

  router.usePlugin(hashPluginFactory({ hashPrefix: "!", base: "/app" }));
  ```

  - `hashPrefix` — character after `#` (default: `""`, e.g. `"!"` for `#!/path`)
  - `base` — base path prefix (default: `""`)
  - `forceDeactivate` — force deactivation on navigation (default: `false`)
