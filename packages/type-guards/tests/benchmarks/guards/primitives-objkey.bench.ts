/**
 * isObjKey benchmarks
 *
 * Tests object key validation performance:
 * - Accepting existing keys in objects
 * - Rejecting non-existing or invalid keys
 * - Edge cases with arrays and inherited properties
 */

import { bench, boxplot, summary } from "mitata";

import { isObjKey } from "type-guards";

const testObject = {
  name: "test",
  age: 25,
  active: true,
  nested: { value: 42 },
};

const arrayObject = ["a", "b", "c"];

const objectWithProto = Object.create({ inherited: true });

objectWithProto.own = true;

// Successful cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isObjKey: string key", () => {
      isObjKey("name", testObject);
    });

    bench("isObjKey: number-like key", () => {
      isObjKey("age", testObject);
    });

    bench("isObjKey: boolean-like key", () => {
      isObjKey("active", testObject);
    });

    bench("isObjKey: nested object key", () => {
      isObjKey("nested", testObject);
    });
  });
});

// Rejection cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isObjKey: reject missing string key", () => {
      isObjKey("missing", testObject);
    });

    bench("isObjKey: reject empty string key", () => {
      isObjKey("", testObject);
    });

    bench("isObjKey: reject number as key", () => {
      isObjKey(123 as any, testObject);
    });

    bench("isObjKey: reject symbol as key", () => {
      isObjKey(Symbol("test") as any, testObject);
    });

    bench("isObjKey: reject undefined as key", () => {
      isObjKey(undefined as any, testObject);
    });

    bench("isObjKey: reject null object", () => {
      isObjKey("key", null as any);
    });
  });
});

// Edge cases - boxplot shows distribution
boxplot(() => {
  summary(() => {
    bench("isObjKey: array with numeric index", () => {
      isObjKey("0", arrayObject);
    });

    bench("isObjKey: array with length property", () => {
      isObjKey("length", arrayObject);
    });

    bench("isObjKey: own property", () => {
      isObjKey("own", objectWithProto);
    });

    bench("isObjKey: inherited property", () => {
      isObjKey("inherited", objectWithProto);
    });
  });
});
