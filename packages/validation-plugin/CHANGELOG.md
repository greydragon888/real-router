# @real-router/validation-plugin

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
