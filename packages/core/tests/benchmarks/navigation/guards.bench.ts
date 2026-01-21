/**
 * Guards benchmarks - state modification scenarios
 *
 * Tests navigation with guards/middleware that modify state,
 * which triggers mergeStates function calls.
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { createRouter } from "../../../src";

import type { DoneFn, Route, State } from "../../../src";

// ============================================================================
// Guard/middleware factories (moved to outer scope for lint compliance)
// ============================================================================

/** Creates a guard that adds a single param to meta.params */
function createModifyingGuard(
  paramKey: string,
  paramValue: string | number | boolean,
) {
  return () => (toState: State) =>
    ({
      ...toState,
      meta: {
        ...toState.meta,
        params: {
          ...toState.meta?.params,
          [paramKey]: paramValue,
        },
      },
    }) as State;
}

/** Creates a middleware that adds a single param to meta.params */
function createModifyingMiddleware(
  paramKey: string,
  paramValue: string | number | boolean,
) {
  return () =>
    (toState: State, _fromState: State | undefined, done: DoneFn) => {
      const modifiedState = {
        ...toState,
        meta: {
          ...toState.meta,
          params: {
            ...toState.meta?.params,
            [paramKey]: paramValue,
          },
        },
      } as State;

      done(undefined, modifiedState);
    };
}

/** Guard function that returns true (no state modification) */
const passthroughGuardFn = () => true;

/** Factory that returns passthrough guard */
const passthroughGuardFactory = () => passthroughGuardFn;

// ============================================================================
// Guards that modify state (trigger mergeStates)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Navigation with canActivate guard that adds meta.params
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
        { name: "users", path: "/users" },
      ];
      const router = createRouter(routes);

      router.canActivate(
        "about",
        createModifyingGuard("timestamp", Date.now()),
      );

      router.start();

      const targetRoutes = ["about", "users", "home"] as const;
      let i = 0;

      bench("navigate: 1 guard modifies state", () => {
        do_not_optimize(
          router.navigate(targetRoutes[i++ % targetRoutes.length]),
        );
      }).gc("inner");
    }

    // Navigation with multiple guards modifying state
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "dashboard", path: "/dashboard" },
      ];
      const router = createRouter(routes);

      router.canActivate("dashboard", createModifyingGuard("guard1", "done"));
      router.canActivate("dashboard", createModifyingGuard("guard2", "done"));
      router.canActivate("dashboard", createModifyingGuard("guard3", "done"));

      router.start();

      bench("navigate: 3 guards modify state", () => {
        do_not_optimize(router.navigate("dashboard"));
      }).gc("inner");
    }

    // Navigation with 5 guards modifying state
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "admin", path: "/admin" },
      ];
      const router = createRouter(routes);

      for (let g = 1; g <= 5; g++) {
        router.canActivate("admin", createModifyingGuard(`guard${g}`, "done"));
      }

      router.start();

      bench("navigate: 5 guards modify state", () => {
        do_not_optimize(router.navigate("admin"));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Middleware that modifies state
// ============================================================================

boxplot(() => {
  summary(() => {
    // Middleware that adds meta.params
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "profile", path: "/profile" },
      ];
      const router = createRouter(routes);

      router.useMiddleware(
        createModifyingMiddleware("middlewareProcessed", true),
      );

      router.start();

      const targetRoutes = ["profile", "home"] as const;
      let i = 0;

      bench("navigate: 1 middleware modifies state", () => {
        do_not_optimize(
          router.navigate(targetRoutes[i++ % targetRoutes.length]),
        );
      }).gc("inner");
    }

    // Multiple middleware modifying state
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "settings", path: "/settings" },
      ];
      const router = createRouter(routes);

      for (let m = 1; m <= 3; m++) {
        router.useMiddleware(createModifyingMiddleware(`mw${m}`, "processed"));
      }

      router.start();

      bench("navigate: 3 middleware modify state", () => {
        do_not_optimize(router.navigate("settings"));
      }).gc("inner");
    }

    // Heavy middleware chain (5 middleware)
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "checkout", path: "/checkout" },
      ];
      const router = createRouter(routes);

      for (let m = 1; m <= 5; m++) {
        router.useMiddleware(createModifyingMiddleware(`mw${m}`, "processed"));
      }

      router.start();

      bench("navigate: 5 middleware modify state", () => {
        do_not_optimize(router.navigate("checkout"));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Mixed guards + middleware
// ============================================================================

boxplot(() => {
  summary(() => {
    // Combined guards and middleware
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "secure", path: "/secure" },
      ];
      const router = createRouter(routes);

      // 2 guards
      router.canActivate("secure", createModifyingGuard("authGuard", "passed"));
      router.canActivate("secure", createModifyingGuard("roleGuard", "passed"));

      // 2 middleware
      router.useMiddleware(createModifyingMiddleware("loggingMw", "done"));
      router.useMiddleware(createModifyingMiddleware("analyticsMw", "done"));

      router.start();

      bench("navigate: 2 guards + 2 middleware modify state", () => {
        do_not_optimize(router.navigate("secure"));
      }).gc("inner");
    }

    // Real-world scenario: auth + validation + logging
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "order", path: "/order/:id" },
      ];
      const router = createRouter(routes);

      // Auth guard (adds multiple params)
      router.canActivate("order", createModifyingGuard("userId", "user_123"));
      router.canActivate("order", createModifyingGuard("authenticated", true));

      // Permission guard
      router.canActivate("order", createModifyingGuard("canViewOrder", true));

      // Logging middleware
      router.useMiddleware(createModifyingMiddleware("timestamp", Date.now()));

      router.start();

      const orderIds = ["order1", "order2", "order3", "order4"];
      let i = 0;

      bench("navigate: real-world auth flow (3g + 1mw)", () => {
        do_not_optimize(
          router.navigate("order", { id: orderIds[i++ % orderIds.length] }),
        );
      }).gc("inner");
    }
  });
});

// ============================================================================
// Comparison: with vs without state modification
// ============================================================================

boxplot(() => {
  summary(() => {
    // Baseline: guards that DON'T modify state (return true)
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "page", path: "/page" },
      ];
      const router = createRouter(routes);

      for (let g = 1; g <= 3; g++) {
        router.canActivate("page", passthroughGuardFactory);
      }

      router.start();

      bench("navigate: 3 guards (no state mod)", () => {
        do_not_optimize(router.navigate("page"));
      }).gc("inner");
    }

    // Same setup but guards modify state
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "page", path: "/page" },
      ];
      const router = createRouter(routes);

      for (let g = 1; g <= 3; g++) {
        router.canActivate("page", createModifyingGuard(`guard${g}`, "done"));
      }

      router.start();

      bench("navigate: 3 guards (with state mod)", () => {
        do_not_optimize(router.navigate("page"));
      }).gc("inner");
    }
  });
});
