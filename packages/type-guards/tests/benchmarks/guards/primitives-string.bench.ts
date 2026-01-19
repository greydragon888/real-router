/**
 * isString benchmarks
 *
 * Tests string validation performance:
 * - Accepting string values
 * - Rejecting non-string values
 */

import { bench, boxplot, summary } from "mitata";

import { isString } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isString: empty string", () => {
      isString("");
    });

    bench("isString: short string", () => {
      isString("test");
    });

    bench("isString: long string", () => {
      isString("a".repeat(1000));
    });

    bench("isString: unicode string", () => {
      isString("Hello 🌍");
    });

    bench("isString: string with special chars", () => {
      isString("test@example.com");
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isString: reject number", () => {
      isString(123);
    });

    bench("isString: reject boolean", () => {
      isString(true);
    });

    bench("isString: reject null", () => {
      isString(null);
    });

    bench("isString: reject undefined", () => {
      isString(undefined);
    });

    bench("isString: reject object", () => {
      isString({});
    });

    bench("isString: reject array", () => {
      isString([]);
    });

    bench("isString: reject function", () => {
      isString(() => {});
    });

    bench("isString: reject symbol", () => {
      isString(Symbol("test"));
    });
  });
});
