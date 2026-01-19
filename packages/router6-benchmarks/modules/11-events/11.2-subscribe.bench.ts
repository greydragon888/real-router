// packages/router6-benchmarks/modules/11-events/11.2-subscribe.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 11.2.1 Subscribing via subscribe with unsubscribe
{
  const router = createSimpleRouter();

  bench("11.2.1 Subscribing via subscribe with unsubscribe", () => {
    const unsubscribe = router.subscribe(() => {
      // Subscribe handler
    });

    unsubscribe();
  }).gc("inner");
}

// 11.2.2 Multiple subscriptions via subscribe with unsubscribe
{
  const router = createSimpleRouter();

  bench("11.2.2 Multiple subscriptions via subscribe with unsubscribe", () => {
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
  }).gc("inner");
}

// 11.2.3 Unsubscribing via unsubscribe from subscribe
{
  const router = createSimpleRouter();

  bench("11.2.3 Unsubscribing via unsubscribe from subscribe", () => {
    const unsubscribe = router.subscribe(() => {});

    unsubscribe();
  }).gc("inner");
}

// 11.2.4 Getting data in subscribe handler
{
  const router = createSimpleRouter();

  router.subscribe(() => {
    // Access route and previousRoute in handler
  });
  router.start();

  bench("11.2.4 Getting data in subscribe handler", () => {
    router.navigate("about");
  }).gc("inner");
}
