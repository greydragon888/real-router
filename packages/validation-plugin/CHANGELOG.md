# @real-router/validation-plugin

## 0.13.22

### Patch Changes

- Updated dependencies [[`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038), [`b7e3ac6`](https://github.com/greydragon888/real-router/commit/b7e3ac6dd7f7e1717797b70d234d3fe822c64038)]:
  - @real-router/core@0.102.0

## 0.13.21

### Patch Changes

- Updated dependencies [[`7f24406`](https://github.com/greydragon888/real-router/commit/7f24406ac163810e616bf6fa0960478af2fea10b)]:
  - @real-router/core@0.101.0

## 0.13.20

### Patch Changes

- [#1905](https://github.com/greydragon888/real-router/pull/1905) [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855) Thanks [@greydragon888](https://github.com/greydragon888)! - Registering routes no longer throws because of a route name the application also defined ([#1852](https://github.com/greydragon888/real-router/issues/1852))

  `validateForwardTo` builds a combined forward map keyed by ROUTE NAME with
  `dst[from] = to`, into a plain `{ ...existing }`. That is `[[Set]]`, so an
  accessor on `Object.prototype` under a route's own name took the write and threw
  out of the validator — measured, `getRoutesApi(router).add([...])` threw and the
  routes were never registered at all. The validator becoming the failure it exists
  to report.

  The write goes through `putField` from `@real-router/core/utils`.

  Part of [#1901](https://github.com/greydragon888/real-router/issues/1901).

- Updated dependencies [[`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855), [`ee5c63c`](https://github.com/greydragon888/real-router/commit/ee5c63c9901b9c9543af07843871c349567bb855)]:
  - @real-router/core@0.100.0

## 0.13.19

### Patch Changes

- Updated dependencies [[`e093c82`](https://github.com/greydragon888/real-router/commit/e093c82931ab92ae0651b482e52d12e797265966)]:
  - @real-router/core@0.99.0

## 0.13.18

### Patch Changes

- [#1887](https://github.com/greydragon888/real-router/pull/1887) [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2) Thanks [@greydragon888](https://github.com/greydragon888)! - docs: `validateResolvedDefaultRoute` runs on `navigateToDefault()` only ([#1876](https://github.com/greydragon888/real-router/issues/1876))

  The JSDoc on `validateResolvedDefaultRoute` said the resolver runs "on every
  `navigateToDefault()` / `start()` fallback". There is no such fallback:
  measured, `start()` consults `defaultRoute` **zero** times — for an empty path,
  an unmatched path and `/` alike, in both `allowNotFound` modes. An unmatched
  start raises `ROUTE_NOT_FOUND`, or commits `UNKNOWN_ROUTE` under
  `allowNotFound: true`.

  No behaviour change; the symbol is internal to the plugin. A `patch` changeset
  because `.changeset/README.md` requires one for any change to a public
  package's source, comment-only edits included.

- Updated dependencies [[`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2), [`821af3f`](https://github.com/greydragon888/real-router/commit/821af3f2f3f3696fe9612dc75cb38f07bf4018d2)]:
  - @real-router/core@0.98.0

## 0.13.17

### Patch Changes

- [#1885](https://github.com/greydragon888/real-router/pull/1885) [`6c1781a`](https://github.com/greydragon888/real-router/commit/6c1781a03d13f279038a04b56f56a16eee812f0d) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: catch a `NaN` limit in `validateDependenciesStructure` ([#1875](https://github.com/greydragon888/real-router/issues/1875))

  `validateDependenciesStructure` tested each limit with `typeof !== "number"`.
  That predicate was written when the router handed the plugin the caller's raw
  value, so a limit spelled `undefined`, `"abc"` or `{}` was caught by it.

  Core now coerces `limits` once at construction, which means every value in that
  store is `typeof "number"` before the plugin ever sees it — and `Number(x)` for
  each of those inputs is `NaN`, which is a number. The check therefore stopped
  diagnosing the exact population it existed for: measured, a router built with
  `{ limits: { maxListeners: undefined } }` was refused at install before the
  coercion moved upstream and installed clean after it.

  The check is now `Number.isInteger`, which lands both mirrors on one predicate —
  `validateLimitValue` already used it on the neighbouring path. The thrown
  message reads `must be an integer, got NaN` where it previously read
  `must be a number, got undefined`.

  ⚠ `Number.isInteger` is strictly stronger than `typeof === "number"`: it also
  rejects `±Infinity` and any float. **No install outcome changes for those** —
  `validateLimitValue` already refused them a few lines later, so `Infinity` as a
  spelling of "no cap" was never installable with this plugin. What changes is
  which of the two mirrors speaks first, and therefore the message: for a
  non-integer numeric limit you now get
  `[validation-plugin] validateDependenciesStructure: deps.limits.<name> …`
  instead of `[router.constructor (retrospective)] limit "<name>" …`. For roughly
  a dozen other shapes the flip runs the other way and the message improves. If
  you match on these strings, they moved.

  **Who is affected:** anyone whose config can produce a non-integer limit — a bag
  from `JSON.parse`, an environment variable, or a value assembled at runtime.
  What returns is the plugin's refusal at install for the `NaN` half.

  ⚠ The router's own behaviour is unchanged for `NaN` specifically (`NaN` and
  `undefined` both compare false, so neither caps). It is **not** unchanged for
  the whole population named above: `null`, `""`, `false` and `[]` used to make
  every `subscribe()` throw on bare core and now mean "no cap" — that half is the
  core change, described in its own changeset.

- Updated dependencies [[`6c1781a`](https://github.com/greydragon888/real-router/commit/6c1781a03d13f279038a04b56f56a16eee812f0d)]:
  - @real-router/core@0.97.3

## 0.13.16

### Patch Changes

- [#1864](https://github.com/greydragon888/real-router/pull/1864) [`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(validation-plugin): the dependency validators refused two shapes core accepts ([#1858](https://github.com/greydragon888/real-router/issues/1858), [#1799](https://github.com/greydragon888/real-router/issues/1799))

  `validateDependenciesObject` and `validateCloneArgs` judged "is this a plain
  object?" by reading `deps.constructor` — the spelling core replaced in [#1858](https://github.com/greydragon888/real-router/issues/1858)
  because it reads a key the caller owns. While these two copies lagged, an
  application running this plugin got a **false reject** on exactly the shapes core
  had just widened: `setDependencies` and `cloneRouter`'s override bag both threw
  on a bag carrying a `constructor` key, which is the [#1858](https://github.com/greydragon888/real-router/issues/1858) defect itself, on a
  different door. A null-prototype bag was refused here and accepted by core.

  This plugin's contract is `plugin ⊇ core` — diagnose more, never refuse what core
  accepts — so a stale mirror is a defect even when the newer half is the one that
  moved. Both now ask the prototype, through a shared `isPlainBag`.

  Their key walks move from `for…in` + `getOwnPropertyDescriptor` to `Object.keys`
  for the same reason core's did ([#1799](https://github.com/greydragon888/real-router/issues/1799)): the two answer about different property
  sets, so the loop iterated exactly the names it could not judge, and on a Proxy
  they disagree about ownership outright.

  The four intrinsics these validators depend on are captured at module load,
  matching `core/src/guards.ts`.

- Updated dependencies [[`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759), [`54ef7cb`](https://github.com/greydragon888/real-router/commit/54ef7cbb3b0455fcdebe3546c4be5ef3104b2759)]:
  - @real-router/core@0.97.0

## 0.13.15

### Patch Changes

- Updated dependencies [[`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c), [`2221e2e`](https://github.com/greydragon888/real-router/commit/2221e2ee1dbc5d4d788ae49032d64c304304525c)]:
  - @real-router/core@0.96.0

## 0.13.14

### Patch Changes

- Updated dependencies [[`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93), [`386b30c`](https://github.com/greydragon888/real-router/commit/386b30cb750d66a836ebe6f5a2da58d4217b7b93)]:
  - @real-router/core@0.95.0

## 0.13.13

### Patch Changes

- Updated dependencies [[`38d4059`](https://github.com/greydragon888/real-router/commit/38d40595953c5bb09e4158f28ca3e821ed93e3f8)]:
  - @real-router/core@0.94.0

## 0.13.12

### Patch Changes

- Updated dependencies [[`52c8108`](https://github.com/greydragon888/real-router/commit/52c81087cb09adcca8951ca6d06e2aa18336b1c2)]:
  - @real-router/core@0.93.0

## 0.13.11

### Patch Changes

- Updated dependencies [[`11f22b1`](https://github.com/greydragon888/real-router/commit/11f22b1d161b8d3c1bc8a676f0e01cbdeb2febc7)]:
  - @real-router/core@0.92.0

## 0.13.10

### Patch Changes

- [#1765](https://github.com/greydragon888/real-router/pull/1765) [`69beff3`](https://github.com/greydragon888/real-router/commit/69beff3f6b2c0f4348a71366be113ea2a05c5936) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(validation-plugin): retire the retrospective dotted-name check — bare core owns the rule now ([#1763](https://github.com/greydragon888/real-router/issues/1763))

  `validateExistingRoutes` rejected a flat dotted route name on the constructor's initial routes. [#1194](https://github.com/greydragon888/real-router/issues/1194) added it for a real hole: `add()` and `replace()` rejected the spelling while the constructor did not, so `createRouter([{ name: "a.c" }])` plus this plugin slipped one past validation into a name-vs-URL split-brain.

  [#1763](https://github.com/greydragon888/real-router/issues/1763) moved that rule to where it belongs — bare core refuses the spelling at registration, with this exact message — so `createRouter` throws before a plugin exists and nothing dotted can reach the retrospective pass. The check was measurably **unreachable**, not defence in depth: `store.definitions` is derived from the tree, whose nested children carry bare names by construction, and its line was the only one in the package without coverage once core began refusing.

  No behaviour change for any caller: the same input still throws, with the same message, one step earlier.

- Updated dependencies [[`69beff3`](https://github.com/greydragon888/real-router/commit/69beff3f6b2c0f4348a71366be113ea2a05c5936)]:
  - @real-router/core@0.91.0

## 0.13.9

### Patch Changes

- Updated dependencies [[`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a), [`d41e09f`](https://github.com/greydragon888/real-router/commit/d41e09f7318bec5d1647955c74a254f5e21cff6a)]:
  - @real-router/core@0.90.0

## 0.13.8

### Patch Changes

- Updated dependencies [[`76a4dfb`](https://github.com/greydragon888/real-router/commit/76a4dfb4337bfc46a24ac0aac45819484d171992)]:
  - @real-router/core@0.89.0

## 0.13.7

### Patch Changes

- Updated dependencies [[`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161), [`5b4a9b7`](https://github.com/greydragon888/real-router/commit/5b4a9b7dc54c159b28b4709a52188e7a035f5161)]:
  - @real-router/core@0.88.0

## 0.13.6

### Patch Changes

- Updated dependencies [[`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084), [`ade54fa`](https://github.com/greydragon888/real-router/commit/ade54fa31b137410ad6d71aa42f3313306b1f084)]:
  - @real-router/core@0.87.0

## 0.13.5

### Patch Changes

- Updated dependencies [[`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a), [`0ca0610`](https://github.com/greydragon888/real-router/commit/0ca0610f7aa477b5e7e081e2addd9495551f7b3a)]:
  - @real-router/core@0.86.0

## 0.13.4

### Patch Changes

- Updated dependencies [[`9df8c95`](https://github.com/greydragon888/real-router/commit/9df8c95d243a56c548be367390513400585e2e6b)]:
  - @real-router/core@0.85.0

## 0.13.3

### Patch Changes

- [#1622](https://github.com/greydragon888/real-router/pull/1622) [`2f3432c`](https://github.com/greydragon888/real-router/commit/2f3432cc1792208ebe85b80e75aa50b0db51ee3e) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `validationPlugin()` generic over the router's dependency map ([#1621](https://github.com/greydragon888/real-router/issues/1621))

  The factory returned `PluginFactory` with the `DefaultDependencies` (= `object`)
  default. `keyof object` is `never`, so `getDependency` was typed
  `(key: never) => never`, and TypeScript 7 — which performs a variance check
  TypeScript 6 skipped — refuses to assign that where `PluginFactory<D>` is
  expected for any `D` with an index signature. Consumers on `typescript@7` (now
  `latest`) typing their dependencies as `Record<string, T>` could not register the
  plugin at all: `router.usePlugin(validationPlugin())` failed with TS2345.

  `validationPlugin<D>()` now carries the caller's map, inferred from the router in
  the usual case. No runtime change, and no source change is required — the type
  parameter defaults exactly as before.

## 0.13.2

### Patch Changes

- Updated dependencies [[`f8ae8a6`](https://github.com/greydragon888/real-router/commit/f8ae8a6b34e587180dcdcfb0a21c5387309325f5)]:
  - @real-router/core@0.84.0

## 0.13.1

### Patch Changes

- Updated dependencies [[`585f435`](https://github.com/greydragon888/real-router/commit/585f4358d1beec9dccae8688d3878f5d589fad89)]:
  - @real-router/core@0.83.0

## 0.13.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Report a query key the active `queryParamsMode` drops ([#1575](https://github.com/greydragon888/real-router/issues/1575))

  Core's mode gate is always-on and SILENT: a query key the active
  `queryParamsMode` will not print never enters `state.search`, so the two
  channels of one state can no longer disagree. The drop is correct, and
  invisible — which is exactly the always-on-fixes / opt-in-diagnoses split the
  channel guard already follows.

  New `state.reportDroppedQueryKey` hook, called by core from the drop itself (so
  the report can never disagree with what was actually dropped) and de-duplicated
  per route+key — the gate runs on every navigation and every `matchPath`, so an
  un-deduped warning would flood a dev console the moment a route is revisited.

  One message covers both ways to hit it, because core cannot tell them apart at
  the drop and a guess would be worse than the plain fact:

  - a caller passing a key the route never declared with `?name`;
  - a `defaultSearch` entry for such a key — **dead config** under `default` /
    `strict`, since the default is dropped along with the key. This is the side
    edge worth naming out loud: nothing the caller wrote is wrong, the route
    config simply cannot take effect.

  Warn, never throw: `queryParamsMode` is a serialization option, not an error
  policy — promoting it to one would give three behaviours for a single rule.

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Accept and validate the new `defaultSearch` router option ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  Without this the plugin rejects the option core just gained —
  `Unknown option: "defaultSearch"` — so the two must ship together.

  `validateDefaultParams` is generalised into `validateDefaultBag`, parameterised
  by the option name and called once per channel, rather than copied: one rule for
  both, so the two option channels cannot drift into accepting different shapes
  for the same kind of value. The thrown message still names the option that was
  actually wrong, which is pinned by a test.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Key the diagnostic de-dup caches per router, not per process ([#1583](https://github.com/greydragon888/real-router/issues/1583))

  Both diagnostics (`reportDroppedQueryKey` [#1575](https://github.com/greydragon888/real-router/issues/1575), `reportUndeclaredParamKey`
  [#1579](https://github.com/greydragon888/real-router/issues/1579)) de-duplicated their warnings in a module-level `Set` — one per PROCESS,
  shared by every router in it. Every consequence pointed the wrong way for a
  dev-time signal:

  - a second router never warned for a `route + key` the first had reported,
    including a `cloneRouter` per-request clone: under SSR/SSG the diagnostic
    fired for request [#1](https://github.com/greydragon888/real-router/issues/1) and stayed silent for the life of the process;
  - `teardown()` did not clear it, so re-registering the plugin bought silence;
  - nothing evicted, so it grew without bound.

  The caches now live on the validator object, which `buildValidatorObject` builds
  once per registration — per-router lifetime, per-router isolation, collected with
  the router, and dropped by `teardown()` along with the validator. No new module
  state: a closure, not a `WeakMap`.

  The two `resetDroppedQueryKeyReports` / `resetUndeclaredParamKeyReports` exports
  are removed. They were internal (never re-exported from the package barrel) and
  existed only so the tests could work around the module scope — a test seam
  compensating for the design rather than the design being per-router.

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Warn when a param key is declared nowhere on the route ([#1579](https://github.com/greydragon888/real-router/issues/1579))

  `state.reportUndeclaredParamKey` implements core's new opt-in sink: a key the
  route names neither as a path slot nor with `?` stays in `state.params` but never
  reaches the URL, so the state cannot be rebuilt from its own `state.path`.

  De-duplicated per route + key, like the mode gate's diagnostic — this runs on
  every navigation, and an un-deduped warning would flood the console on a revisit.
  The message names the key and the route, states what happened, and offers the
  three ways out: declare it on the path, pass it through the `search` channel, or
  keep it deliberately as app-level data.

- Updated dependencies [[`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507), [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507)]:
  - @real-router/core@0.82.0

## 0.12.6

### Patch Changes

- Updated dependencies [[`4ded052`](https://github.com/greydragon888/real-router/commit/4ded052cea81388ea1085653a26631a83da119ca)]:
  - @real-router/core@0.81.0

## 0.12.5

### Patch Changes

- Updated dependencies [[`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427)]:
  - @real-router/core@0.80.0

## 0.12.4

### Patch Changes

- Updated dependencies [[`9b7e541`](https://github.com/greydragon888/real-router/commit/9b7e541f12a2a65148a777eb57ed0212821ab1e0)]:
  - @real-router/core@0.79.0

## 0.12.3

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Drop the `@real-router/logger` dependency ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The standalone `@real-router/logger` package was dissolved into `@real-router/core`. The
  plugin's threshold/overwrite validators now emit through the router's per-instance logger
  (injected via `ctx.logger` in `buildValidatorObject`) instead of the former process-global
  singleton, and `@real-router/logger` is removed from the plugin's dependencies. No public
  API or behavior change — the `RouterValidator` surface core calls into is unchanged.

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Absorb the dissolved `type-guards` package into `src/type-guards/` ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  The former private `type-guards` package was dissolved into its consumers. validation-plugin now owns the guards it used (`getTypeDescription`, `isString`, `isBoolean`, `isObjKey`, `isParams`, `isState`, `isNavigationOptions`, `validateRouteName`) as a local `src/type-guards/` subtree behind a barrel. Internal refactor — no public API or behaviour change.

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source types from `@real-router/core` (was the now-folded `@real-router/types`) ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
  module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
  (wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.

- Updated dependencies [[`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122), [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122)]:
  - @real-router/core@0.78.0

## 0.12.2

### Patch Changes

- Updated dependencies [[`9d1b1b7`](https://github.com/greydragon888/real-router/commit/9d1b1b77a85442cdb46a5ec9dea798a09f6c8243)]:
  - @real-router/core@0.77.0

## 0.12.1

### Patch Changes

- [#1473](https://github.com/greydragon888/real-router/pull/1473) [`814b202`](https://github.com/greydragon888/real-router/commit/814b20240e01b2b5e5ca707f9368f41bfc96159d) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix retrospective dependency-count off-by-one that broke cloneRouter at the limit ([#1225](https://github.com/greydragon888/real-router/issues/1225))

  The retrospective limits pass used `depCount >= maxDependencies`, but the live limiter (`validateDependencyCount`) counts **before** the insert — so a store may legally REACH exactly `maxDependencies`. Because the retrospective re-runs on `usePlugin` and on every `cloneRouter()`, it rejected a state it had itself allowed to be reached, making every SSR per-request clone of an at-limit base throw `RangeError`. Changed `>=` to `>` so an at-limit store passes and only a store that _strictly exceeds_ the limit throws; the message now reads "exceeds" instead of "reaches or exceeds".

## 0.12.0

### Minor Changes

- [#1471](https://github.com/greydragon888/real-router/pull/1471) [`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add proactive listener-count threshold for `subscribe` / `addEventListener` ([#1188](https://github.com/greydragon888/real-router/issues/1188))

  Listeners were the only resource counter without an early-warning threshold: plugins, lifecycle handlers and dependencies each get a `warn@20% / error@50%` signal (`computeThresholds`), but the listener counter silently accumulated up to the core hard cap (`maxListeners`, default 10 000) before throwing a bare `Error`. The plugin now emits an actionable `[router.subscribe]` / `[router.addEventListener]` warn/error well before that cap, catching a listener leak (e.g. a missing `unsubscribe`, [#766](https://github.com/greydragon888/real-router/issues/766)) early. Core keeps its bare-`Error` hard cap as the structural backstop — this only adds the opt-in DX signal, restoring symmetry across all four resource counters.

### Patch Changes

- Updated dependencies [[`943fa4e`](https://github.com/greydragon888/real-router/commit/943fa4efc26a68ad7b5d75d6a4a91ac485cdd10d)]:
  - @real-router/core@0.76.0

## 0.11.0

### Minor Changes

- [#1443](https://github.com/greydragon888/real-router/pull/1443) [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(validation-plugin): stop false-rejecting `add({ parent }) + forwardTo` to a param-carrying sibling ([#1224](https://github.com/greydragon888/real-router/issues/1224))

  `validateForwardToTargets` validated a parented batch "from the root": the forward
  source's available params omitted the parent's path params, so a forward to a
  target needing them (e.g. the parent's `:userId`) was rejected — while bare core
  accepts the same add and runs the forward. The validator now threads `parentName`
  (via the new `RouterValidator.routes.validateRoutes` argument), unions the
  parent's inherited params into the source's available params, and prefixes batch
  names with the parent for the batch-sibling exists-check. No tightening — only
  removal of a false rejection.

- [#1443](https://github.com/greydragon888/real-router/pull/1443) [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor(validation-plugin): remove dead surface — `maxRoutes` phantom, `validateDependencyLimit` stub, orphaned `RouterValidator` wrappers ([#1226](https://github.com/greydragon888/real-router/issues/1226))

  Cleans up mirror-drift found in the wave-2 audit (item 4, the dup-name branch,
  already landed in [#1351](https://github.com/greydragon888/real-router/issues/1351)):

  - **`maxRoutes` phantom** — `checkRouteCountLimit` was unreachable (`LimitsConfig`
    has no `maxRoutes` key and `validateOptions` rejects it); removed the function
    and its white-box tests.
  - **`validateDependencyLimit` dead stub** — the empty wrapper and its orphaned impl
    are removed; the dependency-count limit is enforced by `validateDependencyCount`
    per new key.
  - **Orphaned `RouterValidator` wrappers** (post-[#960](https://github.com/greydragon888/real-router/issues/960)) — the six interface methods
    core never called are dropped from the validator object; every underlying
    file-scope impl stays (each is still called by the retrospective pass or another
    live validator). No behavior change — all removed surface was dead.

### Patch Changes

- Updated dependencies [[`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc), [`baf1769`](https://github.com/greydragon888/real-router/commit/baf17694d75a1d23d2cf0a23ad3bfbc0bcc5d4bc)]:
  - @real-router/core@0.75.0

## 0.10.7

### Patch Changes

- [#1359](https://github.com/greydragon888/real-router/pull/1359) [`88008ce`](https://github.com/greydragon888/real-router/commit/88008ce6118faee4e3b1c446e5fbdb9035633c1e) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove the unreachable retrospective duplicate-name check ([#1226](https://github.com/greydragon888/real-router/issues/1226))

  `validateExistingRoutes` (the retrospective pass run at `usePlugin()` time) carried a duplicate-name detection branch that became dead once bare core rejected duplicate names on every route-population entry point — `createRouter([...])` initial routes ([#1351](https://github.com/greydragon888/real-router/issues/1351)), `add()` (within-batch [#953](https://github.com/greydragon888/real-router/issues/953) plus the "already exists" guard for cross-batch collisions), and `replace()` ([#968](https://github.com/greydragon888/real-router/issues/968)). A built route store can no longer carry a duplicate for the retrospective pass to catch, so the branch was reachable only from white-box unit tests. Removed the branch and its two (identical) tests; core is now the sole authority for the name-uniqueness invariant. No observable behavior change.

- Updated dependencies [[`88008ce`](https://github.com/greydragon888/real-router/commit/88008ce6118faee4e3b1c446e5fbdb9035633c1e)]:
  - @real-router/core@0.74.2

## 0.10.6

### Patch Changes

- Updated dependencies [[`2e5bb3d`](https://github.com/greydragon888/real-router/commit/2e5bb3d6e26524745fd1539b56b64ed708a23910)]:
  - @real-router/core@0.74.0

## 0.10.5

### Patch Changes

- [#1344](https://github.com/greydragon888/real-router/pull/1344) [`55057b2`](https://github.com/greydragon888/real-router/commit/55057b26980674205bccf44d0bb59c8d492461e0) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(validation-plugin): reject flat dotted route names on the constructor's initial routes ([#1194](https://github.com/greydragon888/real-router/issues/1194))

  `add()`/`replace()` already reject a dotted route name (e.g. `{ name: "users.view" }`), but the plugin's retrospective pass (`validateExistingRoutes`, run on `usePlugin(validationPlugin())`) validated only name-is-string / path / duplicates — not the dot rule. So a validation-enabled app that declared a dotted name in `createRouter([...])` still slipped it past validation into a name-vs-URL split-brain (buildPath/matchPath disagree; the route mounts at the wrong URL). The retrospective pass now rejects a dotted `name` on the initial routes too, symmetric with `add()`/`replace()` — use a nested `children` array or the `{ parent }` option instead.

- Updated dependencies [[`55057b2`](https://github.com/greydragon888/real-router/commit/55057b26980674205bccf44d0bb59c8d492461e0)]:
  - @real-router/core@0.73.1

## 0.10.4

### Patch Changes

- Updated dependencies [[`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab), [`67ac26a`](https://github.com/greydragon888/real-router/commit/67ac26a943389fa85c888e21699c164aaa43a7ab)]:
  - @real-router/core@0.73.0

## 0.10.3

### Patch Changes

- Updated dependencies [[`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33), [`a3f60ce`](https://github.com/greydragon888/real-router/commit/a3f60cef1f4034430230133aeb21bac970979f33)]:
  - @real-router/core@0.72.0

## 0.10.2

### Patch Changes

- Updated dependencies [[`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2), [`4416900`](https://github.com/greydragon888/real-router/commit/4416900d1dde1d6e7948a1ea3b3fdede8db256d2)]:
  - @real-router/core@0.71.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da), [`13504a6`](https://github.com/greydragon888/real-router/commit/13504a638f614c5b24b73a68dc367ecb48dee7da)]:
  - @real-router/core@0.70.0

## 0.10.0

### Minor Changes

- [#1308](https://github.com/greydragon888/real-router/pull/1308) [`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate the new `caseSensitive` router option ([#1303](https://github.com/greydragon888/real-router/issues/1303)): accept it as a known option and reject a non-boolean value.

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/core@0.69.0

## 0.9.9

### Patch Changes

- [#1304](https://github.com/greydragon888/real-router/pull/1304) [`2b63604`](https://github.com/greydragon888/real-router/commit/2b636041aa136f4e4e36bda88cb1c7ad8bc33cee) Thanks [@greydragon888](https://github.com/greydragon888)! - Reach the routing engine only through `@real-router/core`, not `route-tree` ([#1301](https://github.com/greydragon888/real-router/issues/1301))

  The plugin no longer imports the foundation package `route-tree`: `validateRoute` now comes from the `@real-router/core/validation` subpath, and forwardTo segment lookup + existence use the matcher's own `getSegmentsByName` / `hasRoute` (the `RouteTree` / `Matcher` types come from core). `route-tree` is dropped from the plugin's devDependencies. Core is now the sole consumer of the routing engine; validation behaviour is unchanged. A package-level guard test prevents re-coupling.

- Updated dependencies [[`2b63604`](https://github.com/greydragon888/real-router/commit/2b636041aa136f4e4e36bda88cb1c7ad8bc33cee)]:
  - @real-router/core@0.68.1

## 0.9.8

### Patch Changes

- Updated dependencies [[`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730), [`0b229e8`](https://github.com/greydragon888/real-router/commit/0b229e88bd57029dab2a7df32189fb52f247f730)]:
  - @real-router/core@0.68.0

## 0.9.7

### Patch Changes

- Updated dependencies [[`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3), [`3561406`](https://github.com/greydragon888/real-router/commit/3561406478cc5d00a012eebeca656e1b3b3d61d3)]:
  - @real-router/core@0.67.0

## 0.9.6

### Patch Changes

- Updated dependencies [[`e07838f`](https://github.com/greydragon888/real-router/commit/e07838f7ad20e5bb3352735bb11f260f686d7c22)]:
  - @real-router/core@0.66.0

## 0.9.5

### Patch Changes

- Updated dependencies [[`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47), [`fb99baf`](https://github.com/greydragon888/real-router/commit/fb99bafcfec02d876d3107c620d62b23e192be47)]:
  - @real-router/core@0.65.0

## 0.9.4

### Patch Changes

- Updated dependencies [[`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8), [`f80df75`](https://github.com/greydragon888/real-router/commit/f80df75ae7d3b007f3606f0b9446a01e79ab87b8)]:
  - @real-router/core@0.64.0

## 0.9.3

### Patch Changes

- Updated dependencies [[`25d6fd8`](https://github.com/greydragon888/real-router/commit/25d6fd856c68d8d75cecd14815972415480a7677)]:
  - @real-router/core@0.63.0

## 0.9.2

### Patch Changes

- [`a12fbd9`](https://github.com/greydragon888/real-router/commit/a12fbd9c33daa401b48b0b10e8749c60c6ab6b40) Thanks [@greydragon888](https://github.com/greydragon888)! - Widen `@real-router/core` peer range to prevent unwanted major bumps (changesets/changesets#822)

  The peer dependency was `workspace:^`, published as `^0.62.2` — patch-only on 0.x,
  so any core minor bump went out of range and changesets escalated this package to a
  major bump. Changed to `workspace:>=0.1.0` (publishes as `>=0.1.0`), keeping core
  minor bumps in range. Backward-compatible range widening — no consumer breakage;
  works in tandem with the existing `onlyUpdatePeerDependentsWhenOutOfRange: true`.

## 0.9.1

### Patch Changes

- [#1059](https://github.com/greydragon888/real-router/pull/1059) [`f651de1`](https://github.com/greydragon888/real-router/commit/f651de15eb97c671ad1520fa90bd3619ce96eadd) Thanks [@greydragon888](https://github.com/greydragon888)! - Never-crash on an adversarial throwing accessor in route/param validation ([#1052](https://github.com/greydragon888/real-router/issues/1052))

  `getTypeDescription` and `isParams`/`isParamsStrict` read `constructor`/`.name`/property values without a `try/catch`, so an adversarial **throwing accessor** — a `constructor`/`.name` getter that throws, or a `Proxy` that throws on `[[Get]]` — made them throw the caller's exception instead of returning their documented fallback, breaking the [#787](https://github.com/greydragon888/real-router/issues/787)/[#903](https://github.com/greydragon888/real-router/issues/903)/[#786](https://github.com/greydragon888/real-router/issues/786) never-crash contract. These paths are reachable only through `@real-router/validation-plugin` (route-tree's `validateRoute` and the type-guards guards run in the plugin's always-on validators). The reads are now wrapped in `try/catch` (returning `"object"` / `false` — the same fallback as the non-function-value branch) in both `getTypeDescription` copies (type-guards + route-tree's twin) and the `isParams`/`isParamsStrict` walks, so the plugin surfaces a clean `[router.addRoute] … must be …` `TypeError` instead of leaking the getter's exception. Not reachable from untrusted input (URL params are strings; `history.state` is structured-clone and cannot carry getters/Proxies).

## 0.9.0

### Minor Changes

- [#1035](https://github.com/greydragon888/real-router/pull/1035) [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5) Thanks [@greydragon888](https://github.com/greydragon888)! - Drop `maxEventDepth` from limits validation ([#1033](https://github.com/greydragon888/real-router/issues/1033))

  `maxEventDepth` was removed from `LimitsConfig` (the event emitter now coalesces re-entrant emits instead of bounding recursion depth). The validation plugin no longer recognizes or range-checks it.

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0

## 0.8.4

### Patch Changes

- [#997](https://github.com/greydragon888/real-router/pull/997) [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject NUL / control characters in param values and start paths ([#942](https://github.com/greydragon888/real-router/issues/942))

  A NUL byte or C0/DEL control character in a param value or a `start()` path is silently percent-encoded into `state.path` (`%00`, `%01`) by bare core, admitting unreadable paths into committed state. The opt-in validator now rejects them: `validateParams` flags a control character inside a string param value, and `validateStartArgs` flags one in the start path — both with an actionable `TypeError`.

- [#997](https://github.com/greydragon888/real-router/pull/997) [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject Symbol / BigInt param values with an actionable error ([#934](https://github.com/greydragon888/real-router/issues/934))

  A `Symbol` (or `BigInt`) used as a navigation param value cannot round-trip through a URL path — a Symbol path-param keeps its raw identity in `state.params` (the path stringifies to `/items/Symbol(x)` and never matches back), and bare core accepts it silently. `validateParams` now inspects each param value and rejects a `symbol` / `bigint` with a precise, key-named message (`param "id" cannot be a symbol …`) instead of the generic "params must be a plain object" shape error. Value inspection is own-property only, mirroring `isParams`.

- Updated dependencies [[`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee), [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee), [`37fca02`](https://github.com/greydragon888/real-router/commit/37fca0233907e659b36d3bbc423883bc917756ee)]:
  - @real-router/core@0.61.10

## 0.8.3

### Patch Changes

- [#974](https://github.com/greydragon888/real-router/pull/974) [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606) Thanks [@greydragon888](https://github.com/greydragon888)! - Enforce the lifecycle-handler limit on route-config guards ([#961](https://github.com/greydragon888/real-router/issues/961))

  - `validateHandlerLimit` now reads `maxLifecycleHandlers` from the router options — the same source as the approaching-limit warning — instead of a caller-supplied value. Combined with the core change, the hard throw now fires for guards registered via route config, not just the programmatic API.

- Updated dependencies [[`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606), [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606), [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606), [`442138e`](https://github.com/greydragon888/real-router/commit/442138ed0a0deba4cb65787a062e345243230606)]:
  - @real-router/core@0.61.2

## 0.8.2

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0

## 0.8.1

### Patch Changes

- [#913](https://github.com/greydragon888/real-router/pull/913) [`80fdfcd`](https://github.com/greydragon888/real-router/commit/80fdfcd8b5c33269fab4e1314ff1b8092774d215) Thanks [@greydragon888](https://github.com/greydragon888)! - Implement duplicate-plugin detection ([#726](https://github.com/greydragon888/real-router/issues/726))

  `validateNoDuplicatePlugins` was an inert no-op, so re-registering the same plugin factory under the validation plugin (`usePlugin(f); usePlugin(f)` without `unsubscribe()` in between) was silently accepted — registering double interceptors. It now throws `[router.usePlugin] Plugin factory already registered.`.

  Plugins that claim a context namespace (e.g. `persistent-params`) already failed on double-init via core's `claimContextNamespace` collision guard; this closes the gap for plugins that **don't** claim a namespace, where core had no backstop. The check only runs when `@real-router/validation-plugin` is registered; distinct factories are unaffected.

## 0.8.0

### Minor Changes

- [#907](https://github.com/greydragon888/real-router/pull/907) [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove dead `validateNotRegistering` validator ([#906](https://github.com/greydragon888/real-router/issues/906))

  Drops the `validateNotRegistering` implementation (`validators/lifecycle.ts`) and its wiring in `validationPlugin.ts` — it implemented a `RouterValidator` member that core never invoked (dead on both ends). No change to `validationPlugin()` behavior.

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.7.12

### Patch Changes

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate deeply-nested params without overflowing the call stack ([#901](https://github.com/greydragon888/real-router/issues/901))

  `isParams` / `isState` (bundled `type-guards`) validated user-supplied params with a recursive walk that threw `RangeError: Maximum call stack size exceeded` on objects nested past ~2.4k levels — reachable from deeply-nested params passed to `navigate` / `makeState`. The walk is now iterative, so validation returns a boolean (and the plugin's contextual `TypeError`) at any nesting depth instead of crashing with an unrelated `RangeError`.

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep `[method]` context in route-validation messages for adversarial input ([#903](https://github.com/greydragon888/real-router/issues/903))

  `validateRoute` (from `route-tree`, used by the plugin's route validators) built its `TypeError` messages through a `getTypeDescription` helper that crashed on a value with an adversarial own `constructor` — e.g. `addRoute({ name: { constructor: null }, path: "/x" })` threw `Cannot read properties of null (reading 'name')` instead of `[router.addRoute] Route name must be a string`. The helper now reads `constructor` defensively, so the contextual validation error is preserved. (Sibling of [#787](https://github.com/greydragon888/real-router/issues/787), which fixed the same defect in `type-guards`.)

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - Accept shared references / diamonds in params validation ([#786](https://github.com/greydragon888/real-router/issues/786))

  `isParams` no longer rejects fully serializable params that reuse the same object or array under multiple keys (a diamond / DAG, not a cycle). Navigating or building a state with a shared default object — e.g. `navigate("route", { a: shared, b: shared })` — no longer fails validation with a false `Invalid params`. Genuine circular references are still rejected.

- [#904](https://github.com/greydragon888/real-router/pull/904) [`cf9f335`](https://github.com/greydragon888/real-router/commit/cf9f335bdcaa906fd684528277ce0528890c306f) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep `[method]` context in validation messages for adversarial input ([#787](https://github.com/greydragon888/real-router/issues/787))

  `getTypeDescription` (used to build the plugin's `TypeError` messages) crashed on a value with an adversarial own `constructor` — `{ constructor: null }` threw `Cannot read properties of null (reading 'name')` — and returned a non-string for `{ constructor: "evil" }`. Validating such input now yields the proper `[method] Invalid … structure` message instead of a bare, context-less `TypeError`.

## 0.7.11

### Patch Changes

- [#889](https://github.com/greydragon888/real-router/pull/889) [`c6560a1`](https://github.com/greydragon888/real-router/commit/c6560a1c7326df939edda51f86fd0c1952d7a5dd) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove dead `validateLoggerOption` ([#789](https://github.com/greydragon888/real-router/issues/789))

  The Router constructor consumes `options.logger` and strips the key before options are stored, so the retrospective pass always saw `logger: undefined` and `validateLoggerOption` never ran on the live path. Logger config is validated solely by core's `isLoggerConfig` guard at construction — the only place the input exists. Removes the unreachable validator, its `VALID_LOGGER_LEVELS` constant, and the now-unreachable `callbackIgnoresLevel`-without-`callback` diagnostic. Behavior-neutral on any reachable path.

- Updated dependencies [[`c6560a1`](https://github.com/greydragon888/real-router/commit/c6560a1c7326df939edda51f86fd0c1952d7a5dd)]:
  - @real-router/core@0.59.4

## 0.7.10

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.7.9

### Patch Changes

- [#864](https://github.com/greydragon888/real-router/pull/864) [`bc01f46`](https://github.com/greydragon888/real-router/commit/bc01f4695ac70b4ce5dd06e2368952909d27b7af) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject name-less parameter markers (`:`/`*` with no name) at route validation ([#863](https://github.com/greydragon888/real-router/issues/863))

  `validateRoute` now rejects paths whose `:`/`*` marker has no name — `/x/:`, `/x/*`, `/x/:?`, `/x/:<\d+>` — instead of letting them pass and fail later at the matcher (`registerTree`, [#858](https://github.com/greydragon888/real-router/issues/858)) with a non-route-contextual error. Validation now fails fast with `[router.<method>] Invalid path for route "<name>": parameter marker (':' or '*') without a name`. The check derives from path-matcher's single `PARAM_NAME_PATTERN` grammar (so the validation gate cannot drift from the matcher) and scans only the URL-path portion, so a `:`/`*` inside a query declaration (`/x?:`) is not flagged. A bare `/*` is not a catch-all — use the named `/*rest`.

## 0.7.8

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.7.7

### Patch Changes

- [#853](https://github.com/greydragon888/real-router/pull/853) [`30da63d`](https://github.com/greydragon888/real-router/commit/30da63d6c467b537174aa628cb99f43293e44fc6) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject unbalanced constraint delimiters in route paths ([#749](https://github.com/greydragon888/real-router/issues/749))

  `validateRoute` now rejects route paths with an unbalanced `<` or `>` constraint
  delimiter (e.g. `/u/:id<\d+` with no closing `>`, or a dangling `/u/:id<`).
  Previously these passed validation but crashed later in `buildPath` with
  `Missing required param` — the param name was truncated at the stray `<` while
  the unclosed constraint survived as a literal in the trie node path.

  Balanced constraints and hyphenated param names (`/a/:id<\d?>`, `/h/:my-param`)
  continue to pass — those were fixed by [#738](https://github.com/greydragon888/real-router/issues/738) and are valid configs.

- Updated dependencies [[`30da63d`](https://github.com/greydragon888/real-router/commit/30da63d6c467b537174aa628cb99f43293e44fc6), [`30da63d`](https://github.com/greydragon888/real-router/commit/30da63d6c467b537174aa628cb99f43293e44fc6)]:
  - @real-router/core@0.57.2

## 0.7.6

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.7.5

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0

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

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `validateNavigateToStateArgs` validator for `api.navigateToState` ([#525](https://github.com/greydragon888/real-router/issues/525))

  New validator function and `RouterValidator` namespace entry covering the
  new `getPluginApi(router).navigateToState(state, opts)` primitive:
  - Rejects `state` that is not an object or is `null` with `TypeError`.
  - Rejects `state` missing required structural fields (`name`, `params`,
    `path`) or with wrong types per `isString` / `isParams`.

  Wired through `validationPlugin` so `ctx.validator?.navigation.validateNavigateToStateArgs(state)` is called from the core's `getPluginApi.navigateToState` boundary when the plugin is registered.

  No public API surface change for validation-plugin consumers — the
  validator is invoked indirectly by core when validation-plugin is active.

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.6.0

### Minor Changes

- [#484](https://github.com/greydragon888/real-router/pull/484) [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23) Thanks [@greydragon888](https://github.com/greydragon888)! - Log error when `logger.callbackIgnoresLevel` is set without `logger.callback` ([#471](https://github.com/greydragon888/real-router/issues/471))

  `callbackIgnoresLevel` only has meaning when a `callback` is provided; setting it alone was a silent no-op. `validateOptions` now emits `logger.error` in that case — the option is non-load-bearing, so throwing would be overreach, but a silent ignore left users debugging phantom log-filter behavior.

  The check fires whenever `validateOptions` runs (router construction via retrospective pass, direct calls via `RouterValidator.options.validateOptions`).

- [#484](https://github.com/greydragon888/real-router/pull/484) [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23) Thanks [@greydragon888](https://github.com/greydragon888)! - Validate `defaultRoute` resolves to an existing route ([#471](https://github.com/greydragon888/real-router/issues/471))

  `validationPlugin` now verifies that `options.defaultRoute` points to a route that actually exists in the route tree:
  - **Static string `defaultRoute`** — checked at `router.usePlugin(validationPlugin())` time. A non-existent name throws immediately with `[validation-plugin] defaultRoute resolved to non-existent route: "<name>"`.
  - **`DefaultRouteCallback`** — checked at runtime inside `resolveDefault()` on every `navigateToDefault()` / `start()` invocation. A callback that returns a non-existent route name surfaces as `Promise.reject` from `navigateToDefault()` with the same error message instead of the previous opaque `ROUTE_NOT_FOUND`.

  Callbacks are **not** probed at registration time — their return value depends on dependencies that may not be registered yet. The runtime check guarantees that a bad return value is diagnosed on first navigation with a pointer to the callback as the source, rather than the generic `ROUTE_NOT_FOUND` at an unrelated call site.

- [#484](https://github.com/greydragon888/real-router/pull/484) [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject `warnListeners > maxListeners` cross-field combination ([#471](https://github.com/greydragon888/real-router/issues/471))

  `validateLimits` now throws `RangeError` when `limits.warnListeners` exceeds `limits.maxListeners` (and `maxListeners > 0`). Previously both bounds were checked only in isolation, so `{ warnListeners: 5000, maxListeners: 100 }` passed validation yet the warning channel was dead code — the hard cap would always fire first.

  The check fires both on router construction (when validation-plugin is installed) and through any direct `validateOptions` / `validateLimits` call. `maxListeners: 0` (unlimited) disables the cross-check, matching the existing "0 means unlimited" convention.

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

## 0.5.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/logger@0.3.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.4.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/logger@0.2.3

## 0.4.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/logger@0.2.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

## 0.4.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Support `TRANSITION_LEAVE_APPROVE` event validation ([#391](https://github.com/greydragon888/real-router/issues/391))

  Added `onTransitionLeaveApprove` to valid plugin methods and `$$leaveApprove` to valid event names.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

## 0.3.1

### Patch Changes

- [#389](https://github.com/greydragon888/real-router/pull/389) [`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780) Thanks [@greydragon888](https://github.com/greydragon888)! - Update valid `booleanFormat` values: `"string"` renamed to `"auto"` ([#387](https://github.com/greydragon888/real-router/issues/387))

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

## 0.3.0

### Minor Changes

- [#384](https://github.com/greydragon888/real-router/pull/384) [`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `numberFormat` validation support ([#383](https://github.com/greydragon888/real-router/issues/383))

  Validate `queryParams.numberFormat` option — accepts `"none"` or `"auto"`, throws `TypeError` for invalid values.

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

## 0.2.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `forceId` validation from `validateMakeStateArgs` ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `validateMakeStateArgs` no longer accepts or validates `forceId` parameter (4th argument removed).

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

## 0.1.0

### Minor Changes

- d1ebff8: Implement Phase 2 validator slots: options, dependencies, plugins, lifecycle, routes (#334)

  17 new validator implementations: `validateOptions` (retrospective), `validateDependencyCount`, `validateCloneArgs`, `validatePluginKeys`, threshold warnings, overwrite warnings, async guard detection. Property-based tests verify invariants across ~58k generated inputs.

- d1ebff8: New package: extract DX validation from core into opt-in plugin (#334)

  `@real-router/validation-plugin` provides the full validation layer previously built into `@real-router/core`. Register before `router.start()` to enable descriptive type errors and argument checks across all router operations.

  ```typescript
  import { validationPlugin } from "@real-router/validation-plugin";

  const router = createRouter(routes);
  router.usePlugin(validationPlugin()); // opt in to DX validation
  await router.start();
  ```

  The plugin runs retrospective validation at registration time, catching route tree errors that occurred before `usePlugin()` was called.

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
