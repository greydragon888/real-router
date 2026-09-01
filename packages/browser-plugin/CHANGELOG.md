# @real-router/browser-plugin

## 0.22.2

### Patch Changes

- Updated dependencies [[`c6aff93`](https://github.com/greydragon888/real-router/commit/c6aff93137d7833df2adec104790187ff2d19399)]:
  - @real-router/core@0.118.0

## 0.22.1

### Patch Changes

- Updated dependencies [[`505ec29`](https://github.com/greydragon888/real-router/commit/505ec29c62b5bb80492378e3d12cd89556a6226f)]:
  - @real-router/core@0.117.0

## 0.22.0

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

## 0.21.18

### Patch Changes

- Updated dependencies [[`9134481`](https://github.com/greydragon888/real-router/commit/913448155c181b6f712a9e9d0da4b949d80703a4)]:
  - @real-router/core@0.115.0

## 0.21.17

### Patch Changes

- Updated dependencies [[`fda4b60`](https://github.com/greydragon888/real-router/commit/fda4b60c0fe87b03d45d9058af150ae55d250a4c)]:
  - @real-router/core@0.114.0

## 0.21.16

### Patch Changes

- Updated dependencies [[`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493), [`47bc18d`](https://github.com/greydragon888/real-router/commit/47bc18dbbbc77b5c71b34fc0f587bc3084756493)]:
  - @real-router/core@0.113.0

## 0.21.15

### Patch Changes

- Updated dependencies [[`96d0400`](https://github.com/greydragon888/real-router/commit/96d0400d823c3aed9d9afc0044ebee663b8669bb)]:
  - @real-router/core@0.112.0

## 0.21.14

### Patch Changes

- Updated dependencies [[`d448814`](https://github.com/greydragon888/real-router/commit/d448814d224c1fb1e6d3288843ea7851a5c253a6)]:
  - @real-router/core@0.111.0

## 0.21.13

### Patch Changes

- Updated dependencies [[`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc), [`e96dea4`](https://github.com/greydragon888/real-router/commit/e96dea4757742fabc07d74752f1a24eab56512dc)]:
  - @real-router/core@0.110.0

## 0.21.12

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

- Updated dependencies [[`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195)]:
  - @real-router/core@0.109.2

## 0.21.11

### Patch Changes

- Updated dependencies [[`1ff2fc2`](https://github.com/greydragon888/real-router/commit/1ff2fc24ec85219c894e3886a85808180211ce49)]:
  - @real-router/core@0.109.0

## 0.21.10

### Patch Changes

- [#1989](https://github.com/greydragon888/real-router/pull/1989) [`30c94da`](https://github.com/greydragon888/real-router/commit/30c94da1bab07219f58cc4ff82c906a28dc9f035) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: `history.state` restores four channels and now validates four ([#1837](https://github.com/greydragon888/real-router/issues/1837))

  `history.state` is the one input this plugin takes that a third party genuinely
  controls — a previous page, another script, or an entry written by an older
  version of your app. Four fixes to how a restored entry is screened and written
  back. They live in `shared/browser-env`, so `@real-router/hash-plugin` gets the
  same four.

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

  ⚠ The query domain is unchanged — a repeated key still parses to an array and a
  bare `?flag` to `null`, and both still restore.

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
  still committed the 404 the option forbids. Measured: the plugin itself writes
  `{"name":"@@router/UNKNOWN_ROUTE","params":{},"search":{},"path":"/nope"}` under
  `allowNotFound: true`, so the entry is ordinary, not adversarial. It now takes
  the same branch a live unmatched URL takes: `true` restores, `false` emits
  `ROUTE_NOT_FOUND` and rolls the URL back.

  **4. The URL rollback writes the four-channel projection.** It wrote the whole
  committed `State`, so `context` and `transition` went into `history.state` on
  a guard-rejected Back, a SAME_STATES popstate and a strict-mode unmatched URL —
  the first two through the handler's `RouterError` catch, the third through its
  own branch. ⚠ `context` is a public plugin slot this plugin does not control,
  and a real `replaceState` serialises: a plugin publishing a non-cloneable value
  made the rollback throw into an empty `catch`, so the URL was never rolled back
  at all.

  ⚠ **If you read `history.state` yourself:** rollback entries now carry exactly
  `{ name, params, search, path }`, matching every other write site. Measured,
  ordinary entries always did — the two extra members appeared only on rollback
  ones.

## 0.21.9

### Patch Changes

- Updated dependencies [[`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7), [`3369572`](https://github.com/greydragon888/real-router/commit/3369572353709f405f74f4abc0c9663bfbf2f1b7)]:
  - @real-router/core@0.108.0

## 0.21.8

### Patch Changes

- Updated dependencies [[`133eb3c`](https://github.com/greydragon888/real-router/commit/133eb3c39c124754c1a400c908cad5eb91e2df60), [`133eb3c`](https://github.com/greydragon888/real-router/commit/133eb3c39c124754c1a400c908cad5eb91e2df60)]:
  - @real-router/core@0.107.0

## 0.21.7

### Patch Changes

- Updated dependencies [[`7136e7f`](https://github.com/greydragon888/real-router/commit/7136e7f999560f8a617a7d6c2d1aa6c49c3f89fc)]:
  - @real-router/core@0.106.0

## 0.21.6

### Patch Changes

- Updated dependencies [[`5e7d2d8`](https://github.com/greydragon888/real-router/commit/5e7d2d8e4f2042af8d51797cac9b230437bae39e)]:
  - @real-router/core@0.105.0

## 0.21.5

### Patch Changes

- Updated dependencies [[`71b13c3`](https://github.com/greydragon888/real-router/commit/71b13c3793eea298fdb0606f0a282c5d7a77b1c4), [`71b13c3`](https://github.com/greydragon888/real-router/commit/71b13c3793eea298fdb0606f0a282c5d7a77b1c4)]:
  - @real-router/core@0.104.0

## 0.21.4

### Patch Changes

- Updated dependencies [[`aa9d6a7`](https://github.com/greydragon888/real-router/commit/aa9d6a75331609d8ff8cabf814af4ff9bd7076d6), [`aa9d6a7`](https://github.com/greydragon888/real-router/commit/aa9d6a75331609d8ff8cabf814af4ff9bd7076d6)]:
  - @real-router/core@0.103.0

## 0.21.3

### Patch Changes

- Updated dependencies [[`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038), [`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038)]:
  - @real-router/core@0.102.0

## 0.21.2

### Patch Changes

- Updated dependencies [[`7f24406`](https://github.com/greydragon888/real-router/commit/7f24406ac163810e616bf6fa0960478af2fea10b)]:
  - @real-router/core@0.101.0

## 0.21.1

### Patch Changes

- [#1936](https://github.com/greydragon888/real-router/pull/1936) [`1459ecb`](https://github.com/greydragon888/real-router/commit/1459ecbca2f3af2c6c6011f31165cbf5aab47033) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep an escaped reserved character intact across a page reload ([#1920](https://github.com/greydragon888/real-router/issues/1920))

  `safelyEncodePath` was `encodeURI(decodeURI(path))`, and those two are not
  inverses over the escapes of reserved characters: `decodeURI` preserves them by
  design, and `encodeURI` then escaped the surviving `%`. A param carrying `/`,
  `?`, `#` or `&` travels as `%2F` / `%3F` / `%23` / `%26` — which `buildPath`
  emits — so `start()` with no path, i.e. every page reload, turned it into
  `%252F` and handed back `a%2Fb` where the application had stored `a/b`, with the
  address bar rewritten to match.

  The function now escapes what is not escaped yet and leaves alone what already
  is. A path with nothing to escape, a raw non-ASCII path and an already-encoded
  `%20` are all unaffected.

  Two classes move, not one. The old pair also normalised an escape whose literal
  form needs none — `/files/%41` came back as `/files/A` — and that no longer
  happens: an escape is left alone whatever it encodes. Harmless, and measured so:
  the matcher decodes both forms to the same param, and `buildPath` never emits
  such an escape, so it is only reachable from a hand-typed URL, whose address bar
  now keeps what was typed.

- [#1936](https://github.com/greydragon888/real-router/pull/1936) [`1459ecb`](https://github.com/greydragon888/real-router/commit/1459ecbca2f3af2c6c6011f31165cbf5aab47033) Thanks [@greydragon888](https://github.com/greydragon888)! - Read the scheme only where a scheme can be ([#1921](https://github.com/greydragon888/real-router/issues/1921), [#1836](https://github.com/greydragon888/real-router/issues/1836))

  `safeParseUrl` located the scheme with an unanchored `indexOf("://")`, which asks
  whether the string contains `://` anywhere rather than whether it BEGINS with a
  scheme. For an absolute URL the first `://` is the real one, so that arc was
  correct; for a relative URL it was whatever the query or fragment happened to
  carry, and everything before it was discarded — path and entire query alike.

  `router.matchUrl("/login?returnTo=https://app.io/dashboard")` therefore resolved
  `dashboard`: the route came from a path the caller had put in a query parameter.
  `?returnTo=` / `?redirect_uri=` / `?next=` is the most common query value on the
  web, so every login redirect and OAuth callback was affected.

  The scheme is now matched against RFC 3986's shape in first position only.
  Absolute URLs, `file://`, `app://`, `tauri://` ([#496](https://github.com/greydragon888/real-router/issues/496)) and opaque forms such as
  `data:` are unchanged.

## 0.21.0

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

## 0.20.15

### Patch Changes

- Updated dependencies [[`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855)]:
  - @real-router/core@0.100.0

## 0.20.14

### Patch Changes

- Updated dependencies [[`e093c82`](https://github.com/greydragon888/real-router/commit/e093c82931ab92ae0651b482e52d12e797265966)]:
  - @real-router/core@0.99.0

## 0.20.13

### Patch Changes

- Updated dependencies [[`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2)]:
  - @real-router/core@0.98.0

## 0.20.12

### Patch Changes

- Updated dependencies [[`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759), [`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759)]:
  - @real-router/core@0.97.0

## 0.20.11

### Patch Changes

- Updated dependencies [[`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c)]:
  - @real-router/core@0.96.0

## 0.20.10

### Patch Changes

- Updated dependencies [[`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93)]:
  - @real-router/core@0.95.0

## 0.20.9

### Patch Changes

- Updated dependencies [[`38d4059`](https://github.com/greydragon888/real-router/commit/38d40595953c5bb09e4158f28ca3e821ed93e3f8)]:
  - @real-router/core@0.94.0

## 0.20.8

### Patch Changes

- Updated dependencies [[`52c8108`](https://github.com/greydragon888/real-router/commit/52c81087cb09adcca8951ca6d06e2aa18336b1c2)]:
  - @real-router/core@0.93.0

## 0.20.7

### Patch Changes

- Updated dependencies [[`11f22b1`](https://github.com/greydragon888/real-router/commit/11f22b1d161b8d3c1bc8a676f0e01cbdeb2febc7)]:
  - @real-router/core@0.92.0

## 0.20.6

### Patch Changes

- Updated dependencies [[`69beff3`](https://github.com/greydragon888/real-router/commit/69beff3f6b2c0f4348a71366be113ea2a05c5936)]:
  - @real-router/core@0.91.0

## 0.20.5

### Patch Changes

- Updated dependencies [[`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a)]:
  - @real-router/core@0.90.0

## 0.20.4

### Patch Changes

- [#1718](https://github.com/greydragon888/real-router/pull/1718) [`8979d46`](https://github.com/greydragon888/real-router/commit/8979d46d22fac24c0d8f7fffde5f4dfb37c43f10) Thanks [@greydragon888](https://github.com/greydragon888)! - Read `forceDeactivate` and `base` defaults from the shared `browser-env` object ([#1651](https://github.com/greydragon888/real-router/issues/1651))

  `defaultOptions` now spreads `sharedUrlPluginDefaults` from `shared/browser-env/defaults.ts`, the single value read by `browser-plugin`, `hash-plugin` and `navigation-plugin`. Values are unchanged (`forceDeactivate: false`, `base: ""`) — the point is that "does browser Back honour `canDeactivate`" stops being three independently editable copies, the arrangement whose drift reached users in [#524](https://github.com/greydragon888/real-router/issues/524)/[#1645](https://github.com/greydragon888/real-router/issues/1645).

  The stale `@default true` on `BrowserPluginOptions.forceDeactivate` is corrected to `false`, matching what the plugin has shipped since [#1645](https://github.com/greydragon888/real-router/issues/1645).

## 0.20.3

### Patch Changes

- Updated dependencies [[`76a4dfb`](https://github.com/greydragon888/real-router/commit/76a4dfb4337bfc46a24ac0aac45819484d171992)]:
  - @real-router/core@0.89.0

## 0.20.2

### Patch Changes

- Updated dependencies [[`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161)]:
  - @real-router/core@0.88.0

## 0.20.1

### Patch Changes

- Updated dependencies [[`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084)]:
  - @real-router/core@0.87.0

## 0.20.0

### Minor Changes

- [#1642](https://github.com/greydragon888/real-router/pull/1642) [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a) Thanks [@greydragon888](https://github.com/greydragon888)! - `forceDeactivate` now defaults to `false` — back/forward respects `canDeactivate` ([#1645](https://github.com/greydragon888/real-router/issues/1645))

  A `canDeactivate` guard is how an app stops a departure that would lose data. Under
  this plugin's shipped default it was never asked on browser back/forward: press
  Back with unsaved changes and the confirm dialog the app registered simply did not
  appear.

  This is the decision [#524](https://github.com/greydragon888/real-router/issues/524) already made and applied to only one of the three URL
  plugins. Its reasoning — "stop making the bypass the default, keep the option as a
  deliberate escape hatch" — was written against the premise that the same user code
  already worked here. Measured through the real popstate handler, it did not: the
  guard was called **zero** times on a back/forward to a matched URL, and the default
  had been `true` since v0.1.0. Nothing caught the drift because nothing pinned it —
  flipping the default broke none of the 356 tests in this package.

  Two things made it visible now. `navigation-plugin`'s own README says its default
  "matches browser-plugin", which this plugin's README contradicted on the next page.
  And since [#1643](https://github.com/greydragon888/real-router/issues/1643) the OTHER half of the same gesture — Back to a URL that no longer
  matches any route — does consult the guard, so one option gave the two halves of
  one back button opposite answers.

  **Migration.** If your app relies on browser back/forward committing regardless of
  guards (e.g. to avoid a dead-end where the user cannot leave), pass the option
  explicitly:

  ```ts
  router.usePlugin(browserPluginFactory({ forceDeactivate: true }));
  ```

  Nothing else changes: the option, its type and its semantics are untouched — only
  which value you get when you do not pass one.

### Patch Changes

- Updated dependencies [[`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a)]:
  - @real-router/core@0.86.0

## 0.19.3

### Patch Changes

- Updated dependencies [[`9df8c95`](https://github.com/greydragon888/real-router/commit/9df8c95d243a56c548be367390513400585e2e6b)]:
  - @real-router/core@0.85.0

## 0.19.2

### Patch Changes

- Updated dependencies [[`f8ae8a6`](https://github.com/greydragon888/real-router/commit/f8ae8a6b34e587180dcdcfb0a21c5387309325f5)]:
  - @real-router/core@0.84.0

## 0.19.1

### Patch Changes

- Updated dependencies [[`585f435`](https://github.com/greydragon888/real-router/commit/585f4358d1beec9dccae8688d3878f5d589fad89)]:
  - @real-router/core@0.83.0

## 0.19.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Adapt `buildUrl` / `replaceHistoryState` to the RFC-4 M2 params/search slot-shift ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `buildUrl(name, params?, search?, options?)` **and**
  `replaceHistoryState(name, params?, search?, options?)` gain the query channel at
  position 3; the `{ hash }` options object shifts to position 4. The plugin threads
  `search` into core's now-search-aware `router.buildPath`, so a caller-supplied
  `search` on `replaceHistoryState` lands in the built state and the rebuilt URL, and
  `history.state` written by `replaceHistoryState` / `onTransitionSuccess` carries the
  new `search` field alongside `{ name, params, path }`.

  **Breaking (pre-1.0, positional slot-shift):** `buildUrl` / `replaceHistoryState`
  callers passing `{ hash }` at position 3 move it to position 4 (query channel now
  occupies 3).

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep the query channel and the fragment on popstate rollback ([#1586](https://github.com/greydragon888/real-router/issues/1586))

  `rollbackUrlToCurrentState` rebuilt the visible URL from `name` + `params`
  alone, so a guard rejection or an unmatched back-navigation away from
  `/list?tab=a&sort=z#anchor` restored `/list`.

  The fragment went missing for the same reason as the query: the shared
  `PopstateHandlerDeps.buildUrl` type still described the pre-[#1548](https://github.com/greydragon888/real-router/issues/1548) three-argument
  form `(name, params, options)` while the injected `createPluginBuildUrl` had
  already shifted to `(name, params, search, options)`. The `{ hash }` object
  therefore landed in the **search** slot — structurally a valid `SearchParams`,
  so nothing complained — and `options` arrived `undefined`, which silently
  defeated the hash preservation the call site's own [#532](https://github.com/greydragon888/real-router/issues/532) comment promises.

  The deps signature now carries the query slot, and a type-equality pin between
  it and `createPluginBuildUrl`'s return type fails the build if the two drift
  apart again.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate `replaceHistoryState` internals off the removed `PluginApi.buildState` ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  Internal refactor in the shared `browser-env` plugin-utils: `createReplaceHistoryState` now resolves the target route via `buildNavigationState`. Observable behavior is unchanged — same existence check (throws for an unknown route), same forwardTo resolution, and the same query source for the `history.state` record.

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
