/**
 * addEventListener / removeEventListener benchmarks
 *
 * Tests subscription management performance:
 * - Core operations (add, remove, unsubscribe)
 * - Scaling with listener count
 * - Real-world usage patterns (plugin registration, component lifecycle)
 *
 * Key performance factors:
 * 1. Set.has() - duplicate detection
 * 2. Set.add() - O(1) insertion
 * 3. Set.delete() - O(1) removal
 * 4. Argument validation (isAddRemoveEventListenersArgumentsValid)
 */

import { bench, boxplot, summary } from "mitata";

import { createRouter, events, getPluginApi } from "@real-router/core";

import type { NavigationOptions, State } from "@real-router/types";

// Minimal routes for router creation
const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:userId" }],
  },
];

// Helper to create router instance
function createBenchRouter() {
  return createRouter(routes);
}

// Reusable listener functions (to test Set deduplication)
const noop = () => {};
const listener1 = () => {};
const listener2 = () => {};
const listener3 = () => {};

// Base noop for listener factory
const baseNoop = () => {};

// Factory for unique listener - returns new function each call
function createListener(): () => void {
  return baseNoop.bind(null);
}

// Generate array of unique listeners
function generateListeners(count: number): (() => void)[] {
  return Array.from({ length: count }, createListener);
}

// Typed empty handler for TRANSITION_START (used in guard tests)
const emptyTransitionStartHandler = (
  _toState: State,

  _fromState?: State,
) => {};

// Factory for plugin-like object
function createPluginHandlers() {
  return {
    onStart: () => {},
    onStop: () => {},
    onTransitionStart: (_toState: State, _fromState?: State) => {},
    onTransitionSuccess: (
      _toState: State,
      _fromState?: State,
      _opts?: NavigationOptions,
    ) => {},
    onTransitionError: () => {},
    onTransitionCancel: () => {},
  };
}

// Factory for analytics-like object
function createAnalyticsHandlers() {
  return {
    trackStart: (_toState: State, _fromState?: State) => {},
    trackSuccess: (
      _toState: State,
      _fromState?: State,
      _opts?: NavigationOptions,
    ) => {},
    trackError: () => {},
    trackCancel: (_toState: State, _fromState?: State) => {},
  };
}

// ============================================================================
// CORE OPERATIONS: addEventListener
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("addEventListener: first listener (empty Set)", () => {
      const router = createBenchRouter();

      getPluginApi(router).addEventListener(events.TRANSITION_START, noop);
    });

    bench("addEventListener: second listener", () => {
      const router = createBenchRouter();

      getPluginApi(router).addEventListener(events.TRANSITION_START, listener1);
      getPluginApi(router).addEventListener(events.TRANSITION_START, listener2);
    });

    bench("addEventListener: third listener", () => {
      const router = createBenchRouter();

      getPluginApi(router).addEventListener(events.TRANSITION_START, listener1);
      getPluginApi(router).addEventListener(events.TRANSITION_START, listener2);
      getPluginApi(router).addEventListener(events.TRANSITION_START, listener3);
    });

    bench("addEventListener: different event types", () => {
      const router = createBenchRouter();

      getPluginApi(router).addEventListener(events.ROUTER_START, noop);
      getPluginApi(router).addEventListener(events.ROUTER_STOP, noop);
      getPluginApi(router).addEventListener(events.TRANSITION_START, noop);
      getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, noop);
      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, noop);
      getPluginApi(router).addEventListener(events.TRANSITION_CANCEL, noop);
    });
  });
});

// ============================================================================
// CORE OPERATIONS: unsubscribe function
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("unsubscribe: returned function call", () => {
      const router = createBenchRouter();

      const unsubscribe = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        noop,
      );

      unsubscribe();
    });

    bench("unsubscribe: multiple listeners", () => {
      const router = createBenchRouter();

      const unsub1 = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        noop,
      );
      const unsub2 = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        listener1,
      );
      const unsub3 = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        listener2,
      );

      unsub1();
      unsub2();
      unsub3();
    });

    bench("unsubscribe: in reverse order", () => {
      const router = createBenchRouter();

      const unsub1 = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        noop,
      );
      const unsub2 = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        listener1,
      );
      const unsub3 = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        listener2,
      );

      unsub3();
      unsub2();
      unsub1();
    });
  });
});

