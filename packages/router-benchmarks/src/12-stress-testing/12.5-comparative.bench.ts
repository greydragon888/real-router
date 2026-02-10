// packages/router-benchmarks/modules/12-stress-testing/12.5-comparative.bench.ts

import { bench } from "mitata";

import { createSimpleRouter, createNestedRouter, IS_ROUTER5 } from "../helpers";

import type { Route } from "../helpers";

// 12.5.1 Comparison: parameter count impact (0/5/10 parameters)
{
  const router = createSimpleRouter();
  const alternatingRoutes = ["about", "home"];
  let index = 0;

  router.start();

  bench("12.5.1 Comparison: route without parameters", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

{
  const router = createSimpleRouter();
  const ids = ["123", "456"];
  let index = 0;

  router.start();

  bench("12.5.2 Comparison: route with 5 parameters", () => {
    router.navigate("user", {
      id: ids[index++ % 2],
      tab: "profile",
      filter: "active",
      sort: "name",
      order: "asc",
    });
  }).gc("inner");
}

{
  const router = createSimpleRouter();
  const ids = ["123", "456"];
  let index = 0;

  router.start();

  bench("12.5.3 Comparison: route with 10 parameters", () => {
    router.navigate("user", {
      id: ids[index++ % 2],
      tab: "profile",
      filter: "active",
      sort: "name",
      order: "asc",
      page: "1",
      limit: "10",
      category: "tech",
      tag: "javascript",
      search: "router",
    });
  }).gc("inner");
}

// 12.5.4 Comparison: nesting depth impact (flat vs 5 levels)
{
  const router = createSimpleRouter();
  const alternatingRoutes = ["about", "home"];
  let index = 0;

  router.start();

  bench("12.5.4 Comparison: flat routes", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

if (IS_ROUTER5) {
  const router = createNestedRouter();
  // Alternate between two nested levels to avoid SAME_STATES
  const routes = ["l1.l2.l3.l4.l5", "l1.l2.l3"];
  let index = 0;

  const nestedRoute: Route = {
    name: "l1",
    path: "/l1",
    children: [
      {
        name: "l2",
        path: "/l2",
        children: [
          {
            name: "l3",
            path: "/l3",
            children: [
              {
                name: "l4",
                path: "/l4",
                children: [{ name: "l5", path: "/l5" }],
              },
            ],
          },
        ],
      },
    ],
  };

  // @ts-expect-error - use method from router5
  router.add(nestedRoute);
  router.start();

  bench("12.5.5 Comparison: 5 levels of nesting", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
} else {
  const router = createNestedRouter();
  // Alternate between two nested levels to avoid SAME_STATES
  const routes = ["l1.l2.l3.l4.l5", "l1.l2.l3"];
  let index = 0;

  const nestedRoute: Route = {
    name: "l1",
    path: "/l1",
    children: [
      {
        name: "l2",
        path: "/l2",
        children: [
          {
            name: "l3",
            path: "/l3",
            children: [
              {
                name: "l4",
                path: "/l4",
                children: [{ name: "l5", path: "/l5" }],
              },
            ],
          },
        ],
      },
    ],
  };

  router.addRoute(nestedRoute);
  router.start();

  bench("12.5.5 Comparison: 5 levels of nesting", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 12.5.6 Thousand navigations with 1000 event listeners
{
  const router = createSimpleRouter();

  for (let i = 0; i < 1000; i++) {
    router.addEventListener("$$success", () => {});
  }

  router.start();

  bench("12.5.6 Thousand navigations with 1000 event listeners", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(i % 2 === 0 ? "about" : "users");
    }
  }).gc("inner");
}

// 12.5.8 Combined stress test: 1000 routes + 20 middleware + 30 plugins
if (IS_ROUTER5) {
  const router = createSimpleRouter();
  const routes = ["route500", "route501"];
  let index = 0;

  for (let i = 0; i < 1000; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  for (let i = 0; i < 20; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
  }

  for (let i = 0; i < 30; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
      onTransitionSuccess: () => {},
    }));
  }

  router.start();

  bench(
    "12.5.8 Combined stress test: 1000 routes + 20 middleware + 30 plugins",
    () => {
      router.navigate(routes[index++ % 2]);
    },
  ).gc("inner");
} else {
  const router = createSimpleRouter();
  const routes = ["route500", "route501"];
  let index = 0;

  for (let i = 0; i < 1000; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  for (let i = 0; i < 20; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
  }

  for (let i = 0; i < 30; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
      onTransitionSuccess: () => {},
    }));
  }

  router.start();

  bench(
    "12.5.8 Combined stress test: 1000 routes + 20 middleware + 30 plugins",
    () => {
      router.navigate(routes[index++ % 2]);
    },
  ).gc("inner");
}
