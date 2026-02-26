// packages/router-benchmarks/modules/03-dependencies/3.5-router-comparison.bench.ts

/**
 * Router5 vs Real Router Dependency Access Comparison
 *
 * This file compares dependency access performance between router5 and real-router.
 * Both routers support dependencies passed to createRouter() and accessed via
 * getDependency() in middleware, guards, and plugins.
 *
 * Note: setDependency/removeDependency are real-router-only APIs.
 * These tests use the common API available in both routers.
 */

import { getDependenciesApi } from "@real-router/core";
import { bench, do_not_optimize } from "mitata";

import { createRouter, IS_ROUTER5, addActivateGuard } from "../helpers";

import type { Route } from "../helpers";

/**
 * API Compatibility:
 * - real-router: factory receives (router, getDependency) where getDependency is a function
 * - router5: factory receives (router, dependencies) where dependencies is the object
 *
 * This helper normalizes the API to always use getDependency function style.
 */
type GetDependency<D> = <K extends keyof D>(key: K) => D[K];

const normalizeDependencyAccessor = <D extends object>(
  depsOrGetDep: unknown,
): GetDependency<D> => {
  if (typeof depsOrGetDep === "function") {
    return depsOrGetDep as GetDependency<D>;
  }

  return <K extends keyof D>(key: K): D[K] => (depsOrGetDep as D)[key];
};

// Common test dependencies for both routers
interface TestDependencies {
  authService: {
    isAuthenticated: () => boolean;
    getUser: () => { id: string };
  };
  logger: { log: (msg: string) => void };
  config: { apiUrl: string; timeout: number };
  analytics: { track: (event: string) => void };
  cache: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
}

const testDependencies: TestDependencies = {
  authService: {
    isAuthenticated: () => true,
    getUser: () => ({ id: "user-123" }),
  },
  logger: { log: () => {} },
  config: { apiUrl: "https://api.example.com", timeout: 5000 },
  analytics: { track: () => {} },
  cache: {
    get: () => null,
    set: () => {},
  },
};

const routes: Route<TestDependencies>[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "users", path: "/users" },
  { name: "user", path: "/users/:id" },
  { name: "dashboard", path: "/dashboard" },
];

// Helper: routes to alternate between to avoid same-state short-circuit
const alternatingRoutes = ["about", "home"];

// 3.5.1 Batch: Router creation with dependencies (1000 iterations)
{
  bench(
    "3.5.1 Batch: Router creation with dependencies (1000 iterations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        do_not_optimize(createRouter(routes, {}, testDependencies));
      }
    },
  ).gc("inner");
}

// 3.5.2 Batch: Single dependency access in middleware (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

      do_not_optimize(getDep("authService"));
    },
  }));
  router.start("/");

  bench(
    "3.5.2 Batch: Single dependency access in middleware (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.3 Batch: Multiple dependency access in middleware (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

      do_not_optimize(getDep("authService"));
      do_not_optimize(getDep("logger"));
      do_not_optimize(getDep("config"));
    },
  }));
  router.start("/");

  bench(
    "3.5.3 Batch: Multiple dependency access in middleware (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.4 Batch: Dependency access in guard (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  addActivateGuard(router, "about", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    do_not_optimize(getDep("authService"));

    return true;
  });

  addActivateGuard(router, "home", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    do_not_optimize(getDep("authService"));

    return true;
  });
  router.start("/");

  bench("3.5.4 Batch: Dependency access in guard (1000 navigations)", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(alternatingRoutes[index++ % 2]);
    }
  }).gc("inner");
}

// 3.5.5 Batch: Dependency access in plugin (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.usePlugin((_router, depsOrGetDep) => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    return {
      onTransitionSuccess: () => {
        do_not_optimize(getDep("analytics"));
      },
    };
  });
  router.start("/");

  bench("3.5.5 Batch: Dependency access in plugin (1000 navigations)", () => {
    for (let i = 0; i < 1000; i++) {
      router.navigate(alternatingRoutes[index++ % 2]);
    }
  }).gc("inner");
}

