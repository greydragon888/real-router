/**
 * invokeEventListeners benchmarks
 *
 * Tests invokeEventListeners() performance:
 * - Core scenarios (different event types, varying listener counts)
 * - Real-world usage patterns from router internals
 *
 * NOTE: States are now frozen in makeState(), not in invokeEventListeners.
 * This benchmark measures pure event dispatch overhead.
 *
 * Key performance factors:
 * 1. Set cloning: [...set] for safe iteration
 * 2. Validation overhead: isState(), isNavigationOptions()
 * 3. Function.prototype.apply.call: listener invocation
 */

import { bench, boxplot, summary } from "mitata";

import { createRouter, events } from "router6";

import { RouterError } from "../../../modules/RouterError";

import type { NavigationOptions, State } from "router6-types";

// Minimal routes for router creation
const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:userId" },
  { name: "admin", path: "/admin" },
  { name: "admin.settings", path: "/settings" },
  { name: "admin.settings.security", path: "/security" },
  { name: "admin.settings.security.permissions", path: "/permissions" },
  { name: "search", path: "/search" },
  { name: "search.results", path: "/results" },
];

// ============================================================================
// SHARED ROUTER INSTANCES (created once, reused across benchmarks)
// ============================================================================

// Router for basic benchmarks (no listeners)
const sharedRouter = createRouter(routes);

// Router with listeners for TRANSITION_START
const routerWith1Listener = createRouter(routes);

routerWith1Listener.addEventListener(events.TRANSITION_START, () => {});

const routerWith5Listeners = createRouter(routes);

for (let i = 0; i < 5; i++) {
  routerWith5Listeners.addEventListener(events.TRANSITION_START, () => {});
}

const routerWith10Listeners = createRouter(routes);

for (let i = 0; i < 10; i++) {
  routerWith10Listeners.addEventListener(events.TRANSITION_START, () => {});
}

const routerWith50Listeners = createRouter(routes);

for (let i = 0; i < 50; i++) {
  routerWith50Listeners.addEventListener(events.TRANSITION_START, () => {});
}

const routerWith100Listeners = createRouter(routes);

for (let i = 0; i < 100; i++) {
  routerWith100Listeners.addEventListener(events.TRANSITION_START, () => {});
}

// Router for real-world patterns
const patternRouter = createRouter(routes);

patternRouter.addEventListener(events.ROUTER_START, () => {});
patternRouter.addEventListener(events.ROUTER_STOP, () => {});
patternRouter.addEventListener(events.TRANSITION_START, () => {});
patternRouter.addEventListener(events.TRANSITION_SUCCESS, () => {});
patternRouter.addEventListener(events.TRANSITION_ERROR, () => {});
patternRouter.addEventListener(events.TRANSITION_CANCEL, () => {});

// ============================================================================
// PRE-FROZEN TEST DATA (simulates real router behavior)
// States from makeState() are now frozen, so we freeze them here too
// ============================================================================

function freezeDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    freezeDeep(value);
  }

  return obj;
}

const TEST_DATA = {
  states: {
    shallow: freezeDeep({
      name: "home",
      path: "/",
      params: {},
    } satisfies State),

    typical: freezeDeep({
      name: "users.profile",
      path: "/users/123",
      params: { userId: "123" },
    } satisfies State),

    // Deep nested state - uses type assertion for benchmark purposes
    deepNested: freezeDeep({
      name: "admin.settings.security.permissions",
      path: "/admin/settings/security/permissions?filter=active&page=1",
      params: {
        filter: "active",
        page: 1,
        nested: {
          level1: {
            level2: {
              level3: {
                value: "deep",
                array: [1, 2, 3],
              },
            },
          },
        },
        tags: ["admin", "security", "permissions"],
        metadata: {
          created: "2024-01-01",
          updated: "2024-12-01",
          active: true,
          verified: true,
        },
      },
    } as State),

    withArrayParams: freezeDeep({
      name: "search.results",
      path: "/search?q=test&filters=a,b,c",
      params: {
        query: "test",
        filters: ["a", "b", "c", "d", "e"],
        items: Array.from({ length: 20 }, (_, i) => `item${i}`),
      },
    } satisfies State),
  },

  options: {
    minimal: {} satisfies NavigationOptions,
    typical: { replace: false, reload: false } satisfies NavigationOptions,
    full: {
      replace: true,
      reload: true,
      skipTransition: false,
      force: true,
    } satisfies NavigationOptions,
  },

  error: new RouterError("NAVIGATION_ERROR", { message: "Test error" }),
};

// ============================================================================
// CORE SCENARIOS: Pure invokeEventListeners overhead (no router creation)
// ============================================================================

boxplot(() => {
  summary(() => {
    // ROUTER_START/STOP - no State, no fromState
    bench("ROUTER_START: no listeners, no state", () => {
      sharedRouter.invokeEventListeners(events.ROUTER_START);
    });

    // TRANSITION_START - validates toState
    bench("TRANSITION_START: no listeners, shallow state", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.shallow,
        undefined,
      );
    });

    // TRANSITION_SUCCESS - validates toState + options
    bench("TRANSITION_SUCCESS: no listeners, shallow state", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.shallow,
        undefined,
        TEST_DATA.options.typical,
      );
    });

    // TRANSITION_ERROR - validates toState + error
    bench("TRANSITION_ERROR: no listeners", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_ERROR,
        TEST_DATA.states.shallow,
        undefined,
        TEST_DATA.error,
      );
    });
  });
});

