/**
 * isBoolean benchmarks
 *
 * Tests boolean validation performance:
 * - Accepting boolean values
 * - Rejecting non-boolean values
 * - Edge cases
 */

import { bench, boxplot, summary } from "mitata";

import { isBoolean } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isBoolean: true", () => {
      isBoolean(true);
    });

    bench("isBoolean: false", () => {
      isBoolean(false);
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isBoolean: reject number 0", () => {
      isBoolean(0);
    });

    bench("isBoolean: reject number 1", () => {
      isBoolean(1);
    });

    bench("isBoolean: reject string 'true'", () => {
      isBoolean("true");
    });

    bench("isBoolean: reject string 'false'", () => {
      isBoolean("false");
    });

    bench("isBoolean: reject null", () => {
      isBoolean(null);
    });

    bench("isBoolean: reject undefined", () => {
      isBoolean(undefined);
    });

    bench("isBoolean: reject object", () => {
      isBoolean({});
    });

    bench("isBoolean: reject array", () => {
      isBoolean([]);
    });

    bench("isBoolean: reject function", () => {
      isBoolean(() => {});
    });

    bench("isBoolean: reject Symbol", () => {
      isBoolean(Symbol("test"));
    });

    bench("isBoolean: reject BigInt", () => {
      isBoolean(42n);
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isBoolean: Boolean object (Boolean wrapper)", () => {
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      isBoolean(new Boolean(true));
    });

    bench("isBoolean: Boolean.prototype", () => {
      isBoolean(Boolean.prototype);
    });

    bench("isBoolean: NaN", () => {
      isBoolean(Number.NaN);
    });

    bench("isBoolean: empty string", () => {
      isBoolean("");
    });

    bench("isBoolean: non-empty string", () => {
      isBoolean("hello");
    });
  });
});
