import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPluginApi } from "../../../../src";
import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/types";

let router: Router;

describe("areStatesEqual", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns true for same name and params", () => {
    const s1 = getPluginApi(router).makeState("home", { id: 1 }, "/home");
    const s2 = getPluginApi(router).makeState("home", { id: 1 }, "/home");

    expect(router.areStatesEqual(s1, s2)).toBe(true);
  });

  it("returns false for different names", () => {
    const s1 = getPluginApi(router).makeState("home", {}, "/home");
    const s2 = getPluginApi(router).makeState("admin", {}, "/admin");

    expect(router.areStatesEqual(s1, s2)).toBe(false);
  });

  it("returns false for different params", () => {
    const s1 = getPluginApi(router).makeState("items", { id: 1 }, "/home");
    const s2 = getPluginApi(router).makeState("items", { id: 2 }, "/home");

    // `id` is not query param
    expect(router.areStatesEqual(s1, s2, true)).toBe(false);
  });

  it("returns true for different params with ignore query params", () => {
    const s1 = getPluginApi(router).makeState("home", { id: 1 }, "/home");
    const s2 = getPluginApi(router).makeState("home", { id: 2 }, "/home");

    // `id` is query param
    expect(router.areStatesEqual(s1, s2)).toBe(true);
  });

  it("returns true for different params without ignore query params", () => {
    const s1 = getPluginApi(router).makeState("items", { id: 1 }, "/home");
    const s2 = getPluginApi(router).makeState("items", { id: 2 }, "/home");

    expect(router.areStatesEqual(s1, s2, false)).toBe(false);
  });

  it("compares query params when ignoreQueryParams is false", () => {
    const s1 = getPluginApi(router).makeState(
      "home",
      { foo: "bar", q: "1" },
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "home",
      { foo: "bar", q: "1" },
      "/home",
    );

    expect(router.areStatesEqual(s1, s2, false)).toBe(true);
  });

  it("should return true when both states are undefined", () => {
    expect(router.areStatesEqual(undefined, undefined)).toBe(true);
  });

  it("should use cached urlParams on second call (line 118 cache hit)", () => {
    // First call computes and caches urlParams for "home"
    const s1 = getPluginApi(router).makeState("home", { id: 1 }, "/home");
    const s2 = getPluginApi(router).makeState("home", { id: 1 }, "/home");

    expect(router.areStatesEqual(s1, s2, true)).toBe(true);

    // Second call uses cached urlParams (line 118 returns early)
    const s3 = getPluginApi(router).makeState("home", { id: 2 }, "/home");
    const s4 = getPluginApi(router).makeState("home", { id: 2 }, "/home");

    expect(router.areStatesEqual(s3, s4, true)).toBe(true);
  });

  it("should return false when one state is undefined", () => {
    const state = getPluginApi(router).makeState("home", {}, "/home");

    expect(router.areStatesEqual(state, undefined)).toBe(false);
    expect(router.areStatesEqual(undefined, state)).toBe(false);
  });

  it("should handle non-existent route names with ignoreQueryParams (line 28)", () => {
    // getSegmentsByName returns null for non-existent routes
    // The ?? [] fallback should handle this case
    const s1 = getPluginApi(router).makeState(
      "nonexistent.route",
      { id: 1 },
      "/nonexistent",
    );
    const s2 = getPluginApi(router).makeState(
      "nonexistent.route",
      { id: 1 },
      "/nonexistent",
    );

    // With ignoreQueryParams=true (default), getUrlParams is called
    // For non-existent routes, getSegmentsByName returns null, triggering ?? []
    expect(router.areStatesEqual(s1, s2, true)).toBe(true);
  });

  it("should return false for non-existent routes with different params", () => {
    const s1 = getPluginApi(router).makeState(
      "unknown.route",
      { x: 1 },
      "/unknown",
    );
    const s2 = getPluginApi(router).makeState(
      "unknown.route",
      { x: 2 },
      "/unknown",
    );

    // With ignoreQueryParams=true, urlParams is empty (from ?? [])
    // So no params are compared, states are equal by name only
    expect(router.areStatesEqual(s1, s2, true)).toBe(true);

    // With ignoreQueryParams=false, all params are compared
    expect(router.areStatesEqual(s1, s2, false)).toBe(false);
  });

  describe("argument validation", () => {
    it("does not throw for null/undefined states", () => {
      const validState = getPluginApi(router).makeState("home", {}, "/home");

      // null/undefined are valid inputs (represent "no state")
      // Using 'as never' to test runtime behavior with null values
      expect(() =>
        router.areStatesEqual(null as never, null as never),
      ).not.toThrowError();
      expect(() =>
        router.areStatesEqual(undefined, undefined),
      ).not.toThrowError();
      expect(() =>
        router.areStatesEqual(validState, null as never),
      ).not.toThrowError();
      expect(() =>
        router.areStatesEqual(null as never, validState),
      ).not.toThrowError();
    });

    it("throws TypeError for invalid state1", () => {
      const validState = getPluginApi(router).makeState("home", {}, "/home");

      expect(() =>
        router.areStatesEqual("invalid" as never, validState),
      ).toThrowError(TypeError);
      expect(() =>
        router.areStatesEqual({ name: "x" } as never, validState),
      ).toThrowError(/Invalid state/);
    });

    it("throws TypeError for invalid state2", () => {
      const validState = getPluginApi(router).makeState("home", {}, "/home");

      expect(() =>
        router.areStatesEqual(validState, "invalid" as never),
      ).toThrowError(TypeError);
      expect(() =>
        router.areStatesEqual(validState, 123 as never),
      ).toThrowError(/Invalid state/);
    });

    it("throws TypeError for invalid ignoreQueryParams", () => {
      const s1 = getPluginApi(router).makeState("home", {}, "/home");
      const s2 = getPluginApi(router).makeState("home", {}, "/home");

      expect(() => router.areStatesEqual(s1, s2, "true" as never)).toThrowError(
        TypeError,
      );
      expect(() => router.areStatesEqual(s1, s2, 1 as never)).toThrowError(
        /Invalid ignoreQueryParams/,
      );
    });
  });

  describe("edge cases - issue #515 (different keys with same length)", () => {
    it("returns false when params have different keys (undefined value case)", () => {
      // Original router5 bug: {a: 1, b: undefined} vs {a: 1, c: 2}
      // Same length but different keys - should be false
      const s1 = getPluginApi(router).makeState(
        "home",
        { a: 1, b: undefined } as never,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { a: 1, c: 2 } as never,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns false when state1 has key that state2 lacks", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { x: 1, y: 2 },
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { x: 1, z: 2 },
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns true when both have same keys with undefined values", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { a: 1, b: undefined } as never,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { a: 1, b: undefined } as never,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });
  });

  describe("edge cases - issue #478 (array params comparison)", () => {
    it("returns true for equal array params (deep equality)", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { tags: ["a", "b", "c"] },
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { tags: ["a", "b", "c"] },
        "/home",
      );

      // Different array references but same content
      expect(s1.params.tags).not.toBe(s2.params.tags);
      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });

    it("returns false for different array lengths", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2, 3] },
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2] },
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns false for different array content", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2, 3] },
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2, 4] },
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns true for nested arrays with same content", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        {
          matrix: [
            [1, 2],
            [3, 4],
          ],
        } as never,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        {
          matrix: [
            [1, 2],
            [3, 4],
          ],
        } as never,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });

    it("returns false for nested arrays with different content", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        {
          matrix: [
            [1, 2],
            [3, 4],
          ],
        } as never,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        {
          matrix: [
            [1, 2],
            [3, 5],
          ],
        } as never,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns false when comparing array to non-array", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { data: [1, 2, 3] },
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { data: "1,2,3" },
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("handles empty arrays correctly", () => {
      const s1 = getPluginApi(router).makeState("home", { items: [] }, "/home");
      const s2 = getPluginApi(router).makeState("home", { items: [] }, "/home");

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });

    it("returns true for same array reference", () => {
      const sharedArray = ["x", "y"];
      const s1 = getPluginApi(router).makeState(
        "home",
        { tags: sharedArray },
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { tags: sharedArray },
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });
  });
});