// ============================================================================
// LISTENER COUNT IMPACT (pure dispatch, no router creation)
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("TRANSITION_START: 1 listener", () => {
      routerWith1Listener.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });

    bench("TRANSITION_START: 5 listeners", () => {
      routerWith5Listeners.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });

    bench("TRANSITION_START: 10 listeners", () => {
      routerWith10Listeners.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });

    bench("TRANSITION_START: 50 listeners", () => {
      routerWith50Listeners.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });

    bench("TRANSITION_START: 100 listeners", () => {
      routerWith100Listeners.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });
  });
});

// ============================================================================
// STATE COMPLEXITY IMPACT (validation overhead, no freezing)
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("validation: shallow state", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.shallow,
        undefined,
      );
    });

    bench("validation: typical state", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        undefined,
      );
    });

    bench("validation: deep nested state", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.deepNested,
        undefined,
      );
    });

    bench("validation: state with arrays", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.withArrayParams,
        undefined,
      );
    });

    bench("validation: both toState and fromState (deep)", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.deepNested,
        TEST_DATA.states.withArrayParams,
      );
    });
  });
});

// ============================================================================
// REAL-WORLD USAGE PATTERNS (with listeners, no router creation)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Pattern 1: router.start() sequence
    bench("router.start() pattern: ROUTER_START + TRANSITION_SUCCESS", () => {
      patternRouter.invokeEventListeners(events.ROUTER_START);
      patternRouter.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        undefined,
        TEST_DATA.options.typical,
      );
    });

    // Pattern 2: router.stop()
    bench("router.stop() pattern: ROUTER_STOP", () => {
      patternRouter.invokeEventListeners(events.ROUTER_STOP);
    });

    // Pattern 3: Successful navigation
    bench("navigate() success: TRANSITION_START + TRANSITION_SUCCESS", () => {
      patternRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
      patternRouter.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
    });

    // Pattern 4: Navigation cancelled
    bench("navigate() cancelled: TRANSITION_START + TRANSITION_CANCEL", () => {
      patternRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
      patternRouter.invokeEventListeners(
        events.TRANSITION_CANCEL,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });

    // Pattern 5: Navigation error
    bench("navigate() error: TRANSITION_START + TRANSITION_ERROR", () => {
      patternRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
      patternRouter.invokeEventListeners(
        events.TRANSITION_ERROR,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.error,
      );
    });

    // Pattern 6: Route not found (no toState)
    bench("navigate() not found: TRANSITION_ERROR without toState", () => {
      patternRouter.invokeEventListeners(
        events.TRANSITION_ERROR,
        undefined,
        TEST_DATA.states.shallow,
        TEST_DATA.error,
      );
    });
  });
});

// ============================================================================
// MULTIPLE NAVIGATION CYCLES (realistic app usage)
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("10 sequential navigations (success)", () => {
      for (let i = 0; i < 10; i++) {
        patternRouter.invokeEventListeners(
          events.TRANSITION_START,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
        );
        patternRouter.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
          TEST_DATA.options.typical,
        );
      }
    });

    bench("10 sequential navigations (mixed success/cancel)", () => {
      for (let i = 0; i < 10; i++) {
        patternRouter.invokeEventListeners(
          events.TRANSITION_START,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
        );

        if (i % 2 === 0) {
          patternRouter.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            TEST_DATA.states.typical,
            TEST_DATA.states.shallow,
            TEST_DATA.options.typical,
          );
        } else {
          patternRouter.invokeEventListeners(
            events.TRANSITION_CANCEL,
            TEST_DATA.states.typical,
            TEST_DATA.states.shallow,
          );
        }
      }
    });

    bench("SPA session: start + 20 navigations + stop", () => {
      // Start
      patternRouter.invokeEventListeners(events.ROUTER_START);
      patternRouter.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.shallow,
        undefined,
        TEST_DATA.options.minimal,
      );

      // 20 navigations
      for (let i = 0; i < 20; i++) {
        patternRouter.invokeEventListeners(
          events.TRANSITION_START,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
        );
        patternRouter.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
          TEST_DATA.options.typical,
        );
      }

      // Stop
      patternRouter.invokeEventListeners(events.ROUTER_STOP);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("invocation with no registered listeners", () => {
      sharedRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
    });

    bench("all 6 events with listeners", () => {
      patternRouter.invokeEventListeners(events.ROUTER_START);
      patternRouter.invokeEventListeners(
        events.TRANSITION_START,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
      patternRouter.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
      patternRouter.invokeEventListeners(
        events.TRANSITION_CANCEL,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
      );
      patternRouter.invokeEventListeners(
        events.TRANSITION_ERROR,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.error,
      );
      patternRouter.invokeEventListeners(events.ROUTER_STOP);
    });
  });
});
