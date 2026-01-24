/**
 * Logger arguments handling benchmarks
 *
 * Tests arguments performance:
 * - No arguments
 * - Few arguments (1-3)
 * - Many arguments (10, 50, 100)
 * - Different argument types
 * - Large objects as arguments
 */

import { bench, boxplot, summary } from "mitata";

import { logger } from "@real-router/logger";

// Suppress console output for benchmarks
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const CONTEXT = "bench";
const MESSAGE = "test message";

// Basic argument counts - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Arguments: no arguments", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE);
    });

    bench("Arguments: 1 argument", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, "arg1");
    });

    bench("Arguments: 3 arguments", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, "arg1", "arg2", "arg3");
    });

    bench("Arguments: 10 arguments", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, ...Array.from({ length: 10 }).fill("arg"));
    });

    bench("Arguments: 50 arguments", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, ...Array.from({ length: 50 }).fill("arg"));
    });

    bench("Arguments: 100 arguments", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, ...Array.from({ length: 100 }).fill("arg"));
    });
  });
});

// Argument types - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Arguments: strings", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, "str1", "str2", "str3");
    });

    bench("Arguments: numbers", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, 1, 2, 3, 4, 5);
    });

    bench("Arguments: booleans", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, true, false, true);
    });

    bench("Arguments: null and undefined", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, null, undefined, null);
    });

    bench("Arguments: mixed primitives", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, "str", 42, true, null, undefined);
    });
  });
});

// Object arguments - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Arguments: small object", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, { id: 1, name: "test" });
    });

    bench("Arguments: medium object (10 fields)", () => {
      const obj = Object.fromEntries(
        Array.from({ length: 10 }).map((_, i) => [`field${i}`, i]),
      );

      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, obj);
    });

    bench("Arguments: large object (100 fields)", () => {
      const obj = Object.fromEntries(
        Array.from({ length: 100 }).map((_, i) => [`field${i}`, i]),
      );

      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, obj);
    });

    bench("Arguments: nested object (5 levels)", () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: { value: 42 },
              },
            },
          },
        },
      };

      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, obj);
    });

    bench("Arguments: array (100 items)", () => {
      logger.configure({ level: "all" });
      logger.log(CONTEXT, MESSAGE, Array.from({ length: 100 }).fill(42));
    });
  });
});

// Arguments with callbacks - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Arguments: callback processing 3 args", () => {
      logger.configure({
        level: "all",
        callback: (_level, _context, _message, ...args) => {
          return args.length;
        },
      });
      logger.log(CONTEXT, MESSAGE, "arg1", "arg2", "arg3");
    });

    bench("Arguments: callback processing 10 args", () => {
      logger.configure({
        level: "all",
        callback: (_level, _context, _message, ...args) => {
          return args.reduce((sum: number, arg) => sum + String(arg).length, 0);
        },
      });
      logger.log(
        CONTEXT,
        MESSAGE,
        ...Array.from({ length: 10 }).fill("argument"),
      );
    });

    bench("Arguments: callback serializing objects", () => {
      logger.configure({
        level: "all",
        callback: (_level, _context, _message, ...args) => {
          return args.map((arg) => JSON.stringify(arg)).join(",");
        },
      });
      logger.log(CONTEXT, MESSAGE, { id: 1 }, { id: 2 }, { id: 3 });
    });
  });
});

// Real-world argument patterns - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("Arguments: error with stack trace", () => {
      const error = new Error("Test error");

      error.stack = "Error: Test error\n    at test.js:10:5";

      logger.configure({ level: "all" });
      logger.error(CONTEXT, MESSAGE, error);
    });

    bench("Arguments: route state object", () => {
      const state = {
        name: "users.profile",
        params: { id: "123" },
        path: "/users/123",
        meta: {
          params: {},
          options: {},
        },
      };

      logger.configure({ level: "all" });
      logger.log(CONTEXT, "Navigation state", state);
    });

    bench("Arguments: performance metrics", () => {
      const metrics = {
        navigationTime: 145,
        guardsTime: 23,
        middlewareTime: 67,
        renderTime: 89,
        totalTime: 324,
      };

      logger.configure({ level: "all" });
      logger.log(CONTEXT, "Performance metrics", metrics);
    });
  });
});
