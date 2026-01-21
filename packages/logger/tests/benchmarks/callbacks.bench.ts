/**
 * Logger callback benchmarks
 *
 * Tests callback performance:
 * - No callback (baseline)
 * - Simple callback
 * - Callback with callbackIgnoresLevel option
 * - Callback exceptions
 * - Heavy operations in callbacks
 */

import { bench, boxplot, summary } from "mitata";

import { logger } from "logger";

// Suppress console output for benchmarks
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const CONTEXT = "bench";
const MESSAGE = "test message";

// Helper callbacks
const simpleCallback = (level: string, context: string, message: string) => {
  return `${level}:${context}:${message}`;
};

const argsCallback = (
  _level: string,
  _context: string,
  _message: string,
  ...args: unknown[]
) => {
  return args.length;
};

// Basic callback performance - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Callback: no callback (baseline)", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench("Callback: simple callback", () => {
      logger.configure({
        level: "all",
        callback: simpleCallback,
      });
      logger.log(CONTEXT, MESSAGE);
    });

    bench("Callback: with args processing", () => {
      logger.configure({
        level: "all",
        callback: argsCallback,
      });
      logger.log(CONTEXT, MESSAGE, "arg1", "arg2", "arg3");
    });
  });
});

// Callback filtering - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Callback: callbackIgnoresLevel false (filtered)", () => {
      logger.configure({
        level: "error-only",
        callback: simpleCallback,
        callbackIgnoresLevel: false,
      });
      logger.log(CONTEXT, MESSAGE);
    });

    bench("Callback: callbackIgnoresLevel true (always called)", () => {
      logger.configure({
        level: "error-only",
        callback: simpleCallback,
        callbackIgnoresLevel: true,
      });
      logger.log(CONTEXT, MESSAGE);
    });
  });
});

// Callback exceptions - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Callback: throwing exception", () => {
      logger.configure({
        level: "all",
        callback: () => {
          throw new Error("Test error");
        },
      });
      logger.log(CONTEXT, MESSAGE);
    });

    bench("Callback: promise-returning operation", () => {
      logger.configure({
        level: "all",
        callback: () => {
          // Simulates promise-returning operation (not awaited by logger)
          void Promise.resolve();
        },
      });
      logger.log(CONTEXT, MESSAGE);
    });
  });
});

// Heavy callback operations - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Callback: JSON.stringify small object", () => {
      const smallObject = { id: 1, name: "test", value: 42 };

      logger.configure({
        level: "all",
        callback: (level, context, message) => {
          JSON.stringify({ level, context, message, args: [smallObject] });
        },
      });
      logger.log(CONTEXT, MESSAGE, smallObject);
    });

    bench("Callback: JSON.stringify large object", () => {
      const largeObject = {
        data: Array.from({ length: 100 }).fill({
          id: 1,
          name: "test",
          nested: { value: 42 },
        }),
      };

      logger.configure({
        level: "all",
        callback: (level, context, message) => {
          JSON.stringify({ level, context, message, args: [largeObject] });
        },
      });
      logger.log(CONTEXT, MESSAGE, largeObject);
    });

    bench("Callback: string concatenation (100 items)", () => {
      logger.configure({
        level: "all",
        callback: (level, context, message, ...args) => {
          let result = `${level}:${context}:${message}`;

          for (const arg of args) {
            result += `:${String(arg)}`;
          }

          return result;
        },
      });
      logger.log(CONTEXT, MESSAGE, ...Array.from({ length: 100 }).fill("arg"));
    });
  });
});

// Real-world callback scenarios - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Callback: error counter", () => {
      let errorCount = 0;

      logger.configure({
        level: "all",
        callback: (level) => {
          if (level === "error") {
            errorCount++;
          }
        },
      });

      for (let i = 0; i < 10; i++) {
        logger.log(CONTEXT, `message ${i}`);
        if (i % 3 === 0) {
          logger.error(CONTEXT, `error ${i}`);
        }
      }

      errorCount;
    });

    bench("Callback: monitoring with filtering", () => {
      const metrics = { log: 0, warn: 0, error: 0 };

      logger.configure({
        level: "error-only",
        callback: (level) => {
          switch (level) {
            case "log": {
              metrics.log++;

              break;
            }
            case "warn": {
              metrics.warn++;

              break;
            }
            case "error": {
              metrics.error++;

              break;
            }
            // No default
          }
        },
        callbackIgnoresLevel: true,
      });

      for (let i = 0; i < 10; i++) {
        logger.log(CONTEXT, `log ${i}`);
        logger.warn(CONTEXT, `warn ${i}`);
        logger.error(CONTEXT, `error ${i}`);
      }

      metrics;
    });
  });
});
