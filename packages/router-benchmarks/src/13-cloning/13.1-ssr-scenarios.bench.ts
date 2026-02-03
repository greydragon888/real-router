// packages/router-benchmarks/modules/13-cloning/13.1-ssr-scenarios.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, cloneRouter, IS_ROUTER5 } from "../helpers";

// 13.1.1 Basic cloning for SSR request
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.1.1 Basic cloning for SSR request", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.1.1 Basic cloning for SSR request", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}

// 13.1.2 Cloning with request dependency injection
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(
      cloneRouter(router, {
        req: { url: "/about" },
        res: { send: () => {} },
        cookies: { sessionId: "abc123" },
      }),
    );
  }

  bench("13.1.2 Cloning with request dependency injection", () => {
    do_not_optimize(
      cloneRouter(router, {
        req: { url: "/about" },
        res: { send: () => {} },
        cookies: { sessionId: "abc123" },
      }),
    );
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(
      router.clone({
        req: { url: "/about" },
        res: { send: () => {} },
        cookies: { sessionId: "abc123" },
      }),
    );
  }

  bench("13.1.2 Cloning with request dependency injection", () => {
    do_not_optimize(
      router.clone({
        req: { url: "/about" },
        res: { send: () => {} },
        cookies: { sessionId: "abc123" },
      }),
    );
  }).gc("inner");
}

// 13.1.3 Full SSR cycle: clone -> start -> getState -> stop
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/about");
    do_not_optimize(cloned.getState());
    cloned.stop();
  }

  bench("13.1.3 Full SSR cycle: clone -> start -> getState -> stop", () => {
    const cloned = cloneRouter(router);

    cloned.start("/about");
    do_not_optimize(cloned.getState());
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = router.clone();

    cloned.start("/about");
    do_not_optimize(cloned.getState());
    cloned.stop();
  }

  bench("13.1.3 Full SSR cycle: clone -> start -> getState -> stop", () => {
    const cloned = router.clone();

    cloned.start("/about");
    do_not_optimize(cloned.getState());
    cloned.stop();
  }).gc("inner");
}

// 13.1.4 Sequential clones (request flow simulation)
// Note: Has internal loop of 100 iterations, serves as warmup
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("13.1.4 Sequential clones (request flow simulation)", () => {
    for (let i = 0; i < 100; i++) {
      const cloned = cloneRouter(router);

      cloned.start(`/user/${i}`);
      cloned.stop();
    }
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  bench("13.1.4 Sequential clones (request flow simulation)", () => {
    for (let i = 0; i < 100; i++) {
      const cloned = router.clone();

      cloned.start(`/user/${i}`);
      cloned.stop();
    }
  }).gc("inner");
}

// 13.1.5 Parallel clones (concurrent requests)
// Note: Has internal loop of 50 iterations, serves as warmup
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("13.1.5 Parallel clones (concurrent requests)", async () => {
    const clones = Array.from({ length: 50 }, () => {
      const cloned = cloneRouter(router);

      cloned.start("/about");

      return cloned;
    });

    await Promise.all(clones.map((c) => Promise.resolve(c.getState())));

    // Fallback: stop all started clones
    for (const cloned of clones) {
      cloned.stop();
    }
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  bench("13.1.5 Parallel clones (concurrent requests)", async () => {
    const clones = Array.from({ length: 50 }, () => {
      const cloned = router.clone();

      cloned.start("/about");

      return cloned;
    });

    await Promise.all(clones.map((c) => Promise.resolve(c.getState())));

    // Fallback: stop all started clones
    for (const cloned of clones) {
      cloned.stop();
    }
  }).gc("inner");
}
