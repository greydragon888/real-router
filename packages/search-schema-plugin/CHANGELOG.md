# @real-router/search-schema-plugin

## 0.6.1

### Patch Changes

- Updated dependencies [[`b34ff6c`](https://github.com/greydragon888/real-router/commit/b34ff6cb71fea684105f69839c653e369a0aa6a0)]:
  - @real-router/core@0.125.0

## 0.6.0

### Minor Changes

- [#2096](https://github.com/greydragon888/real-router/pull/2096) [`a859a82`](https://github.com/greydragon888/real-router/commit/a859a82b900124f6ade96e32056a7b9f5828b848) Thanks [@greydragon888](https://github.com/greydragon888)! - The schema now governs `router.buildPath` too ([#2087](https://github.com/greydragon888/real-router/issues/2087))

  Not one line of this package changed. Core's href door runs the `forwardState`
  seam this plugin already registers, so the schema reaches `router.buildPath`
  without a new hook — which reverses a position three of this package's documents
  recorded as deliberate:

  > `buildPath` is a pure URL builder. Validation is a navigation-time concern.

  That held only while the builder printed what navigation prints. With a route
  `defaultSearch` it did not — the href and the click disagreed — and a builder
  that prints a different URL is not one anyone can use. `ARCHITECTURE.md`,
  `CLAUDE.md` and `README.md` now say so, and the four tests that pinned the bypass
  assert the agreement instead.

  **What changes for you.** `router.buildPath(...)` output is now schema-shaped:
  unknown keys are stripped under `strict`, defaults are applied, and transforms
  run. Under `strict` a value the schema rejects no longer reaches the href — it is
  replaced by the route default, or dropped, exactly as it is on `navigate`.

  One channel is still out of reach: `persistent-params-plugin`'s own `buildPath`
  interceptor runs below the merge and after this schema, so a stored value the
  schema rejects can still reach the printed URL. That closes with [#1938](https://github.com/greydragon888/real-router/issues/1938).

### Patch Changes

- Updated dependencies [[`a859a82`](https://github.com/greydragon888/real-router/commit/a859a82b900124f6ade96e32056a7b9f5828b848)]:
  - @real-router/core@0.124.0

## 0.5.43

### Patch Changes

- Updated dependencies [[`0fd94e5`](https://github.com/greydragon888/real-router/commit/0fd94e56611b763280b277063171f57c93b4fc73)]:
  - @real-router/core@0.123.0

## 0.5.42

### Patch Changes

- Updated dependencies [[`75c0ad3`](https://github.com/greydragon888/real-router/commit/75c0ad3bfb5f573e518bf8ac6e18eb4bdbd77dc2), [`75c0ad3`](https://github.com/greydragon888/real-router/commit/75c0ad3bfb5f573e518bf8ac6e18eb4bdbd77dc2)]:
  - @real-router/core@0.122.0

## 0.5.41

### Patch Changes

- Updated dependencies [[`1cff33c`](https://github.com/greydragon888/real-router/commit/1cff33cee5656c264a02ded60a895909d837166f)]:
  - @real-router/core@0.121.0

## 0.5.40

### Patch Changes

- [#2076](https://github.com/greydragon888/real-router/pull/2076) [`5a672d3`](https://github.com/greydragon888/real-router/commit/5a672d314016f9f88e4ccb8f548f9b757dd998f2) Thanks [@greydragon888](https://github.com/greydragon888)! - The plugin's frozen surface reads a captured `Object.freeze` ([#2073](https://github.com/greydragon888/real-router/issues/2073))

  A value this package freezes at RUNTIME was frozen through the live
  `Object.freeze`, so an application that re-pointed the intrinsic after boot got
  back an object that is not frozen at all. It now reads a module-load capture.

  ⚠ Capture narrows the window from "any time after boot" to "before this module
  loads"; a shim evaluated ahead of the router still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)). It is robustness
  against polyfills, instrumentation, extensions and test doubles, not a security
  boundary. Module-scope constants are out of scope by the same argument — they are
  frozen before any application code can run.

- Updated dependencies [[`5a672d3`](https://github.com/greydragon888/real-router/commit/5a672d314016f9f88e4ccb8f548f9b757dd998f2), [`5a672d3`](https://github.com/greydragon888/real-router/commit/5a672d314016f9f88e4ccb8f548f9b757dd998f2)]:
  - @real-router/core@0.120.1

## 0.5.39

### Patch Changes

- Updated dependencies [[`b35222d`](https://github.com/greydragon888/real-router/commit/b35222d062fad5b17c1939f64c685ac7ace27931)]:
  - @real-router/core@0.120.0

## 0.5.38

### Patch Changes

- Updated dependencies [[`9553b9f`](https://github.com/greydragon888/real-router/commit/9553b9f879e4a7d6535b2243bc8e9fbbbc41a9b1)]:
  - @real-router/core@0.119.0

## 0.5.37

> ⚠ **Never published** — there is no `0.5.37` on npm and no git tag for it. The release run that allocated this number never reached the registry; the entries below ship in **0.5.38**.

### Patch Changes

- Updated dependencies [[`c6aff93`](https://github.com/greydragon888/real-router/commit/c6aff93137d7833df2adec104790187ff2d19399)]:
  - @real-router/core@0.118.0

## 0.5.36

### Patch Changes

- Updated dependencies [[`505ec29`](https://github.com/greydragon888/real-router/commit/505ec29c62b5bb80492378e3d12cd89556a6226f)]:
  - @real-router/core@0.117.0

## 0.5.35

### Patch Changes

- Updated dependencies [[`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e), [`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e), [`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e)]:
  - @real-router/core@0.116.0

## 0.5.34

### Patch Changes

- Updated dependencies [[`9134481`](https://github.com/greydragon888/real-router/commit/913448155c181b6f712a9e9d0da4b949d80703a4)]:
  - @real-router/core@0.115.0

## 0.5.33

### Patch Changes

- Updated dependencies [[`fda4b60`](https://github.com/greydragon888/real-router/commit/fda4b60c0fe87b03d45d9058af150ae55d250a4c)]:
  - @real-router/core@0.114.0

## 0.5.32

### Patch Changes

- Updated dependencies [[`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493)]:
  - @real-router/core@0.113.0

## 0.5.31

### Patch Changes

- Updated dependencies [[`96d0400`](https://github.com/greydragon888/real-router/commit/96d0400d823c3aed9d9afc0044ebee663b8669bb)]:
  - @real-router/core@0.112.0

## 0.5.30

### Patch Changes

- Updated dependencies [[`d448814`](https://github.com/greydragon888/real-router/commit/d448814d224c1fb1e6d3288843ea7851a5c253a6)]:
  - @real-router/core@0.111.0

## 0.5.29

### Patch Changes

- Updated dependencies [[`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc)]:
  - @real-router/core@0.110.0

## 0.5.28

### Patch Changes

- [#1995](https://github.com/greydragon888/real-router/pull/1995) [`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195) Thanks [@greydragon888](https://github.com/greydragon888)! - Deciding intrinsics are read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

  6 reads of `Object.keys` / `hasOwn` / `entries` / `values` /
  `getPrototypeOf` in this package went to the live global, where an application
  can re-point them after boot. They are now read once at module load — the
  doctrine `@real-router/core`'s `guards.ts` states, extended across the repository
  by the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971).

  The reads are the plugin's two rebuild loops — `#writeBack`, which reassembles
  `params` and `search` from the validated result, and `omitKeys`. Both BUILD a
  fresh bag from what they enumerate, so a re-pointed `entries` does not let a key
  through unvalidated: it makes the key vanish. The schema runs, reports success,
  and its coerced output reaches neither `state.search` nor the URL — while the
  caller's own untouched keys are dropped alongside it.

  ⚠ **What capture does NOT buy**, stated because the doctrine states it: it
  narrows the window from "any time after boot" to "before the module loads". A
  shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
  This is robustness against polyfills, RUM/APM instrumentation, browser extensions
  and test doubles — not a security boundary, since re-pointing `Object.keys`
  already requires script execution.

  No behaviour change in a healthy environment: an intrinsic nobody touched answers
  the same either way.

- Updated dependencies [[`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195)]:
  - @real-router/core@0.109.2

## 0.5.27

### Patch Changes

- Updated dependencies [[`1ff2fc2`](https://github.com/greydragon888/real-router/commit/1ff2fc24ec85219c894e3886a85808180211ce49)]:
  - @real-router/core@0.109.0

## 0.5.26

### Patch Changes

- Updated dependencies [[`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7)]:
  - @real-router/core@0.108.0

## 0.5.25

### Patch Changes

- Updated dependencies [[`133eb3c`](https://github.com/greydragon888/real-router/commit/133eb3c39c124754c1a400c908cad5eb91e2df60), [`133eb3c`](https://github.com/greydragon888/real-router/commit/133eb3c39c124754c1a400c908cad5eb91e2df60)]:
  - @real-router/core@0.107.0

## 0.5.24

> ⚠ **Never published** — there is no `0.5.24` on npm and no git tag for it. The release run that allocated this number never reached the registry; the entries below ship in **0.5.25**.

### Patch Changes

- Updated dependencies [[`7136e7f`](https://github.com/greydragon888/real-router/commit/7136e7f999560f8a617a7d6c2d1aa6c49c3f89fc)]:
  - @real-router/core@0.106.0

## 0.5.23

### Patch Changes

- Updated dependencies [[`5e7d2d8`](https://github.com/greydragon888/real-router/commit/5e7d2d8e4f2042af8d51797cac9b230437bae39e)]:
  - @real-router/core@0.105.0

## 0.5.22

### Patch Changes

- Updated dependencies [[`71b13c3`](https://github.com/greydragon888/real-router/commit/71b13c3793eea298fdb0606f0a282c5d7a77b1c4), [`71b13c3`](https://github.com/greydragon888/real-router/commit/71b13c3793eea298fdb0606f0a282c5d7a77b1c4)]:
  - @real-router/core@0.104.0

## 0.5.21

### Patch Changes

- Updated dependencies [[`aa9d6a7`](https://github.com/greydragon888/real-router/commit/aa9d6a75331609d8ff8cabf814af4ff9bd7076d6), [`aa9d6a7`](https://github.com/greydragon888/real-router/commit/aa9d6a75331609d8ff8cabf814af4ff9bd7076d6)]:
  - @real-router/core@0.103.0

## 0.5.20

### Patch Changes

- Updated dependencies [[`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038), [`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038)]:
  - @real-router/core@0.102.0

## 0.5.19

### Patch Changes

- Updated dependencies [[`7f24406`](https://github.com/greydragon888/real-router/commit/7f24406ac163810e616bf6fa0960478af2fea10b)]:
  - @real-router/core@0.101.0

## 0.5.18

### Patch Changes

- [#1905](https://github.com/greydragon888/real-router/pull/1905) [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855) Thanks [@greydragon888](https://github.com/greydragon888)! - A validated schema result no longer disappears between the plugin and the URL ([#1852](https://github.com/greydragon888/real-router/issues/1852))

  The plugin rebuilds `params` and `search` key by key with `dst[key] = value`,
  under names taken from the route and from the caller's state. That is `[[Set]]`,
  so an accessor on `Object.prototype` under one of those names took the write.
  Measured on `/users/:id`:

  - a getter-only or non-writable property REJECTED the navigation outright;
  - a getter+setter pair lost the path slot silently and left core reporting
    `[SegmentMatcher.buildPath] Missing required param 'id'` about a value the
    caller had supplied;
  - on the query side the schema ran, reported success, and its output reached
    neither `state.search` nor the printed URL.

  `omitKeys` (`helpers.ts`) was the first site any non-path key reached and was
  not in the original sweep — found by probing each write rather than reasoning
  from the one that was reported. All four now use `putField` from
  `@real-router/core/utils`.

  Part of [#1901](https://github.com/greydragon888/real-router/issues/1901).

- Updated dependencies [[`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855)]:
  - @real-router/core@0.100.0

## 0.5.17

### Patch Changes

- Updated dependencies [[`e093c82`](https://github.com/greydragon888/real-router/commit/e093c82931ab92ae0651b482e52d12e797265966)]:
  - @real-router/core@0.99.0

## 0.5.16

### Patch Changes

- Updated dependencies [[`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2)]:
  - @real-router/core@0.98.0

## 0.5.15

### Patch Changes

- Updated dependencies [[`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759), [`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759)]:
  - @real-router/core@0.97.0

## 0.5.14

### Patch Changes

- Updated dependencies [[`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c)]:
  - @real-router/core@0.96.0

## 0.5.13

### Patch Changes

- Updated dependencies [[`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93)]:
  - @real-router/core@0.95.0

## 0.5.12

### Patch Changes

- Updated dependencies [[`38d4059`](https://github.com/greydragon888/real-router/commit/38d40595953c5bb09e4158f28ca3e821ed93e3f8)]:
  - @real-router/core@0.94.0

## 0.5.11

### Patch Changes

- Updated dependencies [[`52c8108`](https://github.com/greydragon888/real-router/commit/52c81087cb09adcca8951ca6d06e2aa18336b1c2)]:
  - @real-router/core@0.93.0

## 0.5.10

### Patch Changes

- Updated dependencies [[`11f22b1`](https://github.com/greydragon888/real-router/commit/11f22b1d161b8d3c1bc8a676f0e01cbdeb2febc7)]:
  - @real-router/core@0.92.0

## 0.5.9

### Patch Changes

- Updated dependencies [[`69beff3`](https://github.com/greydragon888/real-router/commit/69beff3f6b2c0f4348a71366be113ea2a05c5936)]:
  - @real-router/core@0.91.0

## 0.5.8

### Patch Changes

- Updated dependencies [[`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a)]:
  - @real-router/core@0.90.0

## 0.5.7

### Patch Changes

- Updated dependencies [[`76a4dfb`](https://github.com/greydragon888/real-router/commit/76a4dfb4337bfc46a24ac0aac45819484d171992)]:
  - @real-router/core@0.89.0

## 0.5.6

### Patch Changes

- Updated dependencies [[`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161)]:
  - @real-router/core@0.88.0

## 0.5.5

### Patch Changes

- Updated dependencies [[`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084)]:
  - @real-router/core@0.87.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a)]:
  - @real-router/core@0.86.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`9df8c95`](https://github.com/greydragon888/real-router/commit/9df8c95d243a56c548be367390513400585e2e6b)]:
  - @real-router/core@0.85.0

## 0.5.2

### Patch Changes

- Updated dependencies [[`f8ae8a6`](https://github.com/greydragon888/real-router/commit/f8ae8a6b34e587180dcdcfb0a21c5387309325f5)]:
  - @real-router/core@0.84.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`585f435`](https://github.com/greydragon888/real-router/commit/585f4358d1beec9dccae8688d3878f5d589fad89)]:
  - @real-router/core@0.83.0

## 0.5.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Channel-aware `defaultSearch` recovery and dev-time validation ([#1549](https://github.com/greydragon888/real-router/issues/1549))

  Follows core's `Route.defaultSearch` split. The plugin now recovers stripped
  invalid query values from the **channel that holds the query** — `defaultSearch`,
  and only `defaultSearch`. Before, recovery always read `defaultParams`, which
  silently restored nothing once a route's query defaults moved to `defaultSearch`.

  ⚠ The `defaultParams` arm this entry originally kept for the State→URL (navigate)
  direction is gone, in the same release: core no longer separates channels, and a
  `defaultParams` naming a declared query key is refused at registration, so
  whatever a `defaultParams`-minus-path-slots subtraction still yields is undeclared
  PATH-channel data. Pouring it into the query channel would be the plugin
  re-creating the repair core removed.

  Dev-time config validation now targets `defaultSearch`: `usePlugin()`-time and
  `TREE_CHANGED` (`add` / `replace`, and `update` when `patch.defaultSearch`
  changed) re-validate a route's `defaultSearch` against its `searchSchema`, with
  a warning that names the consequence (`defaultSearch` is trusted config injected
  by core below the interceptor seam, so an invalid default still reaches state and
  the URL at runtime — [#802](https://github.com/greydragon888/real-router/issues/802)).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate the query channel on the URL→State path ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  Under the params/search split the matched query arrives on `state.search`. The
  `forwardState` interceptor is now channel-aware: it validates `state.search` on
  the URL→State (matchPath) path and the params bag on the navigate path, so
  `router.start(url)` and popstate-driven URLs validate their query against the
  schema — closing the previously-deferred gap (the un-skipped
  "validate params from URL on router.start()" test).

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate the query channel, not a bag picked by call shape ([#1564](https://github.com/greydragon888/real-router/issues/1564))

  The `forwardState` interceptor chose what to validate from `routeSearch !== undefined`, which is a question about the CALL, not about where the query lives. It now subtracts the route's path slots — its own and its ancestors', read off the engine's `paramMeta` via `getTree()` and cached per tree identity — and validates everything else, `search` merged over the params bag.

  - **A path param is never handed to the schema.** A transforming schema no longer rewrites `state.params.id`, and `strict: true` no longer deletes it — which used to abort the navigation with `[SegmentMatcher.buildPath] Missing required param 'id'` on a v1 single-bag `navigate(name, { id, q })`.
  - **The query channel is validated on both directions.** Anything an inner interceptor injected into `search` — `@real-router/persistent-params-plugin` since [#1563](https://github.com/greydragon888/real-router/issues/1563) — is now schema-checked on `navigate` as well as on the URL→State direction. Before this, exactly one direction was covered, and which one flipped with [#1563](https://github.com/greydragon888/real-router/issues/1563).
  - Validated values are written back to the bag they came from, so an undeclared key still rides where core puts it ([#1553](https://github.com/greydragon888/real-router/issues/1553) untouched); a key the schema invents lands in `search`.
  - Recovery after issues fills from the route's query-channel defaults: `defaultSearch` (the M2 home) and a `defaultParams` entry for a declared query key, minus the path slots.

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - The LIFO injection leak is closed by core ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  An interceptor registered after the schema could inject a declared query key
  into the `params` bag; core's `forwardState` seam then moved it into `search`,
  so an unvalidated value reached the channel this plugin owns. The suite
  documented that as a `LEAKS` test rather than a fix, because the plugin could
  not see the injection — it happened after its own interceptor ran.

  Core now refuses the mis-channelled bag instead of moving it, so an interceptor
  that wants to write the query channel has to write `search`, where the schema
  can see it. The test is rewritten to pin the refusal.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Move the documented examples to the query channel ([#1572](https://github.com/greydragon888/real-router/issues/1572))

  Core's channel guard now throws when a key a route declares with `?name`
  arrives in the `params` bag, so this package's README and guide examples — which
  showed the legacy single-bag form — no longer describe working code.

  Examples and tests moved to the explicit query argument:
  `navigate("products", {}, { lang: "en" })`. No runtime change in this package.

  An UNDECLARED tracked key is unaffected: the guard only fires on names the route
  declares with `?`.

- Updated dependencies [[`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507)]:
  - @real-router/core@0.82.0

## 0.4.23

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0

## 0.4.22

### Patch Changes

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0

## 0.4.21

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0

## 0.4.20

### Patch Changes

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0

## 0.4.19

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0

## 0.4.18

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.4.17

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.4.16

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.4.15

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.4.14

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.4.13

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.4.12

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.4.11

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0

## 0.4.10

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.4.9

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.4.8

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.4.7

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.4.6

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.4.5

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.4.4

### Patch Changes

- [#1120](https://github.com/greydragon888/real-router/pull/1120) [`d94ee79`](https://github.com/greydragon888/real-router/commit/d94ee79f3ef8de43f4ceadbe3b7d2e85191644b5) Thanks [@greydragon888](https://github.com/greydragon888)! - Document the `defaultParams` runtime contract and sharpen the dev warning ([#802](https://github.com/greydragon888/real-router/issues/802))

  The plugin's runtime guarantee ("invalid params never reach `state`") is scoped to
  user **input**. `defaultParams` are trusted developer config injected by the router
  core _below_ the interceptor seam the plugin hooks, so a `defaultParams` value that
  violates its own `searchSchema` still reaches `state` and the URL at runtime — in every
  `mode`, including `production`. This is now documented as a contract in the README and
  wiki, and the dev-time warning states the consequence (the value still reaches state)
  plus the fix (make `defaultParams` satisfy `searchSchema`). No behavior change.

## 0.4.3

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.4.0

### Minor Changes

- [#893](https://github.com/greydragon888/real-router/pull/893) [`acc8e7d`](https://github.com/greydragon888/real-router/commit/acc8e7da82fbaccc9058fc9d350868ba57cc0d6e) Thanks [@greydragon888](https://github.com/greydragon888)! - Support updating `searchSchema` via `routes.update()` ([#797](https://github.com/greydragon888/real-router/issues/797))

  `RouteConfigUpdate` is now augmented with `searchSchema` (`| null` to remove),
  symmetric with the existing `Route` augmentation.
  `getRoutesApi(router).update(name, { searchSchema })` swaps the schema with
  precise typing; the next navigation validates against it (the schema is read
  lazily per navigation). Previously the patch was silently dropped by core and
  navigation kept validating against the stale schema.

### Patch Changes

- Updated dependencies [[`acc8e7d`](https://github.com/greydragon888/real-router/commit/acc8e7da82fbaccc9058fc9d350868ba57cc0d6e)]:
  - @real-router/core@0.59.5

## 0.3.3

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.3.0

### Minor Changes

- [#717](https://github.com/greydragon888/real-router/pull/717) [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate dev-time defaultParams validation from the `add` interceptor to `TREE_CHANGED` ([#702](https://github.com/greydragon888/real-router/issues/702))

  The plugin now observes route-tree mutations through
  `getRoutesApi(router).subscribeChanges()` instead of the `add` interceptor. This
  closes a verified gap: dynamically changing a route's `defaultParams` via
  `update()`, or swapping the route set via `replace()`, now re-runs the dev-time
  `searchSchema` check. `add` (including parented adds and children) keeps working;
  `remove`/`clear` are no-ops. Production mode registers no subscription. The
  runtime `forwardState` validation path is unchanged.

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0

## 0.2.9

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.2.8

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.2.2

### Patch Changes

- [#481](https://github.com/greydragon888/real-router/pull/481) [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f) Thanks [@greydragon888](https://github.com/greydragon888)! - Document schema ↔ format coercion in README ([#465](https://github.com/greydragon888/real-router/issues/465))

  Added "Schema ↔ Format Coercion" section explaining:
  - The plugin validates decoded (typed) values, not raw URL strings
  - How `queryParams` options (booleanFormat, numberFormat, arrayFormat) interact with schema types
  - Gotcha: `z.boolean()` with `booleanFormat: "none"` breaks because schema receives strings
  - Workaround: `z.coerce.boolean()` / `z.coerce.number()` for mismatched configs
  - Recommended baseline: keep `queryParams` defaults for typical Zod/Valibot schemas

  Cross-reference to `@real-router/core` Params Contract section.

- Updated dependencies [[`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f), [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f)]:
  - @real-router/core@0.48.1

## 0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

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

- [#406](https://github.com/greydragon888/real-router/pull/406) [`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/search-schema-plugin` — runtime search parameter validation via Standard Schema V1 ([#406](https://github.com/greydragon888/real-router/issues/406))

  New plugin that validates search parameters against Standard Schema V1 (Zod 3.24+, Valibot 1.0+, ArkType) using the `forwardState` interceptor.

  Features:
  - Automatic strip of invalid params + merge with `defaultParams` for recovery
  - `mode: "development"` (console.error) / `"production"` (silent strip)
  - `strict` mode to remove unknown params
  - Custom `onError` callback for full control
  - Dev-time `defaultParams` validation at `usePlugin()` time
  - Dynamic route validation via `add` interceptor

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
