// packages/real-router-benchmarks/modules/12-stress-testing/12.2-route-scaling.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, createNestedRouter } from "../helpers";

import type { Route } from "../helpers";

const IS_ROUTER5 = process.env.BENCH_ROUTER === "router5";

// 12.2.1 Navigation in router with 100 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.1 Navigation in router with 100 routes", () => {
    router.navigate("route50");
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.1 Navigation in router with 100 routes", () => {
    router.navigate("route50");
  }).gc("inner");
}

// 12.2.2 Navigation in router with 500 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.2 Navigation in router with 500 routes", () => {
    router.navigate("route250");
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.2 Navigation in router with 500 routes", () => {
    router.navigate("route250");
  }).gc("inner");
}

// 12.2.3 Navigation in router with 1000 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 1000; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.3 Navigation in router with 1000 routes", () => {
    router.navigate("route500");
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 1000; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.3 Navigation in router with 1000 routes", () => {
    router.navigate("route500");
  }).gc("inner");
}

// 12.2.4 Thousand navigations in router with 100 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.4 Thousand navigations in router with 100 routes", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(`route${i % 100}`);
    }
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  router.start();

  bench("12.2.4 Thousand navigations in router with 100 routes", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(`route${i % 100}`);
    }
  }).gc("inner");
}

// 12.2.5 Navigation in router with deep 10-level hierarchy
if (IS_ROUTER5) {
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

  // @ts-expect-error - use method from router5
  router.add(deepRoute);
  router.start();

  bench("12.2.5 Navigation in router with deep 10-level hierarchy", () => {
    router.navigate(
      "level1.level2.level3.level4.level5.level6.level7.level8.level9.level10",
    );
  }).gc("inner");
} else {
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

  router.addRoute(deepRoute);
  router.start();

  bench("12.2.5 Navigation in router with deep 10-level hierarchy", () => {
    router.navigate(
      "level1.level2.level3.level4.level5.level6.level7.level8.level9.level10",
    );
  }).gc("inner");
}

// 12.2.6 BuildPath in router with 500 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  bench("12.2.6 BuildPath in router with 500 routes", () => {
    do_not_optimize(router.buildPath("route250"));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  bench("12.2.6 BuildPath in router with 500 routes", () => {
    do_not_optimize(router.buildPath("route250"));
  }).gc("inner");
}

// 12.2.7 MatchPath in router with 500 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  bench("12.2.7 MatchPath in router with 500 routes", () => {
    do_not_optimize(router.matchPath("/route499"));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  bench("12.2.7 MatchPath in router with 500 routes", () => {
    do_not_optimize(router.matchPath("/route499"));
  }).gc("inner");
}
