/**
 * getTransitionPath benchmarks
 *
 * Tests getTransitionPath() performance:
 * - Core scenarios (identical states, unrelated routes, sibling navigation, initial load)
 * - Depth scaling (shallow, medium, deep route hierarchies)
 * - Parameter scaling (no params, 1 param, 5 params, 10 params)
 * - Real-world patterns (SPA navigation, breadcrumb navigation, force reload)
 */

import { bench, boxplot, summary } from "mitata";

import { getTransitionPath } from "../../../modules/transitionPath";

import type { State } from "router6";

// Helper functions
function createState(
  name: string,

  params: Record<string, any> = {},

  metaParams: Record<string, any> = {},

  options: Record<string, any> = {},
): State {
  return {
    name,
    params,
    path: `/${name.replaceAll(".", "/")}`,
    meta: {
      id: 1,
      params: metaParams,
      options,
      redirected: false,
    },
  };
}

function generateDeepRoute(depth: number): string {
  return Array.from({ length: depth })
    .map((_, i) => `segment${i}`)
    .join(".");
}

function generateMetaParams(
  routeName: string,
  paramCount: number,
): Record<string, any> {
  const segments = routeName.split(".");

  const result: Record<string, any> = {};

  segments.forEach((_, index) => {
    const segmentName = segments.slice(0, index + 1).join(".");

    result[segmentName] = {};

    for (let i = 0; i < paramCount; i++) {
      result[segmentName][`param${i}`] = "url";
    }
  });

  return result;
}

// Pre-generate all test data to avoid runtime allocations
const TEST_DATA = {
  // Core scenario states
  states: {
    identicalState: createState("a.b.c"),
    unrelatedFrom: createState("admin.dashboard"),
    unrelatedTo: createState("users.profile"),
    siblingFrom: createState("users.list"),
    siblingTo: createState("users.view"),
    initialLoadState: createState("app.users.profile"),
  },

  // Depth scaling states
  depth: {
    shallow: {
      from: createState("a.b.c"),
      to: createState("a.b.d"),
    },
    medium: {
      from: createState(generateDeepRoute(10)),
      to: createState(generateDeepRoute(10).replace("segment9", "modified")),
    },
    deep: {
      from: createState(generateDeepRoute(20)),
      to: createState(generateDeepRoute(20).replace("segment19", "modified")),
    },
  },

  // Parameter test cases
  params: {
    noParams: {
      from: createState("users.view"),
      to: createState("users.edit"),
    },
    oneParam: {
      metaParams: { "users.view": { id: "url" } },
      from: createState(
        "users.view",
        { id: "1" },
        { "users.view": { id: "url" } },
      ),
      to: createState(
        "users.view",
        { id: "2" },
        { "users.view": { id: "url" } },
      ),
    },
    fiveParams: (() => {
      const routeName = "app.module.page";
      const metaParams = generateMetaParams(routeName, 5);

      return {
        from: createState(
          routeName,
          { p0: "a", p1: "b", p2: "c", p3: "d", p4: "e" },
          metaParams,
        ),
        to: createState(
          routeName,
          { p0: "a", p1: "b", p2: "X", p3: "d", p4: "e" },
          metaParams,
        ),
      };
    })(),
    tenParams: (() => {
      const routeName = "app.module.page";
      const metaParams = generateMetaParams(routeName, 10);
      const params1 = Object.fromEntries(
        Array.from({ length: 10 })
          .fill(0)
          .map((_, i) => [`param${i}`, `value${i}`]),
      );
      const params2 = { ...params1, param5: "changed" };

      return {
        from: createState(routeName, params1, metaParams),
        to: createState(routeName, params2, metaParams),
      };
    })(),
  },

  // Real-world patterns
  realWorld: {
    spa: (() => {
      const metaParams = {
        "app.users": {},
        "app.users.view": { id: "url" },
        "app.users.view.tab": { id: "url", tab: "url" },
      };

      return {
        from: createState(
          "app.users.view.tab",
          { id: "123", tab: "profile" },
          metaParams,
        ),
        to: createState(
          "app.users.view.tab",
          { id: "456", tab: "settings" },
          metaParams,
        ),
      };
    })(),
    breadcrumb: (() => {
      const metaParams = {
        shop: {},
        "shop.category": { cat: "url" },
        "shop.category.product": { cat: "url", id: "url" },
      };

      return {
        from: createState(
          "shop.category.product",
          { cat: "electronics", id: "iphone-15" },
          metaParams,
        ),
        to: createState("shop", {}, metaParams),
      };
    })(),
    forceReload: (() => {
      const state = createState("users.profile.settings");

      return {
        from: state,
        to: {
          ...state,
          meta: {
            ...state.meta,
            options: { reload: true },
          },
        },
      };
    })(),
  },
};

