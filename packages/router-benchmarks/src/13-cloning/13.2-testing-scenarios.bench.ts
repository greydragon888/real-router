// packages/router-benchmarks/modules/13-cloning/13.2-testing-scenarios.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, cloneRouter } from "../helpers";

// 13.2.1 Cloning with mock dependencies
{
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(
      cloneRouter(router, {
        api: { fetch: () => Promise.resolve({}) },
        auth: { isAuthenticated: () => true },
      }),
    );
  }

  bench("13.2.1 Cloning with mock dependencies", () => {
    do_not_optimize(
      cloneRouter(router, {
        api: { fetch: () => Promise.resolve({}) },
        auth: { isAuthenticated: () => true },
      }),
    );
  }).gc("inner");
}

// 13.2.2 Cloning in beforeEach (test isolation)
// Note: Has internal loop of 1000 iterations, serves as warmup
{
  const router = createSimpleRouter();

  bench("13.2.2 Cloning in beforeEach (test isolation)", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(cloneRouter(router));
    }
  }).gc("inner");
}

// 13.2.3 Clone preserves middleware and plugins
{
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    router.usePlugin(() => ({ onTransitionSuccess: () => {} }));
    router.usePlugin(() => ({
      onTransitionStart: () => {},
    }));
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("about");
    cloned.stop();
  }

  bench("13.2.3 Clone preserves middleware and plugins", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("about");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}
