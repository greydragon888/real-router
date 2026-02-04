// packages/router-benchmarks/modules/12-stress-testing/12.3-extension-scaling.bench.ts

import { bench } from "mitata";

import { createSimpleRouter, createNestedRouter, IS_ROUTER5 } from "../helpers";

// 12.3.1 Navigation with 50 synchronous middleware
{
  const router = createSimpleRouter();
  const alternatingRoutes = ["about", "home"];
  let index = 0;

  // Add 50 middleware (max limit)
  for (let i = 0; i < 50; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
  }

  router.start("/");

  bench("12.3.1 Navigation with 50 synchronous middleware", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 12.3.3 Thousand navigations with 10 middleware
{
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
  }

  router.start();

  bench("12.3.3 Thousand navigations with 10 middleware", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(i % 2 === 0 ? "about" : "users");
    }
  }).gc("inner");
}

// 12.3.4 Navigation with 50 plugins
{
  const router = createSimpleRouter();
  const alternatingRoutes = ["about", "home"];
  let index = 0;

  for (let i = 0; i < 50; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
      onTransitionSuccess: () => {},
    }));
  }

  router.start();

  bench("12.3.4 Navigation with 50 plugins", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 12.3.5 Thousand navigations with 20 plugins
{
  const router = createSimpleRouter();

  for (let i = 0; i < 20; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
      onTransitionSuccess: () => {},
    }));
  }

  router.start();

  bench("12.3.5 Thousand navigations with 20 plugins", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(i % 2 === 0 ? "about" : "users");
    }
  }).gc("inner");
}

// 12.3.6 Navigation with 100 canActivate guards on different routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();
  const routes = ["route50", "route51"];
  let index = 0;

  // Add 100 routes with guards
  for (let i = 0; i < 100; i++) {
    const routeName = `route${i}`;

    // @ts-expect-error - use method from router5
    router.add({ name: routeName, path: `/${routeName}` });
    router.canActivate(routeName, () => () => true);
  }

  router.start();

  bench(
    "12.3.6 Navigation with 100 canActivate guards on different routes",
    () => {
      router.navigate(routes[index++ % 2]);
    },
  ).gc("inner");
} else {
  const router = createSimpleRouter();
  const routes = ["route50", "route51"];
  let index = 0;

  // Add 100 routes with guards
  for (let i = 0; i < 100; i++) {
    const routeName = `route${i}`;

    router.addRoute({ name: routeName, path: `/${routeName}` });
    router.canActivate(routeName, () => () => true);
  }

  router.start();

  bench(
    "12.3.6 Navigation with 100 canActivate guards on different routes",
    () => {
      router.navigate(routes[index++ % 2]);
    },
  ).gc("inner");
}

// 12.3.7 Navigation with 100 canDeactivate guards
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    const routeName = `route${i}`;

    // @ts-expect-error - use method from router5
    router.add({ name: routeName, path: `/${routeName}` });
    router.canDeactivate(routeName, () => () => true);
  }

  router.start();

  bench("12.3.7 Navigation with 100 canDeactivate guards", () => {
    router.navigate("route0");
    router.navigate("route50");
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    const routeName = `route${i}`;

    router.addRoute({ name: routeName, path: `/${routeName}` });
    router.canDeactivate(routeName, () => () => true);
  }

  router.start();

  bench("12.3.7 Navigation with 100 canDeactivate guards", () => {
    router.navigate("route0");
    router.navigate("route50");
  }).gc("inner");
}

// 12.3.8 Thousand navigations with 5 guards on each hierarchy level
// Note: createNestedRouter(5) creates routes: root, root.level1, ..., root.level1.level2.level3.level4.level5
{
  const router = createNestedRouter(5);
  // Alternate between two different nested levels to avoid same-state short-circuit
  const routes = [
    "root.level1.level2.level3.level4.level5",
    "root.level1.level2.level3",
  ];

  // Add guards for nested routes (5 guards on each hierarchy level)
  for (let i = 0; i < 5; i++) {
    router.canActivate("root", () => () => true);
    router.canActivate("root.level1", () => () => true);
    router.canActivate("root.level1.level2", () => () => true);
    router.canActivate("root.level1.level2.level3", () => () => true);
    router.canActivate("root.level1.level2.level3.level4", () => () => true);
    router.canActivate(
      "root.level1.level2.level3.level4.level5",
      () => () => true,
    );
  }

  router.start("/");

  bench(
    "12.3.8 Thousand navigations with 5 guards on each hierarchy level",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(routes[i % 2]);
      }
    },
  ).gc("inner");
}
