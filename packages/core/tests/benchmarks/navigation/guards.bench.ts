/**
 * Guards benchmarks - state modification scenarios
 *
 * Tests navigation with guards/middleware that modify state,
 * which triggers mergeStates function calls.
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { createRouter, getLifecycleApi } from "../../../src";

import type { Route } from "../../../src";

// ============================================================================
// Plugin factories (moved to outer scope for lint compliance)
// ============================================================================

function createModifyingPlugin(
  _paramKey: string,
  _paramValue: string | number | boolean,
) {
  return () => ({ onTransitionSuccess: () => {} });
}

/** Guard function that returns true (no state modification) */
const passthroughGuardFn = () => true;

/** Factory that returns passthrough guard */
const passthroughGuardFactory = () => passthroughGuardFn;

// ============================================================================
// Plugin overhead during navigation
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "profile", path: "/profile" },
      ];
      const router = createRouter(routes);

      router.usePlugin(createModifyingPlugin("pluginProcessed", true));

      void router.start("/");

      const targetRoutes = ["profile", "home"] as const;
      let i = 0;

      bench("navigate: 1 plugin onTransitionSuccess", () => {
        do_not_optimize(
          void router.navigate(targetRoutes[i++ % targetRoutes.length]),
        );
      }).gc("inner");
    }

    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "settings", path: "/settings" },
      ];
      const router = createRouter(routes);

      for (let m = 1; m <= 3; m++) {
        router.usePlugin(createModifyingPlugin(`plugin${m}`, "processed"));
      }

      void router.start("/");

      bench("navigate: 3 plugins onTransitionSuccess", () => {
        do_not_optimize(router.navigate("settings"));
      }).gc("inner");
    }

    {
      const routes: Route[] = [
        { name: "home", path: "/" },
        { name: "checkout", path: "/checkout" },
      ];
      const router = createRouter(routes);

      for (let m = 1; m <= 5; m++) {
        router.usePlugin(createModifyingPlugin(`plugin${m}`, "processed"));
      }

      void router.start("/");

      bench("navigate: 5 plugins onTransitionSuccess", () => {
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
        getLifecycleApi(router).addActivateGuard(
          "page",
          passthroughGuardFactory,
        );
      }

      void router.start("/");

      bench("navigate: 3 guards (return true)", () => {
        do_not_optimize(router.navigate("page"));
      }).gc("inner");
    }
  });
});
