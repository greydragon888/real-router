// packages/real-router/modules/core/routes.ts

import { withRoutePath } from "./routePath";
import { withRouteQuery } from "./routeQuery";
import { withRouteTree } from "./routeTree";

import type { Router, Route, DefaultDependencies } from "router6-types";

/**
 * Adds comprehensive route management capabilities to a router instance.
 * Orchestrates route tree operations, path building/matching, and state queries.
 *
 * This is a composition of specialized modules:
 * - withRouteTree: Route tree construction, addition, and removal
 * - withRoutePath: URL path building and matching
 * - withRouteQuery: Route activity checks and state inspection
 *
 * @param routes - Initial routes array
 * @returns Function to enhance router with route capabilities
 */
export function withRoutes<Dependencies extends DefaultDependencies>(
  routes: Route<Dependencies>[],
): (router: Router<Dependencies>) => Router<Dependencies> {
  return (router: Router<Dependencies>): Router<Dependencies> => {
    // eslint-disable-next-line unicorn/no-array-reduce
    return [withRouteTree(routes), withRoutePath, withRouteQuery].reduce(
      (r, fn) => fn(r),
      router,
    );
  };
}
