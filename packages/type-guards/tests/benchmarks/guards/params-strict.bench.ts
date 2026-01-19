/**
 * isParamsStrict benchmarks
 *
 * Tests strict params validation performance:
 * - Accepting valid strict params (primitives and arrays only)
 * - Rejecting nested objects and non-primitive values
 * - Edge cases with arrays and inherited properties
 */

import { bench, boxplot, summary } from "mitata";

import { isParamsStrict } from "type-guards";

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isParamsStrict: empty object", () => {
      isParamsStrict({});
    });

    bench("isParamsStrict: primitives only", () => {
      isParamsStrict({ id: "123", page: 1, active: true });
    });

    bench("isParamsStrict: with null/undefined", () => {
      isParamsStrict({ id: "123", optional: null, missing: undefined });
    });

    bench("isParamsStrict: arrays of primitives", () => {
      isParamsStrict({ ids: [1, 2, 3], tags: ["a", "b", "c"] });
    });

    bench("isParamsStrict: mixed primitive arrays", () => {
      isParamsStrict({ mixed: [1, "two", true, null] });
    });

    bench("isParamsStrict: large flat object", () => {
      const params: Record<string, unknown> = {};

      for (let i = 0; i < 100; i++) {
        params[`key${i}`] = i % 2 === 0 ? i : `value${i}`;
      }

      isParamsStrict(params);
    });

    bench("isParamsStrict: boolean flags", () => {
      isParamsStrict({
        enabled: true,
        visible: false,
        active: true,
        disabled: false,
      });
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isParamsStrict: reject null", () => {
      isParamsStrict(null);
    });

    bench("isParamsStrict: reject undefined", () => {
      isParamsStrict(undefined);
    });

    bench("isParamsStrict: reject array", () => {
      isParamsStrict([1, 2, 3]);
    });

    bench("isParamsStrict: reject nested objects", () => {
      isParamsStrict({ filter: { status: "active" } });
    });

    bench("isParamsStrict: reject with function", () => {
      isParamsStrict({ callback: () => {} });
    });

    bench("isParamsStrict: reject with Symbol", () => {
      isParamsStrict({ sym: Symbol("test") });
    });

    bench("isParamsStrict: reject with Date", () => {
      isParamsStrict({ created: new Date() });
    });

    bench("isParamsStrict: reject with NaN", () => {
      isParamsStrict({ value: Number.NaN });
    });

    bench("isParamsStrict: reject with Infinity", () => {
      isParamsStrict({ max: Infinity });
    });

    bench("isParamsStrict: reject array with objects", () => {
      isParamsStrict({ items: [{ id: 1 }, { id: 2 }] });
    });

    bench("isParamsStrict: reject array with nested arrays", () => {
      isParamsStrict({
        matrix: [
          [1, 2],
          [3, 4],
        ],
      });
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isParamsStrict: empty arrays", () => {
      isParamsStrict({ empty: [] });
    });

    bench("isParamsStrict: single value arrays", () => {
      isParamsStrict({ single: [42] });
    });

    bench("isParamsStrict: long arrays", () => {
      isParamsStrict({ long: Array.from({ length: 1000 }, (_, i) => i) });
    });

    bench("isParamsStrict: inherited properties", () => {
      const obj = Object.create({ inherited: "value" });

      obj.own = "value";
      isParamsStrict(obj);
    });
  });
});
