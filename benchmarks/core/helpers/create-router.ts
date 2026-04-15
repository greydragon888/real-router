// packages/router-benchmarks/modules/helpers/create-router.ts

import { createRouter } from "./router-adapter";

import type { Route, Router } from "@real-router/core";
import type { Options } from "@real-router/types";

/**
 * Creates a simple router with basic routes for benchmarking
 */
export function createSimpleRouter(options?: Partial<Options>): Router {
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "users", path: "/users" },
    { name: "user", path: "/users/:id" },
  ];

  return createRouter(routes, options);
}

/**
 * Creates a router with nested routes for benchmarking
 */
export function createNestedRouter(depth = 5): Router {
  const routes: Route[] = [{ name: "root", path: "/" }];

  let current = routes[0];

  for (let i = 1; i <= depth; i++) {
    const child: Route = {
      name: `level${i}`,
      path: `/level${i}`,
    };

    current.children = [child];
    current = child;
  }

  return createRouter(routes);
}
