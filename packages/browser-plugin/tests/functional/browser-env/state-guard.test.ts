import { describe, it, expect } from "vitest";

import { isStateStrict } from "../../../src/browser-env/state-guard";

const noop = () => undefined;

/**
 * Coverage owner for the shared/browser-env `state-guard.ts` twin (M1 dissolution
 * of `type-guards`). Only `isStateStrict` is public here — its transitive closure
 * (`isRequiredFields`, `isRouteName`, `isParams` + serialization machinery) is
 * module-private, so every branch is exercised THROUGH `isStateStrict`. The
 * behaviour is a byte-identical twin of validation-plugin's copy; the same cases
 * that cover the guards directly there cover them via the state guard here.
 */

/**
 * Runs `fn` with Object.prototype polluted by a single enumerable probe key, then
 * removes it — the only way to make the fast-path `for...in` surface an inherited
 * enumerable key, exercising the own-key (`Object.hasOwn`) skip in `isParams`.
 */
function withProtoPollution(value: unknown, fn: () => void): void {
  Object.defineProperty(Object.prototype, "__rrPollutionProbe__", {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  try {
    fn();
  } finally {
    delete (Object.prototype as Record<string, unknown>).__rrPollutionProbe__;
  }
}

describe("isStateStrict (shared/browser-env twin)", () => {
  describe("basic structure", () => {
    it("validates valid state with type checking", () => {
      expect(isStateStrict({ name: "home", params: {}, path: "/home" })).toBe(
        true,
      );
    });

    it("validates state with array params", () => {
      expect(
        isStateStrict({
          name: "search",
          params: { tags: ["js", "ts", "react"], ids: [1, 2, 3] },
          path: "/search",
        }),
      ).toBe(true);
    });

    it("rejects object with wrong name type", () => {
      expect(isStateStrict({ name: 123, params: {}, path: "/home" })).toBe(
        false,
      );
    });

    it("rejects object with wrong path type", () => {
      expect(isStateStrict({ name: "home", params: {}, path: 123 })).toBe(
        false,
      );
    });

    it("accepts object with valid params (nested objects)", () => {
      expect(
        isStateStrict({
          name: "home",
          params: { nested: { valid: true } },
          path: "/home",
        }),
      ).toBe(true);
    });

    it("rejects object with invalid params (function)", () => {
      expect(
        isStateStrict({ name: "home", params: { fn: noop }, path: "/home" }),
      ).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isStateStrict(null)).toBe(false);
      expect(isStateStrict(undefined)).toBe(false);
    });

    it("rejects non-object values", () => {
      expect(isStateStrict("string")).toBe(false);
      expect(isStateStrict(123)).toBe(false);
      expect(isStateStrict(true)).toBe(false);
      expect(isStateStrict([])).toBe(false);
    });

    it("accepts state with arbitrary extra properties", () => {
      expect(
        isStateStrict({
          name: "home",
          params: {},
          path: "/",
          foo: "bar",
          baz: 42,
        }),
      ).toBe(true);
    });
  });

  describe("route-name validation (via isRequiredFields → isRouteName)", () => {
    it("accepts empty name (root node)", () => {
      expect(isStateStrict({ name: "", params: {}, path: "/" })).toBe(true);
    });

    it("accepts system routes (@@-prefixed)", () => {
      expect(
        isStateStrict({ name: "@@router/UNKNOWN", params: {}, path: "/" }),
      ).toBe(true);
    });

    it("accepts hierarchical / hyphenated / underscored names", () => {
      expect(
        isStateStrict({ name: "admin.users.list", params: {}, path: "/" }),
      ).toBe(true);
      expect(isStateStrict({ name: "api-v2", params: {}, path: "/" })).toBe(
        true,
      );
      expect(
        isStateStrict({ name: "admin_panel", params: {}, path: "/" }),
      ).toBe(true);
    });

    it("rejects invalid-pattern names", () => {
      expect(
        isStateStrict({ name: "users..profile", params: {}, path: "/" }),
      ).toBe(false);
      expect(isStateStrict({ name: ".users", params: {}, path: "/" })).toBe(
        false,
      );
      expect(isStateStrict({ name: "users.", params: {}, path: "/" })).toBe(
        false,
      );
      expect(
        isStateStrict({ name: "users profile", params: {}, path: "/" }),
      ).toBe(false);
      expect(
        isStateStrict({ name: " ".repeat(3), params: {}, path: "/" }),
      ).toBe(false);
    });

    it("rejects a name exceeding MAX_ROUTE_NAME_LENGTH", () => {
      expect(
        isStateStrict({ name: "a".repeat(10_001), params: {}, path: "/" }),
      ).toBe(false);
    });

    it("accepts a name exactly at MAX_ROUTE_NAME_LENGTH", () => {
      expect(
        isStateStrict({ name: "a".repeat(10_000), params: {}, path: "/" }),
      ).toBe(true);
    });
  });

  describe("params structural validation (via isRequiredFields → isParams)", () => {
    const validState = (params: unknown) => ({
      name: "home",
      path: "/",
      params,
    });

    it("rejects primitive (non-object) params", () => {
      expect(isStateStrict(validState("nope"))).toBe(false);
      expect(isStateStrict(validState(123))).toBe(false);
      expect(isStateStrict(validState(null))).toBe(false);
    });

    it("rejects top-level array params", () => {
      expect(isStateStrict(validState([]))).toBe(false);
      expect(isStateStrict(validState([1, 2, 3]))).toBe(false);
    });

    it("rejects class-instance params (custom prototype) at top level", () => {
      expect(isStateStrict(validState(new Date()))).toBe(false);
      expect(isStateStrict(validState(new Map()))).toBe(false);
      expect(isStateStrict(validState(/re/))).toBe(false);
    });

    it("accepts null-prototype params object", () => {
      const p = Object.create(null) as Record<string, unknown>;

      p.id = "1";

      expect(isStateStrict(validState(p))).toBe(true);
    });

    it("accepts null / undefined param values", () => {
      expect(isStateStrict(validState({ a: null, b: undefined }))).toBe(true);
    });

    it("rejects nested class instances (slow path)", () => {
      expect(isStateStrict(validState({ a: { b: new Date() } }))).toBe(false);
      expect(isStateStrict(validState({ items: [new Map()] }))).toBe(false);
    });

    it("rejects params with NaN / Infinity (flat and nested)", () => {
      expect(isStateStrict(validState({ v: Number.NaN }))).toBe(false);
      expect(isStateStrict(validState({ v: Infinity }))).toBe(false);
      expect(isStateStrict(validState({ nums: [1, Number.NaN, 3] }))).toBe(
        false,
      );
    });

    it("rejects params with symbol values (early fast-path reject)", () => {
      expect(isStateStrict(validState({ s: Symbol("x") }))).toBe(false);
    });

    it("accepts arrays of plain objects (slow path, done-set)", () => {
      expect(isStateStrict(validState({ items: [{ id: 1 }, { id: 2 }] }))).toBe(
        true,
      );
    });

    it("accepts nested null / undefined leaves (slow path)", () => {
      expect(
        isStateStrict(
          validState({ scores: [100, null, 85], meta: { x: undefined } }),
        ),
      ).toBe(true);
    });

    it("rejects nested function / symbol leaves (slow path)", () => {
      expect(isStateStrict(validState({ callbacks: [noop] }))).toBe(false);
      expect(isStateStrict(validState({ data: { deep: noop } }))).toBe(false);
      expect(isStateStrict(validState({ items: [Symbol("x")] }))).toBe(false);
    });

    it("accepts a shared reference / diamond (not a cycle)", () => {
      const shared = { k: "v" };

      expect(isStateStrict(validState({ a: shared, b: shared }))).toBe(true);
    });

    it("rejects a circular reference", () => {
      const cyclic: Record<string, unknown> = { a: 1 };

      cyclic.self = cyclic;

      expect(isStateStrict(validState(cyclic))).toBe(false);
    });

    it("rejects params whose value getter throws (never-throw boundary)", () => {
      const throwing = Object.defineProperty({}, "x", {
        get() {
          throw new Error("boom");
        },
        enumerable: true,
        configurable: true,
      });

      expect(isStateStrict(validState(throwing))).toBe(false);
    });

    it("skips inherited enumerable keys via Object.hasOwn (proto pollution)", () => {
      withProtoPollution("polluted", () => {
        expect(isStateStrict(validState({ real: "value" }))).toBe(true);
      });
    });
  });
});
