// packages/router-benchmarks/modules/04-plugins-management/4.1-adding.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 50;

// 4.1.1 Adding single plugin with cleanup
{
  const router = createSimpleRouter();

  bench(`4.1.1 Adding single plugin with cleanup (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.usePlugin(() => ({
        onTransitionSuccess: () => {},
      }));

      unsubscribe();
    }
  }).gc("inner");
}

// 4.1.2 Adding multiple plugins in single call with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.2 Adding multiple plugins in single call with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.usePlugin(
          () => ({ onTransitionStart: () => {} }),
          () => ({ onTransitionSuccess: () => {} }),
          () => ({ onTransitionError: () => {} }),
        );

        unsubscribe();
      }
    },
  ).gc("inner");
}

// 4.1.3 Sequential plugin adding with cleanup
{
  const router = createSimpleRouter();

  bench(`4.1.3 Sequential plugin adding with cleanup (×${BATCH})`, () => {
    for (let b = 0; b < BATCH; b++) {
      const unsubscribers: (() => void)[] = [];

      for (let i = 0; i < 5; i++) {
        unsubscribers.push(
          router.usePlugin(() => ({
            onTransitionSuccess: () => {},
          })),
        );
      }
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }
  }).gc("inner");
}

// 4.1.4 Adding single middleware with cleanup
{
  const router = createSimpleRouter();

  bench(`4.1.4 Adding single middleware with cleanup (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.useMiddleware(
        () => (_toState, _fromState, done) => {
          done();
        },
      );

      unsubscribe();
    }
  }).gc("inner");
}

// 4.1.5 Adding multiple middleware in single call with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.5 Adding multiple middleware in single call with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.useMiddleware(
          () => (_toState, _fromState, done) => {
            done();
          },
          () => (_toState, _fromState, done) => {
            done();
          },
          () => (_toState, _fromState, done) => {
            done();
          },
        );

        unsubscribe();
      }
    },
  ).gc("inner");
}

// 4.1.6 Sequential middleware adding with cleanup
{
  const router = createSimpleRouter();

  bench(`4.1.6 Sequential middleware adding with cleanup (×${BATCH})`, () => {
    for (let b = 0; b < BATCH; b++) {
      const unsubscribers: (() => void)[] = [];

      for (let i = 0; i < 5; i++) {
        unsubscribers.push(
          router.useMiddleware(() => (_toState, _fromState, done) => {
            done();
          }),
        );
      }
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }
  }).gc("inner");
}

// 4.1.7 Adding canActivate guard for route with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.7 Adding canActivate guard for route with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.canActivate("about", () => () => true);
        // Overwrite with true to effectively clear the guard
        router.canActivate("about", true);
      }
    },
  ).gc("inner");
}

// 4.1.8 Adding canDeactivate guard for route with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.8 Adding canDeactivate guard for route with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.canDeactivate("about", () => () => true);
        // Overwrite with true to effectively clear the guard
        router.canDeactivate("about", true);
      }
    },
  ).gc("inner");
}

// 4.1.9 Adding guards for multiple routes with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.9 Adding guards for multiple routes with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.canActivate("home", () => () => true);
        router.canActivate("about", () => () => true);
        router.canActivate("users", () => () => true);
        router.canDeactivate("home", () => () => true);
        router.canDeactivate("about", () => () => true);
        // Overwrite with true to effectively clear guards
        router.canActivate("home", true);
        router.canActivate("about", true);
        router.canActivate("users", true);
        router.canDeactivate("home", true);
        router.canDeactivate("about", true);
      }
    },
  ).gc("inner");
}

// 4.1.10 Adding guards for nested routes with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.10 Adding guards for nested routes with cleanup (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.canActivate("users", () => () => true);
        router.canActivate("user", () => () => true);
        router.canDeactivate("users", () => () => true);
        router.canDeactivate("user", () => () => true);
        // Overwrite with true to effectively clear guards
        router.canActivate("users", true);
        router.canActivate("user", true);
        router.canDeactivate("users", true);
        router.canDeactivate("user", true);
      }
    },
  ).gc("inner");
}
