/**
 * isPrimitiveValue benchmarks
 *
 * Tests primitive value validation performance:
 * - Accepting primitive values
 * - Rejecting non-primitive values
 * - Edge cases
 */

import { bench, boxplot, summary } from "mitata";

import { isPrimitiveValue } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isPrimitiveValue: string", () => {
      isPrimitiveValue("test");
    });

    bench("isPrimitiveValue: number", () => {
      isPrimitiveValue(42);
    });

    bench("isPrimitiveValue: boolean true", () => {
      isPrimitiveValue(true);
    });

    bench("isPrimitiveValue: boolean false", () => {
      isPrimitiveValue(false);
    });

    bench("isPrimitiveValue: null", () => {
      isPrimitiveValue(null);
    });

    bench("isPrimitiveValue: undefined", () => {
      isPrimitiveValue(undefined);
    });

    bench("isPrimitiveValue: zero", () => {
      isPrimitiveValue(0);
    });

    bench("isPrimitiveValue: negative number", () => {
      isPrimitiveValue(-42);
    });

    bench("isPrimitiveValue: empty string", () => {
      isPrimitiveValue("");
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isPrimitiveValue: reject NaN", () => {
      isPrimitiveValue(Number.NaN);
    });

    bench("isPrimitiveValue: reject Infinity", () => {
      isPrimitiveValue(Infinity);
    });

    bench("isPrimitiveValue: reject -Infinity", () => {
      isPrimitiveValue(-Infinity);
    });

    bench("isPrimitiveValue: reject object", () => {
      isPrimitiveValue({});
    });

    bench("isPrimitiveValue: reject array", () => {
      isPrimitiveValue([]);
    });

    bench("isPrimitiveValue: reject function", () => {
      isPrimitiveValue(() => {});
    });

    bench("isPrimitiveValue: reject Date", () => {
      isPrimitiveValue(new Date());
    });

    bench("isPrimitiveValue: reject RegExp", () => {
      isPrimitiveValue(/test/);
    });

    bench("isPrimitiveValue: reject Symbol", () => {
      isPrimitiveValue(Symbol("test"));
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isPrimitiveValue: large number", () => {
      isPrimitiveValue(Number.MAX_SAFE_INTEGER);
    });

    bench("isPrimitiveValue: small number", () => {
      isPrimitiveValue(Number.MIN_SAFE_INTEGER);
    });

    bench("isPrimitiveValue: long string", () => {
      isPrimitiveValue("a".repeat(1000));
    });
  });
});
