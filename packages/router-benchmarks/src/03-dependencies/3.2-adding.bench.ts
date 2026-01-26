// packages/router-benchmarks/modules/03-dependencies/3.2-adding.bench.ts

import { bench } from "mitata";

import { createSimpleRouter, IS_ROUTER5 } from "../helpers";

// 3.2.1 Adding single dependency with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("3.2.1 Adding single dependency with cleanup", () => {
    // @ts-expect-error - test dependency
    router.setDependency("newService", { value: 1 });
    // @ts-expect-error - test dependency
    router.removeDependency("newService");
  }).gc("inner");
}

// 3.2.2 Batch adding dependencies with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const deps = {
    service1: { id: 1 },
    service2: { id: 2 },
    service3: { id: 3 },
  };

  bench("3.2.2 Batch adding dependencies with cleanup", () => {
    router.setDependencies(deps);
    router.resetDependencies();
  }).gc("inner");
}

// 3.2.3 Adding dependency with simple type with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("3.2.3 Adding dependency with simple type with cleanup", () => {
    // @ts-expect-error - test dependency
    router.setDependency("counter", 42);
    // @ts-expect-error - test dependency
    router.removeDependency("counter");
  }).gc("inner");
}

// 3.2.4 Adding dependency with complex object with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  const complexObj = {
    config: { nested: { deep: { value: true } } },
    methods: { fetch: () => null },
    data: Array.from({ length: 100 }, (_, i) => i),
  };

  bench("3.2.4 Adding dependency with complex object with cleanup", () => {
    // @ts-expect-error - test dependency
    router.setDependency("complex", complexObj);
    // @ts-expect-error - test dependency
    router.removeDependency("complex");
  }).gc("inner");
}

// 3.2.5 Batch overwriting 1000 existing dependencies
/*{
  const router = createSimpleRouter();
  const versions = [{ version: 1 }, { version: 2 }];

  // @ts-expect-error - test dependency
  router.setDependency("service", versions[0]);

  bench("3.2.5 Batch overwriting 1000 existing dependencies", () => {
    for (let i = 0; i < 1000; i++) {
      // @ts-expect-error - test dependency
      do_not_optimize(router.setDependency("service", versions[i % 2]));
    }
  }).gc("inner");
}*/

// 3.2.6 Adding dependency with null value with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("3.2.6 Adding dependency with null value with cleanup", () => {
    // @ts-expect-error - test dependency
    router.setDependency("nullValue", null);
    // @ts-expect-error - test dependency
    router.removeDependency("nullValue");
  }).gc("inner");
}

// 3.2.7 Adding dependency with false value with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("3.2.7 Adding dependency with false value with cleanup", () => {
    // @ts-expect-error - test dependency
    router.setDependency("flag", false);
    // @ts-expect-error - test dependency
    router.removeDependency("flag");
  }).gc("inner");
}

// 3.2.8 Adding dependency with zero value with cleanup
if (!IS_ROUTER5) {
  const router = createSimpleRouter();

  bench("3.2.8 Adding dependency with zero value with cleanup", () => {
    // @ts-expect-error - test dependency
    router.setDependency("zero", 0);
    // @ts-expect-error - test dependency
    router.removeDependency("zero");
  }).gc("inner");
}
