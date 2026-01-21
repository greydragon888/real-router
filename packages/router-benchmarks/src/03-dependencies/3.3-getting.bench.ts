// packages/router-benchmarks/modules/03-dependencies/3.3-getting.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

const IS_ROUTER5 = process.env.BENCH_ROUTER === "router5";

// 3.3.1 Getting single dependency
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("service", { value: 1 });

  bench("3.3.1 Getting single dependency", () => {
    // @ts-expect-error - test dependency
    do_not_optimize(router.getDependency("service"));
  }).gc("inner");
}

// 3.3.2 Multiple getting of single dependency
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("service", { value: 1 });

  bench("3.3.2 Multiple getting of single dependency", () => {
    for (let i = 0; i < 10; i++) {
      // @ts-expect-error - test dependency
      do_not_optimize(router.getDependency("service"));
    }
  }).gc("inner");
}

// 3.3.3 Batch getting 1000 all dependencies
/*{
  const router = createSimpleRouter();

  router.setDependencies({
    service1: { id: 1 },
    service2: { id: 2 },
    service3: { id: 3 },
  });

  bench("3.3.3 Batch getting 1000 all dependencies", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.getDependencies());
    }
  }).gc("inner");
}*/

// 3.3.4 Checking dependency existence
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("service", { value: 1 });

  bench("3.3.4 Checking dependency existence", () => {
    // @ts-expect-error - test dependency
    do_not_optimize(router.hasDependency("service"));
  }).gc("inner");
}

// 3.3.5 Getting dependency in middleware
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("service", { check: () => true });
  router.useMiddleware(
    (_router, getDependency) => (_toState, _fromState, done) => {
      // @ts-expect-error - test dependency
      do_not_optimize(getDependency("service"));
      done();
    },
  );
  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("3.3.5 Getting dependency in middleware", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 3.3.6 Getting dependency in guard
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("auth", { isAllowed: () => true });
  router.canActivate("about", (_router, getDependency) => () => {
    // @ts-expect-error - test dependency
    do_not_optimize(getDependency("auth"));

    return true;
  });
  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("3.3.6 Getting dependency in guard", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 3.3.7 Getting dependency in plugin
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("logger", { log: () => {} });
  router.usePlugin((_router, getDependency) => ({
    onTransitionSuccess: () => {
      // @ts-expect-error - test dependency
      do_not_optimize(getDependency("logger"));
    },
  }));
  router.start();
  const routes = ["about", "home"];
  let index = 0;

  bench("3.3.7 Getting dependency in plugin", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}