// Core scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("getTransitionPath: worst case - identical states", () => {
      getTransitionPath(
        TEST_DATA.states.identicalState,
        TEST_DATA.states.identicalState,
      );
    });

    bench("getTransitionPath: best case - unrelated routes", () => {
      getTransitionPath(
        TEST_DATA.states.unrelatedTo,
        TEST_DATA.states.unrelatedFrom,
      );
    });

    bench("getTransitionPath: typical - sibling navigation", () => {
      getTransitionPath(
        TEST_DATA.states.siblingTo,
        TEST_DATA.states.siblingFrom,
      );
    });

    bench("getTransitionPath: initial load - no fromState", () => {
      // Batch of 10 for stability
      for (let i = 0; i < 10; i++) {
        getTransitionPath(TEST_DATA.states.initialLoadState);
      }
    });
  });
});

// Depth scaling - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("getTransitionPath: shallow - 3 levels", () => {
      const result = getTransitionPath(
        TEST_DATA.depth.shallow.to,
        TEST_DATA.depth.shallow.from,
      );

      result.toActivate.length; // Prevent optimization
    });

    bench("getTransitionPath: medium - 10 levels", () => {
      getTransitionPath(TEST_DATA.depth.medium.to, TEST_DATA.depth.medium.from);
    });

    bench("getTransitionPath: deep - 20 levels", () => {
      getTransitionPath(TEST_DATA.depth.deep.to, TEST_DATA.depth.deep.from);
    });
  });
});

// Parameter scaling - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("getTransitionPath: no params", () => {
      getTransitionPath(
        TEST_DATA.params.noParams.to,
        TEST_DATA.params.noParams.from,
      );
    });

    bench("getTransitionPath: 1 param change", () => {
      getTransitionPath(
        TEST_DATA.params.oneParam.to,
        TEST_DATA.params.oneParam.from,
      );
    });

    bench("getTransitionPath: 5 params comparison", () => {
      getTransitionPath(
        TEST_DATA.params.fiveParams.to,
        TEST_DATA.params.fiveParams.from,
      );
    });

    bench("getTransitionPath: 10 params comparison", () => {
      getTransitionPath(
        TEST_DATA.params.tenParams.to,
        TEST_DATA.params.tenParams.from,
      );
    });
  });
});

// Real-world patterns - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("getTransitionPath: SPA navigation with params", () => {
      getTransitionPath(
        TEST_DATA.realWorld.spa.to,
        TEST_DATA.realWorld.spa.from,
      );
    });

    bench("getTransitionPath: breadcrumb navigation up", () => {
      getTransitionPath(
        TEST_DATA.realWorld.breadcrumb.to,
        TEST_DATA.realWorld.breadcrumb.from,
      );
    });

    bench("getTransitionPath: force reload (same route)", () => {
      getTransitionPath(
        // @ts-expect-error - Testing force reload with same route
        TEST_DATA.realWorld.forceReload.to,
        TEST_DATA.realWorld.forceReload.from,
      );
    });
  });
});
