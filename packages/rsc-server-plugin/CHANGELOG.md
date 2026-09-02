# @real-router/rsc-server-plugin

## 0.3.7

### Patch Changes

- [#2076](https://github.com/greydragon888/real-router/pull/2076) [`5a672d3`](https://github.com/greydragon888/real-router/commit/5a672d314016f9f88e4ccb8f548f9b757dd998f2) Thanks [@greydragon888](https://github.com/greydragon888)! - The deferred-promise record reads a captured `Object.create` ([#2072](https://github.com/greydragon888/real-router/issues/2072))

  The per-request record of deferred promises is prototype-less so a loader key
  named after an `Object.prototype` member cannot resolve through the chain. It
  was built through the live `Object.create`; it now reads a module-load capture
  ([#2072](https://github.com/greydragon888/real-router/issues/2072)).

  ⚠ Capture narrows the window from "any time after boot" to "before this module
  loads"; a shim evaluated ahead of the router still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)). It is robustness
  against polyfills, instrumentation, extensions and test doubles, not a security
  boundary.

- [#2076](https://github.com/greydragon888/real-router/pull/2076) [`5a672d3`](https://github.com/greydragon888/real-router/commit/5a672d314016f9f88e4ccb8f548f9b757dd998f2) Thanks [@greydragon888](https://github.com/greydragon888)! - The deferred wrapper reads a captured `Object.freeze` ([#2073](https://github.com/greydragon888/real-router/issues/2073))

  A value this package freezes at RUNTIME was frozen through the live
  `Object.freeze`, so an application that re-pointed the intrinsic after boot got
  back an object that is not frozen at all. It now reads a module-load capture.

  ⚠ Capture narrows the window from "any time after boot" to "before this module
  loads"; a shim evaluated ahead of the router still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)). It is robustness
  against polyfills, instrumentation, extensions and test doubles, not a security
  boundary. Module-scope constants are out of scope by the same argument — they are
  frozen before any application code can run.

## 0.3.6

### Patch Changes

- [#2068](https://github.com/greydragon888/real-router/pull/2068) [`11db2e0`](https://github.com/greydragon888/real-router/commit/11db2e0999cb3e556729d24cb35821a59bca4740) Thanks [@greydragon888](https://github.com/greydragon888)! - The post-hydration loader skip is keyed by the committed state, not by its route name ([#2060](https://github.com/greydragon888/real-router/issues/2060))

  This plugin shares `createSsrLoaderPlugin` with
  `@real-router/ssr-data-plugin` via `shared/ssr`, so it gains the same gate: the
  payload's `name`, `params` and `search` must agree with what matching its
  `path` produced, or the loader runs. Under this package's Variant-B in-memory
  handoff the payload is the server's own `State`, so the agreement holds by
  construction.

  ⚠ What the gate cannot check — a `context` built for a different state behind a
  self-consistent envelope — is a written contract: build the payload for the
  state you hydrate. See that package's changeset for the measurements.

## 0.3.5

### Patch Changes

- [#2065](https://github.com/greydragon888/real-router/pull/2065) [`fed5fab`](https://github.com/greydragon888/real-router/commit/fed5fabd1ff5575219bdfcc90b1990a0a351633e) Thanks [@greydragon888](https://github.com/greydragon888)! - `defer()` reads the caller's deferred bag once, and ships what it validated ([#1914](https://github.com/greydragon888/real-router/issues/1914))

  This package bundles the same `shared/ssr/defer.ts` module, so the fix in its
  sibling changeset is the same code here: one snapshot, validated and frozen, so
  an accessor-backed bag cannot answer the validator and the payload differently.

  ⚑ `defer` is not in this package's public API, and this plugin configures no
  deferred namespaces — so the reachable surface is a consumer that imports `defer`
  from `@real-router/ssr-data-plugin` and returns it from an rsc loader. What
  happens to such a payload here is [#1917](https://github.com/greydragon888/real-router/issues/1917)'s subject, not this one's.

- [#2065](https://github.com/greydragon888/real-router/pull/2065) [`fed5fab`](https://github.com/greydragon888/real-router/commit/fed5fabd1ff5575219bdfcc90b1990a0a351633e) Thanks [@greydragon888](https://github.com/greydragon888)! - The SSR mode marker is published on every navigation ([#1915](https://github.com/greydragon888/real-router/issues/1915))

  This package shares `shared/ssr/createSsrLoaderPlugin.ts`, so `getSsrRscMode` had
  the identical defect: after any client navigation it answered `"full"` for a
  route declared `ssr: false`, because only `start()` wrote the marker it reads.

  The marker write moved above the staleness gate in the `subscribeLeave` listener,
  which already ran on every navigation. `getSsrRscMode` now answers the same for a
  route whether it was started or navigated to.

- [#2065](https://github.com/greydragon888/real-router/pull/2065) [`fed5fab`](https://github.com/greydragon888/real-router/commit/fed5fabd1ff5575219bdfcc90b1990a0a351633e) Thanks [@greydragon888](https://github.com/greydragon888)! - A `defer()` payload is refused, not written to the `rsc` slot ([#1917](https://github.com/greydragon888/real-router/issues/1917))

  A loader returning `defer({ critical, deferred })` had the whole payload written
  to `state.context.rsc` as if it were a `ReactNode`. The deferred promises were
  never awaited, and their rejections vanished without a trace — `defer()` attaches
  a no-op `.catch()` to every promise it accepts, so the failure produced **zero**
  diagnostics: no unhandled rejection, no warning, and a `ReactNode` slot holding a
  plain object.

  This plugin configures no deferred namespaces, so the guard that selects the
  split branch was short-circuited and its else-branch meant "write it as data".
  That is a configuration error the plugin can name, and it now does.

  ⚑ `isDeferred` is unchanged, deliberately. Requiring `critical` / `deferred`
  fields from it would retire `INVARIANTS.md` [#7](https://github.com/greydragon888/real-router/issues/7) — a pinned contract whose property
  test states that its own failure IS the contract-change signal — and would make
  this very case SILENT again, by sending a branded-but-fieldless payload into the
  plain-data branch. The refusal is keyed on the brand and on the absent channel,
  which is what the configuration error actually is.

- [#2065](https://github.com/greydragon888/real-router/pull/2065) [`fed5fab`](https://github.com/greydragon888/real-router/commit/fed5fabd1ff5575219bdfcc90b1990a0a351633e) Thanks [@greydragon888](https://github.com/greydragon888)! - A resolver returning a boolean is refused with a message that says why ([#1918](https://github.com/greydragon888/real-router/issues/1918))

  This package shares `resolveMode`, so the same asymmetry applied: `ssr: false`
  worked and `ssr: () => false` threw with a list of allowed strings that never
  mentioned the static slot. The refusal is unchanged — it is what
  `SsrModeResolver` contracts — and the message now names the resolver, the value,
  and the shorthand to write instead.

- [#2065](https://github.com/greydragon888/real-router/pull/2065) [`fed5fab`](https://github.com/greydragon888/real-router/commit/fed5fabd1ff5575219bdfcc90b1990a0a351633e) Thanks [@greydragon888](https://github.com/greydragon888)! - The staleness flag is cleared after the write, not before it ([#1916](https://github.com/greydragon888/real-router/issues/1916))

  This package shares the `subscribeLeave` refresh path, so its `invalidate()`
  channel had the same ordering: `clearStale` ran ahead of `writeLoaderResult`, and
  a write that throws consumed the retry for a refresh that never happened.

  ⚑ The trigger is sharper here after [#1917](https://github.com/greydragon888/real-router/issues/1917): an rsc loader returning a `defer()`
  payload is now refused, and that refusal is a write that throws. Without this
  ordering fix the two changes would have combined into "the navigation fails and
  the retry is silently spent".

## 0.3.4

### Patch Changes

- [#2062](https://github.com/greydragon888/real-router/pull/2062) [`cf1d756`](https://github.com/greydragon888/real-router/commit/cf1d756f9bb46be1747731b4af74e4c5f2de5d18) Thanks [@greydragon888](https://github.com/greydragon888)! - The SSR loader factory reads caller-supplied bags by own key ([#1835](https://github.com/greydragon888/real-router/issues/1835))

  This package and `@real-router/ssr-data-plugin` consume one generic factory,
  `shared/ssr/createSsrLoaderPlugin.ts`, so the CODE in its sibling changeset is
  the same code here: the compiler and the validator now gate each entry's
  `ssr` / `loader` with `Object.hasOwn`, the hydration scratchpad's deferred-keys
  namespace is read by own key, a non-null object is required before the scratchpad
  is consulted, and a branded payload's shape is checked before anything is
  written.

  ⚠ Sharing the code does not mean sharing the symptom, and one of the four
  diverges — see below.

  The loader hijack needed no deferred namespaces and reproduced here exactly as it
  did there; measured after the fix, an inherited `loader` runs zero times.

  ⚑ The forged-brand item did NOT reproduce here, and the fix does not make the two
  plugins agree — it makes the disagreement safe on the side that was unsafe. This
  plugin configures no deferred namespaces, so `deferredClaims` is `null` and
  `isDeferred` is never consulted; measured, a branded payload resolves normally
  and lands in `state.context.rsc` verbatim. What changed is the other side:
  `ssr-data-plugin` used to write two claims and then reject on a bare
  `Cannot convert undefined or null to object`, and now refuses before writing
  anything.

## 0.3.3

### Patch Changes

- [#1995](https://github.com/greydragon888/real-router/pull/1995) [`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195) Thanks [@greydragon888](https://github.com/greydragon888)! - Deciding intrinsics in the shared sources are captured at module load ([#1971](https://github.com/greydragon888/real-router/issues/1971))

  This package bundles `shared/ssr`, whose reads of
  `Object.keys` / `hasOwn` / `entries` / `values` / `getPrototypeOf` went to the
  live global and can be re-pointed after boot. They are now read once at module
  load, the doctrine `guards.ts` states for core and the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971) extended
  to the shared half.

  The reads decide what is on an object the module did not build, so a re-pointed
  intrinsic changes a verdict rather than a value.

  ⚠ **What capture does NOT buy**, stated because the doctrine states it: it
  narrows the window from "any time after boot" to "before the module loads". A
  shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
  This is robustness against polyfills, RUM/APM instrumentation, browser extensions
  and test doubles — not a security boundary, since re-pointing `Object.keys`
  already requires script execution.

  No behaviour change in a healthy environment: an intrinsic nobody touched answers
  the same either way.

## 0.3.2

### Patch Changes

- [#1919](https://github.com/greydragon888/real-router/pull/1919) [`6013bb0`](https://github.com/greydragon888/real-router/commit/6013bb0a4d99816af814a620a09a1f46aa724581) Thanks [@greydragon888](https://github.com/greydragon888)! - The `shared/ssr` sources this package bundles are now linted ([#1913](https://github.com/greydragon888/real-router/issues/1913))

  No behaviour change, and no change to this package's own `lint` script.

  `shared/ssr/` is symlinked into both SSR plugins and was invisible to every lint
  run: `eslint`'s globs do not descend into a symlinked directory while walking a
  parent. It is now linted exactly once, by `@real-router/ssr-data-plugin` — the
  package that already owns the directory for coverage — so the same nine files are
  not reported two, three or five times over. A repo gate
  (`scripts/check-coverage-scope.mjs`) derives that owner from the filesystem and
  fails if its lint script stops passing the alias.

  What that surfaced and fixed in code this package ships: 49 problems (41 errors +
  8 warnings), of which four were conditions TypeScript believes can never fire.
  All four are deliberate runtime guards where the type does not bind the caller,
  and each now carries that reason instead of being deleted. The rest were short
  identifiers, brace style, redundant assertions, and one validator split into two
  functions — verified message-for-message against the previous implementation.

  ⚑ `Promise.withResolvers` is deliberately NOT adopted in the client-side defer
  registry, which this package also bundles: it is ES2024 (Chrome 119, Firefox 121,
  Safari 17.4), so taking it would drop every Safari below 17.4. That is a decision
  about supported runtimes, not a lint fix.

## 0.3.1

### Patch Changes

- [#1909](https://github.com/greydragon888/real-router/pull/1909) [`44f11bb`](https://github.com/greydragon888/real-router/commit/44f11bb63dfd278b44cf16880a6e11bce721ec34) Thanks [@greydragon888](https://github.com/greydragon888)! - Hydration asks whether the server really answered, not whether the name is on the prototype ([#1838](https://github.com/greydragon888/real-router/issues/1838))

  The SSR loader factory (`shared/ssr/createSsrLoaderPlugin.ts`, shared by both
  loader plugins) decided "did the server already fill my namespace?" with
  `config.namespace in hydrationState.context`. The context arrives from
  `JSON.parse` of the SSR payload, so its prototype is `Object.prototype`, and the
  namespace is a developer-chosen string that core accepts as long as it is a
  non-empty string.

  Measured on a parsed context:

  ```
  namespace     in      hasOwn   typeof context[ns]
  data         true     true     object      ← a real server answer
  missing      false    false    undefined
  toString     true     false    function    ← a false "the server answered"
  constructor  true     false    function
  ```

  So a plugin whose namespace collided with a prototype member skipped re-running
  its loader on the client and published the native method as the server's data.

  `Object.hasOwn` keeps the documented "presence wins" rule exactly — an own
  `undefined` left in the namespace still counts as the server's authoritative
  answer, which is what the in-memory hydration paths rely on — and removes only
  the inherited false positive.

  Part of [#1901](https://github.com/greydragon888/real-router/issues/1901).

## 0.3.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Two-channel RSC loader target — `{ params, search }` ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  `RscLoaderFn` now receives `({ params, search }, context?)` instead of
  `(params, context?)` (RFC-4 M2), mirroring `ssr-data-plugin`. Closes the same
  query-param gap: a loader reading a query param now reads `target.search.x`.
  New `RscLoaderTarget` type is exported. Breaking loader signature (pre-1.0);
  migrate `(params) => …` to `({ params }) => …`.

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Correct the `invalidate` JSDoc reload example to the four-slot signature ([#1586](https://github.com/greydragon888/real-router/issues/1586))

  The "explicit await — pair with a same-route reload" snippet taught
  `router.navigate(state.name, state.params, { reload: true })`. Slot 3 has been
  the query channel since RFC-4 M2 ([#1548](https://github.com/greydragon888/real-router/issues/1548)), so that form puts `{ reload: true }`
  in `search` — the reload never fires and the rebuilt URL loses the page's own
  query. The same snippet in `shared/ssr/staleRegistry.ts` (symlinked into both
  SSR loader plugins) is corrected alongside it.

## 0.2.14

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source types from `@real-router/core` (was the now-folded `@real-router/types`) ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
  module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
  (wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.

## 0.2.13

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/types@0.39.0

## 0.2.12

### Patch Changes

- [#1138](https://github.com/greydragon888/real-router/pull/1138) [`c48e5b9`](https://github.com/greydragon888/real-router/commit/c48e5b903ca245f6c0be4aa2fa7b44ed98c93f53) Thanks [@greydragon888](https://github.com/greydragon888)! - Handle a hydration source without a `context` field without crashing ([#762](https://github.com/greydragon888/real-router/issues/762))

  `rsc-server-plugin` shares the SSR loader factory with `ssr-data-plugin`. A partial hydration source object (`{ name, path }` with no `context`) previously crashed `start()` with a bare `TypeError: Cannot use 'in' operator to search for 'rsc' in undefined`. The factory now guards `hydrationState.context !== undefined` before the namespace lookup, so a missing context falls through to the loader. No API change.

## 0.2.11

### Patch Changes

- [#1134](https://github.com/greydragon888/real-router/pull/1134) [`6be188f`](https://github.com/greydragon888/real-router/commit/6be188f097f6fe3c9db39520bd15814a96f22394) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep the server-only defer wire-format out of the client `.` bundle ([#761](https://github.com/greydragon888/real-router/issues/761))

  `rsc-server-plugin` shares `shared/ssr` with `ssr-data-plugin`. Splitting `deferRegistry.ts` into a client registry module and a server-only `deferWireFormat.ts` removes the dead defer wire-format — including its impure module-level `RegExp` initialiser — from the chunk behind `dist/esm/index.mjs`. RSC never calls `defer()`, so this code was pure dead weight in the client bundle. No API or runtime behavior change.

## 0.2.10

### Patch Changes

- [`a12fbd9`](https://github.com/greydragon888/real-router/commit/a12fbd9c33daa401b48b0b10e8749c60c6ab6b40) Thanks [@greydragon888](https://github.com/greydragon888)! - Widen `@real-router/core` peer range to prevent unwanted major bumps (changesets/changesets#822)

  The peer dependency was `workspace:^`, published as `^0.62.0` — patch-only on 0.x,
  so any core minor bump went out of range and changesets escalated this package to a
  major bump. Changed to `workspace:>=0.1.0` (publishes as `>=0.1.0`), keeping core
  minor bumps in range. Backward-compatible range widening — no consumer breakage;
  works in tandem with the existing `onlyUpdatePeerDependentsWhenOutOfRange: true`.

## 0.2.9

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/types@0.38.0

## 0.2.8

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/types@0.37.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.2.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Skip loader call on hydration when `rsc` namespace is pre-resolved ([#596](https://github.com/greydragon888/real-router/issues/596))

  When `hydrateRouter()` is invoked and the parsed state contains the `rsc`
  namespace (uncommon — `serializeRouterState({ excludeContext: ["rsc"] })` is
  the typical SSR config), the plugin's `start` interceptor reuses the value
  instead of re-running the loader. Stripped-rsc payloads continue to fall
  through to the loader as today.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `invalidate(router, "rsc")` helper for client-side revalidation ([#605](https://github.com/greydragon888/real-router/issues/605))

  Marks the `"rsc"` namespace as stale on the given router. The next
  navigation (including a same-route reload) re-runs the RSC loader for
  the destination route and overwrites `state.context.rsc` (and the mode
  marker) via the plugin's `subscribeLeave` listener — fresh `ReactNode`
  lands on the state snapshot **before** `TRANSITION_SUCCESS` fires, so
  subscribers see the new payload.

  `void` (fire-and-forget) return. Compose with the existing core API
  for an explicit synchronous round-trip:

  ```ts
  import { invalidate } from "@real-router/rsc-server-plugin";

  // Fire-and-forget — stale until any next navigation
  invalidate(router, "rsc");

  // Explicit await — pair with a same-route reload
  invalidate(router, "rsc");
  await router.navigate(state.name, state.params, { reload: true });
  ```

  Surgical alternative to `router.navigate({ reload: true })` for
  multi-namespace routes: only `"rsc"` re-runs; a side-by-side
  `ssr-data-plugin` keeps its cached `state.context.data` on this same
  transition unless its own `invalidate()` was also called. Behaviour
  during an in-flight transition is deferred — the current transition
  completes unchanged; the _following_ navigation consumes the flag,
  preserving the invariant "one transition = one `state.context`
  snapshot".

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/rsc-server-plugin/errors` subpath with typed loader errors ([#594](https://github.com/greydragon888/real-router/issues/594))

  Mirror of `@real-router/ssr-data-plugin/errors` — exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and `withTimeout` from a new `errors` subpath. Same shared source under `shared/ssr/errors.ts`.

  RSC apps throw the same error shapes as classical SSR apps and discriminate via the structural `code` field — without taking a dependency on `ssr-data-plugin`:

  ```ts
  import { LoaderNotFound } from "@real-router/rsc-server-plugin/errors";

  const loaders: RscLoaderFactoryMap = {
    "users.profile": (_router, getDep) => async (params) => {
      const user = await getDep("db").users.findById(params.id);
      if (!user) throw new LoaderNotFound(`user:${params.id}`);
      return <UserProfile user={user} />;
    },
  };
  ```

  Zero runtime impact on the main entry — `errors` is a separate dist file, tree-shaken when unused.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RscPayload<TReturn, TFormState>` type + `rscActionPluginFactory` for Server Action integration ([#593](https://github.com/greydragon888/real-router/issues/593))

  The plugin gains two complementary pieces:
  - **`RscPayload<TReturn, TFormState>`** — canonical Flight payload shape (`{ root: ReactNode } & RscActionResult`). Single source of truth used by both producer (rsc entry) and consumers (ssr + browser entries) — eliminates ad-hoc duplication of the same interface in multiple files.
  - **`rscActionPluginFactory(getResult)`** — sibling plugin that claims the `"rscAction"` namespace. Publishes `{ returnValue?, formState? }` to `state.context.rscAction` via the `start` interceptor; coexists with `rscServerPluginFactory` (`"rsc"`) and `ssrDataPluginFactory` (`"data"`) on the same router.

  Use case: Server Action results computed in the RSC fetch handler (via `decodeAction` / `loadServerAction` / `decodeReply`) become part of router state and can be read by any Server Component during the post-action render — eliminates prop-drilling for cross-page action result UI.

  ```ts
  let actionResult: RscActionResult | undefined;
  if (request.method === "POST") {
    // ... execute action ...
    actionResult = { returnValue: { ok: true, data: ... } };
  }

  router.usePlugin(
    rscServerPluginFactory(loaders),
    rscActionPluginFactory(() => actionResult),
  );

  const state = await router.start(pathname);
  // state.context.rsc       — ReactNode tree
  // state.context.rscAction — { returnValue?, formState? }
  ```

  Verified by 12 new functional tests covering write semantics, composition with `rscServerPluginFactory`, namespace collision detection, and teardown.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add per-route SSR mode ([#597](https://github.com/greydragon888/real-router/issues/597))

  Mirror of `ssr-data-plugin`: `rscServerPluginFactory` now accepts the
  `{ ssr?, loader? }` shape per route. `RscSsrMode = "full" | "client-only"` —
  `"data-only"` is rejected at factory time (RSC has no semantically meaningful
  "data without component"). Mode is published to `state.context.ssrRscMode`;
  read via `getSsrRscMode(state)` (fallback `"full"`).

  When mode is `"client-only"` the loader is skipped unconditionally; the
  application is responsible for fetching the Server Component tree via a
  separate mechanism.

  Breaking on the type level: `RscLoaderFactoryMap` now accepts a union of
  factory or `{ ssr?, loader? }` per entry. Existing consumers passing a factory
  directly continue to work without changes.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - withTimeout passes AbortSignal to loader for cooperative cancellation ([#598](https://github.com/greydragon888/real-router/issues/598))

  The `loader` argument signature changes from `() => Promise<T>` to
  `({ signal }) => Promise<T>`. The signal aborts synchronously when the
  deadline elapses (before the race rejects with `LoaderTimeout`), so loader
  I/O honoring the signal — e.g. `fetch(url, { signal })` — is actually
  cancelled at the network layer. Optional `options.upstreamSignal` composes
  via `AbortSignal.any`, so the loader's signal aborts on whichever happens
  first: the deadline OR an upstream client-disconnect.

  If `options.upstreamSignal` is already aborted at call time, the loader
  is _not_ invoked and the timer is _not_ started — `withTimeout` rejects
  immediately with the upstream's reason.

  Breaking on the type level — TS permits passing a parameter-less function
  to a callback expecting `{ signal }`, so existing call sites that ignore
  the new arg keep working. Cancellation is cooperative — loaders that
  don't pass `signal` into their I/O still run to completion (current
  behavior preserved).

  Requires Node 20.3+ for `AbortSignal.any`.

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.1.0

### Minor Changes

- [#572](https://github.com/greydragon888/real-router/pull/572) [`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/rsc-server-plugin` — per-route `ReactNode` (RSC payload) loading via `start()` interceptor ([#566](https://github.com/greydragon888/real-router/issues/566))

  New plugin mirroring `@real-router/ssr-data-plugin` for React Server Components. Loaders return `ReactNode` (sync or async); the plugin writes the resolved node to `state.context.rsc` via the `"rsc"` namespace claim. Bundler-agnostic — the caller pipes the published node through their bundler's Flight renderer (`@vitejs/plugin-rsc`, `react-server-dom-webpack`, etc.).

  ```typescript
  router.usePlugin(rscServerPluginFactory({
    "users.profile": () => async (params) => {
      const user = await fetchUser(params.id);
      return <UserProfile user={user} />;
    },
  }));

  const state = await router.start(url);
  const flight = renderToReadableStream(state.context.rsc);
  const json = serializeRouterState(state, { excludeContext: ["rsc"] });
  ```

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
