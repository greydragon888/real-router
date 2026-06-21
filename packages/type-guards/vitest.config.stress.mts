import { mergeConfig, defineConfig } from "vitest/config";

import { commonConfig } from "../../vitest.config.common.mjs";

/**
 * Vitest configuration for stress tests (type-guards package).
 *
 * Robustness / DoS-resistance + anti-quadratic guards for the recursive-tree
 * validators (`isParams` / `isStateStrict`), which run on untrusted input
 * (`history.state`, user-supplied params). No `--expose-gc`: these are timing
 * and no-crash guards, not heap snapshots — the guards are pure and stateless,
 * so there is no retained state to leak.
 */
export default mergeConfig(
  commonConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["./tests/stress/**/*.stress.ts"],
      coverage: { enabled: false },
      pool: "forks",
      maxWorkers: 2,
      testTimeout: 60_000,
      hookTimeout: 15_000,
    },
  }),
);
