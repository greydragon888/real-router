import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getTypeDescription } from "../../../src/type-guards";

describe("Type Description Utilities - Property-Based Tests", () => {
  describe("getTypeDescription", () => {
    it('returns "null" for null', () => {
      expect(getTypeDescription(null)).toBe("null");
    });

    it('returns "undefined" for undefined', () => {
      expect(getTypeDescription(undefined)).toBe("undefined");
    });

    test.prop([fc.array(fc.anything(), { maxLength: 50 })], {
      numRuns: 5000,
    })("returns array[N] with correct length for arrays", (arr) => {
      expect(getTypeDescription(arr)).toBe(`array[${arr.length}]`);
    });

    test.prop(
      [
        fc.oneof(
          fc.constant(0).map(() => new Date()),
          fc.constant(0).map(() => new Map()),
          fc.constant(0).map(() => new Set()),
          fc.constant(0).map(() => /regex/),
        ),
      ],
      { numRuns: 5000 },
    )("returns constructor name for class instances", (instance) => {
      expect(getTypeDescription(instance)).toBe(instance.constructor.name);
    });

    test.prop([fc.object()], { numRuns: 5000 })(
      'returns "object" for plain objects',
      (obj) => {
        expect(getTypeDescription(obj)).toBe("object");
      },
    );

    test.prop([fc.oneof(fc.string(), fc.double(), fc.boolean())], {
      numRuns: 5000,
    })("returns typeof for primitive types", (value) => {
      expect(getTypeDescription(value)).toBe(typeof value);
    });

    test.prop([fc.func(fc.anything())], { numRuns: 2000 })(
      'returns "function" for functions',
      (fn) => {
        expect(getTypeDescription(fn)).toBe("function");
      },
    );

    it('returns "symbol" for symbols', () => {
      expect(getTypeDescription(Symbol("test"))).toBe("symbol");
      expect(getTypeDescription(Symbol.iterator)).toBe("symbol");
    });

    it('returns "object" for null-prototype objects', () => {
      const obj = Object.create(null) as Record<string, unknown>;

      obj.key = "value";

      expect(getTypeDescription(obj)).toBe("object");
    });

    // #787: an adversarial own `constructor` must never crash the diagnostic
    // helper. Beyond "does not crash", the exact contract is: a function
    // constructor whose `name` is a non-empty string other than `"Object"`
    // yields that name, and anything else (a non-function constructor, an
    // anonymous function, one named `"Object"`, or one whose `name` is not a
    // string) yields `"object"`. `fc.object()` never emits a `constructor` key
    // and `fc.anything()` never emits a function or a Symbol, so the generator
    // below mixes function and non-function constructor values, and names of
    // every type.
    const withName = (name: unknown): (() => void) =>
      Object.defineProperty((): void => undefined, "name", { value: name });
    const constructorValueArbitrary = fc.oneof(
      fc.anything(), // non-function values (null, string, object, …)
      fc.string().map((name) => ({ name })), // a non-function with a string `name`
      fc.func(fc.anything()), // functions with engine-assigned names
      fc
        .oneof(
          fc.anything({ withNullPrototype: true }),
          fc.string().map(Symbol),
        )
        .map(withName), // a `name` of any type (#2823)
      fc.constantFrom(
        withName("Widget"), // named function → returns the name
        withName(""), // empty name → "object"
        withName("Object"), // name exactly "Object" → "object"
      ),
    );

    test.prop([constructorValueArbitrary], { numRuns: 10_000 })(
      "returns the constructor function's name, else 'object', for any own constructor (never throws)",
      (ctorValue) => {
        const result = getTypeDescription({ constructor: ctorValue, bad: 1 });
        const name: unknown =
          typeof ctorValue === "function" ? ctorValue.name : undefined;

        expect(result).toBe(
          typeof name === "string" && name !== "" && name !== "Object"
            ? name
            : "object",
        );
      },
    );

    // #2823: describing an object reads it, and a proxy answers those reads
    // with application code. `fc.anything()` emits no proxy, so the generator
    // emits a builder and the run builds the proxy — fast-check reads every
    // value it generates, and a revoked proxy refuses that read. The builders:
    // an array proxy answering `length` with a value of any type, one that
    // throws on every read, and a revoked one.
    const proxyBuilderArbitrary = fc.oneof(
      fc
        .oneof(
          fc.anything({ withNullPrototype: true }),
          fc.string().map(Symbol),
        )
        .map(
          (length) => (): object =>
            new Proxy([], {
              get: (_target, key) => (key === "length" ? length : undefined),
            }),
        ),
      fc.constant(
        (): object =>
          new Proxy([], {
            get() {
              throw new Error("BOOM");
            },
          }),
      ),
      fc.constant((): object => {
        const { proxy, revoke } = Proxy.revocable({}, {});

        revoke();

        return proxy;
      }),
    );

    test.prop([proxyBuilderArbitrary], { numRuns: 2000 })(
      "answers a string for a proxy, whatever its reads answer (never throws)",
      (build) => {
        expect(typeof getTypeDescription(build())).toBe("string");
      },
    );
  });
});
