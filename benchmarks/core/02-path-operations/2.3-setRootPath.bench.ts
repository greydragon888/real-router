// benchmarks/core/02-path-operations/2.3-setRootPath.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

import type { Route } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 100;

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

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
 * Unified setRootPath — router5/router6 have it on the instance,
 * real-router exposes it via getPluginApi().
 */
function createSetRootPath(
  router: ReturnType<typeof createRouter>,
): (path: string) => void {
  if (IS_REAL_ROUTER) {
    const api = getPluginApi!(router);

    return (path: string) => api.setRootPath(path);
  }

  // router5/router6: direct method
  return (path: string) =>
    (router as unknown as { setRootPath: (p: string) => void }).setRootPath(
      path,
    );
}

// 2.3.1 Setting root path
{
  const router = createRouter(routes);
  const setRootPath = createSetRootPath(router);
  const paths = ["/app", "/application"];
  let index = 0;

  bench("2.3.1 Setting root path", () => {
    setRootPath(paths[index++ % 2]);
  }).gc("inner");
}

// 2.3.2 Setting root path with nesting
{
  const router = createRouter(routes);
  const setRootPath = createSetRootPath(router);
  const paths = ["/app/v1/api", "/app/v2/api"];
  let index = 0;

  bench("2.3.2 Setting root path with nesting", () => {
    setRootPath(paths[index++ % 2]);
  }).gc("inner");
}

// 2.3.3 Changing root path
{
  const router = createRouter(routes);
  const setRootPath = createSetRootPath(router);
  const paths = ["/app", "/new-app"];
  let index = 0;

  setRootPath("/initial");

  bench("2.3.3 Changing root path", () => {
    setRootPath(paths[index++ % 2]);
  }).gc("inner");
}

// 2.3.4 Building paths after setRootPath
{
  const router = createRouter(routes);
  const setRootPath = createSetRootPath(router);

  setRootPath("/app");

  bench(`2.3.4 Building paths after setRootPath (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("about"));
    }
  }).gc("inner");
}

// 2.3.5 Matching paths after setRootPath
{
  const router = createRouter(routes);
  const setRootPath = createSetRootPath(router);
  const matchPath = createMatchPath(router);

  setRootPath("/app");

  bench(`2.3.5 Matching paths after setRootPath (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(matchPath("/app/about"));
    }
  }).gc("inner");
}