// ============================================================================
// SCALING: Listener count impact
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("add 10 listeners sequentially", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(10);

      for (const l of listeners) {
        getPluginApi(router).addEventListener(events.TRANSITION_START, l);
      }
    });

    bench("add 50 listeners sequentially", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(50);

      for (const l of listeners) {
        getPluginApi(router).addEventListener(events.TRANSITION_START, l);
      }
    });

    bench("add 100 listeners sequentially", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(100);

      for (const l of listeners) {
        getPluginApi(router).addEventListener(events.TRANSITION_START, l);
      }
    });

    bench("add 500 listeners sequentially", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(500);

      for (const l of listeners) {
        getPluginApi(router).addEventListener(events.TRANSITION_START, l);
      }
    });
  });
});

// ============================================================================
// SCALING: Remove all listeners
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("add and remove 10 listeners", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(10);
      const unsubscribes: (() => void)[] = [];

      for (const l of listeners) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(events.TRANSITION_START, l),
        );
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });

    bench("add and remove 50 listeners", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(50);
      const unsubscribes: (() => void)[] = [];

      for (const l of listeners) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(events.TRANSITION_START, l),
        );
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });

    bench("add and remove 100 listeners", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(100);
      const unsubscribes: (() => void)[] = [];

      for (const l of listeners) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(events.TRANSITION_START, l),
        );
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});

// ============================================================================
// REAL-WORLD: Plugin registration pattern (plugins.ts)
// ============================================================================

boxplot(() => {
  summary(() => {
    // Pattern from plugins.ts:248-252 - registering plugin methods
    bench("plugin registration: 6 event handlers", () => {
      const router = createBenchRouter();
      const plugin = createPluginHandlers();

      const unsubscribes = [
        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          plugin.onStart,
        ),
        getPluginApi(router).addEventListener(
          events.ROUTER_STOP,
          plugin.onStop,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          plugin.onTransitionStart,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          plugin.onTransitionSuccess,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          plugin.onTransitionError,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_CANCEL,
          plugin.onTransitionCancel,
        ),
      ];

      // Cleanup
      for (const unsub of unsubscribes) {
        unsub();
      }
    });

    // Multiple plugins scenario
    bench("plugin registration: 3 plugins (18 handlers)", () => {
      const router = createBenchRouter();
      const plugins = [
        createPluginHandlers(),
        createPluginHandlers(),
        createPluginHandlers(),
      ];
      const unsubscribes: (() => void)[] = [];

      for (const plugin of plugins) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(
            events.ROUTER_START,
            plugin.onStart,
          ),
          getPluginApi(router).addEventListener(
            events.ROUTER_STOP,
            plugin.onStop,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_START,
            plugin.onTransitionStart,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_SUCCESS,
            plugin.onTransitionSuccess,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_ERROR,
            plugin.onTransitionError,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_CANCEL,
            plugin.onTransitionCancel,
          ),
        );
      }

      // Cleanup
      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});

// ============================================================================
// REAL-WORLD: React component lifecycle pattern
// ============================================================================

boxplot(() => {
  summary(() => {
    // Simulates useEffect mount/unmount
    bench("React useEffect: mount and unmount single listener", () => {
      const router = createBenchRouter();

      // Mount (useEffect callback)
      const unsubscribe = getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        noop,
      );

      // Unmount (useEffect cleanup)
      unsubscribe();
    });

    // Multiple components mounting
    bench("React: 10 components mounting simultaneously", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(10);
      const unsubscribes: (() => void)[] = [];

      // 10 components mount
      for (const listener of listeners) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(
            events.TRANSITION_SUCCESS,
            listener,
          ),
        );
      }

      // All unmount
      for (const unsub of unsubscribes) {
        unsub();
      }
    });

    // Rapid mount/unmount (component re-renders)
    bench("React: rapid mount/unmount cycle (10 times)", () => {
      const router = createBenchRouter();

      for (let i = 0; i < 10; i++) {
        const listener = createListener();

        const unsub = getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          listener,
        );

        unsub();
      }
    });
  });
});

