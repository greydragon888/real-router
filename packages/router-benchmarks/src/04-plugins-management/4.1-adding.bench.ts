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
  // Pre-create plugin factory to avoid allocation inside loop
  const pluginFactory = () => ({
    onTransitionSuccess: () => {},
  });

  bench(`4.1.1 Adding single plugin with cleanup (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.usePlugin(pluginFactory);

      unsubscribe();
    }
  }).gc("inner");
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

// Increased BATCH for sub-microsecond operations to reduce RME
const BATCH_GUARDS = 200;

// 4.1.7 Adding canActivate guard for route with cleanup
{
  const router = createSimpleRouter();

  bench(
    `4.1.7 Adding canActivate guard for route with cleanup (×${BATCH_GUARDS})`,
    () => {
      for (let i = 0; i < BATCH_GUARDS; i++) {
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
    `4.1.8 Adding canDeactivate guard for route with cleanup (×${BATCH_GUARDS})`,
    () => {
      for (let i = 0; i < BATCH_GUARDS; i++) {
        router.canDeactivate("about", () => () => true);
        // Overwrite with true to effectively clear the guard
        router.canDeactivate("about", true);
      }
    },
  ).gc("inner");
}
