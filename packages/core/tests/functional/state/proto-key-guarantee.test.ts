import { describe, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Params, Router, SearchParams } from "@real-router/core";

/**
 * The guarantee about `__proto__` lives at the COPY SITES (#1792).
 *
 * `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members, so `target[key] = value` for that one name reaches the inherited
 * setter: no own key appears, the value is gone with no error and no log, and an
 * OBJECT value replaces the target's prototype instead.
 *
 * ⚑ Every cell here drives a PUBLIC entry point and asserts on the COMMITTED
 * state, never on a helper. That is the point: the guarantee is that no bag the
 * router does not own can put this key into `state`, whatever the caller does
 * between the router reading it and the router copying it. An earlier design put
 * the check at the entry points instead and could not hold that line — a value
 * read once at the door can differ from the value copied later, and three of the
 * cells below (the seam, the live default, the committed shell) are exactly the
 * shapes that defeated it.
 *
 * ⚠ The hostile bag is built with `JSON.parse`, never a source literal:
 * `{ __proto__: v }` in source sets the PROTOTYPE and creates no own key, so a
 * literal cannot express this input at all.
 */
describe("the __proto__ guarantee is held by the copy sites (#1792)", () => {
  let router: Router;

  afterEach(() => {
    router.dispose();
  });

  const hostile = (): SearchParams =>
    JSON.parse('{"a":"1","__proto__":"V"}') as SearchParams;

  const mk = (): Router =>
    createRouter([
      { name: "h", path: "/h" },
      { name: "q", path: "/q?a&__proto__" },
      { name: "p", path: "/p/:id" },
    ]);

  /** Both halves of "the key is not here": no own entry, and no swapped prototype. */
  const assertClean = (bag: object, where: string): void => {
    expect(
      Object.getOwnPropertyNames(bag),
      `own keys of ${where}`,
    ).not.toContain("__proto__");
    expect(
      Object.getPrototypeOf(bag) === Object.prototype,
      `prototype of ${where} is untouched`,
    ).toBe(true);
  };

  describe("a bag the router does not own", () => {
    it("cannot put the key in either channel of the committed state", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, hostile());

      const committed = router.getState()!;

      assertClean(committed.search, "state.search");

      expect(Object.getOwnPropertyNames(committed.search)).toStrictEqual(["a"]);

      await router.navigate(
        "p",
        JSON.parse('{"id":"7","__proto__":"V"}') as Params,
      );

      assertClean(router.getState()!.params, "state.params");

      expect(
        Object.getOwnPropertyNames(router.getState()!.params),
      ).toStrictEqual(["id"]);
    });

    it("cannot put it there by changing between the router's two reads", async () => {
      // ⚑ THE cell the previous design failed. `forwardState` is interceptable,
      // so a plugin may hand back a bag backed by an accessor: clean on the read
      // that any door-side check would perform, hostile on the read the pipeline
      // performs afterwards. A check at the door vouches for a value that never
      // ships. A copy site cannot be walked this way — it answers on the read it
      // actually copies from.
      router = mk();

      await router.start("/h");

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          const result = next(name, params, search);

          if (name !== "q") {
            return result;
          }

          let reads = 0;
          const flipping: Record<string, unknown> = { a: "1" };

          Object.defineProperty(flipping, "__proto__", {
            enumerable: true,
            configurable: true,
            get: () => (++reads <= 1 ? undefined : "V"),
          });

          return { ...result, search: flipping as SearchParams };
        },
      );

      await router.navigate("q", {}, { a: "1" });

      assertClean(router.getState()!.search, "state.search");
    });

    it("cannot put it there through a route default it still holds a reference to", async () => {
      // The store keeps the caller's own defaults object and re-reads it on every
      // navigation, so a check at registration time is a snapshot of a value the
      // caller can still change. `Object.keys` stays innocent here — the damage a
      // swapped prototype does is invisible to it, which is why `assertClean`
      // asserts the prototype separately.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "x", path: "/x?a", defaultSearch: { a: "1" } },
      ]);

      await router.start("/h");

      const live = getRoutesApi(router).get("x")!.defaultSearch as Record<
        string,
        unknown
      >;

      Object.defineProperty(live, "__proto__", {
        value: { pwned: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      await router.navigate("x", {}, { b: "2" });

      const committed = router.getState()!.search;

      assertClean(committed, "state.search");

      expect(
        (committed as Record<string, unknown>).pwned,
        "a swapped prototype would make this readable",
      ).toBeUndefined();
    });
  });

  describe("an OBJECT value, which is the half that actually corrupts", () => {
    // ⚠ A hostile bag whose `__proto__` holds a STRING cannot discriminate these
    // sites at all: plain assignment for that name reaches the inherited setter,
    // which IGNORES a primitive, so skipping and not skipping produce identical
    // output. Only an object value swaps the target's prototype. Three copy
    // sites looked unpinned until the value was changed here — the cells, not
    // the code, were at fault.
    const withObject = (): Record<string, unknown> => {
      const bag: Record<string, unknown> = { keep: "yes" };

      Object.defineProperty(bag, "__proto__", {
        value: { pwned: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      return bag;
    };

    it("cannot swap the prototype of state.params", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("p", {
        ...withObject(),
        id: "7",
      } as never);

      const committed = router.getState()!.params;

      assertClean(committed, "state.params");

      expect(
        (committed as Record<string, unknown>).pwned,
        "a swapped prototype would make this readable",
      ).toBeUndefined();
    });

    it("cannot swap it through a caller bag merged UNDER a route default", async () => {
      // The route having its own default takes a different branch of the merge
      // than the default-less one every other cell exercises.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "w", path: "/w?keep&other", defaultSearch: { other: "d" } },
      ]);

      await router.start("/h");
      await router.navigate("w", {}, withObject() as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search merged under a default");

      expect(
        (committed as Record<string, unknown>).pwned,
        "a swapped prototype would make this readable",
      ).toBeUndefined();
      expect(
        Object.getOwnPropertyNames(committed).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "the honest keys survive the merge",
      ).toStrictEqual(["keep", "other"]);
    });

    it("cannot swap it through navigateToState's params channel", async () => {
      router = mk();

      await router.start("/h");

      await getPluginApi(router).navigateToState({
        name: "p",
        params: { ...withObject(), id: "7" },
        search: {},
        path: "/p/7",
      } as never);

      const committed = router.getState()!.params;

      assertClean(committed, "state.params from navigateToState");

      expect(
        (committed as Record<string, unknown>).pwned,
        "a swapped prototype would make this readable",
      ).toBeUndefined();
    });
  });

  describe("the committed state is core's own object", () => {
    it("navigateToState copies and freezes, so a later mutation cannot reach it", async () => {
      // The argument is a State a PLUGIN built. Carrying its bags by reference
      // left the committed `state.search` writable through a reference the plugin
      // still held.
      router = mk();

      await router.start("/h");

      const held: Record<string, unknown> = { a: "1" };

      await getPluginApi(router).navigateToState({
        name: "q",
        params: {},
        search: held as SearchParams,
        path: "/q?a=1",
      } as never);

      const committed = router.getState()!.search;

      expect(committed, "committed search is not the caller's object").not.toBe(
        held,
      );
      expect(Object.isFrozen(committed), "committed search is frozen").toBe(
        true,
      );

      Object.defineProperty(held, "__proto__", {
        value: "V",
        enumerable: true,
        writable: true,
        configurable: true,
      });

      assertClean(router.getState()!.search, "state.search after the mutation");
    });

    it("navigateToState cleans a bag that is hostile at the moment of the call", async () => {
      router = mk();

      await router.start("/h");

      await getPluginApi(router).navigateToState({
        name: "q",
        params: {},
        search: hostile(),
        path: "/q?a=1",
      } as never);

      assertClean(router.getState()!.search, "state.search");
    });
  });

  describe("a URL", () => {
    it("never carries the key into the state, and never throws for it", async () => {
      router = mk();

      await router.start("/h");

      const matched = getPluginApi(router).matchPath("/q?a=1&__proto__=V");

      expect(matched, "a URL carrying the key still matches").toBeDefined();

      assertClean(matched!.search, "matchPath().search");

      expect(Object.getOwnPropertyNames(matched!.search)).toStrictEqual(["a"]);
    });

    it("is cleaned even when the route DECLARES the name as a query slot", async () => {
      // The mode gate admits a key the route declares — this one is refused
      // there regardless, because the gate's own `admitted[key] = value` would
      // swap the accumulator's prototype rather than add an entry.
      router = createRouter(
        [
          { name: "h", path: "/h" },
          { name: "d", path: "/d?a&__proto__" },
        ],
        { queryParamsMode: "default" },
      );

      await router.start("/h");

      const matched = getPluginApi(router).matchPath("/d?a=1&__proto__=V");

      assertClean(matched!.search, "matchPath().search on a declaring route");

      expect(Object.getOwnPropertyNames(matched!.search)).toStrictEqual(["a"]);
    });
  });

  describe("the seam reads each slot once", () => {
    it("cannot check one route's declarations and commit another route", async () => {
      // ⚑ Not about `__proto__` — about the shape that defeated the previous
      // design. The seam reads `name` to pick the declarations it validates
      // against, and reads it again for the object it returns. Two reads let an
      // interceptor answer one route for the check and another for the commit.
      // The observable is `state.name` itself, so the cell cannot be masked by
      // anything downstream.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "c", path: "/c" },
        { name: "other", path: "/other" },
      ]);

      await router.start("/h");

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          const result = next(name, params, search);

          if (name !== "c") {
            return result;
          }

          let reads = 0;

          return {
            ...result,
            get name(): string {
              return ++reads <= 1 ? "c" : "other";
            },
          };
        },
      );

      await router.navigate("c").catch(() => undefined);

      expect(
        router.getState()!.name,
        "the committed route is the one the seam resolved and checked",
      ).toBe("c");
    });
  });

  describe("controls", () => {
    it("CONTROL — the other eleven inherited names travel normally", async () => {
      // If this reds, the rule stopped being about `__proto__` and became a ban
      // on prototype member names, which is a different and wrong contract.
      const names = [
        "constructor",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toLocaleString",
        "toString",
        "valueOf",
        "__defineGetter__",
        "__defineSetter__",
        "__lookupGetter__",
        "__lookupSetter__",
      ];

      router = createRouter([
        { name: "h", path: "/h" },
        { name: "m", path: `/m?${names.join("&")}` },
      ]);

      await router.start("/h");

      const bag = Object.fromEntries(
        names.map((n) => [n, "v"]),
      ) as SearchParams;

      await router.navigate("m", {}, bag);

      expect(
        Object.getOwnPropertyNames(router.getState()!.search).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "all eleven survive",
      ).toStrictEqual([...names].toSorted((a, b) => a.localeCompare(b)));
    });

    it("CONTROL — an ordinary key beside it is untouched", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, hostile());

      expect(
        (router.getState()!.search as Record<string, unknown>).a,
        "the sibling key keeps its value",
      ).toBe("1");
    });
  });
});
