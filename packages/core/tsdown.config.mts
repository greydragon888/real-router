import { createIsomorphicConfig } from "../../tsdown.base.js";

const entry = {
  index: "src/index.ts",
  types: "src/types/index.ts",
  api: "src/api/index.ts",
  validation: "src/validation.ts",
};

// Two-phase build (#1540): JS stays BUNDLED (package shape, size-limit and
// publish weight unchanged), while dts is emitted UNBUNDLED (preserveModules).
//
// Why: plugins augment `@real-router/core/types` via `declare module`, and TS
// merges such an augmentation only when the resolved module is the interface's
// LEXICAL declaration-site — a re-export barrel of any form is a silent no-op
// (#1519). Bundled dts hoists `StateContext` / `NavigationOptions` into a
// shared chunk (the entry becomes a re-export barrel), silently breaking every
// plugin's context/options typing for external dist-resolving consumers
// (#1540, regressed by the #1520 fold). With unbundled dts the `types` entry
// IS `src/types/index.ts`, which declares the augment targets lexically.
//
// `clean` is disabled in both phases (they share outDirs and tsdown may run
// configs concurrently — a phase's clean could wipe the other's output); the
// `bundle` npm script does `rm -rf dist` upfront instead. The invariant is
// enforced by scripts/check-dts-augment-targets.mjs after every bundle.
const jsConfigs = createIsomorphicConfig({
  custom: { entry, dts: false, clean: false },
});

const dtsConfigs = createIsomorphicConfig({
  custom: {
    entry,
    unbundle: true,
    dts: { sourcemap: true, emitDtsOnly: true },
    clean: false,
  },
});

export default [...jsConfigs, ...dtsConfigs];
