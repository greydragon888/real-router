import { describe, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Params, Router, SearchParams, State } from "@real-router/core";

/**
 * The `__proto__` guarantee is held by the COPY SITES (#1792).
 *
 * `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members, so `target[key] = value` for that one name reaches the inherited
 * setter: no own key appears, the value is gone with no error and no log, and an
 * OBJECT value replaces the target's prototype instead.
 *
 * ⚑ Every cell drives a public or plugin-API entry point. Where a cell asserts
 * on a return value rather than on `getState()` it says so — `matchPath` commits
 * nothing, and pretending otherwise was a false claim in an earlier revision.
 *
 * ⚠ **Two payload rules, both bought with a defect.** The hostile value must be
 * an OBJECT: plain assignment for this name reaches the inherited setter, which
 * IGNORES a primitive, so a string-valued bag cannot tell a working skip from a
 * missing one — three sites looked pinned under a string and were not. And the
 * key must come FIRST: with it last, replacing a loop's `continue` with `break`
 * changes nothing observable, so the over-run class stays invisible.
 *
 * ⚠ The bag is built with `JSON.parse` or `Object.defineProperty`. A shorthand
 * source literal `{ __proto__: v }` sets the PROTOTYPE and creates no own key,
 * so it cannot express this input — though a COMPUTED-key literal
 * (`{ ["__proto__"]: v }`) can, and does.
 */
