// packages/core/src/createRouter.ts

import { Router } from "./Router";

import type {
  DefaultDependencies,
  Options,
  Route,
  Router as RouterInterface,
} from "@real-router/types";

/**
 * Creates a new router instance.
 *
 * @param routes - Array of route definitions
 * @param options - Router configuration options
 * @param dependencies - Dependencies to inject into the router
 * @returns A new Router instance
 *
 * @example
 * const router = createRouter([
 *   { name: 'home', path: '/' },
 *   { name: 'users', path: '/users' },
 * ]);
 *
 * router.start('/');
 */
export const createRouter = <
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routes: Route<Dependencies>[] = [],
  options: Partial<Options> = {},
  dependencies: Dependencies = {} as Dependencies,
): RouterInterface<Dependencies> => {
  return new Router<Dependencies>(routes, options, dependencies);
};
