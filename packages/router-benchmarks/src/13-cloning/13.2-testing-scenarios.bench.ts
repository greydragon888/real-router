// packages/router-benchmarks/modules/13-cloning/13.2-testing-scenarios.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, cloneRouter, IS_ROUTER5 } from "../helpers";

// 13.2.1 Cloning with mock dependencies
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("13.2.1 Cloning with mock dependencies", () => {
    do_not_optimize(
      cloneRouter(router, {
        api: { fetch: () => Promise.resolve({}) },
        auth: { isAuthenticated: () => true },
      }),
    );
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  bench("13.2.1 Cloning with mock dependencies", () => {
    do_not_optimize(
      router.clone({
        api: { fetch: () => Promise.resolve({}) },
        auth: { isAuthenticated: () => true },
      }),
    );
  }).gc("inner");
}

// 13.2.2 Cloning in beforeEach (test isolation)
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("13.2.2 Cloning in beforeEach (test isolation)", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(cloneRouter(router));
    }
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  bench("13.2.2 Cloning in beforeEach (test isolation)", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.clone());
    }
  }).gc("inner");
}

// 13.2.3 Clone preserves middleware and plugins
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
    router.usePlugin(() => ({
      onTransitionStart: () => {},
    }));
  }

  bench("13.2.3 Clone preserves middleware and plugins", () => {
    const cloned = cloneRouter(router);

    cloned.start();
    cloned.navigate("about");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
    router.usePlugin(() => ({
      onTransitionStart: () => {},
    }));
  }

  bench("13.2.3 Clone preserves middleware and plugins", () => {
    const cloned = router.clone();

    cloned.start();
    cloned.navigate("about");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}
