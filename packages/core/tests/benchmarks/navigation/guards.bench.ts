/**
 * Guards benchmarks - state modification scenarios
 *
 * Tests navigation with guards/middleware that modify state,
 * which triggers mergeStates function calls.
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { createRouter } from "../../../src";

import type { Route, State } from "../../../src";

// ============================================================================
// Middleware factories (moved to outer scope for lint compliance)
// ============================================================================

/** Creates a middleware that adds a single param to meta.params */
function createModifyingMiddleware(
  paramKey: string,
  paramValue: string | number | boolean,
) {
  return () => (toState: State, _fromState: State | undefined) => {
    return {
      ...toState,
      meta: {
        ...toState.meta,
        params: {
          ...toState.meta?.params,
          [paramKey]: paramValue,
        },
      },
    } as State;
  };
}

/** Guard function that returns true (no state modification) */
const passthroughGuardFn = () => true;

/** Factory that returns passthrough guard */
const passthroughGuardFactory = () => passthroughGuardFn;

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

      void router.start("/");

      const targetRoutes = ["profile", "home"] as const;
      let i = 0;

      bench("navigate: 1 middleware modifies state", () => {
        do_not_optimize(
          void router.navigate(targetRoutes[i++ % targetRoutes.length]),
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

      void router.start("/");

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

      void router.start("/");

      bench("navigate: 5 middleware modify state", () => {
        do_not_optimize(router.navigate("checkout"));
      }).gc("inner");
    }
  });
});

// ============================================================================
// Guards that return boolean (no state modification)
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
        router.addActivateGuard("page", passthroughGuardFactory);
      }

      void router.start("/");

      bench("navigate: 3 guards (return true)", () => {
        do_not_optimize(router.navigate("page"));
      }).gc("inner");
    }
  });
});
