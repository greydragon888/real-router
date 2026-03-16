// packages/router-benchmarks/modules/12-stress-testing/12.2-route-scaling.bench.ts

import { bench, do_not_optimize } from "mitata";

import {
  createSimpleRouter,
  createNestedRouter,
  IS_ROUTER5,
  IS_REAL_ROUTER,
  getRoutesApi,
} from "../helpers";

import type { Route, Router } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 50;

/**
 * Add a route to a router — API differs per router:
 * - router5: router.add(route)
 * - router6: router.addRoute(route)
 * - real-router: getRoutesApi(router).add(route)
 */
function addRoute(router: Router, route: Route): void {
  if (IS_REAL_ROUTER) {
    getRoutesApi!(router).add(route);
  } else {
    const method = IS_ROUTER5 ? "add" : "addRoute";

    // @ts-expect-error - router5/router6 method
    router[method](route);
  }
}

// 12.2.1 Navigation in router with 100 routes
{
  const router = createSimpleRouter();
  const routes = ["route50", "route51"];
  let index = 0;

  for (let i = 0; i < 100; i++) {
    addRoute(router, { name: `route${i}`, path: `/route${i}` });
  }

  router.start("/");

  bench("12.2.1 Navigation in router with 100 routes", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 12.2.2 Navigation in router with 500 routes
{
  const router = createSimpleRouter();
  const routes = ["route250", "route251"];
  let index = 0;

  for (let i = 0; i < 500; i++) {
    addRoute(router, { name: `route${i}`, path: `/route${i}` });
  }

  router.start("/");

  bench("12.2.2 Navigation in router with 500 routes", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 12.2.3 Navigation in router with 1000 routes
{
  const router = createSimpleRouter();
  const routes = ["route500", "route501"];
  let index = 0;

  for (let i = 0; i < 1000; i++) {
    addRoute(router, { name: `route${i}`, path: `/route${i}` });
  }

  router.start("/");

  bench("12.2.3 Navigation in router with 1000 routes", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 12.2.4 Thousand navigations in router with 100 routes
{
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    addRoute(router, { name: `route${i}`, path: `/route${i}` });
  }

  router.start("/");

  bench("12.2.4 Thousand navigations in router with 100 routes", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(`route${i % 100}`);
    }
  }).gc("inner");
}

// 12.2.5 Navigation in router with deep 10-level hierarchy
{
  const router = createNestedRouter();

  // Build deep route structure to avoid TypeScript recursion limits
  const deepRoute: Route = {
    name: "level1",
    path: "/l1",
    children: [
      {
        name: "level2",
        path: "/l2",
        children: [
          {
            name: "level3",
            path: "/l3",
            children: [
              {
                name: "level4",
                path: "/l4",
                children: [
                  {
                    name: "level5",
                    path: "/l5",
                    children: [
                      {
                        name: "level6",
                        path: "/l6",
                        children: [
                          {
                            name: "level7",
                            path: "/l7",
                            children: [
                              {
                                name: "level8",
                                path: "/l8",
                                children: [
                                  {
                                    name: "level9",
                                    path: "/l9",
                                    children: [
                                      { name: "level10", path: "/l10" },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  addRoute(router, deepRoute);
  router.start("/");

  // Alternate between two nested levels to avoid SAME_STATES
  const routes = [
    "level1.level2.level3.level4.level5.level6.level7.level8.level9.level10",
    "level1.level2.level3.level4.level5.level6.level7.level8",
  ];
  let index = 0;

  bench("12.2.5 Navigation in router with deep 10-level hierarchy", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 12.2.6 BuildPath in router with 500 routes
{
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    addRoute(router, { name: `route${i}`, path: `/route${i}` });
  }

  bench(`12.2.6 BuildPath in router with 500 routes (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("route250"));
    }
  }).gc("inner");
}
