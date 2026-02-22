// packages/router-benchmarks/modules/13-cloning/13.3-clone-scaling.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, cloneRouter, IS_ROUTER5 } from "../helpers";

// 13.3.1 Cloning router with 10 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.3.1 Cloning router with 10 routes", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.3.1 Cloning router with 10 routes", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}

// 13.3.2 Cloning router with 100 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.3.2 Cloning router with 100 routes", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 100; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.3.2 Cloning router with 100 routes", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}

// 13.3.3 Cloning router with 500 routes
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    // @ts-expect-error - use method from router5
    router.add({ name: `route${i}`, path: `/route${i}` });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.3.3 Cloning router with 500 routes", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 500; i++) {
    router.addRoute({ name: `route${i}`, path: `/route${i}` });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.3.3 Cloning router with 500 routes", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}

// 13.3.5 Cloning with 20 middleware and 30 plugins
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 20; i++) {
    router.usePlugin(() => ({ onTransitionSuccess: () => {} }));
  }

  for (let i = 0; i < 30; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
    }));
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.3.5 Cloning with 20 middleware and 30 plugins", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  for (let i = 0; i < 20; i++) {
    router.usePlugin(() => ({ onTransitionSuccess: () => {} }));
  }

  for (let i = 0; i < 30; i++) {
    router.usePlugin(() => ({
      onTransitionStart: () => {},
    }));
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.3.5 Cloning with 20 middleware and 30 plugins", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}