// ============================================================================
// REAL-WORLD: Analytics/Logging pattern
// ============================================================================

boxplot(() => {
  summary(() => {
    // Analytics service subscribing to all navigation events
    bench("analytics: subscribe to all transition events", () => {
      const router = createBenchRouter();
      const analyticsHandlers = createAnalyticsHandlers();

      const unsubscribes = [
        getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          analyticsHandlers.trackStart,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          analyticsHandlers.trackSuccess,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          analyticsHandlers.trackError,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_CANCEL,
          analyticsHandlers.trackCancel,
        ),
      ];

      // Cleanup on app shutdown
      for (const unsub of unsubscribes) {
        unsub();
      }
    });

    // Multiple analytics services
    bench("analytics: 3 services (12 handlers)", () => {
      const router = createBenchRouter();
      const services = [
        createAnalyticsHandlers(),
        createAnalyticsHandlers(),
        createAnalyticsHandlers(),
      ];
      const unsubscribes: (() => void)[] = [];

      for (const svc of services) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(
            events.TRANSITION_START,
            svc.trackStart,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_SUCCESS,
            svc.trackSuccess,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_ERROR,
            svc.trackError,
          ),
          getPluginApi(router).addEventListener(
            events.TRANSITION_CANCEL,
            svc.trackCancel,
          ),
        );
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});

// ============================================================================
// REAL-WORLD: Guard/middleware-like patterns
// ============================================================================

boxplot(() => {
  summary(() => {
    // Auth guard that listens for navigation
    bench("guard: auth check on every navigation", () => {
      const router = createBenchRouter();

      const unsub = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        emptyTransitionStartHandler,
      );

      unsub();
    });

    // Multiple guards
    bench("guards: auth + permissions + logging (3 guards)", () => {
      const router = createBenchRouter();
      // Each guard needs unique reference
      const authGuard = emptyTransitionStartHandler;
      const permissionsGuard = createListener();
      const loggingGuard = createListener();

      const unsubscribes = [
        getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          authGuard,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          permissionsGuard,
        ),
        getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          loggingGuard,
        ),
      ];

      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

boxplot(() => {
  summary(() => {
    // Create many unsubscribe functions but don't call them
    bench("create 100 unsubscribe functions (no cleanup)", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(100);

      for (const l of listeners) {
        getPluginApi(router).addEventListener(events.TRANSITION_START, l);
      }
      // No cleanup - just measuring creation overhead
    });

    // Interleaved add/remove
    bench("interleaved: add 1, remove 1 (50 times)", () => {
      const router = createBenchRouter();

      for (let i = 0; i < 50; i++) {
        const listener = createListener();
        const unsub = getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          listener,
        );

        unsub();
      }
    });

    // Different events interleaved
    bench("interleaved: different events (30 operations)", () => {
      const router = createBenchRouter();
      const eventTypes = [
        events.ROUTER_START,
        events.ROUTER_STOP,
        events.TRANSITION_START,
        events.TRANSITION_SUCCESS,
        events.TRANSITION_ERROR,
        events.TRANSITION_CANCEL,
      ];

      const unsubscribes: (() => void)[] = [];

      for (let i = 0; i < 30; i++) {
        const eventType = eventTypes[i % eventTypes.length];
        const listener = createListener();

        unsubscribes.push(
          getPluginApi(router).addEventListener(eventType, listener),
        );
      }

      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});

// ============================================================================
// COMPARISON: addEventListener vs removeEventListener
// ============================================================================

boxplot(() => {
  summary(() => {
    bench("addEventListener only (100 listeners)", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(100);

      for (const l of listeners) {
        getPluginApi(router).addEventListener(events.TRANSITION_START, l);
      }
    });

    bench("unsubscribe only (100 listeners pre-added)", () => {
      const router = createBenchRouter();
      const listeners = generateListeners(100);
      const unsubscribes: (() => void)[] = [];

      // Pre-add all listeners
      for (const l of listeners) {
        unsubscribes.push(
          getPluginApi(router).addEventListener(events.TRANSITION_START, l),
        );
      }

      // Only measure unsubscribe
      for (const unsub of unsubscribes) {
        unsub();
      }
    });
  });
});
