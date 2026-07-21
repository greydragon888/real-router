# @real-router/sources

## 0.12.4

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0

## 0.12.3

### Patch Changes

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0

## 0.12.2

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0

## 0.12.1

### Patch Changes

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0
  - @real-router/route-utils@0.3.0

## 0.12.0

### Minor Changes

- [#1506](https://github.com/greydragon888/real-router/pull/1506) [`fb55d10`](https://github.com/greydragon888/real-router/commit/fb55d10215a73eff485fa29f4ea6b776b2fcd12c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createRouteEnterGate()` and `guardLeaveListener()` — the framework-agnostic route-enter/exit window-guard primitives shared by every adapter ([#1435](https://github.com/greydragon888/real-router/issues/1435)).

  - `createRouteEnterGate()` returns a stateful decision closure owning the canonical enter-guard set (skip-initial, same-route, StrictMode dedupe, and the `!previousRoute` non-nullable-contract guard). `skipSameRoute` is a per-call argument so a React ref-held gate survives StrictMode effect re-runs without resetting its dedupe state.
  - `guardLeaveListener(handler, { skipSameRoute? })` returns a core `subscribeLeave` listener owning the same-route + reentrant-abort guards and passing the handler's Promise through (so it blocks the transition).

  Both consume only `State` / `AbortSignal` — zero framework types.

## 0.11.5

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0

## 0.11.4

### Patch Changes

- [#1494](https://github.com/greydragon888/real-router/pull/1494) [`996a6da`](https://github.com/greydragon888/real-router/commit/996a6daf9a7092ea1b9878d245d663cbac8f265e) Thanks [@greydragon888](https://github.com/greydragon888)! - Unwind partially-registered listeners in createTransitionSource / createErrorSource ([#1440](https://github.com/greydragon888/real-router/issues/1440))

  Both factories registered their event listeners in a single array literal. If `api.addEventListener` threw mid-registration (the emitter rejects a duplicate listener or hits its maxListeners cap), the already-registered listeners leaked and pinned the router, and the never-assigned `unsubs` binding left the half-wired source undestroyable (TDZ on the onDestroy closure). Registration now happens one-by-one inside a try/catch that unwinds the already-registered listeners and rethrows — mirroring `@real-router/rx`'s `events$` partial-registration safety — with `unsubs` declared before the source so its onDestroy closure never hits the TDZ. Normal (non-throwing) construction is unchanged.

## 0.11.3

### Patch Changes

- [#1482](https://github.com/greydragon888/real-router/pull/1482) [`07a3901`](https://github.com/greydragon888/real-router/commit/07a39019f25e6b759d36e350875f586f0ce62ae5) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden `createActiveNameSelector` per-name recompute against a latent [#767](https://github.com/greydragon888/real-router/issues/767)-analog ([#1478](https://github.com/greydragon888/real-router/issues/1478))

  The shared `router.subscribe` fan-out recomputes each name's active state (`areRoutesRelated` / `isActiveNonStrict`) outside the per-listener `try`. A throwing recompute for one name would unwind the whole callback, skipping every later name's diff/notify and leaving their active state stale — structurally the [#767](https://github.com/greydragon888/real-router/issues/767) failure mode one level up. Each name's processing is now isolated in its own `try` (re-throwing asynchronously, mirroring the per-listener guard), so the [#767](https://github.com/greydragon888/real-router/issues/767) invariant stays robust against a future param-aware / predicate recompute. No behavior change for valid routers — the recompute cannot throw today (`getState` is a frozen-field read; the rest is pure string ops).

## 0.11.2

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.11.1

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.11.0

### Minor Changes

- [#1424](https://github.com/greydragon888/real-router/pull/1424) [`de242f5`](https://github.com/greydragon888/real-router/commit/de242f5b0178a574c0d3edc8cb29769931bc3f85) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(sources): add `createActiveSource` — the shared fast/slow active-source builder ([#1416](https://github.com/greydragon888/real-router/issues/1416))

  Promotes the framework-agnostic fast/slow decision for an adapter `<Link>`'s
  active-route source into `@real-router/sources`, where it belongs (it uses only
  `createActiveNameSelector` + `createActiveRouteSource`). A default-options link
  (non-empty `routeName`, no custom params, non-strict, query-ignoring, no hash)
  shares the per-router `createActiveNameSelector` (one subscription for any number
  of distinct-name links); anything else falls to the per-link
  `createActiveRouteSource`. Adapter Links (vue `<Link>`, angular `RealLink` /
  `RealLinkActive`) now route through this one builder instead of each keeping a
  copy — one source of truth for the decision + the `routeName !== ""` guard,
  closing the drift that produced [#1416](https://github.com/greydragon888/real-router/issues/1416).

## 0.10.15

### Patch Changes

- [#1382](https://github.com/greydragon888/real-router/pull/1382) [`3cfa3e8`](https://github.com/greydragon888/real-router/commit/3cfa3e8514799f4f70c6323d7a4d5157baf0ed22) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix: `createActiveNameSelector` stale-generation unsubscribe no longer orphans a live subscriber ([#1206](https://github.com/greydragon888/real-router/issues/1206)), + selector listener-isolation property ([#1208](https://github.com/greydragon888/real-router/issues/1208) §4.3)

  Duplicate `(name, callback)` subscriptions produce N unsubscribe closures over a single deduped `Set`. After that generation is fully torn down and a later `subscribe` re-creates the name (a fresh `Set`), a stale closure's teardown deleted the LIVE generation's map entry — the empty stale `Set` tripped `size === 0`, so `listenersByName.delete(name)` removed the new `Set` and `disconnect()` dropped the shared router subscription, leaving the live subscriber permanently deaf. The unsubscribe closure now bails when `listenersByName.get(name)` is no longer the `Set` it captured (identity, not truthiness).

  Also closes the [#1208](https://github.com/greydragon888/real-router/issues/1208) §4.3 property gap: the selector's per-listener exception isolation ([#767](https://github.com/greydragon888/real-router/issues/767)) was killed only by a unit test and survived the entire property suite. Added a property that fails when the `try/catch` is removed, plus the `[#1206](https://github.com/greydragon888/real-router/issues/1206)` no-orphan property and two new INVARIANTS rows.

## 0.10.14

### Patch Changes

- [#1375](https://github.com/greydragon888/real-router/pull/1375) [`5afb563`](https://github.com/greydragon888/real-router/commit/5afb56364b0a943dbfc8e9b48f92bc466fc0ea62) Thanks [@greydragon888](https://github.com/greydragon888)! - Docs: correct `hash: ""` active-state semantics in `ActiveRouteSourceOptions` JSDoc + sync package docs ([#1208](https://github.com/greydragon888/real-router/issues/1208))

  The `ActiveRouteSourceOptions.hash` JSDoc — which ships into `.d.ts` and IDE tooltips — mis-stated the no-URL-plugin case. Under hash-plugin / memory-plugin the source collapses the missing `context.url` namespace to `""`, so a **non-empty** `hash` is always `false` while `hash: ""` still matches an active route ("no namespace" reads as "no fragment", [#532](https://github.com/greydragon888/real-router/issues/532)). Corrected the tooltip JSDoc (and the CLAUDE.md / README.md twins). No behavior change — this aligns the docs with existing, probe-verified behavior.

  Also synced the repo docs with the current suite: added the reconnect-reconcile / lazy-connection / catch-up invariants ([#765](https://github.com/greydragon888/real-router/issues/765)/[#766](https://github.com/greydragon888/real-router/issues/766)) to INVARIANTS.md with corrected Test Files counters (routeSource 22, activeRouteSource 19, createDismissableError 7), fixed the ARCHITECTURE.md reconnect-reconcile credit + 5-component cache key, and documented the public `primeErrorSource` export (with the "errors before the first subscriber surface on the promise, not the source" limitation, [#1215](https://github.com/greydragon888/real-router/issues/1215)) in README.

## 0.10.13

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.10.12

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.10.11

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.10.10

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.10.9

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.10.8

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0
  - @real-router/route-utils@0.2.7

## 0.10.7

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.10.6

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.10.5

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.10.4

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.10.3

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.10.2

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/route-utils@0.2.5

## 0.10.0

### Minor Changes

- [#1022](https://github.com/greydragon888/real-router/pull/1022) [`e458bbb`](https://github.com/greydragon888/real-router/commit/e458bbbb9cc622b944c45c800e65bf93d6048849) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(sources): add `primeErrorSource(router)` — tolerant eager error-source priming ([#778](https://github.com/greydragon888/real-router/issues/778))

  `primeErrorSource(router)` eagerly creates (and subscribes) the per-router error source when the router supports the plugin API, and is a no-op otherwise. Framework adapters' `RouterProvider` call it at mount so a navigation error that fires before a `RouterErrorBoundary` mounts is still captured — without crashing on a router-like that has no internals-registry entry (a test stub, an `Object.create`-derived object). `getErrorSource` stays strict (throws for an invalid router); `primeErrorSource` is the don't-crash-the-Provider wrapper the boundary-pre-mount-error fix relies on.

## 0.9.0

### Minor Changes

- [#1017](https://github.com/greydragon888/real-router/pull/1017) [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(sources): make createActiveRouteSource lazy to close the listener-limit crash ([#766](https://github.com/greydragon888/real-router/issues/766))

  `createActiveRouteSource` previously connected to the router **eagerly** at construction and cached every distinct `(name | params | options)` key with a no-op `destroy()`, so each unique key held a permanent `router.subscribe` handle that survived all Link unmounts. A long-lived router with per-item-params Links (infinite feed, virtualized table, pagination by id) accumulated handles until the `EventEmitter` listener limit (10000) threw in the render path.

  It now uses the **lazy connection** the docs already promised: subscribe on the first listener, disconnect on the last, reconcile the snapshot on re-subscribe (same pattern as `createRouteNodeSource` / [#765](https://github.com/greydragon888/real-router/issues/765)). The cache entry stays (a cheap closure) but holds no router subscription while it has zero listeners — unmounted Links stop costing a listener, and creating an unbounded number of unique keys no longer crashes.

  **BREAKING:** the snapshot no longer updates while the source has zero subscribers (the previously-undocumented eager behaviour). Consumers that read `getSnapshot()` without subscribing must subscribe first; framework adapters (which bridge via `useSyncExternalStore` / signals) are unaffected.

### Patch Changes

- [#1017](https://github.com/greydragon888/real-router/pull/1017) [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(sources): isolate listener exceptions in createActiveNameSelector ([#767](https://github.com/greydragon888/real-router/issues/767))

  `createActiveNameSelector`'s notification loop had no per-listener exception isolation: a single throwing listener aborted notifications to the remaining listeners of the same route name AND every later name in the iteration, leaving their cached active state stale (a sibling `Link`'s active class frozen until the next related navigation). The loop now wraps each `listener()` in `try/catch` and re-throws asynchronously via `queueMicrotask` — mirroring `BaseSource.notify` (INVARIANTS "BaseSource 3"). One broken Link no longer freezes its siblings.

- [#1017](https://github.com/greydragon888/real-router/pull/1017) [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(sources): freeze INITIAL_SNAPSHOT + docs cleanup ([#768](https://github.com/greydragon888/real-router/issues/768))

  `createErrorSource`'s shared `INITIAL_SNAPSHOT` singleton (returned by every error source until the first error) is now `Object.freeze`d — mirroring `createTransitionSource`'s frozen `IDLE_SNAPSHOT` — so a consumer can no longer mutate it and corrupt the shared singleton for every error source of every router. Plus documentation fixes: INVARIANTS "Cache Identity 3" now states the hash-aware contract precisely (non-empty hash → `false`; `hash: ""` → `true` under no URL plugin), the ARCHITECTURE filtering-pipeline diagram shows the `hashFlip` pre-filter branch ([#532](https://github.com/greydragon888/real-router/issues/532)), the `canonicalJson` JSDoc notes the `Date` ↔ ISO-string cache-key collision, and a stale `createRouteSource` test comment is corrected.

- [#1017](https://github.com/greydragon888/real-router/pull/1017) [`ae58937`](https://github.com/greydragon888/real-router/commit/ae5893744e103794d0aca15e3bdf7da32e1552e7) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(sources): reconcile lazy sources on reconnect — missed navigations/errors are caught up on re-subscribe ([#765](https://github.com/greydragon888/real-router/issues/765))

  `createRouteSource` now reconciles its snapshot with the current router state on first subscribe — previously only `createRouteNodeSource` did — so a navigation that lands while the source has **zero subscribers** (a `RouterProvider` under a React `<Activity>` hide→navigate→show cycle, or all `.current` readers gated behind a Svelte `{#if}`) is caught up on re-subscribe instead of replaying a stale route. The reconcile fires only when the route actually changed (no spurious re-render on a no-nav hide/show); `previousRoute` resets to `undefined` on catch-up, since the real previous route can't be reconstructed outside a live subscribe payload. `createDismissableError` likewise catches up on first subscribe, so a `RouterErrorBoundary` mounting after a boot-time navigation error now observes it.

## 0.8.10

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/route-utils@0.2.4

## 0.8.9

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.8.8

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.8.7

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.8.6

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.8.5

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/route-utils@0.2.3

## 0.8.4

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.8.3

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.8.2

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.8.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.8.0

### Minor Changes

- [#567](https://github.com/greydragon888/real-router/pull/567) [`e8f4a5c`](https://github.com/greydragon888/real-router/commit/e8f4a5c578f1094059d500b0f44ddd7ce788c534) Thanks [@greydragon888](https://github.com/greydragon888)! - `createActiveRouteSource` accepts optional `hash` to compute hash-aware active state ([#532](https://github.com/greydragon888/real-router/issues/532))

  `ActiveRouteSourceOptions` gains an optional `hash` field. When defined, the
  source treats a route as active iff:
  1. `router.isActiveRoute(name, params, strict, ignoreQueryParams)` returns
     `true`, AND
  2. `state.context.url.hash` (decoded, populated by the URL plugins) equals
     the requested fragment exactly.

  The cache key now includes `hash`, so a Link pointing to `/settings#account`
  shares its source only with consumers using the same routeName + params +
  hash. Sources with `hash === undefined` retain the legacy route-only active
  semantics — no behavior change for callers that don't pass the new option.

  Hash-plugin runtimes leave `state.context.url` undefined, so any non-undefined
  `hash` option produces `false` there — consistent with the documented
  limitation that hash-plugin doesn't support URL fragments.

  This unlocks tab-style UI in `<Link hash>` across all six framework adapters:
  the matching variant lights up `activeClassName="active"` automatically, no
  manual workaround needed.

  `stabilizeState` (used by `createRouteSource`) now also compares
  `state.context.url.hash`. Previously it short-circuited on `path` only — so
  `useRoute()` consumers would not re-render on same-path-different-hash
  transitions (the hash flipped in the URL, but the rendered tab content
  stayed stale). Treating hash as render identity fixes tab-style UIs that
  subscribe via `useRoute()` instead of (or in addition to) `<Link>`'s
  hash-aware active state.

## 0.7.3

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/route-utils@0.2.2

## 0.7.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.7.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add optional generic parameter to `RouteSnapshot<P>` / `RouteNodeSnapshot<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  Both snapshot types now accept an optional generic for typed `route.params`, defaulting to `Params` for full backward compatibility. Enables adapter-level propagation in `injectRoute<P>()` and similar hooks without a framework-specific snapshot shape.

## 0.6.0

### Minor Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - feat: add `createActiveNameSelector(router)` — per-router cached O(1) active-name checker ([#467](https://github.com/greydragon888/real-router/issues/467))

  One shared `router.subscribe` handle across any number of distinct route-name consumers (vs one subscription per name via `createActiveRouteSource`). Framework adapters can adopt this for `Link` fast-paths when params/strict/ignoreQueryParams are at defaults. Based on the `routeSelector` pattern from `@real-router/solid`, now available framework-agnostic.

  API: `{ subscribe(routeName, listener), isActive(routeName), destroy }`. New `ActiveNameSelector` type exported.

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - feat: per-router caching for all sources + helpers for adapters ([#467](https://github.com/greydragon888/real-router/issues/467))
  - `getErrorSource(router)` and `getTransitionSource(router)` — cached factories for shared eager sources. Multiple consumers (mount/unmount cycles) reuse one instance; external `destroy()` is a no-op on the cached wrapper, so adapters with eager teardown (Angular `sourceToSignal`) are safe by default.
  - `createRouteNodeSource(router, nodeName)` now caches per `(router, nodeName)` pair — N consumers of the same node share one router subscription instead of creating N.
  - `createActiveRouteSource(router, name, params?, options?)` now caches per `(router, name, canonicalJson(params), options)`. Key-order-insensitive (`{ a:1, b:2 }` and `{ b:2, a:1 }` hit the same entry). `Symbol`/`BigInt` params fall back to creating a fresh uncached source.
  - New exports: `DEFAULT_ACTIVE_OPTIONS`, `normalizeActiveOptions(opts?)`, `canonicalJson(value)`.
  - Removed internal `shouldUpdateCache` helper — `createRouteNodeSource` now caches the `shouldUpdateNode` closure itself as part of the source cache.

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - feat: add `createDismissableError(router)` — per-router cached source wrapping `getErrorSource` with integrated dismissed-version state ([#467](https://github.com/greydragon888/real-router/issues/467))

  Consolidates the `dismissedVersion`/`visibleError`/`resetError` pattern that was duplicated across all 6 `RouterErrorBoundary` adapters. Snapshot shape: `{ error, toRoute, fromRoute, version, resetError }`. `destroy()` is a no-op (cached wrapper). New `DismissableErrorSnapshot` type exported.

## 0.5.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/route-utils@0.2.1

## 0.5.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/route-utils@0.2.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/route-utils@0.1.14

## 0.4.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13

## 0.4.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12

## 0.4.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - @real-router/route-utils@0.1.11

## 0.4.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `isLeaveApproved` to `RouterTransitionSnapshot` ([#391](https://github.com/greydragon888/real-router/issues/391))

  `RouterTransitionSnapshot` now includes `isLeaveApproved: boolean` field.
  Enables direction-aware exit animations via `useRouterTransition()` in all framework adapters.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/route-utils@0.1.10

## 0.3.3

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9

## 0.3.2

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - @real-router/route-utils@0.1.8

## 0.3.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - @real-router/route-utils@0.1.7

## 0.3.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createErrorSource` factory for navigation error tracking ([#366](https://github.com/greydragon888/real-router/issues/366))

  New eager-subscription source that tracks `TRANSITION_ERROR` events. Provides `RouterErrorSnapshot` with `error`, `toRoute`, `fromRoute`, and `version` fields. Resets on `TRANSITION_SUCCESS`. Skips update when no error exists (avoids unnecessary re-renders).

## 0.2.8

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `stabilizeState` to prevent unnecessary re-renders across all frameworks ([#339](https://github.com/greydragon888/real-router/issues/339))

  Path-based State reference stabilization: when `prev.path === next.path`, returns the previous State reference instead of creating a new snapshot. O(1) string comparison — no recursive object traversal.

  Integrated into `computeSnapshot`, `createRouteSource`, and `createTransitionSource`. Guards before `updateSnapshot` prevent unnecessary listener notifications.

- Updated dependencies [[`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e)]:
  - @real-router/core@0.40.1

## 0.2.7

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

## 0.2.6

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - @real-router/route-utils@0.1.6

## 0.2.5

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

## 0.2.4

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, source factories table with lazy/eager info, transition tracking example. ARCHITECTURE: added `createTransitionSource` to codemap, types, and test coverage list.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0
  - @real-router/route-utils@0.1.5

## 0.2.3

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

## 0.2.2

### Patch Changes

- [#301](https://github.com/greydragon888/real-router/pull/301) [`830df9a`](https://github.com/greydragon888/real-router/commit/830df9ade36273df81acaef74926c7f4e9eacc0b) Thanks [@greydragon888](https://github.com/greydragon888)! - Deduplicate all source implementations via `BaseSource` composition ([#287](https://github.com/greydragon888/real-router/issues/287))

  Replaced all 4 wrapper classes (`RouteSource`, `RouteNodeSource`, `ActiveRouteSource`, `TransitionSource`) with factory functions that compose `BaseSource` directly. Added `onFirstSubscribe`/`onLastUnsubscribe`/`onDestroy` lifecycle hooks and auto-bound methods to `BaseSource`, eliminating all jscpd-reported code clones in the package.

## 0.2.1

### Patch Changes

- [#276](https://github.com/greydragon888/real-router/pull/276) [`7faf4c2`](https://github.com/greydragon888/real-router/commit/7faf4c24189b7f21c4c309503000e13317ffc01a) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `RouteNodeSource` leaking router subscriptions on unmount ([#270](https://github.com/greydragon888/real-router/issues/270))

  Converted `RouteNodeSource` from eager to lazy-connection pattern: the router subscription is now created on the first listener and removed when the last listener unsubscribes. Snapshot is reconciled with current router state on reconnection to handle Activity hide/show cycles. `destroy()` remains available but is no longer required.

## 0.2.0

### Minor Changes

- [#268](https://github.com/greydragon888/real-router/pull/268) [`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createTransitionSource` for transition lifecycle subscriptions ([#259](https://github.com/greydragon888/real-router/issues/259))

  New source that tracks router transition state (start/success/error/cancel)
  via `getPluginApi().addEventListener()`. Provides `RouterTransitionSnapshot`
  with `isTransitioning`, `toRoute`, and `fromRoute`.

  Dependency change: `@real-router/core` replaces `@real-router/types`.

## 0.1.4

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0
  - @real-router/route-utils@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0
  - @real-router/route-utils@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0
  - @real-router/route-utils@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0
  - @real-router/route-utils@0.1.1

## 0.1.0

### Minor Changes

- [#218](https://github.com/greydragon888/real-router/pull/218) [`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/sources` — framework-agnostic subscription layer for router state (#217)

  Three factory functions for UI adapter authors:
  - `createRouteStore(router)` — subscribe to all navigations
  - `createRouteNodeStore(router, nodeName)` — subscribe to specific route node
  - `createActiveRouteStore(router, routeName, params?, options?)` — track route activity
