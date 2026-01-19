/**
 * isParams benchmarks
 *
 * Tests params validation performance:
 * - Accepting valid params
 * - Rejecting invalid params
 * - Edge cases with nesting and arrays
 */

import { bench, boxplot, summary } from "mitata";

import { isParams } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isParams: empty object", () => {
      isParams({});
    });

    bench("isParams: simple primitives", () => {
      isParams({ id: "123", page: 1, active: true });
    });

    bench("isParams: with arrays", () => {
      isParams({ ids: [1, 2, 3], tags: ["a", "b"] });
    });

    bench("isParams: with null/undefined", () => {
      isParams({ id: "123", optional: null, missing: undefined });
    });

    bench("isParams: nested objects", () => {
      isParams({ filter: { status: "active", role: "admin" } });
    });

    bench("isParams: mixed arrays and objects", () => {
      isParams({
        items: [{ id: 1 }, { id: 2 }],
        config: { enabled: true },
      });
    });

    bench("isParams: deeply nested", () => {
      isParams({
        level1: {
          level2: {
            level3: { value: 42 },
          },
        },
      });
    });

    bench("isParams: large object", () => {
      const params: Record<string, unknown> = {};

      for (let i = 0; i < 100; i++) {
        params[`key${i}`] = i;
      }

      isParams(params);
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isParams: reject null", () => {
      isParams(null);
    });

    bench("isParams: reject undefined", () => {
      isParams(undefined);
    });

    bench("isParams: reject array", () => {
      isParams([1, 2, 3]);
    });

    bench("isParams: reject with function", () => {
      isParams({ callback: () => {} });
    });

    bench("isParams: reject with Symbol", () => {
      isParams({ sym: Symbol("test") });
    });

    bench("isParams: reject with Date", () => {
      isParams({ created: new Date() });
    });

    bench("isParams: reject with NaN", () => {
      isParams({ value: Number.NaN });
    });

    bench("isParams: reject with Infinity", () => {
      isParams({ max: Infinity });
    });

    bench("isParams: reject array with invalid items", () => {
      isParams({ items: [() => {}, {}] });
    });

    bench("isParams: reject nested with function", () => {
      isParams({ config: { handler: () => {} } });
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isParams: empty arrays", () => {
      isParams({ empty: [] });
    });

    bench("isParams: arrays with primitives", () => {
      isParams({ mixed: [1, "two", true, null] });
    });

    bench("isParams: very deep nesting", () => {
      const deep: any = { value: 1 };
      let current = deep;

      for (let i = 0; i < 10; i++) {
        current.nested = { value: i };
        current = current.nested;
      }

      isParams(deep);
    });
  });
});
