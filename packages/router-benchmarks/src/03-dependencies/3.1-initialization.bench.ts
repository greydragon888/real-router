// packages/router-benchmarks/modules/03-dependencies/3.1-initialization.bench.ts

import { bench } from "mitata";

import { createRouter, IS_ROUTER5 } from "../helpers";

import type { Route } from "../helpers";

/**
 * Batch size for stable measurements on sub-µs operations.
 */
const BATCH = 100;

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

// 3.1.1 Setting empty dependencies
if (!IS_ROUTER5) {
  const router = createRouter(routes);

  bench(`3.1.1 Setting empty dependencies (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.setDependencies({});
      router.resetDependencies();
    }
  }).gc("inner");
}

// 3.1.2 Setting single dependency
if (!IS_ROUTER5) {
  const router = createRouter(routes);

  bench(`3.1.2 Setting single dependency (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      // @ts-expect-error - test dependency
      router.setDependency("service", { name: "test" });
      router.resetDependencies();
    }
  }).gc("inner");
}

// 3.1.3 Setting multiple dependencies
if (!IS_ROUTER5) {
  const router = createRouter(routes);
  const deps: Record<string, unknown> = {};

  for (let i = 0; i < 15; i++) {
    deps[`service${i}`] = { id: i };
  }

  bench(`3.1.3 Setting multiple dependencies (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.setDependencies(deps);
      router.resetDependencies();
    }
  }).gc("inner");
}

// 3.1.4 Setting simple dependencies
if (!IS_ROUTER5) {
  const router = createRouter(routes);
  const simpleDeps = {
    string: "value",
    number: 42,
    boolean: true,
  };

  bench(`3.1.4 Setting simple dependencies (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.setDependencies(simpleDeps);
      router.resetDependencies();
    }
  }).gc("inner");
}

// 3.1.5 Setting object dependencies
if (!IS_ROUTER5) {
  const router = createRouter(routes);
  const objectDeps = {
    config: { host: "localhost", port: 3000 },
    api: { fetch: () => Promise.resolve() },
  };

  bench(`3.1.5 Setting object dependencies (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.setDependencies(objectDeps);
      router.resetDependencies();
    }
  }).gc("inner");
}

// 3.1.6 Setting function dependencies
if (!IS_ROUTER5) {
  const router = createRouter(routes);
  const funcDeps = {
    logger: () => console.log,
    validator: Boolean,
  };

  bench(`3.1.6 Setting function dependencies (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.setDependencies(funcDeps);
      router.resetDependencies();
    }
  }).gc("inner");
}
