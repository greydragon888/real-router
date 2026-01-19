// packages/router6-benchmarks/modules/helpers/router-adapter.ts

import type { Router, Route, Options, DefaultDependencies } from "router6";

const ROUTER_NAME = process.env.BENCH_ROUTER ?? "router6";

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
const routerModule =
  ROUTER_NAME === "router5" ? require("router5") : require("router6");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

/**
 * Unified options for fair benchmarking between router5 and router6.
 *
 * These options normalize the behavior differences between routers:
 * - queryParamsMode: router5 defaults to "default", router6 to "loose"
 * - allowNotFound: router5 defaults to false, router6 to true
 *
 * Using router5 defaults as baseline for comparison.
 */
export const UNIFIED_OPTIONS: Partial<Options> = {
  queryParamsMode: "default",
  allowNotFound: false,
};

type CreateRouterFn = <Dependencies extends DefaultDependencies = object>(
  routes?: Route<Dependencies>[],
  options?: Partial<Options>,
  dependencies?: Dependencies,
) => Router<Dependencies>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
const originalCreateRouter: CreateRouterFn = routerModule.createRouter;

/**
 * Creates a router with unified options for fair benchmarking.
 * User-provided options override unified defaults.
 */
export const createRouter: CreateRouterFn = <
  Dependencies extends DefaultDependencies = object,
>(
  routes?: Route<Dependencies>[],
  options?: Partial<Options>,
  dependencies?: Dependencies,
): Router<Dependencies> => {
  return originalCreateRouter(
    routes,
    { ...UNIFIED_OPTIONS, ...options },
    dependencies,
  );
};

// Export cloneRouter for router5 compatibility in else blocks
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
export const cloneRouter = routerModule.cloneRouter;

export type { Route, Router } from "router6";

console.error(`Using router: ${ROUTER_NAME}`);
