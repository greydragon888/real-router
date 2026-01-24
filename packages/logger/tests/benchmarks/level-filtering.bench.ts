/**
 * Logger level filtering benchmarks
 *
 * Tests level filtering performance:
 * - Different log levels (all, warn-error, error-only, none)
 * - Filtered vs passed logs
 * - Multiple severity levels (log, warn, error)
 */

import { bench, boxplot, summary } from "mitata";

import { logger } from "@real-router/logger";

// Suppress console output for benchmarks
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const CONTEXT = "bench";
const MESSAGE = "test message";

// Basic level filtering - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench('Level filtering: level "none" (all filtered)', () => {
      logger.configure({ level: "none" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench('Level filtering: level "all" (all passed)', () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench('Level filtering: level "warn-error" (log filtered)', () => {
      logger.configure({ level: "warn-error" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench('Level filtering: level "warn-error" (warn passed)', () => {
      logger.configure({ level: "warn-error" });
      logger.warn(CONTEXT, MESSAGE);
    });

    bench('Level filtering: level "error-only" (log filtered)', () => {
      logger.configure({ level: "error-only" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench('Level filtering: level "error-only" (warn filtered)', () => {
      logger.configure({ level: "error-only" });
      logger.warn(CONTEXT, MESSAGE);
    });

    bench('Level filtering: level "error-only" (error passed)', () => {
      logger.configure({ level: "error-only" });
      logger.error(CONTEXT, MESSAGE);
    });
  });
});

// Mixed logging patterns - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Level filtering: 100 mixed calls (all passed)", () => {
      logger.configure({ level: "all" });

      for (let i = 0; i < 100; i++) {
        const type = i % 3;

        if (type === 0) {
          logger.log(CONTEXT, `message ${i}`);
        } else if (type === 1) {
          logger.warn(CONTEXT, `message ${i}`);
        } else {
          logger.error(CONTEXT, `message ${i}`);
        }
      }
    });

    bench("Level filtering: 100 mixed calls (most filtered)", () => {
      logger.configure({ level: "error-only" });

      for (let i = 0; i < 100; i++) {
        const type = i % 3;

        if (type === 0) {
          logger.log(CONTEXT, `message ${i}`);
        } else if (type === 1) {
          logger.warn(CONTEXT, `message ${i}`);
        } else {
          logger.error(CONTEXT, `message ${i}`);
        }
      }
    });

    bench("Level filtering: 100 mixed calls (all filtered)", () => {
      logger.configure({ level: "none" });

      for (let i = 0; i < 100; i++) {
        const type = i % 3;

        if (type === 0) {
          logger.log(CONTEXT, `message ${i}`);
        } else if (type === 1) {
          logger.warn(CONTEXT, `message ${i}`);
        } else {
          logger.error(CONTEXT, `message ${i}`);
        }
      }
    });
  });
});
