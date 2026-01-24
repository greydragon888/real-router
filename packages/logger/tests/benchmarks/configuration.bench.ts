/**
 * Logger configuration benchmarks
 *
 * Tests configuration performance:
 * - Single parameter changes
 * - Multiple parameter changes
 * - Frequent reconfiguration
 * - Configuration patterns
 */

import { bench, boxplot, do_not_optimize, summary } from "mitata";

import { logger } from "@real-router/logger";

// Suppress console output for benchmarks
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const CONTEXT = "bench";
const MESSAGE = "test message";
const LEVEL_ALL = "all";
const LEVEL_WARN_ERROR = "warn-error";
const ALL_LEVELS = ["all", "warn-error", "error-only", "none"] as const;

const simpleCallback = (level: string, context: string, message: string) => {
  return `${level}:${context}:${message}`;
};

// Basic configuration - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Configuration: level only", () => {
      logger.configure({ level: LEVEL_ALL });
    });

    bench("Configuration: callback only", () => {
      logger.configure({
        callback: simpleCallback,
      });
    });

    bench("Configuration: callbackIgnoresLevel only", () => {
      logger.configure({
        callbackIgnoresLevel: true,
      });
    });
  });
});

// Combined configuration - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Configuration: level + callback", () => {
      logger.configure({
        level: LEVEL_ALL,
        callback: simpleCallback,
      });
    });

    bench("Configuration: level + callbackIgnoresLevel", () => {
      logger.configure({
        level: LEVEL_WARN_ERROR,
        callbackIgnoresLevel: true,
      });
    });

    bench("Configuration: all parameters", () => {
      logger.configure({
        level: LEVEL_WARN_ERROR,
        callback: simpleCallback,
        callbackIgnoresLevel: true,
      });
    });
  });
});

// Frequent reconfiguration - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Configuration: 10 sequential level changes", () => {
      const levels = ALL_LEVELS;

      for (let i = 0; i < 10; i++) {
        logger.configure({
          level: levels[i % 4],
        });
      }
    });

    bench("Configuration: 10 sequential callback changes", () => {
      const callbacks = [simpleCallback, () => {}, () => "test", undefined];

      for (let i = 0; i < 10; i++) {
        logger.configure({
          callback: callbacks[i % 4],
        });
      }
    });

    bench("Configuration: 10 sequential full changes", () => {
      const levels = ALL_LEVELS;

      for (let i = 0; i < 10; i++) {
        logger.configure({
          level: levels[i % 4],
          callback: i % 2 === 0 ? simpleCallback : undefined,
          callbackIgnoresLevel: i % 2 === 0,
        });
      }
    });
  });
});

// Configuration with logging - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Configuration: configure + 10 logs", () => {
      logger.configure({ level: LEVEL_ALL });

      for (let i = 0; i < 10; i++) {
        logger.log(CONTEXT, `message ${i}`);
      }
    });

    bench("Configuration: reconfigure every 5 logs (100 total)", () => {
      const levels = ALL_LEVELS;

      for (let i = 0; i < 100; i++) {
        if (i % 5 === 0) {
          logger.configure({ level: levels[(i / 5) % 4] });
        }

        logger.log(CONTEXT, `message ${i}`);
      }
    });

    bench("Configuration: dynamic level based on condition", () => {
      for (let i = 0; i < 20; i++) {
        // Simulate changing log level based on error rate
        const errorRate = i / 20;

        if (errorRate > 0.5) {
          logger.configure({ level: "error-only" });
        } else if (errorRate > 0.2) {
          logger.configure({ level: LEVEL_WARN_ERROR });
        } else {
          logger.configure({ level: LEVEL_ALL });
        }

        logger.log(CONTEXT, `message ${i}`);
      }
    });
  });
});

// Configuration reset patterns - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Configuration: reset to defaults", () => {
      // Set complex config
      logger.configure({
        level: LEVEL_WARN_ERROR,
        callback: simpleCallback,
        callbackIgnoresLevel: true,
      });

      // Reset to defaults
      logger.configure({
        level: LEVEL_ALL,
        callback: undefined,
        callbackIgnoresLevel: false,
      });
    });

    bench("Configuration: toggle debug mode", () => {
      // Production mode
      logger.configure({ level: "error-only" });
      logger.log(CONTEXT, MESSAGE);

      // Debug mode
      logger.configure({ level: LEVEL_ALL });
      logger.log(CONTEXT, MESSAGE);

      // Back to production
      logger.configure({ level: "error-only" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench("Configuration: enable/disable monitoring", () => {
      let count = 0;

      // Enable monitoring
      logger.configure({
        level: LEVEL_ALL,
        callback: () => {
          count++;
        },
        callbackIgnoresLevel: true,
      });
      logger.log(CONTEXT, MESSAGE);

      // Disable monitoring
      logger.configure({
        callback: undefined,
      });
      logger.log(CONTEXT, MESSAGE);

      do_not_optimize(count);
    });
  });
});
