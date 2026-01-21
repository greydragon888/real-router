/**
 * subscribe benchmarks
 *
 * Tests router.subscribe() performance:
 * - Core operations (subscribe, unsubscribe)
 * - Multiple subscribers scaling
 * - React integration patterns (RouterProvider, useRouterSubscription)
 * - Listener invocation with deepFreezeState overhead
 * - Comparison with raw addEventListener for TRANSITION_SUCCESS
 *
 * Key performance factors:
 * 1. Wrapper function creation for each subscription
 * 2. deepFreezeState called twice per invocation (route + previousRoute)
 * 3. Object creation for { route, previousRoute } payload
 */

import { bench, boxplot, summary } from "mitata";

import { createRouter, events } from "@real-router/core";

import type { NavigationOptions, State, SubscribeState } from "core-types";

// Minimal routes for router creation
const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:userId" },
  { name: "admin", path: "/admin" },
  { name: "admin.settings", path: "/settings" },
  { name: "admin.settings.security", path: "/security" },
  { name: "search", path: "/search" },
  { name: "search.results", path: "/results" },
];

// Helper to create router instance
function createBenchRouter() {
  return createRouter(routes);
}

// Pre-generated test data
const TEST_DATA = {
  states: {
    shallow: {
      name: "home",
      path: "/",
      params: {},
    } satisfies State,

    typical: {
      name: "users.profile",
      path: "/users/123",
      params: { userId: "123" },
    } satisfies State,

    // Deep nested state for deepFreezeState overhead testing
    deepNested: {
      name: "admin.settings.security",
      path: "/admin/settings/security?filter=active&page=1",
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
    } as State,

    withArrayParams: {
      name: "search.results",
      path: "/search?q=test&filters=a,b,c",
      params: {
        query: "test",
        filters: ["a", "b", "c", "d", "e"],
        items: Array.from({ length: 20 }, (_, i) => `item${i}`),
      },
    } satisfies State,
  },

  options: {
    typical: { replace: false, reload: false } satisfies NavigationOptions,
  },
};

// Factory for creating subscriber functions
const baseSubscriber = (_state: SubscribeState) => {};

function createSubscriber(): (state: SubscribeState) => void {
  return baseSubscriber.bind(null);
}

// Listener for addEventListener comparison
const baseTransitionListener = (_toState: State, _fromState?: State) => {};

function createTransitionListener(): (
  toState: State,
  fromState?: State,
) => void {
  return baseTransitionListener.bind(null);
}

// Noop callback for React pattern simulations
const noopCallback = () => {};

// Selectors for useRouterSubscription pattern (moved to module scope)
const simpleRouteSelector = (sub?: SubscribeState) => sub?.route;
const routeNameSelector = (sub?: SubscribeState) => sub?.route.name;
const usersOnlyShouldUpdate = (newRoute: State) =>
  newRoute.name.startsWith("users");

function complexSelector(sub?: SubscribeState) {
  if (!sub?.route) {
    return null;
  }

  return {
    routeName: sub.route.name,
    params: sub.route.params,
    isActive: sub.route.name === "users.profile",
    hasParams: Object.keys(sub.route.params).length > 0,
  };
}

// Type for route state storage (allows undefined values explicitly)
interface RouteStateStorage {
  route: State | undefined;
  previousRoute: State | undefined;
}

