import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

/**
 * One declaration, one config — whichever door it came through (#1797).
 *
 * Registration gates every structural field on TRUTHINESS
 * (`registerSingleRouteHandlers`), while `update` adopted on presence, so the
 * same declaration produced two different configs and `get(name)` disagreed
 * about whether the field exists at all.
 *
 * ⚑ The values below are type-INVALID — TypeScript refuses every one of them,
 * so only a JS consumer or an `any` reaches this. What makes them worth
 * refusing is not the spelling but what `update` did with them: measured,
 * `update({ decodeParams: 0 })` turned `matchPath` into a thrower
 * (`decoder is not a function`), and its callers — the browser, hash,
 * navigation and SSR consumers — do not catch.
 *
 * ⚠ `null` and `undefined` are NOT in this class and keep their documented
 * meanings: `null` removes the field, `undefined` says nothing. Both are
 * pinned as controls.
 */
describe("a structural field means the same through every door (#1797)", () => {
  const FIELDS = [
    "defaultParams",
    "defaultSearch",
    "forwardTo",
    "encodeParams",
    "decodeParams",
    "canActivate",
    "canDeactivate",
  ] as const;

  const JUNK: readonly (readonly [string, unknown])[] = [
    ["0", 0],
    ['""', ""],
    ["false", false],
    ["NaN", Number.NaN],
  ];

  /** One value per FIELD that every door must carry — the positive control. */
  const VALID: Record<(typeof FIELDS)[number], unknown> = {
    defaultParams: { x: "1" },
    defaultSearch: { q: "1" },
    forwardTo: "b",
    encodeParams: (channels: unknown) => channels,
    decodeParams: (channels: unknown) => channels,
    canActivate: () => () => true,
    canDeactivate: () => () => true,
  };

  /** Does `get(name)` carry the field, after the declaration went through `door`? */
  const carries = (
    door: "constructor" | "add" | "replace" | "update",
    field: string,
    value: unknown,
  ): boolean | string => {
    const declaration = { name: "a", path: "/a", [field]: value };

    try {
      let router;

      if (door === "constructor") {
        router = createRouter([
          declaration,
          { name: "b", path: "/b" },
        ] as never);
      } else {
        router = createRouter([{ name: "b", path: "/b" }]);

        const routes = getRoutesApi(router);

        if (door === "add") {
          routes.add(declaration);
        } else if (door === "replace") {
          routes.replace([declaration, { name: "b", path: "/b" }] as never);
        } else {
          routes.add({ name: "a", path: "/a" });
          routes.update("a", { [field]: value });
        }
      }

      const has = Object.hasOwn(getRoutesApi(router).get("a") ?? {}, field);

      router.dispose();

      return has;
    } catch (error) {
      return `threw: ${(error as Error).message.slice(0, 40)}`;
    }
  };

  it("CONTROL — neither table can shrink to nothing in silence", () => {
    // Both lists index a loop, so an emptied one registers zero assertions and
    // reads as green — the `table-vacuity-authority` ratchet.
    expect(FIELDS).toHaveLength(7);
    expect(JUNK).toHaveLength(4);
  });

  it.each(FIELDS)("%s — every door agrees on every junk value", (field) => {
    for (const [label, value] of JUNK) {
      const doors = {
        constructor: carries("constructor", field, value),
        add: carries("add", field, value),
        replace: carries("replace", field, value),
        update: carries("update", field, value),
      };

      expect({ field, value: label, ...doors }).toStrictEqual({
        field,
        value: label,
        constructor: false,
        add: false,
        replace: false,
        update: false,
      });
    }
  });

  it("a junk patch announces no TREE_CHANGED, because nothing changed", () => {
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);
    const routes = getRoutesApi(router);
    let events = 0;

    routes.subscribeChanges(() => {
      events += 1;
    });

    routes.update("a", { forwardTo: "" });

    expect(events).toBe(0);

    // CONTROL — the emit is alive; only the junk patch is silent.
    routes.update("a", { forwardTo: "b" });

    expect(events).toBe(1);

    router.dispose();
  });

  it("CONTROL — a TRUTHY invalid value is still carried, by both doors alike", () => {
    // `[]` is exactly as invalid a `defaultParams` as `0`, and it is truthy, so
    // both doors take it. The gate separates falsy from truthy, not valid from
    // invalid — refusing it by type is `@real-router/validation-plugin`'s.
    expect(carries("constructor", "defaultParams", [])).toBe(true);
    expect(carries("update", "defaultParams", [])).toBe(true);
  });

  it.each(FIELDS)("CONTROL — a VALID %s is carried by every door", (field) => {
    // One control per FIELD, not one for the table: `assignRouteConfig` reads
    // the five data fields from six maps on the route config and the two guards
    // from the factory records `getFactoriesByOrigin` materialises — a separate
    // argument, and the guards are not in the config at all. So a control on
    // `forwardTo` alone leaves the guard rows asserting `false` against a door
    // that could not answer `true` for anything. Measured — stripping the guard
    // arm left all thirteen cells green while `forwardTo`'s control passed.
    expect({
      constructor: carries("constructor", field, VALID[field]),
      add: carries("add", field, VALID[field]),
      replace: carries("replace", field, VALID[field]),
      update: carries("update", field, VALID[field]),
    }).toStrictEqual({
      constructor: true,
      add: true,
      replace: true,
      update: true,
    });
  });

  it("CONTROL — null still REMOVES and undefined still says nothing", () => {
    const router = createRouter([
      { name: "a", path: "/a", forwardTo: "b" },
      { name: "b", path: "/b" },
    ]);
    const routes = getRoutesApi(router);

    routes.update("a", { forwardTo: undefined } as never);

    expect(routes.get("a")?.forwardTo).toBe("b");

    routes.update("a", { forwardTo: null });

    expect(Object.hasOwn(routes.get("a") ?? {}, "forwardTo")).toBe(false);

    router.dispose();
  });

  it("CONTROL — junk through update leaves a PRE-SET value standing", () => {
    // Registration's rule is "do not adopt", not "remove": the analogue for a
    // patch is `undefined`, not `null`.
    const router = createRouter([
      { name: "a", path: "/a", forwardTo: "b" },
      { name: "b", path: "/b" },
    ]);

    getRoutesApi(router).update("a", { forwardTo: "" });

    expect(getRoutesApi(router).get("a")?.forwardTo).toBe("b");

    router.dispose();
  });
});
