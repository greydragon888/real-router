// Core copies exactly ONE level on the way out, and every record says so.
//
// The model, measured rather than asserted (#1958):
//
//   A read-side door hands back a FRESH shell built by core. One level down are
//   the very objects the caller registered — so "the store's object" and "the
//   caller's object" are ONE object, and a write there corrupts router config
//   and the application's own literal at the same time.
//
// It is policy, and `packages/core/CLAUDE.md` ("Immutability is shallow") records
// the reasons: no deep-freeze, because that would freeze the caller's own input;
// no deep-clone, because config carries circular references and class instances.
//
// ⚠ THE MODEL HAS EXACTLY TWO EXCEPTIONS, and both are pinned below because both
// were missed the first time this guard was written:
//   • `encodeParams` / `decodeParams` are WRAPPED at registration, so a door
//     hands back core's closure and not the caller's function — except
//     `update`'s `patch`, which is assembled from the patch rather than from the
//     store and therefore hands back the raw one.
//   • custom fields are absent from `get()` entirely; `getRouteConfig` is the
//     only door that carries them. The two are complementary views, not a subset
//     and a superset.
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
// ⚠ "route still in the table" decides WHEN the damage lands, never whose object
// it is. The first revision encoded it as a `store` vs `caller` dichotomy, and
// every cell of that half compared a route's config against ANOTHER route's bag
// — a stable `false` that passed for a measurement. The `live` / `gone` column
// below is the real distinction, and the `gone` rows assert the poison is
// deferred rather than absent.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { ParamsSearch, RoutesApi } from "@real-router/core/types";

const TREE_CHANGED_SOURCE = readFileSync(
  path.resolve(__dirname, "../../src/types/tree-changed.ts"),
  "utf8",
);

const PATH_BAG = { id: "1" };
const SEARCH_BAG = { tab: "one" };
const CHILD_BAG = { ckp: "K" };
const ENCODER = (channels: ParamsSearch): ParamsSearch => channels;

const build = () =>
  createRouter([
    {
      children: [
        { defaultParams: CHILD_BAG, name: "kid", path: "/kid/:ckp" },
        { defaultParams: { oid: "9" }, name: "other", path: "/other/:oid" },
      ],
      defaultParams: PATH_BAG,
      defaultSearch: SEARCH_BAG,
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
      { bag: PATH_BAG, name: "defaultParams", passThrough: true },
      { bag: SEARCH_BAG, name: "defaultSearch", passThrough: true },
      { bag: ENCODER, name: "encodeParams", passThrough: false },
    ] as const;

    it("carries the pass-through slots and the wrapped one", () => {
      // Counted outside the `each` (`table-vacuity-authority`), and asserted to
      // contain BOTH polarities — a table that lost its `false` row would still
      // register cells and still pass.
      expect(SLOTS).toHaveLength(3);
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

    it("a write one level down reaches both channels of the URL", () => {
      const router = build();
      const route = getRoutesApi(router).get("user")!;

      route.defaultParams!.id = "HACKED";
      route.defaultSearch!.tab = "PWNED";

      expect(router.buildPath("user", {})).toBe("/users/HACKED?tab=PWNED");

      // The caller's own literals, mutated by the same write — one object.
      expect(PATH_BAG.id).toBe("HACKED");
      expect(SEARCH_BAG.tab).toBe("PWNED");

      PATH_BAG.id = "1";
      SEARCH_BAG.tab = "one";
    });

    it("passes the caller's objects through at depth two as well", () => {
      const router = build();
      const child = getRoutesApi(router).get("user")!.children![0];

      expect(child.defaultParams).toBe(CHILD_BAG);

      child.defaultParams!.ckp = "PWNED";

      expect(router.buildPath("user.kid", { id: "1" })).toBe(
        "/users/1/kid/PWNED",
      );

      CHILD_BAG.ckp = "K";
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
      "$title: frozen shell over the caller's own bag",
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

        expect(Object.isFrozen(route)).toBe(true);
        expect(Object.isFrozen(route.defaultParams)).toBe(false);
        // ⚠ Against THIS route's own bag. Comparing against another route's bag
        // is a stable `false` that reads as a measurement — the defect this
        // revision exists to remove.
        expect(route.defaultParams).toBe(PATH_BAG);
      },
    );

    it("a write through a GONE payload is deferred, not absent", () => {
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

      gone.defaultParams.id = "POISONED";

      // Nothing to resolve — but the caller's literal now carries it, so
      // re-registering that same literal walks the poison back in.
      expect(PATH_BAG.id).toBe("POISONED");

      api.add({ defaultParams: PATH_BAG, name: "victim", path: "/v/:id" });

      expect(router.buildPath("victim", {})).toBe("/v/POISONED");

      PATH_BAG.id = "1";
    });

    it("patch carries the caller's bag and its RAW codec", () => {
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

      expect(Object.isFrozen(patch)).toBe(true);
      expect(Object.isFrozen(patch.defaultParams)).toBe(false);
      expect(patch.defaultParams).toBe(PATH_BAG);
      // The exception the store's wrapper creates: `get()` reports the wrapper,
      // `patch` the caller's own function, for one and the same route.
      expect(patch.encodeParams).toBe(ENCODER);
      expect(getRoutesApi(router).get("user")!.encodeParams).not.toBe(ENCODER);
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

      const preceding = TREE_CHANGED_SOURCE.slice(
        Math.max(0, declaration - 1600),
        declaration,
      );
      const block = preceding.slice(preceding.lastIndexOf("/**"));

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
