// packages/router-benchmarks/modules/02-navigation-plugins/2.2-async-extensions.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// Helper: routes to alternate between to avoid same-state short-circuit
const alternatingRoutes = ["about", "home"];

// 2.2.1 Navigation with single asynchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async () => {
    await Promise.resolve();
  });
  router.start("/");

  bench("2.2.1 Navigation with single asynchronous middleware", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.2 Navigation with chain of asynchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  for (let i = 0; i < 5; i++) {
    router.useMiddleware(() => async () => {
      await Promise.resolve();
    });
  }

  router.start("/");

  bench("2.2.2 Navigation with chain of asynchronous middleware", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.3 Navigation with asynchronous canActivate guard
{
  const router = createSimpleRouter();
  let index = 0;

  router.addActivateGuard("about", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.addActivateGuard("home", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.start("/");

  bench("2.2.3 Navigation with asynchronous canActivate guard", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.4 Navigation with asynchronous canDeactivate guard
{
  const router = createSimpleRouter();
  let index = 0;

  router.addDeactivateGuard("home", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.addDeactivateGuard("about", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.start("/");

  bench("2.2.4 Navigation with asynchronous canDeactivate guard", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.5 Navigation with mixed synchronous and asynchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => () => {});
  router.useMiddleware(() => async () => {
    await Promise.resolve();
  });
  router.useMiddleware(() => () => {});
  router.start("/");

  bench(
    "2.2.5 Navigation with mixed synchronous and asynchronous middleware",
    async () => {
      await router.navigate(alternatingRoutes[index++ % 2]);
    },
  ).gc("inner");
}

// 2.2.6 Navigation with parallel async operations in middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async () => {
    await Promise.all([Promise.resolve(), Promise.resolve()]);
  });
  router.start("/");

  bench(
    "2.2.6 Navigation with parallel async operations in middleware",
    async () => {
      await router.navigate(alternatingRoutes[index++ % 2]);
    },
  ).gc("inner");
}

// 2.2.7 Navigation with long-running async operations
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  router.start("/");

  bench("2.2.7 Navigation with long-running async operations", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.8 Navigation with async plugin
{
  const router = createSimpleRouter();
  let index = 0;

  router.usePlugin(() => ({
    onTransitionStart: () => {
      void Promise.resolve();
    },
    onTransitionSuccess: () => {
      void Promise.resolve();
    },
  }));
  router.start("/");

  bench("2.2.8 Navigation with async plugin", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.9 Navigation with async data loading in middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async () => {
    // Simulate data fetching
    await Promise.resolve({ user: "test" });
  });
  router.start("/");

  bench("2.2.9 Navigation with async data loading in middleware", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.2.10 Navigation with deferred validation in guards
{
  const router = createSimpleRouter();
  let index = 0;

  router.addActivateGuard("about", () => async () => {
    // Simulate async validation
    await Promise.resolve();

    return true;
  });
  router.addActivateGuard("home", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.start("/");

  bench("2.2.10 Navigation with deferred validation in guards", async () => {
    await router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}
