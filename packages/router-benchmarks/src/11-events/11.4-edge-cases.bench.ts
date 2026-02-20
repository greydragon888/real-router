// packages/router-benchmarks/modules/11-events/11.4-edge-cases.bench.ts

import { bench } from "mitata";

import { createSimpleRouter, IS_ROUTER5 } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 50;

// 11.4.1 Adding listener during dispatch
{
  const router = createSimpleRouter();
  let addedListenerUnsub: (() => void) | null = null;

  router.addEventListener("$$success", () => {
    const listener = () => {
      // Added during dispatch
    };

    addedListenerUnsub = router.addEventListener("$$success", listener);
  });

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.1 Adding listener during dispatch", () => {
    router.navigate(routes[index++ % 2]);
    // Cleanup to prevent accumulation
    if (addedListenerUnsub) {
      addedListenerUnsub();
      addedListenerUnsub = null;
    }
  }).gc("inner");
}

// 11.4.2 Removing listener during dispatch
{
  const router = createSimpleRouter();
  let handlerUnsub: (() => void) | null = null;

  const removerHandler = () => {
    if (handlerUnsub) {
      handlerUnsub();
    }

    // Re-add for next iteration
    handlerUnsub = router.addEventListener("$$success", () => {});
  };

  router.addEventListener("$$success", removerHandler);
  handlerUnsub = router.addEventListener("$$success", () => {});

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.2 Removing listener during dispatch", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.4.3 Recursive event dispatch
{
  const router = createSimpleRouter();
  let count = 0;

  router.addEventListener("$$success", () => {
    count++;
    if (count < 3) {
      router.navigate(count % 2 === 0 ? "about" : "users");
    }
  });

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.3 Recursive event dispatch", () => {
    count = 0; // Reset count for each iteration
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.4.5 Checking state immutability in listeners
{
  const router = createSimpleRouter();

  router.addEventListener("$$success", () => {
    // Testing immutability
  });

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.5 Checking state immutability in listeners", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.4.7 Multiple subscribe subscriptions with same function with unsubscribe
{
  const router = createSimpleRouter();
  const handler = () => {};

  bench(
    `11.4.7 Multiple subscribe subscriptions with same function with unsubscribe (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsub1 = router.subscribe(handler);
        const unsub2 = router.subscribe(handler);
        const unsub3 = router.subscribe(handler);

        unsub1();
        unsub2();
        unsub3();
      }
    },
  ).gc("inner");
}

// 11.4.9 Invoking events in correct order during navigation
{
  const router = createSimpleRouter();

  router.addEventListener("$$start", () => {
    // Event handler
  });
  router.addEventListener("$$success", () => {
    // Event handler
  });

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.9 Invoking events in correct order during navigation", () => {
    router.navigate(routes[index++ % 2]);
    // events should be ["START", "SUCCESS"]
  }).gc("inner");
}

// 11.4.11 Invoking events on navigation cancel (via stop + restart)
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  router.addEventListener("$$start", () => {
    // Event handler
  });
  router.addEventListener("$$cancel", () => {
    // Event handler
  });

  router.start("/");

  bench("11.4.11 Invoking events on navigation cancel", () => {
    void router.navigate("about");

    router.stop();
    router.start("/");
    // events should be ["START", "CANCEL"]
  }).gc("inner");
}

// 11.4.12 Event handler with async operations
{
  const router = createSimpleRouter();

  router.addEventListener("$$success", () => {
    void Promise.resolve();
    // Async operation - should not block dispatch
  });

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.12 Event handler with async operations", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.4.13 Warning when reaching listener threshold with cleanup
{
  const router = createSimpleRouter();

  bench("11.4.13 Warning when reaching listener threshold with cleanup", () => {
    const unsubscribers: (() => void)[] = [];

    for (let i = 0; i < 1000; i++) {
      unsubscribers.push(router.addEventListener("$$success", () => {}));
    }
    // Cleanup to prevent accumulation
    for (const unsub of unsubscribers) {
      unsub();
    }
  }).gc("inner");
}

// 11.4.14 Listeners receive correct parameters
{
  const router = createSimpleRouter();

  router.addEventListener("$$success", () => {
    // Handler receives toState, fromState, options
  });

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("11.4.14 Listeners receive correct parameters", () => {
    router.navigate(routes[index++ % 2], {}, { reload: true });
  }).gc("inner");
}

// 11.4.16 Removing listener via unsubscribe
{
  const router = createSimpleRouter();

  bench(`11.4.16 Removing listener via unsubscribe (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.addEventListener("$$success", () => {});

      unsubscribe();
    }
  }).gc("inner");
}

// 11.4.17 Multiple removal of same listener (idempotent)
{
  const router = createSimpleRouter();

  bench(
    `11.4.17 Multiple removal of same listener (idempotent) (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        const unsubscribe = router.addEventListener("$$success", () => {});

        unsubscribe();
        unsubscribe();
        unsubscribe();
      }
    },
  ).gc("inner");
}

// 11.4.18 Removing one of multiple listeners
{
  const router = createSimpleRouter();

  router.addEventListener("$$success", () => {});
  router.addEventListener("$$success", () => {});
  router.addEventListener("$$success", () => {});

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const unsubscribe = router.addEventListener("$$success", () => {});

    unsubscribe();
  }

  bench(`11.4.18 Removing one of multiple listeners (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      const unsubscribe = router.addEventListener("$$success", () => {});

      unsubscribe();
    }
  }).gc("inner");
}