describe("the __proto__ guarantee is held by the copy sites (#1792)", () => {
  let router: Router;

  afterEach(() => {
    router.dispose();
  });

  /** Own, enumerable, OBJECT-valued, and FIRST — see the payload rules above. */
  const hostile = (): Record<string, unknown> =>
    JSON.parse(
      '{"__proto__":{"pwned":true},"keep":"yes","tail":"t"}',
    ) as Record<string, unknown>;

  const mk = (): Router =>
    createRouter([
      { name: "h", path: "/h" },
      { name: "q", path: "/q?keep&tail" },
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
    expect(
      (bag as Record<string, unknown>).pwned,
      `a swapped prototype would make this readable on ${where}`,
    ).toBeUndefined();
  };

  describe("an ordinary bag — the case the rule exists for", () => {
    it("cannot reach state.search, and the keys after it still survive", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, hostile() as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search");

      expect(
        Object.getOwnPropertyNames(committed).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "the keys AFTER the hostile one are still copied",
      ).toStrictEqual(["keep", "tail"]);
    });

    it("cannot reach state.params either", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("p", {
        ...hostile(),
        id: "7",
      } as unknown as Params);

      const committed = router.getState()!.params;

      assertClean(committed, "state.params");

      expect(Object.getOwnPropertyNames(committed)).toContain("id");
    });

    it("cannot reach it when merged UNDER a route default", async () => {
      // A route with its own default takes a different branch of the merge than
      // the default-less one the cells above exercise.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "w", path: "/w?keep&other", defaultSearch: { other: "d" } },
      ]);

      await router.start("/h");
      await router.navigate("w", {}, hostile() as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search merged under a default");

      expect(
        Object.getOwnPropertyNames(committed).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "the honest keys survive the merge",
      ).toStrictEqual(["keep", "other", "tail"]);
    });

    it("cannot reach it through a route default the caller still holds", async () => {
      // The store keeps the caller's own defaults object and re-reads it on every
      // navigation, so a check at registration time is a snapshot of a value the
      // caller can still change. No accessor is needed — a plain write suffices.
      //
      // ⚠ The sibling key is DECLARED on purpose. With an undeclared one the mode
      // gate arms under `default` / `strict`, and its fresh accumulator launders
      // a swapped prototype away — the cell would then pass on broken code in two
      // of the three modes.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "x", path: "/x?keep&other", defaultSearch: { keep: "1" } },
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

      await router.navigate("x", {}, { other: "2" });

      assertClean(router.getState()!.search, "state.search");
    });

    it("is dropped from a URL, which never throws for it", async () => {
      // Asserts on `matchPath`'s RETURN — this door commits nothing.
      router = mk();

      await router.start("/h");

      const matched = getPluginApi(router).matchPath(
        "/q?__proto__=V&keep=yes&tail=t",
      );

      expect(matched, "a URL carrying the key still matches").toBeDefined();

      assertClean(matched!.search, "matchPath().search");

      expect(
        Object.getOwnPropertyNames(matched!.search).toSorted((a, b) =>
          a.localeCompare(b),
        ),
      ).toStrictEqual(["keep", "tail"]);
    });

    it("does not survive an undefined-valued sibling forcing the strip copy", async () => {
      // The `undefined` strip and the key skip share a walk; a trailing
      // `undefined` key is what makes over-running that walk observable.
      const bag = hostile();

      bag.gone = undefined;

      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, bag as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search");

      expect(
        Object.getOwnPropertyNames(committed),
        "the undefined-valued key is stripped, the honest ones are not",
      ).not.toContain("gone");
    });
  });

  describe("a bag that changes while the router reads it", () => {
    it("still cannot reach state, because each copy names the key unconditionally", async () => {
      // ⚑ Not promised by the contract (see `UNSAFE_KEY` in `constants.ts`) — it
      // holds because no guard carries a reachability argument. An earlier
      // revision omitted the guard on one copy, reasoning that an upstream walk
      // had already removed the key; a getter on a sibling defines `__proto__` on
      // its own object mid-walk, after that walk has passed the point and before
      // the copy runs, and the key shipped into `state.search`.
      const late: Record<string, unknown> = {};

      Object.defineProperty(late, "keep", {
        enumerable: true,
        configurable: true,
        get: () => {
          if (!Object.hasOwn(late, "__proto__")) {
            Object.defineProperty(late, "__proto__", {
              value: { pwned: true },
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }

          return "yes";
        },
      });

      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, late as SearchParams);

      assertClean(router.getState()!.search, "state.search");
    });

    it("rejects rather than throwing when its accessor throws", async () => {
      // The copies read every value, and this door's contract is to REJECT: URL
      // plugins call it from popstate handlers, and `memory-plugin`'s `go()`
      // attaches only `.catch()`, so a synchronous throw escapes into
      // `router.back()`.
      const throwing: Record<string, unknown> = {};

      Object.defineProperty(throwing, "keep", {
        enumerable: true,
        get: () => {
          throw new Error("BOOM");
        },
      });

      router = mk();

      await router.start("/h");

      let threwSynchronously = false;
      let rejected = false;

      try {
        await getPluginApi(router)
          .navigateToState({
            name: "q",
            params: {},
            search: throwing as SearchParams,
            path: "/q",
          } as never)
          .catch(() => {
            rejected = true;
          });
      } catch {
        threwSynchronously = true;
      }

      expect(threwSynchronously, "must not throw synchronously").toBe(false);
      expect(rejected, "must reject so `.catch()` sees it").toBe(true);
    });
  });

  describe("every door that COMMITS a state builds its own copy", () => {
    it("navigateToState: not the caller's object, frozen, immune to later mutation", async () => {
      router = mk();

      await router.start("/h");

      const held: Record<string, unknown> = { keep: "yes" };

      await getPluginApi(router).navigateToState({
        name: "q",
        params: {},
        search: held as SearchParams,
        path: "/q?keep=yes",
      } as never);

      const committed = router.getState()!.search;

      expect(committed, "committed search is not the caller's object").not.toBe(
        held,
      );
      expect(Object.isFrozen(committed), "committed search is frozen").toBe(
        true,
      );

      Object.defineProperty(held, "__proto__", {
        value: { pwned: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      assertClean(router.getState()!.search, "state.search after the mutation");
    });

    it("navigateToState: cleans the PARAMS channel too, not only search", async () => {
      // Every other cell on this door passes `params: {}`, which cannot tell a
      // working copy from a missing one.
      router = mk();

      await router.start("/h");

      await getPluginApi(router).navigateToState({
        name: "p",
        params: { ...hostile(), id: "7" } as unknown as Params,
        search: {},
        path: "/p/7",
      } as never);

      const committed = router.getState()!.params;

      assertClean(committed, "state.params from navigateToState");

      expect(Object.getOwnPropertyNames(committed)).toContain("id");
    });

    it("navigateToState: cleans a bag hostile at the moment of the call", async () => {
      router = mk();

      await router.start("/h");

      await getPluginApi(router).navigateToState({
        name: "q",
        params: {},
        search: hostile() as SearchParams,
        path: "/q?keep=yes",
      } as never);

      assertClean(router.getState()!.search, "state.search");
    });

    it("systemCommit: the fourth door, reached through the published internals", async () => {
      // `getInternals` is exported from `@real-router/core/validation` and three
      // first-party packages use it, so this door takes a State someone else
      // built — and the FSM commits by freezing the SHELL only.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        {
          keep: "yes",
        },
      ) as unknown as State;
      const bag = hostile();

      getInternals(router).systemCommit(
        { ...base, search: bag as SearchParams },
        router.getState(),
        {},
      );

      const committed = router.getState()!.search;

      assertClean(committed, "state.search after systemCommit");

      expect(committed, "not the caller's object").not.toBe(bag);
      expect(Object.isFrozen(committed), "frozen").toBe(true);
    });
  });

  describe("the seam reads the slots it checks", () => {
    it("cannot check one route's declarations and commit another route", async () => {
      // Not about `__proto__` — about the shape the copy sites cannot fix. The
      // seam reads `name` to pick the declarations it validates against, and
      // reads it again for the object it returns. `state.name` is the observable,
      // so nothing downstream can mask it.
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
  });
});