// ============================================================================
// CORE OPERATIONS
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("subscribe: single subscriber", () => {
      const router = createBenchRouter();
      const subscriber = createSubscriber();

      const unsubscribe = router.subscribe(subscriber);

      unsubscribe();
    });

    bench("subscribe + unsubscribe cycle", () => {
      const router = createBenchRouter();
      const subscriber = createSubscriber();

      const unsubscribe = router.subscribe(subscriber);

      unsubscribe();
    });

    bench("subscribe: 5 subscribers sequentially", () => {
      const router = createBenchRouter();
      const unsubscribes: (() => void)[] = [];

      for (let i = 0; i < 5; i++) {
        unsubscribes.push(router.subscribe(createSubscriber()));
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });

    bench("subscribe: 10 subscribers sequentially", () => {
      const router = createBenchRouter();
      const unsubscribes: (() => void)[] = [];

      for (let i = 0; i < 10; i++) {
        unsubscribes.push(router.subscribe(createSubscriber()));
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});

// ============================================================================
// COMPARISON: subscribe vs addEventListener
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("subscribe: wrapper overhead", () => {
      const router = createBenchRouter();
      const subscriber = createSubscriber();

      const unsubscribe = router.subscribe(subscriber);

      unsubscribe();
    });

    bench("addEventListener: direct TRANSITION_SUCCESS", () => {
      const router = createBenchRouter();
      const listener = createTransitionListener();

      const unsubscribe = router.addEventListener(
        events.TRANSITION_SUCCESS,
        listener,
      );

      unsubscribe();
    });
  });
});

// ============================================================================
// LISTENER INVOCATION (deepFreezeState overhead)
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("invocation: shallow states", () => {
      const router = createBenchRouter();

      router.subscribe(createSubscriber());

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.shallow,
        undefined,
        TEST_DATA.options.typical,
      );
    });

    bench("invocation: typical states", () => {
      const router = createBenchRouter();

      router.subscribe(createSubscriber());

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
    });

    bench("invocation: deep nested states", () => {
      const router = createBenchRouter();

      router.subscribe(createSubscriber());

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.deepNested,
        TEST_DATA.states.withArrayParams,
        TEST_DATA.options.typical,
      );
    });

    bench("invocation: 5 subscribers, typical states", () => {
      const router = createBenchRouter();

      for (let i = 0; i < 5; i++) {
        router.subscribe(createSubscriber());
      }

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
    });

    bench("invocation: 10 subscribers, typical states", () => {
      const router = createBenchRouter();

      for (let i = 0; i < 10; i++) {
        router.subscribe(createSubscriber());
      }

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
    });
  });
});

// ============================================================================
// REACT INTEGRATION PATTERNS
// ============================================================================

// Simulates RouterProvider pattern from real-router/src/RouterProvider.tsx
function simulateRouterProviderPattern(
  router: ReturnType<typeof createRouter>,
) {
  const currentState: RouteStateStorage = {
    route: router.getState(),
    previousRoute: undefined,
  };

  const unsubscribe = router.subscribe(({ route, previousRoute }) => {
    currentState.route = route;
    currentState.previousRoute = previousRoute;
    noopCallback();
  });

  return { getCurrentState: () => currentState, unsubscribe };
}

// Simulates useRouterSubscription pattern from real-router/src/hooks/useRouterSubscription.tsx
function simulateUseRouterSubscriptionPattern<T>(
  router: ReturnType<typeof createRouter>,
  selector: (sub?: SubscribeState) => T,
  shouldUpdate?: (newRoute: State, prevRoute?: State) => boolean,
) {
  let stateRef: T | undefined;

  // Lazy initialization
  const currentState = router.getState();
  const shouldInitialize =
    !shouldUpdate || (currentState && shouldUpdate(currentState));

  stateRef = selector(
    shouldInitialize && currentState
      ? { route: currentState, previousRoute: undefined }
      : undefined,
  );

  const unsubscribe = router.subscribe((next) => {
    let shouldProcess = true;

    if (shouldUpdate) {
      shouldProcess = shouldUpdate(next.route, next.previousRoute);
    }

    if (!shouldProcess) {
      return;
    }

    const newValue = selector(next);

    if (!Object.is(stateRef, newValue)) {
      stateRef = newValue;
      noopCallback();
    }
  });

  return { getSnapshot: () => stateRef, unsubscribe };
}

