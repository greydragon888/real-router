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

  router.canActivate("about", () => () => ({
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

  router.canActivate("about", true);
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

  router.useMiddleware(() => (_toState, _fromState, done) => {
    const unsubscribe = router.useMiddleware(
      () => (_toState2, _fromState2, done2) => {
        done2();
      },
    );

    // Cleanup to prevent accumulation
    unsubscribe();
    done();
  });
  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("4.2.10 Adding middleware during navigation", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(routes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 4.2.11 Removing middleware during navigation
{
  const router = createSimpleRouter();
  let unsubscribeMiddleware: (() => void) | null = null;

  // First middleware that will be removed during navigation
  unsubscribeMiddleware = router.useMiddleware(
    () => (_toState, _fromState, done) => {
      done();
    },
  );

  // Second middleware that removes the first
  router.useMiddleware(() => (_toState, _fromState, done) => {
    if (unsubscribeMiddleware) {
      unsubscribeMiddleware();
      // Re-add to prevent "removing nothing" after first run
      unsubscribeMiddleware = router.useMiddleware(
        () => (_toState2, _fromState2, done2) => {
          done2();
        },
      );
    }

    done();
  });

  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("4.2.11 Removing middleware during navigation", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(routes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
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

// 4.2.13 Multiple middleware removal (idempotent)
{
  const router = createSimpleRouter();

  bench(`4.2.13 Multiple middleware removal (idempotent) (×${BATCH})`, () => {
    for (let b = 0; b < BATCH; b++) {
      const unsubscribe = router.useMiddleware(
        () => (_toState, _fromState, done) => {
          done();
        },
      );

      unsubscribe();
      unsubscribe();
      unsubscribe();
    }
  }).gc("inner");
}
