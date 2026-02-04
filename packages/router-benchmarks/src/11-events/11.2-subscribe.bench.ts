// packages/router-benchmarks/modules/11-events/11.2-subscribe.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 50;

// 11.2.1 Subscribing via subscribe with unsubscribe
{
  const router = createSimpleRouter();

  bench(`11.2.1 Subscribing via subscribe with unsubscribe (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.subscribe(() => {
        // Subscribe handler
      });

      unsubscribe();
    }
  }).gc("inner");
}

// 11.2.2 Multiple subscriptions via subscribe with unsubscribe
{
  const router = createSimpleRouter();

  bench(
    `11.2.2 Multiple subscriptions via subscribe with unsubscribe (×${BATCH})`,
    () => {
      for (let b = 0; b < BATCH; b++) {
        const unsubscribers: (() => void)[] = [];

        for (let i = 0; i < 10; i++) {
          unsubscribers.push(
            router.subscribe(() => {
              // Subscribe handler
            }),
          );
        }

        for (const unsub of unsubscribers) {
          unsub();
        }
      }
    },
  ).gc("inner");
}

// 11.2.3 Unsubscribing via unsubscribe from subscribe
{
  const router = createSimpleRouter();

  bench(
    `11.2.3 Unsubscribing via unsubscribe from subscribe (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.subscribe(() => {});

        unsubscribe();
      }
    },
  ).gc("inner");
}
