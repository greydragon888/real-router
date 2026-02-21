// packages/router-benchmarks/modules/02-navigation-plugins/2.3-edge-cases.bench.ts

import { bench } from "mitata";

import { createSimpleRouter, IS_ROUTER5 } from "../helpers";

// Helper: routes to alternate between to avoid same-state short-circuit
const alternatingRoutes = ["about", "home"];

// 2.3.1 Navigation with maximum number of middleware
{
  const router = createSimpleRouter();
  let index = 0;

  // Add 50 middleware (max limit)
  for (let i = 0; i < 50; i++) {
    router.useMiddleware(() => () => {});
  }

  router.start("/");

  bench("2.3.1 Navigation with maximum number of middleware", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.2 Navigation with maximum number of guards
{
  const router = createSimpleRouter();
  let index = 0;

  // Add guards to multiple routes
  router.addActivateGuard("home", () => () => true);
  router.addDeactivateGuard("home", () => () => true);
  router.addActivateGuard("about", () => () => true);
  router.addDeactivateGuard("about", () => () => true);
  router.addActivateGuard("users", () => () => true);
  router.addDeactivateGuard("users", () => () => true);
  router.start("/");

  bench("2.3.2 Navigation with maximum number of guards", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.3 Navigation with maximum number of plugins
{
  const router = createSimpleRouter();
  let index = 0;

  // Add 50 plugins (max limit)
  for (let i = 0; i < 50; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
      onTransitionSuccess: () => {},
    }));
  }

  router.start("/");

  bench("2.3.3 Navigation with maximum number of plugins", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.4 Empty middleware (pass-through without logic)
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => () => {});
  router.start("/");

  bench("2.3.4 Empty middleware (calling done without logic)", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.5 Guard always returning true
{
  const router = createSimpleRouter();
  let index = 0;

  router.addActivateGuard("about", () => () => true);
  router.addActivateGuard("home", () => () => true);
  router.start("/");

  bench("2.3.5 Guard always returning true", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.6 Middleware with immediate pass-through
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => () => {});
  router.start("/");

  bench("2.3.6 Middleware with immediate done call", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.8 Combining forceDeactivate with canDeactivate guards
{
  const router = createSimpleRouter();
  let index = 0;

  router.addDeactivateGuard("home", () => () => false);
  router.addDeactivateGuard("about", () => () => false);
  router.start("/");

  bench("2.3.8 Combining forceDeactivate with canDeactivate guards", () => {
    router.navigate(
      alternatingRoutes[index++ % 2],
      {},
      { forceDeactivate: true },
    );
  }).gc("inner");
}

// 2.3.9 Middleware returning state
{
  const router = createSimpleRouter();
  // This test navigates to "users" via middleware redirect, so we alternate targets
  const targets = ["about", "home"];
  let index = 0;

  router.useMiddleware((_router) => () => {
    void _router.makeState("users", {});
  });
  router.start("/");

  bench("2.3.9 Middleware returning state", () => {
    router.navigate(targets[index++ % 2]);
  }).gc("inner");
}

// 2.3.11 Cancelling navigation during middleware execution
// router5: navigate() does not reliably return a cancel function
// real-router: use router.stop() to cancel in-flight navigation, then restart
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  router.start("/");

  bench("2.3.11 Cancelling navigation during middleware execution", () => {
    void router.navigate(alternatingRoutes[index++ % 2]);

    router.stop();
    router.start("/");
  }).gc("inner");
}

// 2.3.12 Plugin without event handlers
{
  const router = createSimpleRouter();
  let index = 0;

  router.usePlugin(() => ({}));
  router.start("/");

  bench("2.3.12 Plugin without event handlers", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.13 Middleware with heavy computation
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => () => {
    // Heavy computation
    let sum = 0;

    for (let i = 0; i < 1000; i++) {
      sum += i;
    }

    void sum;
  });
  router.start("/");

  bench("2.3.13 Middleware with heavy computation", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.15 Plugin subscribe and unsubscribe cycle
{
  const router = createSimpleRouter();
  let index = 0;

  router.start("/");

  // Subscribe and unsubscribe multiple times
  for (let i = 0; i < 5; i++) {
    const unsubscribe = router.usePlugin(() => ({
      onTransitionSuccess: () => {},
    }));

    unsubscribe();
  }

  bench("2.3.15 Plugin subscribe and unsubscribe cycle", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}
