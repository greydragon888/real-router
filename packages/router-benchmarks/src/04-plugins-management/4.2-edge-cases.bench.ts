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

// 4.2.6 Middleware redirect
{
  const router = createSimpleRouter();
  const routes = ["about", "users"];
  let index = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      void toState;
    },
  }));
  router.start("/users");

  bench("4.2.6 Middleware redirect", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 4.2.8 Registering guard as true (skip check)
{
  const router = createSimpleRouter();

  router.addActivateGuard("about", true);
  router.start("/");
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

  router.usePlugin(() => ({
    onTransitionSuccess: () => {
      const unsubscribe = router.usePlugin(() => ({
        onTransitionSuccess: () => {},
      }));

      unsubscribe();
    },
  }));
  router.start("/");
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

  unsubscribeMiddleware = router.usePlugin(() => ({
    onTransitionSuccess: () => {},
  }));

  router.usePlugin(() => ({
    onTransitionSuccess: () => {
      if (unsubscribeMiddleware) {
        unsubscribeMiddleware();
        unsubscribeMiddleware = router.usePlugin(() => ({
          onTransitionSuccess: () => {},
        }));
      }
    },
  }));

  router.start("/");
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
        const unsubscribe = router.usePlugin(() => ({
          onTransitionSuccess: () => {},
        }));

        unsubscribe();
        unsubscribe();
        unsubscribe();
      }
    },
  ).gc("inner");
}
