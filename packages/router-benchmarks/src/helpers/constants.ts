// packages/router-benchmarks/src/helpers/constants.ts

import type { Options } from "@real-router/core";

/**
 * Current router being benchmarked.
 * Set via BENCH_ROUTER environment variable.
 */
export const ROUTER_NAME = process.env.BENCH_ROUTER ?? "real-router";

/**
 * Router detection constants.
 * Use these to conditionally skip benchmarks that don't apply to certain routers.
 */
export const IS_ROUTER5 = ROUTER_NAME === "router5";

/** @public Will be used for router6-specific benchmarks */
export const IS_ROUTER6 = ROUTER_NAME === "router6";

/** @public Will be used for real-router-specific benchmarks */
export const IS_REAL_ROUTER = ROUTER_NAME === "real-router";

/**
 * Whether to disable validation in benchmarks (real-router only).
 * Set via BENCH_NO_VALIDATE environment variable.
 */
export const BENCH_NO_VALIDATE = process.env.BENCH_NO_VALIDATE === "true";

/**
 * Unified options for fair benchmarking between router5, router6, and real-router.
 *
 * These options normalize the behavior differences between routers:
 * - queryParamsMode: router5 defaults to "default", real-router to "loose"
 * - allowNotFound: router5 defaults to false, real-router to true
 *
 * Using router5 defaults as baseline for comparison.
 */
export const UNIFIED_OPTIONS: Partial<Options> = {
  queryParamsMode: "default",
  allowNotFound: false,
  // Only apply noValidate for real-router (router5/router6 don't have this option)
  ...(IS_REAL_ROUTER && BENCH_NO_VALIDATE ? { noValidate: true } : {}),
};
