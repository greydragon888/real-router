// packages/router-benchmarks/modules/03-dependencies/3.4-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, IS_ROUTER5 } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 100;

// 3.4.1 Checking existence of non-existent dependency
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench(
    `3.4.1 Checking existence of non-existent dependency (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        // @ts-expect-error - test dependency
        do_not_optimize(router.hasDependency("nonExistent"));
      }
    },
  ).gc("inner");
}

// 3.4.2 Adding dependency with undefined value
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const depsWithUndefined = {
    service1: { id: 1 },
    service2: undefined,
    service3: { id: 3 },
  };

  bench(`3.4.2 Adding dependency with undefined value (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.setDependencies(depsWithUndefined);
      router.resetDependencies();
    }
  }).gc("inner");
}

// 3.4.3 Working with dependencies at warning threshold
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const deps: Record<string, unknown> = {};

  for (let i = 0; i < 20; i++) {
    deps[`service${i}`] = { id: i };
  }

  bench(
    `3.4.3 Working with dependencies at warning threshold (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.setDependencies(deps);
        router.resetDependencies();
      }
    },
  ).gc("inner");
}

// 3.4.4 Working with dependencies at error threshold
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const deps: Record<string, unknown> = {};

  for (let i = 0; i < 50; i++) {
    deps[`service${i}`] = { id: i };
  }

  bench(
    `3.4.4 Working with dependencies at error threshold (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.setDependencies(deps);
        router.resetDependencies();
      }
    },
  ).gc("inner");
}

// 3.4.6 Getting cloned dependency container
/*{
  const router = createSimpleRouter();

  router.setDependencies({
    service1: { id: 1 },
    service2: { id: 2 },
  });

  bench("3.4.6 Getting cloned dependency container", () => {
    const deps = router.getDependencies();

    // Modify the copy
    // @ts-expect-error - modifying copy
    deps.service3 = { id: 3 };
  }).gc("inner");
}*/

// 3.4.7 Fast dependency rotation
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench(`3.4.7 Fast dependency rotation (×${BATCH})`, () => {
    for (let b = 0; b < BATCH; b++) {
      for (let i = 0; i < 10; i++) {
        // @ts-expect-error - test dependency
        router.setDependency("temp", { id: i });
        // @ts-expect-error - test dependency
        router.removeDependency("temp");
      }
    }
  }).gc("inner");
}

// 3.4.8 Concurrent dependency access from multiple middleware
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - test dependency
  router.setDependency("shared", { value: 42 });

  for (let i = 0; i < 5; i++) {
    router.useMiddleware((_router, getDependency) => () => {
      // @ts-expect-error - test dependency
      do_not_optimize(getDependency("shared"));
    });
  }

  router.start("/");
  const routes = ["about", "home"];
  let index = 0;

  bench("3.4.8 Concurrent dependency access from multiple middleware", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 3.4.9 Dependency with very large object
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const largeObject = {
    data: Array.from({ length: 10_000 }, (_, i) => ({
      id: i,
      value: i * 2,
    })),
  };

  // @ts-expect-error - test dependency
  router.setDependency("large", largeObject);

  bench(`3.4.9 Dependency with very large object (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      // @ts-expect-error - test dependency
      do_not_optimize(router.getDependency("large"));
    }
  }).gc("inner");
}

// 3.4.10 Dependency chain
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const serviceA = { name: "A" };
  const serviceB = { name: "B", dependency: serviceA };
  const serviceC = { name: "C", dependency: serviceB };

  router.setDependencies({
    serviceA,
    serviceB,
    serviceC,
  });

  bench(`3.4.10 Dependency chain (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      // @ts-expect-error - test dependency
      do_not_optimize(router.getDependency("serviceC"));
    }
  }).gc("inner");
}

// 3.4.11 Removing non-existent dependency
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench(`3.4.11 Removing non-existent dependency (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      // @ts-expect-error - test dependency
      router.removeDependency("nonExistent");
    }
  }).gc("inner");
}

// 3.4.12 Multiple removal of single dependency
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench(`3.4.12 Multiple removal of single dependency (×${BATCH})`, () => {
    for (let b = 0; b < BATCH; b++) {
      // @ts-expect-error - test dependency
      router.setDependency("service", { value: 1 });
      // @ts-expect-error - test dependency
      router.removeDependency("service");
      // @ts-expect-error - test dependency
      router.removeDependency("service");
      // @ts-expect-error - test dependency
      router.removeDependency("service");
    }
  }).gc("inner");
}