// 3.5.6 Batch: Chain of middleware accessing same dependency (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  for (let i = 0; i < 5; i++) {
    router.usePlugin((_router, depsOrGetDep) => ({
      onTransitionSuccess: () => {
        const getDep =
          normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

        do_not_optimize(getDep("authService"));
      },
    }));
  }

  router.start("/");

  bench(
    "3.5.6 Batch: Chain of middleware accessing same dependency (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.7 Batch: Chain of middleware accessing different dependencies (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;
  const depKeys: (keyof TestDependencies)[] = [
    "authService",
    "logger",
    "config",
    "analytics",
    "cache",
  ];

  for (let i = 0; i < 5; i++) {
    const depKey = depKeys[i];

    router.usePlugin((_router, depsOrGetDep) => ({
      onTransitionSuccess: () => {
        const getDep =
          normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

        do_not_optimize(getDep(depKey));
      },
    }));
  }

  router.start("/");

  bench(
    "3.5.7 Batch: Chain of middleware accessing different dependencies (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.8 Batch: Combined middleware + guard dependency access (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

      do_not_optimize(getDep("logger"));
    },
  }));

  addActivateGuard(router, "about", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    do_not_optimize(getDep("authService"));

    return true;
  });

  addActivateGuard(router, "home", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    do_not_optimize(getDep("authService"));

    return true;
  });
  router.start("/");

  bench(
    "3.5.8 Batch: Combined middleware + guard dependency access (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.9 Batch: Combined middleware + guard + plugin dependency access (1000 navigations)
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

      do_not_optimize(getDep("logger"));
    },
  }));

  addActivateGuard(router, "about", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    do_not_optimize(getDep("authService"));

    return true;
  });

  addActivateGuard(router, "home", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    do_not_optimize(getDep("authService"));

    return true;
  });

  router.usePlugin((_router, depsOrGetDep) => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    return {
      onTransitionSuccess: () => {
        do_not_optimize(getDep("analytics"));
      },
    };
  });
  router.start("/");

  bench(
    "3.5.9 Batch: Combined middleware + guard + plugin dependency access (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.10 Batch: Heavy dependency usage scenario (1000 navigations)
// Simulates a real-world scenario with multiple middleware and guards using dependencies
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);
      const auth = getDep("authService");

      do_not_optimize(auth.isAuthenticated());
      do_not_optimize(auth.getUser());
    },
  }));

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);
      const logger = getDep("logger");

      do_not_optimize(logger.log);
    },
  }));

  router.usePlugin((_router, depsOrGetDep) => ({
    onTransitionSuccess: () => {
      const getDep =
        normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);
      const config = getDep("config");

      do_not_optimize(config.apiUrl);
      do_not_optimize(config.timeout);
    },
  }));

  // Auth guard

  addActivateGuard(router, "about", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);
    const auth = getDep("authService");

    return auth.isAuthenticated();
  });

  addActivateGuard(router, "home", (_router: any, depsOrGetDep: any) => () => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);
    const auth = getDep("authService");

    return auth.isAuthenticated();
  });

  // Analytics plugin
  router.usePlugin((_router, depsOrGetDep) => {
    const getDep = normalizeDependencyAccessor<TestDependencies>(depsOrGetDep);

    return {
      onTransitionStart: () => {
        do_not_optimize(getDep("analytics"));
      },
      onTransitionSuccess: () => {
        const analytics = getDep("analytics");

        do_not_optimize(analytics.track);
      },
    };
  });
  router.start("/");

  bench(
    "3.5.10 Batch: Heavy dependency usage scenario (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// 3.5.11 Batch: Router creation with large dependency object (1000 iterations)
{
  const largeDependencies = {
    ...testDependencies,
    service1: { data: Array.from({ length: 100 }, (_, i) => i) },
    service2: { data: Array.from({ length: 100 }, (_, i) => i) },
    service3: { data: Array.from({ length: 100 }, (_, i) => i) },
  };

  bench(
    "3.5.11 Batch: Router creation with large dependency object (1000 iterations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        do_not_optimize(createRouter(routes, {}, largeDependencies));
      }
    },
  ).gc("inner");
}

// 3.5.12 Batch: Router creation without dependencies (1000 iterations)
// Baseline comparison
{
  bench(
    "3.5.12 Batch: Router creation without dependencies (1000 iterations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        do_not_optimize(createRouter(routes));
      }
    },
  ).gc("inner");
}

// 3.5.13 Batch: Navigation without dependency access (1000 navigations)
// Baseline comparison
{
  const router = createRouter(routes, {}, testDependencies);
  let index = 0;

  router.start("/");

  bench(
    "3.5.13 Batch: Navigation without dependency access (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        router.navigate(alternatingRoutes[index++ % 2]);
      }
    },
  ).gc("inner");
}

// real-router-only tests for dynamic dependency management
// These tests demonstrate real-router's extended dependency API

// 3.5.14 Batch: setDependency/removeDependency cycle (real-router only)
if (!IS_ROUTER5) {
  const router = createRouter(routes, {}, testDependencies);

  bench(
    "3.5.14 Batch: setDependency/removeDependency cycle (1000 iterations, real-router only)",
    () => {
      for (let i = 0; i < 1000; i++) {
        // @ts-expect-error - test dependency
        router.setDependency("dynamicService", { id: i });
        // @ts-expect-error - test dependency
        router.removeDependency("dynamicService");
      }
    },
  ).gc("inner");
}

// 3.5.15 Batch: getDependency direct access (real-router only)
if (!IS_ROUTER5) {
  const router = createRouter(routes, {}, testDependencies);

  bench(
    "3.5.15 Batch: getDependency direct access (1000 iterations, real-router only)",
    () => {
      for (let i = 0; i < 1000; i++) {
        do_not_optimize(getDependenciesApi(router).get("authService"));
      }
    },
  ).gc("inner");
}

// 3.5.16 Batch: hasDependency check (real-router only)
if (!IS_ROUTER5) {
  const router = createRouter(routes, {}, testDependencies);
  const keys = ["authService", "nonExistent"];

  bench(
    "3.5.16 Batch: hasDependency check (1000 iterations, real-router only)",
    () => {
      for (let i = 0; i < 1000; i++) {
        // @ts-expect-error - test dependency
        do_not_optimize(router.hasDependency(keys[i % 2]));
      }
    },
  ).gc("inner");
}

// 3.5.17 Batch: setDependencies/resetDependencies cycle (real-router only)
if (!IS_ROUTER5) {
  const simpleRoutes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ];
  const router = createRouter(simpleRoutes);
  const deps1 = { service1: { id: 1 }, service2: { id: 2 } };
  const deps2 = { service3: { id: 3 }, service4: { id: 4 } };
  const depsSets = [deps1, deps2];

  bench(
    "3.5.17 Batch: setDependencies/resetDependencies cycle (1000 iterations, real-router only)",
    () => {
      for (let i = 0; i < 1000; i++) {
        getDependenciesApi(router).setAll(depsSets[i % 2]);
        getDependenciesApi(router).reset();
      }
    },
  ).gc("inner");
}
