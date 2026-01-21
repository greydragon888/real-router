/**
 * Logger real-world scenarios benchmarks
 *
 * Tests realistic core usage patterns:
 * - Navigation logging
 * - Error tracking
 * - Performance monitoring
 * - Production vs development modes
 * - High-load scenarios
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { logger } from "logger";

// Suppress console output for benchmarks
console.log = () => {};
console.warn = () => {};
console.error = () => {};

// Constants for common router contexts
const ROUTER_NAVIGATION = "Router.Navigation";
const ROUTER_GUARDS = "Router.Guards";

// Router navigation scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Real-world: simple navigation log", () => {
      logger.configure({ level: "all" });
      logger.log(ROUTER_NAVIGATION, "Navigation started to route: /users/123");
    });

    bench("Real-world: navigation with state object", () => {
      const state = {
        name: "users.profile",
        params: { id: "123" },
        path: "/users/123",
        meta: { params: {}, options: {} },
      };

      logger.configure({ level: "all" });
      logger.log(ROUTER_NAVIGATION, "Navigating to", state);
    });

    bench("Real-world: full navigation lifecycle", () => {
      logger.configure({ level: "all" });
      logger.log(ROUTER_NAVIGATION, "Starting navigation to /dashboard");
      logger.log(ROUTER_GUARDS, "Checking canDeactivate guards");
      logger.log(ROUTER_GUARDS, "Checking canActivate guards");
      logger.log("Router.Transition", "Transition started");
      logger.log("Router.Middleware", "Running middleware stack");
      logger.log("Router.Transition", "Transition completed successfully");
    });

    bench("Real-world: failed navigation", () => {
      logger.configure({ level: "all" });
      logger.log(ROUTER_NAVIGATION, "Starting navigation to /admin");
      logger.warn(
        ROUTER_GUARDS,
        "canActivate guard failed: insufficient permissions",
      );
      logger.error(ROUTER_NAVIGATION, "Navigation cancelled");
    });
  });
});

// Error scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Real-world: route not found error", () => {
      const error = new Error("Route not found");

      error.stack = `Error: Route not found
    at Router.navigate (router.ts:142:15)
    at Application.handleRequest (app.ts:78:12)`;

      logger.configure({ level: "all" });
      logger.error(ROUTER_NAVIGATION, "Failed to navigate", error);
    });

    bench("Real-world: middleware warning", () => {
      const middlewareCount = 51;

      logger.configure({ level: "all" });
      logger.warn(
        "router.useMiddleware",
        `${middlewareCount} middleware registered! This is excessive and will impact performance.`,
      );
    });

    bench("Real-world: guard timeout", () => {
      logger.configure({ level: "all" });
      logger.error(
        ROUTER_GUARDS,
        "canActivate guard timeout: exceeded 5000ms",
        {
          guard: "authGuard",
          timeout: 5000,
          elapsed: 5123,
        },
      );
    });
  });
});

// Production vs development - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Real-world: development mode (all logs)", () => {
      logger.configure({ level: "all" });

      // Typical dev session with 50 log calls
      for (let i = 0; i < 50; i++) {
        const type = i % 10;

        if (type < 7) {
          logger.log("Router", `Debug info ${i}`);
        } else if (type < 9) {
          logger.warn("Router", `Warning ${i}`);
        } else {
          logger.error("Router", `Error ${i}`);
        }
      }
    });

    bench("Real-world: production mode (errors only)", () => {
      logger.configure({ level: "error-only" });

      // Same 50 calls, but most filtered
      for (let i = 0; i < 50; i++) {
        const type = i % 10;

        if (type < 7) {
          logger.log("Router", `Debug info ${i}`);
        } else if (type < 9) {
          logger.warn("Router", `Warning ${i}`);
        } else {
          logger.error("Router", `Error ${i}`);
        }
      }
    });

    bench("Real-world: production with monitoring", () => {
      let errorCount = 0;

      logger.configure({
        level: "error-only",
        callback: (level) => {
          if (level === "error") {
            errorCount++;
          }
        },
        callbackIgnoresLevel: true,
      });

      for (let i = 0; i < 50; i++) {
        const type = i % 10;

        if (type < 7) {
          logger.log("Router", `Debug info ${i}`);
        } else if (type < 9) {
          logger.warn("Router", `Warning ${i}`);
        } else {
          logger.error("Router", `Error ${i}`);
        }
      }

      do_not_optimize(errorCount);
    });
  });
});

// Performance monitoring - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Real-world: performance metrics logging", () => {
      const metrics = {
        navigationTime: 145,
        guardsTime: 23,
        middlewareTime: 67,
        renderTime: 89,
        totalTime: 324,
      };

      logger.configure({ level: "all" });
      logger.log("Router.Performance", "Navigation completed", metrics);
    });

    bench("Real-world: slow transition warning", () => {
      logger.configure({ level: "all" });
      logger.warn("Router.Performance", "Slow transition detected: 450ms", {
        threshold: 200,
        actual: 450,
        route: "users.profile.settings",
      });
    });

    bench("Real-world: memory usage tracking", () => {
      logger.configure({ level: "all" });
      logger.log("Router.Memory", "Current memory usage", {
        heapUsed: "245MB",
        heapTotal: "512MB",
        external: "12MB",
        activeRoutes: 15,
      });
    });
  });
});

// High-load scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Real-world: 1000 rapid navigations (all logged)", () => {
      logger.configure({ level: "all" });

      for (let i = 0; i < 1000; i++) {
        logger.log("Router", `Navigation ${i} started`);
      }
    });

    bench("Real-world: 1000 rapid navigations (filtered)", () => {
      logger.configure({ level: "error-only" });

      for (let i = 0; i < 1000; i++) {
        logger.log("Router", `Navigation ${i} started`);
      }
    });

    bench("Real-world: mixed load (70% log, 20% warn, 10% error)", () => {
      logger.configure({ level: "all" });

      for (let i = 0; i < 1000; i++) {
        const rand = i % 10;

        if (rand < 7) {
          logger.log("Router", `Request ${i} processed`);
        } else if (rand < 9) {
          logger.warn("Router", `High latency on request ${i}`);
        } else {
          logger.error("Router", `Request ${i} failed`);
        }
      }
    });

    bench("Real-world: SPA session (100 navigations with guards)", () => {
      logger.configure({ level: "all" });

      for (let i = 0; i < 100; i++) {
        logger.log(ROUTER_NAVIGATION, `Starting navigation ${i}`);
        logger.log(ROUTER_GUARDS, "Checking canDeactivate");
        logger.log(ROUTER_GUARDS, "Checking canActivate");
        logger.log("Router.Transition", "Applying transition");
        logger.log(ROUTER_NAVIGATION, `Navigation ${i} complete`);
      }
    });
  });
});

// Error aggregation - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Real-world: error tracking with aggregation", () => {
      const errorStats = {
        routeNotFound: 0,
        guardRejection: 0,
        middleware: 0,
        unknown: 0,
      };

      logger.configure({
        level: "all",
        callback: (_level, context, message) => {
          if (context === ROUTER_NAVIGATION && message.includes("not found")) {
            errorStats.routeNotFound++;
          } else if (
            context === ROUTER_GUARDS &&
            message.includes("rejected")
          ) {
            errorStats.guardRejection++;
          } else if (context === "Router.Middleware") {
            errorStats.middleware++;
          } else {
            errorStats.unknown++;
          }
        },
      });

      for (let i = 0; i < 20; i++) {
        const type = i % 4;

        switch (type) {
          case 0: {
            logger.error(ROUTER_NAVIGATION, "Route /test not found");

            break;
          }
          case 1: {
            logger.error(ROUTER_GUARDS, "Guard rejected navigation");

            break;
          }
          case 2: {
            logger.error("Router.Middleware", "Middleware error");

            break;
          }
          default: {
            logger.error("Router.Unknown", "Unknown error");
          }
        }
      }

      do_not_optimize(errorStats);
    });

    bench("Real-world: telemetry collection", () => {
      const telemetry: any[] = [];

      logger.configure({
        level: "all",
        callback: (level, context, message, ...args) => {
          telemetry.push({
            timestamp: Date.now(),
            level,
            context,
            message,
            args: args.length,
          });
        },
      });

      for (let i = 0; i < 10; i++) {
        logger.log("Router", `Event ${i}`);
        logger.warn("Router", `Warning ${i}`);
        logger.error("Router", `Error ${i}`);
      }

      do_not_optimize(telemetry);
    });
  });
});
