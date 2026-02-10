// packages/router-benchmarks/modules/02-navigation-plugins/2.3-edge-cases.bench.ts

/* eslint-disable @typescript-eslint/no-shadow */
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
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
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
  router.canActivate("home", () => () => true);
  router.canDeactivate("home", () => () => true);
  router.canActivate("about", () => () => true);
  router.canDeactivate("about", () => () => true);
  router.canActivate("users", () => () => true);
  router.canDeactivate("users", () => () => true);
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

// 2.3.4 Empty middleware (calling done without logic)
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });
  router.start("/");

  bench("2.3.4 Empty middleware (calling done without logic)", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.5 Guard always returning true
{
  const router = createSimpleRouter();
  let index = 0;

  router.canActivate("about", () => () => true);
  router.canActivate("home", () => () => true);
  router.start("/");

  bench("2.3.5 Guard always returning true", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.6 Middleware with immediate done call
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });
  router.start("/");

  bench("2.3.6 Middleware with immediate done call", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.3.8 Combining forceDeactivate with canDeactivate guards
{
  const router = createSimpleRouter();
  let index = 0;

  router.canDeactivate("home", () => () => false);
  router.canDeactivate("about", () => () => false);
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

  router.useMiddleware((router) => (_toState, _fromState, done) => {
    const modifiedState = router.makeState("users", {});

    done(undefined, modifiedState);
  });
  router.start("/");

  bench("2.3.9 Middleware returning state", () => {
    router.navigate(targets[index++ % 2]);
  }).gc("inner");
}

// 2.3.11 Cancelling navigation during middleware execution
// router5: navigate() does not reliably return a cancel function
// real-router: navigate() always returns a cancel function
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => (_toState, _fromState, done) => {
    setTimeout(() => {
      done();
    }, 10);
  });
  router.start("/");

  bench("2.3.11 Cancelling navigation during middleware execution", () => {
    const cancel = router.navigate(alternatingRoutes[index++ % 2]);

    cancel();
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

  router.useMiddleware(() => (_toState, _fromState, done) => {
    // Heavy computation
    let sum = 0;

    for (let i = 0; i < 1000; i++) {
      sum += i;
    }

    void sum;
    done();
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
