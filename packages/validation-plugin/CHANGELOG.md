# @real-router/validation-plugin

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
