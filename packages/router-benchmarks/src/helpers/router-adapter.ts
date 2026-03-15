// packages/router-benchmarks/src/helpers/router-adapter.ts

import { BENCH_NO_VALIDATE, ROUTER_NAME, UNIFIED_OPTIONS } from "./constants";

import type {
  Router,
  Route,
  Options,
  DefaultDependencies,
} from "@real-router/core";

// API module for real-router (loaded from same source tree as createRouter)
let realRouterApiModule: any = null;

const routerModule = (() => {
  switch (ROUTER_NAME) {
    case "router5": {
      return require("router5");
    }
    case "router6": {
      return require("router6");
    }
    default: {
      // Load from source so createRouter and API functions share the same
      // internals WeakMap. The CJS dist bundles index.js and api.js separately,
      // each with their own WeakMap — getPluginApi/getRoutesApi would fail.
      const path = require("node:path");
      const sourcePath: string = path.resolve(
        __dirname,
        "../../node_modules/@real-router/core/src/index.ts",
      );
      const sourceApiPath: string = path.resolve(
        __dirname,
        "../../node_modules/@real-router/core/src/api/index.ts",
      );

      realRouterApiModule = require(sourceApiPath);

      return require(sourcePath);
    }
  }
})();

type CreateRouterFn = <Dependencies extends DefaultDependencies = object>(
  routes?: Route<Dependencies>[],
  options?: Partial<Options>,
  dependencies?: Dependencies,
) => Router<Dependencies>;

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

export type { Route, Router } from "@real-router/core";

type PluginApiFn = (
  router: Router,
) => ReturnType<typeof import("@real-router/core/api").getPluginApi>;

type RoutesApiFn = (
  router: Router,
) => ReturnType<typeof import("@real-router/core/api").getRoutesApi>;

/** Get the PluginApi for a real-router instance. Returns null for router5/router6. */
export const getPluginApi: PluginApiFn | null =
  realRouterApiModule?.getPluginApi ?? null;

/** Get the RoutesApi for a real-router instance. Returns null for router5/router6. */
export const getRoutesApi: RoutesApiFn | null =
  realRouterApiModule?.getRoutesApi ?? null;

console.error(
  `Using router: ${ROUTER_NAME}${BENCH_NO_VALIDATE ? " (noValidate: true)" : ""}`,
);
