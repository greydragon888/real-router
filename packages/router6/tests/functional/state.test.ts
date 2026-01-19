import { createRouteTree, matchSegments } from "route-tree";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { constants } from "router6";

import {
  buildNameFromSegments,
  createRouteState,
} from "../../modules/core/stateBuilder";
import { getConfig } from "../../modules/internals";
import { createTestRouter } from "../helpers";

import type { Router } from "router6";

let router: Router;

describe("core/state", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start("");
  });

  afterEach(() => {
    router.stop();
  });

  describe("getState", () => {
    it("returns undefined when router not started", () => {
      router.stop();

      expect(router.getState()).toBe(undefined);
    });

    it("returns the previously set state", () => {
      const state = router.makeState("home", { id: 1 }, "/home");

      router.setState(state);

      expect(router.getState()).toStrictEqual(state);
    });
  });

  describe("setState", () => {
    it("sets internal router state", () => {
      const state = router.makeState("home", {}, "/home");

      router.setState(state);

      expect(router.getState()).toStrictEqual(state);
    });

    it("clears state when undefined is passed", () => {
      const state = router.makeState("home", {}, "/home");

      router.setState(state);
      router.setState(undefined);

      expect(router.getState()).toBe(undefined);
    });

    describe("argument validation", () => {
      it("throws TypeError for null", () => {
        expect(() => {
          router.setState(null as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.setState(null as any);
        }).toThrowError("Invalid state");
      });

      it("throws TypeError for invalid object (missing fields)", () => {
        expect(() => {
          router.setState({ name: "home" } as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.setState({ name: "home", params: {} } as any);
        }).toThrowError("Invalid state");
      });

      it("throws TypeError for primitive values", () => {
        expect(() => {
          router.setState("home" as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.setState(123 as any);
        }).toThrowError(TypeError);
      });

      it("preserves state after failed validation", () => {
        const validState = router.makeState("home", {}, "/home");

        router.setState(validState);

        expect(() => {
          router.setState(null as any);
        }).toThrowError();

        // State should remain unchanged
        expect(router.getState()).toStrictEqual(validState);
      });
    });
  });

  describe("getPreviousState", () => {
    it("returns undefined before first navigation", () => {
      expect(router.getPreviousState()).toBeUndefined();
    });

    it("returns previous state after navigation", () => {
      router.navigate("sign-in");

      const previousState = router.getPreviousState();

      expect(previousState).toBeDefined();
      expect(previousState?.name).toBe("home");
    });

    it("updates previous state on subsequent navigations", () => {
      router.navigate("sign-in");
      router.navigate("users");

      const previousState = router.getPreviousState();

      expect(previousState?.name).toBe("sign-in");
    });

    it("preserves previous state params", () => {
      router.navigate("users.view", { id: "123" });
      router.navigate("home");

      const previousState = router.getPreviousState();

      expect(previousState?.name).toBe("users.view");
      expect(previousState?.params).toStrictEqual({ id: "123" });
    });

    it("returns frozen state (immutable)", () => {
      router.navigate("sign-in");

      const previousState = router.getPreviousState();

      expect(Object.isFrozen(previousState)).toBe(true);
    });
  });

  describe("makeState", () => {
    it("returns valid state object", () => {
      const state = router.makeState("home", { foo: "bar" }, "/home");

      expect(state).toMatchObject({
        name: "home",
        path: "/home",
        params: { foo: "bar" },
      });
      expect(state.meta).toBe(undefined);
    });

    it("merges with defaultParams", () => {
      getConfig(router).defaultParams.admin = { lang: "en" };
      const state = router.makeState("admin", { id: 123 }, "/admin");

      expect(state.params).toStrictEqual({ lang: "en", id: 123 });
    });

    it("uses forced ID if provided", () => {
      const state = router.makeState(
        "home",
        {},
        "/home",
        { params: {}, options: {}, redirected: false, source: "" },
        999,
      );

      expect(state.meta?.id).toBe(999);
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string name", () => {
        expect(() =>
          router.makeState(123 as unknown as string, {}),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeState(null as unknown as string, {}),
        ).toThrowError(/Invalid name/);
      });

      it("throws TypeError for invalid params", () => {
        expect(() => router.makeState("home", "invalid" as never)).toThrowError(
          TypeError,
        );
        expect(() =>
          router.makeState("home", (() => {}) as never),
        ).toThrowError(/Invalid params/);
      });

      it("throws TypeError for non-string path", () => {
        expect(() =>
          router.makeState("home", {}, 123 as unknown as string),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeState("home", {}, {} as unknown as string),
        ).toThrowError(/Invalid path/);
      });

      it("throws TypeError for non-number forceId", () => {
        expect(() =>
          router.makeState(
            "home",
            {},
            "/home",
            { params: {}, options: {}, redirected: false },
            "999" as unknown as number,
          ),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeState(
            "home",
            {},
            "/home",
            { params: {}, options: {}, redirected: false },
            {} as unknown as number,
          ),
        ).toThrowError(/Invalid forceId/);
      });
    });
  });

  describe("makeNotFoundState", () => {
    it("returns a state for unknown route", () => {
      const state = router.makeNotFoundState("/unknown");

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state.params).toStrictEqual({ path: "/unknown" });
      expect(state.path).toBe("/unknown");
    });

    it("includes meta when options passed", () => {
      const state = router.makeNotFoundState("/x", { reload: true });

      expect(state.meta?.options).toStrictEqual({ reload: true });
      expect(state.meta?.redirected).toBe(false);
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string path", () => {
        expect(() =>
          router.makeNotFoundState(123 as unknown as string),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeNotFoundState(null as unknown as string),
        ).toThrowError(/Invalid path/);
      });

      it("throws TypeError for invalid options", () => {
        expect(() =>
          router.makeNotFoundState("/x", "invalid" as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.makeNotFoundState("/x", { reload: "yes" } as never),
        ).toThrowError(/Invalid options/);
      });
    });
  });

  describe("areStatesEqual", () => {
    it("returns true for same name and params", () => {
      const s1 = router.makeState("home", { id: 1 }, "/home");
      const s2 = router.makeState("home", { id: 1 }, "/home");

      expect(router.areStatesEqual(s1, s2)).toBe(true);
    });

    it("returns false for different names", () => {
      const s1 = router.makeState("home", {}, "/home");
      const s2 = router.makeState("admin", {}, "/admin");

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });

    it("returns false for different params", () => {
      const s1 = router.makeState("items", { id: 1 }, "/home");
      const s2 = router.makeState("items", { id: 2 }, "/home");

      // `id` is not query param
      expect(router.areStatesEqual(s1, s2, true)).toBe(false);
    });

    it("returns true for different params with ignore query params", () => {
      const s1 = router.makeState("home", { id: 1 }, "/home");
      const s2 = router.makeState("home", { id: 2 }, "/home");

      // `id` is query param
      expect(router.areStatesEqual(s1, s2)).toBe(true);
    });

    it("returns true for different params without ignore query params", () => {
      const s1 = router.makeState("items", { id: 1 }, "/home");
      const s2 = router.makeState("items", { id: 2 }, "/home");

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("compares query params when ignoreQueryParams is false", () => {
      const s1 = router.makeState("home", { foo: "bar", q: "1" }, "/home");
      const s2 = router.makeState("home", { foo: "bar", q: "1" }, "/home");

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });

    it("should return true when both states are undefined", () => {
      expect(router.areStatesEqual(undefined, undefined)).toBe(true);
    });

    it("should return false when one state is undefined", () => {
      const state = router.makeState("home", {}, "/home");

      expect(router.areStatesEqual(state, undefined)).toBe(false);
      expect(router.areStatesEqual(undefined, state)).toBe(false);
    });

    it("should handle non-existent route names with ignoreQueryParams (line 28)", () => {
      // getSegmentsByName returns null for non-existent routes
      // The ?? [] fallback should handle this case
      const s1 = router.makeState(
        "nonexistent.route",
        { id: 1 },
        "/nonexistent",
      );
      const s2 = router.makeState(
        "nonexistent.route",
        { id: 1 },
        "/nonexistent",
      );

      // With ignoreQueryParams=true (default), getUrlParams is called
      // For non-existent routes, getSegmentsByName returns null, triggering ?? []
      expect(router.areStatesEqual(s1, s2, true)).toBe(true);
    });

    it("should return false for non-existent routes with different params", () => {
      const s1 = router.makeState("unknown.route", { x: 1 }, "/unknown");
      const s2 = router.makeState("unknown.route", { x: 2 }, "/unknown");

      // With ignoreQueryParams=true, urlParams is empty (from ?? [])
      // So no params are compared, states are equal by name only
      expect(router.areStatesEqual(s1, s2, true)).toBe(true);

      // With ignoreQueryParams=false, all params are compared
      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    describe("argument validation", () => {
      // Validation removed from areStatesEqual for performance optimization.
      // States are validated at creation time (makeState, buildState).
      // See: packages/router6/.claude/OPTIMIZATION-RECOMMENDATIONS.md

      it("does not throw for null/undefined states", () => {
        const validState = router.makeState("home", {}, "/home");

        // null/undefined are valid inputs (handled before validation)
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
    });

    describe("edge cases - issue #515 (different keys with same length)", () => {
      it("returns false when params have different keys (undefined value case)", () => {
        // Original router5 bug: {a: 1, b: undefined} vs {a: 1, c: 2}
        // Same length but different keys - should be false
        const s1 = router.makeState(
          "home",
          { a: 1, b: undefined } as never,
          "/home",
        );
        const s2 = router.makeState("home", { a: 1, c: 2 } as never, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns false when state1 has key that state2 lacks", () => {
        const s1 = router.makeState("home", { x: 1, y: 2 }, "/home");
        const s2 = router.makeState("home", { x: 1, z: 2 }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns true when both have same keys with undefined values", () => {
        const s1 = router.makeState(
          "home",
          { a: 1, b: undefined } as never,
          "/home",
        );
        const s2 = router.makeState(
          "home",
          { a: 1, b: undefined } as never,
          "/home",
        );

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });
    });

    describe("edge cases - issue #478 (array params comparison)", () => {
      it("returns true for equal array params (deep equality)", () => {
        const s1 = router.makeState("home", { tags: ["a", "b", "c"] }, "/home");
        const s2 = router.makeState("home", { tags: ["a", "b", "c"] }, "/home");

        // Different array references but same content
        expect(s1.params.tags).not.toBe(s2.params.tags);
        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });

      it("returns false for different array lengths", () => {
        const s1 = router.makeState("home", { ids: [1, 2, 3] }, "/home");
        const s2 = router.makeState("home", { ids: [1, 2] }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns false for different array content", () => {
        const s1 = router.makeState("home", { ids: [1, 2, 3] }, "/home");
        const s2 = router.makeState("home", { ids: [1, 2, 4] }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("returns true for nested arrays with same content", () => {
        const s1 = router.makeState(
          "home",
          {
            matrix: [
              [1, 2],
              [3, 4],
            ],
          } as never,
          "/home",
        );
        const s2 = router.makeState(
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
        const s1 = router.makeState(
          "home",
          {
            matrix: [
              [1, 2],
              [3, 4],
            ],
          } as never,
          "/home",
        );
        const s2 = router.makeState(
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
        const s1 = router.makeState("home", { data: [1, 2, 3] }, "/home");
        const s2 = router.makeState("home", { data: "1,2,3" }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(false);
      });

      it("handles empty arrays correctly", () => {
        const s1 = router.makeState("home", { items: [] }, "/home");
        const s2 = router.makeState("home", { items: [] }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });

      it("returns true for same array reference", () => {
        const sharedArray = ["x", "y"];
        const s1 = router.makeState("home", { tags: sharedArray }, "/home");
        const s2 = router.makeState("home", { tags: sharedArray }, "/home");

        expect(router.areStatesEqual(s1, s2, false)).toBe(true);
      });
    });
  });

  describe("areStatesDescendants (deprecated)", () => {
    // Suppress deprecation warnings during tests
    const originalWarn = console.warn;

    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      console.warn = originalWarn;
    });

    it("returns true if child extends parent and params match", () => {
      const parent = router.makeState("index", { x: 1 }, "/");
      const child = router.makeState("index.home", { x: 1, y: 2 }, "/home");

      expect(router.areStatesDescendants(parent, child)).toBe(true);
    });

    it("returns false if child name doesn't extend parent", () => {
      const parent = router.makeState("home", {}, "/home");
      const child = router.makeState("admin.sign-in", {}, "/sign-in");

      expect(router.areStatesDescendants(parent, child)).toBe(false);
    });

    it("returns false if parent params don't match", () => {
      const parent = router.makeState("home", { x: 1 }, "/home");
      const child = router.makeState("home.nested", { x: 2 }, "/home/nested");

      expect(router.areStatesDescendants(parent, child)).toBe(false);
    });

    it("logs deprecation warning when called", () => {
      const parent = router.makeState("index", {}, "/");
      const child = router.makeState("index.home", {}, "/home");

      router.areStatesDescendants(parent, child);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("areStatesDescendants is deprecated"),
      );
    });

    describe("argument validation", () => {
      it("throws TypeError for invalid parentState", () => {
        const child = router.makeState("home", {}, "/home");

        expect(() =>
          router.areStatesDescendants(null as never, child),
        ).toThrowError(TypeError);
        expect(() =>
          router.areStatesDescendants("invalid" as never, child),
        ).toThrowError(/Invalid state/);
      });

      it("throws TypeError for invalid childState", () => {
        const parent = router.makeState("home", {}, "/home");

        expect(() =>
          router.areStatesDescendants(parent, null as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.areStatesDescendants(parent, { name: "x" } as never),
        ).toThrowError(/Invalid state/);
      });
    });

    describe("array params comparison", () => {
      it("returns true when array params match (deep equality)", () => {
        const parent = router.makeState("index", { tags: ["a", "b"] }, "/");
        const child = router.makeState(
          "index.home",
          { tags: ["a", "b"], extra: 1 },
          "/home",
        );

        expect(router.areStatesDescendants(parent, child)).toBe(true);
      });

      it("returns false when array params differ", () => {
        const parent = router.makeState("index", { tags: ["a", "b"] }, "/");
        const child = router.makeState(
          "index.home",
          { tags: ["a", "c"], extra: 1 },
          "/home",
        );

        expect(router.areStatesDescendants(parent, child)).toBe(false);
      });
    });
  });

  describe("forwardState", () => {
    it("returns same state if no forward defined", () => {
      const state = router.forwardState("home", { id: 1 });

      expect(state.name).toBe("home");
      expect(state.params.id).toBe(1);
    });

    it("forwards to another route with merged params", () => {
      router.forward("home", "admin");
      getConfig(router).defaultParams.home = { a: 1 };
      getConfig(router).defaultParams.admin = { b: 2 };

      const state = router.forwardState("home", { c: 3 });

      expect(state.name).toBe("admin");
      expect(state.params).toStrictEqual({ a: 1, b: 2, c: 3 });
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string routeName", () => {
        expect(() =>
          router.forwardState(123 as unknown as string, {}),
        ).toThrowError(TypeError);
        expect(() =>
          router.forwardState(null as unknown as string, {}),
        ).toThrowError(/Invalid routeName/);
      });

      it("throws TypeError for invalid routeParams", () => {
        expect(() =>
          router.forwardState("home", "invalid" as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.forwardState("home", (() => {}) as never),
        ).toThrowError(/Invalid routeParams/);
      });
    });
  });

  describe("buildState", () => {
    it("returns state if route exists", () => {
      const state = router.buildState("home", {});

      expect(state?.name).toBe("home");
      expect(state?.params).toStrictEqual({});
    });

    it("returns undefined if route is unknown", () => {
      const state = router.buildState("unknown.route", {});

      expect(state).toBe(undefined);
    });

    describe("argument validation", () => {
      it("throws TypeError for non-string routeName", () => {
        expect(() =>
          router.buildState(123 as unknown as string, {}),
        ).toThrowError(TypeError);
        expect(() =>
          router.buildState(null as unknown as string, {}),
        ).toThrowError(/Invalid routeName/);
      });

      it("throws TypeError for invalid routeParams", () => {
        expect(() =>
          router.buildState("home", "invalid" as never),
        ).toThrowError(TypeError);
        expect(() =>
          router.buildState("home", (() => {}) as never),
        ).toThrowError(/Invalid routeParams/);
      });
    });
  });
});

describe("core/stateBuilder", () => {
  describe("buildNameFromSegments", () => {
    it("builds dot-separated name from segments", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      const result = matchSegments(tree, "/users/123");

      expect(result).not.toBeNull();
      expect(buildNameFromSegments(result!.segments)).toBe("users.profile");
    });

    it("returns empty string for no segments", () => {
      expect(buildNameFromSegments([])).toBe("");
    });

    it("skips segments with empty names", () => {
      const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

      const result = matchSegments(tree, "/home");

      expect(result).not.toBeNull();
      expect(buildNameFromSegments(result!.segments)).toBe("home");
    });

    it("skips segments with undefined name (line 43 falsy branch)", () => {
      // Directly test with segments that have undefined/empty names
      const segments = [
        { name: undefined },
        { name: "users" },
        { name: "" },
        { name: "profile" },
        { name: undefined },
      ];

      // Should skip undefined and empty names, only building from "users" and "profile"
      expect(buildNameFromSegments(segments as any)).toBe("users.profile");
    });

    it("handles all segments with falsy names", () => {
      const segments = [{ name: undefined }, { name: "" }, { name: null }];

      expect(buildNameFromSegments(segments as any)).toBe("");
    });
  });

  describe("createRouteState", () => {
    it("creates RouteTreeState from MatchResult", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "view", path: "/:id" }],
        },
      ]);

      const result = matchSegments(tree, "/users/123");

      expect(result).not.toBeNull();

      const state = createRouteState(result!);

      expect(state).toStrictEqual({
        name: "users.view",
        params: { id: "123" },
        meta: {
          users: {},
          "users.view": { id: "url" },
        },
      });
    });

    it("uses explicit name when provided", () => {
      const tree = createRouteTree("", "", [{ name: "route", path: "/route" }]);

      const result = matchSegments(tree, "/route");

      expect(result).not.toBeNull();

      const state = createRouteState(result!, "custom.name");

      expect(state.name).toBe("custom.name");
    });

    it("creates state with query params meta", () => {
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page" },
      ]);

      const result = matchSegments(tree, "/search?q=test&page=1");

      expect(result).not.toBeNull();

      const state = createRouteState(result!);

      expect(state.meta).toStrictEqual({
        search: { q: "query", page: "query" },
      });
    });
  });
});
