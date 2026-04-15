// benchmarks/core/02-path-operations/2.4-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

import type { Route } from "../helpers";

/**
 * Unified matchPath — router5/router6 have it on the instance,
 * real-router exposes it via getPluginApi().
 */
function createMatchPath(
  router: ReturnType<typeof createRouter>,
): (path: string) => unknown {
  if (IS_REAL_ROUTER) {
    const api = getPluginApi!(router);

    return (path: string) => api.matchPath(path);
  }

  // router5/router6: direct method
  return (path: string) =>
    (router as unknown as { matchPath: (p: string) => unknown }).matchPath(
      path,
    );
}

/**
 * Batch sizes for stable measurements on sub-µs operations.
 * buildPath is faster than matchPath, so needs larger batch.
 */
const BATCH_BUILD = 100;
const BATCH_MATCH = 50;

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "user", path: "/users/:id" },
  { name: "article", path: "/articles/:id?/:slug?" },
];

// 2.4.3 Building path with very long parameters
// Note: This test intentionally uses large data (1000 char id), no batching needed
{
  const router = createRouter(routes);
  const longId = "a".repeat(1000);

  bench("2.4.3 Building path with very long parameters", () => {
    do_not_optimize(router.buildPath("user", { id: longId }));
  }).gc("inner");
}

// 2.4.4 Building path with special characters
{
  const router = createRouter(routes);

  bench(`2.4.4 Building path with special characters (×${BATCH_BUILD})`, () => {
    for (let i = 0; i < BATCH_BUILD; i++) {
      do_not_optimize(
        router.buildPath("user", { id: "test@example.com?foo=bar&baz=qux" }),
      );
    }
  }).gc("inner");
}

// 2.4.5 Matching path with excess segments
{
  const router = createRouter(routes);
  const matchPath = createMatchPath(router);

  bench(`2.4.5 Matching path with excess segments (×${BATCH_MATCH})`, () => {
    for (let i = 0; i < BATCH_MATCH; i++) {
      do_not_optimize(matchPath("/users/123/extra/segments"));
    }
  }).gc("inner");
}

// 2.4.6 Matching path with incomplete segments
{
  const router = createRouter(routes);
  const matchPath = createMatchPath(router);

  bench(
    `2.4.6 Matching path with incomplete segments (×${BATCH_MATCH})`,
    () => {
      for (let i = 0; i < BATCH_MATCH; i++) {
        do_not_optimize(matchPath("/users"));
      }
    },
  ).gc("inner");
}

// 2.4.7 Building path with array parameters
{
  const router = createRouter(routes);

  bench(`2.4.7 Building path with array parameters (×${BATCH_BUILD})`, () => {
    for (let i = 0; i < BATCH_BUILD; i++) {
      do_not_optimize(
        router.buildPath("home", { tags: ["tag1", "tag2", "tag3"] }),
      );
    }
  }).gc("inner");
}

// 2.4.8 Matching path with duplicate query parameters
{
  const router = createRouter(routes);
  const matchPath = createMatchPath(router);

  bench(
    `2.4.8 Matching path with duplicate query parameters (×${BATCH_MATCH})`,
    () => {
      for (let i = 0; i < BATCH_MATCH; i++) {
        do_not_optimize(matchPath("/?tag=1&tag=2&tag=3"));
      }
    },
  ).gc("inner");
}

// 2.4.9 Building path for root route
{
  const router = createRouter(routes);

  bench(`2.4.9 Building path for root route (×${BATCH_BUILD})`, () => {
    for (let i = 0; i < BATCH_BUILD; i++) {
      do_not_optimize(router.buildPath("home"));
    }
  }).gc("inner");
}

// 2.4.10 Matching root path
{
  const router = createRouter(routes);
  const matchPath = createMatchPath(router);

  bench(`2.4.10 Matching root path (×${BATCH_MATCH})`, () => {
    for (let i = 0; i < BATCH_MATCH; i++) {
      do_not_optimize(matchPath("/"));
    }
  }).gc("inner");
}

// 2.4.12 Matching path without optional parameters
{
  const router = createRouter(routes);
  const matchPath = createMatchPath(router);

  bench(
    `2.4.12 Matching path without optional parameters (×${BATCH_MATCH})`,
    () => {
      for (let i = 0; i < BATCH_MATCH; i++) {
        do_not_optimize(matchPath("/articles"));
      }
    },
  ).gc("inner");
}

// 2.4.13 Building path with different queryParamsMode modes
{
  const router = createRouter(routes, {
    queryParamsMode: "strict",
  });

  bench(
    `2.4.13 Building path with queryParamsMode strict (×${BATCH_BUILD})`,
    () => {
      for (let i = 0; i < BATCH_BUILD; i++) {
        do_not_optimize(router.buildPath("home", { page: "1" }));
      }
    },
  ).gc("inner");
}

// 2.4.14 Matching with case-insensitive paths
{
  const router = createRouter(routes);
  const matchPath = createMatchPath(router);

  bench(`2.4.14 Matching with case-sensitive paths (×${BATCH_MATCH})`, () => {
    for (let i = 0; i < BATCH_MATCH; i++) {
      do_not_optimize(matchPath("/users/123"));
    }
  }).gc("inner");
}
