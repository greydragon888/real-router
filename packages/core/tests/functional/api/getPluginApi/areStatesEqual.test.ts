import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core/types";

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
    const s1 = getPluginApi(router).makeState(
      "home",
      { id: 1 },
      undefined,
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "home",
      { id: 1 },
      undefined,
      "/home",
    );

    expect(router.areStatesEqual(s1, s2)).toBe(true);
  });

  it("returns false for different names", () => {
    const s1 = getPluginApi(router).makeState("home", {}, undefined, "/home");
    const s2 = getPluginApi(router).makeState("admin", {}, undefined, "/admin");

    expect(router.areStatesEqual(s1, s2)).toBe(false);
  });

  it("returns false for different params", () => {
    const s1 = getPluginApi(router).makeState(
      "items",
      { id: 1 },
      undefined,
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "items",
      { id: 2 },
      undefined,
      "/home",
    );

    // `id` is not query param
    expect(router.areStatesEqual(s1, s2, true)).toBe(false);
  });

  it("returns true for different params with ignore query params", () => {
    const s1 = getPluginApi(router).makeState(
      "home",
      { id: 1 },
      undefined,
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "home",
      { id: 2 },
      undefined,
      "/home",
    );

    // `id` is query param
    expect(router.areStatesEqual(s1, s2)).toBe(true);
  });

  it("returns true for different params without ignore query params", () => {
    const s1 = getPluginApi(router).makeState(
      "items",
      { id: 1 },
      undefined,
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "items",
      { id: 2 },
      undefined,
      "/home",
    );

    expect(router.areStatesEqual(s1, s2, false)).toBe(false);
  });

  it("compares query params when ignoreQueryParams is false", () => {
    const s1 = getPluginApi(router).makeState(
      "home",
      { foo: "bar", q: "1" },
      undefined,
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "home",
      { foo: "bar", q: "1" },
      undefined,
      "/home",
    );

    expect(router.areStatesEqual(s1, s2, false)).toBe(true);
  });

  it("should return true when both states are undefined", () => {
    expect(router.areStatesEqual(undefined, undefined)).toBe(true);
  });

  it("should use cached urlParams on second call (line 118 cache hit)", () => {
    // First call computes and caches urlParams for "home"
    const s1 = getPluginApi(router).makeState(
      "home",
      { id: 1 },
      undefined,
      "/home",
    );
    const s2 = getPluginApi(router).makeState(
      "home",
      { id: 1 },
      undefined,
      "/home",
    );

    expect(router.areStatesEqual(s1, s2, true)).toBe(true);

    // Second call uses cached urlParams (line 118 returns early)
    const s3 = getPluginApi(router).makeState(
      "home",
      { id: 2 },
      undefined,
      "/home",
    );
    const s4 = getPluginApi(router).makeState(
      "home",
      { id: 2 },
      undefined,
      "/home",
    );

    expect(router.areStatesEqual(s3, s4, true)).toBe(true);
  });

  it("should return false when one state is undefined", () => {
    const state = getPluginApi(router).makeState(
      "home",
      {},
      undefined,
      "/home",
    );

    expect(router.areStatesEqual(state, undefined)).toBe(false);
    expect(router.areStatesEqual(undefined, state)).toBe(false);
  });

  it("should handle non-existent route names with ignoreQueryParams (line 28)", () => {
    // getSegmentsByName returns null for non-existent routes
    // The ?? [] fallback should handle this case
    const s1 = getPluginApi(router).makeState(
      "nonexistent.route",
      { id: 1 },
      undefined,
      "/nonexistent",
    );
    const s2 = getPluginApi(router).makeState(
      "nonexistent.route",
      { id: 1 },
      undefined,
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
      undefined,
      "/unknown",
    );
    const s2 = getPluginApi(router).makeState(
      "unknown.route",
      { x: 2 },
      undefined,
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
      const validState = getPluginApi(router).makeState(
        "home",
        {},
        undefined,
        "/home",
      );

      // null/undefined are valid inputs (represent "no state")
      // Using 'as never' to test runtime behavior with null values
      expect(() =>
        router.areStatesEqual(null as never, null as never),
      ).not.toThrow();
      expect(() => router.areStatesEqual(undefined, undefined)).not.toThrow();
      expect(() =>
        router.areStatesEqual(validState, null as never),
      ).not.toThrow();
      expect(() =>
        router.areStatesEqual(null as never, validState),
      ).not.toThrow();
    });
  });

  describe("edge cases - issue #515 (different keys with same length)", () => {
    it("returns false when params have different keys (undefined value case)", () => {
      // Original router5 bug: {a: 1, b: undefined} vs {a: 1, c: 2}
      // Same length but different keys - should be false
      const s1 = getPluginApi(router).makeState(
        "home",
        { a: 1, b: undefined } as never,
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { a: 1, c: 2 } as never,
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns false when state1 has key that state2 lacks", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { x: 1, y: 2 },
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { x: 1, z: 2 },
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns true when both have same keys with undefined values", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { a: 1, b: undefined } as never,
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { a: 1, b: undefined } as never,
        undefined,
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
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { tags: ["a", "b", "c"] },
        undefined,
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
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2] },
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns false for different array content", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2, 3] },
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { ids: [1, 2, 4] },
        undefined,
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
        undefined,
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
        undefined,
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
        undefined,
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
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("returns false when comparing array to non-array", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { data: [1, 2, 3] },
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { data: "1,2,3" },
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("handles empty arrays correctly", () => {
      const s1 = getPluginApi(router).makeState(
        "home",
        { items: [] },
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { items: [] },
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });

    it("returns true for same array reference", () => {
      const sharedArray = ["x", "y"];
      const s1 = getPluginApi(router).makeState(
        "home",
        { tags: sharedArray },
        undefined,
        "/home",
      );
      const s2 = getPluginApi(router).makeState(
        "home",
        { tags: sharedArray },
        undefined,
        "/home",
      );

      expect(router.areStatesEqual(s1, s2, false)).toBe(true);
    });
  });

  describe("inherited keys are not input (#1815)", () => {
    /**
     * A bag whose OWN keys are disjoint from the other side's, while its
     * prototype carries a twin of every one of them. Own enumerable properties
     * are the only supported input, so these two states share nothing.
     */
    const layer = (
      inherited: Record<string, string>,
      own: Record<string, string>,
    ): Record<string, string> =>
      Object.assign(Object.create(inherited) as Record<string, string>, own);

    /**
     * ⚑ The PRECONDITION every whole-bag cell below rests on, asserted rather
     * than assumed. `recordsShallowEqual` compares own-enumerable key COUNTS
     * first, so a twin-carrying bag needs a filler key to restore the count —
     * without it the length gate answers `false` before the membership test
     * runs, and `false` is what these cells expect. They would then pass on a
     * full revert of the fix, at an unchanged test count and unchanged
     * coverage, which no cell here could detect.
     *
     * Same reason `prototype-chain-reads-1798.test.ts` carries its own control:
     * "without this, every empty-bag cell above is one refactor from vacuous".
     */
    const bothDecideOnMembership = (
      left: Record<string, unknown>,
      right: Record<string, unknown>,
    ): void => {
      const leftKeys = Object.keys(left);
      const rightKeys = Object.keys(right);

      expect(leftKeys).toHaveLength(rightKeys.length);
      expect(leftKeys.length).toBeGreaterThan(0);
      // Disjoint — otherwise the values would decide and the ownership rule
      // would never be asked.
      expect(leftKeys.filter((key) => rightKeys.includes(key))).toStrictEqual(
        [],
      );
    };

    it("does not accept an inherited twin on the params channel", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("home", { ghost: "yes" }, undefined, "/home");
      const s2 = {
        ...api.makeState("home", { other: "1" }, undefined, "/home"),
        params: layer({ ghost: "yes" }, { other: "1" }),
      };

      bothDecideOnMembership(s1.params, s2.params);

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("does not accept an inherited twin on the search channel", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("home", {}, { ghost: "yes" }, "/home");
      const s2 = {
        ...api.makeState("home", {}, { other: "1" }, "/home"),
        search: layer({ ghost: "yes" }, { other: "1" }),
      };

      // ⚑ And this cell rests on a SECOND precondition: `home` declares no
      // query names, so the key only reaches `state.search` under the default
      // `queryParamsMode: "loose"`. Under `default` / `strict` the mode gate
      // drops it, `s1.search` empties, and the cell collapses into the length
      // gate — green against a revert, again undetectably.
      expect(Object.keys(s1.search)).toStrictEqual(["ghost"]);

      bothDecideOnMembership(s1.search, s2.search);

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("answers the same for a pair and for its reverse", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("home", { ghost: "yes" }, undefined, "/home");
      const s2 = {
        ...api.makeState("home", { other: "1" }, undefined, "/home"),
        params: layer({ ghost: "yes" }, { other: "1" }),
      };

      bothDecideOnMembership(s1.params, s2.params);

      // Equality is symmetric. The chain walk made it asymmetric: the loop runs
      // over the LEFT bag's own keys, so which side carried the prototype
      // decided the answer. ⚠ The comparison alone is satisfied by two `false`s,
      // so the answer is anchored as well — otherwise a predicate that refuses
      // everything passes this cell.
      expect(router.areStatesEqual(s1, s2, false)).toBe(
        router.areStatesEqual(s2, s1, false),
      );
      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    /**
     * The `ignoreQueryParams` arm is a SECOND site of the same rule, asked
     * through `slotsShallowEqual` — the whole-bag reader restricted to the
     * route's slots. It is the DEFAULT arity, and the one `isActiveRoute` asks.
     */
    it("does not accept an inherited twin in a declared slot", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("items", { id: "1" }, undefined, "/items/1");
      const s2 = {
        ...api.makeState("items", { id: "1" }, undefined, "/items/1"),
        params: layer({ id: "1" }, {}),
      };

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });

    it("CONTROL: a declared slot present on one side only is unequal", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("items", { id: "1" }, undefined, "/items/1");
      const s2 = {
        ...api.makeState("items", { id: "1" }, undefined, "/items/1"),
        params: {},
      };

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });

    it("CONTROL: two own declared slots with the same value are equal", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("items", { id: "1" }, undefined, "/items/1");
      const s2 = api.makeState("items", { id: "1" }, undefined, "/items/1");

      expect(router.areStatesEqual(s1, s2)).toBe(true);
    });

    /**
     * The rule is own AND ENUMERABLE, so `Object.hasOwn` is one notch too weak:
     * it answers `true` for a concealed key while the `Object.keys` count that
     * gates the loop does not, and the two disagree again — on a smaller set.
     */
    const conceal = (
      visible: Record<string, string>,
      concealed: Record<string, string>,
    ): Record<string, string> => {
      const bag: Record<string, string> = { ...visible };

      for (const [key, value] of Object.entries(concealed)) {
        Object.defineProperty(bag, key, { value, enumerable: false });
      }

      return bag;
    };

    it("does not accept a concealed twin on the params channel", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("home", { ghost: "yes" }, undefined, "/home");
      const s2 = {
        ...api.makeState("home", { other: "1" }, undefined, "/home"),
        // One enumerable key on each side, so the count gate passes and the
        // membership test alone decides.
        params: conceal({ other: "1" }, { ghost: "yes" }),
      };

      bothDecideOnMembership(s1.params, s2.params);

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("does not accept a concealed twin in a declared slot", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("items", { id: "1" }, undefined, "/items/1");
      const s2 = {
        ...api.makeState("items", { id: "1" }, undefined, "/items/1"),
        params: conceal({}, { id: "1" }),
      };

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });

    /**
     * The shape that decides WHICH ownership question is asked, and the reason
     * neither `hasOwn` nor `propertyIsEnumerable` is it: both let the CALLER
     * pick the key and put it to `[[GetOwnProperty]]`, which on a Proxy is the
     * `getOwnPropertyDescriptor` trap — free to vouch for a key `ownKeys` never
     * listed. `Object.keys` asks `ownKeys` first, so membership must be decided
     * by the list it returned. Same argument as #1854, same bag: Svelte 5's
     * `$props()` reports own-ness for a key only its prototype has (#1853).
     */
    const lyingBag = (
      inherited: Record<string, string>,
      own: Record<string, string>,
    ): Record<string, string> =>
      new Proxy(Object.assign(Object.create(inherited), own), {
        getOwnPropertyDescriptor: (
          target,
          key,
        ): PropertyDescriptor | undefined =>
          typeof key === "string" && key in inherited
            ? { value: inherited[key], enumerable: true, configurable: true }
            : Reflect.getOwnPropertyDescriptor(target, key),
      }) as Record<string, string>;

    it("does not accept a descriptor trap that outvotes ownKeys", () => {
      const api = getPluginApi(router);
      const bag = lyingBag({ ghost: "yes" }, { other: "1" });

      // The trap and the key list disagree — which is the whole point.
      expect(Object.keys(bag)).toStrictEqual(["other"]);
      expect(Object.prototype.propertyIsEnumerable.call(bag, "ghost")).toBe(
        true,
      );

      const s1 = api.makeState("home", { ghost: "yes" }, undefined, "/home");
      const s2 = {
        ...api.makeState("home", { other: "1" }, undefined, "/home"),
        params: bag,
      };

      bothDecideOnMembership(s1.params, s2.params);

      expect(router.areStatesEqual(s1, s2, false)).toBe(false);
    });

    it("does not accept a descriptor trap in a declared slot", () => {
      const api = getPluginApi(router);
      const s1 = api.makeState("items", { id: "1" }, undefined, "/items/1");
      const s2 = {
        ...api.makeState("items", { id: "1" }, undefined, "/items/1"),
        params: lyingBag({ id: "1" }, {}),
      };

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });

    /**
     * ⚠ A route with no declared slot must not touch `params` at all. Invariant
     * #1 says `areStatesEqual(s, s)` is `true` for ANY state, and the type
     * permits a hand-built one without `params` — so reading the bag to say
     * "nothing to compare" turns that answer into a `TypeError`.
     */
    it("answers without reading params when the route declares no slot", () => {
      const bare = { name: "home", path: "/home" } as unknown as State;

      expect(router.areStatesEqual(bare, bare)).toBe(true);
      expect(
        router.areStatesEqual(
          bare,
          getPluginApi(router).makeState("home", {}, undefined, "/home"),
        ),
      ).toBe(true);
    });

    /**
     * ⚑ The exotic bag on the LEFT. Every cell above puts it on the right, so a
     * revert of just the left-hand read leaves them all green — the declared-slot
     * arm has no reverse-order cell the way the whole-bag arm does.
     */
    it("gates the LEFT bag too, in a declared slot", () => {
      const api = getPluginApi(router);
      const s1 = {
        ...api.makeState("items", { id: "1" }, undefined, "/items/1"),
        params: layer({ id: "1" }, {}),
      };
      const s2 = api.makeState("items", { id: "1" }, undefined, "/items/1");

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    });
  });
});
