// packages/router-benchmarks/src/helpers/router-adapter.ts

import { BENCH_NO_VALIDATE, ROUTER_NAME, UNIFIED_OPTIONS } from "./constants";

import type {
  Router,
  Route,
  Options,
  DefaultDependencies,
} from "@real-router/core";

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
const routerModule = (() => {
  switch (ROUTER_NAME) {
    case "router5": {
      return require("router5");
    }
    case "router6": {
      return require("router6");
    }
    default: {
      // IMPORTANT: Load compiled dist, not TypeScript source.
      // tsx resolves workspace packages to src/*.ts, causing unfair benchmark comparison.
      // Use absolute path to bypass Node 24 strict exports enforcement.
      const path = require("node:path");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- dynamic require returns `any`
      const distPath: string = path.resolve(
        __dirname,
        "../../node_modules/@real-router/core/dist/cjs/index.js",
      );

      return require(distPath);
    }
  }
})();
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

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

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const _getPluginApi:
  | typeof import("@real-router/core").getPluginApi
  | undefined =
  ROUTER_NAME === "real-router" ? routerModule.getPluginApi : undefined;
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

/**
 * Cross-router addEventListener helper.
 * real-router moved addEventListener to getPluginApi() (#182).
 * router5/router6 still have it on the instance.
 */
export function addEventListener(
  router: Router,
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  cb: Function,
): () => void {
  if (_getPluginApi) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return _getPluginApi(router).addEventListener(eventName as any, cb as any);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (router as any).addEventListener(eventName, cb);
}

export type { Route, Router } from "@real-router/core";

console.error(
  `Using router: ${ROUTER_NAME}${BENCH_NO_VALIDATE ? " (noValidate: true)" : ""}`,
);
