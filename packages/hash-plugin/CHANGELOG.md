# @real-router/hash-plugin

## 0.12.1

### Patch Changes

- Updated dependencies [[`505ec29`](https://github.com/greydragon888/real-router/commit/505ec29c62b5bb80492378e3d12cd89556a6226f)]:
  - @real-router/core@0.117.0

## 0.12.0

### Minor Changes

- [#2044](https://github.com/greydragon888/real-router/pull/2044) [`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e) Thanks [@greydragon888](https://github.com/greydragon888)! - A `RouterError` this package throws is frozen ([#1964](https://github.com/greydragon888/real-router/issues/1964))

  Aligns with core, where every thrown `RouterError` has been frozen since [#1960](https://github.com/greydragon888/real-router/issues/1960).
  Measured on the `onTransitionError` channel: ONE instance is handed to every
  plugin hook of a dispatch, so an in-place write by one rewrites what the next one
  reads — and a consumer catching an error could not tell which package produced
  the shape it got.

  **Behaviour change:** annotating a caught `RouterError` from this package (`err.appCode = 1`)
  now throws, as it already does for core’s. Swept across the repository before shipping —
  no test or source annotates one.

### Patch Changes

- Updated dependencies [[`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e), [`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e), [`9305e56`](https://github.com/greydragon888/real-router/commit/9305e56f0e3d76c4ac5694367f876d778bf13e0e)]:
  - @real-router/core@0.116.0

## 0.11.18

### Patch Changes

- Updated dependencies [[`9134481`](https://github.com/greydragon888/real-router/commit/913448155c181b6f712a9e9d0da4b949d80703a4)]:
  - @real-router/core@0.115.0

## 0.11.17

### Patch Changes

- Updated dependencies [[`fda4b60`](https://github.com/greydragon888/real-router/commit/fda4b60c0fe87b03d45d9058af150ae55d250a4c)]:
  - @real-router/core@0.114.0

## 0.11.16

### Patch Changes

- Updated dependencies [[`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493)]:
  - @real-router/core@0.113.0

## 0.11.15

### Patch Changes

- Updated dependencies [[`96d0400`](https://github.com/greydragon888/real-router/commit/96d0400d823c3aed9d9afc0044ebee663b8669bb)]:
  - @real-router/core@0.112.0

## 0.11.14

### Patch Changes

- Updated dependencies [[`d448814`](https://github.com/greydragon888/real-router/commit/d448814d224c1fb1e6d3288843ea7851a5c253a6)]:
  - @real-router/core@0.111.0

## 0.11.13

### Patch Changes

- Updated dependencies [[`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc)]:
  - @real-router/core@0.110.0

## 0.11.12

### Patch Changes

- [#1995](https://github.com/greydragon888/real-router/pull/1995) [`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195) Thanks [@greydragon888](https://github.com/greydragon888)! - Deciding intrinsics in the shared sources are captured at module load ([#1971](https://github.com/greydragon888/real-router/issues/1971))

  This package bundles `shared/browser-env`, whose reads of
  `Object.keys` / `hasOwn` / `entries` / `values` / `getPrototypeOf` went to the
  live global and can be re-pointed after boot. They are now read once at module
  load, the doctrine `guards.ts` states for core and the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971) extended
  to the shared half.

  ⚠ **Three of the reads in `shared/browser-env` FAIL OPEN**, which is what makes
  this half sharper than core's. Measured by re-pointing each after boot:

  ```
  Object.getPrototypeOf -> null   a Date instance ACCEPTED into state.params
  Object.values         -> []     a nested function ACCEPTED
  Object.keys           -> []     base:"/a/../b" accepted, the '..' rule bypassed
  ```

  The guard's verdict flipped to _valid_ for input it exists to reject, rather than
  degrading toward refusal.

  ⚠ **What capture does NOT buy**, stated because the doctrine states it: it
  narrows the window from "any time after boot" to "before the module loads". A
  shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
  This is robustness against polyfills, RUM/APM instrumentation, browser extensions
  and test doubles — not a security boundary, since re-pointing `Object.keys`
  already requires script execution.

  No behaviour change in a healthy environment: an intrinsic nobody touched answers
  the same either way.

  ⚑ 1 further read in this package's own `src` was swept in the same pass.

- Updated dependencies [[`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195)]:
  - @real-router/core@0.109.2

## 0.11.11

### Patch Changes

- Updated dependencies [[`1ff2fc2`](https://github.com/greydragon888/real-router/commit/1ff2fc24ec85219c894e3886a85808180211ce49)]:
  - @real-router/core@0.109.0

## 0.11.10

### Patch Changes

- [#1989](https://github.com/greydragon888/real-router/pull/1989) [`30c94da`](https://github.com/greydragon888/real-router/commit/30c94da1bab07219f58cc4ff82c906a28dc9f035) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: `history.state` restores four channels and now validates four ([#1837](https://github.com/greydragon888/real-router/issues/1837))

  `history.state` is the one input this plugin takes that a third party genuinely
  controls — a previous page, another script, or an entry written by an older
  version of your app. Four fixes to how a restored entry is screened and written
  back.

  **1. The query channel is screened by value, like the path channel.** A restored
  `search` reached the frozen `state.search` with any value at all, while the
  IDENTICAL value in `params` was refused:

  ```js
  // all six were ACCEPTED into state.search before; all six are refused now
  { tab: () => 1 }   { tab: Symbol() }   { tab: 10n }
  { tab: <cyclic> }  { tab: new Date() } { tab: new Map() }
  ```

  Measured end to end: `state.search.tab` of type `function`, `buildPath` printing
  `?tab=()%20%3D%3E%201`, and a real `history.pushState` throwing
  `DataCloneError` on the next write.

  ⚠ The query domain is unchanged — measured through a real restore, a repeated
  key still comes back as `[1, 2]` and a bare `?flag` as `null`.

  ⚠ **What finding 1 also takes.** A `search` whose object carries a custom
  prototype — a class instance, or `Object.create(someBag)` — was accepted before
  (as an empty bag, since only own keys are read) and is refused now, because
  `isParams` rejects a non-`Object.prototype` prototype exactly as it always has
  for `params`. The two channels agree, which is the point; and the shape cannot
  survive a real `history.pushState` round trip anyway, since structured
  deserialization yields plain objects. Reachable only from a synthetic
  `PopStateEvent`.

  **2. The guard's own reads no longer rethrow.** A `history.state` carrying an
  accessor, or a `get`-trapping Proxy, made `isState` throw out of a type guard.
  The popstate handler then took its non-`RouterError` path
  (`recoverFromCriticalError`) instead of falling back to `matchPath` — a wrong
  classification rather than a crash. An unreadable payload is now simply not
  restorable, the same answer any other malformed entry gets.

  **3. A persisted `UNKNOWN_ROUTE` answers to `allowNotFound`.** With
  `allowNotFound: false`, Back to an entry written while the option was `true`
  still committed the 404 the option forbids — the guard accepts core's `@@`
  namespace, deliberately, because that is what `UNKNOWN_ROUTE` is, so the entry
  took the matched branch and skipped the gate. Measured: the plugin itself writes
  `{"name":"@@router/UNKNOWN_ROUTE","params":{},"search":{},"path":"/nope"}` under
  `allowNotFound: true`, so the entry is ordinary, not adversarial. It now takes
  the same branch a live unmatched URL takes: `true` restores, `false` emits
  `ROUTE_NOT_FOUND` and rolls the URL back.

  **4. The URL rollback writes the four-channel projection.** It wrote the whole
  committed `State`, so `context` and `transition` went into `history.state` on a
  guard-rejected Back, a SAME_STATES popstate and a strict-mode unmatched URL.
  ⚠ `context` is a public plugin slot this plugin does not control, and a real
  `replaceState` serialises: a plugin publishing a non-cloneable value made the
  rollback throw into an empty `catch`, so the URL was never rolled back at all.

  ⚠ **If you read `history.state` yourself:** rollback entries now carry exactly
  `{ name, params, search, path }`. Measured, ordinary entries always did — the
  two extra members appeared only on rollback ones.

  These fixes live in `shared/browser-env`, which this plugin consumes through the
  same `isState` guard and the same popstate handler as
  `@real-router/browser-plugin`, so both packages get them identically.

## 0.11.9

### Patch Changes

- Updated dependencies [[`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7)]:
  - @real-router/core@0.108.0

## 0.11.8

### Patch Changes

- Updated dependencies [[`133eb3c`](https://github.com/greydragon888/real-router/commit/133eb3c39c124754c1a400c908cad5eb91e2df60), [`133eb3c`](https://github.com/greydragon888/real-router/commit/133eb3c39c124754c1a400c908cad5eb91e2df60)]:
  - @real-router/core@0.107.0

## 0.11.7

### Patch Changes

- Updated dependencies [[`7136e7f`](https://github.com/greydragon888/real-router/commit/7136e7f999560f8a617a7d6c2d1aa6c49c3f89fc)]:
  - @real-router/core@0.106.0

## 0.11.6

### Patch Changes

- Updated dependencies [[`5e7d2d8`](https://github.com/greydragon888/real-router/commit/5e7d2d8e4f2042af8d51797cac9b230437bae39e)]:
  - @real-router/core@0.105.0

## 0.11.5

### Patch Changes

- Updated dependencies [[`71b13c3`](https://github.com/greydragon888/real-router/commit/71b13c3793eea298fdb0606f0a282c5d7a77b1c4), [`71b13c3`](https://github.com/greydragon888/real-router/commit/71b13c3793eea298fdb0606f0a282c5d7a77b1c4)]:
  - @real-router/core@0.104.0

## 0.11.4

### Patch Changes

- Updated dependencies [[`aa9d6a7`](https://github.com/greydragon888/real-router/commit/aa9d6a75331609d8ff8cabf814af4ff9bd7076d6), [`aa9d6a7`](https://github.com/greydragon888/real-router/commit/aa9d6a75331609d8ff8cabf814af4ff9bd7076d6)]:
  - @real-router/core@0.103.0

## 0.11.3

### Patch Changes

- Updated dependencies [[`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038), [`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038)]:
  - @real-router/core@0.102.0

## 0.11.2

### Patch Changes

- Updated dependencies [[`7f24406`](https://github.com/greydragon888/real-router/commit/7f24406ac163810e616bf6fa0960478af2fea10b)]:
  - @real-router/core@0.101.0

## 0.11.1

### Patch Changes

- [#1936](https://github.com/greydragon888/real-router/pull/1936) [`1459ecb`](https://github.com/greydragon888/real-router/commit/1459ecbca2f3af2c6c6011f31165cbf5aab47033) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep an escaped reserved character intact in the hash path ([#1920](https://github.com/greydragon888/real-router/issues/1920))

  `safelyEncodePath` was `encodeURI(decodeURI(path))`, and those two are not
  inverses over the escapes of reserved characters: `decodeURI` preserves them by
  design, and `encodeURI` then escaped the surviving `%`. The hash channel reaches
  it through `buildHashLocation`, so `#/files/a%2Fb` became `/files/a%252Fb` and a
  param the application had stored as `a/b` came back as `a%2Fb`.

  The function now escapes what is not escaped yet and leaves alone what already
  is. A percent that begins nothing interpretable is still carried where it stands
  — same result as before, now without a `URIError` behind it. One further change
  in the same rule: an escape whose literal form needs none (`%41`) is no longer
  normalised to that literal, since an escape is now left alone whatever it
  encodes.

- [#1936](https://github.com/greydragon888/real-router/pull/1936) [`1459ecb`](https://github.com/greydragon888/real-router/commit/1459ecbca2f3af2c6c6011f31165cbf5aab47033) Thanks [@greydragon888](https://github.com/greydragon888)! - Read the scheme only where a scheme can be ([#1921](https://github.com/greydragon888/real-router/issues/1921), [#1836](https://github.com/greydragon888/real-router/issues/1836))

  `safeParseUrl` located the scheme with an unanchored `indexOf("://")`, so for a
  relative URL the first `://` was whatever the query or fragment happened to
  carry, and everything before it was discarded.

  Hash routing degraded worse than the other two URL plugins: `hashUrlToPath`
  reads the parsed `.hash`, which the misparse EMPTIED, so `extractHashPath("")`
  returned `"/"` and the route was erased outright rather than merely resolved
  wrong. `#/login?returnTo=https://app.io/dash` landed on the index route.

  The scheme is now matched against RFC 3986's shape in first position only.
  Absolute URLs and non-HTTP schemes ([#496](https://github.com/greydragon888/real-router/issues/496)) are unchanged.

## 0.11.0

### Minor Changes

- [#1909](https://github.com/greydragon888/real-router/pull/1909) [`44f11bb`](https://github.com/greydragon888/real-router/commit/44f11bb63dfd278b44cf16880a6e11bce721ec34) Thanks [@greydragon888](https://github.com/greydragon888)! - `isState` promises what it actually validates ([#1838](https://github.com/greydragon888/real-router/issues/1838))

  The guard declared `value is State` while checking THREE of `State`'s six
  members — `name`, `path`, `params`. The other three (`search`, `transition`,
  `context`) were unvalidated, and the gap was reachable: `popstate-utils` reads
  `state.search` on the line after the guard passes and hands it to `makeState`.

  Measured end to end, restoring a hand-crafted `history.state`:

  ```
  search: {}                 → state.search keys []            ← correct
  search: "NOT-AN-OBJECT"    → state.search keys ["0" … "12"]  ← one per character
  search: ["x", "y"]         → state.search keys ["0", "1"]
  ```

  `state.path` was unchanged and nothing downstream complained, so a corrupted or
  tampered entry committed a state whose query channel was character-indexed
  garbage.

  **What changes.** The guard now also rejects `search` / `transition` / `context`
  when they are PRESENT with a non-object value (arrays included — `typeof [] ===
"object"`, and an array `search` produces the same numeric-key shape one step
  less obviously). Absence is still accepted: entries written before RFC-4 M2
  ([#1548](https://github.com/greydragon888/real-router/issues/1548)) carry no query channel at all, and requiring one would break every
  pre-M2 Back.

  ⚠ **Type change, hence `minor`.** `isState` narrows from `value is State` to
  `value is RestorableEntry` — the subset it validates. Code that read
  `transition` or `context` off a guarded value was relying on an unchecked
  promise and now gets a compile error; that is the point. `name`, `params`,
  `path` and `search` are unaffected.

  ⚠ `isRequiredFields` is deliberately untouched: it is a byte-identical twin of
  `@real-router/validation-plugin`'s copy, locked by `scripts/twin-lockstep.test.mjs`.
  The added checks live outside it, so the pair stays in step and
  `validation-plugin`'s own `isState` — a different function — is unchanged.

  Part of [#1901](https://github.com/greydragon888/real-router/issues/1901).

### Patch Changes

- [#1909](https://github.com/greydragon888/real-router/pull/1909) [`44f11bb`](https://github.com/greydragon888/real-router/commit/44f11bb63dfd278b44cf16880a6e11bce721ec34) Thanks [@greydragon888](https://github.com/greydragon888)! - An option key that is not an option is skipped, whatever it is called ([#1838](https://github.com/greydragon888/real-router/issues/1838))

  `validateOptions` (`shared/browser-env/validation.ts`, shared by all three URL
  plugins) asked `key in defaults`, and `defaults` is a plain object literal — so
  the walk reached `Object.prototype` and answered for every one of its own
  members, which were then type-checked against the inherited method it found.

  Measured through the public factory before the fix, all twelve threw:

  ```
  nonsenseKey  accepted (skipped as unknown)   ← the intended behaviour
  toString     THROWS  Invalid type for 'toString': expected function, got string
  __proto__    THROWS  Invalid type for '__proto__': expected object, got string
  ```

  The asymmetry was the defect: a typo'd option was forgiven, and a typo that
  happened to collide with a prototype member was a hard error about a type the
  caller never declared. It is `Object.hasOwn(defaults, key)` now, so an unknown
  key is skipped whatever it is called — while a REAL option with a wrong type
  still throws exactly as before.

  Part of [#1901](https://github.com/greydragon888/real-router/issues/1901).

## 0.10.15

### Patch Changes

- Updated dependencies [[`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855)]:
  - @real-router/core@0.100.0

## 0.10.14

### Patch Changes

- Updated dependencies [[`e093c82`](https://github.com/greydragon888/real-router/commit/e093c82931ab92ae0651b482e52d12e797265966)]:
  - @real-router/core@0.99.0

## 0.10.13

### Patch Changes

- Updated dependencies [[`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2)]:
  - @real-router/core@0.98.0

## 0.10.12

### Patch Changes

- Updated dependencies [[`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759), [`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759)]:
  - @real-router/core@0.97.0

## 0.10.11

### Patch Changes

- Updated dependencies [[`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c)]:
  - @real-router/core@0.96.0

## 0.10.10

### Patch Changes

- Updated dependencies [[`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93)]:
  - @real-router/core@0.95.0

## 0.10.9

### Patch Changes

- Updated dependencies [[`38d4059`](https://github.com/greydragon888/real-router/commit/38d40595953c5bb09e4158f28ca3e821ed93e3f8)]:
  - @real-router/core@0.94.0

## 0.10.8

### Patch Changes

- Updated dependencies [[`52c8108`](https://github.com/greydragon888/real-router/commit/52c81087cb09adcca8951ca6d06e2aa18336b1c2)]:
  - @real-router/core@0.93.0

## 0.10.7

### Patch Changes

- Updated dependencies [[`11f22b1`](https://github.com/greydragon888/real-router/commit/11f22b1d161b8d3c1bc8a676f0e01cbdeb2febc7)]:
  - @real-router/core@0.92.0

## 0.10.6

### Patch Changes

- Updated dependencies [[`69beff3`](https://github.com/greydragon888/real-router/commit/69beff3f6b2c0f4348a71366be113ea2a05c5936)]:
  - @real-router/core@0.91.0

## 0.10.5

### Patch Changes

- Updated dependencies [[`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a)]:
  - @real-router/core@0.90.0

## 0.10.4

### Patch Changes

- [#1718](https://github.com/greydragon888/real-router/pull/1718) [`8979d46`](https://github.com/greydragon888/real-router/commit/8979d46d22fac24c0d8f7fffde5f4dfb37c43f10) Thanks [@greydragon888](https://github.com/greydragon888)! - Read `forceDeactivate` and `base` defaults from the shared `browser-env` object ([#1651](https://github.com/greydragon888/real-router/issues/1651))

  `defaultOptions` now spreads `sharedUrlPluginDefaults` from `shared/browser-env/defaults.ts`, the single value read by `browser-plugin`, `hash-plugin` and `navigation-plugin`; `hashPrefix` stays local as URL mechanics only this plugin owns. Values are unchanged (`forceDeactivate: false`, `base: ""`, `hashPrefix: ""`) — the point is that "does browser Back honour `canDeactivate`" stops being three independently editable copies, the arrangement whose drift reached users in [#524](https://github.com/greydragon888/real-router/issues/524)/[#1645](https://github.com/greydragon888/real-router/issues/1645).

  The stale `@default true` on `HashPluginOptions.forceDeactivate` is corrected to `false`, matching what the plugin has shipped since [#1645](https://github.com/greydragon888/real-router/issues/1645).

## 0.10.3

### Patch Changes

- Updated dependencies [[`76a4dfb`](https://github.com/greydragon888/real-router/commit/76a4dfb4337bfc46a24ac0aac45819484d171992)]:
  - @real-router/core@0.89.0

## 0.10.2

### Patch Changes

- Updated dependencies [[`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161)]:
  - @real-router/core@0.88.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084)]:
  - @real-router/core@0.87.0

## 0.10.0

### Minor Changes

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - `forceDeactivate` now defaults to `false` — back/forward respects `canDeactivate` ([#1645](https://github.com/greydragon888/real-router/issues/1645))

  Same change, same reason as `@real-router/browser-plugin`: the two share the
  popstate handler but each shipped its own default, and both shipped `true` from
  their first release. A `canDeactivate` guard — the mechanism an app uses to stop a
  departure that would lose unsaved work — was therefore never asked when the user
  pressed Back.

  [#524](https://github.com/greydragon888/real-router/issues/524) decided this question ("stop making the bypass the default, keep the option as
  a deliberate escape hatch") and applied it to `navigation-plugin` alone, on the
  premise that the other two already behaved that way. Measured: they did not.

  After this change all four back/forward surfaces in the project agree —
  `browser-plugin`, `hash-plugin`, `navigation-plugin` and `memory-plugin` (which
  never had the option and always consulted guards).

  **Migration.** To keep the old behaviour, pass the option explicitly:

  ```ts
  router.usePlugin(hashPluginFactory({ forceDeactivate: true }));
  ```

### Patch Changes

- Updated dependencies [[`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a)]:
  - @real-router/core@0.86.0

## 0.9.3

### Patch Changes

- Updated dependencies [[`9df8c95`](https://github.com/greydragon888/real-router/commit/9df8c95d243a56c548be367390513400585e2e6b)]:
  - @real-router/core@0.85.0

## 0.9.2

### Patch Changes

- Updated dependencies [[`f8ae8a6`](https://github.com/greydragon888/real-router/commit/f8ae8a6b34e587180dcdcfb0a21c5387309325f5)]:
  - @real-router/core@0.84.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`585f435`](https://github.com/greydragon888/real-router/commit/585f4358d1beec9dccae8688d3878f5d589fad89)]:
  - @real-router/core@0.83.0

## 0.9.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Adapt `buildUrl` / `replaceHistoryState` to the RFC-4 M2 params/search slot-shift ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `buildUrl(name, params?, search?, options?)` **and**
  `replaceHistoryState(name, params?, search?, options?)` gain the query channel at
  position 3; the `{ hash }` options object shifts to position 4. The plugin's internal
  `pluginBuildUrl` forwards `search` into core's now-search-aware `router.buildPath`,
  so a `#/items?id=5` URL builds its query from the dedicated channel, and a
  caller-supplied `search` on `replaceHistoryState` lands in the built state / URL.

  **Breaking (pre-1.0, positional slot-shift):** `buildUrl` / `replaceHistoryState`
  callers passing `{ hash }` at position 3 move it to position 4 (query channel now
  occupies 3).

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep the query channel on popstate rollback ([#1586](https://github.com/greydragon888/real-router/issues/1586))

  `rollbackUrlToCurrentState` (shared with `browser-plugin`) rebuilt the visible
  URL from `name` + `params` alone, so a guard rejection or an unmatched
  back-navigation away from `#/users/list?page=2&sort=asc` restored
  `#/users/list`. The plugin does not track fragments, so only the query was
  affected here.

  The existing rollback assertion could not see it: it built its expectation with
  the same omission, which stays a tautology for as long as both sides drop the
  same channel.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate `replaceHistoryState` internals off the removed `PluginApi.buildState` ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  Internal refactor in the shared `browser-env` plugin-utils: `createReplaceHistoryState` now resolves the target route via `buildNavigationState`. Observable behavior is unchanged — same existence check (throws for an unknown route), same forwardTo resolution, and the caller's `search` remains the only query source for the `history.state` record.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep a forwarding route's query defaults in the `replaceHistoryState` record ([#1574](https://github.com/greydragon888/real-router/issues/1574))

  `createReplaceHistoryState` (shared `browser-env`) built the `history.state`
  record from the caller's raw `search` while taking `name`/`params` from the
  resolved state. That asymmetry dropped every query value the caller did not
  spell out — above all the query half of a `forwardTo` chain's own
  `defaultParams`, which exists only after resolution.

  Measured on `archive → posts` with `archive.defaultParams = {id, tab}` and
  `posts = "/posts/:id?tab"`: the record read `{params: {id: "7"}, search: {},
path: "/posts/7"}` while the address bar carried the query. The path half of the
  same `defaultParams` bag survived, the query half did not — and a Back that
  restored that record committed the page without its query.

  Both channels now come from the one resolution: the caller's `search` is passed
  INTO `buildNavigationState` (the third slot added in [#1571](https://github.com/greydragon888/real-router/issues/1571)) and the record is
  rebuilt from `state.search`. An explicit caller value still beats the hop
  default it collides with — `separateChannels` spreads the caller's bag last —
  so this only adds back what was silently lost.

  Passing `search` in also means the `forwardState` seam finally sees the query
  channel, so a `search-schema` or `persistent-params` interceptor registered on
  it observes what the caller actually sent instead of `undefined`.

  The URL half is untouched: it still comes from the plugin's `buildUrl`, and its
  own divergence for a forwarding route (`buildPath` prints the SOURCE path) is a
  separate, tracked `buildPath` defect.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Build `replaceHistoryState`'s URL from the resolved state, and drop the redundant rebuild ([#1585](https://github.com/greydragon888/real-router/issues/1585))

  The record written to history has come from `buildNavigationState` since [#1574](https://github.com/greydragon888/real-router/issues/1574),
  so it carries the resolved channels — `forwardTo` applied, plus whatever a
  `forwardState` interceptor (`persistent-params`, `search-schema`) injected into
  the query. The URL written beside it was still built from the caller's raw
  arguments, which reach the public `buildPath` — and that neither resolves
  `forwardTo` nor runs the seam. The two therefore disagreed on exactly the keys
  the seam contributes:

  ```
  record  /posts/9?tab=new&sort=date&lang=de
  URL     /posts/9?tab=new&sort=date            <- injected key missing
  ```

  and, for a forwarding route, the record said `posts` while the address bar said
  `/old`. `navigate` has always kept the pair equal; `replaceHistoryState` was the
  only history writer of the five reading the caller's bag instead of a resolved
  state.

  The same change retires the `makeState` rebuild that followed
  `buildNavigationState`. It produced a byte-identical state — a leftover from
  `buildState`, which built no path of its own — and cost a third trip through the
  `buildPath` interceptor chain per history record. Two remain by construction.

- Updated dependencies [[`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507)]:
  - @real-router/core@0.82.0

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
