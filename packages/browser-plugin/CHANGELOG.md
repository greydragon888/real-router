# @real-router/browser-plugin

## 0.18.25

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0

## 0.18.24

### Patch Changes

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0

## 0.18.23

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0

## 0.18.22

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source the `isState` re-export from the local browser-env state guard ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The `isStateStrict as isState` re-export now comes from `shared/browser-env/state-guard.ts` (a byte-identical twin) instead of the dissolved `type-guards` package. Internal refactor — the public `isState` export and its `history.state` validation behaviour are unchanged.

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source types from `@real-router/core` (was the now-folded `@real-router/types`) ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
  module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
  (wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0

## 0.18.21

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0

## 0.18.20

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.18.19

### Patch Changes

- [#1464](https://github.com/greydragon888/real-router/pull/1464) [`1943598`](https://github.com/greydragon888/real-router/commit/1943598f80136f0f91595f9bed6c7792cce0936d) Thanks [@greydragon888](https://github.com/greydragon888)! - Collapse a not-found popstate storm to a single navigation ([#1448](https://github.com/greydragon888/real-router/issues/1448))

  A back/forward popstate that resolves to the `UNKNOWN_ROUTE` already committed
  for the exact same path is now a no-op, instead of re-committing an identical
  not-found state and re-notifying subscribers. This restores parity with the
  matched-route branch, where a same-state popstate is already suppressed by
  `navigateToState`'s `SAME_STATES` check — `navigateToNotFound` bypasses the
  navigate pipeline, so the popstate handler now guards the redundant call itself.
  A different not-found path still navigates; the short-circuit is path-specific.

## 0.18.18

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.18.17

### Patch Changes

- [#1393](https://github.com/greydragon888/real-router/pull/1393) [`ea2d08a`](https://github.com/greydragon888/real-router/commit/ea2d08ae04f527d2e544a09e599aa65d7221b835) Thanks [@greydragon888](https://github.com/greydragon888)! - Strictly-decoded `hash` contract ([#1211](https://github.com/greydragon888/real-router/issues/1211)) — `normalizeHashInput` no longer decodes

  The `hash` option (`navigate({ hash })`, `buildUrl({ hash })`, `replaceHistoryState({ hash })`) is a DECODED fragment and is now encoded verbatim. `normalizeHashInput` previously stripped the leading `#` **and decoded** — a second decode that corrupted literal-percent fragments (`"a%20b"` → `"a b"`, redirect URLs / serialized tokens broken) and split the plugin↔adapter policy. It now strips `#` only. `{ hash: "a%20b" }` is the literal fragment `a%20b` → `#a%2520b` (was `#a%20b`). **Breaking** for callers who passed raw, percent-encoded `location.hash` — pass a decoded fragment. Part of the wave-2 hash cluster FORM axis; the framework adapters' `<Link>` encoder is aligned in their patch.

## 0.18.16

### Patch Changes

- [#1386](https://github.com/greydragon888/real-router/pull/1386) [`2d9d086`](https://github.com/greydragon888/real-router/commit/2d9d0868a9f5b3e453d21d75bf89030f54bcb57f) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix two hash-sync drift bugs on `state.context.url.hash` ([#1210](https://github.com/greydragon888/real-router/issues/1210), [#1212](https://github.com/greydragon888/real-router/issues/1212))

  - **[#1210](https://github.com/greydragon888/real-router/issues/1210) (TIME):** a deferred popstate — one that arrives while a navigation is in flight — replayed against the LIVE fragment, which the in-flight navigation's `replaceState` had since overwritten, so the deferred event resolved the wrong hash (TOCTOU). The popstate handler now snapshots the fragment at the event's fire time (alongside the path/query location [#757](https://github.com/greydragon888/real-router/issues/757) already snapshotted) and the deferred replay uses that snapshot.
  - **[#1212](https://github.com/greydragon888/real-router/issues/1212) (CACHE):** `router.replaceHistoryState({ hash })` set the fragment via `replaceState` (which fires no `hashchange`) but did not sync the `currentHash` cache — so a subsequent preserve-navigate read the stale cache and wiped the fragment. `replaceHistoryState` now re-syncs the cache; it is a cold path, so the live read is free (the [#1019](https://github.com/greydragon888/real-router/issues/1019) hot-path optimization is untouched — the per-navigation stream still reads the cache).

  Both mutation-validated. Part of the wave-2 hash cluster; the FORM axis ([#1211](https://github.com/greydragon888/real-router/issues/1211)) is a separate cross-layer contract change. The [#1210](https://github.com/greydragon888/real-router/issues/1210) shared popstate-handler change is neutral for hash-plugin (no fragment augmentation there).

## 0.18.15

### Patch Changes

- [#1382](https://github.com/greydragon888/real-router/pull/1382) [`3cfa3e8`](https://github.com/greydragon888/real-router/commit/3cfa3e8514799f4f70c6323d7a4d5157baf0ed22) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: factory-pool `stop()`/`dispose()` of an earlier router no longer disconnects the live router's listeners ([#1213](https://github.com/greydragon888/real-router/issues/1213))

  When one plugin factory is shared across multiple routers (a pool), the last router to `start()` owns the shared popstate + hashchange listener slots (last-wins, [#758](https://github.com/greydragon888/real-router/issues/758)). But `onStop`/`teardown` cleared those slots **unconditionally**, so stopping or disposing an _earlier_ router removed the _active_ router's listeners — the live router went deaf to back/forward and external hash changes. The lifecycle now captures its own remover at `onStart` and clears the shared slot only while it still owns it (`createPopstateLifecycle` + the factory's hashchange listener).

## 0.18.14

### Patch Changes

- [#1354](https://github.com/greydragon888/real-router/pull/1354) [`bd26591`](https://github.com/greydragon888/real-router/commit/bd26591a68905dc7267db9c68160e17ec93992f8) Thanks [@greydragon888](https://github.com/greydragon888)! - Skip the redundant popstate-success `replaceState` on back/forward when it is provably a no-op ([#1353](https://github.com/greydragon888/real-router/issues/1353))

  On a browser back/forward the engine has already restored the target entry's `{name, params, path}` and URL before firing `popstate`, so re-writing them via `replaceState` was a value-level no-op that still fired a second `updateForSameDocumentNavigation` Blink event per navigation. The plugin now skips the write when the resolved target deep-equals the live `history.state` (same path + `areStatesEqual`). Every load-bearing case keeps the write: redirect/normalization (path or params differ), corrupted or missing `history.state`, and custom `Browser` implementations without a state reader. The optional `Browser.getState` reader added for this is non-breaking (absent → the write is preserved).

## 0.18.13

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.18.12

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.18.11

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.18.10

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.18.9

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.18.8

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3), [`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/types@0.39.0

## 0.18.7

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.18.6

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.18.5

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.18.4

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.18.3

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.18.2

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.18.1

### Patch Changes

- [#1088](https://github.com/greydragon888/real-router/pull/1088) [`98896fd`](https://github.com/greydragon888/real-router/commit/98896fd065ffd698a56fa08b1f4bd883ce34e804) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache the URL fragment instead of reading `location.hash` on every navigation ([#1019](https://github.com/greydragon888/real-router/issues/1019))

  `onTransitionSuccess` read `location.hash` (`getDecodedHash`) on every navigation to preserve the current fragment ([#532](https://github.com/greydragon888/real-router/issues/532)). Reading a `location.*` property in a navigation stream forces the browser to synchronously commit the pending `pushState`, costing ~0.04 ms/nav (~25% of a Vue per-navigation, and ~38% of the plugin's per-nav share, in the cross-router benchmark). The plugin now caches the fragment — seeded once on start, updated by its own navigations and by a `hashchange` listener for external changes (anchor clicks, manual `location.hash =`) — so the per-navigation hot path never reads `location.hash`. Framework-agnostic: the plugin is shared by every adapter cohort. Hash semantics ([#532](https://github.com/greydragon888/real-router/issues/532)) are unchanged — external fragment changes are still observed (now via `hashchange`), and the popstate path still samples `location.hash` (a rare event, not the hot path).

## 0.18.0

### Minor Changes

- [#1064](https://github.com/greydragon888/real-router/pull/1064) [`ff1a29e`](https://github.com/greydragon888/real-router/commit/ff1a29e076a9c2f7af50ac736a9bcfb89db0a646) Thanks [@greydragon888](https://github.com/greydragon888)! - `Browser` interface now includes `addHashChangeListener` ([#759](https://github.com/greydragon888/real-router/issues/759))

  The shared `Browser` type exported from browser-plugin gains an `addHashChangeListener` method, added so hash-plugin can track external URL fragment changes. browser-plugin's own runtime behavior is unchanged — it registers only a `popstate` listener, never `hashchange`. Code that supplies a hand-written `Browser` via the (test-only) `browser` factory argument must add this method.

## 0.17.14

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/types@0.38.0

## 0.17.13

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/types@0.37.0

## 0.17.12

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.17.11

### Patch Changes

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate deeply-nested `history.state` without overflowing the call stack ([#901](https://github.com/greydragon888/real-router/issues/901))

  The re-exported `isState` guard (bundled `type-guards`) validated nested params with a recursive walk that threw `RangeError: Maximum call stack size exceeded` on objects nested past ~2.4k levels — reachable from an adversarial `history.state` on `popstate`. The walk is now iterative, so `isState` returns a boolean at any nesting depth instead of crashing the navigation.

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - `isState` accepts params with shared references / diamonds ([#786](https://github.com/greydragon888/real-router/issues/786))

  The re-exported `isState` guard (bundled `type-guards`) rejected fully serializable params that reuse the same object or array under multiple keys (a diamond / DAG, not a cycle), reachable from a `history.state` carrying shared references. The guard now accepts them; genuine circular references are still rejected.

## 0.17.10

### Patch Changes

- [#872](https://github.com/greydragon888/real-router/pull/872) [`f1c8148`](https://github.com/greydragon888/real-router/commit/f1c814891312de5cc4cda90511df6153dfffc655) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a deferred null-state popstate landing on the wrong route after a concurrent navigation ([#757](https://github.com/greydragon888/real-router/issues/757))

  When a back/forward event was deferred behind an in-flight async-guarded navigation and that event carried a `null`/invalid `history.state`, the popstate handler resolved its route via `matchPath(browser.getLocation())` at replay time — after the in-flight navigation's `onTransitionSuccess → replaceState` had already overwritten the live location. The router landed on the earlier target instead of the entry the user actually navigated to, and the visible URL desynced.

  The handler now snapshots the location the instant each popstate event fires and resolves the deferred event against that snapshot, so the last back/forward entry wins. The same snapshot also feeds the `navigateToNotFound` and strict-mode `ROUTE_NOT_FOUND` paths.

## 0.17.9

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.17.8

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.17.7

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.17.6

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.17.5

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.17.4

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.17.3

### Patch Changes

- [#646](https://github.com/greydragon888/real-router/pull/646) [`4d5ef9a`](https://github.com/greydragon888/real-router/commit/4d5ef9a6deaba291a0e791cd0dc2fcca047961dd) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `normalizeHashInput` non-idempotence on multi-`#` input ([#647](https://github.com/greydragon888/real-router/issues/647))

  `normalizeHashInput` in `shared/browser-env/url-context.ts` previously stripped only the FIRST leading `#`, so `normalize("##") === "#"` while `normalize("#") === ""` — calling it twice on `"##"` produced a different result. Property test G9 (`normalize(normalize(x)) === normalize(x)`) in the navigation-plugin's property suite caught this under fast-check seed `-746842783` with counterexample `"##"`. Pre-existing since [#532](https://github.com/greydragon888/real-router/issues/532)/[#567](https://github.com/greydragon888/real-router/issues/567).

  `normalizeHashInput` now strips ALL leading `#` characters in a loop. Idempotence holds for every input.

  **Behavioural change for browser-plugin consumers**:
  - `router.navigate(name, params, { hash: "##foo" })` previously produced fragment `"#foo"`; now produces `"foo"`.
  - `router.buildUrl(name, params, { hash: "##foo" })` and `router.replaceHistoryState(name, params, { hash: "##foo" })` follow the same change.
  - `<Link hash="##foo">` (via React/Preact/Vue/Solid/Svelte/Angular adapters) now resolves to fragment `"foo"`.

  A monorepo grep confirmed zero production or example call sites pass `"##..."` as a hash value, so the behavioural change is empirically inert.

  The helper lives in `shared/browser-env` (consumed by both URL plugins via symlink); the fix and behavioural change apply identically to `@real-router/navigation-plugin`.

## 0.17.2

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.17.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.17.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - Add URL fragment ("hash") support via `state.context.url` ([#532](https://github.com/greydragon888/real-router/issues/532))

  The plugin claims the shared `"url"` `state.context` namespace alongside its
  existing `"browser"` namespace. Subscribers can read the decoded fragment and
  the `hashChanged` signal from `state.context.url`.
  - `router.buildUrl(name, params, { hash })` and
    `router.replaceHistoryState(name, params, { hash })` accept an options object
    with the decoded fragment.
  - `router.navigate(name, params, { hash })` exposes tri-state `hash`:
    `undefined` preserves, `""` clears, a non-empty value sets the fragment.
  - The popstate handler samples `location.hash` after the browser has updated
    to the destination, detects hash-only navigation, and adds
    `force: true, hashChange: true` to bypass SAME_STATES.
  - Cross-path navigation preserves the current fragment by default; the
    previous `shouldPreserveHash` workaround that dropped the hash on path
    change is removed.
  - `rollbackUrlToCurrentState` (popstate recovery) reads the fragment from
    `state.context.url.hash` so guard rejection or unmatched URLs do not strip
    the fragment.

## 0.16.1

### Patch Changes

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `api.navigateToState` for popstate-driven navigation ([#525](https://github.com/greydragon888/real-router/issues/525))

  The popstate handler now hands the `State` produced by `api.matchPath(url)`
  directly to `api.navigateToState(state, opts)` instead of re-deconstructing
  it as `router.navigate(state.name, state.params, opts)`. This avoids
  running `forwardState` and `buildPath` a second time on the popstate hot
  path, and (most importantly) preserves the trailing slash from the source
  URL through to `state.path` in `trailingSlash:"preserve"` mode.

  Affected file: `shared/browser-env/popstate-handler.ts` (consumed via
  symlink). `getRouteFromEvent` now returns a `State` (built via
  `api.makeState` from `evt.state` when present, or `api.matchPath`
  otherwise); the popstate path uses `api.navigateToState` to commit it.

  No public API change for plugin consumers. Inherits the 5–20% reduction
  per popstate event ([#525](https://github.com/greydragon888/real-router/issues/525)).

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/types@0.35.0

## 0.16.0

### Minor Changes

- [#552](https://github.com/greydragon888/real-router/pull/552) [`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2) Thanks [@greydragon888](https://github.com/greydragon888)! - Publish navigation direction in `state.context.browser.direction` ([#541](https://github.com/greydragon888/real-router/issues/541))

  `BrowserContext` now includes a `direction: "forward" | "back"` field alongside the existing `source`. Programmatic `router.navigate()` writes `"forward"`; popstate-driven navigations write `"back"`. Consumers building reverse-aware UI (e.g. direction-aware route animations) can read this synchronously instead of maintaining their own popstate listener.

  The Web Platform does not expose a true forward-vs-back distinction in `popstate` events, so `"back"` is the heuristic for any popstate (browser back, browser forward, hash jump). For most UI cases — slide-aware route transitions, animation choreography — that's the meaningful signal.

  ```ts
  import type { BrowserDirection } from "@real-router/browser-plugin";

  router.subscribe(({ route }) => {
    const direction = route.context.browser?.direction;
    // ...
  });
  ```

  The new `BrowserDirection` type is exported alongside `BrowserContext` and `BrowserSource`.

### Patch Changes

- Updated dependencies [[`1e9868e`](https://github.com/greydragon888/real-router/commit/1e9868ef02ed8f34f809fbd8bccd2a855d9a1fe2)]:
  - @real-router/core@0.50.2

## 0.15.1

### Patch Changes

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `buildUrl("/", base)` producing trailing-slash index URLs ([#526](https://github.com/greydragon888/real-router/issues/526))

  `buildUrl("/", "/app")` previously returned `"/app/"` (with trailing slash) for the index route under a non-empty base. That disagreed with the canonical form `normalizeBase("/app/") === "/app"` and produced asymmetric URLs in `browser.history`. The function now collapses index-under-base to the bare base (`"/app"`), keeping URLs symmetric. Roundtrip is preserved: `extractPath("/app", "/app") === "/"`.

  Fix is in the shared `browser-env` source (`shared/browser-env/url-utils.ts`) consumed by `browser-plugin`, `hash-plugin`, and `navigation-plugin` via symlink. Each consumer gets its own patch changeset.

- [#526](https://github.com/greydragon888/real-router/pull/526) [`076203e`](https://github.com/greydragon888/real-router/commit/076203ed1b4b61596c7689fe054bc29960000124) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractPath` matching non-segment-boundary base prefix ([#446](https://github.com/greydragon888/real-router/issues/446))

  `extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.

## 0.15.0

### Minor Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Desktop environments support (Electron, Tauri) ([#496](https://github.com/greydragon888/real-router/issues/496))

  `safeParseUrl` no longer depends on `globalThis.location.origin` and no longer filters by scheme. The plugin now works out of the box in Electron (`app://`, `file://` with custom protocol) and Tauri (`tauri://`, `https://tauri.localhost`, `asset://`).

  **What changed**
  - Removed `new URL(url, globalThis.location.origin)` — previously threw `TypeError` on `file://` where `location.origin === "null"`.
  - Removed HTTP(S) protocol whitelist — arbitrary schemes (`tauri://`, `app://`, `custom-protocol://`, …) now pass through.
  - `matchUrl()` is now scheme-agnostic: it extracts `pathname + search + hash` and routes on the path alone. Security against malicious URLs comes from route matching (unknown paths return `undefined`), not from scheme filtering.

  **Migration**

  No source changes required. If you relied on the `"Invalid URL protocol"` warning to reject non-HTTP URLs, route-level matching now handles this — `router.matchUrl("javascript:alert(1)")` still returns `undefined`.

### Patch Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Hot-path and code-quality cleanup from audit ([#470](https://github.com/greydragon888/real-router/issues/470))

  Audit follow-up — Priority 4 items from `packages/browser-plugin/.claude/review-2026-04-17.md`:
  - **`history.state` buffer reuse ([#8](https://github.com/greydragon888/real-router/issues/8).2 H5/A2):** new `createUpdateBrowserState()`
    factory returns a closure that reuses one mutable `{ name, params, path }`
    object across `pushState`/`replaceState` calls. Browsers structured-clone
    `history.state` synchronously, so the buffer never escapes — eliminates
    one allocation per navigation on the hot path.
  - **`getLocation` memoization ([#8](https://github.com/greydragon888/real-router/issues/8).2 A7):** the default `Browser` now caches the
    last `extractPath + safelyEncodePath` result keyed by `(pathname, search)`,
    so popstate-storms hitting the same URL do not re-encode every time.
  - **`NavigationOptions.source` typed via module augmentation ([#8](https://github.com/greydragon888/real-router/issues/8).1):**
    `declare module "@real-router/types"` adds an optional `source?: string`
    field to `NavigationOptions`, replacing the
    `(navOptions as Record<string, unknown>).source` cast in
    `onTransitionSuccess`.
  - **Internal class removed ([#8](https://github.com/greydragon888/real-router/issues/8).4):** the `BrowserPlugin` class was an
    `@internal` implementation detail — its constructor and `getPlugin()`
    method are now plain functions inside `factory.ts`, removing one source
    file and the only `export class` in the package.

  No public API changes. The `createUpdateBrowserState` export from the private
  `browser-env` workspace is available to other plugins (hash-plugin,
  navigation-plugin) that want the same allocation savings.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Reduce per-call allocation in `router.replaceHistoryState()` ([#470](https://github.com/greydragon888/real-router/issues/470))

  Audit follow-up from `packages/browser-plugin/.claude/review-2026-04-22.md`
  (section 8a.6 / 8c.6). `createReplaceHistoryState` in the shared `browser-env`
  helper now creates a single mutable `{ name, params, path }` buffer via
  `createUpdateBrowserState()` once per plugin instance and reuses it on every
  `router.replaceHistoryState(name, params)` call. The previous implementation
  allocated a fresh literal on each call — wasteful for UI-heavy flows that
  replace history on every reactive state change.

  Also refactors `shouldReplaceHistory` into three explicit branches, removing
  the `eslint-disable @typescript-eslint/no-unnecessary-condition` comment.
  Extracts the `PopstateTransitionOptions` type into `shared/browser-env` so
  it is no longer duplicated inline in `browser-plugin`'s factory.

  No public API changes. Documentation fixes:
  - `ARCHITECTURE.md` removed the non-existent `title?: string` parameter from
    the documented `replaceHistoryState` signature.
  - `README.md` SSR section rewritten — `buildUrl` / `matchUrl` are
    environment-agnostic and work in SSR (the previous text claimed the plugin
    returns "path without base", which was incorrect).
  - New "Navigation Source" section describing `state.context.browser.source`
    (`"navigate"` / `"popstate"`) with the zero-allocation frozen-literal note.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Test-suite hardening and new invariants from audit ([#470](https://github.com/greydragon888/real-router/issues/470))

  Audit follow-up from `packages/browser-plugin/.claude/review-2026-04-22.md`
  (sections 1, 2, 4, 5, 6, 7). No runtime behaviour changes — documentation
  and test coverage only.

  **New property-based invariants (`tests/property/`):**
  - `safeParseUrl` is total — never throws and always returns string-typed
    fields for any input (2000 runs).
  - `safeParseUrl` scheme-less path input partitions exactly into
    `pathname + search + hash`.
  - `extractPath` is idempotent with an empty base.
  - `buildUrl` always starts with `base` (or `/` when base is empty).
  - `buildUrl` composes with `extractPath` for leading-slash paths:
    `extractPath(buildUrl(p, b), b) === p`.
  - `normalizeBase` is idempotent — `normalizeBase(normalizeBase(x)) === normalizeBase(x)`.
  - `normalizeBase` produces canonical form — empty or leading-slash, no
    trailing slash, no `//` runs.
  - `shouldReplaceHistory` truth-table covers all `replace × reload × fromState`
    combinations (1000 runs).

  **Generator improvements:**
  - `arbNormalizedBase` now includes a generator for deep-nested bases
    (2–5 segments) in addition to the curated fixed list.
  - `arbQueryString` mixes three value shapes: alphanumeric, percent-encoded,
    and empty (`?key=`).

  **New stress scenarios (`tests/stress/`):**
  - `buildurl-allocation.stress.ts` (B7.8) — 10 000 `router.buildUrl()` calls
    keep heap growth under a generous ceiling (catches closure / memoization
    leaks on the per-render hot path).
  - `popstate-during-recovery.stress.ts` (B7.7) — 100 interleaved popstate
    bursts arriving during CANNOT_DEACTIVATE recovery rollback. Verifies the
    deferred queue absorbs them, no plugin-level `Critical error`/`Failed to
recover` logs fire, and a fresh navigation still settles afterwards.

  **Functional assertion upgrades:**
  - `lifecycle.test.ts` — new test documents the gotcha "explicit `replace:
false` on first navigation → push" with a `pushSpy.toHaveBeenCalledTimes(1)`
    assertion.
  - `popstate.test.ts` null-state test asserts the current state is unchanged
    (or settles on UNKNOWN_ROUTE), and the meta-params edge case asserts
    stray root-level `meta` does not leak into `state.params`.
  - `integration.test.ts` state-modifier test replaces the weak
    `toBeGreaterThan(0)` with a lower-bound + last-entry assertion.
  - `security.test.ts` function/symbol param tests replaced the tautological
    `toBeDefined() + typeof string` with a concrete expected URL.
  - `compat.test.ts` SSR block gets a warn-once verification — running start +
    4 navigations produces at most 2 SSR warnings (one per warnOnce closure
    inside `createSafeBrowser`), not N.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Test-suite hardening + documentation cleanup from audit ([#470](https://github.com/greydragon888/real-router/issues/470))

  Audit follow-up — Priority 2 (documentation) and Priority 3 (tests) items
  from `packages/browser-plugin/.claude/review-2026-04-17.md`.

  **Documentation:**
  - Replaced 3 dead links to `../browser-env/ARCHITECTURE.md` (no such
    package — only `shared/browser-env/`) with concrete file references
    inside `shared/browser-env/`.
  - `Performance` table in `ARCHITECTURE.md` extended with the hot-path
    optimisations applied in the previous changeset (`FROZEN_POPSTATE`/
    `FROZEN_NAVIGATE` constants, mutable `historyState` buffer via
    `createUpdateBrowserState`, memoised `getLocation`, `buildUrl`
    shortcut against `toState.path`).
  - `Plugin Lifecycle` / `Factory Pattern` / data-flow sections rewritten
    to match the post-class structure (`createBrowserPlugin` function +
    `createDefaultBrowser` instead of `class BrowserPlugin`).

  **Tests:**
  - Replaced weak `expect(state).toBeDefined()` pre-checks with
    `expect(state?.<field>).toBe(<concrete value>)` across the property
    suite (`browserPlugin.properties.ts`) and 4 functional files
    (`lifecycle.test.ts`, `url.test.ts`, `compat.test.ts`,
    `integration.test.ts`). `expect(getState()).toBeDefined()` etc.
    replaced with the actual expected route name.
  - New `expectedStressError` helper in `tests/stress/helpers.ts`
    whitelists only `SAME_STATES`, `TRANSITION_CANCELLED`,
    `ROUTE_NOT_FOUND`, `ROUTER_NOT_STARTED`. All 21 `.catch(noop)` calls
    in the 5 existing stress files now use it — any other RouterError code
    or non-RouterError surfaces as a real test failure instead of being
    silently swallowed.
  - `integration.test.ts` "browser plugin works when other plugins throw on
    start" now also asserts `currentHistoryState` after `start()` and
    after a subsequent `navigate()` — proving the plugin keeps writing
    history state, not just that `start()` resolves.
  - New functional test in `popstate.test.ts` covers the real
    CANNOT_DEACTIVATE recovery path: a deactivate-guard blocks a popstate
    back-navigation, and the plugin restores the URL via `replaceState`
    with the previous state. Closes the gap noted in §4 of the audit
    ("gotcha promised but not actually tested").
  - Five new stress files for previously missing scenarios: - `replace-vs-navigate.stress.ts` — race between
    `replaceHistoryState` and concurrent `navigate()`. - `heap-snapshot.stress.ts` — 10 000 navigations with
    `process.memoryUsage().heapUsed` delta < 50 MiB (uses `--expose-gc`
    already enabled in `vitest.config.stress.mts`). - `factory-instance-cleanup.stress.ts` — 100 routers built from one
    factory, asserts net-zero `addEventListener`/`removeEventListener
("popstate")` after teardown. - `mixed-async-guards.stress.ts` — sync / 10ms / 200ms guards on
    different routes, 200 navigations, no wedge / no `console.error`. - `exotic-state.stress.ts` — 1000 popstate events with
    `Map`/`Date`/Symbol-keyed/closure values; `isStateStrict` must
    filter all of them.

  No public API changes.

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
