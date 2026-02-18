// packages/router-benchmarks/modules/12-stress-testing/12.1-high-load-sequential.bench.ts

import { bench } from "mitata";

import { createSimpleRouter, createNestedRouter, IS_ROUTER5 } from "../helpers";

// 12.1.1 Thousand sequential navigations between two routes
{
  const router = createSimpleRouter();

  router.start("/");

  bench("12.1.1 Thousand sequential navigations between two routes", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(i % 2 === 0 ? "about" : "home");
    }
  }).gc("inner");
}

// 12.1.2 Ten thousand sequential navigations between five routes
{
  const router = createSimpleRouter();
  const routes = ["home", "about", "users", "home", "about"];

  router.start("/");

  bench(
    "12.1.2 Ten thousand sequential navigations between five routes",
    () => {
      for (let i = 0; i < 10_000; i++) {
        router.navigate(routes[i % routes.length]);
      }
    },
  ).gc("inner");
}

// 12.1.4 Thousand navigations through deeply nested routes
// Note: createNestedRouter(5) creates routes: root, root.level1, ..., root.level1.level2.level3.level4.level5
{
  const router = createNestedRouter(5);
  // Alternate between two different nested levels to avoid same-state short-circuit
  const routes = [
    "root.level1.level2.level3.level4.level5",
    "root.level1.level2.level3",
  ];

  router.start("/");

  bench("12.1.4 Thousand navigations through deeply nested routes", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(routes[i % 2]);
    }
  }).gc("inner");
}

// 12.1.5 Five thousand navigations with query parameters
{
  const router = createSimpleRouter();

  router.start("/");

  bench("12.1.5 Five thousand navigations with query parameters", () => {
    for (let i = 0; i < 5000; i++) {
      router.navigate("user", {
        id: String(i),
        query1: "value1",
        query2: "value2",
        query3: "value3",
        query4: "value4",
        query5: "value5",
      });
    }
  }).gc("inner");
}

// 12.1.6 Thousand navigate -> stop -> navigate cycles
{
  const router = createSimpleRouter();

  router.start("/");

  bench("12.1.6 Thousand navigate -> stop -> navigate cycles", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate("about");

      router.stop();
      router.start("/");
      router.navigate("users");
    }
  }).gc("inner");
}

// 12.1.7 Thousand navigations alternating reload flag
// Dynamic reload calculation prevents LICM optimization
{
  const router = createSimpleRouter();
  // Using array to create unpredictable reload pattern
  const reloadPattern = [true, false, true, false, false, true, false, true];
  // Alternate routes to avoid SAME_STATES when reload=false
  const routes = ["about", "home"];

  router.start("/");

  bench("12.1.7 Thousand navigations alternating reload flag", () => {
    for (let i = 0; i < 1000; i++) {
      const reload = reloadPattern[i % reloadPattern.length];

      router.navigate(routes[i % 2], {}, { reload });
    }
  }).gc("inner");
}

// 12.1.8 Five thousand navigations to random routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();
  const routes = Array.from({ length: 20 }, (_, i) => `route${i}`);

  // Add 20 routes
  for (const route of routes) {
    // @ts-expect-error - use method from router5
    router.add({ name: route, path: `/${route}` });
  }

  router.start("/");

  bench("12.1.8 Five thousand navigations to random routes", () => {
    for (let i = 0; i < 5000; i++) {
      const randomRoute = routes[Math.floor(Math.random() * routes.length)];

      router.navigate(randomRoute);
    }
  }).gc("inner");
} else {
  const router = createSimpleRouter();
  const routes = Array.from({ length: 20 }, (_, i) => `route${i}`);

  // Add 20 routes
  for (const route of routes) {
    router.addRoute({ name: route, path: `/${route}` });
  }

  router.start("/");

  bench("12.1.8 Five thousand navigations to random routes", () => {
    for (let i = 0; i < 5000; i++) {
      const randomRoute = routes[Math.floor(Math.random() * routes.length)];

      router.navigate(randomRoute);
    }
  }).gc("inner");
}
