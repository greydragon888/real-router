// @ts-check

// ============================================
// ESLint Configuration for router-benchmarks
// Extends root config with benchmark-specific overrides
// ============================================

import eslintConfig from "../eslint.config.mjs";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  ...eslintConfig,

  {
    files: ["*.mjs", "*.js"],
    extends: [tsEslint.configs.disableTypeChecked],
  },

  // audit-probes are ad-hoc /deep-audit diagnostic scripts (CJS, run via tsx),
  // not maintained source — the linter is disabled for them entirely.
  {
    ignores: ["audit-probes/**"],
  },
);