boxplot(() => {
  summary(() => {
    // RouterProvider pattern
    bench("React: RouterProvider pattern", () => {
      const router = createBenchRouter();

      const { unsubscribe } = simulateRouterProviderPattern(router);

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );

      unsubscribe();
    });

    // useRouterSubscription with simple selector
    bench("React: useRouterSubscription (simple selector)", () => {
      const router = createBenchRouter();

      const { unsubscribe } = simulateUseRouterSubscriptionPattern(
        router,
        simpleRouteSelector,
      );

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );

      unsubscribe();
    });

    // useRouterSubscription with shouldUpdate filter
    bench("React: useRouterSubscription (with shouldUpdate)", () => {
      const router = createBenchRouter();

      const { unsubscribe } = simulateUseRouterSubscriptionPattern(
        router,
        routeNameSelector,
        usersOnlyShouldUpdate,
      );

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );

      unsubscribe();
    });

    // useRouterSubscription with complex selector (derived state)
    bench("React: useRouterSubscription (complex selector)", () => {
      const router = createBenchRouter();

      const { unsubscribe } = simulateUseRouterSubscriptionPattern(
        router,
        complexSelector,
      );

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );

      unsubscribe();
    });
  });
});

// ============================================================================
// MULTIPLE NAVIGATIONS (SPA session simulation)
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("SPA session: 1 subscriber, 10 navigations", () => {
      const router = createBenchRouter();

      router.subscribe(createSubscriber());

      for (let i = 0; i < 10; i++) {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
          TEST_DATA.options.typical,
        );
      }
    });

    bench("SPA session: 3 subscribers, 10 navigations", () => {
      const router = createBenchRouter();

      for (let i = 0; i < 3; i++) {
        router.subscribe(createSubscriber());
      }

      for (let i = 0; i < 10; i++) {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
          TEST_DATA.options.typical,
        );
      }
    });

    bench(
      "SPA session: RouterProvider + 2 useRouterSubscription, 10 navigations",
      () => {
        const router = createBenchRouter();

        // RouterProvider
        simulateRouterProviderPattern(router);

        // 2 useRouterSubscription hooks
        simulateUseRouterSubscriptionPattern(router, simpleRouteSelector);
        simulateUseRouterSubscriptionPattern(
          router,
          routeNameSelector,
          usersOnlyShouldUpdate,
        );

        for (let i = 0; i < 10; i++) {
          router.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            TEST_DATA.states.typical,
            TEST_DATA.states.shallow,
            TEST_DATA.options.typical,
          );
        }
      },
    );

    bench("SPA session: 5 components, 20 navigations", () => {
      const router = createBenchRouter();

      // Simulate 5 React components subscribed
      simulateRouterProviderPattern(router);

      for (let i = 0; i < 4; i++) {
        simulateUseRouterSubscriptionPattern(router, simpleRouteSelector);
      }

      for (let i = 0; i < 20; i++) {
        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          TEST_DATA.states.typical,
          TEST_DATA.states.shallow,
          TEST_DATA.options.typical,
        );
      }
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("invocation: no subscribers (baseline)", () => {
      const router = createBenchRouter();

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
    });

    bench("subscribe + immediate unsubscribe", () => {
      const router = createBenchRouter();
      const subscriber = createSubscriber();

      router.subscribe(subscriber)();
    });

    bench("multiple unsubscribe calls (idempotent)", () => {
      const router = createBenchRouter();
      const subscriber = createSubscriber();
      const unsubscribe = router.subscribe(subscriber);

      unsubscribe();
      unsubscribe(); // Second call should be safe
      unsubscribe(); // Third call should be safe
    });

    bench("subscribe during invocation simulation", () => {
      const router = createBenchRouter();
      let subscribed = false;

      router.subscribe(() => {
        if (!subscribed) {
          subscribed = true;
          router.subscribe(createSubscriber());
        }
      });

      router.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        TEST_DATA.states.typical,
        TEST_DATA.states.shallow,
        TEST_DATA.options.typical,
      );
    });
  });
});
