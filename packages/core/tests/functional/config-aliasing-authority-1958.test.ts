// Core ADOPTS the route-config bags on the way IN, and every record says so.
//
// The model, measured rather than asserted (#1958 → #2145 → #2172):
//
//   A read-side door hands back a FRESH shell built by core, and one level down
//   the CHANNEL BAGS are core's own frozen copies — taken once, at registration
//   or at `update`, from the object the caller registered. A write there throws
//   instead of corrupting router config and the caller's literal at the same
//   time, which is what it did until #2172.
//
// ⚠ THE MODEL HAS EXACTLY THREE EXCEPTIONS, and each is pinned below:
//   • FUNCTIONS pass through by identity — `canActivate`, `forwardTo`. A function
//     is called, not enumerated; there is nothing to copy and no write to catch.
//   • `encodeParams` / `decodeParams` are WRAPPED at registration, so a door
//     hands back core's closure and not the caller's function — except
//     `update`'s `patch`, which is assembled from the patch rather than from the
//     store and therefore hands back the raw one.
//   • custom fields are absent from `get()` entirely; `getRouteConfig` is the
//     only door that carries them, and that record is FROZEN rather than copied
//     (#2172) — core mints it, so there is no caller object to avoid freezing,
//     and the door is hot enough that a copy per call would not be free.
//
// ⚠ WHAT #2172 DID NOT CHANGE. The copy is one level. Custom-field VALUES stay
// the caller's arbitrary application data — schemas, factories, class instances
// — because plugins key caches on their identity. `packages/core/CLAUDE.md`
// ("Immutability is shallow") still records the reasons no deeper: no
// deep-freeze, because that would freeze the caller's own input; no deep-clone,
// because config carries circular references and class instances.
//
// ⚠ WHAT THIS GUARD DELIBERATELY DOES NOT ASSERT. An earlier revision had a cell
// claiming `route.path = …` is inert *because* the shell is a copy. The
// conclusion is true and the causation is false — the matcher compiles from the
// frozen `RouteTree` and `store.definitions` is regenerated per read, so NO
// `Route.path` write anywhere is observable through `buildPath`. That cell could
// not be reded by any mutation of the door it named; it only tracked `buildPath`
// itself. A cell that cannot fail for its own stated reason is worse than no
// cell, because it reads as coverage.
//
// ⚠ "route still in the table" decides WHEN a write would have landed, never
// whose object it is. The first revision encoded it as a `store` vs `caller`
// dichotomy, and every cell of that half compared a route's config against
// ANOTHER route's bag — a stable `false` that passed for a measurement. The
// `live` / `gone` column below is the real distinction; since #2172 both
// polarities refuse the write, and the column pins that they refuse it alike.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Params, ParamsSearch, RoutesApi } from "@real-router/core/types";

const TREE_CHANGED_SOURCE = readFileSync(
  path.resolve(__dirname, "../../src/types/tree-changed.ts"),
  "utf8",
);

const PATH_BAG = { id: "1" };
const SEARCH_BAG = { tab: "one" };
const CHILD_BAG = { ckp: "K" };
const ENCODER = (channels: ParamsSearch): ParamsSearch => channels;
const GUARD = () => () => true;

const build = () =>
  createRouter([
    {
      children: [
        { defaultParams: CHILD_BAG, name: "kid", path: "/kid/:ckp" },
        { defaultParams: { oid: "9" }, name: "other", path: "/other/:oid" },
      ],
      defaultParams: PATH_BAG,
      defaultSearch: SEARCH_BAG,
      canActivate: GUARD,
      encodeParams: ENCODER,
      myField: { deep: 1 },
      name: "user",
      path: "/users/:id?tab",
    },
  ]);

