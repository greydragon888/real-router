// packages/router-benchmarks/modules/04-plugins-management/4.2-edge-cases.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 50;

// 4.2.1 Plugin with empty methods object with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.2.1 Plugin with empty methods object with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.usePlugin(() => ({}));

        unsubscribe();
      }
    },
  ).gc("inner");
}

// 4.2.2 Plugin with partial set of handlers with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.2.2 Plugin with partial set of handlers with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.usePlugin(() => ({
          onTransitionSuccess: () => {},
        }));

        unsubscribe();
      }
    },
  ).gc("inner");
}

// 4.2.3 Adding plugin with teardown method with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.2.3 Adding plugin with teardown method with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.usePlugin(() => ({
          onTransitionSuccess: () => {},
          teardown: () => {},
        }));

        unsubscribe();
      }
    },
  ).gc("inner");
}

// 4.2.6 Guard returning State
{
  const router = createSimpleRouter();
  // Alternate: "about" (redirects to "home") and "users"
  // Start at "users" so redirect to "home" is always a real navigation
  const routes = ["about", "users"];
  let index = 0;

  router.addActivateGuard("about", () => () => ({
    name: "home",
    params: {},
    path: "/",
  }));
  router.start("/users");

  bench("4.2.6 Guard returning State", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 4.2.8 Registering guard as true (skip check)
{
  const router = createSimpleRouter();

  router.addActivateGuard("about", true);
  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("4.2.8 Registering guard as true (skip check)", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 4.2.9 Alternating plugin adding and removing
{
  const router = createSimpleRouter();

  bench(`4.2.9 Alternating plugin adding and removing (×${BATCH})`, () => {
    for (let b = 0; b < BATCH; b++) {
      for (let i = 0; i < 5; i++) {
        const unsubscribe = router.usePlugin(() => ({
          onTransitionSuccess: () => {},
        }));

        unsubscribe();
      }
    }
  }).gc("inner");
}

// 4.2.10 Adding middleware during navigation
{
  const router = createSimpleRouter();

  router.useMiddleware(() => () => {
    const unsubscribe = router.useMiddleware(() => () => {});

    // Cleanup to prevent accumulation
    unsubscribe();
  });
  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("4.2.10 Adding middleware during navigation", async () => {
    await router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 4.2.11 Removing middleware during navigation
{
  const router = createSimpleRouter();
  let unsubscribeMiddleware: (() => void) | null = null;

  // First middleware that will be removed during navigation
  unsubscribeMiddleware = router.useMiddleware(() => () => {});

  // Second middleware that removes the first
  router.useMiddleware(() => () => {
    if (unsubscribeMiddleware) {
      unsubscribeMiddleware();
      // Re-add to prevent "removing nothing" after first run
      unsubscribeMiddleware = router.useMiddleware(() => () => {});
    }
  });

  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("4.2.11 Removing middleware during navigation", async () => {
    await router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 4.2.12 Multiple plugin removal (idempotent)
{
  const router = createSimpleRouter();

  bench(`4.2.12 Multiple plugin removal (idempotent) (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.usePlugin(() => ({
        onTransitionSuccess: () => {},
      }));

      unsubscribe();
      unsubscribe();
      unsubscribe();
    }
  }).gc("inner");
}

// Increased BATCH for sub-microsecond operations to reduce RME
const BATCH_MIDDLEWARE = 200;

// 4.2.13 Multiple middleware removal (idempotent)
{
  const router = createSimpleRouter();

  bench(
    `4.2.13 Multiple middleware removal (idempotent) (×${BATCH_MIDDLEWARE})`,
    () => {
      for (let b = 0; b < BATCH_MIDDLEWARE; b++) {
        const unsubscribe = router.useMiddleware(() => () => {});

        unsubscribe();
        unsubscribe();
        unsubscribe();
      }
    },
  ).gc("inner");
}
