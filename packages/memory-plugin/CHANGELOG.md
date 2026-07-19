# @real-router/memory-plugin

## 0.4.30

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0

## 0.4.29

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source types from `@real-router/core` (was the now-folded `@real-router/types`) ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
  module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
  (wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0

## 0.4.28

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0

## 0.4.27

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.4.26

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.4.25

### Patch Changes

- [#1372](https://github.com/greydragon888/real-router/pull/1372) [`2370788`](https://github.com/greydragon888/real-router/commit/237078894a4d9bbdaca383ed5b8e0abe4cce4de8) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix stack corruption when an async `canActivate` on the back()/go() target races a concurrent `navigate()` ([#1234](https://github.com/greydragon888/real-router/issues/1234))

  [#807](https://github.com/greydragon888/real-router/issues/807) fixed the sync `back(); navigate()` race by consuming `#navigatingFromHistory` on the restore commit, but that consumption is by **timing** ("the first commit after the flag was set"), not **identity**. When the back()/go() target has an async `canActivate` guard, the restore `navigateToState` is in flight and a concurrent `navigate()` cancels it and commits first — its `onTransitionSuccess` steals the flag and records the forward navigate as a phantom history-restore (no push, `direction: "back"`, stale `historyIndex`), while the cancelled restore's `.catch` reverts `#index` past the array, corrupting the stack three ways.

  The restore navigation is now tagged `source: MEMORY_RESTORE` — the same `source` convention the browser/hash URL plugins already use — and the flag is consumed only when the committing navigation carries that tag, attributing it by identity rather than timing. The cancelled `#go`'s `.catch` likewise reverts `#index` only when it is still the optimistic target (a concurrent push has otherwise already re-based it), keeping the stack in bounds for deep `go(-N)` races too. Companion stress `[#1235](https://github.com/greydragon888/real-router/issues/1235)` (async-guard interleave) now locks the invariant.

## 0.4.24

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.4.23

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.4.22

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.4.21

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.4.20

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.4.19

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3), [`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/types@0.39.0

## 0.4.18

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.4.17

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.4.16

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.4.15

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.4.14

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.4.13

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.4.12

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/types@0.38.0

## 0.4.11

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/types@0.37.0

## 0.4.10

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.4.9

### Patch Changes

- [#869](https://github.com/greydragon888/real-router/pull/869) [`ba87793`](https://github.com/greydragon888/real-router/commit/ba8779348b56a83fc3e5a4dd071f8fe515d5c01a) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix a synchronous `navigate()` fired in the same tick as `back()` / `forward()` / `go()` corrupting the in-memory history stack ([#807](https://github.com/greydragon888/real-router/issues/807))

  `back()` / `forward()` / `go()` set an internal `navigatingFromHistory` flag and reset it only in a `.then` microtask, but core commits the history-restore navigation **synchronously**. A `navigate()` issued in the same tick therefore observed the stale flag and was swallowed as a phantom history-restore: the new route was never pushed, `state.context.memory` kept the back/forward `direction` and the old `historyIndex`, and a phantom forward leg survived (`canGoForward()` stayed `true`, `forward()` jumped to a route that no longer matched the router state).

  The flag is now consumed when the restore commit is observed (`onTransitionSuccess`), not in the later microtask, so a same-tick `navigate()` is recorded as a normal push. The fire-and-forget contract and `back()`/`forward()`/`go()` semantics are unchanged; the generation guard still reverts the optimistic index on a guard-blocked or superseded history navigation.

## 0.4.8

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.4.7

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.4.6

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.4.5

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.4.0

### Minor Changes

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - memory-plugin: snapshot semantics for back/forward via api.navigateToState ([#561](https://github.com/greydragon888/real-router/issues/561))

  `#go(delta)` (used by `router.back()` / `router.forward()` / `router.go()`)
  now commits the stored State snapshot via
  `getPluginApi(router).navigateToState(stored, { replace: true })` instead of
  re-resolving via `router.navigate(entry.name, entry.params)`. This closes
  the consistency gap with browser-plugin / hash-plugin / navigation-plugin —
  all four URL-driven plugins now use the same primitive ([#525](https://github.com/greydragon888/real-router/issues/525)).

  **Storage:** `#entries` now holds full `State` objects instead of the
  internal `HistoryEntry { name, params, path }` shape. Memory cost is
  roughly +80 bytes per entry; on the default `maxHistoryLength: 1000`
  budget that is ~80 KB worst case for a saturated buffer. `HistoryEntry`
  was never exported publicly, so no API breakage.

  **Behavior change** (the reason this is `minor`, not `patch`):

  For consumers with non-idempotent dynamic interceptors or routes mutated
  between record and replay, back/forward now commits the snapshot stored
  at original navigation time, not a re-resolved State. Concrete cases:
  - Dynamic `forwardFn` reading mutable state: stored target wins on back.
    Re-evaluation of current world state belongs in `canActivate` guards,
    which still run on every replay.
  - `routes.update()` / `routes.replace()` between record and replay: the
    stored entry is immune to post-recording mutations. If the route was
    removed, `navigateToState` rejects with `ROUTE_NOT_FOUND` and `#go`'s
    reject handler reverts `#index`.
  - `defaultParams` callbacks reading mutable state: stored params win.
  - `buildPath` interceptors do NOT re-fire on back/forward (matches the
    contract URL plugins already follow post-[#525](https://github.com/greydragon888/real-router/issues/525)).

  **Migration:** consumers who relied on re-resolve semantics — likely
  empty set — can opt back into re-resolve explicitly:

  ```ts
  const current = router.getState();
  await router.navigate(current.name, current.params, { force: true });
  ```

  Inherited from [#525](https://github.com/greydragon888/real-router/issues/525): 5–20% perf reduction per `back()` / `forward()`
  (skipped `forwardState` + `buildPath` round-trip in `buildNavigateState`).

  Same-path short-circuit (`entry.path === currentState?.path → skip
commit, only update direction + historyIndex`, [#508](https://github.com/greydragon888/real-router/issues/508)) is unchanged.

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/types@0.35.0

## 0.3.5

### Patch Changes

- [#516](https://github.com/greydragon888/real-router/pull/516) [`ab189d3`](https://github.com/greydragon888/real-router/commit/ab189d3a1616b7c5d3a638d7a2f1d1f7f98e0dd8) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix lifecycle race between `stop()`/`teardown()` and in-flight `#go()` ([#505](https://github.com/greydragon888/real-router/issues/505))

  Before this fix, calling `router.stop()` or `unsubscribe()` while a
  `back()` / `forward()` / `go(delta)` navigation was still in flight
  could leave plugin state desynchronised.

  **Root cause.** `#go(delta)` updates `#index` optimistically (synchronously)
  and reverts it in the reject-handler of the navigation promise. The
  revert is guarded by the `#goGeneration` counter, so a second `#go` that
  bumps the generation protects its own optimistic update from a stale
  settler. But `onStop` and `teardown` did **not** bump the counter, so a
  settler whose generation was captured before the lifecycle change still
  observed a match and wrote into already-cleared state:

  ```
  router.back();    // #go: #index = 1 (optimistic), navigate("a") in flight
  router.stop();    // #clear(): #entries = [], #index = -1

  // navigate() rejects after stop
  // reject-handler sees #goGeneration === generation → runs revert
  // → this.#index = previousIndex (= 2)
  // Result: #index = 2, #entries.length = 0 — desynced
  ```

  A separate flow-on bug: `#clear()` did not reset `#navigatingFromHistory`
  or `#pendingDirection`, so the flag remained `true` after a stop/start
  cycle and the next `onTransitionSuccess` took the history-restore branch,
  silently skipping the `push` of a new entry.

  **Fix.** Two coordinated changes in `src/plugin.ts`:
  1. **`onStop` and `teardown` bump `#goGeneration`** — in-flight settlers
     see a mismatch and skip both the revert and the `#navigatingFromHistory
= false` reset. Mirrors the existing generation-guard pattern used
     between consecutive `#go` calls.
  2. **`#clear()` resets transient `#go` state** — `#navigatingFromHistory =
false` and `#pendingDirection = "navigate"` so the next lifecycle
     starts clean regardless of whether a settler ran.

  Together these cover both `stop()`/`start()` cycles (HMR, test harnesses)
  and `unsubscribe()` called mid-navigation. Variant (2) from the issue
  (dispose-check in settlers) is **not** needed — generation bump covers
  both lifecycle paths, where variant (2) would only catch `teardown`.

  **Regression tests.** Three new functional tests in
  `tests/functional/plugin.test.ts` under
  `describe("lifecycle race with in-flight #go ([#505](https://github.com/greydragon888/real-router/issues/505))")`:
  - `stop() mid-flight leaves history empty and next navigation records
entry` — exercises both invariants: post-stop geometry is zeroed, and
    the re-start + navigate sequence actually pushes. Fails without either
    half of the fix.
  - `unsubscribe() mid-flight does not desync #index against cleared
entries` — same race for the `teardown` path.
  - `stop() → start() cycle leaves #navigatingFromHistory false even with
no in-flight #go` — sanity check that `#clear()`'s new resets do not
    regress the normal lifecycle.

  Existing stress S3 (`teardown-mid-nav.stress.ts`) continues to pass.

  No public API changes.

## 0.3.4

### Patch Changes

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Hot-path and code-quality cleanup from audit ([#510](https://github.com/greydragon888/real-router/issues/510), [#511](https://github.com/greydragon888/real-router/issues/511))

  Audit follow-up — items from `packages/memory-plugin/.claude/review-2026-04-22.md`:
  - **`MemoryContext` per-call freeze removed (#8c.1):** `#writeMemoryContext` no
    longer wraps the `{ direction, historyIndex }` literal in `Object.freeze()`
    on every successful transition. The freeze was a half-measure — `state.context`
    itself is intentionally **not** frozen by core (`packages/core/src/helpers.ts`),
    so a consumer can already overwrite `state.context.memory = {...}` regardless.
    Immutability is now expressed at the type level: both fields of
    `MemoryContext` are marked `readonly`. Eliminates one freeze (~18ns) per
    successful navigation on the hot path.
  - **`#go(delta)` promise chain flattened (#8c.2):** `.catch().finally()` was
    replaced with `.then(onResolve, onReject)`. The reject handler now performs
    both the `#index` revert and the `#navigatingFromHistory` flag reset, so the
    observable behaviour is unchanged. Saves one promise + one microtask per
    `back()` / `forward()` / `go(delta)` invocation.
  - **Redundant `Number.isFinite` check dropped ([#9](https://github.com/greydragon888/real-router/issues/9).3):** the guard at the top of
    `#go(delta)` simplified from
    `delta === 0 || !Number.isFinite(delta) || !Number.isInteger(delta)` to
    `!Number.isInteger(delta) || delta === 0`. `Number.isInteger` already returns
    `false` for `NaN`, `±Infinity`, fractional values, and non-numbers, so the
    finite-check was redundant. Existing functional tests for `go(NaN)`,
    `go(Infinity)`, `go(-Infinity)`, `go(0.5)`, `go(-1.7)` continue to pass.

  No public API changes. The frozen-context test
  (`tests/functional/plugin.test.ts` — "context.memory is frozen") was updated
  to assert the structural shape via `toStrictEqual` instead of
  `Object.isFrozen`. If your code branches on `Object.isFrozen(state.context.memory)`,
  update it to rely on the `readonly` typing instead.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Test-suite hardening and new invariants from audit ([#511](https://github.com/greydragon888/real-router/issues/511))

  Audit follow-up — items from `packages/memory-plugin/.claude/review-2026-04-22.md`
  (categories 1, 3, 4, 5, 7, 10-13). No runtime behaviour changes — this is
  exclusively documentation and test coverage work.

  **New property-based invariants (`tests/property/`, [#3](https://github.com/greydragon888/real-router/issues/3)/[#6](https://github.com/greydragon888/real-router/issues/6).3):**
  - `direction === 'navigate'` is written for every successful push (including
    the first one from `router.start()`).
  - `maxHistoryLength=1` idempotency: at cap=1, `canGoBack()`/`canGoForward()`
    are always `false` and `historyIndex === 0` regardless of the action sequence.
  - `N × back()` followed by `N × forward()` (for distinct-path pushes without
    guards) returns to the same `path`.
  - Bi-implication `canGoBack() ⇔ state.context.memory.historyIndex > 0` is
    declared but currently `describe.skip`'d with a TODO referencing [#508](https://github.com/greydragon888/real-router/issues/508) — the
    short-circuit branch leaves `context.memory` stale, so the property does not
    hold until [#508](https://github.com/greydragon888/real-router/issues/508) is fixed.

  `INVARIANTS.md` updated with invariants 12-14 and a new "State Context" section.

  **New stress scenarios (`tests/stress/`, [#4](https://github.com/greydragon888/real-router/issues/4)):**
  - `back-then-navigate-race.stress.ts` (S11) — `back()` in flight + immediate
    `navigate()`: verifies the `#navigatingFromHistory` flag does not leak to
    `true` and subsequent pushes still land.
  - `navigate-replace-overlap.stress.ts` (S12) — two concurrent navigations
    (one with an async guard, one with `{ replace: true }`): verifies the
    second supersedes the first and history stays consistent.
  - `memory-leak.stress.ts` (S13) — 1000 `start → navigate × 5 → stop →
unsubscribe` cycles keep heap growth under 25× the baseline; a single
    long-lived router with 10 000 navigations respects `maxHistoryLength=100`
    exactly (final `historyIndex === 99`, 99 back-steps reachable).
  - `maxhistory-1-cap.stress.ts` (S14) — 1000 successful pushes at cap=1 keep
    index at 0; `back()`/`forward()`/`go(±N)` are always no-ops; alternating
    push + replace never grows the stack past 1 entry.

  **Tautological assertions removed ([#5](https://github.com/greydragon888/real-router/issues/5)):**
  - `expect(typeof router.canGoBack()).toBe("boolean")` and variants in
    `concurrent-back-forward.stress.ts`, `generation-guard-async.stress.ts`,
    `stale-entries.stress.ts` replaced with concrete index-range assertions
    via `state.context.memory.historyIndex`.
  - `expect(activations).toBeGreaterThan(0)` in S9.1 tightened to also assert
    an upper bound (`≤ 10`).

  **Property-test generator tuning ([#11](https://github.com/greydragon888/real-router/issues/11), [#12](https://github.com/greydragon888/real-router/issues/12)):**
  - `NUM_RUNS` now scales with CI: `standard` and `async` bump from 100 to 300
    under `process.env.CI`, `lifecycle` from 50 to 100. Local runs unchanged.
  - `arbRouteWithParams` for the `user` route narrowed from `id: 1-100` to
    `id: 1-3` so the shrinker can explore same-id collisions.
  - New `arbActionSequenceLong` (30-100 actions) exported for marathon scenarios.

  **Documentation ([#7](https://github.com/greydragon888/real-router/issues/7), [#10](https://github.com/greydragon888/real-router/issues/10), [#13](https://github.com/greydragon888/real-router/issues/13)):**
  - The functional test "should update index without navigating when back()
    targets same state" was split into two: (a) short-circuit behavior with
    explicit `vi.spyOn(router, "navigate")` + assertion that `navigate` is
    not called, and (b) a separate test for the different-path back() case.
    The short-circuit test includes a TODO comment referencing [#508](https://github.com/greydragon888/real-router/issues/508) to track
    the stale `context.memory` bug.
  - `CLAUDE.md` gotchas about `go(0)`, `go(NaN)`, `go(±Infinity)`, `go(0.5)`
    merged into a single block. The `.catch()`/`.finally()` gotcha reworded to
    match the new `.then(onResolve, onReject)` wiring. A new gotcha documents
    the short-circuit branch and its stale-context limitation ([#508](https://github.com/greydragon888/real-router/issues/508)).
  - Wiki (`memory-plugin.md`) gets a matching "Short-circuit" section.

- [#511](https://github.com/greydragon888/real-router/pull/511) [`12f81b4`](https://github.com/greydragon888/real-router/commit/12f81b4daeaef26e443d3ab9ad5b2cf491583d15) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix stale `state.context.memory` after short-circuit `back()`/`forward()` ([#508](https://github.com/greydragon888/real-router/issues/508))

  When `back(-1)` or `forward(+1)` lands on a history entry whose `path` equals the current router state path (e.g. history `[home, home]` after a `replace`), `#go(delta)` previously updated `#index` synchronously but left `state.context.memory` unchanged — so `direction` and `historyIndex` reflected the last full transition, not the short-circuit move. UI code relying on `direction` for animation saw stale data, and the bi-implication `canGoBack() ⇔ state.context.memory.historyIndex > 0` broke on those entries.

  The short-circuit branch now rewrites `state.context.memory` in place with the new `historyIndex` and `direction` (`"back"` or `"forward"`). The state object identity is preserved (no full transition), but subscribers observe the correct direction signal. The previously skipped property-based test for the `canGoBack ⇔ historyIndex > 0` bi-implication has been re-enabled.

## 0.3.3

### Patch Changes

- [#491](https://github.com/greydragon888/real-router/pull/491) [`d4678ca`](https://github.com/greydragon888/real-router/commit/d4678ca1855faed40eb110dbbd45eecaba791710) Thanks [@greydragon888](https://github.com/greydragon888)! - Document `MemoryPluginOptions.maxHistoryLength` ([#490](https://github.com/greydragon888/real-router/issues/490))

  Added inline JSDoc for `maxHistoryLength` covering the `0 = unlimited`
  sentinel, the rejected values (negatives, `NaN`, `±Infinity`, fractions),
  and the default (`1000`). The behavior was previously documented only
  in the package's CLAUDE.md.

- Updated dependencies [[`d4678ca`](https://github.com/greydragon888/real-router/commit/d4678ca1855faed40eb110dbbd45eecaba791710), [`d4678ca`](https://github.com/greydragon888/real-router/commit/d4678ca1855faed40eb110dbbd45eecaba791710)]:
  - @real-router/types@0.34.1

## 0.3.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.3.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden input validation and teardown ([#470](https://github.com/greydragon888/real-router/issues/470))

  **Input validation**
  - `memoryPluginFactory({ maxHistoryLength: NaN })`, `Infinity`, or `0.5` now throw at factory time. Previously these slipped through the `typeof === "number"` check and caused subtle history corruption at runtime.
  - `router.go(delta)` now silently returns when `delta` is `NaN`, `Infinity`, or a non-integer (in addition to the existing `delta === 0` short-circuit). Previously non-finite deltas propagated into the history index and produced stuck or out-of-range state.

  **Teardown**
  - `teardown()` is now idempotent via a `#disposed` flag. Double-dispose scenarios (e.g., `router.dispose()` after user-level `unsubscribe()`, or vice versa) no longer double-release the context namespace claim.

  **Internal**
  - Extracted `#writeMemoryContext(toState, direction)` helper — dedupes the two `claim.write(...)` sites in `onTransitionSuccess`.
  - `this.#entries.splice(this.#index + 1)` replaced with `this.#entries.length = this.#index + 1` for cheaper truncation on every forward navigation that invalidates the future.

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

## 0.1.3

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.1.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

## 0.1.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

## 0.1.0

### Minor Changes

- [#410](https://github.com/greydragon888/real-router/pull/410) [`546706b`](https://github.com/greydragon888/real-router/commit/546706b65af2ba9f46ad33666fada7e6a58ca6f3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix index desync when guard blocks back/forward navigation ([#294](https://github.com/greydragon888/real-router/issues/294))

  `#go(delta)` no longer leaves `#index` out of sync when a guard blocks navigation — `canGoBack()`/`canGoForward()` always reflect the actual router state. Also adds early return for `go(0)`.

  > **Historical note:** a follow-up commit switched the implementation to optimistic-update-with-revert: `#index` is updated synchronously and reverted in the reject handler of the `.then(onResolve, onReject)` navigation promise. `canGoBack()`/`canGoForward()` reflect the **intended target** while navigation is in flight and revert on guard rejection. See `ARCHITECTURE.md` for the current design.