describe("route-config aliasing authority (#1958)", () => {
  describe("the model: one level of copying", () => {
    /**
     * Each row names the slot and what identity the door must report. The
     * negative row is not decoration: it is what proves the positive rows are
     * measuring identity rather than always answering `true`.
     */
    const SLOTS = [
      // Bags: adopted, so NOT the caller's object.
      { bag: PATH_BAG, name: "defaultParams", passThrough: false },
      { bag: SEARCH_BAG, name: "defaultSearch", passThrough: false },
      // A function: passed through, because a function is called rather than
      // enumerated. This row is what keeps the table a measurement — without it
      // every row reads `false` and a door that returned `undefined` for
      // everything would pass.
      { bag: GUARD, name: "canActivate", passThrough: true },
      // A function core WRAPS: neither adopted nor passed through.
      { bag: ENCODER, name: "encodeParams", passThrough: false },
    ] as const;

    it("carries the adopted slots, the pass-through one and the wrapped one", () => {
      // Counted outside the `each` (`table-vacuity-authority`), and asserted to
      // contain BOTH polarities — a table that lost its `false` row would still
      // register cells and still pass.
      expect(SLOTS).toHaveLength(4);
      expect(SLOTS.some(({ passThrough }) => passThrough)).toBe(true);
      expect(SLOTS.some(({ passThrough }) => !passThrough)).toBe(true);
    });

    it.each(SLOTS)(
      "get().$name is the caller's own object: $passThrough",
      ({ bag, name, passThrough }) => {
        const route = getRoutesApi(build()).get("user") as unknown as Record<
          string,
          unknown
        >;

        expect(route[name] === bag).toBe(passThrough);
      },
    );

    it("hands back a fresh shell on every call", () => {
      const api = getRoutesApi(build());

      expect(api.get("user")).not.toBe(api.get("user"));
    });

    it("a write one level down THROWS, and reaches neither channel", () => {
      // ⚑ The inverse of what this cell pinned until #2172, kept in that form so
      // the retirement cannot revert unnoticed. It used to assert
      // `/users/HACKED?tab=PWNED` — the write reached the URL — and that the
      // caller's own literals carried the same mutation, because they were one
      // object.
      //
      // ⚠ THROWS rather than silently missing, and that is the deliberate half.
      // A copy left writable would swallow the write instead, which is the class
      // of defect this whole wave is about: a write that looks like it worked.
      const router = build();
      const route = getRoutesApi(router).get("user")!;

      expect(() => {
        route.defaultParams!.id = "HACKED";
      }).toThrow(TypeError);
      expect(() => {
        route.defaultSearch!.tab = "PWNED";
      }).toThrow(TypeError);

      expect(router.buildPath("user", {})).toBe("/users/1?tab=one");

      // And the caller's own literals are untouched — core copied, it did not
      // freeze somebody else's object.
      expect(PATH_BAG.id).toBe("1");
      expect(SEARCH_BAG.tab).toBe("one");
      expect(Object.isFrozen(PATH_BAG)).toBe(false);
    });

    it("adopts at depth two as well", () => {
      // ⚠ Depth two on its own cell because registration recurses, and a fix
      // applied at the top level only would leave every nested route aliased
      // while the parent read clean.
      const router = build();
      const child = getRoutesApi(router).get("user")!.children![0];

      expect(child.defaultParams).not.toBe(CHILD_BAG);
      expect(child.defaultParams).toStrictEqual(CHILD_BAG);

      expect(() => {
        child.defaultParams!.ckp = "PWNED";
      }).toThrow(TypeError);

      expect(router.buildPath("user.kid", { id: "1" })).toBe("/users/1/kid/K");
      expect(CHILD_BAG.ckp).toBe("K");
    });

    it("get() and getRouteConfig are complementary views, not nested ones", () => {
      const router = build();

      expect(
        (getRoutesApi(router).get("user") as Record<string, unknown>).myField,
      ).toBeUndefined();
      expect(getPluginApi(router).getRouteConfig("user")).toStrictEqual({
        myField: { deep: 1 },
      });
    });
  });

  describe("payloads", () => {
    /**
     * Every TREE_CHANGED field that carries route objects, plus `patch`. The
     * `alive` column is the real distinction — whether the route is still in the
     * table — and it decides WHEN a write lands, never whose object it is.
     */
    const PAYLOADS = [
      {
        alive: true,
        field: "added",
        title: "add.added",
        trigger: (api: RoutesApi) => {
          api.add({ defaultParams: PATH_BAG, name: "n", path: "/n/:id" });
        },
      },
      {
        alive: false,
        field: "removedSubtree",
        title: "remove.removedSubtree",
        trigger: (api: RoutesApi) => {
          api.remove("user");
        },
      },
      {
        alive: false,
        field: "removed",
        title: "replace.removed",
        trigger: (api: RoutesApi) => {
          api.replace([{ name: "z", path: "/z" }]);
        },
      },
      {
        alive: false,
        field: "removed",
        title: "clear.removed",
        trigger: (api: RoutesApi) => {
          api.clear();
        },
      },
    ] as const;

    it("covers both polarities of the alive column", () => {
      expect(PAYLOADS).toHaveLength(4);
      expect(PAYLOADS.some(({ alive }) => alive)).toBe(true);
      expect(PAYLOADS.some(({ alive }) => !alive)).toBe(true);
    });

    it.each(PAYLOADS)(
      "$title: frozen shell over CORE's own frozen bag",
      ({ field, trigger }) => {
        const router = build();
        const api = getRoutesApi(router);
        let event: Record<string, unknown> | undefined;
        const unsubscribe = api.subscribeChanges((next) => {
          event = next as unknown as Record<string, unknown>;
        });

        trigger(api);
        unsubscribe();

        const route = (event?.[field] as { defaultParams: object }[])[0];

        // ⚑ BOTH levels since #2172. The shell was already frozen, and that was
        // the worse half rather than the better one: a freeze on the outside
        // advertised safety over an interior that was still the caller's object.
        expect(Object.isFrozen(route)).toBe(true);
        expect(Object.isFrozen(route.defaultParams)).toBe(true);
        // ⚠ Against THIS route's own bag. Comparing against another route's bag
        // is a stable `false` that reads as a measurement — the defect an earlier
        // revision of this file exists to remove — so the `toStrictEqual` beside
        // it is what proves the `not.toBe` is measuring identity and not absence.
        expect(route.defaultParams).not.toBe(PATH_BAG);
        expect(route.defaultParams).toStrictEqual(PATH_BAG);
      },
    );

    it("a write through a GONE payload is REFUSED, not merely deferred", () => {
      const router = build();
      const api = getRoutesApi(router);
      let event: Record<string, unknown> | undefined;
      const unsubscribe = api.subscribeChanges((next) => {
        event = next as unknown as Record<string, unknown>;
      });

      api.remove("user");
      unsubscribe();

      const gone = (
        event?.removedSubtree as { defaultParams: { id: string } }[]
      )[0];

      // ⚑ Until #2172 this write SUCCEEDED. The route was gone, so nothing
      // resolved against it — but the payload's bag was the caller's own literal,
      // so the poison landed there and re-registering that same literal walked it
      // back in: `buildPath("victim")` then answered `/v/POISONED`. "Deferred,
      // not absent" was the accurate description of that, and it is what the
      // adoption removes rather than postpones.
      expect(() => {
        gone.defaultParams.id = "POISONED";
      }).toThrow(TypeError);

      expect(PATH_BAG.id).toBe("1");

      // CONTROL — the re-registration arm still WORKS, so the cell above is a
      // refused write and not a route that stopped being registrable.
      api.add({ defaultParams: PATH_BAG, name: "victim", path: "/v/:id" });

      expect(router.buildPath("victim", {})).toBe("/v/1");
    });

    it("patch carries CORE's copy of the bag, and the RAW codec", () => {
      const router = build();
      const api = getRoutesApi(router);
      let event: Record<string, unknown> | undefined;
      const unsubscribe = api.subscribeChanges((next) => {
        event = next as unknown as Record<string, unknown>;
      });

      api.update("user", { defaultParams: PATH_BAG, encodeParams: ENCODER });
      unsubscribe();

      const patch = event?.patch as {
        defaultParams: object;
        encodeParams: unknown;
      };

      // ⚑ The `update` door was the one a fix at registration alone would have
      // missed, and it is here because it WAS missed once: `commitRouteUpdate`
      // assembles this payload from the patch and writes the same value into the
      // store, so a copy at either one alone leaves the other aliased. Measured
      // mid-change: registration adopted while `update` still handed back the
      // caller's bag, unfrozen, on both sides.
      expect(Object.isFrozen(patch)).toBe(true);
      expect(Object.isFrozen(patch.defaultParams)).toBe(true);
      expect(patch.defaultParams).not.toBe(PATH_BAG);
      expect(patch.defaultParams).toStrictEqual(PATH_BAG);
      // The exception the store's wrapper creates: `get()` reports the wrapper,
      // `patch` the caller's own function, for one and the same route.
      expect(patch.encodeParams).toBe(ENCODER);
      expect(getRoutesApi(router).get("user")!.encodeParams).not.toBe(ENCODER);
    });
  });

  describe("a config getter that throws", () => {
    /** A bag whose only key blows up when read. The ordinary lazy-config shape. */
    const exploding = (): Params => {
      const bag: Record<string, unknown> = {};

      Object.defineProperty(bag, "id", {
        enumerable: true,
        get(): string {
          throw new Error("app getter blew up");
        },
      });

      return bag as Params;
    };

    /**
     * ⚑ Both doors, one cell, because the claim is that they AGREE. Adoption
     * moved these reads earlier — from navigation time to registration and
     * construction — so it relocated an application throw, and measured on both
     * arms beforehand the error was a bare `Error: app getter blew up` naming no
     * option either way. Identical and equally useless, which is why leaving it
     * bare was not the neutral choice: the sibling slot `queryParams` has named
     * its own failures since #1796.
     */
    const THROWING_DOORS = [
      {
        door: "route registration",
        run: () => {
          createRouter([
            { defaultParams: exploding(), name: "e", path: "/e/:id" },
          ]);
        },
      },
      {
        door: "createRouter options",
        run: () => {
          createRouter([{ name: "e", path: "/e/:id" }], {
            defaultParams: exploding(),
          });
        },
      },
    ] as const;

    it("covers both doors that adopt a params bag", () => {
      // Counted outside the `each` (`table-vacuity-authority`): a table that lost
      // a row would still register cells and still pass.
      expect(THROWING_DOORS).toHaveLength(2);
      expect(new Set(THROWING_DOORS.map(({ door }) => door)).size).toBe(2);
    });

    it.each(THROWING_DOORS)(
      "$door names the field and carries the cause",
      ({ run }) => {
        expect(run).toThrow(TypeError);

        let caught: unknown;

        try {
          run();
        } catch (error) {
          caught = error;
        }

        expect((caught as Error).message).toBe(
          '[router.constructor] Invalid "defaultParams": reading it threw.',
        );
        // ⚠ The cause is the assertion that matters most: the message says WHICH
        // option, and only the cause says what actually went wrong inside it.
        expect((caught as { cause?: Error }).cause?.message).toBe(
          "app getter blew up",
        );
      },
    );

    it("CONTROL — a healthy bag of the same shape registers and builds", () => {
      // Without this the cells above pass against a door that rejects every
      // accessor-backed config rather than only the throwing one.
      const bag: Record<string, unknown> = {};

      Object.defineProperty(bag, "id", {
        enumerable: true,
        get: () => "7",
      });
      const router = createRouter([
        { defaultParams: bag as Params, name: "e", path: "/e/:id" },
      ]);

      try {
        expect(router.buildPath("e", {})).toBe("/e/7");
      } finally {
        router.dispose();
      }
    });

    it("a NON-object default reaches the store as itself, not spread apart", () => {
      // ⚑ The guard that makes this true is the reason `copyOwnData` returns a
      // non-object untouched. `{ ..."abc" }` is `{ 0: "a", 1: "b", 2: "c" }`, so a
      // plain spread manufactures a plausible-looking object out of invalid
      // config — and `@real-router/validation-plugin`, which refuses this field
      // by asking what it IS, then sees an object and says nothing. Measured on
      // the spread-only form: four cells of that plugin's own coverage table
      // moved out of "plugin refuses" and into "unreachable".
      const router = createRouter([
        { defaultParams: "abc" as never, name: "e", path: "/e/:id" },
      ]);

      try {
        const stored = getRoutesApi(router).get("e")!.defaultParams;

        expect(stored).toBe("abc");
      } finally {
        router.dispose();
      }
    });
  });

  describe("records", () => {
    /**
     * Derived from the SOURCE by SHAPE, not from a list of names this file
     * already knows. The first revision matched `(added|removed|removedSubtree|
     * patch)` and called that a cross-check: a new `readonly moved: readonly
     * Route<…>[]` shipped with every cell green, because the pattern could only
     * recount what the table already carried.
     *
     * ⚠ The spelling is `ReadonlyRoute` on the read side (#1963) and `Route`
     * elsewhere; both are route-carrying, so the pattern admits either. Matching
     * one would have gone SILENT — measured, this cell read 0 fields after the
     * rename, which is why it is a count and not a boolean.
     */
    const routeFields = [
      ...TREE_CHANGED_SOURCE.matchAll(
        /^ {2}readonly (\w+): readonly (?:Readonly)?Route<\w+>\[\];/gm,
      ),
    ].map(([, name]) => name);

    it("finds every route-carrying payload field by shape", () => {
      // Five route ARRAYS across the union; `patch` is asserted on its own
      // above because it is not one.
      expect(routeFields.length).toBeGreaterThanOrEqual(5);
      expect(routeFields).toContain("removedSubtree");
    });

    it.each(routeFields)("%s is documented against the model", (field) => {
      // Same widened spelling as the scan above — the read side says
      // `ReadonlyRoute` (#1963). A literal lookup returns -1 and silently slices
      // the WRONG docblock, which is a green cell about someone else's comment.
      const declaration = TREE_CHANGED_SOURCE.search(
        new RegExp(`readonly ${field}: readonly (?:Readonly)?Route<`),
      );

      expect(
        declaration,
        "the field's declaration is findable",
      ).toBeGreaterThan(-1);

      // ⚠ No character window. This used to slice back a fixed 1600 chars and
      // then take the last `/**` inside it — which silently returns a BLANK block
      // as soon as a docblock grows past the window, and a blank block fails on
      // the wrong assertion: `expected ' ' to contain '#1958'` reads as a missing
      // reference rather than as a slice that never reached the comment.
      // Measured when #2172 lengthened `added`'s docblock. Searching backwards
      // from the declaration has no constant to outgrow.
      const opening = TREE_CHANGED_SOURCE.lastIndexOf("/**", declaration);

      expect(opening, "the field's docblock is findable").toBeGreaterThan(-1);

      const block = TREE_CHANGED_SOURCE.slice(opening, declaration);

      // A POSITIVE requirement, not a banned substring. The first revision
      // asserted `not.toContain("deep-cloned")`, which let "deep cloned",
      // "deepCloned" and "structuredClone'd" through — and reded on the correct
      // sentence "the payload is NOT deep-cloned". Requiring the reference
      // cannot be satisfied by a claim that contradicts it.
      expect(block).toContain("#1958");
      expect(block).toContain("Read-only");
    });

    it("no payload field is described as cloned", () => {
      // Kept as a second, narrower layer: the positive requirement above is
      // about presence, this one about the specific claim that was false.
      expect(/deep[- ]?clon(ed|e)\b/i.test(TREE_CHANGED_SOURCE)).toBe(false);
    });
  });
});
