// packages/router-benchmarks/modules/13-cloning/13.3-clone-scaling.bench.ts

import { bench, do_not_optimize } from "mitata";

import {
  createSimpleRouter,
  createNestedRouter,
  cloneRouter,
  IS_ROUTER5,
} from "../helpers";

import type { Route } from "../helpers";

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

// 13.3.4 Cloning with deep hierarchy (7 levels)
if (IS_ROUTER5) {
  const router = createNestedRouter();

  const deepRoute: Route = {
    name: "l1",
    path: "/l1",
    children: [
      {
        name: "l2",
        path: "/l2",
        children: [
          {
            name: "l3",
            path: "/l3",
            children: [
              {
                name: "l4",
                path: "/l4",
                children: [
                  {
                    name: "l5",
                    path: "/l5",
                    children: [
                      {
                        name: "l6",
                        path: "/l6",
                        children: [{ name: "l7", path: "/l7" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // @ts-expect-error - use method from router5
  router.add(deepRoute);

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(cloneRouter(router));
  }

  bench("13.3.4 Cloning with deep hierarchy (7 levels)", () => {
    do_not_optimize(cloneRouter(router));
  }).gc("inner");
} else {
  const router = createNestedRouter();

  const deepRoute: Route = {
    name: "l1",
    path: "/l1",
    children: [
      {
        name: "l2",
        path: "/l2",
        children: [
          {
            name: "l3",
            path: "/l3",
            children: [
              {
                name: "l4",
                path: "/l4",
                children: [
                  {
                    name: "l5",
                    path: "/l5",
                    children: [
                      {
                        name: "l6",
                        path: "/l6",
                        children: [{ name: "l7", path: "/l7" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  router.addRoute(deepRoute);

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    do_not_optimize(router.clone());
  }

  bench("13.3.4 Cloning with deep hierarchy (7 levels)", () => {
    do_not_optimize(router.clone());
  }).gc("inner");
}

// 13.3.5 Cloning with 20 middleware and 30 plugins
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 20; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
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
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
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
