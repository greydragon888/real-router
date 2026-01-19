/**
 * isPromise benchmarks
 *
 * Tests promise validation performance:
 * - Accepting promise-like values (Promise, thenable)
 * - Rejecting non-promise values
 * - Edge cases with async functions and thenable objects
 */

/* eslint-disable unicorn/no-thenable */
import { bench, boxplot, summary } from "mitata";

import { isPromise } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isPromise: Promise.resolve", () => {
      isPromise(Promise.resolve(42));
    });

    bench("isPromise: Promise.reject (caught)", () => {
      isPromise(Promise.reject(new Error("test")).catch(() => {}));
    });

    bench("isPromise: new Promise", () => {
      isPromise(new Promise(() => {}));
    });

    bench("isPromise: thenable object", () => {
      isPromise({ then: () => {} });
    });

    bench("isPromise: async function result", () => {
      isPromise((async () => {})());
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isPromise: reject null", () => {
      isPromise(null);
    });

    bench("isPromise: reject undefined", () => {
      isPromise(undefined);
    });

    bench("isPromise: reject number", () => {
      isPromise(42);
    });

    bench("isPromise: reject string", () => {
      isPromise("promise");
    });

    bench("isPromise: reject object without then", () => {
      isPromise({});
    });

    bench("isPromise: reject object with non-function then", () => {
      isPromise({ then: 42 });
    });

    bench("isPromise: reject function", () => {
      isPromise(() => {});
    });

    bench("isPromise: reject array", () => {
      isPromise([]);
    });
  });
});
