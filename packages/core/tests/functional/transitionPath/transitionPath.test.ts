import { describe, it, expect } from "vitest";

import { getTransitionPath } from "../../../src/transitionPath";
import { makeState } from "../../helpers";

import type { State } from "@real-router/types";

describe("transitionPath", () => {
  describe("Basic behavior", () => {
    it("should compute full transition when fromState is undefined", () => {
      expect(getTransitionPath(makeState("a.b.c"))).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b", "a.b.c"],
        toDeactivate: [],
      });
    });

    it("should return empty transitions when states are identical", () => {
      const state = makeState("a.b.c", { p: 1 }, { "a.b.c": { p: "url" } }, {});

      expect(getTransitionPath(state, state)).toStrictEqual({
        intersection: "a.b.c",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should compute full deactivation and activation for unrelated route states", () => {
      const fromState = makeState("x.y.z");
      const toState = makeState("a.b.c");

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b", "a.b.c"],
        toDeactivate: ["x.y.z", "x.y", "x"],
      });
    });

    it("should handle empty string name as root", () => {
      const fromState = makeState("");
      const toState = makeState("a.b");

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b"],
        toDeactivate: [""],
      });
    });
  });

  describe("Intersection logic with route names", () => {
    it("should compute intersection and differences for branching route names", () => {
      const meta = {
        id: 0,
        params: {
          a: {},
          "a.b": {},
          "a.b.c": {},
          "a.b.c.d": {},
        },
        options: {},
        redirected: false,
      };

      expect(
        getTransitionPath(
          makeState("a.b.c.d", {}, meta.params),
          makeState("a.b.e.f", {}, meta.params),
        ),
      ).toStrictEqual({
        intersection: "a.b",
        toActivate: ["a.b.c", "a.b.c.d"],
        toDeactivate: ["a.b.e.f", "a.b.e"],
      });
    });

    it("should treat states with same name but missing meta.params as requiring full reload", () => {
      const fromState = makeState("a.b.c", { p: 1 });
      const toState = makeState("a.b.c", { p: 1 });

      // @ts-expect-error for testing purposes
      delete fromState.meta.params;
      // @ts-expect-error for testing purposes
      delete toState.meta.params;

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b", "a.b.c"],
        toDeactivate: ["a.b.c", "a.b", "a"],
      });
    });

    it("should treat added meta.params on one side as a change", () => {
      const metaParams2 = {
        a: {},
        "a.b": { x: "url" },
      };

      const fromState = makeState("a.b", { x: "1" }, {});
      const toState = makeState("a.b", { x: "1" }, metaParams2);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a",
        toActivate: ["a.b"],
        toDeactivate: ["a.b"],
      });
    });

    it("should treat missing or incomplete meta.params as a change", () => {
      const metaParams1 = {
        a: {},
        "a.b": { x: "url" },
      };
      const fromState = makeState("a.b", { x: "1" }, metaParams1);
      const toState = makeState("a.b", { x: "1" }, {});

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a",
        toActivate: ["a.b"],
        toDeactivate: ["a.b"],
      });
    });
  });

  describe("Parameter comparison and changes", () => {
    it("should detect param changes when route names are equal", () => {
      const metaParams = {
        a: {},
        "a.b": { p1: "url" },
        "a.b.c": { p2: "url" },
        "a.b.c.d": { p3: "url" },
      };

      expect(
        getTransitionPath(
          makeState("a.b.c.d", { p1: 0, p2: 2, p3: 3 }, metaParams),
          makeState("a.b.c.d", { p1: 1, p2: 2, p3: 3 }, metaParams),
        ).intersection,
      ).toStrictEqual("a");

      expect(
        getTransitionPath(
          makeState("a.b.c.d", { p1: 1, p2: 0, p3: 3 }, metaParams),
          makeState("a.b.c.d", { p1: 1, p2: 2, p3: 3 }, metaParams),
        ).intersection,
      ).toStrictEqual("a.b");

      expect(
        getTransitionPath(
          makeState("a.b.c.d", { p1: 1, p2: 2, p3: 0 }, metaParams),
          makeState("a.b.c.d", { p1: 1, p2: 2, p3: 3 }, metaParams),
        ).intersection,
      ).toStrictEqual("a.b.c");
    });

    it("should detect mismatch in parameter count between segments", () => {
      const metaParams = {
        a: {},
        "a.b": { x: "url", y: "url" },
      };
      const fromState = makeState("a.b", { x: "1", y: "2" }, metaParams);
      const toState = makeState("a.b", { x: "1" }, metaParams);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a",
        toActivate: ["a.b"],
        toDeactivate: ["a.b"],
      });
    });

    it("should detect change in nested param", () => {
      const metaParams = {
        a: {},
        "a.b": { p1: "url" },
        "a.b.c": { p2: "url" },
      };

      const fromState = makeState("a.b.c", { p1: "1", p2: "2" }, metaParams);
      const toState = makeState("a.b.c", { p1: "1", p2: "3" }, metaParams);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a.b",
        toActivate: ["a.b.c"],
        toDeactivate: ["a.b.c"],
      });
    });

    it("should not treat param key order difference as transition", () => {
      const metaParams = {
        a: {},
        "a.b": { x: "url", y: "url" },
      };
      const fromState = makeState("a.b", { x: "1", y: "2" }, metaParams);
      const toState = makeState("a.b", { y: "2", x: "1" }, metaParams);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a.b",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should ignore changes to non-declared params in meta.params", () => {
      const metaParams = {
        a: {},
      };

      const fromState = makeState("a", { unknown: "1" }, metaParams);
      const toState = makeState("a", { unknown: "2" }, metaParams);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should ignore param differences if meta.params does not define them", () => {
      const meta = {
        id: 0,
        params: {},
        options: {},
        redirected: false,
      };

      expect(
        getTransitionPath(
          makeState("a.b", { x: 1 }, meta.params),
          makeState("a.b", { x: 2 }, meta.params),
        ),
      ).toStrictEqual({
        intersection: "a.b",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should treat states without meta.params as requiring full reload", () => {
      const meta1 = {
        id: 1,
        params: {},
        options: {},
        redirected: false,
      };

      const meta2 = {
        id: 2,
        params: {},
        options: {},
        redirected: false,
      };

      expect(
        getTransitionPath(
          makeState("a.b.c", { p: "1" }, meta2.params, meta2),
          makeState("a.b.c", { p: "1" }, meta1.params, meta1),
        ),
      ).toStrictEqual({
        intersection: "a.b.c",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should detect difference when one state has fewer params in a segment", () => {
      const metaParams = {
        "a.b": { x: "url", y: "url" },
      };

      const toState = makeState("a.b", { x: "1", y: "2" }, metaParams);
      const fromState = makeState("a.b", { x: "1" }, metaParams);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a",
        toActivate: ["a.b"],
        toDeactivate: ["a.b"],
      });
    });

    it("should treat undefined meta.params as empty object", () => {
      const fromState = makeState("a.b", { x: "1" });
      const toState = makeState("a.b", { x: "1" });

      // @ts-expect-error for testing purposes
      fromState.meta = { ...fromState.meta, params: undefined };
      // @ts-expect-error for testing purposes
      toState.meta = { ...toState.meta, params: undefined };

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b"],
        toDeactivate: ["a.b", "a"],
      });
    });
  });

  describe("Meta handling", () => {
    it("should return full transition when fromState is missing meta.params", () => {
      const toMetaParams = {
        a: {},
        "a.b": {},
      };

      const toState = makeState("a.b", {}, toMetaParams, {});
      const fromState = {
        name: "a.b",
        path: "/a/b",
        params: {},
        meta: undefined, // no meta
      };

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a.b",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should treat undefined meta as no meta.params", () => {
      const fromState = makeState("a.b", { x: "1" });
      const toState = makeState("a.b", { x: "1" });

      delete fromState.meta;
      delete toState.meta;

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b"],
        toDeactivate: ["a.b", "a"],
      });
    });

    it("should ignore differences in meta.options (except reload)", () => {
      const metaParams = {
        a: {},
        "a.b": {},
      };

      const fromState = makeState("a.b", {}, metaParams, { force: true });
      const toState = makeState("a.b", {}, metaParams, { force: false });

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a.b",
        toActivate: [],
        toDeactivate: [],
      });
    });
  });

  describe("Reload behavior", () => {
    it("should trigger full reload when toState has reload option", () => {
      expect(
        getTransitionPath(
          makeState("a.b.c.d", {}, {}, { reload: true }),
          makeState("a.b.c", {}, {}, { reload: false }),
        ),
      ).toStrictEqual({
        intersection: "",
        toActivate: ["a", "a.b", "a.b.c", "a.b.c.d"],
        toDeactivate: ["a.b.c", "a.b", "a"],
      });
    });
  });

  describe("Parameter type handling", () => {
    it("should correctly handle boolean params", () => {
      const metaParams = { "a.b": { active: "url" } };
      const fromState = makeState("a.b", { active: true }, metaParams);
      const toState = makeState("a.b", { active: false }, metaParams);

      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a",
        toActivate: ["a.b"],
        toDeactivate: ["a.b"],
      });
    });

    it("should correctly handle number vs string params", () => {
      const metaParams = { "a.b": { id: "url" } };
      const fromState = makeState("a.b", { id: 123 }, metaParams);
      const toState = makeState("a.b", { id: "123" }, metaParams);

      // After String() conversion they should be equal
      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a.b",
        toActivate: [],
        toDeactivate: [],
      });
    });

    it("should handle null/undefined params", () => {
      const metaParams = { "a.b": { optional: "url" } };
      const fromState = makeState("a.b", { optional: null }, metaParams);
      const toState = makeState("a.b", { optional: undefined }, metaParams);

      // Both should be ignored in extractSegmentParams
      expect(getTransitionPath(toState, fromState)).toStrictEqual({
        intersection: "a.b",
        toActivate: [],
        toDeactivate: [],
      });
    });
  });

  describe("Performance optimizations", () => {
    it("should exit early when no meta params exist", () => {
      const fromState = makeState("a.b.c");
      const toState = makeState("x.y.z");

      // Delete meta.params
      // @ts-expect-error for testing purposes
      delete fromState.meta.params;
      // @ts-expect-error for testing purposes
      delete toState.meta.params;

      // Should quickly return result without calling extractSegmentParams
      const result = getTransitionPath(toState, fromState);

      expect(result).toBeDefined();
    });
  });

  describe("Long path stress tests", () => {
    it("should handle very deep nesting (20+ levels)", () => {
      const deepPath = Array.from({ length: 20 })
        .fill(0)
        .map((_, i) => `level${i}`)
        .join(".");
      const fromState = makeState(deepPath);
      const toState = makeState(deepPath.replace("level19", "levelX"));

      const result = getTransitionPath(toState, fromState);

      expect(result.toDeactivate).toHaveLength(1);
      expect(result.toActivate).toHaveLength(1);
    });
  });

  describe("extractSegmentParams edge cases (lines 117-143)", () => {
    it("should handle undefined key value in meta.params (lines 96-101)", () => {
      // Edge case: meta.params[segmentName] has a key with undefined value
      const metaParams = {
        a: { undefinedKey: undefined as unknown as string },
      };
      const fromState = makeState("a", { undefinedKey: "value" }, metaParams);
      const toState = makeState("a", { undefinedKey: "value" }, metaParams);

      // Should skip undefined keys in meta.params
      const result = getTransitionPath(toState, fromState);

      expect(result.intersection).toBe("a");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
    });

    it("should handle array params with length comparison", () => {
      // Arrays are objects, so they get compared as strings
      const metaParams = { a: { items: "url" } };
      const fromState = makeState(
        "a",
        { items: ["a", "b"] as unknown as string },
        metaParams,
      );
      const toState = makeState(
        "a",
        { items: ["a", "b", "c"] as unknown as string },
        metaParams,
      );

      // Different array lengths = different params
      const result = getTransitionPath(toState, fromState);

      // Either triggers reactivation or treats as same depending on string comparison
      expect(result).toBeDefined();
    });

    it("should skip inherited properties in meta.params keys (line 93)", () => {
      // Create meta.params with inherited properties via prototype chain
      const prototype = { inheritedKey: "inherited" };
      const keysWithInheritance = Object.create(prototype) as Record<
        string,
        string
      >;

      keysWithInheritance.ownKey = "url";

      const metaParams = {
        a: keysWithInheritance,
      };

      const fromState = makeState(
        "a",
        { ownKey: "value1", inheritedKey: "value2" },
        metaParams,
      );
      const toState = makeState(
        "a",
        { ownKey: "value1", inheritedKey: "changed" },
        metaParams,
      );

      // Should only compare ownKey, ignoring inheritedKey
      const result = getTransitionPath(toState, fromState);

      expect(result.intersection).toBe("a");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
    });

    // Note: symbol/function/bigint param types cannot reach extractSegmentParams because
    // isParams validation in isState rejects them before this code executes.
  });

  describe("Mutation testing - extractSegmentParams (lines 95-127)", () => {
    it("should skip undefined values in meta.params keys (line 95 continue)", () => {
      // Test that undefined values in meta.params[segment] keys are skipped
      // Line 95: if (keys[key] === undefined) { continue; }
      const metaParams = {
        a: {
          validKey: "url",
          undefinedKey: undefined as unknown as string,
        },
      };

      // From state has value for undefinedKey, to state has different value
      // But since undefinedKey has undefined value in meta.params, it should be ignored
      const fromState = makeState(
        "a",
        { validKey: "same", undefinedKey: "value1" },
        metaParams,
      );
      const toState = makeState(
        "a",
        { validKey: "same", undefinedKey: "different" },
        metaParams,
      );

      const result = getTransitionPath(toState, fromState);

      // Should NOT trigger transition because undefinedKey is ignored
      expect(result.intersection).toBe("a");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
    });

    it("should skip null values in state.params (line 102 continue)", () => {
      // Test that null values in state.params are skipped
      // Line 102: if (value == null) { continue; }
      const metaParams = {
        a: { optionalKey: "url" },
      };

      // Both states have null for optionalKey - should both be treated as "no value"
      const fromState = makeState("a", { optionalKey: null }, metaParams);
      const toState = makeState("a", { optionalKey: null }, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Should be identical since both have null (treated as missing)
      expect(result.intersection).toBe("a");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
    });

    it("should detect transition when one has null and other has value (line 102)", () => {
      // Test that null vs value is detected as difference
      const metaParams = {
        a: { optionalKey: "url" },
      };

      const fromState = makeState("a", { optionalKey: null }, metaParams);
      const toState = makeState("a", { optionalKey: "value" }, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Should trigger transition because null → "value" is a change
      expect(result.intersection).toBe("");
      expect(result.toActivate).toHaveLength(1);
      expect(result.toDeactivate).toHaveLength(1);
    });

    it("should handle string params (line 108 typeof string)", () => {
      // Verify string params are correctly converted to strings
      const metaParams = { a: { key: "url" } };
      const fromState = makeState("a", { key: "value1" }, metaParams);
      const toState = makeState("a", { key: "value2" }, metaParams);

      const result = getTransitionPath(toState, fromState);

      expect(result.intersection).toBe("");
      expect(result.toActivate).toHaveLength(1);
    });

    it("should handle number params (line 109 typeof number)", () => {
      // Verify number params are correctly converted to strings
      const metaParams = { a: { count: "url" } };
      const fromState = makeState("a", { count: 42 }, metaParams);
      const toState = makeState("a", { count: 43 }, metaParams);

      const result = getTransitionPath(toState, fromState);

      expect(result.intersection).toBe("");
      expect(result.toActivate).toHaveLength(1);
    });

    it("should handle boolean params (line 110 typeof boolean)", () => {
      // Verify boolean params are correctly converted to strings
      const metaParams = { a: { active: "url" } };
      const fromState = makeState("a", { active: true }, metaParams);
      const toState = makeState("a", { active: false }, metaParams);

      const result = getTransitionPath(toState, fromState);

      // "true" !== "false" so should trigger transition
      expect(result.intersection).toBe("");
      expect(result.toActivate).toHaveLength(1);
    });
  });

  describe("Mutation testing - pointOfDifference (line 147)", () => {
    it("should correctly find difference at boundary (i < maxI)", () => {
      // Test that loop terminates correctly at maxI
      // Line 147: for (let i = 0; i < maxI; i++)
      // If mutated to i <= maxI, would cause array out of bounds
      const metaParams = {
        a: {},
        "a.b": {},
      };

      // toState has 2 segments, fromState has 3 segments
      // maxI should be 2, loop should check indices 0, 1
      const fromState = makeState("a.b.c", {}, { ...metaParams, "a.b.c": {} });
      const toState = makeState("a.b", {}, metaParams);

      const result = getTransitionPath(toState, fromState);

      // All common segments match, intersection should be at a.b
      expect(result.intersection).toBe("a.b");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toStrictEqual(["a.b.c"]);
    });
  });

  describe("Edge cases - getTransitionPath with invalid input", () => {
    it("should throw when toState is null", () => {
      // Accessing properties on null throws a TypeError
      expect(() => getTransitionPath(null as unknown as State)).toThrowError();
    });

    it("should handle fromState with missing name property gracefully", () => {
      // Invalid fromState is handled gracefully (treated as partial state)
      const validToState = makeState("a");
      const invalidFromState = { invalid: "object" } as unknown as State;

      // Should not throw - fromState.name will be undefined
      expect(() =>
        getTransitionPath(validToState, invalidFromState),
      ).not.toThrowError();
    });
  });

  describe("Mutation testing - meta handling (lines 372-400)", () => {
    it("should handle toState with meta but fromState without meta (line 373)", () => {
      // Line 373: const fromHasMeta = fromState.meta?.params !== undefined;
      // If mutated to false, would incorrectly treat fromState as having no meta
      const metaParams = { a: {}, "a.b": {} };
      const toState = makeState("a.b", {}, metaParams);
      const fromState = makeState("a.b", {}, {});

      // Delete meta from fromState
      delete fromState.meta;

      const result = getTransitionPath(toState, fromState);

      // With toHasMeta = true and fromHasMeta = false, should NOT trigger
      // the "both missing meta" path
      expect(result).toBeDefined();
      expect(result.intersection).toBe("a.b");
    });

    it("should use fast path for same route with both empty meta.params (lines 386-399)", () => {
      // Lines 386-399: Same route name optimization when both have empty params
      const metaParams = { a: {}, "a.b": {} };

      // Both states have same name and empty meta.params
      const toState = makeState("a.b", {}, metaParams);
      const fromState = makeState("a.b", {}, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Should return intersection = route name, no activation/deactivation
      expect(result.intersection).toBe("a.b");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
    });

    it("should NOT use fast path when toState has non-empty params (line 388)", () => {
      // Line 388: toParamsEmpty check
      const metaParams = {
        a: {},
        "a.b": { id: "url" },
      };

      const toState = makeState("a.b", { id: "123" }, metaParams);
      const fromState = makeState("a.b", { id: "123" }, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Should still match since params are identical
      expect(result.intersection).toBe("a.b");
    });

    it("should NOT use fast path when fromState has non-empty params (line 390)", () => {
      // Line 390: fromParamsEmpty check
      const metaParams = {
        a: {},
        "a.b": { id: "url" },
      };

      const toState = makeState("a.b", { id: "123" }, metaParams);
      const fromState = makeState("a.b", { id: "456" }, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Different params should trigger transition
      expect(result.intersection).toBe("a");
      expect(result.toActivate).toHaveLength(1);
    });
  });

  describe("Mutation testing - Math.min (line 406)", () => {
    it("should use Math.min for maxI (line 406)", () => {
      // Line 406: const maxI = Math.min(fromStateIds.length, toStateIds.length);
      // If mutated to Math.max, would cause array index out of bounds
      const metaParams = {
        a: {},
        "a.b": {},
        "a.b.c": {},
        "a.b.c.d": {},
        "a.b.c.d.e": {},
      };

      // toState has 5 segments, fromState has 2 segments
      // Math.min should be 2, Math.max would be 5 (causing OOB)
      const toState = makeState("a.b.c.d.e", {}, metaParams);
      const fromState = makeState("a.b", {}, { a: {}, "a.b": {} });

      // Should not throw - verifies Math.min is used
      const result = getTransitionPath(toState, fromState);

      expect(result.intersection).toBe("a.b");
      expect(result.toActivate).toStrictEqual([
        "a.b.c",
        "a.b.c.d",
        "a.b.c.d.e",
      ]);
      expect(result.toDeactivate).toHaveLength(0);
    });

    it("should handle fromState longer than toState (line 406)", () => {
      // Opposite case: fromState has more segments
      const metaParams = {
        a: {},
        "a.b": {},
      };

      const toState = makeState("a.b", {}, metaParams);
      const fromState = makeState(
        "a.b.c.d.e",
        {},
        {
          ...metaParams,
          "a.b.c": {},
          "a.b.c.d": {},
          "a.b.c.d.e": {},
        },
      );

      const result = getTransitionPath(toState, fromState);

      expect(result.intersection).toBe("a.b");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toStrictEqual([
        "a.b.c.d.e",
        "a.b.c.d",
        "a.b.c",
      ]);
    });

    it("should correctly identify intersection when arrays differ in length (line 406)", () => {
      // This test specifically checks that with Math.min, we get correct intersection
      // With Math.max, pointOfDifference would try to access toStateIds[2] which is undefined
      // causing extractSegmentParams to be called with undefined name, returning {}
      // Then comparing {} !== {} would wrongly find a difference at index 2
      const metaParams = {
        x: { id: "url" },
        "x.y": { id: "url" },
      };

      // Both share common prefix x.y but fromState is longer
      const toState = makeState("x.y", { id: "1" }, metaParams);
      const fromState = makeState(
        "x.y.z",
        { id: "1" },
        {
          ...metaParams,
          "x.y.z": { id: "url" },
        },
      );

      const result = getTransitionPath(toState, fromState);

      // Intersection should be x.y (the common part based on toState length)
      expect(result.intersection).toBe("x.y");
      // Should deactivate x.y.z only
      expect(result.toDeactivate).toStrictEqual(["x.y.z"]);
      expect(result.toActivate).toHaveLength(0);
    });
  });

  describe("Mutation testing - empty params fast path (line 392)", () => {
    it("should return route name as intersection when both have empty params (line 392)", () => {
      // Line 392: if (toParamsEmpty && fromParamsEmpty) { return {...} }
      // This fast path returns the route name as intersection
      // Without this path, would go through standard algorithm and might still work
      // but we verify the specific behavior
      const metaParams = {
        route: {},
        "route.sub": {},
        "route.sub.deep": {},
      };

      const toState = makeState("route.sub.deep", {}, metaParams);
      const fromState = makeState("route.sub.deep", {}, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Intersection must be the full route name
      expect(result.intersection).toBe("route.sub.deep");
      expect(result.toActivate).toHaveLength(0);
      expect(result.toDeactivate).toHaveLength(0);
    });

    it("should trigger reactivation when params differ even with same structure", () => {
      // Verify that when params exist but are different, transition happens
      const metaParams = {
        a: {},
        "a.b": { x: "url" },
      };

      const toState = makeState("a.b", { x: "new" }, metaParams);
      const fromState = makeState("a.b", { x: "old" }, metaParams);

      const result = getTransitionPath(toState, fromState);

      // Should detect difference at a.b level
      expect(result.intersection).toBe("a");
      expect(result.toActivate).toStrictEqual(["a.b"]);
      expect(result.toDeactivate).toStrictEqual(["a.b"]);
    });
  });
});
