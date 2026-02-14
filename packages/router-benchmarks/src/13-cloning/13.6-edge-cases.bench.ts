// packages/router-benchmarks/modules/13-cloning/13.6-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, cloneRouter, IS_ROUTER5 } from "../helpers";

// 13.6.1 Chain of clones (clone -> clone -> clone)
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("13.6.1 Chain of clones (clone -> clone -> clone)", () => {
    const cloned1 = cloneRouter(router);
    const cloned2 = cloneRouter(cloned1);
    const cloned3 = cloneRouter(cloned2);

    cloned3.start();
    cloned3.navigate("about");

    // Fallback: stop started clone
    cloned3.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  bench("13.6.1 Chain of clones (clone -> clone -> clone)", () => {
    const cloned1 = router.clone();
    const cloned2 = cloned1.clone();
    const cloned3 = cloned2.clone();

    cloned3.start();
    cloned3.navigate("about");

    // Fallback: stop started clone
    cloned3.stop();
  }).gc("inner");
}

// 13.6.2 Cloning a running router
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  router.start();
  router.navigate("about");

  bench("13.6.2 Cloning a running router", () => {
    const cloned = cloneRouter(router);

    cloned.start();

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  router.start();
  router.navigate("about");

  bench("13.6.2 Cloning a running router", () => {
    const cloned = router.clone();

    cloned.start();

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}

// 13.6.3 Cloning during original navigation
if (IS_ROUTER5) {
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  router.useMiddleware(() => () => {
    // Clone during middleware execution
    do_not_optimize(cloneRouter(router));
  });
  router.start();

  bench("13.6.3 Cloning during original navigation", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
} else {
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  router.useMiddleware(() => () => {
    // Clone during middleware execution
    do_not_optimize(router.clone());
  });
  router.start();

  bench("13.6.3 Cloning during original navigation", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 13.6.4 Cloning basic router
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.6.4 Cloning basic router", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.6.4 Cloning basic router", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}
